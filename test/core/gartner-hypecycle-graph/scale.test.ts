import { describe, expect, it } from 'vitest';
import { timeUnitNamed } from '../../../src/core/gartner-hypecycle-graph/model';
import * as scale from '../../../src/core/gartner-hypecycle-graph/scale';
import { read } from '../files';

// The fixture both ADP hosts are asserted against, read unchanged.
const fixture = JSON.parse(read('fixtures/gartner-hypecycle-graph/scale-fixture.json')) as {
  unitsPerMonth: number; origin: string; trendHeight: number; rowStep: number;
  months: { date: string; x: number }[];
  units: Record<string, number>;
  unitDates: { unit: string; date: string; x: number }[];
  rows: { row: number; top: number; middle: number }[];
};

describe('the time scale, against the shared fixture', () => {
  it('has the fixture\'s constants', () => {
    expect(scale.unitsPerStep).toBe(fixture.unitsPerMonth);
    expect(scale.originDate).toBe(fixture.origin);
    expect(scale.trendHeight).toBe(fixture.trendHeight);
    expect(scale.rowStep).toBe(fixture.rowStep);
    for (const [name, months] of Object.entries(fixture.units)) expect(timeUnitNamed(name)?.months).toBe(months);
  });

  it.each(fixture.months)('puts $date at x $x, and reads and writes the date', ({ date, x }) => {
    const month = scale.parseMonth(date);
    expect(month).toBeDefined();
    expect(scale.xOf(month!)).toBe(x);
    expect(scale.formatMonth(month!)).toBe(date);
    expect(scale.nearestMonthAt(x)).toBe(month);
    expect(scale.monthContaining(x + 1)).toBe(month);
  });

  it.each(fixture.unitDates)('puts $date at x $x in a diagram of ${unit}s', ({ unit, date, x }) => {
    const month = scale.parseMonth(date)!;
    const timeUnit = timeUnitNamed(unit)!;
    expect(scale.xOf(month, timeUnit)).toBe(x);
    expect(scale.nearestMonthAt(x, timeUnit)).toBe(month);
  });

  it.each(fixture.rows)('puts row $row at top $top with its middle at $middle', ({ row, top, middle }) => {
    expect(scale.topOf(row)).toBe(top);
    expect(scale.rowAtTop(top)).toBe(row);
    expect(scale.rowAtMiddle(middle)).toBe(row);
  });
});

describe('dates', () => {
  it.each(['1947-13', '1947-00', '47-01', '1947-1', '-32-01', 'June 2007', ''])('refuse %j', (text) => {
    expect(scale.parseMonth(text)).toBeUndefined();
  });

  it('snap a half step away from zero on both sides of the origin', () => {
    expect(scale.nearestMonthAt(2)).toBe(scale.originMonth + 1);
    expect(scale.nearestMonthAt(-2)).toBe(scale.originMonth - 1);
    expect(scale.rowAtTop(28)).toBe(1);
    expect(scale.rowAtTop(-28)).toBe(-1);
  });

  it('read as a label in the diagram\'s unit', () => {
    const month = scale.parseMonth('1947-12')!;
    expect(scale.formatWhen(month, timeUnitNamed('month')!)).toBe('Dec 1947');
    expect(scale.formatWhenLong(month, timeUnitNamed('month')!)).toBe('December 1947');
    expect(scale.formatWhen(month, timeUnitNamed('year')!)).toBe('1947');
    expect(scale.formatWhen(scale.parseMonth('-3200-01')!, timeUnitNamed('century')!)).toBe('-3200');
  });
});