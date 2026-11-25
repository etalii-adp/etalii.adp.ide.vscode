import { describe, expect, it } from 'vitest';
import { defaultCoordinates, interpretCoordinates, monthsIn, rulerRows, scaleOf, scalesOf, unitOf } from '../../../src/core/disl/coordinates';
import { interpretMetamodel, parseYearMonth } from '../../../src/core/disl/metamodel';
import { loadSpecification } from '../../../src/core/disl/specification';
import { hypeCycleJson, json, mindmapJson } from './tool';

const ym = (text: string): number => parseYearMonth(text)!;
const interpret = (source: unknown) => {
  const specification = loadSpecification(source).value;
  return interpretCoordinates(specification, interpretMetamodel(specification).value);
};
const withCoordinates = (coordinates: object) => ({ disl: '0.3', language: { id: 'a.b', version: '1.0.0' }, metamodel: {}, coordinates });

describe('the coordinates of the hype cycle graph', () => {
  const { value: coordinates, findings } = interpret(hypeCycleJson());
  const time = coordinates.axes.time;

  it('are read without a finding', () => expect(findings).toEqual([]));

  it('have the axes, the systems and the default', () => {
    expect(Object.keys(coordinates.axes)).toEqual(['time', 'rows', 'track']);
    expect(Object.keys(coordinates.systems)).toEqual(['hypeCycle', 'compact']);
    expect(coordinates.default).toBe('hypeCycle');
    expect(coordinates.systems.hypeCycle).toMatchObject({ orientation: 'y-down', infinite: true, x: { name: 'time' }, y: { name: 'rows' } });
    expect(coordinates.systems.compact.x.name).toBe('track');
    expect(coordinates.systems.hypeCycle.snapping?.byGesture?.drop.x).toEqual({ calendar: { unit: { attribute: 'unit' } }, direction: 'floor' });
  });

  it('have the month axis counted from its origin, in the unit the diagram holds', () => {
    expect(time).toMatchObject({ kind: 'time', origin: ym('1900-01'), size: 4, unit: { attribute: 'unit' }, fallbackUnit: 'month', reversed: false });
    expect(coordinates.axes.rows).toMatchObject({ kind: 'linear', origin: 0, size: 56 });
    expect(scaleOf(time)).toMatchObject({ unit: 'month', months: 1, perUnit: 4 });
    expect(scaleOf(time, { unit: 'decade' })).toMatchObject({ unit: 'decade', months: 120 });
    // A unit the axis cannot be drawn in is the attribute's default.
    expect(scaleOf(time, { unit: 'fortnight' }).unit).toBe('month');
  });

  it('map every date of the shared scale fixture to its x, and back', () => {
    const fixture = json('fixtures/gartner-hypecycle-graph/scale-fixture.json') as {
      months: { date: string; x: number }[]; unitDates: { unit: string; date: string; x: number }[]; rows: { row: number; top: number }[];
    };
    for (const { date, x } of fixture.months) {
      expect(scaleOf(time).toCanvas(ym(date)), date).toBeCloseTo(x, 9);
      expect(scaleOf(time).toValue(x), date).toBeCloseTo(ym(date), 9);
    }
    for (const { unit, date, x } of fixture.unitDates) {
      expect(scaleOf(time, { unit }).toCanvas(ym(date)), `${date} in ${unit}`).toBeCloseTo(x, 9);
      expect(scaleOf(time, { unit }).toValue(x), `${date} in ${unit}`).toBeCloseTo(ym(date), 9);
    }
    const { y } = scalesOf(coordinates.systems.hypeCycle);
    for (const { row, top } of fixture.rows) {
      expect(y.toCanvas(row)).toBe(top);
      expect(y.toValue(top)).toBe(row);
    }
  });

  it('give the rows of the ruler that fit, the finest first, with ticks on round boundaries', () => {
    const view = { from: scaleOf(time).toCanvas(ym('1999-11')), to: scaleOf(time).toCanvas(ym('2001-02')), zoom: 1 };
    // At zoom 1 a month is 4 pixels wide, a quarter 12 and a year 48: the decade is the first row with 64.
    const rows = rulerRows(time, {}, view);
    expect(rows.map((row) => [row.unit, row.spacing])).toEqual([['decade', 480], ['century', 4800], ['millennium', 48000]]);
    expect(rows[0].ticks).toEqual([{ value: ym('2000-01'), at: 4800, label: '2000' }]);
    const near = rulerRows(time, {}, { ...view, zoom: 16 });
    expect(near.map((row) => row.unit)).toEqual(['month', 'quarter', 'year', 'decade', 'century', 'millennium']);
    expect(near[0].ticks.map((tick) => tick.label).slice(0, 3)).toEqual(['Nov 1999', 'Dec 1999', 'Jan 2000']);
    expect(near[1].ticks.map((tick) => tick.label)).toEqual(['Jan 2000', 'Apr 2000', 'Jul 2000', 'Oct 2000', 'Jan 2001']);
    expect(near[2].ticks.map((tick) => [tick.label, tick.at])).toEqual([['2000', 4800], ['2001', 4848]]);
  });

  it('never show a row finer than a step of the unit of the diagram, at any zoom', () => {
    const scale = scaleOf(time, { unit: 'year' });
    const rows = rulerRows(time, { unit: 'year' }, { from: scale.toCanvas(ym('-0002-01')), to: scale.toCanvas(ym('0001-01')), zoom: 1000 });
    expect(rows.map((row) => row.unit)).toEqual(['year', 'decade', 'century', 'millennium']);
    expect(rows[0].ticks.map((tick) => tick.label)).toEqual(['-0002', '-0001', '0000', '0001']);
    expect(rows[1].ticks.map((tick) => tick.value)).toEqual([0]);
    expect(rulerRows(coordinates.axes.rows, {}, { from: 0, to: 100, zoom: 1 })).toEqual([]);
  });
});

