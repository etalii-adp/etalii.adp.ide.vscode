// The persistence of a specification (DISL 11) for a model that lives behind an FBL binding: which
// binding, how ids are made, and `typeMap`, which says what the binding's types and attributes are
// in the metamodel. Reading a body is the FBL library's; this module types what it read.

import { allRules, findRule, type FblBinding, type FblDocument, type Slot } from '../fbl/documents/types';
import { findingCodes } from '../fbl/finding';
import type { FblElement, FblModel, IdRequest } from '../fbl/model';
import { attributesOf, formatYearMonth, isRelation, parseYearMonth, valueKind, type Metamodel } from './metamodel';
import { emptyModel, finding, type Finding, type Loaded, type Model, type ModelElement, type ModelRelation, type Value } from './model';
import type { Expressions } from './expressions';
import { isCel, isObject, type Attribute, type IdStrategy, type Specification, type TypeMapEntry } from './specification';

export interface InterpretedPersistence {
  readonly format: string;
  /** The binding `persistence.binding` names: the address of its FBL document, that document's file name, and the binding's name in it. */
  readonly binding?: { readonly document: string; readonly file: string; readonly name: string };
  readonly ids: IdStrategy & Required<Pick<IdStrategy, 'strategy' | 'encoding' | 'stable' | 'pattern' | 'missing' | 'compare'>>;
  /** By the binding's type names. A type that is not listed keeps its name and its attributes' names. */
  readonly typeMap: Readonly<Record<string, TypeMapEntry>>;
  /** What of the view is stored, and what each viewer keeps (DISL 11.6); `bind` is where a stored kind is kept in the body itself. */
  readonly view: { readonly store: readonly string[]; readonly viewer: readonly string[]; readonly initial: Readonly<Record<string, unknown>>; readonly bind: ViewBind };
}

/** `persistence.view.bind` (DISL 11.6): each stored kind onto the entries of a type of the binding, by the binding's attribute names. */
export interface ViewBind {
  readonly pinned?: { readonly type: string; readonly element: string; readonly x: string; readonly y: string };
  readonly groups?: { readonly type: string; readonly element: string; readonly group: string; readonly collapsed: string };
  /** `values` is the binding attribute that holds each kept filter's value, by the filter's id. */
  readonly filters?: { readonly type: string; readonly values: Readonly<Record<string, string>> };
}

/**
 * The stored view data of a document (DISL 11.6): what is kept with the diagram and is the same
 * for every viewer. It is no part of the model. A pinned element is here with its position, a
 * group with its state while that differs from its default, by the element and the group's key,
 * and a kept filter with its value while that differs from its default, by the filter's id.
 */
export interface StoredView {
  readonly pinned: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
  readonly groups: Readonly<Record<string, Readonly<Record<string, boolean>>>>;
  readonly filters: Readonly<Record<string, Value>>;
}

export const nothingStored: StoredView = { pinned: {}, groups: {}, filters: {} };

/** What reading a body gives beside its model: the view data bound into it, and the entries of it that are about nothing. */
export interface Read extends Loaded<Model> {
  readonly view: StoredView;
  /**
   * The ids of the entries of bound view data that name an element the document does not have, or
   * a key an earlier entry has. They are ignored and not reported, and go with the next write (DISL 11.6).
   */
  readonly stale: readonly string[];
}

const outside = ['diagram', 'header', 'unreadable'];

