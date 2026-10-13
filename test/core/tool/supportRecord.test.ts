import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conformance, dislMinor, supportedFeatures } from '../../../src/core/disl/support';
import { carried } from '../../../src/core/plugins/index';
import { allFolders, at, specificationOf } from './support';

// The support record says what the code does (etalii.adp spec 027, contracts/support-record.md,
// "What keeps it true"): its features are those the interpreter lists, its plugins those the
// registry holds, and its tool types those under definitions/, each read both ways.

const record = 'docs/disl-support.md';

/** The headings of the record at a level, in order. */
const headings = (text: string, level: number): string[] =>
  text.split(/\r?\n/).filter((line) => line.startsWith(`${'#'.repeat(level)} `)).map((line) => line.slice(level + 1).trim());

/** The text under a heading, up to the next heading of its level or a higher one. */
function section(text: string, level: number, heading: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(`${'#'.repeat(level)} ${heading}`);
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^#{1,6} /.test(line) && line.indexOf(' ') <= level);
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

/** The rows of the tables of a text, each as its cells, without the heading row and the rule under it. */
const rows = (text: string): string[][] =>
  text.split('\n').filter((line) => line.startsWith('|')).map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells, index, all) => !cells.every((cell) => /^:?-+:?$/.test(cell)) && !all[index + 1]?.every((cell) => /^:?-+:?$/.test(cell)));

/** A cell that is one name in backticks, as that name. */
const named = (cell: string): string | undefined => /^`([^`]+)`$/.exec(cell)?.[1];

describe('the support record', () => {
  const text = readFileSync(record, 'utf8');

  it('has the sections of its contract, in their order', () => {
    expect(headings(text, 2)).toEqual([
      'Versions', 'Conformance class and features', 'What is read of each section', 'Plugins', 'Code for one tool type',
      'What this host decides', 'Differences from each definition', 'Differences raised and not settled here',
    ]);
  });

  it('states the version of DISL the interpreter reads', () => {
    const versions = rows(section(text, 2, 'Versions'));
    expect(versions.find((cells) => cells[0] === 'DISL')?.[1]).toBe(`0.${dislMinor}`);
  });

  describe('its features', () => {
    const listed = rows(section(text, 2, 'Conformance class and features'));

    it('are the features the interpreter supports, each a row and each row a feature', () => {
      expect(supportedFeatures.length).toBeGreaterThan(0);
      expect(listed.map((cells) => named(cells[0])).sort()).toEqual([...supportedFeatures].sort());
    });

    it('each say what is built', () => {
      expect(listed.filter((cells) => (cells[1] ?? '') === '').map((cells) => cells[0])).toEqual([]);
    });

    it('come with the conformance class the interpreter states', () => {
      expect(section(text, 2, 'Conformance class and features')).toContain(`The conformance class is \`${conformance}\`.`);
    });
  });

  describe('its plugins', () => {
    const listed = rows(section(text, 2, 'Plugins'));
    const registered = [
      ...carried.persistence.map((plugin) => [plugin.id, 'persistence']),
      ...carried.layout.map((plugin) => [plugin.id, 'layout']),
      ...carried.action.map((plugin) => [plugin.id, 'action']),
    ].sort();

    it('are the plugins the registry holds, each a row with what it provides and each row a plugin', () => {
      expect(listed.map((cells) => [named(cells[0]), cells[1]]).sort()).toEqual(registered);
    });

    it('say what happens for a plugin that is named and not carried', () => {
      expect(section(text, 2, 'Plugins')).toContain('`std.pluginMissing`');
    });
  });

  describe('its differences from each definition', () => {
    const subsections = headings(section(text, 2, 'Differences from each definition'), 3);
    // A tool type is named by the one display name its definition gives it.
    const displayNames = [...allFolders().keys()].map((folder) => String(at(specificationOf(folder), 'language', 'label')));

    it('have one subsection for each folder of definitions/, by its display name, and no other', () => {
      expect(displayNames.length).toBeGreaterThan(0);
      expect([...subsections].sort()).toEqual([...displayNames].sort());
    });

    it('each list its differences, or say that there is none', () => {
      const body = section(text, 2, 'Differences from each definition');
      expect(subsections.filter((name) => section(body, 3, name).trim() === '')).toEqual([]);
    });
  });

  describe('its differences raised and not settled here', () => {
    /** The numbers of the issues of etalii.adp a text links. */
    const issues = (part: string): string[] => [...part.matchAll(/etalii\.adp\/issues\/(\d+)/g)].map((match) => match[1]);
    const raised = rows(section(text, 2, 'Differences raised and not settled here'));

    it('are one row for each issue, its number first and what it is about beside it', () => {
      expect(raised.length).toBeGreaterThan(0);
      expect(raised.filter((cells) => cells.length !== 2 || issues(cells[0]).length !== 1 || cells[1] === '')).toEqual([]);
      const numbers = raised.flatMap((cells) => issues(cells[0]));
      expect(numbers).toEqual([...new Set(numbers)]);
    });

    it('hold every issue a difference names, and no table of differences holds a row of them', () => {
      const differences = section(text, 2, 'Differences from each definition');
      const numbers = new Set(raised.flatMap((cells) => issues(cells[0])));
      expect([...new Set(issues(differences))].filter((number) => !numbers.has(number))).toEqual([]);
      expect(rows(differences).filter((cells) => issues(cells[0]).length > 0)).toEqual([]);
    });
  });
});
