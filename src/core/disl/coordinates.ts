// The coordinate systems of a specification (DISL 5): axes that map domain values to canvas units
// and back, the systems that pair them, and the rows of a ruler as data. Placement and snapping
// are declared with them and are carried as they are written, for the scene and the gestures.

import { formatPattern } from './expressions';
import { defaultOf, parseYearMonth, type Metamodel } from './metamodel';
import { finding, type Attributes, type Finding, type Loaded } from './model';
import { isObject, type CelValue, type Doc, type LocalizedText, type Specification } from './specification';

// ---- as the schema has them ----

/** The time units of DISL (5.5). On a month axis only `month` and coarser are allowed (DISL 5.5). */
export type UnitOfTime = 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year' | 'decade' | 'century' | 'millennium';

/** A unit, or the attribute of the diagram that holds one (DISL 5.5, bound unit). */
export type BoundUnit = UnitOfTime | { readonly attribute: string };

/** One row of a ruler (DISL 5.13). */
export interface RulerLevel {
  readonly unit: UnitOfTime;
  readonly step?: number;
  readonly format?: string;
  readonly minSpacingPx?: number;
  readonly minZoom?: number;
  readonly maxZoom?: number;
}

export interface Ruler {
  readonly visible?: boolean;
  readonly position?: 'top' | 'bottom' | 'left' | 'right';
  readonly size?: number;
  readonly levels?: readonly RulerLevel[];
  readonly attach?: 'view' | 'canvas';
  readonly minUnit?: BoundUnit;
  readonly [name: string]: unknown;
}

/** `$defs/SnapRule`, as far as it is declared with a coordinate system or a node (DISL 5.10). */
export interface SnapRule {
  readonly grid?: { readonly spacing: number | { readonly unit: UnitOfTime }; readonly offset?: number };
  readonly calendar?: { readonly unit: BoundUnit; readonly step?: number; readonly align?: 'start' | 'end' | 'nearest' };
  readonly values?: readonly number[];
  readonly cel?: string;
  readonly direction?: 'nearest' | 'floor' | 'ceil';
  readonly ties?: string;
  readonly [name: string]: unknown;
}

/** `$defs/Snapping` (DISL 5.9): a rule for each axis, and the rules of single gestures. */
export interface Snapping {
  readonly x?: SnapRule;
  readonly y?: SnapRule;
  readonly reference?: string;
  readonly byGesture?: Readonly<Record<string, { readonly x?: SnapRule; readonly y?: SnapRule }>>;
  readonly doc?: Doc;
  readonly [name: string]: unknown;
}

/** `$defs/PlacementSource` (DISL 5.8): where one coordinate of an element comes from. */
export type PlacementSource =
  | 'free'
  | { readonly attribute: string; readonly offset?: number | string; readonly doc?: Doc }
  | (CelValue & { readonly write?: unknown })
  | { readonly layout: true };

export type AnchorName = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';

/** `$defs/Placement` (DISL 5.8). */
export interface Placement {
  readonly system?: string;
  readonly x?: PlacementSource;
  readonly y?: PlacementSource;
  readonly x2?: PlacementSource;
  readonly y2?: PlacementSource;
  readonly width?: PlacementSource;
  readonly height?: PlacementSource;
  readonly anchor?: AnchorName | readonly [number, number];
  readonly movable?: boolean | { readonly x?: boolean; readonly y?: boolean };
  readonly resizable?: boolean | { readonly x?: boolean; readonly y?: boolean };
  readonly doc?: Doc;
  readonly [name: string]: unknown;
}

// ---- interpreted ----

export interface Axis {
  readonly name: string;
  /** `linear`, or `time` over months or over dates; another kind is read as `linear` and reported. */
  readonly kind: 'linear' | 'time';
  /** What a time axis holds (DISL 5.4): months (`yearMonth`), or dates and times (`datetime`), whose domain value is days since 1970. */
  readonly valueType?: 'yearMonth' | 'datetime';
  readonly label?: LocalizedText;
  /** The domain value at canvas 0: a number, or the month index of a month axis. */
  readonly origin: number;
  /** Canvas units for one domain unit of a linear axis, or for one step of `unit` on a month axis. */
  readonly size: number;
  /** The step of a month axis, and the unit it falls back on when the diagram's attribute holds none. */
  readonly unit?: BoundUnit;
  readonly fallbackUnit?: UnitOfTime;
  readonly reversed: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly ruler?: Ruler;
}