/** Interprets `persistence`, with the defaults of DISL 11.2 and 11.5 filled in. */
export function interpretPersistence(specification: Specification, metamodel: Metamodel): Loaded<InterpretedPersistence> {
  const findings: Finding[] = [];
  const declared = specification.persistence ?? {};
  const format = declared.format ?? 'json';
  const problem = (message: string): void => void findings.push(finding('disl.persistence', 'error', message));

  let binding: InterpretedPersistence['binding'];
  if (format !== 'fbl') problem(`The specification stores its model as \`${format}\`, and this add-on reads a model through an FBL binding only.`);
  else if (typeof declared.binding !== 'string' || !declared.binding.includes('#')) problem('The specification does not name its FBL binding as an address and a name.');
  else {
    const hash = declared.binding.lastIndexOf('#');
    const document = declared.binding.slice(0, hash);
    binding = { document, file: document.slice(document.lastIndexOf('/') + 1), name: declared.binding.slice(hash + 1) };
  }

  const typeMap = declared.typeMap ?? {};
  for (const [name, entry] of Object.entries(typeMap)) {
    if (!outside.includes(entry.as) && !(entry.as in metamodel.types)) problem(`\`typeMap\` reads \`${name}\` as \`${entry.as}\`, which is not a type of this specification.`);
  }

  const ids: InterpretedPersistence['ids'] = { strategy: 'uuid-v7', encoding: 'hex', stable: true, pattern: '^[A-Za-z0-9_.:#-]{1,128}$', missing: 'assign', compare: 'exact', ...declared.ids };
  if (ids.strategy !== 'uuid-v4') findings.push(finding('disl.persistence', 'warning', `New elements get an id by the strategy \`uuid-v4\`, not by \`${ids.strategy}\`, which this add-on does not support.`));
  if (ids.types) findings.push(finding('disl.persistence', 'warning', 'The id rules for single types are not supported; every type follows the one rule.'));

  const store = declared.view?.store ?? [];
  const bind: { -readonly [Kind in keyof ViewBind]: ViewBind[Kind] } = {};
  const named = (value: unknown): value is string => typeof value === 'string' && value !== '';
  for (const [kind, bound] of Object.entries(isObject(declared.view?.bind) ? declared.view.bind : {})) {
    if (!isObject(bound) || !named(bound.type)) problem(`\`view.bind\` binds \`${kind}\` onto no type of the binding.`);
    else if (format !== 'fbl') problem(`\`view.bind\` binds \`${kind}\`, and only a model behind an FBL binding keeps view data in its body.`);
    else if (!store.includes(kind)) problem(`\`view.bind\` binds \`${kind}\`, which \`view.store\` does not list.`);
    // A bound type is no part of the model; of the three kinds only the filters may be kept on the entry that is read as the diagram.
    else if (bound.type in metamodel.types || (Object.hasOwn(typeMap, bound.type) && (kind !== 'filters' || typeMap[bound.type].as in metamodel.types))) {
      problem(`\`view.bind\` binds \`${kind}\` onto \`${bound.type}\`, which is read as a part of the model.`);
    } else if (kind === 'pinned' && named(bound.element) && named(bound.x) && named(bound.y)) bind.pinned = { type: bound.type, element: bound.element, x: bound.x, y: bound.y };
    else if (kind === 'groups' && named(bound.element) && named(bound.group) && named(bound.collapsed)) bind.groups = { type: bound.type, element: bound.element, group: bound.group, collapsed: bound.collapsed };
    else if (kind === 'filters' && isObject(bound.values)) bind.filters = { type: bound.type, values: Object.fromEntries(Object.entries(bound.values).filter((entry): entry is [string, string] => named(entry[1]))) };
    else problem(`\`view.bind\` binds \`${kind}\`, which is no kind that can be bound, or does not name the attributes its entries hold.`);
  }

  return { value: { format, binding, ids, typeMap, view: { store, viewer: declared.view?.viewer ?? [], initial: isObject(declared.view?.initial) ? declared.view.initial : {}, bind } }, findings };
}

/**
 * The id of an entry of bound view data, which keeps none of its own: `pinned:<element>` and
 * `groups:<element>#<key>` (DISL 11.6). It is what the FBL library is given to derive such an id by.
 */
export function viewEntryIds(persistence: InterpretedPersistence): (request: IdRequest) => string | undefined {
  const { pinned, groups } = persistence.view.bind;
  const named = (request: IdRequest, attribute: string): string => {
    const value = request.attributes[attribute];
    return value === undefined || value === null ? '' : String(value);
  };
  return (request) => {
    if (pinned && request.type === pinned.type) return `pinned:${named(request, pinned.element)}`;
    if (groups && request.type === groups.type) return `groups:${named(request, groups.element)}#${named(request, groups.group)}`;
    return undefined;
  };
}

/**
 * The attributes of a binding that hold a moment, each as `rule.attribute`: those the metamodel
 * types as a date or a date and time. The FBL library writes such a value plain where it would
 * quote a string that only looks like one (FBL 6.3).
 */
