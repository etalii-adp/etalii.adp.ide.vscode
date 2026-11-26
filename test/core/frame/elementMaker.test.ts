import { describe, expect, it } from 'vitest';
import { elementMaker } from '../../../src/core/frame/elementMaker';
import { plugins as registry } from '../../../src/core/plugins/index';
import { definitionOf, diagramOf, spliced } from '../tool/support';

// Elements made in other documents by their own tool types (etalii.adp spec 092, FR-025): what a knowledge relation's
// "Create" asks of the diagram it relates to. Each kind is an entry of the diagram's toolbox that makes a linkable element,
// and what it makes is named as typed and placed where the toolbox places an entry activated rather than dragged.

const types = ['timeline', 'dependency-graph', 'mindmap'].map((folder) => diagramOf(definitionOf(folder), registry));
const texts: Readonly<Record<string, readonly [string, string]>> = {
  'plan.tml': ['/w/plan.tml', 'timeline: 1\nid: r6d3w8ne\nelements:\n  - id: aaa\n    label: Launch\n    begin: 2027-01-04\n    row: 0\n'],
  'shop.dgr': ['/w/shop.dgr', 'dependencies: 1\nid: s2v5b9hu\nelements:\n  - id: aaa\n    label: Web shop\n    x: 0\n    row: 0\n'],
  'map.mm': ['/w/map.mm', '<map version="freeplane 1.11.5">\n<node TEXT="Shop relaunch" ID="ID_1">\n<attribute NAME="adp-id" VALUE="p4r8t1zc"/>\n</node>\n</map>\n'],
};
const related = Object.fromEntries(Object.entries(texts).map(([file, [fileName, text]]) => [file, { fileName, text }]));
const maker = elementMaker(types, { fileName: '/w/cities.yaml', text: '', related }, 20_500);

describe('an element made in another document', () => {
  it.each([
    ['plan.tml', ['Element', 'Moment']],
    ['shop.dgr', ['Node']],
    ['map.mm', ['Node']],
  ])('is of a kind %s offers', (file, kinds) => {
    expect(maker.offered(file).map((kind) => kind.label)).toEqual(kinds);
  });

  it.each([
    ['plan.tml', 'timeline.add-moment', /\n {2}- id: ([0-9a-z]{8})\n {4}label: Retro\n {4}begin: \d{4}-\d{2}-\d{2}\n {4}row: \d+\n$/],
    ['shop.dgr', 'dependencies.add-element', /\n {2}- id: ([0-9a-z]{8})\n {4}label: Retro\n {4}x: -?\d+\n {4}row: \d+\n$/],
    ['map.mm', 'mindmap.add-child', /\n<node TEXT="Retro" ID="(ID_[0-9a-z]+)"\/>\n<\/node>\n<\/map>\n$/],
  ])('is added to %s, named as typed, with nothing before it changed', (file, kind, shape) => {
    const [, before] = texts[file]!;
    const made = maker.make(file, kind, 'Retro');
    const after = spliced(before, made!.splices);
    expect(shape.exec(after)?.[1]).toBe(made!.id);
    expect(after.startsWith(before.slice(0, before.lastIndexOf(file === 'map.mm' ? '</node>' : '  - id: aaa')))).toBe(true);
  });

  it('is not made of a kind the file does not offer, nor in a file the host did not read', () => {
    expect(maker.make('shop.dgr', 'timeline.add-moment', 'Retro')).toBeUndefined();
    expect(maker.offered('elsewhere.tml')).toEqual([]);
    expect(maker.make('elsewhere.tml', 'timeline.add-moment', 'Retro')).toBeUndefined();
  });
});