export interface CoordinateSystem {
  readonly name: string;
  readonly x: Axis;
  readonly y: Axis;
  readonly orientation: 'y-down' | 'y-up';
  readonly infinite: boolean;
  readonly grid: Readonly<Record<string, unknown>>;
  readonly snapping?: Snapping;
  readonly label?: LocalizedText;
}

export interface Coordinates {
  readonly axes: Readonly<Record<string, Axis>>;
  readonly systems: Readonly<Record<string, CoordinateSystem>>;
  /** The system of a viewpoint that names none. */
  readonly default: string;
}

/** An axis for one diagram: domain values to canvas units at zoom 1, and back. */
export interface Scale {
  /** The step a month axis is drawn in, and how many months it spans. */
  readonly unit?: UnitOfTime;
  readonly months?: number;
  /** Canvas units for one domain unit: a number of a linear axis, a month of a month axis. Negative when reversed. */
  readonly perUnit: number;
  toCanvas(value: number): number;
  toValue(canvas: number): number;
  /** The domain value of what an attribute stores: a date or a date and time on a `datetime` axis, else a number. */
  valueOf(stored: unknown): number | undefined;
  /**
   * What an attribute stores for a domain value, the inverse of `valueOf`: on a `datetime` axis the date (`2025-04-27`)
   * where `like`, the value it replaces, is a date or there is none, else the date and time in whole seconds; else the number.
   */
  textOf(value: number, like?: unknown): number | string;
  /** Whether a stored value is a date and a time of day on a `datetime` axis, which calendar snapping leaves where it is. */
  timed(stored: unknown): boolean;
}

export interface RulerTick {
  /** The domain value the tick stands at, and where that is in canvas units. */
  readonly value: number;
  readonly at: number;
  readonly label: string;
}

export interface RulerRow {
  readonly unit: UnitOfTime;
  readonly step: number;
  readonly format: string;
  /** Canvas units between two ticks. */
  readonly spacing: number;
  readonly ticks: readonly RulerTick[];
}

// ---- time units ----

const daysByUnit: Partial<Record<UnitOfTime, number>> = { millisecond: 1 / 86_400_000, second: 1 / 86_400, minute: 1 / 1440, hour: 1 / 24, day: 1, week: 7 };

/** The days in one step of a unit of fixed length, or nothing for a month and coarser. */
export const daysIn = (unit: unknown): number | undefined => (typeof unit === 'string' && Object.hasOwn(daysByUnit, unit) ? daysByUnit[unit as UnitOfTime] : undefined);

const instant = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})?)?$/i;

/**
 * The days since 1970-01-01 of an ISO 8601 date or date and time, a time of day as a fraction (DISL 4.2, `datetime`),
 * taken at face value: an offset is read, and a time without one is at offset zero. Nothing for another text.
 */
export function daysOf(text: string): number | undefined {
  const parts = instant.exec(text.trim());
  if (!parts) return undefined;
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map((part) => (part === undefined ? 0 : Number(part)));
  const at = new Date(0);
  at.setUTCFullYear(year, month - 1, day);
  at.setUTCHours(hour, minute, second, parts[7] === undefined ? 0 : Math.floor(Number(`0.${parts[7]}`) * 1000));
  if (at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) return undefined;
  const offset = parts[8] === undefined || parts[8].toUpperCase() === 'Z' ? 0 : (parts[8].startsWith('-') ? -1 : 1) * (Number(parts[8].slice(1, 3)) * 60 + Number(parts[8].slice(4, 6)));
  return (at.getTime() - offset * 60_000) / 86_400_000;
}

