// Counted ids (DESL 5.3.5): the ids of a type are a prefix and a number counted up per document,
// written with at least `digits` digits, and the last id given is kept in a string attribute of the
// document, the mark, so that a number is never given twice. An element written with the
// placeholder after the prefix has no number yet: it is numbered in memory when the document is
// read, in reading order, and that number is written with the next edit that writes the document
// (DESL 5.3.4). Every other id is opaque: it has no number, and nothing here changes it.

import type { Change } from '../disl/behavior';
import type { Finding, Model, ModelElement } from '../disl/model';
import type { InterpretedPersistence } from '../disl/persistence';

/** A `counter` rule of one type (DESL 5.3.5), with its defaults. */
export interface CounterRule {
  readonly type: string;
  readonly prefix: string;
  readonly digits: number;
  /** The string attribute of the document that holds the last id the rule gave. */
  readonly mark: string;
  /** What is written after the prefix of an element that has no number yet. */
  readonly placeholder?: string;
}

/** An element that is written without a usable id, with the id it is numbered with, in reading order. */
export interface Unnumbered {
  /** The id the FBL library reads the element under: its written id, or one by its place. */
  readonly id: string;
  /** The counted id it has in memory, and is written with by the next edit that writes the document. */
  readonly newId: string;
  readonly type: string;
  readonly line: number;
}

/** A model whose placeholders are numbered, with the findings of its reading as DESL words them. */
export interface Numbered {
  readonly model: Model;
  readonly findings: readonly Finding[];
  readonly unnumbered: readonly Unnumbered[];
}

const missingId = 'std.missingId';
const duplicateId = 'std.duplicateId';

/** The `counter` rules of `persistence.ids.types`, one for each type that has one; a rule without a prefix or a mark is none. */
export function counterRules(persistence: InterpretedPersistence): readonly CounterRule[] {
  return Object.entries(persistence.ids.types ?? {}).flatMap(([type, rule]): CounterRule[] => {
    if (rule.strategy !== 'counter' || typeof rule.prefix !== 'string' || rule.prefix === '' || typeof rule.mark !== 'string') return [];
    const digits = typeof rule.digits === 'number' && Number.isInteger(rule.digits) && rule.digits >= 1 ? rule.digits : 1;
    return [{ type, prefix: rule.prefix, digits, mark: rule.mark, ...(typeof rule.placeholder === 'string' && rule.placeholder !== '' ? { placeholder: rule.placeholder } : {}) }];
  });
}

/** The number of an id: the integer its digits make, when it is the prefix followed by digits only. `REQ-0012` and `REQ-12` both have 12. */
export function numberOf(rule: CounterRule, id: unknown): number | undefined {
  if (typeof id !== 'string' || !id.startsWith(rule.prefix)) return undefined;
  const digits = id.slice(rule.prefix.length);
  return /^[0-9]+$/.test(digits) ? Number(digits) : undefined;
}

/** The id of a number: the prefix and the number, padded with `0` to the rule's digits; a number that needs more is written with more. */
export const countedId = (rule: CounterRule, number: number): string => `${rule.prefix}${String(number).padStart(rule.digits, '0')}`;

/** The placeholder id of a rule, `REQ-NEW`, when it has one. */
export const placeholderOf = (rule: CounterRule): string | undefined => (rule.placeholder === undefined ? undefined : `${rule.prefix}${rule.placeholder}`);

/** The higher of the mark's number and the highest number of an id with the prefix in the model or among `assigned`; 0 for none. */
export function highestOf(rule: CounterRule, model: Model, assigned: Iterable<string> = []): number {
  let highest = numberOf(rule, model.diagram[rule.mark]) ?? 0;
  for (const id of [...model.elements.map((element) => element.id), ...model.relations.map((relation) => relation.id), ...assigned]) highest = Math.max(highest, numberOf(rule, id) ?? 0);
  return highest;
}

/** A new id of the rule (DESL 5.3.5): one more than the mark's number and every number in the model and among `assigned`. */
export const nextCounted = (rule: CounterRule, model: Model, assigned: Iterable<string> = []): string => countedId(rule, highestOf(rule, model, assigned) + 1);

/**
 * The sets of the document that keep each rule's mark at the last id given (DESL 5.3.5): one for
 * each rule of which `assigned` holds an id, to the highest of them and the mark, where that is
 * not the mark already. They are part of the transaction that gives the ids.
 */
export function markSets(rules: readonly CounterRule[], model: Model, assigned: readonly string[]): Change[] {
  const sets: Change[] = [];
  for (const rule of rules) {
    const numbers = assigned.map((id) => numberOf(rule, id)).filter((number): number is number => number !== undefined);
    if (numbers.length === 0) continue;
    const last = countedId(rule, Math.max(numberOf(rule, model.diagram[rule.mark]) ?? 0, ...numbers));
    if (model.diagram[rule.mark] !== last) sets.push({ kind: 'set', id: '', attributes: { [rule.mark]: last } });
  }
  return sets;
}

