import { describe, expect, it } from 'vitest';
import { readBody } from '../../../src/core/fbl/rules/bodyReading';
import { Fixture, fixtureNames, runStep, Subject } from './support/fixtures';

// Every round-trip fixture copied from etalii.adp, run through the library as FBL 15.3 says a host
// passes one: reading the input gives what `read` lists, and every step produces exactly its
// splices and its document, or its refusal with nothing written. Counterparts of standalone's
// Conformance/ConformanceFixtures.Tests.cs. Standalone leaves the two insert-empty fixtures out of
// its run; here they run like every other.

/** The number of fixtures copied when this suite was written: fewer means the enumeration broke. */
const minimumFixtures = 21;

const fixtures = fixtureNames();

describe('the round-trip fixtures of FBL', () => {
  it('the fixtures are found', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(minimumFixtures);
  });

  it.each(fixtures)('the fixture passes: %s', (name) => {
    const fixture = new Fixture(name);
    const subject = Subject.open(fixture);

    // The reading.
    if (fixture.read) subject.expectRead(fixture, fixture.read, name);

    // Every step.
    fixture.steps.forEach((step, index) => runStep(fixture, subject, step, `${name} step ${index + 1}`));
  });

  // The byte-coverage invariant of FBL 4.1. A registration is not read through a binding, so it is not
  // a case here, and nor is an input the fixture reads as unreadable (FBL 7.5), as standalone has it.
  it.each(fixtures.filter((name) => !new Fixture(name).isRegistration))('every byte of the input belongs to the reading: %s', (name) => {
    const fixture = new Fixture(name);
    const reading = readBody(fixture.input, fixture.binding, fixture.options);
    if (fixture.read?.unreadable === true) return;
    expect(reading.unreadable).toBeUndefined();
    expect(reading.family.unaccounted()).toEqual([]);
  });
});