const monthsByUnit: Partial<Record<UnitOfTime, number>> = { month: 1, quarter: 3, year: 12, decade: 120, century: 1200, millennium: 12000 };

/** The months in one step of a unit, or nothing for a unit finer than a month. */
export const monthsIn = (unit: unknown): number | undefined => (typeof unit === 'string' && Object.hasOwn(monthsByUnit, unit) ? monthsByUnit[unit as UnitOfTime] : undefined);

/** The unit a bound unit stands for in a diagram: the attribute's value, else the fallback. */
export function unitOf(unit: BoundUnit | undefined, diagram: Attributes, fallback: UnitOfTime = 'month'): UnitOfTime {
  const value = isObject(unit) ? diagram[unit.attribute] : unit;
  return monthsIn(value) === undefined ? fallback : (value as UnitOfTime);
}

// ---- reading ----

const linear = (name: string): Axis => ({ name, kind: 'linear', origin: 0, size: 1, reversed: false });
const canvas: CoordinateSystem = { name: 'canvas', x: linear('px'), y: linear('px'), orientation: 'y-down', infinite: true, grid: {} };

/** With no `coordinates`, one cartesian system `canvas` of two linear pixel axes (DISL 5.2). */
export const defaultCoordinates: Coordinates = { axes: { px: linear('px') }, systems: { canvas }, default: 'canvas' };

const fractions: Readonly<Record<string, number>> = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };

/** The point of a node its position refers to, as fractions of its width and its height (DISL 5.8): its top-left corner unless its placement says otherwise. */
export function anchorOf(anchor: Placement['anchor']): readonly [number, number] {
  if (anchor === undefined) return [0, 0];
  if (typeof anchor !== 'string') return anchor;
  return [fractions[anchor.split('-').find((word) => word === 'left' || word === 'right') ?? 'center'], fractions[anchor.split('-').find((word) => word === 'top' || word === 'bottom') ?? 'center']];
}

