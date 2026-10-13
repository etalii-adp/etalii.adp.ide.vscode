import { describe, expect, it } from 'vitest';
import type { Source } from '../../../src/core/frame/toolType';
import { change, nodeOf, oneTrend, type, written } from './hypeCycle';

// The phases of a trend, on what the tool type draws and writes for a trend `a` in a diagram of
// months: a month is four units wide and 1900-01 is at 0, so a boundary's handle at x is the month
// x / 4 counted from 1900-01, which is how the cases below number them.

/** The boundaries a trend is drawn with, in months from 1900-01: one for each handle that is shown. */
const boundaries = (source: Source): number[] => nodeOf(source, 'a').handles.filter((handle) => handle.visible).map((handle) => handle.x / 4);
/** The month a count of months from 1900-01 is written as. */
const month = (months: number): string => `${1900 + Math.floor(months / 12)}-${String((((months % 12) + 12) % 12) + 1).padStart(2, '0')}`;
/** A trend from one month to another, both counted from 1900-01, with the boundaries it stores. */
const trend = (start: number, stop: number, phases: number, stored: readonly (number | undefined)[] = []): Source =>
  oneTrend(month(start), month(stop), phases, ['peak-end', 'trough-end', 'slope-end'].flatMap((key, index) => (stored[index] === undefined ? [] : [`    ${key}: ${month(stored[index])}`])));
/** The boundaries a request writes, in months from 1900-01: one it leaves as it is stored is not written. */
const storedAfter = (source: Source, request: Parameters<typeof change>[1]): (number | undefined)[] => {
  const { added } = change(source, request);
  return ['peak-end', 'trough-end', 'slope-end'].map((key) => {
    const value = written(added, key);
    return value === undefined ? undefined : (Number(value.slice(0, -3)) - 1900) * 12 + Number(value.slice(-2)) - 1;
  });
};

describe('phase boundaries', () => {
  it('are spread evenly when none is stored', () => {
    expect(boundaries(trend(0, 120, 4))).toEqual([30, 60, 90]);
    expect(boundaries(trend(0, 120, 3))).toEqual([40, 80]);
    expect(boundaries(trend(0, 120, 1))).toEqual([]);
  });

  it('snap to a month, a half rounding to the later month', () => {
    expect(boundaries(trend(0, 10, 4))).toEqual([3, 5, 8]);
    // The definition rounds the month itself, half away from zero, and a month is counted from the year 0: before 1900 a half
    // is the later month too. The hand-coded diagram counted from 1900 and gave -8, -5 and -3 here.
    expect(boundaries(trend(-10, 0, 4))).toEqual([-7, -5, -2]);
  });

  it('keep a stored boundary and spread the others between it and the ends', () => {
    expect(boundaries(trend(0, 120, 4, [20]))).toEqual([20, 53, 87]);
    expect(boundaries(trend(0, 120, 4, [undefined, 100]))).toEqual([50, 100, 110]);
  });

  it('neither draw nor spread around a stored boundary beyond the last visible phase', () => {
    expect(boundaries(trend(0, 120, 2, [undefined, 100]))).toEqual([60]);
  });

  it('find a stored boundary outside the span, and draw the trend with its phases spread evenly', () => {
    // The hand-coded diagram drew such a boundary at the end of the span, at 120.
    const outside = trend(0, 120, 2, [500]);
    expect(boundaries(outside)).toEqual([60]);
    expect(type.findings(outside)).toEqual([{ rule: 'ghg.boundary-order', severity: 'warning', message: '`a`\'s `peak-end: 1941-09` is out of order or outside 1900-01 to 1910-01.', line: 2 }]);
  });
});

describe('stored boundaries when a trend changes', () => {
  it('shift exactly with a move', () => {
    expect(storedAfter(trend(0, 120, 4, [10, undefined, 30]), { kind: 'move', id: 'a', x: 5 * 4, y: 0 })).toEqual([15, undefined, 35]);
  });

  it('scale with a resize, rounded to a month', () => {
    const stored = trend(0, 120, 4, [30]);
    expect(storedAfter(stored, { kind: 'resize', id: 'a', side: 'right', bounds: { x: 0, y: 0, width: 60 * 4, height: 32 } })).toEqual([15, undefined, undefined]);
    expect(storedAfter(stored, { kind: 'setField', id: 'a', field: 'ghg.stop', value: month(60) })).toEqual([15, undefined, undefined]);
    const both = { kind: 'resize', id: 'a', side: 'right', bounds: { x: 100 * 4, y: 0, width: 240 * 4, height: 32 } } as const;
    expect(storedAfter(stored, both)).toEqual([160, undefined, undefined]);
    expect(change(stored, both).added.slice(0, 2)).toEqual([`    start: ${month(100)}`, `    stop: ${month(340)}`]);
  });

  it('leave every visible phase at least a month long after a resize', () => {
    expect(storedAfter(trend(0, 120, 4, [118, 119]), { kind: 'setField', id: 'a', field: 'ghg.stop', value: month(4) })).toEqual([1, 2, undefined]);
  });

  it('clamp a dragged boundary so its neighbours keep a month each, spread ones included', () => {
    const drag = (source: Source, months: number) => storedAfter(source, { kind: 'handle', id: 'a', handle: 0, x: months * 4 });
    expect(drag(trend(0, 120, 4), 0)).toEqual([1, undefined, undefined]);
    // A handle stops a step short of the next boundary as it is drawn, which is the one spread at 60: the gesture
    // never reaches the 117 the hand-coded diagram's own arithmetic allowed.
    expect(drag(trend(0, 120, 4), 500)).toEqual([59, undefined, undefined]);
    expect(drag(trend(0, 120, 4, [undefined, 60]), 80)).toEqual([59, undefined, undefined]);
  });
});