export function momentAttributes(binding: FblBinding, metamodel: Metamodel, persistence: InterpretedPersistence): Set<string> {
  const moments = new Set<string>();
  for (const rule of allRules(binding)) {
    const entry = entryOf(persistence, rule.type);
    const attributes = attributesOf(metamodel, entry.as);
    for (const [name] of rule.attributes) {
      const target = mapped(entry, name);
      const kind = target !== null && Object.hasOwn(attributes, target) ? valueKind(metamodel, attributes[target].type) : undefined;
      if (kind?.kind === 'primitive' && (kind.primitive === 'date' || kind.primitive === 'datetime')) moments.add(`${rule.name}.${name}`);
    }
  }
  return moments;
}

/**
 * Whether an element is folded for one viewer (DISL 11.6): what the viewer holds for it, else what
 * `view.initial.collapsed` gives for the element, else not. Viewer state is never part of the model.
 */
export function foldsOf(persistence: InterpretedPersistence, expressions: Expressions, model: Model, held: Readonly<Record<string, boolean>> = {}): (id: string) => boolean {
  const initial = persistence.view.initial.collapsed;
  const world = isCel(initial) ? expressions.over(model) : undefined;
  const seeded = new Map<string, boolean>();
  return (id) => {
    if (Object.hasOwn(held, id)) return held[id];
    if (!world || !isCel(initial)) return initial === true;
    if (!seeded.has(id)) {
      const result = expressions.evaluate(initial, world.scope(id));
      seeded.set(id, result.ok && result.value === true);
    }
    return seeded.get(id)!;
  };
}

/** The binding the specification names, in the FBL document that was loaded for it. */
export const bindingOf = (persistence: InterpretedPersistence, document: FblDocument): FblBinding | undefined =>
  persistence.binding ? document.bindings.get(persistence.binding.name) : undefined;

