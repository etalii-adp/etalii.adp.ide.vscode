import { describe, expect, it } from 'vitest';
import type { Source, ViewOptions } from '../../../src/core/frame/toolType';
import { plugins } from '../../../src/core/plugins/index';
import { filesUnder, read } from '../files';
import { behaviorModelFolder, definitionOf, diagramOf, sourceOf, viewing } from '../tool/support';
import { base, change, edit, graph, nodeOf, type, written } from './hypeCycle';

// Compact is the definition's viewpoint `compact`, which the view options ask for by its name.
const compact = viewing({ viewpoint: 'compact' });
const trueTime = viewing({});

// docs/disl-support.md, "After a trend or a trigger is dropped": nothing is selected, so the new
// trend is found by the lines the drop wrote.
const startOfDrop = (source: Source, x: number, y: number, options: ViewOptions): string =>
  written(change(source, { kind: 'drop', entry: 'ghg.add.trend', x, y }, options).added, 'start')!;

describe('a toolbox drop while Compact is on', () => {
  const placed = type.view(base, compact).nodes;
  const trueX = (id: string): number => nodeOf(base, id).box.x;
  const compactX = (id: string): number => placed.find((node) => node.id === id)!.box.x;

  it('lands on the date its compact position stands for: on an element, that element\'s start', () => {
    const two = graph('trends:', '  - id: a', '    name: A', '    start: 1900-01', '    stop: 1910-01', '    row: 0', '    phases: 4', '  - id: b', '    name: B', '    start: 1950-01', '    stop: 1960-01', '    row: 0', '    phases: 4', 'influences: []');
    const b = nodeOf(two, 'b', compact).box;
    // Packed beside A, far left of where 1950 is in true-time.
    expect(b.x).toBeLessThan(nodeOf(two, 'b').box.x);
    expect(startOfDrop(two, b.x, 72, compact)).toBe('1950-01');
    // In true-time the same x is another date altogether.
    expect(startOfDrop(two, b.x, 72, trueTime)).not.toBe('1950-01');
  });

  it('runs evenly between two placed elements, and at the true-time scale beyond the first and the last', () => {
    // A drop in Compact writes what a drop in true-time writes at the x the compact x stands for.
    const lands = (x: number, at: number): void => expect(startOfDrop(base, x, 0, compact)).toBe(startOfDrop(base, at, 0, trueTime));
    const ordered = [...placed].sort((a, b) => a.box.x - b.box.x);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    // Each trend stands alone at its compact x, so its x is its own start. The leftmost x is shared by
    // the trigger and both notes, and there the date is the last of the three's.
    expect(placed.filter((node) => node.box.x === first.box.x).map((node) => node.id)).toEqual(['transistor-invented', 'note-1', 'note-2']);
    lands(first.box.x, trueX('note-2'));
    lands(compactX('transistors'), trueX('transistors'));
    expect(startOfDrop(base, compactX('transistors'), 0, compact)).toBe('1950-01');
    lands(first.box.x - 40, trueX(first.id) - 40);
    lands((compactX('transistors') + compactX('radio')) / 2, (trueX('transistors') + trueX('radio')) / 2);
    expect(startOfDrop(base, (compactX('transistors') + compactX('radio')) / 2, 0, compact)).toBe('1952-01');
    expect(last.id).toBe('radio');
    lands(last.box.x + 12, trueX(last.id) + 12);
    expect(startOfDrop(base, last.box.x + 12, 0, compact)).toBe('1957-01');
  });

  it('is the drop point itself in an empty graph, and in true-time', () => {
    const empty = sourceOf(type.newDocument('new.ghg'));
    expect(startOfDrop(empty, 48, 16, compact)).toBe('1901-01');
    expect(startOfDrop(empty, 48, 16, trueTime)).toBe('1901-01');
    expect(startOfDrop(base, 123, 0, trueTime)).toBe('1930-01');
  });
});

describe('how long it takes', () => {
  const behaviorModel = diagramOf(definitionOf(behaviorModelFolder), plugins);
  const examples = [...filesUnder('examples/gartner-hypecycle-graph', '.ghg'), ...filesUnder('examples/agent-behavior-modelling', '.md').filter((path) => !path.endsWith('readme.md'))];

  // Measured on the tool types read from their definitions: the largest example, technology-trends
  // with 223 elements and 295 influences, takes about 230 ms run alone and up to 440 ms while every
  // other test file runs beside it; a behavior model takes about 10 ms. The hand-coded diagram took
  // 90 ms, under a bound of 500 ms: the bound is a second here, which is still half of the two.
  it.each(examples)('%s is read and laid out well inside the two seconds an example may take to open', (path) => {
    const example = sourceOf(read(path), path);
    const diagram = path.endsWith('.ghg') ? type : behaviorModel;
    const started = performance.now();
    const scene = diagram.view(example, {});
    diagram.findings(example);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(scene.nodes.length).toBeGreaterThan(0);
  });

  // Measured: the two views together take about 500 ms the first time and 350 ms after, and the edit 170 ms; while
  // every other test file runs beside them, up to 950 ms and 500 ms. The hand-coded diagram took 180 ms for each, under
  // bounds of 1500 ms and 1000 ms: the bounds here are 2500 ms and 1500 ms, to hold on a slower machine too.
  it('keeps a graph of several hundred trends usable: a view of what is on screen, and an edit, in a fraction of a second', () => {
    const lines = ['trends:'];
    for (let index = 0; index < 600; index++) {
      const year = 1900 + (index % 120);
      lines.push(`  - id: t${index}`, `    name: Trend ${index}`, `    start: ${year}-01`, `    stop: ${year + 10}-01`, `    row: ${index % 40}`, '    phases: 4');
    }
    lines.push('influences:');
    for (let index = 1; index < 600; index++) {
      lines.push(`  - id: i${index}`, `    from: t${index - 1}`, '    from-phase: plateau', '    from-edge: bottom', '    from-at: 0.5', `    to: t${index}`, '    to-phase: peak', '    to-edge: top', '    to-at: 0.5');
    }
    const large = graph(...lines);

    const viewStarted = performance.now();
    const all = type.view(large, {});
    const onScreen = type.view(large, { viewport: { x: 0, y: 0, width: 1600, height: 900 } });
    expect(performance.now() - viewStarted).toBeLessThan(2500);
    expect(all.nodes).toHaveLength(600);
    expect(all.edges).toHaveLength(599);
    // A scene holds every element whatever is in view: the part in view bounds the ticks of the ruler alone.
    expect(onScreen.nodes).toHaveLength(600);

    const editStarted = performance.now();
    expect(edit(large, { kind: 'rename', id: 't300', text: 'Renamed' }).kind).toBe('applied');
    expect(performance.now() - editStarted).toBeLessThan(1500);
  });
});