/** Interprets `coordinates`. What is not supported is read as the nearest thing that is, and reported. */
export function interpretCoordinates(specification: Specification, metamodel: Metamodel): Loaded<Coordinates> {
  const section = specification.coordinates;
  if (!section) return { value: defaultCoordinates, findings: [] };
  const findings: Finding[] = [];
  const report = (message: string): void => void findings.push(finding('disl.coordinates', 'warning', message));
  const number = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

  const axis = (name: string, declared: unknown): Axis => {
    if (!isObject(declared)) {
      report(`The axis \`${name}\` is not an object, so it is read as a linear axis.`);
      return linear(name);
    }
    const common = {
      name,
      label: declared.label as LocalizedText | undefined,
      reversed: declared.reversed === true,
      ruler: isObject(declared.ruler) ? (declared.ruler as Ruler) : undefined,
    };
    if (declared.kind === 'time' && declared.valueType === 'yearMonth') {
      const scale = isObject(declared.scale) ? declared.scale : {};
      const month = (value: unknown): number | undefined => (typeof value === 'string' ? parseYearMonth(value) : undefined);
      const bound = isObject(scale.unit) && typeof scale.unit.attribute === 'string' ? scale.unit.attribute : undefined;
      const unit = (bound === undefined ? scale.unit : { attribute: bound }) as BoundUnit | undefined;
      if (bound === undefined && monthsIn(unit ?? 'month') === undefined) report(`The axis \`${name}\` places by month, and the unit \`${String(scale.unit)}\` of its scale is finer than a month; it is drawn in months.`);
      if (bound !== undefined && !Object.hasOwn(metamodel.diagram, bound)) report(`The axis \`${name}\` takes its unit from the diagram's attribute \`${bound}\`, which the metamodel does not declare; it is drawn in months.`);
      const fallback = bound === undefined ? undefined : defaultOf(metamodel.diagram[bound] ?? { type: 'string' });
      if (declared.origin !== undefined && month(declared.origin) === undefined) report(`The origin of the axis \`${name}\` is not a year and a month, so the axis starts at year 0.`);
      return {
        ...common, kind: 'time', valueType: 'yearMonth', origin: month(declared.origin) ?? 0, size: number(scale.size, 1),
        unit: bound === undefined ? unitOf(unit, {}) : unit,
        fallbackUnit: unitOf(fallback as UnitOfTime | undefined, {}),
        min: month(declared.min), max: month(declared.max),
      };
    }
    if (declared.kind === 'time' && (declared.valueType ?? 'datetime') === 'datetime') {
      const scale = isObject(declared.scale) ? declared.scale : {};
      const days = daysIn(scale.unit ?? 'day');
      if (days === undefined) report(`The axis \`${name}\` places dates by \`${String(scale.unit)}\`, a unit of no fixed length; it is drawn in days.`);
      const origin = typeof declared.origin === 'string' ? daysOf(declared.origin) : undefined;
      if (declared.origin !== undefined && origin === undefined) report(`The origin of the axis \`${name}\` is not a date, so the axis starts at 1970-01-01.`);
      // A ruler that lists no levels steps through the calendar as the zoom allows (`ruler.adaptive`), never finer than a day.
      const ruler = common.ruler && common.ruler.levels === undefined ? { ...common.ruler, levels: dateLadder } : common.ruler;
      return {
        ...common, ruler, kind: 'time', valueType: 'datetime', origin: origin ?? 0, size: number(scale.size, 1) / (days ?? 1),
        unit: 'day', min: typeof declared.min === 'string' ? daysOf(declared.min) : undefined, max: typeof declared.max === 'string' ? daysOf(declared.max) : undefined,
      };
    }
    if (declared.kind !== 'linear') {
      const kind = declared.kind === 'time' ? `time axis of \`${String(declared.valueType ?? 'datetime')}\` values` : `\`${String(declared.kind)}\` axis`;
      report(`The axis \`${name}\` is a ${kind}, which this add-on does not draw; it is read as a linear axis.`);
    }
    return {
      ...common, kind: 'linear', origin: number(declared.origin, 0), size: number(declared.scale, 1),
      min: typeof declared.min === 'number' ? declared.min : undefined, max: typeof declared.max === 'number' ? declared.max : undefined,
    };
  };

  const axes: Record<string, Axis> = {};
  for (const [name, declared] of Object.entries(isObject(section.axes) ? section.axes : {})) axes[name] = axis(name, declared);
  const profiles = isObject(section.snapProfiles) ? section.snapProfiles : {};

  const systems: Record<string, CoordinateSystem> = {};
  for (const [name, declared] of Object.entries(isObject(section.systems) ? section.systems : {})) {
    if (!isObject(declared)) continue;
    if (declared.kind !== 'cartesian') report(`The coordinate system \`${name}\` is \`${String(declared.kind)}\`, which this add-on does not draw; it is read as cartesian.`);
    const along = (key: 'x' | 'y'): Axis => {
      const value = declared[key];
      if (typeof value !== 'string') return value === undefined ? linear('px') : axis(`${name}.${key}`, value);
      if (!Object.hasOwn(axes, value)) report(`The coordinate system \`${name}\` names the axis \`${value}\`, which is not declared; a linear axis is used.`);
      return axes[value] ?? linear(value);
    };
    const snapping = typeof declared.snapping === 'string' ? profiles[declared.snapping] : declared.snapping;
    if (typeof declared.snapping === 'string' && !isObject(snapping)) report(`The coordinate system \`${name}\` names the snap profile \`${declared.snapping}\`, which is not declared.`);
    systems[name] = {
      name, x: along('x'), y: along('y'),
      orientation: declared.orientation === 'y-up' ? 'y-up' : 'y-down',
      infinite: declared.infinite !== false && declared.bounds === undefined,
      grid: isObject(declared.grid) ? declared.grid : {},
      snapping: isObject(snapping) ? (snapping as Snapping) : undefined,
      label: declared.label as LocalizedText | undefined,
    };
  }
  if (Object.keys(systems).length === 0) return { value: { ...defaultCoordinates, axes: { ...defaultCoordinates.axes, ...axes } }, findings };

  let chosen = typeof section.default === 'string' ? section.default : Object.keys(systems)[0];
  if (!Object.hasOwn(systems, chosen)) {
    report(`The default coordinate system \`${chosen}\` is not declared; \`${Object.keys(systems)[0]}\` is used.`);
    chosen = Object.keys(systems)[0];
  }
  return { value: { axes, systems, default: chosen }, findings };
}

