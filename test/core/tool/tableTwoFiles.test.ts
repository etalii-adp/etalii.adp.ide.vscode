import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EditOutcome, Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import type { TableRequest } from '../../../src/core/tool/tableView';
import { movedName, relativePath } from '../../../src/core/tool/toolTypeFrom';
import { applied, definitionOf, designerOf, refusal, spliced } from './support';

// The steps of the Knowledge designer that write two files (etalii.adp spec 080, FR-007, FR-008;
// `knowledge.md`, "Relations and the steps that write two files"): both files' changes planned
// first, given as one outcome, and neither when either is refused.

const type = designerOf(definitionOf('knowledge'), registry);
// The examples are written with CRLF; these steps are read as LF, so that the expected texts are short.
const read = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const folder = 'fixtures/fbl/real-files/src/examples/designers/knowledge/relations';
const cities = read('examples/knowledge/cities.yaml');
const provinces = read('examples/knowledge/provinces.yaml');
const op = (operation: string, on: readonly string[], args: Readonly<Record<string, string>>): TableRequest => ({ kind: 'operation', operation, on, args });

const citiesWith = (text: string | null): Source => ({
  fileName: '/work/cities.yaml', text: cities,
  related: { 'provinces.yaml': text === null ? null : { fileName: '/work/provinces.yaml', text } },
});
const regions = (): Source => ({
  fileName: '/work/regions.yaml', text: read(`${folder}/regions.yaml`),
  related: { 'countries.yaml': { fileName: '/work/countries.yaml', text: read(`${folder}/countries.yaml`) } },
});
const countries = (): Source => ({
  fileName: '/work/countries.yaml', text: read(`${folder}/countries.yaml`),
  related: { 'regions.yaml': { fileName: '/work/regions.yaml', text: read(`${folder}/regions.yaml`) } },
});

/** Both files after an outcome: this one, and the other it names. */
function both(source: Source, outcome: EditOutcome, file: string): [string, string] {
  const done = applied(outcome);
  const other = done.others?.find((candidate) => candidate.file === file);
  return [spliced(source.text, done.splices), spliced(source.related![file]!.text, other?.splices ?? [])];
}
const ids = (text: string): string[] => [...text.matchAll(/^ {2}- id: ([0-9a-z]{25})$/gm)].map((match) => match[1]);

describe('a two-way relation made', () => {
  it('adds the property here with its counterpart, and the computed other side in the target, naming this file back', () => {
    const source = citiesWith(provinces);
    const [here, there] = both(source, type.edit(source, op('createRelation', [], { name: 'Seat of', targetFile: 'provinces.yaml', limit: 'none', counterpartName: 'Seats' }), {}, false), 'provinces.yaml');
    const mine = ids(here).find((id) => !cities.includes(id))!;
    const theirs = ids(there).find((id) => !provinces.includes(id))!;
    expect(here).toContain(`  - id: ${mine}\n    name: Seat of\n    type: relation\n    target: provinces.yaml\n    counterpart: ${theirs}\n`);
    expect(there).toBe(provinces.replace('views:\n', `  - id: ${theirs}\n    name: Seats\n    type: relation\n    target: cities.yaml\n    counterpart: ${mine}\n    computed: true\nviews:\n`));
  });

  it('names its other side uniquely among the target\'s properties', () => {
    const source = citiesWith(provinces);
    const [, there] = both(source, type.edit(source, op('createRelation', [], { name: 'Seat of', targetFile: 'provinces.yaml', counterpartName: 'name' }), {}, false), 'provinces.yaml');
    expect(there).toContain('    name: name 2\n');
  });

  it('writes neither file when the target cannot be read', () => {
    const source = citiesWith(null);
    expect(refusal(type.edit(source, op('createRelation', [], { name: 'Seat of', targetFile: 'provinces.yaml', counterpartName: 'Seats' }), {}, false)))
      .toBe('provinces.yaml is missing, cannot be read or is not a knowledge file, so neither file is changed.');
  });

  it('is one file\'s step when it relates to the file itself, with both sides in it', () => {
    const source = citiesWith(provinces);
    const done = applied(type.edit(source, op('createRelation', [], { name: 'Rival of', targetFile: '.', counterpartName: 'Rivalled by' }), {}, false));
    expect(done.others).toBeUndefined();
    const text = spliced(cities, done.splices);
    expect(text).toMatch(/ {4}name: Rival of\n {4}type: relation\n {4}target: \.\n {4}counterpart: [0-9a-z]{25}\n/);
    expect(text).toMatch(/ {4}name: Rivalled by\n {4}type: relation\n {4}target: \.\n {4}counterpart: [0-9a-z]{25}\n {4}computed: true\n/);
  });

  it('stays one-way, in one file, without a name for its other side', () => {
    const source = citiesWith(provinces);
    expect(applied(type.edit(source, op('createRelation', [], { name: 'Seat of', targetFile: 'provinces.yaml' }), {}, false)).others).toBeUndefined();
  });
});

