// Settings in the registration (DESL 5.5): the part of the model a document's `.adp` registration
// keeps beside its body, block by block. A list is the elements of one type, the block's entries in
// its order, each keyed by one attribute and holding another; a state is one attribute of elements
// of some types, kept by the element's id where it differs from its default. Reading puts those
// elements and values into the model; writing turns the model changes of a transaction that touch
// them into the `setting` changes of the FBL library (FBL 0.7 8.4), beside the changes of the body.

import type { Change } from '../disl/behavior';
import type { Expressions } from '../disl/expressions';
import { attributesOf, defaultOf, valueKind, type Metamodel } from '../disl/metamodel';
import { finding, type Attributes, type Finding, type Loaded, type Model, type ModelElement, type Value } from '../disl/model';
import type { InterpretedPersistence } from '../disl/persistence';
import { isObject, type Attribute } from '../disl/specification';
import type { FblBinding, RegistrationBlockDeclaration } from '../fbl/documents/types';
import type { ChangePosition, ModelChange } from '../fbl/planning/modelChange';

/** A list kept in a block (DESL 5.5): the elements of `type`, keyed by `key` and holding `value`, and those a document has without the block. */
export interface ListSetting {
  readonly block: string;
  readonly type: string;
  readonly key: string;
  readonly value: string;
  readonly initial: readonly Attributes[];
}

/** A state kept in a block (DESL 5.5): the attribute `attribute` of the elements of the types `of`, by the element's id. */
export interface StateSetting {
  readonly block: string;
  readonly attribute: string;
  readonly of: readonly string[];
}

export interface Settings {
  readonly lists: readonly ListSetting[];
  readonly states: readonly StateSetting[];
}

/** A member of a block as the registration holds it: its key and its value, both written. */
export interface StoredEntry {
  readonly key: string;
  readonly value: string;
}

/** The blocks a registration holds, by name, each with its entries in order: a block that is absent is not there. */
export type StoredBlocks = ReadonlyMap<string, readonly StoredEntry[]>;

/** What a registration is read through: the entries of a block it holds, or nothing for one it does not (`OpenRegistration`, `RegistrationDocument`). */
export interface BlockReader {
  blockEntries(block: string): readonly StoredEntry[] | undefined;
}

/** The id an element of a type is given from its attributes, by the type's derived rule (DESL 5.3.2); nothing when it gives none. */
export type DeriveId = (type: string, attributes: Attributes) => string | undefined;

export const noSettings: Settings = { lists: [], states: [] };

/**
 * Interprets `persistence.settings` (DESL 5.5) with the checks of DESL 10.1, step 4: every block is
 * one each binding declares, a list's type and attributes exist and the type has a derived id rule,
 * and a state's attribute is one of each of its types. A setting that fails one is left out, and
 * reported as `desl.persistence`, an error; a list's block that does not keep its order and a state's
 * block that is not keyed by ids are warnings.
 */
