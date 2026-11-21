import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import type { TableView } from '../../../src/core/tool/tableView';
import { definitionOf, designerOf } from './support';

// A relation to another file (etalii.adp spec 080, FR-001, FR-003, FR-005; `knowledge.md`,
// "Relations and the steps that write two files"): the related rows are shown by their titles, as
// links, the target's rows are offered by title, and the two findings only a host raises are raised.

const type = designerOf(definitionOf('knowledge'), registry);
const read = (path: string): string => readFileSync(path, 'utf8');
const cities = read('examples/knowledge/cities.yaml');
const provinces = read('examples/knowledge/provinces.yaml');
const relations = 'fixtures/fbl/real-files/src/examples/designers/knowledge/relations';

const withProvinces = (text: string | null): Source => ({
  fileName: 'cities.yaml', text: cities,
  related: { 'provinces.yaml': text === null ? null : { fileName: 'provinces.yaml', text } },
});
const tableOf = (source: Source): TableView => type.view(source, {}) as TableView;
const cellOf = (view: TableView, row: string, property: string) => view.rows.find((candidate) => candidate.id === row)!.cells[property];

describe('a relation to another knowledge file', () => {
  it('names the files the document relates to, other than itself', () => {
    expect(type.related!({ fileName: 'cities.yaml', text: cities })).toEqual(['provinces.yaml']);
    expect(type.related!({ fileName: 'countries.yaml', text: read(`${relations}/countries.yaml`) })).toEqual(['regions.yaml']);
  });

  it('shows a related row by its title, as a link to it in its file', () => {
    const cell = cellOf(tableOf(withProvinces(provinces)), 'r1', 'p5');
    expect(cell.text).toBe('Noord-Holland');
    expect(cell.items.map((item) => [item.label, item.link])).toEqual([['Noord-Holland', { file: 'provinces.yaml', row: 'nh' }]]);
  });

  it('offers the rows of the target by title, and says that a cell holds one', () => {
    const property = tableOf(withProvinces(provinces)).properties.find((candidate) => candidate.id === 'p5')!;
    expect(property.single).toBe(true);
    expect(property.related?.slice(0, 3)).toEqual([{ id: 'nh', name: 'Noord-Holland' }, { id: 'zh', name: 'Zuid-Holland' }, { id: 'an', name: 'Antwerpen' }]);
  });

  it('follows the target where it changed', () => {
    const renamed = provinces.replace('text: Noord-Holland', 'text: North Holland');
    expect(cellOf(tableOf(withProvinces(renamed)), 'r1', 'p5').text).toBe('North Holland');
  });

  it('reports a target that is missing or is no knowledge file, on its property, and keeps the values', () => {
    for (const text of [null, 'just some notes\n']) {
      const source = withProvinces(text);
      expect(type.findings(source).filter((finding) => finding.rule === 'knowledge.unresolved-target')).toHaveLength(1);
      const cell = cellOf(tableOf(source), 'r1', 'p5');
      expect([cell.text, cell.items[0].link]).toEqual(['nh', undefined]);
    }
  });

  it('reports a value naming a row the target does not hold, on its cell, and keeps it', () => {
    const source = withProvinces(provinces.replace('- id: nh', '- id: gone'));
    const found = type.findings(source).filter((finding) => finding.rule === 'knowledge.unresolved-row');
    expect(found.map((finding) => finding.message)).toEqual(['nh is no row of provinces.yaml. The value is kept.']);
    const cell = cellOf(tableOf(source), 'r1', 'p5');
    expect([cell.text, cell.findings?.map((finding) => finding.message)]).toEqual(['nh', ['nh is no row of provinces.yaml. The value is kept.']]);
    expect(type.findings(withProvinces(provinces)).some((finding) => finding.rule.startsWith('knowledge.unresolved'))).toBe(false);
  });

  it('says nothing of another file where the host gives none, and shows the ids', () => {
    const source = { fileName: 'cities.yaml', text: cities };
    expect(type.findings(source).some((finding) => finding.rule.startsWith('knowledge.unresolved'))).toBe(false);
    expect(cellOf(tableOf(source), 'r1', 'p5').text).toBe('nh');
  });

  it('opens a related row where it lives, and writes nothing', () => {
    expect(type.edit(withProvinces(provinces), { kind: 'follow', file: 'provinces.yaml', row: 'nh' }, {}, false)).toEqual({ kind: 'open', path: 'provinces.yaml', select: 'nh' });
  });

  it('links a relation to the file itself in place, and one to another file by its title, in the relations example', () => {
    const regions: Source = {
      fileName: 'regions.yaml', text: read(`${relations}/regions.yaml`),
      related: { 'countries.yaml': { fileName: 'countries.yaml', text: read(`${relations}/countries.yaml`) } },
    };
    expect(cellOf(tableOf(regions), 'friesland', 'g-country').items.map((item) => [item.label, item.link])).toEqual([['Netherlands', { file: 'countries.yaml', row: 'nl' }]]);
    const countries: Source = { fileName: 'countries.yaml', text: read(`${relations}/countries.yaml`), related: { 'regions.yaml': regions } };
    const nl = cellOf(tableOf(countries), 'nl', 'c-part-of');
    expect(nl.items.map((item) => [item.label, item.link])).toEqual([['Benelux', { file: '.', row: 'benelux' }]]);
  });
});
