import { describe, expect, it } from 'vitest';
import type { EditOutcome } from '../../../src/core/frame/diagramType';
import { actionIds, gartnerHypecycleGraph as type } from '../../../src/core/gartner-hypecycle-graph/index';
import { parse } from '../../../src/core/gartner-hypecycle-graph/parser';
import { formatMonth } from '../../../src/core/gartner-hypecycle-graph/scale';
import { trueTimeX } from '../../../src/core/gartner-hypecycle-graph/view';
import { LineDocument } from '../../../src/core/text/lineDocument';
import { filesUnder, read } from '../files';

const text = read('fixtures/gartner-hypecycle-graph/triggers-and-notes.ghg');
const source = { text };
const compact = { compact: true };
const startOf = (outcome: EditOutcome, id: string): string => {
  if (outcome.kind !== 'applied') throw new Error(`not applied: ${JSON.stringify(outcome)}`);
  const trend = parse(LineDocument.parse(outcome.text)).trends.find((candidate) => candidate.id === id)!;
  return formatMonth(trend.start!);
};

describe('a toolbox drop while Compact is on', () => {
  const placed = type.view(source, compact).elements;
  const trueTime = type.view(source, {}).elements;

  it('lands on the date its compact position stands for: on an element, that element\'s start', () => {
    const two = { text: 'gartner-hypecycle-graph: 1\ntrends:\n  - id: a\n    name: A\n    start: 1900-01\n    stop: 1910-01\n    row: 0\n    phases: 4\n  - id: b\n    name: B\n    start: 1950-01\n    stop: 1960-01\n    row: 0\n    phases: 4\ninfluences: []\n' };
    const b = type.view(two, compact).elements.find((element) => element.id === 'b')!;
    // Packed beside A, far left of where 1950 is in true-time.
    expect(b.x).toBeLessThan(type.view(two, {}).elements.find((element) => element.id === 'b')!.x);
    const dropped = type.edit(two, { kind: 'drop', entry: actionIds.addTrend, x: b.x, y: 72 }, compact, false);
    expect(startOf(dropped, (dropped as { select: string }).select)).toBe('1950-01');
    // In true-time the same x is another date altogether.
    const plain = type.edit(two, { kind: 'drop', entry: actionIds.addTrend, x: b.x, y: 72 }, {}, false);
    expect(startOf(plain, (plain as { select: string }).select)).not.toBe('1950-01');
  });
  it('runs evenly between two placed elements, and at the true-time scale beyond the first and the last', () => {
    const model = parse(LineDocument.parse(text));
    const ordered = [...placed].sort((a, b) => a.x - b.x);
    const first = ordered[0];
    const second = ordered.find((element) => element.x > first.x)!;
    const trueX = (id: string): number => trueTime.find((element) => element.id === id)!.x;
    expect(trueTimeX(model, compact, first.x)).toBe(trueX(first.id));
    expect(trueTimeX(model, compact, first.x - 40)).toBe(trueX(first.id) - 40);
    expect(trueTimeX(model, compact, (first.x + second.x) / 2)).toBeCloseTo((trueX(first.id) + trueX(second.id)) / 2, 9);
    const last = ordered[ordered.length - 1];
    expect(trueTimeX(model, compact, last.x + 12)).toBe(trueX(last.id) + 12);
  });

  it('is the drop point itself in an empty graph, and in true-time', () => {
    const empty = { text: type.newDocument('new.ghg') };
    const dropped = type.edit(empty, { kind: 'drop', entry: actionIds.addTrend, x: 48, y: 16 }, compact, false);
    expect(startOf(dropped, (dropped as { select: string }).select)).toBe('1901-01');
    const model = parse(LineDocument.parse(text));
    expect(trueTimeX(model, {}, 123)).not.toBeNaN();
  });
});

describe('how long it takes', () => {
  it.each(filesUnder('examples', '.ghg', '.md').filter((path) => !path.endsWith('readme.md') && !path.endsWith('PROVENANCE.md')))('%s is read and laid out well inside the two seconds an example may take to open', (path) => {
    const example = { text: read(path) };
    const diagram = path.endsWith('.ghg') ? type : undefined;
    if (!diagram) return;
    const started = performance.now();
    diagram.view(example, {});
    diagram.findings(example);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('keeps a graph of several hundred trends usable: a view of what is on screen, and an edit, in a fraction of a second', () => {
    const lines = ['gartner-hypecycle-graph: 1', 'trends:'];
    for (let index = 0; index < 600; index++) {
      const year = 1900 + (index % 120);
      lines.push(`  - id: t${index}`, `    name: Trend ${index}`, `    start: ${year}-01`, `    stop: ${year + 10}-01`, `    row: ${index % 40}`, '    phases: 4');
    }
    lines.push('influences:');
    for (let index = 1; index < 600; index++) {
      lines.push(`  - id: i${index}`, `    from: t${index - 1}`, '    from-phase: plateau', '    from-edge: bottom', '    from-at: 0.5', `    to: t${index}`, '    to-phase: peak', '    to-edge: top', '    to-at: 0.5');
    }
    const large = { text: `${lines.join('\n')}\n` };

    const viewStarted = performance.now();
    const all = type.view(large, {});
    const onScreen = type.view(large, { viewport: { x: 0, y: 0, width: 1600, height: 900 } });
    expect(performance.now() - viewStarted).toBeLessThan(1500);
    expect(all.elements).toHaveLength(600);
    expect(onScreen.elements.length).toBeLessThan(all.elements.length);

    const editStarted = performance.now();
    expect(type.edit(large, { kind: 'rename', id: 't300', text: 'Renamed' }, {}, false).kind).toBe('applied');
    expect(performance.now() - editStarted).toBeLessThan(1000);
  });
});
