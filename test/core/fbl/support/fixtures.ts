import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { expect } from 'vitest';
import { resolveReference } from '../../../../src/core/fbl/documents/documentLoader';
import { findRule, type FblBinding } from '../../../../src/core/fbl/documents/types';
import { nodeFiles } from '../../../../src/core/fbl/files/nodeFiles';
import { OpenBody } from '../../../../src/core/fbl/history/openBody';
import type { UndoResult } from '../../../../src/core/fbl/history/splicedFile';
import type { FblModel, FblOptions } from '../../../../src/core/fbl/model';
import type { ChangePosition, ModelChange } from '../../../../src/core/fbl/planning/modelChange';
import type { PlanResult } from '../../../../src/core/fbl/planning/plan';
import { OpenRegistration } from '../../../../src/core/fbl/registration/openRegistration';
import type { FblSplice } from '../../../../src/core/fbl/splice';
import { definitions, knowledgeIds, knowledgeTypes } from './knowledge';
import { attributeTypes, naturalIds, timeAttributes, unsetsReferences } from './naturalIds';
import { conformance, filesBelow, textOf, utf8 } from './repository';

// The round-trip fixtures copied from etalii.adp (FBL 15.3), and how a host runs one: what
// conformanceFixtures.test.ts and knowledgeFixtures.test.ts share.

/** One step of a fixture: an edit, an undo or a redo, with the splices and the document it must give. */
export interface Step {
  readonly edit?: Record<string, Record<string, unknown> | boolean>;
  readonly undo?: boolean;
  readonly redo?: boolean;
  readonly refused?: string;
  readonly splices: readonly FblSplice[];
  readonly expect?: string;
  readonly expectFile?: string;
}

/** What reading a fixture's input yields. */
export interface Read {
  readonly unreadable?: boolean;
  readonly elements?: readonly { readonly id: string; readonly type: string; readonly attributes?: Readonly<Record<string, unknown>> }[];
  readonly findings?: readonly { readonly rule: string; readonly line?: number }[];
}

interface FixtureFile {
  readonly binding: string;
  readonly input: string;
  readonly read?: Read;
  readonly steps: readonly Step[];
}

const fixturesFolder = join(conformance, 'fixtures');
const fixtureFile = '/fixture.json';

/** Every copied fixture, by its folder under `fixtures/` with `/` between the segments, in ordinal order. */
export const fixtureNames = (): string[] =>
  filesBelow(fixturesFolder).filter((file) => file.endsWith(fixtureFile)).map((file) => file.slice(0, -fixtureFile.length));

/**
 * A file a fixture names, relative to its folder. A fixture of a tool type names its binding, and
 * sometimes its input, where etalii.adp keeps them, under `definitions/`, which is copied to
 * another place than its path from the fixture says: a path through `definitions/` whose file is
 * not where it points is read from the copy. The fixture itself is never edited.
 */
function located(folder: string, relative: string): string {
  const segments = relative.split('/');
  const written = resolve(folder, ...segments);
  const at = segments.indexOf('definitions');
  return at < 0 || existsSync(written) ? written : join(definitions, ...segments.slice(at + 1));
}

/** One fixture: its `fixture.json`, and the binding and the input it names. */
export class Fixture {
  readonly folder: string;
  readonly read?: Read;
  readonly steps: readonly Step[];
  /** The input's file name, without the path a fixture may give it. */
  readonly inputName: string;
  private readonly inputPath: string;
  private readonly bindingPath: string;
  private readonly bindingName: string;

  constructor(readonly name: string) {
    this.folder = join(fixturesFolder, ...name.split('/'));
    const file = JSON.parse(readFileSync(join(this.folder, 'fixture.json'), 'utf8')) as FixtureFile;
    this.read = file.read;
    this.steps = file.steps;
    this.inputPath = located(this.folder, file.input);
    this.inputName = basename(this.inputPath);
    const hash = file.binding.lastIndexOf('#');
    this.bindingPath = hash > 0 ? located(this.folder, file.binding.slice(0, hash)) : join(this.folder, 'fixture.json');
    this.bindingName = file.binding.slice(hash + 1);
  }

  /** A registration (an `.adp` input) is not read through a binding. */
  get isRegistration(): boolean {
    return this.inputName.toLowerCase().endsWith('.adp');
  }

  /** Whether the binding under test is one of the Knowledge designer's. */
  get isKnowledge(): boolean {
    return basename(this.bindingPath) === 'knowledge.fbl';
  }

  get binding(): FblBinding {
    return resolveReference(`#${this.bindingName}`, this.bindingPath, nodeFiles);
  }

  /** The binding's document as it is written, for the reasons it words itself. */
  get bindingText(): string {
    return readFileSync(this.bindingPath, 'utf8');
  }

  get input(): Uint8Array {
    return new Uint8Array(readFileSync(this.inputPath));
  }