describe('coordinates in general', () => {
  it('are one canvas of pixels when a specification declares none', () => {
    const { value, findings } = interpret({ disl: '0.3', language: { id: 'a.b', version: '1.0.0' }, metamodel: {} });
    expect(findings).toEqual([]);
    expect(value).toBe(defaultCoordinates);
    expect(scaleOf(value.systems.canvas.x).toCanvas(12)).toBe(12);
  });

  it('read the coordinates of another tool type without a finding', () => {
    const { value, findings } = interpret(mindmapJson());
    expect(findings).toEqual([]);
    expect(Object.keys(value.systems)).toContain(value.default);
  });

  it('know the months of a unit, and no unit finer than a month', () => {
    expect(['month', 'quarter', 'year', 'decade', 'century', 'millennium'].map(monthsIn)).toEqual([1, 3, 12, 120, 1200, 12000]);
    expect(monthsIn('day')).toBeUndefined();
    expect(unitOf({ attribute: 'step' }, { step: 'quarter' })).toBe('quarter');
    expect(unitOf({ attribute: 'step' }, {}, 'year')).toBe('year');
  });

  it('run a reversed axis and a y axis that points up against the canvas', () => {
    const { value } = interpret(withCoordinates({
      axes: { across: { kind: 'linear', scale: 2, origin: 10, reversed: true }, up: { kind: 'linear', scale: 5 } },
      systems: { plan: { kind: 'cartesian', x: 'across', y: 'up', orientation: 'y-up' } },
    }));
    const { x, y } = scalesOf(value.systems.plan);
    expect([x.toCanvas(12), x.toValue(-4)]).toEqual([-4, 12]);
    expect([y.toCanvas(3), y.toValue(-15), y.perUnit]).toEqual([-15, 3, -5]);
    expect(value.default).toBe('plan');
  });

  it('place a date at its days since the origin, a time of day as a fraction (DISL 5.4, `datetime`)', () => {
    const { value, findings } = interpret(withCoordinates({
      axes: { time: { kind: 'time', valueType: 'datetime', origin: '1970-01-01T00:00:00Z', scale: { unit: 'day', size: 20 } }, weeks: { kind: 'time', scale: { unit: 'week', size: 70 } } },
      systems: { timeline: { kind: 'cartesian', x: 'time', y: 'weeks' } },
    }));
    expect(findings).toEqual([]);
    const { x, y } = scalesOf(value.systems.timeline);
    expect([x.valueOf('1970-01-11'), x.valueOf('2025-04-27T18:00'), x.valueOf('2025-04-27T20:00:00+02:00'), x.valueOf('0079-08-24'), x.valueOf('2026-02-30'), x.valueOf(3)])
      .toEqual([10, 20205.75, 20205.75, new Date(0).setUTCFullYear(79, 7, 24) / 86_400_000, undefined, undefined]);
    expect([x.toCanvas(10), x.toValue(210), y.perUnit]).toEqual([200, 10.5, 10]);
  });

  it('give a date axis whose ruler lists no levels the calendar\'s levels, from a day to a thousand years, labelled as standalone labels them', () => {
    const { value } = interpret(withCoordinates({
      axes: { time: { kind: 'time', valueType: 'datetime', origin: '1970-01-01T00:00:00Z', scale: { unit: 'day', size: 20 }, ruler: { visible: true, position: 'bottom' } } },
      systems: { timeline: { kind: 'cartesian', x: 'time', y: 'time' } },
    }));
    const axis = value.axes.time;
    expect(axis.ruler?.levels?.map((level) => `${level.step} ${level.unit}`)).toEqual(['1 day', '1 week', '1 month', '1 quarter', '1 year', '2 year', '5 year', '10 year', '25 year', '50 year', '100 year', '250 year', '500 year', '1000 year']);
    // 2025-04-27 to 2025-07-03, at zoom 4: a day is 80 pixels.
    const [from, to] = [20_205 * 20, 20_272 * 20];
    const rows = rulerRows(axis, {}, { from, to, zoom: 4 });
    const labels = (unit: string, step = 1): string[] => rows.find((row) => row.unit === unit && row.step === step)!.ticks.map((tick) => tick.label);
    expect(labels('day').slice(0, 6)).toEqual(['Apr 27', 'Apr 28', 'Apr 29', 'Apr 30', 'May 2025', 'May 2']);
    expect(labels('month')).toEqual(['May 2025', 'Jun 2025', 'Jul 2025']);
    expect(rows.find((row) => row.unit === 'day')!.ticks[4]).toMatchObject({ value: 20_209, at: 20_209 * 20 });
    // Zoomed out so far that a day is a twentieth of a pixel, only the levels whose labels stand 80 pixels apart are left.
    const wide = rulerRows(axis, {}, { from: -720_000 * 20, to: 21_000 * 20, zoom: 0.0005 });
    expect(wide.map((row) => `${row.step} ${row.unit}`)).toEqual(['25 year', '50 year', '100 year', '250 year', '500 year', '1000 year']);
    expect(wide.find((row) => row.step === 1000)!.ticks.map((tick) => tick.label)).toEqual(['0', '1000', '2000']);
  });

  it('report what they cannot draw, and draw the nearest thing', () => {
    const { value, findings } = interpret(withCoordinates({
      axes: { lanes: { kind: 'ordinal' }, when: { kind: 'time', origin: 'now', scale: { unit: 'month' } }, months: { kind: 'time', valueType: 'yearMonth', origin: 'soon', scale: { unit: 'day', size: 2 } } },
      systems: { wheel: { kind: 'polar', x: 'lanes', y: 'nowhere', snapping: 'missing' } },
      default: 'other',
    }));
    expect(findings.map((finding) => finding.message)).toEqual([
      'The axis `lanes` is a `ordinal` axis, which this add-on does not draw; it is read as a linear axis.',
      'The axis `when` places dates by `month`, a unit of no fixed length; it is drawn in days.',
      'The origin of the axis `when` is not a date, so the axis starts at 1970-01-01.',
      'The axis `months` places by month, and the unit `day` of its scale is finer than a month; it is drawn in months.',
      'The origin of the axis `months` is not a year and a month, so the axis starts at year 0.',
      'The coordinate system `wheel` is `polar`, which this add-on does not draw; it is read as cartesian.',
      'The coordinate system `wheel` names the snap profile `missing`, which is not declared.',
      'The coordinate system `wheel` names the axis `nowhere`, which is not declared; a linear axis is used.',
      'The default coordinate system `other` is not declared; `wheel` is used.',
    ]);
    expect(findings.every((finding) => finding.code === 'disl.coordinates' && finding.severity === 'warning')).toBe(true);
    expect(value.axes.months).toMatchObject({ kind: 'time', origin: 0, size: 2, unit: 'month' });
    expect(value.default).toBe('wheel');
  });
});