// ---- mapping ----

/** An axis as one diagram draws it: a bound unit is read from the diagram's attributes. */
export function scaleOf(axis: Axis, diagram: Attributes = {}): Scale {
  const dates = axis.kind === 'time' && axis.valueType === 'datetime';
  const unit = dates ? 'day' : axis.kind === 'time' ? unitOf(axis.unit, diagram, axis.fallbackUnit) : undefined;
  const months = dates ? undefined : monthsIn(unit);
  // A date axis's size is already per day; a month axis's is per step of its unit.
  const perUnit = (axis.reversed ? -1 : 1) * (axis.size / (months ?? 1));
  return {
    unit, months, perUnit,
    toCanvas: (value) => (value - axis.origin) * perUnit,
    toValue: (at) => (perUnit === 0 ? axis.origin : at / perUnit + axis.origin),
    valueOf: (stored) => {
      if (dates) return typeof stored === 'string' ? daysOf(stored) : undefined;
      return typeof stored === 'number' && Number.isFinite(stored) ? stored : undefined;
    },
    textOf: (value, like) => (dates ? dateTextOf(value, timed(like)) : value),
    timed: (stored) => dates && timed(stored),
  };
}

/** The two axes of a system for one diagram. With y upwards, the y axis runs against the canvas. */
export function scalesOf(system: CoordinateSystem, diagram: Attributes = {}): { readonly x: Scale; readonly y: Scale } {
  const y = scaleOf(system.y, diagram);
  if (system.orientation === 'y-down') return { x: scaleOf(system.x, diagram), y };
  return { x: scaleOf(system.x, diagram), y: { ...y, perUnit: -y.perUnit, toCanvas: (value) => -y.toCanvas(value), toValue: (at) => y.toValue(-at) } };
}

// ---- rulers ----

const most = 2000;

/**
 * The rows of an axis's ruler between two canvas positions at a zoom, the finest first (DISL 5.13).
 * A row is shown while its labels are far enough apart on screen and its step is no shorter than
 * the ruler's `minUnit`. A tick stands on a round boundary of its unit, counted from year 0.
 */
export function rulerRows(axis: Axis, diagram: Attributes, view: { readonly from: number; readonly to: number; readonly zoom: number }, locale = 'en'): RulerRow[] {
  const ruler = axis.ruler;
  if (axis.kind !== 'time' || !ruler || ruler.visible === false) return [];
  if (axis.valueType === 'datetime') return dateRows(axis, ruler, view);
  const scale = scaleOf(axis, diagram);
  const least = ruler.minUnit === undefined ? 0 : monthsIn(unitOf(ruler.minUnit, diagram, axis.fallbackUnit)) ?? 0;
  const perMonth = Math.abs(scale.perUnit);
  const rows: RulerRow[] = [];
  for (const level of ruler.levels ?? []) {
    const step = Math.max(1, level.step ?? 1);
    const months = (monthsIn(level.unit) ?? 0) * step;
    const spacing = months * perMonth;
    if (months === 0 || months < least || spacing * view.zoom < (level.minSpacingPx ?? 0)) continue;
    if (view.zoom < (level.minZoom ?? 0) || view.zoom > (level.maxZoom ?? Infinity)) continue;
    const [low, high] = [scale.toValue(view.from), scale.toValue(view.to)].sort((a, b) => a - b);
    const ticks: RulerTick[] = [];
    for (let value = Math.ceil(low / months) * months || 0; value <= high && ticks.length < most; value += months) {
      ticks.push({ value, at: scale.toCanvas(value), label: formatPattern(value, level.format ?? 'uuuu-MM', locale) });
    }
    rows.push({ unit: level.unit, step, format: level.format ?? 'uuuu-MM', spacing, ticks });
  }
  return rows;
}

