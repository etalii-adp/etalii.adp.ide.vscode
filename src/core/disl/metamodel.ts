// The metamodel of a specification (DISL 4), ready to ask: types with what they inherit, relations
// with the types each end allows, enums in their order, and the diagram's own attributes.

import type { Expressions, World } from './expressions';
import { finding, type Attributes, type Finding, type Loaded, type Model, type ModelRelation, type Value } from './model';
import { isCel, isObject, labelOf, localized, type Attribute, type DataType, type LocalizedText, type NodeType, type RelationEnd, type RelationType, type Specification } from './specification';

export interface MetaEnum {
  readonly name: string;
  readonly label: string;
  readonly ordered: boolean;
  readonly extensible: boolean;
  /** In display order, which is also the order of `ordinal()`. */
  readonly values: readonly MetaEnumValue[];
}

export interface MetaEnumValue {
  /** The name in the specification, in the model and in CEL. */
  readonly key: string;
  /** How the value is written in a stored document (DISL 4.5). */
  readonly stored: string;
  readonly label: string;
  readonly color?: string | { readonly token: string };
  readonly icon?: unknown;
}

export interface MetaType {
  readonly name: string;
  readonly kind: 'node' | 'relation';
  readonly label: string;
  readonly abstract: boolean;
  /** The type itself first, then its supertypes, the nearest first (C3, DISL 4.7). */
  readonly lineage: readonly string[];
  /** Its own attributes and the inherited ones, a supertype's first; a redeclared one is narrowed in place. */
  readonly attributes: Readonly<Record<string, Attribute>>;
  /** The attribute that names an element of the type in a list or a sentence (DISL 4.6). */
  readonly labelAttribute?: string;
  /** The type as the specification declares it, for what this module does not interpret. */
  readonly declared: NodeType | RelationType;
}

export interface MetaRelation extends MetaType {
  readonly kind: 'relation';
  readonly source: MetaEnd;
  readonly target: MetaEnd;
  readonly directed: boolean;
  readonly allowSelfLoops: boolean;
  readonly allowParallel: boolean;
}

export interface MetaEnd {
  /** Every type an element at this end may have: the named ones and their subtypes, without the excluded. */
  readonly types: readonly string[];
  readonly optional: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly role?: string;
}

export interface Metamodel {
  readonly diagram: Readonly<Record<string, Attribute>>;
  readonly enums: Readonly<Record<string, MetaEnum>>;
  /** Node types and relation types, which share one namespace (DISL 2.2). */
  readonly types: Readonly<Record<string, MetaType | MetaRelation>>;
  /** The data types as declared (DISL 4.4): a constrained primitive is read as its base, a struct as it is. */
  readonly dataTypes: Readonly<Record<string, DataType>>;
}

/** What an attribute holds: a primitive of DISL 4.2, an enum, a reference to an element, or a struct. */
export type ValueKind =
  | { readonly kind: 'primitive'; readonly primitive: string }
  | { readonly kind: 'enum'; readonly enum: MetaEnum }
  | { readonly kind: 'reference'; readonly type: string }
  | { readonly kind: 'struct' };

const primitives = ['string', 'text', 'int', 'number', 'bool', 'date', 'datetime', 'yearMonth', 'time', 'duration', 'color', 'uri', 'expression', 'json', 'binary'];

