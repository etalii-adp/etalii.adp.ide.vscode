import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import type { FblBinding } from '../../../../src/core/fbl/documents/types';
import type { Finding } from '../../../../src/core/fbl/finding';
import { OpenBody } from '../../../../src/core/fbl/history/openBody';
import type { UndoResult } from '../../../../src/core/fbl/history/splicedFile';
import type { FblElement, FblOptions } from '../../../../src/core/fbl/model';
import type { ChangePosition, ModelChange } from '../../../../src/core/fbl/planning/modelChange';
import type { PlanResult } from '../../../../src/core/fbl/planning/plan';
import type { BlockMember } from '../../../../src/core/fbl/registration/declaredBlockWriter';
import { OpenRegistration } from '../../../../src/core/fbl/registration/openRegistration';
import { definitions } from './knowledge';

// A requirement document as the Hierarchical Requirement Designer sees it, standing in for DESL in
// the fixture run as naturalIds.ts stands in for DISL: a port of standalone's
// HierarchicalRequirementSpecification and HierarchicalRequirementDocument
// (EtAlii.Adp.Specification.Fbl.Tests/Support). The input is a body, or a registration with its body
// beside it (FBL 0.7 8.1). What it adds to the library is what `hierarchical-requirement.des` says and
// FBL does not: the attributes' types and which hold many values, the binding types it maps as
// unreadable, the counter ids with their placeholders and marks (DESL 0.2 5.3.5), the assessments'
// ids by place, the enumerations' keys, and the members of the lists (DESL 0.2 5.5, 7.7.2). Of a
// fixture's findings the run compares those the library reports: the FBL codes and std.unparseable,
// std.unreadableEntry and std.duplicateId. The others are DESL's (a missing id, containment, a
// mention, a required value).

// ---- the specification (HierarchicalRequirementSpecification) ----

interface Definition {
  readonly metamodel: {
    readonly types: Readonly<Record<string, { readonly attributes?: Readonly<Record<string, { readonly type?: string; readonly many?: boolean }>> }>>;
    readonly enums: Readonly<Record<string, { readonly values: Readonly<Record<string, { readonly value?: string }>> }>>;
  };
  readonly persistence: {
    readonly typeMap: Readonly<Record<string, { readonly as: string }>>;
    readonly settings: Readonly<Record<string, { readonly key?: string; readonly value?: string; readonly initial?: readonly Readonly<Record<string, string>>[] }>>;
  };
}

let loaded: Definition | undefined;

/** `definitions/designers/hierarchical-requirement.des`, as copied from etalii.adp. */
const specification = (): Definition =>
  (loaded ??= JSON.parse(readFileSync(join(definitions, 'designers', 'hierarchical-requirement.des'), 'utf8')) as Definition);

const definitionOf = (type: string, attribute: string): { readonly type?: string; readonly many?: boolean } | undefined =>
  specification().metamodel.types[type]?.attributes?.[attribute];

export const requirementTypeOf = (type: string, attribute: string): string | undefined => definitionOf(type, attribute)?.type;

export const requirementMany = (type: string, attribute: string): boolean => definitionOf(type, attribute)?.many === true;

/** The binding types `persistence.typeMap` maps as unreadable. */
export const requirementUnreadableTypes = (): ReadonlySet<string> =>
  new Set(Object.entries(specification().persistence.typeMap).filter(([, entry]) => entry.as === 'unreadable').map(([name]) => name));

/** The reading's options for a body named `fileName`: the types, the many attributes and the unreadable types. */
export const requirementOptions = (fileName: string): FblOptions =>
  ({ fileName, attributeType: requirementTypeOf, many: requirementMany, unreadableTypes: requirementUnreadableTypes() });

/** The attributes the specification gives `type`, in its order. */
const attributesOf = (type: string): string[] => Object.keys(specification().metamodel.types[type]?.attributes ?? {});

