import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EditRequest, Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import { applied, definitionOf, diagramOf, refusal, spliced } from './support';

// The timeline's gestures (etalii.adp spec 091, tasks T019 to T022), held to the bytes of the `roadmap` conformance
// fixture: the step before a gesture is the source, the step after it the file the gesture must write. The fixture
// counts time in seconds since 1970 and the canvas in days of 20 units.

const type = diagramOf(definitionOf('timeline'), registry);
const fixture = (name: string): string => readFileSync(`fixtures/tools/timeline/roadmap/${name}`, 'utf8');
const after = (before: string, request: EditRequest): string => {
  const source: Source = { fileName: 'roadmap.tml', text: fixture(before) };
  return spliced(source.text, applied(type.edit(source, request, {}, false)).splices);
};
const box = (before: string, id: string) => (type.view({ fileName: 'roadmap.tml', text: fixture(before) }, {}).nodes.find((node) => node.id === id)!.shape as { box: { x: number; y: number; width: number; height: number } }).box;
// The id a host makes for a new element is its own; the fixture's stands in for that of the last element so labelled.
const named = (text: string, label: string, id: string): string => {
  const made = [...text.matchAll(new RegExp(`id: ([0-9a-z]+)\\r?\\n\\s+label: ${label}\\r?\\n`, 'g'))].at(-1)!;
  return text.slice(0, made.index) + `id: ${id}` + text.slice(made.index + 4 + made[1].length);
};
const canvasOf = (seconds: number): number => (seconds / 86_400) * 20;