  /**
   * What the host tells the reading, standing in for the tool type's specification: its id
   * derivations, and the attribute types (DESL) or the date and date-time attributes (DISL) that
   * FBL asks of the host.
   */
  get options(): FblOptions {
    const binding = this.binding.name;
    return this.isKnowledge
      ? { fileName: this.inputName, deriveId: knowledgeIds, attributeType: knowledgeTypes.of }
      : { fileName: this.inputName, deriveId: naturalIds(binding), timeAttributes: timeAttributes(binding), attributeType: attributeTypes(binding) };
  }

  file(name: string): Uint8Array {
    return new Uint8Array(readFileSync(join(this.folder, ...name.split('/'))));
  }
}

/** A fixture's subject: a body read through its binding, or a registration. */
export class Subject {
  private constructor(private readonly binding: FblBinding | undefined, private readonly body?: OpenBody, private readonly registration?: OpenRegistration) {}

  static open(fixture: Fixture): Subject {
    if (fixture.isRegistration) return new Subject(undefined, undefined, OpenRegistration.open(fixture.input));
    const binding = fixture.binding;
    return new Subject(binding, OpenBody.open(fixture.input, binding, fixture.options));
  }

  get bytes(): Uint8Array {
    return (this.body ?? this.registration!).bytes;
  }

  get model(): FblModel | undefined {
    return this.body?.model;
  }

  change(change: ModelChange): PlanResult {
    if (!this.body) return this.registration!.change(change);
    const unsets = change.kind === 'remove' ? this.unsets(change.id) : [];
    return unsets.length > 0 ? this.removeWith(change, unsets) : this.body.change(change);
  }

  /**
   * The keys DISL's default deletion policy clears when an element is removed: every reference to
   * it from an entry that does not go with it. A fixture of a tool type gives a removal as one
   * edit with those splices in it, because to its user it is one gesture; FBL itself only
   * cascades (FBL 6.2), so the runner supplies the policy as it supplies the derived ids.
   */
  private unsets(id: string): ModelChange[] {
    const binding = this.binding!;
    const model = this.body!.model;
    const removed = model.find(id);
    if (!unsetsReferences(binding.name) || !removed) return [];
    const cascade = findRule(binding, removed.rule)?.remove?.cascade ?? [];
    const unsets: ModelChange[] = [];
    for (const other of model.elements) {
      if (other.id === id || cascade.includes(other.rule) || other.parentId === id) continue;
      const cleared = (findRule(binding, other.rule)?.attributes ?? [])
        .filter(([name, attribute]) => attribute.reference?.to.includes(removed.rule) && other.attributes[name] === id)
        .map(([name]) => [name, null] as const);
      if (cleared.length > 0) unsets.push({ kind: 'set', id: other.id, attributes: Object.fromEntries(cleared) });
    }
    return unsets;
  }

  /** Plans the unsets and the removal against the body as it is, and applies them as one edit. */
  private removeWith(remove: ModelChange, unsets: readonly ModelChange[]): PlanResult {
    const splices: FblSplice[] = [];
    for (const change of [...unsets, remove]) {
      const planned = this.body!.plan(change);
      if ('refused' in planned) return planned;
      splices.push(...planned.planned.splices);
    }
    const edit = { splices: inBodyOrder(splices) };
    this.body!.apply(edit);
    return { planned: edit };
  }

  undo(label: string): readonly FblSplice[] {
    return done((this.body ?? this.registration!).undo(), label);
  }

  redo(label: string): readonly FblSplice[] {
    return done((this.body ?? this.registration!).redo(), label);
  }
}

function done(result: UndoResult, label: string): readonly FblSplice[] {
  if ('refused' in result) throw new Error(`${label}: refused with '${result.refused}'.`);
  return result.done;
}

/**
 * Splices in body order, those at one offset kept as listed. FBL gives an order only to splices at
 * the same offset (FBL 6.5): a fixture lists an edit's splices in the order the edit made them, a
 * cascaded removal bottom-up, where the library lists every edit in body order. The two say the
 * same edit.
 */
const inBodyOrder = (splices: readonly FblSplice[]): FblSplice[] =>
  splices.map((splice, at) => ({ splice, at })).sort((a, b) => a.splice.start - b.splice.start || a.at - b.at).map((listed) => listed.splice);

/** A fixture's value as the model has it: an integer is an int, any other number a double. */
function valueOf(value: unknown): unknown {
  if (typeof value === 'number') return Number.isInteger(value) ? BigInt(value) : value;
  if (Array.isArray(value)) return value.map(valueOf);
  return typeof value === 'string' || typeof value === 'boolean' ? value : null;
}

const attributesOf = (attributes: unknown): Record<string, unknown> =>
  Object.fromEntries(Object.entries((attributes ?? {}) as Record<string, unknown>).map(([name, value]) => [name, valueOf(value)]));

/** Text when it is text, and nothing when it is absent or null (a move's `parent` is null for the top level). */
const textOrNothing = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/**
 * A step's edit as the model change it names (FBL 15.3). A `position` is passed on as it is
 * written: it is section 11.2's, an index counted once a moved element is taken out.
 */