/** A new id for an element of `type`: a version 4 UUID in the declared encoding, after the declared prefix (DISL 11.5.1). */
export function newId(persistence: InterpretedPersistence, type: string): string {
  const { encoding, prefix } = persistence.ids;
  const hex = crypto.randomUUID();
  const digits = hex.replace(/-/g, '');
  const text = encoding === 'base36' ? BigInt(`0x${digits}`).toString(36).padStart(25, '0')
    : encoding === 'base64url' ? btoa(String.fromCharCode(...(digits.match(/../g) ?? []).map((byte) => parseInt(byte, 16)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      : hex;
  return (typeof prefix === 'string' ? prefix : prefix?.[type] ?? '') + text;
}

/** What `typeMap` says of a binding type: its entry, or the type under its own name. */
export const entryOf = (persistence: InterpretedPersistence, type: string): TypeMapEntry =>
  Object.hasOwn(persistence.typeMap, type) ? persistence.typeMap[type] : { as: type };

/** The name an attribute of a binding has in the metamodel, or null for one that is not in the model. */
export const mapped = (entry: TypeMapEntry, name: string): string | null =>
  entry.attributes && Object.hasOwn(entry.attributes, name) ? entry.attributes[name] : name;

/**
 * Turns what the FBL library read into the model the metamodel types (DISL 11.2). It never throws:
 * an entry or a value that cannot be read becomes a finding and stays out of the model.
 *
 * - The library's findings are passed on, each with the element it lies in.
 * - An entry read `as: "unreadable"`, an entry of no type of the metamodel and a value that is not
 *   of its attribute's type are reported as `std.unreadableEntry`, with `detail.reason`.
 * - A relation's end and a reference that name nothing are left unset and reported as
 *   `std.references`, with `detail.missingId` and `detail.end`; that finding replaces the library's own.
 * - `std.duplicateId` gains `detail.id` and `detail.count`.
 */
export function readModel(reading: Pick<FblModel, 'elements' | 'findings' | 'unreadable'>, binding: FblBinding, metamodel: Metamodel, persistence: InterpretedPersistence): Read {
  if (reading.unreadable) return { value: emptyModel, findings: reading.findings, view: nothingStored, stale: [] };
  const { bind } = persistence.view;
  // The entries of bound view data: they are no elements, and are read once the elements are known.
  const viewEntries = reading.elements.filter((entry) => entry.type === bind.pinned?.type || entry.type === bind.groups?.type);
  const filters: Record<string, Value> = {};

  const findings: Finding[] = [];
  const file = reading.findings[0]?.location.file ?? 'body';
  const at = (entry: FblElement): Finding['location'] => ({ file, line: entry.line, column: 1, length: 0 });
  const unreadable = (entry: FblElement, reason: string, element?: string): void => void findings.push({
    code: findingCodes.unreadableEntry, severity: 'warning', message: reason, location: at(entry), element, detail: { reason },
  });

  const diagram: Record<string, Value> = {};
  const elements: ModelElement[] = [];
  const relations: ModelRelation[] = [];
  const inModel = new Map<FblElement, string>();
  const read = (entry: FblElement, entryMap: TypeMapEntry, type: string, into: Record<string, Value>, host?: Record<string, unknown>): Partial<Record<'id' | 'source' | 'target', string>> => {
    const named: Partial<Record<'id' | 'source' | 'target', string>> = {};
    const attributes = attributesOf(metamodel, type);
    for (const [name, stored] of Object.entries(entry.attributes)) {
      const target = mapped(entryMap, name);
      if (entryMap.hostAttributes?.includes(name)) { if (host) host[name] = stored; }
      else if (target === null || stored === null || stored === undefined) continue;
      else if (target === 'id' || target === 'source' || target === 'target') named[target] = String(stored);
      else if (!Object.hasOwn(attributes, target)) { if (host) host[name] = stored; }
      else {
        const value = fromStored(stored, attributes[target], metamodel);
        if (value === undefined) unreadable(entry, `\`${name}\` of \`${entry.id}\` is not a value of the type \`${attributes[target].type}\`, so it is not read: ${text(stored)}`, type === 'diagram' ? undefined : entry.id);
        else into[target] = value;
      }
    }
    return named;
  };

  for (const entry of reading.elements) {
    if (viewEntries.includes(entry)) continue;
    if (entry.type === bind.filters?.type) {
      for (const [id, attribute] of Object.entries(bind.filters.values)) {
        const value = plain(entry.attributes[attribute]);
        if (value !== undefined && value !== null) filters[id] = value;
      }
    }
    const entryMap = entryOf(persistence, entry.type);
    if (entryMap.as === 'header') continue;
    if (entryMap.as === 'unreadable') unreadable(entry, findRule(binding, entry.rule)?.readOnly || 'This entry cannot be read, so it is kept as it is.');
    else if (entryMap.as === 'diagram') read(entry, entryMap, 'diagram', diagram);
    else if (!(entryMap.as in metamodel.types)) unreadable(entry, `This entry is read as \`${entryMap.as}\`, which is not a type of this tool, so it is kept as it is.`);
    else {
      const attributes: Record<string, Value> = {};
      const host: Record<string, unknown> = {};
      const named = read(entry, entryMap, entryMap.as, attributes, host);
      // An attribute mapped to `id` is the element's id only where the library found none in the body.
      const element: ModelElement = {
        id: entry.idIsStored ? entry.id : named.id ?? entry.id, type: entryMap.as, attributes, host, parent: entry.parentId, ephemeral: !entry.idIsStored && named.id === undefined, line: entry.line,
        ...(entry.parentSlot === undefined ? {} : { slot: entry.parentSlot }),
      };
      inModel.set(entry, element.id);
      if (isRelation(metamodel.types[entryMap.as])) relations.push({ ...element, source: named.source ?? entry.source, target: named.target ?? entry.target });
      else elements.push(element);
    }
  }

  // The entry a line lies in: the last one that begins at or before it.
  const owner = (line: number): FblElement | undefined => [...reading.elements].reverse().find((entry) => entry.line <= line);
  const dangling = new Map<string, Finding[]>();
  for (const found of reading.findings) {
    const entry = owner(found.location.line);
    // An entry of view data that is about nothing, or about what an earlier one is, is ignored and not reported (DISL 11.6).
    if (entry && viewEntries.includes(entry) && (found.code === findingCodes.danglingReference || found.code === findingCodes.duplicateId)) continue;
    const element = entry && inModel.get(entry);
    if (found.code === findingCodes.danglingReference && element !== undefined) dangling.set(element, [...(dangling.get(element) ?? []), found]);
    else if (found.code === findingCodes.duplicateId && entry) {
      const id = idAsStored(entry, binding);
      const count = reading.elements.filter((other) => idAsStored(other, binding) === id).length;
      findings.push({ ...found, element, detail: id === undefined ? undefined : { id, count } });
    } else findings.push({ ...found, element });
  }

  const ids = new Set([...elements, ...relations].map((element) => element.id));
  const missing = (element: ModelElement, end: string, id: string): void => {
    const reported = dangling.get(element.id)?.shift();
    findings.push({
      code: 'std.references', severity: 'error', message: `\`${element.id}\` refers to \`${id}\`, which is not in this document.`,
      location: reported?.location ?? { file, line: element.line, column: 1, length: 0 }, element: element.id, detail: { missingId: id, end },
    });
  };
  const resolved = <T extends ModelElement>(element: T): T => {
    const attributes: Record<string, Value> = { ...element.attributes };
    for (const [name, attribute] of Object.entries(attributesOf(metamodel, element.type))) {
      const id = attributes[name];
      if (typeof id !== 'string' || attribute.many === true || valueKind(metamodel, attribute.type).kind !== 'reference' || ids.has(id)) continue;
      missing(element, name, id);
      delete attributes[name];
    }
    return { ...element, attributes };
  };
  const end = (relation: ModelRelation, side: 'source' | 'target'): string | undefined => {
    const id = relation[side];
    if (id !== undefined && !ids.has(id)) missing(relation, side, id);
    return id !== undefined && ids.has(id) ? id : undefined;
  };

  const model: Model = {
    diagram,
    elements: elements.map(resolved),
    relations: relations.map((relation) => ({ ...resolved(relation), source: end(relation, 'source'), target: end(relation, 'target') })),
  };
  // The view data: the first entry for an element, or for a group of one, is the one that counts.
  const drawn = new Set(elements.map((element) => element.id));
  const pinned: Record<string, { x: number; y: number }> = {};
  const groups: Record<string, Record<string, boolean>> = {};
  const stale: string[] = [];
  const number = (value: unknown): number | undefined => (typeof value === 'bigint' || (typeof value === 'number' && Number.isFinite(value)) ? Number(value) : undefined);
  for (const entry of viewEntries) {
    const about = String(entry.attributes[(entry.type === bind.pinned?.type ? bind.pinned : bind.groups!).element] ?? '');
    if (bind.pinned && entry.type === bind.pinned.type) {
      const [x, y] = [number(entry.attributes[bind.pinned.x]), number(entry.attributes[bind.pinned.y])];
      if (drawn.has(about) && !Object.hasOwn(pinned, about) && x !== undefined && y !== undefined) pinned[about] = { x, y };
      else stale.push(entry.id);
    } else if (bind.groups) {
      const key = String(entry.attributes[bind.groups.group] ?? '');
      const collapsed = entry.attributes[bind.groups.collapsed];
      if (drawn.has(about) && key !== '' && typeof collapsed === 'boolean' && !Object.hasOwn(groups[about] ?? {}, key)) groups[about] = { ...groups[about], [key]: collapsed };
      else stale.push(entry.id);
    }
  }

  // In reading order (DISL 8.6); within a line, what this reading found comes before the library's.
  return { value: model, findings: findings.sort((a, b) => a.location.line - b.location.line), view: { pinned, groups, filters }, stale };
}

/**
 * The attributes of a model change in the binding's names and the FBL library's values: what
 * `readModel` did, the other way round. `type` is a type of the metamodel, or `diagram`; `source`
 * and `target` among the attributes are a relation's ends. An absent value is null, which empties
 * the attribute. Nothing when no type of the binding is read as `type`.
 */
export function toBinding(
  binding: FblBinding, metamodel: Metamodel, persistence: InterpretedPersistence, type: string, attributes: Readonly<Record<string, Value | undefined>>,
): { readonly type: string; readonly attributes: Readonly<Record<string, unknown>> } | undefined {
  const types = [...new Set([...binding.elements, ...binding.relations].map((rule) => rule.type))].filter((candidate) => entryOf(persistence, candidate).as === type);
  const names = (candidate: string): Map<string, string> => {
    const entry = entryOf(persistence, candidate);
    const rules = [...binding.elements, ...binding.relations].filter((rule) => rule.type === candidate);
    return new Map(rules.flatMap((rule) => rule.attributes.map(([name]) => [mapped(entry, name) ?? '', name] as const)));
  };
  // Several binding types may be read as one: the diagram's attributes may come from several entries.
  const wanted = Object.keys(attributes);
  const chosen = types.find((candidate) => wanted.every((name) => names(candidate).has(name) || name === 'source' || name === 'target')) ?? types[0];
  if (chosen === undefined) return undefined;
  const byName = names(chosen);
  const declared = attributesOf(metamodel, type);
  const stored: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(attributes)) {
    stored[byName.get(name) ?? name] = value === undefined || value === null ? null : Object.hasOwn(declared, name) ? toStored(value, declared[name], metamodel) : value;
  }
  return { type: chosen, attributes: stored };
}

/** A value the FBL library read, as the model holds it; nothing when it is not of the attribute's type. */
export function fromStored(stored: unknown, attribute: Attribute, metamodel: Metamodel): Value | undefined {
  const kind = valueKind(metamodel, attribute.type);
  const one = (value: unknown): Value | undefined => {
    const scalar = typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean';
    if (kind.kind === 'enum') return scalar ? kind.enum.values.find((candidate) => candidate.stored === String(value))?.key ?? String(value) : undefined;
    if (kind.kind === 'reference') return scalar ? String(value) : undefined;
    if (kind.kind === 'struct') return plain(value);
    switch (kind.primitive) {
      // A family whose values are all text, as xml's attributes are, gives a number and a boolean as they are written.
      case 'int': return typeof value === 'bigint' || (typeof value === 'number' && Number.isInteger(value)) || (typeof value === 'string' && /^-?(0|[1-9]\d*)$/.test(value)) ? Number(value) : undefined;
      case 'number': return typeof value === 'bigint' || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(value)) ? Number(value) : undefined;
      case 'bool': return typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : undefined;
      case 'yearMonth': return typeof value === 'string' ? parseYearMonth(value) : undefined;
      case 'json': case 'binary': return plain(value);
      default: return scalar ? String(value) : undefined;
    }
  };
  if (attribute.many !== true) return one(stored);
  if (!Array.isArray(stored)) return undefined;
  const items = stored.map(one);
  return items.every((item) => item !== undefined) ? (items as Value[]) : undefined;
}

/** A value of the model as the FBL library writes it: an integer is a `bigint`, a `yearMonth` its text, an enum value its stored form. */
export function toStored(value: Value, attribute: Attribute, metamodel: Metamodel): unknown {
  const kind = valueKind(metamodel, attribute.type);
  const one = (item: Value): unknown => {
    if (kind.kind === 'enum') return kind.enum.values.find((candidate) => candidate.key === item)?.stored ?? item;
    if (kind.kind !== 'primitive' || typeof item !== 'number') return item;
    if (kind.primitive === 'yearMonth') return formatYearMonth(item);
    return kind.primitive === 'int' && Number.isInteger(item) ? BigInt(item) : item;
  };
  return attribute.many === true && Array.isArray(value) ? value.map(one) : one(value);
}

// What the library read, as plain data: its integers are `bigint`s.
function plain(value: unknown): Value | undefined {
  if (typeof value === 'bigint') return Number(value);
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => plain(item) ?? null);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, plain(item) ?? null]));
  return undefined;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value, (_name, item: unknown) => (typeof item === 'bigint' ? Number(item) : item)) ?? '');

const sameSlot = (a: Slot, b: Slot): boolean => a.key === b.key && a.attribute === b.attribute && a.text === b.text && a.child === b.child && a.group === b.group && a.capture === b.capture;

// The id an entry holds in the body, which the library keeps only for the first holder: the value
// of the attribute that reads the slot the rule's id is read from.
function idAsStored(entry: FblElement, binding: FblBinding): string | undefined {
  if (entry.idIsStored) return entry.id;
  const rule = findRule(binding, entry.rule);
  const slot = rule?.id?.from;
  const name = slot && rule.attributes.find(([, attribute]) => sameSlot(attribute, slot))?.[0];
  const value = name === undefined ? undefined : entry.attributes[name];
  return value === undefined || value === null ? undefined : String(value);
}