const enumeration = (name: string): Readonly<Record<string, { readonly value?: string }>> | undefined => specification().metamodel.enums[name]?.values;

/** The key of the value of an enumeration stored as `stored`, as the model holds it; the stored form itself when none is. */
const enumerationKey = (values: Readonly<Record<string, { readonly value?: string }>>, stored: string): string =>
  Object.entries(values).find(([key, value]) => (value.value ?? key) === stored)?.[0] ?? stored;

/** The form the file stores the value `key` of an enumeration in. */
const enumerationStored = (values: Readonly<Record<string, { readonly value?: string }>>, key: string): string =>
  Object.hasOwn(values, key) ? values[key].value ?? key : key;

/** The initial members of the list `settings` keeps, by their name and value, in order. */
function initial(settings: string): BlockMember[] {
  const setting = specification().persistence.settings[settings];
  return (setting?.initial ?? []).map((member) => ({ key: member[setting.key!], value: member[setting.value!] }));
}

// ---- the derived ids (DerivedIds) ----

const lowerAscii = (text: string): string => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

/** The lists the registration keeps, each with the type and the id prefix of its members, and the attribute of an entry that implies one. */
const lists: readonly { readonly block: string; readonly type: string; readonly prefix: string; readonly attribute: string }[] = [
  { block: 'tags', type: 'Tag', prefix: 'tag/', attribute: 'tags' },
  { block: 'categories', type: 'Category', prefix: 'category/', attribute: 'category' },
  { block: 'states', type: 'State', prefix: 'state/', attribute: 'state' },
];

// ---- the document (HierarchicalRequirementDocument) ----

const item = 'Item';
const requirement = 'Requirement';
const libraryCodes = new Set(['std.unparseable', 'std.unreadableEntry', 'std.duplicateId']);
const writtenId = /^[ \t]*[-*+][ \t]+(\S+)/;
const counterId = /^(?:ITEM|REQ)-(\d+)$/;

const prefix = (type: string): string => (type === item ? 'ITEM-' : 'REQ-');
const counter = (type: string, number: number): string => `${prefix(type)}${String(number).padStart(4, '0')}`;
const numberOf = (id: unknown): number => (typeof id === 'string' ? Number(counterId.exec(id)?.[1] ?? 0) : 0);
const markOf = (type: string): string => (type === item ? 'lastItem' : 'lastRequirement');

/** An entry of the body with the id the designer gives it, and whether it was a placeholder. */
interface Entry {
  readonly element: FblElement;
  readonly id: string;
  readonly placeholder: boolean;
}

