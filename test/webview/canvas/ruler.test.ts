import { describe, expect, it } from 'vitest';
import { rungFor, rungLabel, ticksOf, type Rung } from '../../../src/webview/canvas/ruler';

const rungs: Rung[] = [
  { months: 1, every: 'month', label: 'MMM yyyy' },
  { months: 3, every: 'quarter', label: 'MMM yyyy' },
  { months: 12, every: 'year', label: 'yyyy' },
  { months: 120, every: 'decade', label: 'yyyy' },
];

describe('the time ruler', () => {
  it('shows the finest rung whose labels are at least 64 pixels apart', () => {
    expect(rungFor(rungs, 80, 64)?.every).toBe('month');
    expect(rungFor(rungs, 30, 64)?.every).toBe('quarter');
    expect(rungFor(rungs, 4, 64)?.every).toBe('decade');
    expect(rungFor(rungs, 0.01, 64)?.every).toBe('decade');
    expect(rungFor([], 4, 64)).toBeUndefined();
  });

  it('labels a month with its name and a coarser rung with the year alone, before year 1 too', () => {
    expect(rungLabel(1947 * 12 + 11, 'MMM yyyy')).toBe('Dec 1947');
    expect(rungLabel(1950 * 12, 'yyyy')).toBe('1950');
    expect(rungLabel(-3200 * 12, 'yyyy')).toBe('-3200');
  });

  it('puts a tick at the start of each step of its rung, on the scale every host shares', () => {
    // In a diagram of months, x 0 is 1900-01 and a month is four units.
    expect(ticksOf(rungs[2], 1, -10, 100)).toEqual([{ month: 22800, x: 0 }, { month: 22812, x: 48 }, { month: 22824, x: 96 }]);
    // In a diagram of years, a year is four units.
    expect(ticksOf(rungs[3], 12, 0, 100).map((tick) => tick.x)).toEqual([0, 40, 80]);
  });
});