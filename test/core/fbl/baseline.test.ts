import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import baseline from './baseline.json';
import { pathOf } from './support/repository';

// The 86 tests of standalone's FBL library at 25fc7b4a (etalii.adp spec 009,
// contracts/test-baseline.md) and the 46 it gained up to 5756a07 (spec 027), each with the test
// here that checks the same behaviour, or the reason it does not apply. Four tests of expressions
// left standalone's library with its evaluator and are kept, because this library kept its own. The names are fixed by their count for each of standalone's test files
// and by one digest over all of them, so an entry cannot be dropped, added or renamed unnoticed.
const namesDigest = '4fb5f7b82bbc1d0f93aed9b2ee73428145ce7ce0454ed8f5c7d31ca1889209e8';
const testsBySource: Record<string, number> = {
  'Bytes/BodyText.Tests.cs': 6,
  'Conformance/ConformanceFixtures.Tests.cs': 3,
  'Conformance/InsertEmptyFixtures.Tests.cs': 3,
  'Conformance/KnowledgeFixtures.Steps.Tests.cs': 1,
  'Conformance/KnowledgeFixtures.Tests.cs': 6,
  'Conformance/KnowledgeTemplates.Tests.cs': 2,
  'Expressions/Expressions.Tests.cs': 5,
  'History/History.Tests.cs': 6,
  'Loading/Loading.Tests.cs': 11,
  'Measurements/LargeTable.Tests.cs': 1,
  'Planning/InsertPlacement.Tests.cs': 1,
  'Plugins/PluginBody.Tests.cs': 5,
  'Plugins/PluginOnlyChanges.Tests.cs': 5,
  'Reading/Reading.Tests.cs': 13,
  'Reading/TypedValue.Tests.cs': 3,
  'RealFiles/DeclaredBodies.Tests.cs': 7,
  'RealFiles/ModuleCrossCheck.Tests.cs': 1,
  'RealFiles/Registrations.Tests.cs': 7,
  'Registration/Registration.Tests.cs': 15,
  'Routing/Routing.Tests.cs': 9,
  'Routing/Templates.Tests.cs': 5,
  'Yaml/YamlLevels.Tests.cs': 5,
  'Yaml/YamlScalars.Tests.cs': 4,
  'Yaml/YamlWriting.Tests.cs': 8,
};

interface Entry {
  source: string;
  test: string;
  file?: string;
  title?: string;
  notApplicable?: string;
}

const entries: Entry[] = baseline.tests;
const nameOf = (entry: Entry): string => `${entry.source}#${entry.test}`;
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('the test baseline', () => {
  it('has exactly the 132 names', () => {
    expect(baseline.baseline).toEqual({ repository: 'etalii.adp.ide.standalone', commit: '5756a07', tests: 132 });
    expect(entries).toHaveLength(132);
    const counted: Record<string, number> = {};
    for (const entry of entries) counted[entry.source] = (counted[entry.source] ?? 0) + 1;
    expect(counted).toEqual(testsBySource);
    const names = entries.map(nameOf).sort();
    expect(new Set(names).size).toBe(132);
    expect(createHash('sha256').update(names.join('\n')).digest('hex')).toBe(namesDigest);
  });

  it('each entry has a counterpart or a reason, never both', () => {
    const wrong = entries.filter((entry) => {
      const counterpart = Boolean(entry.file) && Boolean(entry.title);
      const reason = Boolean(entry.notApplicable?.trim());
      return counterpart === reason || Boolean(entry.file) !== Boolean(entry.title);
    });
    expect(wrong.map(nameOf)).toEqual([]);
  });

  it('a counterpart\'s title occurs in its file', () => {
    const texts = new Map<string, string>();
    const textOf = (file: string): string => {
      if (!texts.has(file)) texts.set(file, existsSync(pathOf(file)) ? readFileSync(pathOf(file), 'utf8') : '');
      return texts.get(file)!;
    };
    // The title opens a test's name: `it('<title>'`, or `it.each(...)('<title>: %s'`.
    const missing = entries
      .filter((entry) => entry.file && entry.title)
      .filter((entry) => !new RegExp(`\\)?\\((['"\`])${escaped(entry.title!)}[^'"\`]*\\1`).test(textOf(entry.file!)))
      .map((entry) => `${nameOf(entry)}: no test titled "${entry.title}" in ${entry.file}`);
    expect(missing).toEqual([]);
  });

  it('what does not apply is the cross-check, the recorded departures and the measurement', () => {
    expect(entries.filter((entry) => entry.notApplicable).map(nameOf).sort()).toEqual([
      'Conformance/InsertEmptyFixtures.Tests.cs#TheJsonFamilyDepartsFromTheFixtureOnlyAsRecorded',
      'Conformance/InsertEmptyFixtures.Tests.cs#TheTwoFamiliesWriteDifferentKeysForTheSameAdd',
      'Conformance/InsertEmptyFixtures.Tests.cs#TheYamlFamilyDepartsFromTheFixtureOnlyAsRecorded',
      'Measurements/LargeTable.Tests.cs#ATableOfTenThousandRows_IsOpenedAndEditedThroughTheBinding',
      'RealFiles/ModuleCrossCheck.Tests.cs#TheBindingReadsTheIdsTheModuleReads',
    ]);
  });
});
