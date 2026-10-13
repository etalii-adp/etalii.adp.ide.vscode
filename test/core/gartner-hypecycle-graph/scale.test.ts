import { describe, expect, it } from 'vitest';
import type { Source } from '../../../src/core/frame/toolType';
import { read } from '../files';
import { change, graph, nodeOf, oneTrend, sentenceOf, type, written } from './hypeCycle';

// The fixture both ADP hosts are asserted against, read unchanged. The scale is the definition's
// coordinate system, so each number is asserted on what the tool type draws and writes.
const fixture = JSON.parse(read('fixtures/gartner-hypecycle-graph/scale-fixture.json')) as {
  unitsPerMonth: number; origin: string; trendHeight: number; rowStep: number;
  months: { date: string; x: number }[];
  units: Record<string, number>;
  unitDates: { unit: string; date: string; x: number }[];
  rows: { row: number; top: number; middle: number }[];
};

/** A graph with a note `n` and a trigger `g` at a date, a note `m` far from it, and a trend `a` on a row, in a unit when one is given. */
const at = (date: string, unit?: string, row = 0): Source => graph(
  ...(unit === undefined ? [] : [`unit: ${unit}`]),
  'trends:', '  - id: a', '    name: A', '    start: 2000-01', '    stop: 2010-01', `    row: ${row}`, '    phases: 4',
  'triggers:', '  - id: g', '    name: G', `    date: ${date}`, `    row: ${row}`,
  'notes:', '  - id: n', '    text: N', `    at: ${date}`, '    row: 0', '    width: 10', '    height: 10', '  - id: m', '    text: M', '    at: 2100-01', '    row: 0', '    width: 10', '    height: 10',
  'influences: []',
);
const months = (date: string): number => Number(date.slice(0, -3)) * 12 + Number(date.slice(-2)) - 1;
const later = (date: string, by: number): string => {
  const total = months(date) + by;
  const year = Math.floor(total / 12);
  return `${year < 0 ? '-' : ''}${String(Math.abs(year)).padStart(4, '0')}-${String(total - year * 12 + 1).padStart(2, '0')}`;
};

describe('the time scale, against the shared fixture', () => {
  it('has the fixture\'s constants', () => {
    // A month is `unitsPerMonth` wide from the origin, a trend `trendHeight` tall, and a row `rowStep` below the one before.
    const month = nodeOf(oneTrend(fixture.origin, later(fixture.origin, 1), 1), 'a').box;
    expect(month).toEqual({ x: 0, y: 0, width: fixture.unitsPerMonth, height: fixture.trendHeight });
    expect(nodeOf(at('1900-01', undefined, 1), 'a').box.y).toBe(fixture.rowStep);
    // One step of a unit is as wide as a month is in a diagram of months.
    for (const [name, span] of Object.entries(fixture.units)) expect(nodeOf(oneTrend(fixture.origin, later(fixture.origin, span), 1, [], name), 'a').box.width, name).toBe(fixture.unitsPerMonth);
  });

  it.each(fixture.months)('puts $date at x $x, and reads and writes the date', ({ date, x }) => {
    const source = at(date);
    expect(type.findings(source)).toEqual([]);
    expect(nodeOf(source, 'n').box.x).toBe(x);
    expect(nodeOf(source, 'g').box.x + 8).toBe(x);
    expect(type.fields(source, ['g']).find((field) => field.id === 'ghg.date')?.value).toBe(date);
    // The month nearest an x, which a moved note is written with, and the month an x lies in, which a dropped trend starts at.
    expect(written(change(source, { kind: 'move', id: 'm', x, y: 0 }).added, 'at')).toBe(date);
    expect(written(change(source, { kind: 'drop', entry: 'ghg.add.trend', x: x + 1, y: 0 }).added, 'start')).toBe(date);
  });

  it.each(fixture.unitDates)('puts $date at x $x in a diagram of ${unit}s', ({ unit, date, x }) => {
    const source = at(date, unit);
    // The x of the furthest date is a floating-point hair off the fixture's whole number.
    expect(nodeOf(source, 'n').box.x).toBeCloseTo(x, 9);
    expect(written(change(source, { kind: 'move', id: 'm', x, y: 0 }).added, 'at')).toBe(date);
  });

  it.each(fixture.rows)('puts row $row at top $top with its middle at $middle', ({ row, top, middle }) => {
    const source = at('1900-01', undefined, row);
    expect(nodeOf(source, 'a').box.y).toBe(top);
    expect(nodeOf(source, 'g').box.y + 8).toBe(middle);
    const other = at('1900-01', undefined, 20);
    expect(written(change(other, { kind: 'move', id: 'a', x: nodeOf(other, 'a').box.x, y: top }).added, 'row')).toBe(String(row));
    expect(written(change(other, { kind: 'move', id: 'g', x: nodeOf(other, 'g').box.x, y: middle - 8 }).added, 'row')).toBe(String(row));
  });
});

describe('dates', () => {
  it.each(['1947-13', '1947-00', '47-01', '1947-1', '-32-01', 'June 2007', ''])('refuse %j', (text) => {
    const source = at('1900-01');
    expect(sentenceOf(source, { kind: 'setField', id: 'a', field: 'ghg.start', value: text })).toBe(`'${text}' is not a date; write it as YYYY-MM, such as 2007-06.`);
    expect(sentenceOf(source, { kind: 'setField', id: 'g', field: 'ghg.date', value: text })).toBe(`'${text}' is not a date; write it as YYYY-MM, such as 1947-12.`);
  });

  it('snap a half step away from zero on both sides of the origin', () => {
    const source = at('1950-01', undefined, 20);
    const moved = (id: string, x: number, y: number, key: string): string | undefined => written(change(source, { kind: 'move', id, x, y }).added, key);
    expect(moved('m', 2, 0, 'at')).toBe('1900-02');
    expect(moved('m', -2, 0, 'at')).toBe('1899-12');
    expect(moved('m', 1.9, 0, 'at')).toBe('1900-01');
    const x = nodeOf(source, 'a').box.x;
    expect(moved('a', x, 28, 'row')).toBe('1');
    expect(moved('a', x, -28, 'row')).toBe('-1');
    expect(moved('a', x, 27.9, 'row')).toBe('0');
  });

  it('read as a label in the diagram\'s unit', () => {
    const shown = (date: string, unit: string): (string | undefined)[] => [nodeOf(at(date, unit), 'g').labels[0].text, nodeOf(at(date, unit), 'g').tooltip];
    expect(shown('1947-12', 'month')).toEqual(['G · Dec 1947', 'Trigger: G, December 1947']);
    expect(shown('1947-12', 'year')).toEqual(['G · 1947', 'Trigger: G, 1947']);
    expect(shown('-3200-01', 'century')).toEqual(['G · -3200', 'Trigger: G, -3200']);
  });
});
