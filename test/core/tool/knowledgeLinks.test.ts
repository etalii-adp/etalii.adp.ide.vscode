import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LinkWorkspace } from '../../../src/core/fbl/links/workspace';
import type { Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import type { TableRequest } from '../../../src/core/tool/tableView';
import { applied, definitionOf, designerOf, spliced } from './support';

// A knowledge file in a workspace of links (etalii.adp spec 089; `knowledge.md`, section 5; FBL 17.4): a file made
// before links is converted once on load, and that conversion is written with its first edit, in the same step. The
// workspace is etalii.adp's fixture, whose `conformance.json` names `cities.converted` as what `cities.yaml` becomes.

const type = designerOf(definitionOf('knowledge'), registry);
const folder = 'fixtures/fbl/conformance/fixtures/links-workspace/knowledge';
const read = (name: string): string => readFileSync(`${folder}/${name}`, 'utf8').replace(/\r\n/g, '\n');
const files = ['cities.yaml', 'provinces.yaml', 'regions.yaml', 'towns.yaml'];

function inWorkspace(name: string, text = read(name)): Source {
  const related = Object.fromEntries(files.filter((file) => file !== name).map((file) => [file, { fileName: `/w/knowledge/${file}`, text: read(file) }]));
  const plain = (file: string, body: string): Source => ({ fileName: `/w/knowledge/${file}`, text: body, linkPath: `knowledge/${file}`, related, peers: files.filter((other) => other !== file) });
  const indexed = files.map((file) => type.indexed!(plain(file, file === name ? text : read(file)))!);
  return { ...plain(name, text), links: new LinkWorkspace('/w', indexed) };
}

const rename = (row: string, value: string): TableRequest => ({ kind: 'setField', id: row, field: 'p1', value });

describe('a knowledge file made before links, in a workspace', () => {
  it('is converted with its first edit, as the fixture says, its new document id after the designer', () => {
    const cities = read('cities.yaml');
    const after = spliced(cities, applied(type.edit(inWorkspace('cities.yaml'), rename('utr', 'Utrecht city'), {}, false)).splices);
    const id = /^id: ([0-9a-z]{8})$/m.exec(after)?.[1];
    expect(id).toBeDefined();
    const expected = read('cities.converted').replaceAll('c1t9e5sx', id!)
      .replace('        text: Utrecht\n      - property: p2\n        rows:\n          - row: $k3f9x2ma@provinces.yaml#ut', '        text: Utrecht city\n      - property: p2\n        rows:\n          - row: $k3f9x2ma@provinces.yaml#ut');
    // The cached name of a link to the renamed row is the one it had on load: the next load refreshes it (FBL 17.4).
    expect(after).toBe(expected);
  });

  // The envelope's id goes after `designer` in every format a knowledge file comes in (DED 2).
  it.each([
    ['cities.yaml', 'ded: "0.1"\r\ndesigner: etalii/knowledge\r\n', (id: string) => `ded: "0.3"\r\ndesigner: etalii/knowledge\r\nid: ${id}\r\n`],
    ['cities.json', '  "ded": "0.1",\r\n  "designer": "etalii/knowledge",\r\n', (id: string) => `  "ded": "0.3",\r\n  "designer": "etalii/knowledge",\r\n  "id": "${id}",\r\n`],
    ['cities.xml', '<ded version="0.1" designer="etalii/knowledge" ', (id: string) => `<ded version="0.3" designer="etalii/knowledge" id="${id}" `],
  ])('gives %s its document id and DED 0.3 with its first edit, alone in a workspace', (name, before, after) => {
    const text = readFileSync(`examples/knowledge/${name}`, 'utf8');
    const plain: Source = { fileName: `/w/${name}`, text, linkPath: `/w/${name}` };
    const source: Source = { ...plain, links: new LinkWorkspace('/w', [type.indexed!(plain)!]) };
    const written = spliced(text, applied(type.edit(source, { kind: 'setField', id: 'r1', field: 'p1', value: 'Mokum' }, {}, false)).splices);
    const id = /(?:^id: |"id": "| id=")([0-9a-z]{8})\b/m.exec(written)?.[1];
    expect(id).toMatch(/^[0-9a-z]{8}$/);
    expect(written).toBe(text.replace(before, after(id!)).replace('Amsterdam', 'Mokum'));
  });

  it('is written as it is outside a workspace', () => {
    const cities = read('cities.yaml');
    const source: Source = { fileName: '/w/knowledge/cities.yaml', text: cities };
    const after = spliced(cities, applied(type.edit(source, rename('utr', 'Utrecht city'), {}, false)).splices);
    expect(after).toBe(cities.replace('        text: Utrecht\n', '        text: Utrecht city\n'));
  });

  it('changes nothing in a file already converted', () => {
    const provinces = read('provinces.yaml');
    const after = spliced(provinces, applied(type.edit(inWorkspace('provinces.yaml'), rename('ut', 'Utrecht province'), {}, false)).splices);
    expect(after).toBe(provinces.replace('        text: Utrecht\n', '        text: Utrecht province\n'));
  });
});

describe('a relation that links its target', () => {
  /** The workspace with `cities.yaml` converted: its relation to provinces.yaml links it, under the backlink name Cities. */
  const converted = (name: string): Source => {
    const source = inWorkspace(name, name === 'cities.yaml' ? read('cities.converted') : read(name));
    const cities: Source = { ...inWorkspace('cities.yaml', read('cities.converted')) };
    const links = new LinkWorkspace('/w', [...files.filter((file) => file !== 'cities.yaml').map((file) => type.indexed!(inWorkspace(file))!), type.indexed!(cities)!]);
    return { ...source, links, related: { ...source.related, ...(name === 'cities.yaml' ? {} : { 'cities.yaml': { fileName: '/w/knowledge/cities.yaml', text: read('cities.converted') } }) } };
  };

  it('shows each related row by its target\'s row, in this file or another, and a row that is gone by its id, with a finding', () => {
    const [ams, , haa] = type.view(converted('cities.yaml'), {}).rows;
    expect(ams.cells.p2.items!.map((item) => [item.value, item.label, item.link])).toEqual([['nh', 'Noord-Holland', { file: 'provinces.yaml', row: 'nh' }]]);
    expect(ams.cells.p3.items!.map((item) => [item.value, item.label, item.link])).toEqual([['utr', 'Utrecht', { file: '.', row: 'utr' }], ['haa', 'Haarlem', { file: '.', row: 'haa' }]]);
    expect(haa.cells.p3.items!.map((item) => item.label)).toEqual(['Amsterdam', 'gone']);
    expect(haa.cells.p3.findings).toEqual([{ severity: 'warning', message: '\'gone\' is no longer in \'cities.yaml\'.' }]);
  });

  it('is shown in its target as a backlink column of its backlink name, read-only and in neither file', () => {
    const source = converted('provinces.yaml');
    const view = type.view(source, {});
    const column = view.properties.find((property) => property.id.startsWith('p2~'))!;
    expect([column.name, column.readOnly !== undefined]).toEqual(['Cities', true]);
    expect(view.rows.map((row) => [row.id, row.cells[column.id].items!.map((item) => item.label)])).toEqual([['nh', ['Amsterdam', 'Haarlem']], ['ut', ['Utrecht']]]);
  });

  it('shows no backlink column outside a workspace', () => {
    const view = type.view({ fileName: '/w/knowledge/provinces.yaml', text: read('provinces.yaml') }, {});
    expect(view.properties.some((property) => property.id.includes('~'))).toBe(false);
  });
});