export function changeOf(edit: NonNullable<Step['edit']>): ModelChange {
  if ('save' in edit) return { kind: 'save' };
  const part = (name: string): Record<string, unknown> | undefined => edit[name] as Record<string, unknown> | undefined;
  const set = part('set');
  if (set) return { kind: 'set', id: set.element as string, attributes: attributesOf(set.attributes) };
  const add = part('add');
  if (add) {
    return {
      kind: 'add',
      type: add.type as string,
      id: textOrNothing(add.id),
      attributes: attributesOf(add.attributes),
      parent: textOrNothing(add.parent),
      position: add.position as ChangePosition | undefined,
      slot: textOrNothing(add.slot),
    };
  }
  const move = part('move');
  if (move) {
    return { kind: 'move', id: move.element as string, parent: textOrNothing(move.parent), position: move.position as ChangePosition | undefined };
  }
  const remove = part('remove');
  if (remove) return { kind: 'remove', id: remove.element as string };
  const place = part('place');
  if (place) return { kind: 'place', id: place.element as string, x: place.x as number, y: place.y as number };
  throw new Error(`Unknown fixture edit: ${JSON.stringify(edit)}.`);
}

/** How a step reads in a message: its edit, or that it is an undo or a redo. */
export const describeStep = (step: Step): string => (step.edit ? JSON.stringify(step.edit) : step.undo ? 'undo' : 'redo');

/**
 * Whether a value read is the one a fixture lists, in value and in JSON type (FBL 15.3): a JSON
 * string for a text, and a JSON number, bool or null otherwise.
 */
function isValue(actual: unknown, expected: unknown): boolean {
  if (expected === null) return actual === null || actual === undefined;
  if (typeof expected === 'number') return (typeof actual === 'bigint' || typeof actual === 'number') && Number(actual) === expected;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((item, at) => isValue(actual[at], item));
  return actual === expected;
}

/** Holds a reading to what a fixture's `read` lists (FBL 15.3). */
export function expectRead(model: FblModel, read: Read, name: string): void {
  if (read.unreadable !== undefined) expect(model.unreadable, `${name}: unreadable`).toBe(read.unreadable);
  const found = model.elements.map((element) => `${element.id} (${element.type})`);
  for (const element of read.elements ?? []) {
    expect(found, `${name}: the elements read`).toContain(`${element.id} (${element.type})`);
    // Each attribute named has that value and that JSON type; attributes not named are not compared.
    const attributes = model.find(element.id)!.attributes;
    for (const [attribute, value] of Object.entries(element.attributes ?? {})) {
      expect(isValue(attributes[attribute], value), `${name}: ${element.id}.${attribute} is read as ${String(attributes[attribute])}, not ${JSON.stringify(value)}`).toBe(true);
    }
  }
  if (!read.findings) return;
  // A fixture that lists no finding says the reading has none: a reference that does not resolve,
  // an entry without its id, would each be one.
  if (read.findings.length === 0) expect(model.findings.map((finding) => `${finding.code} ${finding.message}`), `${name}: the fixture expects no finding`).toEqual([]);
  for (const finding of read.findings) {
    const matching = model.findings.filter((candidate) => candidate.code === finding.rule && (finding.line === undefined || candidate.location.line === finding.line));
    expect(matching.length, `${name}: a finding ${finding.rule}${finding.line === undefined ? '' : ` on line ${finding.line}`}`).toBeGreaterThan(0);
  }
}

/**
 * Runs one step and holds it to the fixture: exactly its splices and its document, or its refusal
 * with nothing written. A step that names no document expects the one it started from.
 */
export function runStep(fixture: Fixture, subject: Subject, step: Step, label: string): void {
  const before = subject.bytes;
  let actual: readonly FblSplice[];
  if (step.undo) {
    actual = subject.undo(label);
  } else if (step.redo) {
    actual = subject.redo(label);
  } else {
    const result = subject.change(changeOf(step.edit!));
    if (step.refused !== undefined) {
      if (!('refused' in result)) throw new Error(`${label}: planned, where the fixture refuses with '${step.refused}'.`);
      // The text of `refused` is informative: FBL leaves a refusal's wording to the host except
      // where the binding gives the reason itself, and then it is that reason (FBL 15.3).
      if (fixture.bindingText.includes(step.refused)) expect(result.refused, label).toBe(step.refused);
      expect(result.refused.trim(), `${label}: refused without a reason`).not.toBe('');
      expect(subject.bytes, `${label}: a refusal writes nothing`).toEqual(before);
      actual = [];
    } else {
      if ('refused' in result) throw new Error(`${label}: refused with '${result.refused}'.`);
      actual = result.planned.splices;
    }
  }
  expect(actual, `${label}: the splices`).toEqual(inBodyOrder(step.splices));
  const expected = step.expect !== undefined ? utf8(step.expect) : step.expectFile !== undefined ? fixture.file(step.expectFile) : before;
  expect(textOf(subject.bytes), `${label}: the document`).toBe(textOf(expected));
  expect(subject.bytes, `${label}: the document's bytes`).toEqual(expected);
}