/** An element of a requirement document as the designer holds it. */
export interface DesignerElement {
  readonly id: string;
  readonly type: string;
  readonly parentId?: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

/** A file beside a registration: its name and its bytes. */
export interface BesideFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A fixture's value as the model has it: an integer is an int, any other number a double. */
function valueOf(value: unknown): unknown {
  if (typeof value === 'number') return Number.isInteger(value) ? BigInt(value) : value;
  if (Array.isArray(value)) return value.map(valueOf);
  return typeof value === 'string' || typeof value === 'boolean' ? value : null;
}

/** Text when it is text, and nothing when it is absent or null. */
const textOrNothing = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export class HierarchicalRequirementDocument {
  private constructor(private readonly body: OpenBody | undefined, private readonly registration: OpenRegistration | undefined) {
    if (!registration) return;
    registration.absentMembers = (block) => {
      if (!lists.some((list) => list.block === block)) return undefined;
      const members = this.members(block);
      return members.length > 0 ? members : undefined;
    };
    if (body) registration.knownIds = new Set(this.entries().map((entry) => entry.id));
  }

  /**
   * The input of a fixture: a body, or a registration (an `.adp` input) with the body `bodyOf` finds
   * beside it, when there is one (FBL 0.7 8.1).
   */
  static open(input: Uint8Array, inputName: string, binding: FblBinding, bodyOf: (registration: OpenRegistration) => BesideFile | undefined): HierarchicalRequirementDocument {
    if (!inputName.toLowerCase().endsWith('.adp')) return new HierarchicalRequirementDocument(OpenBody.open(input, binding, requirementOptions(inputName)), undefined);
    const registration = OpenRegistration.open(input, binding);
    const body = bodyOf(registration);
    return new HierarchicalRequirementDocument(body ? OpenBody.open(body.bytes, binding, requirementOptions(body.name)) : undefined, registration);
  }

  /** The bytes a step changes: the registration's when the input is one, else the body's. */
  get bytes(): Uint8Array {
    return (this.registration ?? this.body!).bytes;
  }

  get unreadable(): boolean {
    return this.body?.model.unreadable ?? false;
  }

  /**
   * The findings of the reading: the body's and the registration's. A placeholder is no duplicate to
   * DESL, which numbers it before ids are compared, so a duplicate the library reports at a
   * placeholder is left out.
   */
  findings(inputName: string): Finding[] {
    const findings: Finding[] = [];
    if (this.body) {
      const placeholders = new Set(this.entries().filter((entry) => entry.placeholder).map((entry) => entry.element.line));
      findings.push(...this.body.model.findings.filter((finding) => !(finding.code === 'std.duplicateId' && placeholders.has(finding.location.line))));
    }
    if (this.registration) findings.push(...this.registration.findings(inputName));
    return findings;
  }

  /** The document's elements as the designer has them: its entries by their ids, their values as it holds them, then the members of its lists and the stored filters. */
  elements(): DesignerElement[] {
    if (!this.body) return [];
    const entries = this.entries();
    const ids = new Map(entries.map((entry) => [entry.element.id, entry.id]));
    const collapsed = new Set((this.registration?.blockEntries('collapsed') ?? []).filter((entry) => entry.value === 'yes').map((entry) => entry.key));
    const elements: DesignerElement[] = entries.map(({ element, id }) => {
      const attributes: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(element.attributes)) attributes[name] = view(element.type, name, value);
      for (const name of attributesOf(element.type)) {
        if (attributes[name] !== undefined && attributes[name] !== null) continue;
        const type = requirementTypeOf(element.type, name);
        attributes[name] = requirementMany(element.type, name) ? [] : type === 'bool' ? false : type === 'string' || type === 'text' ? '' : null;
      }
      // Without a registration nothing is collapsed (DESL 0.2 7.7.1).
      if (element.type === item || element.type === requirement) attributes.collapsed = collapsed.has(id);
      const parentId = element.parentId === undefined ? undefined : ids.get(element.parentId) ?? element.parentId;
      return { id, type: element.type, parentId, attributes };
    });
    for (const list of lists) {
      for (const member of this.members(list.block)) {
        elements.push({ id: `${list.prefix}${lowerAscii(member.key)}`, type: list.type, attributes: { name: member.key, colour: member.value } });
      }
    }
    for (const filter of this.registration?.blockEntries('filters') ?? []) {
      elements.push({ id: `filter/${filter.key}`, type: 'Filter', attributes: { name: filter.key, query: filter.value } });
    }
    return elements;
  }