describe('one side of a two-way relation deleted', () => {
  it('asks what becomes of the other side, and writes nothing until it is chosen', () => {
    const source = regions();
    expect(refusal(type.edit(source, op('deleteProperty', ['g-country'], {}), {}, true))).toBe('Choose whether the other side of the relation goes too or stays as a one-way relation.');
  });

  it('deletes the other side too, as one step over both files', () => {
    const source = regions();
    const [here, there] = both(source, type.edit(source, op('deleteProperty', ['g-country'], { otherSide: 'delete' }), {}, true), 'countries.yaml');
    expect(here).not.toContain('g-country');
    expect(there).toBe(source.related!['countries.yaml']!.text.replace('  - id: c-regions\n    name: Regions\n    type: relation\n    target: regions.yaml\n    counterpart: g-country\n    computed: true\n', ''));
  });

  it('keeps the other side as a one-way relation that holds, as its own, the values it showed', () => {
    const source = regions();
    const [, there] = both(source, type.edit(source, op('deleteProperty', ['g-country'], { otherSide: 'keep' }), {}, true), 'countries.yaml');
    expect(there).toContain('  - id: c-regions\n    name: Regions\n    type: relation\n    target: regions.yaml\nviews:\n');
    expect(there).toMatch(/ {2}- id: nl\n(?: {4}.*\n| {6}.*\n| {8}.*\n| {10}.*\n)*? {6}- property: c-regions\n {8}rows:\n {10}- row: friesland\n {10}- row: limburg-nl\n/);
  });

  it('keeps a side that holds its values, which only stops naming the side that goes', () => {
    const source = countries();
    const [here, there] = both(source, type.edit(source, op('deleteProperty', ['c-regions'], { otherSide: 'keep' }), {}, true), 'regions.yaml');
    expect(here).not.toContain('c-regions');
    expect(there).toBe(source.related!['regions.yaml']!.text.replace('    limit: one\n    counterpart: c-regions\n', '    limit: one\n'));
  });
});

describe('how a file names another', () => {
  it('is the path from its own folder, with forward slashes, and . for itself', () => {
    expect(relativePath('/work/cities.yaml', '/work/provinces.yaml')).toBe('provinces.yaml');
    expect(relativePath('/work/a/cities.yaml', '/work/b/provinces.yaml')).toBe('../b/provinces.yaml');
    expect(relativePath('C:\\work\\cities.yaml', 'C:\\work\\sub\\provinces.yaml')).toBe('sub/provinces.yaml');
    expect(relativePath('/work/cities.yaml', '/work/cities.yaml')).toBe('.');
  });
});

describe('the gestures of a two-way relation', () => {
  it('ask for the target of a new relation among the knowledge files, this file first', () => {
    const view = type.view({ ...citiesWith(provinces), peers: ['provinces.yaml', 'sub/towns.yaml'] }, {});
    const target = view.operations.createRelation.params.find((param) => param.name === 'targetFile')!;
    expect([target.control, target.value, target.options]).toEqual(['choice', undefined, [{ value: '.', label: 'This file' }, { value: 'provinces.yaml', label: 'provinces.yaml' }, { value: 'sub/towns.yaml', label: 'sub/towns.yaml' }]]);
    expect(view.operations.createRelation.params.map((param) => param.name)).toEqual(['name', 'targetFile', 'limit', 'counterpartName']);
  });

  it('offer, for deleting one side, the choice between deleting both and keeping the other one-way', () => {
    const menu = type.view(regions(), {}).gestures!.columnMenus!['g-country'].flat();
    const remove = menu.find((entry) => entry.id === 'delete')!;
    expect(remove.entries!.map((entry) => [entry.label, entry.request])).toEqual([
      ['Delete both sides', op('deleteProperty', ['g-country'], { otherSide: 'delete' })],
      ['Keep the other side as a one-way relation', op('deleteProperty', ['g-country'], { otherSide: 'keep' })],
    ]);
    expect(type.view(regions(), {}).gestures!.columnMenus!['g-neighbour'].flat().find((entry) => entry.id === 'delete')!.request).toEqual(op('deleteProperty', ['g-neighbour'], {}));
  });
});