/** Interprets `metamodel`. A type that cannot be placed in its inheritance is kept without supertypes and reported. */
export function interpretMetamodel(specification: Specification, locale?: string): Loaded<Metamodel> {
  const findings: Finding[] = [];
  const declared = specification.metamodel;
  const fallback = specification.language.defaultLocale ?? 'en';
  const label = (thing: { readonly label?: LocalizedText }, name: string): string => localized(thing.label, locale ?? fallback, fallback) ?? labelOf(name);
  const problem = (message: string): void => void findings.push(finding('disl.metamodel', 'error', message));

  const enums: Record<string, MetaEnum> = {};
  for (const [name, entry] of Object.entries(declared.enums ?? {})) {
    enums[name] = {
      name,
      label: label(entry, name),
      ordered: entry.ordered === true,
      extensible: entry.extensible === true,
      values: Object.entries(entry.values ?? {}).map(([key, value]) => ({ key, stored: value.value ?? key, label: label(value, key), color: value.color, icon: value.icon })),
    };
  }

  const nodes = declared.types ?? {};
  const relations = declared.relations ?? {};
  const all: Record<string, NodeType | RelationType> = { ...nodes, ...relations };
  for (const name of Object.keys(relations)) if (name in nodes) problem(`\`${name}\` is declared as a node type and as a relation type.`);

  const parents = (name: string): string[] => {
    const supertypes = all[name].extends ?? [];
    return (typeof supertypes === 'string' ? [supertypes] : [...supertypes]).filter((parent) => {
      const known = parent in all && parent in relations === name in relations;
      if (!known) problem(`\`${name}\` extends \`${parent}\`, which is not a ${name in relations ? 'relation' : 'node'} type of this specification.`);
      return known;
    });
  };
  const lineages = new Map<string, readonly string[]>();
  const lineage = (name: string, path: readonly string[]): readonly string[] => {
    const known = lineages.get(name);
    if (known) return known;
    if (path.includes(name)) {
      problem(`\`${name}\` extends itself through ${path.map((step) => `\`${step}\``).join(', ')}.`);
      return [name];
    }
    const direct = parents(name);
    const merged = merge([...direct.map((parent) => [...lineage(parent, [...path, name])]), direct]);
    if (!merged) problem(`The supertypes of \`${name}\` cannot be put in one order.`);
    const result = [name, ...(merged ?? [])];
    lineages.set(name, result);
    return result;
  };

  const types: Record<string, MetaType | MetaRelation> = {};
  for (const [name, type] of Object.entries(all)) {
    const line = lineage(name, []);
    const attributes: Record<string, Attribute> = {};
    for (const ancestor of [...line].reverse()) {
      for (const [attribute, own] of Object.entries(all[ancestor].attributes ?? {})) {
        // A subtype narrows what it redeclares; a fixed value leaves no default (DISL 4.7).
        const narrowed: Record<string, unknown> = { ...attributes[attribute], ...own };
        if ('fixed' in own) delete narrowed.default;
        attributes[attribute] = narrowed as Attribute;
      }
    }
    const names = Object.keys(attributes);
    const text = (attribute: string): boolean => attributes[attribute].type === 'string' && attributes[attribute].many !== true;
    const meta: MetaType = {
      name,
      kind: name in relations ? 'relation' : 'node',
      label: label(type, name),
      abstract: type.abstract === true,
      lineage: line,
      attributes,
      labelAttribute: line.map((ancestor) => all[ancestor].labelAttribute).find((attribute) => attribute !== undefined)
        ?? names.find((attribute) => attributes[attribute].key === true)
        ?? names.find((attribute) => text(attribute) && attributes[attribute].required === true)
        ?? names.find(text),
      declared: type,
    };
    types[name] = meta;
  }

  const subtypes = (name: string): string[] => Object.keys(types).filter((candidate) => types[candidate].lineage.includes(name));
  const end = (relation: string, side: 'source' | 'target'): MetaEnd => {
    // An end is inherited from the nearest supertype that states one.
    const stated = types[relation].lineage.map((ancestor) => (all[ancestor] as RelationType)[side]).find((value) => value !== undefined);
    const given: RelationEnd = typeof stated === 'string' ? { types: [stated] } : Array.isArray(stated) ? { types: stated } : (stated as RelationEnd | undefined) ?? { types: [] };
    for (const type of [...given.types, ...(given.exclude ?? [])]) if (!(type in types)) problem(`The ${side} of \`${relation}\` names \`${type}\`, which is not a type of this specification.`);
    const excluded = new Set((given.exclude ?? []).flatMap(subtypes));
    return {
      types: [...new Set(given.types.flatMap(subtypes))].filter((type) => !excluded.has(type)),
      optional: side === 'target' && given.optional === true,
      min: given.min ?? undefined,
      max: given.max ?? undefined,
      role: given.role,
    };
  };
  for (const name of Object.keys(relations)) {
    const stated = <K extends 'directed' | 'allowSelfLoops' | 'allowParallel'>(key: K): boolean | undefined =>
      types[name].lineage.map((ancestor) => (all[ancestor] as RelationType)[key]).find((value) => value !== undefined);
    types[name] = {
      ...types[name],
      kind: 'relation',
      source: end(name, 'source'),
      target: end(name, 'target'),
      directed: stated('directed') ?? true,
      allowSelfLoops: stated('allowSelfLoops') ?? false,
      allowParallel: stated('allowParallel') ?? true,
    };
  }

  return { value: { diagram: declared.diagram?.attributes ?? {}, enums, types, dataTypes: declared.dataTypes ?? {} }, findings };
}

// The merge of C3: the first head that is in no other list's tail, until every list is empty.
function merge(lists: string[][]): string[] | undefined {
  const result: string[] = [];
  let rest = lists.filter((list) => list.length > 0);
  while (rest.length > 0) {
    const head = rest.map((list) => list[0]).find((candidate) => rest.every((list) => !list.slice(1).includes(candidate)));
    if (head === undefined) return undefined;
    result.push(head);
    rest = rest.map((list) => (list[0] === head ? list.slice(1) : list)).filter((list) => list.length > 0);
  }
  return result;
}