export function interpretSettings(declared: Readonly<Record<string, unknown>>, metamodel: Metamodel, persistence: InterpretedPersistence, bindings: readonly FblBinding[]): Loaded<Settings> {
  const findings: Finding[] = [];
  const problem = (message: string, severity: Finding['severity'] = 'error'): void => void findings.push(finding('desl.persistence', severity, message));
  const lists: ListSetting[] = [];
  const states: StateSetting[] = [];
  const has = (type: string, name: unknown): name is string => typeof name === 'string' && Object.hasOwn(attributesOf(metamodel, type), name);
  for (const [block, setting] of Object.entries(declared)) {
    const declarations = bindings.map((binding) => binding.registration.blocks.find((candidate) => candidate.name === block));
    if (bindings.length === 0 || declarations.some((declaration) => declaration === undefined)) {
      problem(`The setting \`${block}\` is kept in a block that not every binding declares in its registration.`);
      continue;
    }
    if (!isObject(setting)) {
      problem(`The setting \`${block}\` is no list and no state.`);
      continue;
    }
    if (typeof setting.type === 'string') {
      const { type } = setting;
      const rule = persistence.ids.types?.[type];
      if (!Object.hasOwn(metamodel.types, type)) problem(`The setting \`${block}\` lists \`${type}\`, which is not a type of this tool.`);
      else if (!has(type, setting.key) || !has(type, setting.value)) problem(`The setting \`${block}\` keys and values \`${type}\` by \`${String(setting.key)}\` and \`${String(setting.value)}\`, which are not both attributes of it.`);
      else if (rule?.strategy !== 'derived') problem(`The setting \`${block}\` lists \`${type}\`, whose ids are not derived from its key.`);
      else {
        if (declarations.some((declaration) => !declaration!.kept)) problem(`The block \`${block}\` keeps a list, and a binding does not keep its order.`, 'warning');
        const initial = (Array.isArray(setting.initial) ? setting.initial : []).filter(isObject).map((member) => member as Attributes);
        lists.push({ block, type, key: setting.key, value: setting.value, initial });
      }
    } else if (typeof setting.attribute === 'string') {
      const of = Array.isArray(setting.of) ? setting.of.filter((type): type is string => typeof type === 'string') : [];
      const missing = of.filter((type) => !has(type, setting.attribute));
      if (of.length === 0 || missing.length > 0) problem(`The setting \`${block}\` keeps \`${setting.attribute}\` of ${missing.length > 0 ? missing.map((type) => `\`${type}\``).join(', ') : 'no type'}, which ${missing.length > 1 ? 'do' : 'does'} not have it.`);
      else {
        if (declarations.some((declaration) => !declaration!.keyedByIds)) problem(`The block \`${block}\` keeps a state by the elements' ids, and a binding does not key it by ids.`, 'warning');
        states.push({ block, attribute: setting.attribute, of });
      }
    } else problem(`The setting \`${block}\` is no list and no state.`);
  }
  return { value: { lists, states }, findings };
}

/** The ids the derived rules of a specification give, worked out over an element alone (DESL 5.3.2). */
export function derivedIds(expressions: Expressions, persistence: InterpretedPersistence): DeriveId {
  return (type, attributes) => {
    const rule = persistence.ids.types?.[type];
    if (rule?.strategy !== 'derived' || rule.expression === undefined) return undefined;
    const self = '\u0000';
    const result = expressions.evaluate(rule.expression, expressions.over({ diagram: {}, relations: [], elements: [{ id: self, type, attributes, host: {}, ephemeral: false, line: 0 }] }).scope(self));
    return result.ok && typeof result.value === 'string' && result.value !== '' ? result.value : undefined;
  };
}

/**
 * The written form of a value in a block (DESL 5.5): a string as itself, an enumeration value as its
 * stored form, a number as JSON writes it, a bool as `yes` or `no`.
 */
