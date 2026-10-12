import { describe, expect, it } from 'vitest';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import type { FblModel } from '../../../src/core/fbl/model';
import { readBody } from '../../../src/core/fbl/rules/bodyReading';
import { describeStep, Fixture, fixtureNames, runStep, Subject } from './support/fixtures';
import { knowledgeTypes } from './support/knowledge';
import { ordinal } from './support/repository';

// The Knowledge designer's bindings and fixtures, copied from etalii.adp, read through the
// library: what each fixture's `read` says is read and nothing else is reported, an unchanged save
// writes nothing, the same table in YAML, JSON and XML is one model, and every edit step gives its
// splices and its document. Counterparts of standalone's Conformance/KnowledgeFixtures.Tests.cs
// and Conformance/KnowledgeFixtures.Steps.Tests.cs.
//
// The reading is told the specification's attribute types, from the copied knowledge.des: a
// binding does not carry them, and a cell whose number is not a number is an unreadable entry only
// to a reading that knows the value is to be a number.

/** The number of knowledge fixtures copied: another number means the enumeration broke. */
const copiedFixtures = 7;

/** The fixtures of the Knowledge designer, which are named for it. */
const fixtures = fixtureNames().filter((name) => name.startsWith('knowledge-'));

/**
 * How many steps of each fixture pass, and of how many. The record is what keeps the steps from
 * passing by running nothing: a fixture that lost its steps, or a runner that stopped early, gives
 * another number.
 */
const stepsThatPass: [name: string, passing: number, of: number][] = [
  ['knowledge-kept', 11, 11],
  ['knowledge-yaml', 150, 150],
  ['knowledge-json', 150, 150],
  ['knowledge-xml', 150, 150],
];

function open(name: string): { fixture: Fixture; body: OpenBody; input: Uint8Array } {
  const fixture = new Fixture(name);
  const input = fixture.input;
  return { fixture, body: OpenBody.open(input, fixture.binding, fixture.options), input };
}

/**
 * A model as what a format must not change: each element's id, type, parent, slot and values. A
 * value is compared by its written form, since XML holds every value as text and YAML and JSON
 * hold numbers and booleans as such.
 */
const shape = (model: FblModel): string[] =>
  model.elements.map((element) => {
    const values = Object.entries(element.attributes)
      .filter(([, value]) => value !== null && value !== undefined)
      .sort(([a], [b]) => ordinal(a, b))
      .map(([name, value]) => `${name}=${String(value)}`);
    return `${element.id} ${element.type} in ${element.parentId ?? '-'}/${element.parentSlot ?? '-'}: ${values.join(', ')}`;
  });

describe('the fixtures of the Knowledge designer', () => {
  it('the fixtures are found', () => {
    expect(fixtures).toHaveLength(copiedFixtures);
    expect(fixtures.filter((name) => !new Fixture(name).isKnowledge), 'fixtures of another binding').toEqual([]);
  });

  it('the specifications attribute types, are read', () => {
    // A reading told no type reports no mistyped value, so an empty table would pass every
    // fixture but the one that lists such a finding.
    expect(knowledgeTypes.count).toBeGreaterThan(20);
    expect(knowledgeTypes.of('Cell', 'number')).toBe('number');
    expect(knowledgeTypes.of('Cell', 'no such attribute')).toBeUndefined();
  });

  it.each(fixtures)('the fixture is read as it says: %s', (name) => {
    const { fixture, body } = open(name);
    const model = body.model;
    const read = fixture.read!;

    // Readable, and every element the fixture lists is read under that id and type.
    expect(model.unreadable).toBe(false);
    const found = model.elements.map((element) => `${element.id} (${element.type})`);
    for (const element of read.elements!) expect(found, 'the elements read').toContain(`${element.id} (${element.type})`);

    // The findings it lists and no others: a clean file is read without one.
    const listed = (read.findings ?? []).map((finding) => `${finding.rule} on line ${finding.line}`).sort(ordinal);
    expect(model.findings.map((finding) => `${finding.code} on line ${finding.location.line}`).sort(ordinal)).toEqual(listed);
  });

  it.each(fixtures)('saving without an edit, writes the bytes that were read: %s', (name) => {
    const { body, input } = open(name);
    const result = body.change({ kind: 'save' });
    expect(result).toEqual({ planned: { splices: [] } });
    expect(body.bytes).toEqual(input);
  });

  it.each(fixtures)('every byte of the input belongs to the reading: %s', (name) => {
    const { fixture, input } = open(name);
    const reading = readBody(input, fixture.binding, fixture.options);
    // The byte-coverage invariant of FBL 4.1.
    expect(reading.unreadable).toBeUndefined();
    expect(reading.family.unaccounted()).toEqual([]);
  });

  it('the same table in YAML JSON and XML, is one model', () => {
    // The definition's own example, once per format.
    const yaml = shape(open('knowledge-equivalence/yaml').body.model);
    const json = shape(open('knowledge-equivalence/json').body.model);
    const xml = shape(open('knowledge-equivalence/xml').body.model);

    // The same elements, in the same order, with the same parents and values.
    expect(yaml).not.toEqual([]);
    expect(json).toEqual(yaml);
    expect(xml).toEqual(yaml);
  });

  it.each(stepsThatPass)('the fixtures steps pass, as far as recorded: %s', (name, passing, of) => {
    const fixture = new Fixture(name);
    const subject = Subject.open(fixture);

    // Every step in order, until the first that fails.
    let passed = 0;
    let failure: string | undefined;
    for (const step of fixture.steps) {
      try {
        runStep(fixture, subject, step, `${name} step ${passed + 1} (${describeStep(step)})`);
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        break;
      }
      passed++;
    }

    // The fixture has the steps the record says, and exactly the recorded number pass.
    expect(fixture.steps).toHaveLength(of);
    expect(passed, passed < passing
      ? `${name}: only ${passed} of ${of} steps pass, where ${passing} did. The first failure:\n${failure}`
      : `${name}: ${passed} of ${of} steps pass, more than the ${passing} recorded. Raise the number in stepsThatPass. The first failure now:\n${failure ?? 'none'}`).toBe(passing);
  });
});