/** Whether `type` is `ancestor` or one of its subtypes; a type name always includes its subtypes (DISL 2.7). */
export const isA = (metamodel: Metamodel, type: string, ancestor: string): boolean => metamodel.types[type]?.lineage.includes(ancestor) ?? type === ancestor;

export const isRelation = (type: MetaType | undefined): type is MetaRelation => type?.kind === 'relation';

/** The attributes of a type, or of the diagram for the name `diagram`. */
export const attributesOf = (metamodel: Metamodel, type: string): Readonly<Record<string, Attribute>> =>
  (type === 'diagram' ? metamodel.diagram : metamodel.types[type]?.attributes) ?? {};

/** Whether an element of type `type` may be the `side` end of a relation of type `relation`. */
export function allowsEnd(metamodel: Metamodel, relation: string, side: 'source' | 'target', type: string): boolean {
  const meta = metamodel.types[relation];
  return isRelation(meta) && meta[side].types.includes(type);
}

/** What the type name of an attribute stands for. A name the metamodel does not know is read as a string. */
export function valueKind(metamodel: Metamodel, type: string): ValueKind {
  if (primitives.includes(type)) return { kind: 'primitive', primitive: type };
  if (type in metamodel.enums) return { kind: 'enum', enum: metamodel.enums[type] };
  if (type in metamodel.types) return { kind: 'reference', type };
  const data = Object.hasOwn(metamodel.dataTypes, type) ? metamodel.dataTypes[type] : undefined;
  if (data?.fields) return { kind: 'struct' };
  return data?.base !== undefined && data.base !== type ? valueKind(metamodel, data.base) : { kind: 'primitive', primitive: 'string' };
}

/** What an attribute reads as while nothing is stored: its fixed value, its literal default, else nothing (DISL 4.3). */
export function defaultOf(attribute: Attribute): Value | undefined {
  const value = 'fixed' in attribute ? attribute.fixed : attribute.default;
  return value === undefined || isCel(value) ? undefined : (value as Value);
}

/** The literal defaults of a type's attributes, by name: what a new element starts with before a tool sets more. */
export function defaultsOf(metamodel: Metamodel, type: string): Attributes {
  const defaults: Record<string, Value> = {};
  for (const [name, attribute] of Object.entries(attributesOf(metamodel, type))) {
    const value = 'fixed' in attribute ? undefined : defaultOf(attribute);
    if (value !== undefined) defaults[name] = value;
  }
  return defaults;
}

/** The value an attribute reads as with neither a stored value nor a default: the zero of its type (DISL 4.3). */
export function zeroOf(kind: ValueKind, many: boolean): Value {
  if (many) return [];
  if (kind.kind === 'reference') return null;
  if (kind.kind === 'struct') return {};
  if (kind.kind === 'enum') return '';
  switch (kind.primitive) {
    case 'int': case 'number': case 'yearMonth': return 0;
    case 'bool': return false;
    case 'json': return null;
    default: return '';
  }
}

/** The ordinal of an enum value: its place in the enum, or -1. */
export const ordinal = (metamodel: Metamodel, name: string, key: string): number => metamodel.enums[name]?.values.findIndex((value) => value.key === key) ?? -1;

// ---- links (DISL 4.2) ----

/**
 * What the value of a `uri` attribute is: a URI when it starts with a scheme and a colon and that
 * scheme is no drive letter, and a path otherwise, absolute or relative to the file it is stored in.
 */
export function linkKind(value: string): { readonly kind: 'uri'; readonly scheme: string } | { readonly kind: 'path' } {
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(value)?.[1];
  return scheme === undefined || scheme.length === 1 ? { kind: 'path' } : { kind: 'uri', scheme: scheme.toLowerCase() };
}

/** Whether a `uri` attribute takes a value: a URI of one of its `schemes`, any URI where it names none, and a path where it has `paths`. */
export function takesLink(attribute: Attribute, value: string): boolean {
  const kind = linkKind(value);
  if (kind.kind === 'path') return attribute.paths === true;
  return !Array.isArray(attribute.schemes) || attribute.schemes.includes(kind.scheme);
}

// ---- moments (DISL 4.2) ----

/** A moment as it is stored when an action computes it: in the local time of the host with its offset, to the second. */
export function formatMoment(moment: Date): string {
  const two = (value: number): string => String(Math.trunc(Math.abs(value))).padStart(2, '0');
  const offset = -moment.getTimezoneOffset();
  return `${moment.getFullYear()}-${two(moment.getMonth() + 1)}-${two(moment.getDate())}T${two(moment.getHours())}:${two(moment.getMinutes())}:${two(moment.getSeconds())}`
    + `${offset < 0 ? '-' : '+'}${two(offset / 60)}:${two(offset % 60)}`;
}

