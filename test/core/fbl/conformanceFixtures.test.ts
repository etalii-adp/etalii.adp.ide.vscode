import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveReference } from '../../../src/core/fbl/documents/documentLoader';
import type { FblBinding } from '../../../src/core/fbl/documents/types';
import { nodeFiles } from '../../../src/core/fbl/files/nodeFiles';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import type { UndoResult } from '../../../src/core/fbl/history/splicedFile';
import type { FblModel } from '../../../src/core/fbl/model';
import type { ModelChange } from '../../../src/core/fbl/planning/modelChange';
import type { PlanResult } from '../../../src/core/fbl/planning/plan';
import { OpenRegistration } from '../../../src/core/fbl/registration/openRegistration';
import { readBody } from '../../../src/core/fbl/rules/bodyReading';
import type { FblSplice } from '../../../src/core/fbl/splice';
import { naturalIds } from './support/naturalIds';
import { bytesOf, conformance, ordinal, textOf, utf8 } from './support/repository';

// Every round-trip fixture copied from etalii.adp, run through the library as FBL 15.3 says a host
// passes one: reading the input gives what `read` lists, and every step produces exactly its
// splices and its document, or its refusal with nothing written. Counterparts of standalone's
// Conformance/ConformanceFixtures.Tests.cs.

/** The number of fixtures copied when this suite was written: fewer means the enumeration broke. */
const minimumFixtures = 8;

interface Step {
  edit?: Record<string, Record<string, unknown> | boolean>;
  undo?: boolean;
  redo?: boolean;
  refused?: string;
  splices: FblSplice[];
  expect?: string;
  expectFile?: string;
}

interface Fixture {
  binding: string;
  input: string;
  read?: { unreadable?: boolean; elements?: { id: string; type: string }[]; findings?: { rule: string; line?: number }[] };
  steps: Step[];
}

const folderOf = (name: string): string => join(conformance, 'fixtures', name);
const fixtures = readdirSync(join(conformance, 'fixtures')).sort(ordinal).filter((name) => existsSync(join(folderOf(name), 'fixture.json')));
const load = (name: string): Fixture => JSON.parse(textOf(bytesOf('fixtures/fbl/conformance/fixtures', name, 'fixture.json'))) as Fixture;
const isRegistration = (input: string): boolean => input.toLowerCase().endsWith('.adp');
const bindingOf = (name: string, fixture: Fixture): FblBinding => resolveReference(fixture.binding, join(folderOf(name), 'fixture.json'), nodeFiles);

/** A fixture's subject: a body read through its binding, or a registration (an `.adp` input). */
class Subject {
  private constructor(private readonly body?: OpenBody, private readonly registration?: OpenRegistration) {}

  static open(input: Uint8Array, name: string, binding: FblBinding): Subject {
    return isRegistration(name)
      ? new Subject(undefined, OpenRegistration.open(input))
      : new Subject(OpenBody.open(input, binding, { fileName: name, deriveId: naturalIds(binding.name) }));
  }

  get bytes(): Uint8Array {
    return (this.body ?? this.registration!).bytes;
  }

  get model(): FblModel | undefined {
    return this.body?.model;
  }

  change(change: ModelChange): PlanResult {
    return (this.body ?? this.registration!).change(change);
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

/** A fixture's value as the model has it: an integer is an int, any other number a double. */
function valueOf(value: unknown): unknown {
  if (typeof value === 'number') return Number.isInteger(value) ? BigInt(value) : value;
  if (Array.isArray(value)) return value.map(valueOf);
  return typeof value === 'string' || typeof value === 'boolean' ? value : null;
}

const attributesOf = (attributes: unknown): Record<string, unknown> =>
  Object.fromEntries(Object.entries((attributes ?? {}) as Record<string, unknown>).map(([name, value]) => [name, valueOf(value)]));

function changeOf(edit: NonNullable<Step['edit']>): ModelChange {
  if ('save' in edit) return { kind: 'save' };
  const set = edit.set as Record<string, unknown> | undefined;
  if (set) return { kind: 'set', id: set.element as string, attributes: attributesOf(set.attributes) };
  const add = edit.add as Record<string, unknown> | undefined;
  if (add) return { kind: 'add', type: add.type as string, id: add.id as string | undefined, attributes: attributesOf(add.attributes), parent: add.parent as string | undefined };
  const remove = edit.remove as Record<string, unknown> | undefined;
  if (remove) return { kind: 'remove', id: remove.element as string };
  const place = edit.place as Record<string, unknown> | undefined;
  if (place) return { kind: 'place', id: place.element as string, x: place.x as number, y: place.y as number };
  throw new Error(`Unknown fixture edit: ${JSON.stringify(edit)}.`);
}

function expectRead(model: FblModel, read: NonNullable<Fixture['read']>): void {
  if (read.unreadable !== undefined) expect(model.unreadable).toBe(read.unreadable);
  const found = model.elements.map((element) => `${element.id} (${element.type})`);
  for (const element of read.elements ?? []) expect(found, 'the elements read').toContain(`${element.id} (${element.type})`);
  for (const finding of read.findings ?? []) {
    const matching = model.findings.filter((candidate) => candidate.code === finding.rule && (finding.line === undefined || candidate.location.line === finding.line));
    expect(matching.length, `a finding ${finding.rule}${finding.line === undefined ? '' : ` on line ${finding.line}`}`).toBeGreaterThan(0);
  }
}

describe('the round-trip fixtures of FBL', () => {
  it('the fixtures are found', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(minimumFixtures);
  });

  it.each(fixtures)('the fixture passes: %s', (name) => {
    const fixture = load(name);
    const binding = bindingOf(name, fixture);
    const subject = Subject.open(bytesOf('fixtures/fbl/conformance/fixtures', name, fixture.input), fixture.input, binding);

    // The reading.
    if (fixture.read) expectRead(subject.model!, fixture.read);

    // Every step.
    fixture.steps.forEach((step, index) => {
      const label = `${name} step ${index + 1}`;
      const before = subject.bytes;
      let actual: readonly FblSplice[];
      if (step.undo) {
        actual = subject.undo(label);
      } else if (step.redo) {
        actual = subject.redo(label);
      } else {
        const result = subject.change(changeOf(step.edit!));
        if (step.refused !== undefined) {
          expect(result, label).toEqual({ refused: step.refused });
          expect(subject.bytes, `${label}: a refusal writes nothing`).toEqual(before);
          actual = [];
        } else {
          if ('refused' in result) throw new Error(`${label}: refused with '${result.refused}'.`);
          actual = result.planned.splices;
        }
      }
      expect(actual, `${label}: the splices`).toEqual(step.splices);
      const expected = step.expect !== undefined ? utf8(step.expect) : bytesOf('fixtures/fbl/conformance/fixtures', name, step.expectFile!);
      expect(textOf(subject.bytes), `${label}: the document`).toBe(textOf(expected));
      expect(subject.bytes, `${label}: the document's bytes`).toEqual(expected);
    });
  });

  // The byte-coverage invariant of FBL 4.1. A registration is not read through a binding, so it is not a case here.
  it.each(fixtures.filter((name) => !isRegistration(load(name).input)))('every byte of the input belongs to the reading: %s', (name) => {
    const fixture = load(name);
    const reading = readBody(bytesOf('fixtures/fbl/conformance/fixtures', name, fixture.input), bindingOf(name, fixture), { fileName: fixture.input });
    expect(reading.unreadable).toBeUndefined();
    expect(reading.family.unaccounted()).toEqual([]);
  });
});
