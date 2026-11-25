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

// What the spec's later pull requests build, and the definition's stale requirement its pull request B drops: until
// then the only findings of the definition, and of every example.
const pending = [
  'disl.unsupported-feature: This tool needs the DISL feature `persist.yaml`, which this add-on does not support, so a part of it is missing or works differently.',
  'disl.unsupported-feature: This tool needs the DISL feature `snap.calendar`, which this add-on does not support, so a part of it is missing or works differently.',
  'disl.notation: A node of the type `Moment` is drawn as the shape `diamond`, which this add-on does not draw; a rectangle is drawn.',
];
const shown = (source: Source): string[] => type.findings(source).map((finding) => `${finding.rule}: ${finding.message}`).sort();

describe('the timeline, read from its definition', () => {
  it('reads its definition with no finding but those of what is not built yet', () => {
    expect(shown({ fileName: 'empty.tml', text: 'timeline: 1\nelements: []\nconnections: []\n' })).toEqual([...pending].sort());
  });

  it.each(examples)('opens %s with no other finding, every expression evaluating', (path) => {
    expect(shown(sourceOf(path))).toEqual([...pending].sort());
  });

  it('places a period from its begin to its end and a moment at its time, 20 units a day from 1970, on its row', () => {
    const boxes = new Map(type.view(sourceOf('example-1/roadmap.tml'), {}).nodes.map((node) => [node.id, (node.shape as { box: { x: number; y: number; width: number; height: number } }).box]));
    // `discovery` runs from 2025-04-27, 20,205 days after 1970, to 2025-06-05 on row 11; `launch` is on 2025-12-04 on row 8.
    expect(boxes.get('discovery')).toEqual({ x: 20_205 * 20, y: 11 * 60, width: 39 * 20, height: 36 });
    expect(boxes.get('launch')).toMatchObject({ x: 20_426 * 20, width: 18, height: 18 });
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
