import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Source } from '../../../../src/core/frame/toolType';
import { plugins as registry } from '../../../../src/core/plugins/index';
import { definitionOf, diagramOf } from '../../tool/support';

// The timeline opened from its definition (etalii.adp spec 091, tasks T007 to T011): the definition reads with no
// finding, and every expression in it evaluates for every element of the four examples, so that the only findings
// are those the definition's rules give.

const type = diagramOf(definitionOf('timeline'), registry);

const examples = ['example-1/roadmap.tml', 'example-2/roadmap.tml', 'marvel-universe-overview/marvel-universe-overview.tml', 'marvel-universe/marvel-universe.tml'];
const sourceOf = (path: string): Source => ({ fileName: path.split('/').slice(-1)[0], text: readFileSync(`examples/timeline/${path}`, 'utf8') });

// Every feature the timeline requires is built, so it and its examples read with no finding at all.
const shown = (source: Source): string[] => type.findings(source).map((finding) => `${finding.rule}: ${finding.message}`).sort();

describe('the timeline, read from its definition', () => {
  it('reads its definition with no finding', () => {
    expect(shown({ fileName: 'empty.tml', text: 'timeline: 1\nelements: []\nconnections: []\n' })).toEqual([]);
  });

  it.each(examples)('opens %s with no finding, every expression evaluating', (path) => {
    expect(shown(sourceOf(path))).toEqual([]);
  });

  it('places a period from its begin to its end and a moment at its time, 20 units a day from 1970, on its row', () => {
    const boxes = new Map(type.view(sourceOf('example-1/roadmap.tml'), {}).nodes.map((node) => [node.id, (node.shape as { box: { x: number; y: number; width: number; height: number } }).box]));
    // `discovery` runs from 2025-04-27, 20,205 days after 1970, to 2025-06-05 on row 11; `launch` is on 2025-12-04 on row 8.
    expect(boxes.get('discovery')).toEqual({ x: 20_205 * 20, y: 11 * 60, width: 39 * 20, height: 36 });
    expect(boxes.get('launch')).toMatchObject({ x: 20_426 * 20, width: 18, height: 18 });
  });

  it('draws a moment as a diamond through the middles of its box\'s sides', () => {
    const launch = type.view(sourceOf('example-1/roadmap.tml'), {}).nodes.find((node) => node.id === 'launch')!;
    const { x, y } = (launch.shape as { box: { x: number; y: number } }).box;
    expect(launch.shape).toMatchObject({ kind: 'path', name: 'diamond' });
    expect((launch.shape as { readonly commands: readonly unknown[] }).commands).toEqual([
      { op: 'M', x: x + 9, y }, { op: 'L', x: x + 18, y: y + 9 }, { op: 'L', x: x + 9, y: y + 18 }, { op: 'L', x, y: y + 9 }, { op: 'Z' },
    ]);
  });
});

describe('the Marvel universe, the largest example', () => {
  it('is read and drawn within two seconds, every one of its 428 events a node', () => {
    const started = performance.now();
    const scene = type.view(sourceOf('marvel-universe/marvel-universe.tml'), {});
    expect(scene.nodes.length).toBe(428);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe('the drawing of the roadmap fixture', () => {
  interface Drawn { readonly id: string; readonly type: string; readonly labels?: readonly { readonly text: string }[] }
  const drawing = JSON.parse(readFileSync('fixtures/tools/timeline/roadmap/drawing.read.json', 'utf8')) as { elements: readonly Drawn[]; edges: readonly { id: string; source: string; target: string }[] };
  const scene = type.view({ fileName: 'roadmap.tml', text: readFileSync('fixtures/tools/timeline/roadmap/roadmap.tml', 'utf8') }, {});

  it('has its elements, a period as a rounded bar and a moment as a diamond', () => {
    const shapes = new Map(scene.nodes.map((node) => [node.id, (node.shape as { name: string }).name]));
    expect(scene.nodes.map((node) => node.id).sort()).toEqual(drawing.elements.map((element) => element.id).sort());
    expect(drawing.elements.filter((element) => shapes.get(element.id) !== (element.type === 'Moment' ? 'diamond' : 'roundedRect')).map((element) => element.id)).toEqual([]);
  });

  it('has its connections, each between the two elements it names', () => {
    expect(scene.edges.map((edge) => `${edge.id} ${edge.source}→${edge.target}`).sort()).toEqual(drawing.edges.map((edge) => `${edge.id} ${edge.source}→${edge.target}`).sort());
  });
});