/** A day count since 1970 as ISO 8601: the date of its day, or the date and time in whole seconds. */
// A date and a time of day, as written: the date, then `T` or a space, then the time.
const timed = (stored: unknown): boolean => typeof stored === 'string' && /\d[T ]\d/i.test(stored.trim());

export function dateTextOf(days: number, withTime = false): string {
  const at = new Date(Math.round(days * 86_400) * 1000);
  const two = (n: number): string => String(n).padStart(2, '0');
  const date = `${String(at.getUTCFullYear()).padStart(4, '0')}-${two(at.getUTCMonth() + 1)}-${two(at.getUTCDate())}`;
  return withTime ? `${date}T${two(at.getUTCHours())}:${two(at.getUTCMinutes())}:${two(at.getUTCSeconds())}` : date;
}

// ---- the ruler of a date axis ----

/** The levels of a ruler of dates that lists none: a day, a week, a month, a quarter, a year and runs of years, each a label 80 pixels from the next at least. */
const dateLadder: readonly RulerLevel[] = [
  ...(['day', 'week', 'month', 'quarter'] as const).map((unit) => ({ unit, step: 1, minSpacingPx: 80 })),
  ...[1, 2, 5, 10, 25, 50, 100, 250, 500, 1000].map((step) => ({ unit: 'year' as const, step, minSpacingPx: 80 })),
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;
const utc = (year: number, month: number, day = 1): number => new Date(0).setUTCFullYear(year, month, day) / DAY_MS;

/**
 * The rows of a ruler of dates, as standalone's timeline ruler labels them (`timelineTicks.ts`): a day or a week at
 * whole days since 1970, named by its month and day, or its month and year on the first; a month or a quarter on its
 * first day, named by its month and year, or its year in January; a run of years on the first of January of a year
 * divisible by the run. A level with more ticks than the view can hold is left out, the page showing a coarser one.
 */
function dateRows(axis: Axis, ruler: Ruler, view: { readonly from: number; readonly to: number; readonly zoom: number }): RulerRow[] {
  const scale = scaleOf(axis);
  const [low, high] = [scale.toValue(view.from), scale.toValue(view.to)].sort((a, b) => a - b);
  const rows: RulerRow[] = [];
  for (const level of ruler.levels ?? []) {
    const step = Math.max(1, level.step ?? 1);
    const fixed = daysIn(level.unit);
    const months = monthsIn(level.unit);
    const days = fixed === undefined ? (months ?? 0) * step * (365.2425 / 12) : fixed * step;
    const spacing = days * Math.abs(scale.perUnit);
    if (days === 0 || fixed !== undefined && fixed < 1 || spacing * view.zoom < (level.minSpacingPx ?? 0)) continue;
    if (view.zoom < (level.minZoom ?? 0) || view.zoom > (level.maxZoom ?? Infinity) || (high - low) / days > most) continue;
    const ticks: RulerTick[] = [];
    const tick = (value: number, label: string): void => { if (value >= low && value <= high) ticks.push({ value, at: scale.toCanvas(value), label }); };
    if (fixed !== undefined) {
      for (let value = Math.ceil(low / days) * days; value <= high; value += days) {
        const date = new Date(value * DAY_MS);
        tick(value, date.getUTCDate() === 1 ? `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}` : `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`);
      }
    } else {
      const span = months! * step;
      const first = new Date(low * DAY_MS);
      let index = Math.ceil((first.getUTCFullYear() * 12 + first.getUTCMonth()) / span) * span;
      for (let value = utc(Math.floor(index / 12), index % 12); value <= high; index += span, value = utc(Math.floor(index / 12), index % 12)) {
        const [year, month] = [Math.floor(index / 12), index % 12];
        tick(value, month === 0 ? String(year) : `${MONTH_NAMES[month]} ${year}`);
      }
    }
    rows.push({ unit: level.unit, step, format: 'adaptive', spacing, ticks });
  }
  return rows;
}