export function writtenSetting(value: Value, attribute: Attribute, metamodel: Metamodel): string {
  const kind = valueKind(metamodel, attribute.type);
  if (kind.kind === 'enum') return kind.enum.values.find((candidate) => candidate.key === value)?.stored ?? String(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return JSON.stringify(value);
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** A written value as the model holds it, of its attribute's type; nothing when it is not one. An enumeration's stored form is matched as written, else ignoring case. */
export function readSetting(written: string, attribute: Attribute, metamodel: Metamodel): Value | undefined {
  const kind = valueKind(metamodel, attribute.type);
  if (kind.kind === 'enum') {
    const lower = written.toLowerCase();
    return (kind.enum.values.find((candidate) => candidate.stored === written) ?? kind.enum.values.find((candidate) => candidate.stored.toLowerCase() === lower))?.key;
  }
  if (kind.kind !== 'primitive') return written;
  switch (kind.primitive) {
    case 'bool': return written === 'yes' || written === 'true' ? true : written === 'no' || written === 'false' ? false : undefined;
    case 'int': return /^-?(0|[1-9]\d*)$/.test(written) ? Number(written) : undefined;
    case 'number': return /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(written) ? Number(written) : undefined;
    default: return written;
  }
}

/**
 * A model with what the registration keeps in it (DESL 5.5): the elements of each list, from its
 * block in the block's order or, while the block is absent, its `initial` elements, after the
 * elements of the body, each with the id its derived rule gives it; and each state's values, from
 * its block, on the elements its keys name. A member whose id another has already, and a value that
 * is not of its attribute's type, are left out. `stored` holds the blocks the registration has.
 */
export function withSettings(model: Model, registration: BlockReader | undefined, settings: Settings, metamodel: Metamodel, derive: DeriveId): { readonly model: Model; readonly stored: StoredBlocks } {
  const stored = new Map<string, readonly StoredEntry[]>();
  for (const block of [...settings.lists.map((list) => list.block), ...settings.states.map((state) => state.block)]) {
    const entries = registration?.blockEntries(block);
    if (entries) stored.set(block, entries.map((entry) => ({ key: entry.key, value: entry.value })));
  }
  const members: ModelElement[] = [];
  const taken = new Set(model.elements.map((element) => element.id));
  for (const list of settings.lists) {
    const attributes = attributesOf(metamodel, list.type);
    const entries = stored.get(list.block);
    const values: readonly Attributes[] = entries
      ? entries.map((entry) => {
        const key = readSetting(entry.key, attributes[list.key], metamodel);
        const value = readSetting(entry.value, attributes[list.value], metamodel);
        return { ...(key === undefined ? {} : { [list.key]: key }), ...(value === undefined ? {} : { [list.value]: value }) };
      })
      : list.initial;
    for (const held of values) {
      const id = derive(list.type, held);
      if (id === undefined || taken.has(id)) continue;
      taken.add(id);
      members.push({ id, type: list.type, attributes: held, host: {}, ephemeral: false, line: 0 });
    }
  }
  let elements = [...model.elements, ...members];
  for (const state of settings.states) {
    const entries = stored.get(state.block) ?? [];
    if (entries.length === 0) continue;
    const byId = new Map(entries.map((entry) => [entry.key, entry.value]));
    elements = elements.map((element) => {
      const written = state.of.includes(element.type) && !element.ephemeral ? byId.get(element.id) : undefined;
      const attribute = written === undefined ? undefined : attributesOf(metamodel, element.type)[state.attribute];
      const value = attribute && readSetting(written!, attribute, metamodel);
      return value === undefined ? element : { ...element, attributes: { ...element.attributes, [state.attribute]: value } };
    });
  }
  return { model: members.length === 0 && elements.length === model.elements.length && settings.states.length === 0 ? model : { ...model, elements }, stored };
}

/** What a transaction writes, parted by where it goes. */
export interface SettingSteps {
  /** The changes of the body: those of the transaction that touch no setting. */
  readonly body: readonly Change[];
  /** The changes of the registration, in order, each planned against the registration the one before left. */
  readonly registration: readonly Extract<ModelChange, { kind: 'setting' }>[];
  /** The values of a state on an element whose id is ephemeral: kept for the session only, never written (DESL 5.3.3, 5.5). */
  readonly session: readonly { readonly id: string; readonly attribute: string; readonly value: Value | null }[];
  /** Whether the registration changes only in blocks that are no steps of the history (FBL 7.1), and the body not at all. */
  readonly outsideHistory: boolean;
}

/**
 * The changes of one transaction parted into the body's and the registration's (DESL 5.5). A list
 * any change touches is written as the block holding every member of the list after the transaction,
 * in its order: a block that is absent, or that lacks a member the document has (its initial ones,
 * or an implicit one, DESL 7.7.2), is written whole; otherwise only what differs, as an add after
 * the member before it, a set of a value, a rename of a key, a removal and a move. A state is set by
 * its element's id while it differs from its attribute's default, and removed when it is back at
 * it; on an element whose id is ephemeral it is kept for the session only.
 */
export function settingSteps(changes: readonly Change[], before: Model, after: Model, settings: Settings, stored: StoredBlocks, metamodel: Metamodel, declarations: readonly RegistrationBlockDeclaration[] = []): SettingSteps {
  const listed = new Map(settings.lists.map((list) => [list.type, list]));
  const typeOf = (id: string): string | undefined => (after.elements.find((element) => element.id === id) ?? before.elements.find((element) => element.id === id))?.type;
  const addedType = (change: Change): string | undefined => (change.kind === 'add' ? change.type : typeOf(change.id));
  const touched = new Set<ListSetting>();
  const stateChanges: { readonly state: StateSetting; readonly id: string; readonly value: Value | null }[] = [];
  const body: Change[] = [];
  for (const change of changes) {
    const type = change.id === '' ? undefined : addedType(change);
    const list = type === undefined ? undefined : listed.get(type);
    if (list) {
      touched.add(list);
      continue;
    }
    if (change.kind !== 'set' || type === undefined) {
      body.push(change);
      continue;
    }
    const kept: Record<string, Value | null> = {};
    for (const [name, value] of Object.entries(change.attributes)) {
      const state = settings.states.find((candidate) => candidate.attribute === name && candidate.of.includes(type));
      if (state) stateChanges.push({ state, id: change.id, value });
      else kept[name] = value;
    }
    if (Object.keys(kept).length > 0) body.push({ ...change, attributes: kept });
  }

  const registration: Extract<ModelChange, { kind: 'setting' }>[] = [];
  const blocks = new Set<string>();
  for (const list of settings.lists.filter((candidate) => touched.has(candidate))) {
    const attributes = attributesOf(metamodel, list.type);
    const written = (element: ModelElement, name: string): string => {
      const value = element.attributes[name] ?? defaultOf(attributes[name]);
      return value === undefined || value === null ? '' : writtenSetting(value, attributes[name], metamodel);
    };
    const members = (model: Model): ModelElement[] => model.elements.filter((element) => element.type === list.type);
    const target = members(after).map((element) => ({ id: element.id, key: written(element, list.key), value: written(element, list.value) }));
    const formerKey = new Map(members(before).map((element) => [element.id, written(element, list.key)]));
    const steps: Extract<ModelChange, { kind: 'setting' }>[] = [];
    // The block as the steps so far leave it.
    const current = [...(stored.get(list.block) ?? [])].map((entry) => ({ ...entry }));
    const at = (key: string): number => current.findIndex((entry) => entry.key === key);
    // A member whose key changed is renamed where it stands.
    for (const member of target) {
      const was = formerKey.get(member.id);
      if (was === undefined || was === member.key || at(was) < 0 || at(member.key) >= 0) continue;
      steps.push({ kind: 'setting', block: list.block, key: was, rename: member.key, ...(member.value === current[at(was)].value ? {} : { value: member.value }) });
      current[at(was)] = { key: member.key, value: member.value };
    }
    // What the list no longer holds goes.
    for (const entry of [...current]) {
      if (target.some((member) => member.key === entry.key)) continue;
      steps.push({ kind: 'setting', block: list.block, key: entry.key, remove: true });
      current.splice(at(entry.key), 1);
    }
    // Then each member in its order: added after the one before it, its value set, or moved there.
    target.forEach((member, index) => {
      const previous = index === 0 ? undefined : target[index - 1].key;
      const position: ChangePosition | undefined = previous !== undefined ? { after: previous } : current.length > 0 ? { index: 0 } : undefined;
      const place = at(member.key);
      if (place < 0) {
        steps.push({ kind: 'setting', block: list.block, key: member.key, value: member.value, ...(position === undefined ? {} : { position }) });
        current.splice(previous === undefined ? 0 : at(previous) + 1, 0, { key: member.key, value: member.value });
        return;
      }
      const inPlace = previous === undefined ? place === 0 : place === at(previous) + 1;
      const value = current[place].value === member.value ? undefined : member.value;
      if (inPlace && value === undefined) return;
      steps.push({ kind: 'setting', block: list.block, key: member.key, ...(value === undefined ? {} : { value }), ...(inPlace || position === undefined ? {} : { position }) });
      const [moved] = current.splice(place, 1);
      current.splice(previous === undefined ? 0 : at(previous) + 1, 0, { ...moved, value: member.value });
    });
    if (steps.length > 0) blocks.add(list.block);
    registration.push(...steps);
  }

  const session: { id: string; attribute: string; value: Value | null }[] = [];
  for (const { state, id, value } of stateChanges) {
    const element = after.elements.find((candidate) => candidate.id === id) ?? before.elements.find((candidate) => candidate.id === id);
    if (!element) continue;
    if (element.ephemeral) {
      session.push({ id, attribute: state.attribute, value });
      continue;
    }
    const attribute = attributesOf(metamodel, element.type)[state.attribute];
    const standard = defaultOf(attribute);
    const held = (stored.get(state.block) ?? []).some((entry) => entry.key === id);
    if (value === null || JSON.stringify(value) === JSON.stringify(standard)) {
      if (held) registration.push({ kind: 'setting', block: state.block, key: id, remove: true });
    } else registration.push({ kind: 'setting', block: state.block, key: id, value: writtenSetting(value, attribute, metamodel) });
    blocks.add(state.block);
  }

  const outsideHistory = body.length === 0 && registration.length > 0 && [...blocks].every((block) => declarations.find((declaration) => declaration.name === block)?.inHistory === false);
  return { body, registration, session, outsideHistory };
}