  /**
   * Plans and applies a fixture's edit, one change or a list of them, as one edit (FBL 6.4). A setting
   * goes to the registration. A change to a list member writes only the registration, which a body
   * subject does not have, so there it writes nothing. The first change that is no save also numbers
   * the placeholders and sets the marks (DESL 0.2 5.3.5).
   */
  change(edit: unknown): PlanResult {
    if (isObject(edit) && isObject(edit.setting)) return this.registration!.change(settingOf(edit.setting));
    if (!this.body) throw new Error('The fixture changes a body it does not have.');
    if (isObject(edit) && 'save' in edit) return this.body.change({ kind: 'save' });
    const entries = this.entries();
    const changes: ModelChange[] = [];
    const sets = new Map<string, Json>();
    const added: string[] = [];
    for (const part of Array.isArray(edit) ? edit : [edit]) {
      if (!isObject(part)) throw new Error(`Unknown fixture edit: ${JSON.stringify(part)}.`);
      if (isObject(part.set)) {
        const set = part.set;
        const entry = find(entries, set.element as string, typeof set.occurrence === 'number' ? set.occurrence : 1);
        if (!entry) continue;
        const attributes = sets.get(entry.element.id) ?? {};
        sets.set(entry.element.id, attributes);
        for (const [name, value] of Object.entries(set.attributes as Json)) attributes[name] = stored(entry.element.type, name, valueOf(value));
        if (typeof attributes.id === 'string') added.push(attributes.id);
      } else if (isObject(part.add)) {
        const add = part.add;
        const type = add.type as string;
        if (type !== item && type !== requirement && type !== 'Assessment') continue;
        const attributes: Json = {};
        for (const [name, value] of Object.entries((add.attributes ?? {}) as Json)) attributes[name] = stored(type, name, valueOf(value));
        if (type === 'Assessment') attributes.resolved ??= 'false';
        const id = type === 'Assessment' ? undefined : add.id as string;
        if (id !== undefined) added.push(id);
        changes.push({ kind: 'add', type, id, attributes, parent: library(entries, add.parent), position: positionOf(entries, add.position) });
      } else if (isObject(part.remove)) {
        const entry = find(entries, part.remove.element as string, 1);
        if (entry) changes.push({ kind: 'remove', id: entry.element.id });
      } else if (isObject(part.move)) {
        const moved = find(entries, part.move.element as string, 1)!;
        changes.push({ kind: 'move', id: moved.element.id, parent: library(entries, part.move.parent), position: positionOf(entries, part.move.position) });
      } else {
        throw new Error(`Unknown fixture edit: ${JSON.stringify(part)}.`);
      }
    }
    this.numbering(entries, sets, changes, added);
    changes.unshift(...[...sets].map(([id, attributes]): ModelChange => ({ kind: 'set', id, attributes })));
    return this.body.changeAll(changes);
  }

  undo(): UndoResult {
    return (this.registration ?? this.body!).undo();
  }

  redo(): UndoResult {
    return (this.registration ?? this.body!).redo();
  }

  /**
   * What the first edit writes besides itself (DESL 0.2 5.3.5): a number for every placeholder, the
   * next of its kind in reading order, and the marks, set to the last number given of each kind, by
   * setting the mark line or, when there is none, adding it. Only the mark of a kind this edit gives
   * a number to is set; the other is left as it is.
   */
  private numbering(entries: readonly Entry[], sets: Map<string, Json>, changes: ModelChange[], added: readonly string[]): void {
    const marks = this.body!.model.elements.find((element) => element.type === 'Marks');
    const given = new Map<string, number>();
    const give = (type: string, id: string): void => {
      given.set(type, Math.max(given.get(type) ?? 0, numberOf(id)));
    };
    for (const entry of entries.filter((candidate) => candidate.placeholder)) {
      const attributes = sets.get(entry.element.id) ?? {};
      sets.set(entry.element.id, attributes);
      attributes.id = entry.id;
      give(entry.element.type, entry.id);
    }
    for (const id of added) give(id.startsWith(prefix(item)) ? item : requirement, id);
    if (given.size === 0) return;
    const update: Json = {};
    for (const [type, number] of given) {
      const mark = markOf(type);
      const written = marks?.attributes[mark];
      const last = Math.max(number, numberOf(written), ...entries.filter((entry) => entry.element.type === type).map((entry) => numberOf(entry.id)), 0);
      if (written !== counter(type, last)) update[mark] = counter(type, last);
    }
    if (Object.keys(update).length === 0) return;
    if (!marks) changes.unshift({ kind: 'add', type: 'Marks', attributes: update });
    else sets.set(marks.id, update);
  }

