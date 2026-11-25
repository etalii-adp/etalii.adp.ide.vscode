import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EditRequest, Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import { applied, definitionOf, diagramOf, spliced } from './support';

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
});