/**
 * New counted ids for elements of a model, in the order given, each of the rule of its type, and
 * the sets of the marks that go with them: the user's action that gives an element a new id
 * (DESL 5.3.4, 5.3.5), such as a later holder of a duplicated id. An element of a type that is not
 * counted is left out.
 */
export function renumbering(model: Model, ids: readonly string[], rules: readonly CounterRule[]): { readonly renamed: readonly { readonly id: string; readonly newId: string }[]; readonly marks: readonly Change[] } {
  const renamed: { id: string; newId: string }[] = [];
  for (const id of ids) {
    const element = model.elements.find((candidate) => candidate.id === id);
    const rule = element && rules.find((candidate) => candidate.type === element.type);
    if (rule) renamed.push({ id, newId: nextCounted(rule, model, renamed.map((done) => done.newId)) });
  }
  return { renamed, marks: markSets(rules, model, renamed.map((done) => done.newId)) };
}

/**
 * A model read through a binding, with every element of a counted type that has no usable id
 * numbered in memory (DESL 5.3.4, 5.3.5, 10.2): an element written with the placeholder, the first
 * holder and every later one, and one the library found no id for, each the next number of its rule
 * in reading order, after the mark and every number the document holds. Such an element is
 * ephemeral until the number is written, and what it holds follows it to its new id.
 *
 * Of the findings, the library's `std.duplicateId` at a placeholder becomes `std.missingId`, which
 * every placeholder is reported by; one the library gave already for an id it did not find stays.
 */
export function numbered(read: { readonly value: Model; readonly findings: readonly Finding[] }, rules: readonly CounterRule[]): Numbered {
  const model = read.value;
  if (rules.length === 0) return { model, findings: read.findings, unnumbered: [] };
  const ruleOf = (element: ModelElement): CounterRule | undefined => rules.find((rule) => rule.type === element.type);
  const placeholderIds = new Set(rules.map(placeholderOf).filter((id): id is string => id !== undefined));
  // A later holder of a placeholder is read under an id of its place; the library's finding says which it held.
  const heldPlaceholder = new Set(read.findings.filter((found) => found.code === duplicateId && typeof found.detail?.id === 'string' && placeholderIds.has(found.detail.id) && found.element !== undefined).map((found) => found.element!));
  const missing = new Set(read.findings.filter((found) => found.code === missingId && found.element !== undefined).map((found) => found.element!));

  const unnumbered: Unnumbered[] = [];
  const placeholders = new Map<string, string>();
  const stored = { ...model, elements: model.elements.filter((element) => !(placeholderIds.has(element.id) || heldPlaceholder.has(element.id) || missing.has(element.id))) };
  for (const element of model.elements) {
    const rule = ruleOf(element);
    if (!rule) continue;
    const written = placeholderOf(rule);
    const isPlaceholder = (written !== undefined && element.id === written) || heldPlaceholder.has(element.id);
    if (!isPlaceholder && !missing.has(element.id)) continue;
    const newId = nextCounted(rule, stored, unnumbered.map((done) => done.newId));
    unnumbered.push({ id: element.id, newId, type: element.type, line: element.line });
    if (isPlaceholder) placeholders.set(element.id, written ?? element.id);
  }
  if (unnumbered.length === 0) return { model, findings: read.findings, unnumbered };

  const now = new Map(unnumbered.map((done) => [done.id, done.newId]));
  const to = (id: string | undefined): string | undefined => (id === undefined ? undefined : now.get(id) ?? id);
  const elements = model.elements.map((element) => {
    const id = to(element.id)!;
    const parent = to(element.parent);
    if (id === element.id && parent === element.parent) return element;
    return { ...element, id, ...(parent === undefined ? {} : { parent }), ephemeral: element.ephemeral || id !== element.id };
  });
  const relations = model.relations.map((relation) => ({ ...relation, ...(relation.source === undefined ? {} : { source: to(relation.source) }), ...(relation.target === undefined ? {} : { target: to(relation.target) }) }));

  const file = read.findings[0]?.location.file ?? '';
  const findings: Finding[] = [
    ...read.findings.filter((found) => !(found.code === duplicateId && found.element !== undefined && heldPlaceholder.has(found.element))).map((found) => (found.element !== undefined && now.has(found.element) ? { ...found, element: now.get(found.element) } : found)),
    ...unnumbered.filter((done) => placeholders.has(done.id)).map((done): Finding => ({
      code: missingId, severity: 'warning', message: `${done.newId} is numbered when the document is next changed: the file holds ${placeholders.get(done.id)!}.`,
      location: { file, line: done.line, column: 1, length: 0 }, element: done.newId,
    })),
  ].sort((a, b) => a.location.line - b.location.line);
  return { model: { ...model, elements, relations }, findings, unnumbered };
}