  /**
   * The body's entries by the designer's ids: an item or a requirement by the id written on its line,
   * a placeholder by the number it is given, the next of its kind after the mark and every number the
   * document holds, in reading order; an assessment by its place. A duplicate keeps its written
   * number, which the library replaces by a place id.
   */
  private entries(): Entry[] {
    const model = this.body!.model;
    const lines = new TextDecoder().decode(this.body!.bytes).split('\n');
    const marks = model.elements.find((element) => element.type === 'Marks');
    const written = new Map<FblElement, string>();
    for (const element of model.elements) {
      if (element.type !== item && element.type !== requirement) continue;
      const line = element.line > 0 && element.line <= lines.length ? lines[element.line - 1] : '';
      written.set(element, writtenId.exec(line)?.[1] ?? element.id);
    }
    const highest = (type: string): number =>
      Math.max(numberOf(marks?.attributes[markOf(type)]), ...[...written].filter(([element]) => element.type === type).map(([, id]) => numberOf(id)), 0);
    const next = new Map([[item, highest(item)], [requirement, highest(requirement)]]);
    const entries: Entry[] = [];
    let assessments = 0;
    for (const element of model.elements) {
      if (element.type === item || element.type === requirement) {
        const id = written.get(element)!;
        if (id !== `${prefix(element.type)}NEW`) {
          entries.push({ element, id, placeholder: false });
          continue;
        }
        const number = next.get(element.type)! + 1;
        next.set(element.type, number);
        entries.push({ element, id: counter(element.type, number), placeholder: true });
      } else if (element.type === 'Assessment') {
        entries.push({ element, id: `assessment/${assessments++}`, placeholder: false });
      }
    }
    return entries;
  }

  /** The members of a list (DESL 0.2 5.5, 7.7.2): its block when there is one, else its initial members and then those the body implies, in their order. */
  private members(block: string): BlockMember[] {
    const kept = this.registration?.blockEntries(block);
    if (kept) return kept;
    const members = initial(block);
    const attribute = lists.find((list) => list.block === block)!.attribute;
    for (const element of this.body?.model.elements.filter((candidate) => candidate.type === item || candidate.type === requirement) ?? []) {
      const value = element.attributes[attribute];
      const names = Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : typeof value === 'string' ? [value] : [];
      for (const name of names) {
        if (members.every((member) => lowerAscii(member.key) !== lowerAscii(name))) members.push({ key: name, value: 'default' });
      }
    }
    return members;
  }
}

/** A fixture's `setting` edit as the model change it names (FBL 0.7 15.3). */
const settingOf = (setting: Json): ModelChange => ({
  kind: 'setting',
  block: setting.block as string,
  key: setting.key as string,
  value: textOrNothing(setting.value),
  position: setting.position as ChangePosition | undefined,
  rename: textOrNothing(setting.rename),
  remove: setting.remove === true,
});

const find = (entries: readonly Entry[], id: string, occurrence: number): Entry | undefined =>
  entries.filter((entry) => entry.id === id)[occurrence - 1];

/** The library's id of the element the designer knows as `id`; nothing for the top level. */
const library = (entries: readonly Entry[], id: unknown): string | undefined =>
  typeof id === 'string' ? find(entries, id, 1)?.element.id ?? id : undefined;

/** A fixture's position, its sibling named by the library's id (FBL 11.2). */
function positionOf(entries: readonly Entry[], position: unknown): ChangePosition | undefined {
  if (!isObject(position)) return undefined;
  if (typeof position.index === 'number') return { index: position.index };
  if (typeof position.after === 'string') return { after: library(entries, position.after)! };
  if (typeof position.before === 'string') return { before: library(entries, position.before)! };
  throw new Error(`Unknown fixture position: ${JSON.stringify(position)}.`);
}