// ---- derived relations (DISL 4.11.3) ----

/** A relation a type derives from the model, with the operations its gestures are carried out by. */
export interface DerivedRelation extends ModelRelation {
  readonly source: string;
  readonly target: string;
  /** The operation each gesture on it runs, by the gesture (`connect`, `delete`, ...): a gesture that names none is refused. */
  readonly edits: Readonly<Record<string, string>>;
}

/**
 * The relations the relation types derive from a model, in the order of the types and of each
 * type's `from`. Its id is what `id` gives, else `<Type>:<source>-><target>`, with `#2`, `#3` on a
 * repeat. An item whose ends are not elements of the types its relation allows is dropped, and
 * said once for its type (`std.derivedEnds`), at the first of the dropped item's sources.
 */
export function derivedRelations(metamodel: Metamodel, expressions: Expressions, model: Model, world: World = expressions.over(model)): Loaded<readonly DerivedRelation[]> {
  // simplified: of a derived relation its ends, its id, its sources and its edits are read; `attributes`, `key` and `owner` are not. Read them when a definition draws a derived relation from more than its two ends.
  const relations: DerivedRelation[] = [];
  const findings: Finding[] = [];
  const elements = new Map(model.elements.map((element) => [element.id, element]));
  for (const type of Object.values(metamodel.types)) {
    const rule = isRelation(type) && isObject(type.declared.derived) ? type.declared.derived : undefined;
    if (!isRelation(type) || !rule || (typeof rule.from !== 'string' && !isCel(rule.from))) continue;
    const items = expressions.evaluate(rule.from, world.scope());
    if (!items.ok || !Array.isArray(items.raw)) {
      findings.push(finding('std.derivedFailed', 'warning', `The relations of the type \`${type.name}\` could not be derived, so none is drawn: ${items.ok ? '`from` did not give a list' : items.error}`));
      continue;
    }
    const repeats = new Map<string, number>();
    let dropped = false;
    for (const item of items.raw as unknown[]) {
      const read = (expression: unknown): Value | undefined => {
        const result = typeof expression === 'string' || isCel(expression) ? expressions.evaluate(expression, world.scope(undefined, { item })) : undefined;
        return result?.ok ? result.value : undefined;
      };
      const [source, target] = [read(rule.source), read(rule.target)];
      if (typeof source !== 'string' || typeof target !== 'string') continue;
      const from = read(rule.sources);
      const first = (Array.isArray(from) ? from : [from]).find((id): id is string => typeof id === 'string' && elements.has(id));
      if (!type.source.types.includes(elements.get(source)?.type ?? '') || !type.target.types.includes(elements.get(target)?.type ?? '')) {
        if (!dropped) {
          const line = first === undefined ? 0 : elements.get(first)!.line;
          findings.push(finding('std.derivedEnds', 'warning', `A relation of the type \`${type.name}\` is derived between elements it cannot join, so it is not drawn.`, {
            location: { file: '', line, column: line === 0 ? 0 : 1, length: 0 }, ...(first === undefined ? {} : { element: first }), detail: { relationType: type.name },
          }));
        }
        dropped = true;
        continue;
      }
      const own = read(rule.id);
      const id = typeof own === 'string' && own !== '' ? own : `${type.name}:${source}->${target}`;
      const count = (repeats.get(id) ?? 0) + 1;
      repeats.set(id, count);
      relations.push({
        id: count === 1 ? id : `${id}#${count}`, type: type.name, attributes: {}, host: {}, ephemeral: true, line: first === undefined ? 0 : elements.get(first)!.line, source, target,
        edits: Object.fromEntries(Object.entries(isObject(rule.edits) ? rule.edits : {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
      });
    }
  }
  return { value: relations, findings };
}

// ---- year and month (DISL 4.2) ----

/** The month index of `±YYYY-MM`, year × 12 + (month − 1), or nothing for a text not in that form. */
export function parseYearMonth(text: string): number | undefined {
  const parts = /^(-?)(\d{4,6})-(\d{2})$/.exec(text);
  if (!parts) return undefined;
  const month = Number(parts[3]);
  if (month < 1 || month > 12) return undefined;
  return (parts[1] === '-' ? -1 : 1) * Number(parts[2]) * 12 + month - 1;
}

/** The astronomical year and the month, 1 to 12, of a month index. */
export const yearMonthOf = (index: number): { readonly year: number; readonly month: number } =>
  ({ year: Math.floor(index / 12), month: index - Math.floor(index / 12) * 12 + 1 });

/** A month index as it is stored: at least four year digits, and a `-` before a year below 0000. */
export function formatYearMonth(index: number): string {
  const { year, month } = yearMonthOf(index);
  return `${year < 0 ? '-' : ''}${String(Math.abs(year)).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