describe('rows deleted that rows of other files relate to', () => {
  const provincesWith = (peers: readonly string[]): Source => ({
    fileName: '/work/provinces.yaml', text: provinces, peers,
    related: { 'cities.yaml': { fileName: '/work/cities.yaml', text: cities } },
  });

  it('says first how many relate to them, and goes ahead once confirmed', () => {
    const source = provincesWith(['cities.yaml']);
    const asked = type.edit(source, op('deleteRows', ['nh'], {}), {}, false);
    expect(asked).toEqual({ kind: 'confirm', title: 'Delete row', confirmLabel: 'Delete', danger: true,
      message: '1 row in another table relates to this row. Deleting it leaves that relation pointing at nothing.' });
    expect(spliced(provinces, applied(type.edit(source, op('deleteRows', ['nh'], {}), {}, true)).splices)).not.toContain('- id: nh\n');
  });

  it('asks nothing where no row of another file relates to them', () => {
    expect(applied(type.edit(provincesWith([]), op('deleteRows', ['nh'], {}), {}, false)).splices.length).toBeGreaterThan(0);
    expect(applied(type.edit(provincesWith(['cities.yaml']), op('deleteRows', ['an'], {}), {}, false)).splices.length).toBeGreaterThan(0);
  });
});


describe('a relation\'s file renamed or moved', () => {
  it('is named anew in each document that names it, in one file\'s step', () => {
    const source = citiesWith(provinces);
    const splices = type.retargeted!(source, movedName('/work/cities.yaml', [{ from: '/work/provinces.yaml', to: '/work/regions/provinces.yaml' }]))!;
    expect(spliced(cities, splices)).toBe(cities.replace('target: provinces.yaml', 'target: regions/provinces.yaml'));
  });

  it('is named anew where the document moves, and not where both move together', () => {
    expect(movedName('/work/a/cities.yaml', [{ from: '/work/a/cities.yaml', to: '/work/b/cities.yaml' }])('provinces.yaml')).toBe('../a/provinces.yaml');
    expect(movedName('/work/a/cities.yaml', [{ from: '/work/a', to: '/work/c' }])('provinces.yaml')).toBeUndefined();
    expect(movedName('/work/a/cities.yaml', [{ from: '/work/a/provinces.yaml', to: '/work/p.yaml' }])('../a/provinces.yaml')).toBe('../p.yaml');
    expect(movedName('/work/cities.yaml', [{ from: '/work/other.yaml', to: '/work/x.yaml' }])('provinces.yaml')).toBeUndefined();
  });

  it('changes nothing where no relation names a file that moved', () => {
    expect(type.retargeted!(citiesWith(provinces), () => undefined)).toEqual([]);
  });
});

describe('a relation edited', () => {
  it('shows its file, its limit and whether it is two-way, in its column menu', () => {
    const menu = type.view(citiesWith(provinces), {}).gestures!.columnMenus!.p5.flat();
    const edit = menu.find((entry) => entry.id === 'relation')!;
    expect(edit.entries!.map((entry) => [entry.label, entry.checked ?? null, entry.disabled !== undefined])).toEqual([
      ['Related to provinces.yaml', null, true], ['No limit', false, false], ['1 row', true, false], ['Two-way relation', false, false],
    ]);
    expect(type.view(countries(), {}).gestures!.columnMenus!['c-regions'].flat().some((entry) => entry.id === 'relation')).toBe(false);
  });

  it('changes its limit in this file alone', () => {
    const source = citiesWith(provinces);
    const done = applied(type.edit(source, op('setRelationLimit', ['p5'], { limit: 'none' }), {}, false));
    expect(done.others).toBeUndefined();
    expect(spliced(cities, done.splices)).toBe(cities.replace('    target: provinces.yaml\n    limit: one\n', '    target: provinces.yaml\n'));
  });

  it('is made two-way with its other side in the target, called after this table', () => {
    const source = citiesWith(provinces);
    const [here, there] = both(source, type.edit(source, { kind: 'operation', operation: 'setRelationOtherSide', on: ['p5'], args: { twoWay: true } }, {}, false), 'provinces.yaml');
    const theirs = ids(there).find((id) => !provinces.includes(id))!;
    expect(here).toBe(cities.replace('    limit: one\n', `    limit: one\n    counterpart: ${theirs}\n`));
    expect(there).toBe(provinces.replace('views:\n', `  - id: ${theirs}\n    name: Cities\n    type: relation\n    target: cities.yaml\n    counterpart: p5\n    computed: true\nviews:\n`));
  });

  it('is made one-way, its other side removed from the target', () => {
    const source = regions();
    const [here, there] = both(source, type.edit(source, { kind: 'operation', operation: 'setRelationOtherSide', on: ['g-country'], args: { twoWay: false } }, {}, false), 'countries.yaml');
    expect(here).toBe(source.text.replace('    counterpart: c-regions\n', ''));
    expect(there).toBe(source.related!['countries.yaml']!.text.replace('  - id: c-regions\n    name: Regions\n    type: relation\n    target: regions.yaml\n    counterpart: g-country\n    computed: true\n', ''));
  });

  it('refuses on the other side of a two-way relation', () => {
    expect(refusal(type.edit(countries(), op('setRelationLimit', ['c-regions'], { limit: 'one' }), {}, false))).toBe('That property is not a relation of this table\'s own.');
  });
});