/** A value as the designer holds it: an enumeration by its key, a bool as a bool. */
function view(type: string, attribute: string, value: unknown): unknown {
  const declared = requirementTypeOf(type, attribute);
  if (declared === undefined || typeof value !== 'string') return value;
  const values = enumeration(declared);
  if (values) return enumerationKey(values, value);
  return declared === 'bool' ? value === 'true' : value;
}

/** A value as the file stores it: an enumeration by its stored form, a bool as its text. */
function stored(type: string, attribute: string, value: unknown): unknown {
  const declared = requirementTypeOf(type, attribute);
  if (typeof value === 'boolean' && declared === 'bool') return value ? 'true' : 'false';
  const values = declared === undefined ? undefined : enumeration(declared);
  return values && typeof value === 'string' ? enumerationStored(values, value) : value;
}

// ---- the run's reading (HierarchicalRequirementFixtures.Tests.AssertRead) ----

/** What a fixture's `read` lists, for a requirement document (FBL 15.3). */
export interface RequirementRead {
  readonly unreadable?: boolean;
  readonly elements?: readonly { readonly id: string; readonly type: string; readonly parent?: string | null; readonly attributes?: Readonly<Record<string, unknown>> }[];
  readonly findings?: readonly { readonly rule: string; readonly line?: number }[];
}

const isLibrarys = (code: string): boolean => code.startsWith('fbl.') || libraryCodes.has(code);

/** Whether a value the designer holds is the one a fixture lists, in value and in JSON type; a list member by member. */
function same(expected: unknown, actual: unknown): boolean {
  if (expected === null) return actual === null || actual === undefined;
  if (typeof expected === 'number') return (typeof actual === 'bigint' || typeof actual === 'number') && Number(actual) === expected;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((member, at) => same(member, actual[at]));
  return actual === expected;
}

/**
 * Holds a requirement document's reading to what a fixture's `read` lists: each element, the n-th
 * of its id for the n-th time the fixture lists it, with its type, parent and attributes; and the
 * findings the library reports, exactly.
 */
export function expectRequirementRead(document: HierarchicalRequirementDocument, read: RequirementRead, name: string, inputName: string): void {
  if (read.unreadable !== undefined) expect(document.unreadable, `${name}: unreadable`).toBe(read.unreadable);
  const elements = document.elements();
  const seen = new Map<string, number>();
  for (const expected of read.elements ?? []) {
    const occurrence = (seen.get(expected.id) ?? 0) + 1;
    seen.set(expected.id, occurrence);
    const found = elements.filter((element) => element.id === expected.id)[occurrence - 1];
    expect(found, `${name}: no element '${expected.id}' (occurrence ${occurrence}) was read; read: ${elements.map((element) => `${element.id} (${element.type})`).join(', ')}`).toBeDefined();
    expect(found.type, `${name}: the type of '${expected.id}'`).toBe(expected.type);
    if (expected.parent !== undefined) expect(found.parentId, `${name}: the parent of '${expected.id}'`).toBe(expected.parent ?? undefined);
    for (const [attribute, value] of Object.entries(expected.attributes ?? {})) {
      expect(Object.hasOwn(found.attributes, attribute), `${name}: '${attribute}' of '${expected.id}' was not read`).toBe(true);
      expect(same(value, found.attributes[attribute]), `${name}: '${attribute}' of '${expected.id}' is ${JSON.stringify(found.attributes[attribute], (_key, held: unknown) => (typeof held === 'bigint' ? Number(held) : held))}, where the fixture reads ${JSON.stringify(value)}`).toBe(true);
    }
  }
  if (!read.findings) return;
  const listed = (code: string, line: number): string => `${code} on line ${line}`;
  const wanted = read.findings.filter((finding) => isLibrarys(finding.rule)).map((finding) => listed(finding.rule, finding.line ?? 0)).sort();
  const actual = document.findings(inputName).filter((finding) => isLibrarys(finding.code)).map((finding) => listed(finding.code, finding.location.line)).sort();
  expect(actual, `${name}: the findings the library reports`).toEqual(wanted);
}
