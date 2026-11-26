import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type IndexedDocument, LinkWorkspace } from '../../../src/core/fbl/links/workspace';
import type { Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import { TO_A_DIAGRAM } from '../../../src/core/plugins/knowledge-views/relations';
import { applied, definitionOf, designerOf, spliced } from './support';

// A relation to a diagram (etalii.adp spec 092, FR-025; `knowledge.md`, "A relation to a diagram"): a knowledge file's
// relation may target any document of the workspace with linkable elements, here a timeline the index holds. Its cells link
// to the timeline's elements by name, the picker lists them, and the relation is one-way: the timeline shows no backlinks.

const type = designerOf(definitionOf('knowledge'), registry);
const folder = 'fixtures/fbl/conformance/fixtures/links-workspace/knowledge';
const read = (name: string): string => readFileSync(`${folder}/${name}`, 'utf8').replace(/\r\n/g, '\n');
const files = ['cities.yaml', 'provinces.yaml', 'regions.yaml', 'towns.yaml'];

/** A timeline beside the knowledge files, as the index of links holds it: one moment, and one element that holds a link and has no name of its own. */
const plan: IndexedDocument = {
  path: 'knowledge/plan.tml', documentId: 't7m2k9qa', nameProperty: 'label',
  elements: [{ id: 'launch', attributes: [['label', 'Launch']] }, { id: 'linked', attributes: [] }],
  links: [{ holder: 'linked', text: '$k3f9x2ma@provinces.yaml#nh' }],
};

/** `cities.converted`, with its relation p4 to the timeline, Amsterdam's cell of it linking the launch. */
const cities = read('cities.converted')
  .replace('    target: ../teams/nowhere.yaml', '    target: $t7m2k9qa@plan.tml')
  .replace('          - row: x1', '          - row: $t7m2k9qa@plan.tml#launch.label=Launch');

function source(text = cities): Source {
  const related = Object.fromEntries(files.filter((file) => file !== 'cities.yaml').map((file) => [file, { fileName: `/w/knowledge/${file}`, text: read(file) }]));
  const plain = (file: string, body: string): Source => ({ fileName: `/w/knowledge/${file}`, text: body, linkPath: `knowledge/${file}`, related, peers: files.filter((other) => other !== file) });
  const indexed = files.map((file) => type.indexed!(plain(file, file === 'cities.yaml' ? text : read(file)))!);
  return { ...plain('cities.yaml', text), links: new LinkWorkspace('/w', [...indexed, plan]) };
}

describe('a relation to a diagram', () => {
  it('is offered as a new relation\'s target, by a link to the diagram\'s document', () => {
    const params = type.view(source(), {}).operations.createRelation!.params;
    const options = params.find((param) => param.name === 'targetFile')!.options ?? [];
    expect(options).toContainEqual({ value: '$t7m2k9qa@plan.tml', label: 'plan.tml' });
  });

  it('lists the diagram\'s named elements in its cells\' picker, and shows a linked element by its name', () => {
    const view = type.view(source(), {});
    const relation = view.properties.find((property) => property.id === 'p4')!;
    const ams = view.rows.find((row) => row.id === 'ams')!;
    expect(relation.related).toEqual([{ id: 'launch', name: 'Launch' }]);
    expect(ams.cells.p4.items!.map((item) => [item.label, item.link])).toEqual([['Launch', { file: 'plan.tml', row: 'launch' }]]);
    expect(ams.cells.p4.findings ?? []).toEqual([]);
  });

  it('links an element picked in a cell by its name', () => {
    const written = spliced(cities, applied(type.edit(source(), { kind: 'item', row: 'utr', property: 'p4', value: 'launch', present: true }, {}, false)).splices);
    expect(written).toContain('      - property: p4\n        rows:\n          - row: $t7m2k9qa@plan.tml#launch.label=Launch\n');
  });

  it('is made one-way, whatever backlink name it was asked for with', () => {
    const outcome = type.edit(source(), { kind: 'operation', operation: 'createRelation', args: { name: 'Milestone', targetFile: '$t7m2k9qa@plan.tml', backlinkName: 'Cities' } }, {}, false);
    const written = spliced(cities, applied(outcome).splices);
    const made = written.slice(written.indexOf('    name: Milestone'), written.indexOf('views:'));
    expect(made).toContain('target: $t7m2k9qa@plan.tml');
    expect(made).not.toContain('backlinkName');
  });

  it('cannot be made two-way', () => {
    const outcome = type.edit(source(), { kind: 'operation', operation: 'setRelationOtherSide', on: ['p4'], args: { twoWay: true } }, {}, false);
    expect(outcome).toEqual({ kind: 'refused', sentence: TO_A_DIAGRAM });
  });
});