describe('the timeline\'s gestures, as the roadmap fixture records them', () => {
  it('moves a period a week later, its begin and its end, as one edit (step 4)', () => {
    const { x, y } = box('after-3.tml', 'build');
    expect(after('after-3.tml', { kind: 'move', id: 'build', x: x + canvasOf(604_800), y })).toBe(fixture('after-4.tml'));
  });

  it('moves a moment to another day and row (step 5)', () => {
    // To 2026-01-13 on row 12: a moment hangs 0.3 of a row below its row's line, by its middle.
    expect(after('after-4.tml', { kind: 'move', id: 'launch', x: canvasOf(1_768_262_400), y: (12 + 0.3) * 60 - 9 })).toBe(fixture('after-5.tml'));
  });

  it('moves one end of a period by a dragged edge, to the nearest day, and stops it at the other end', () => {
    const bounds = box('after-3.tml', 'build');
    // The right edge three days and a few hours later: the end alone moves, to 2025-10-30.
    const later = after('after-3.tml', { kind: 'resize', id: 'build', side: 'right', bounds: { ...bounds, width: bounds.width + 3 * 20 + 4 } });
    expect(later).toBe(fixture('after-3.tml').replace('end: 2025-10-27', 'end: 2025-10-30'));
    // The left edge dragged past the right one, which stays, stops on it: the begin becomes 2025-10-27.
    const past = after('after-3.tml', { kind: 'resize', id: 'build', side: 'left', bounds: { ...bounds, x: bounds.x + bounds.width + 200, width: -200 } });
    expect(past).toBe(fixture('after-3.tml').replace('begin: 2025-09-12', 'begin: 2025-10-27'));
  });

  it('moves an element whose times carry a time of day by whole seconds, never onto the start of a day', () => {
    const timed = fixture('after-3.tml').replace('begin: 2025-09-12\r\n    end: 2025-10-27', 'begin: 2025-09-12T09:30:00\r\n    end: 2025-10-27T17:00:00');
    const source: Source = { fileName: 'roadmap.tml', text: timed };
    const { x, y } = (type.view(source, {}).nodes.find((node) => node.id === 'build')!.shape as { box: { x: number; y: number } }).box;
    // Half a day and a little later: 10.005 units are twelve hours and 21.6 seconds, written as 22.
    const moved = spliced(timed, applied(type.edit(source, { kind: 'move', id: 'build', x: x + 10.005, y }, {}, false)).splices);
    expect(moved).toBe(timed.replace('2025-09-12T09:30:00', '2025-09-12T21:30:22').replace('2025-10-27T17:00:00', '2025-10-28T05:00:22'));
  });

  it('drops an element two weeks long, and a moment, on the day and the row of the drop (steps 16 and 17)', () => {
    const element = after('after-11.tml', { kind: 'drop', entry: 'element', x: canvasOf(1_790_000_000), y: 15 });
    // The drop at 2026-09-21 14:13 begins at the start of that day; the new ids are the fixture's.
    expect(named(element, 'New element', 'arbg82ztuqr5xmtlzdhxp60fi')).toBe(fixture('after-12.tml'));
    const moment = after('after-12.tml', { kind: 'drop', entry: 'moment', x: canvasOf(1_795_000_000), y: 16 });
    expect(named(moment, 'New moment', 'bqhcw98ovn10iazz3hhy3xx6o')).toBe(fixture('after-13.tml'));
  });

  it('arranges the diagram, writing only rows, as one edit (step 24)', () => {
    const outcome = applied(type.edit({ fileName: 'roadmap.tml', text: fixture('after-16.tml') }, { kind: 'action', action: 'arrange' }, {}, false));
    expect(spliced(fixture('after-16.tml'), outcome.splices)).toBe(fixture('after-17.tml'));
  });

  it('keeps a moment off the row of a later element it is linked to, so their link does not cross its label', () => {
    const text = 'timeline: 1\r\nelements:\r\n  - id: m\r\n    label: M\r\n    begin: 2026-01-01\r\n    row: 3\r\n  - id: p\r\n    label: P\r\n    begin: 2026-03-01\r\n    end: 2026-04-01\r\n    row: 3\r\nconnections:\r\n  - id: c\r\n    from: m\r\n    to: p\r\n';
    const arranged = spliced(text, applied(type.edit({ fileName: 'apart.tml', text }, { kind: 'action', action: 'arrange' }, {}, false)).splices);
    expect(arranged).toBe(text.replace('row: 3', 'row: 0').replace('row: 3', 'row: 1'));
  });

  it('asks the end a moment is given in a dialog, starting from its begin, and gives it that end', () => {
    const text = fixture('after-5.tml');
    expect(type.edit({ fileName: 'roadmap.tml', text }, { kind: 'action', action: 'giveEnd', id: 'launch' }, {}, false))
      .toEqual({ kind: 'ask', title: 'Give it an end…', confirmLabel: 'OK', fields: [{ param: 'end', label: 'End', initial: '2026-01-13' }] });
  });
});

// The host test of task T031 found a long timeline never readable as a whole: the definition's 20 units a day show about three months.
// The standalone host fits the time axis to the document when it is first opened, and a viewer here keeps the scale it is given.
describe('the timeline\'s time axis, fitted to the document', () => {
  const source: Source = { fileName: 'roadmap.tml', text: fixture('roadmap.tml') };
  const scales = type.fittedScales!(source)!;
  const boxes = type.view(source, { scales }).nodes.map((node) => (node.shape as { box: { x: number; width: number } }).box);

  it('draws the whole document across about 1200 canvas units, a tenth of its span spare on each side', () => {
    const from = Math.min(...boxes.map((drawn) => drawn.x));
    const to = Math.max(...boxes.map((drawn) => drawn.x + drawn.width));
    expect(from).toBeGreaterThan(90);
    expect(to).toBeLessThan(1110);
    expect(to - from).toBeGreaterThan(900);
  });

  it('writes the day a drop is let go on, on the scale the viewer keeps', () => {
    // 2026-09-21 14:13 on the fitted scale.
    const x = (1_790_000_000 / 86_400 - scales.time.origin) * scales.time.size;
    const written = spliced(source.text, applied(type.edit(source, { kind: 'drop', entry: 'element', x, y: 15 }, { scales }, false)).splices);
    expect(written).toMatch(/label: New element\r?\n\s+begin: 2026-09-21\r?\n\s+end: 2026-10-05/);
  });

  // The host test of task T031 found a new timeline starting in 1970 (etalii.adp #853): what a new user drops lands near today.
  // The second re-check found the empty timeline's date ruler blank (vscode #129).
  it('labels the ruler of an empty timeline with the days around today', () => {
    const empty: Source = { fileName: 'empty.tml', text: 'timeline: 1\r\nelements: []\r\n' };
    const today = Date.UTC(2026, 10, 25) / 86_400_000;
    const ruler = type.view(empty, { scales: type.fittedScales!(empty, today) }).chrome!.rulers.find((candidate) => candidate.axis === 'x')!;
    const labels = ruler.levels.flatMap((level) => level.ticks.map((tick) => tick.label));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.join(' ')).toMatch(/2026|Nov|Dec/);
  });

  it('fits an empty timeline to the weeks around today, so a drop in its middle writes a day near today', () => {
    const empty: Source = { fileName: 'empty.tml', text: 'timeline: 1\r\nelements: []\r\n' };
    const today = Date.UTC(2026, 10, 25) / 86_400_000;
    const around = type.fittedScales!(empty, today)!;
    const written = spliced(empty.text, applied(type.edit(empty, { kind: 'drop', entry: 'element', x: 600, y: 15 }, { scales: around }, false)).splices);
    const begin = /begin: (\d{4}-\d{2}-\d{2})/.exec(written)![1];
    expect(Math.abs(Date.parse(begin) / 86_400_000 - today)).toBeLessThan(45);
  });
});

// The host test of task T031 found an element whose dates were typed in ADP Properties sitting far outside the view, with
// nothing to bring it back: the edit names the element, for the host to bring into view where it now lies outside it.
describe('the timeline\'s properties', () => {
  it('bring the element whose dates they change into view', () => {
    const source: Source = { fileName: 'roadmap.tml', text: fixture('roadmap.tml') };
    const end = type.fields(source, ['build']).find((row) => row.label === 'End')!;
    const outcome = applied(type.edit(source, { kind: 'setField', id: 'build', field: end.id, value: '2031-03-02' }, {}, false));
    expect(outcome.splices.length).toBeGreaterThan(0);
    expect(outcome.show).toBe('build');
  });

  // The second re-check found the element vanishing when its Begin was typed past its End (vscode #130); the companion
  // refuses that from either row, as the standalone host does.
  it('refuse a begin after the element\'s end, as they refuse an end before its begin', () => {
    const source: Source = { fileName: 'roadmap.tml', text: fixture('roadmap.tml') };
    const begin = type.fields(source, ['build']).find((row) => row.label === 'Begin')!;
    expect(refusal(type.edit(source, { kind: 'setField', id: 'build', field: begin.id, value: '2025-11-01' }, {}, false))).toBe('An element cannot end before it begins.');
    expect(applied(type.edit(source, { kind: 'setField', id: 'build', field: begin.id, value: '2025-10-27' }, {}, false)).splices.length).toBeGreaterThan(0);
  });
});

// The host test of task T031 found no arrowheads: the curve entered its target from the right, under the bar. `endDirection: "left"`
// names the side the line enters by (DISL 6.10, as ruled in etalii.adp #852), so the curve arrives from the left of its target.
describe('the timeline\'s connections', () => {
  it('enter their target through its left side and leave their source through its right', () => {
    const scene = type.view({ fileName: 'roadmap.tml', text: fixture('roadmap.tml') }, {});
    const curved = scene.edges.filter((edge) => edge.curve !== undefined);
    expect(curved.length).toBeGreaterThan(0);
    for (const edge of curved) {
      const [start, leaving, entering, end] = edge.curve!;
      expect(leaving.x).toBeGreaterThan(start.x);
      expect(entering.x).toBeLessThan(end.x);
    }
  });
});
