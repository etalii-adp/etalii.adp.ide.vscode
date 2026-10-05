import { roundAwayFromZero, toNearestRow } from '../text/rounding';
import { monthUnit, type TimeUnit } from './model';

// The time scale and the rows, stated once. Every step of a diagram's unit is four canvas units
// wide from a fixed origin of 1900-01, so x is a pure function of a date. Both ADP hosts are
// asserted against the one scale-fixture.json.

export const unitsPerStep = 4;
export const originDate = '1900-01';
export const trendHeight = 32;
/** A trigger's diameter: half a trend's height. */
export const triggerSize = trendHeight / 2;
/** The distance between two rows: a trend's height plus a 24-unit gutter for influences. */
export const rowStep = 56;
export const originMonth = 1900 * 12;

export function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/**
 * A `YYYY-MM` date as a month index, or undefined. A year before 1 is signed and astronomical, so
 * `0000` is 1 BCE and `-3200` is 3201 BCE, with four to six digits after the sign.
 */
export function parseMonth(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const match = /^(-\d{4,6}|\d{4})-(\d{2})$/.exec(text.trim());
  if (!match) return undefined;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? monthIndex(Number(match[1]), month) : undefined;
}

/** A month index as the document writes it: `YYYY-MM`, or `-YYYY-MM` before year 0. */
export function formatMonth(index: number): string {
  const year = Math.floor(index / 12);
  const month = index - year * 12;
  return `${year < 0 ? '-' : ''}${String(Math.abs(year)).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}`;
}

/** The canvas x of the start of a month, in a diagram drawn in `unit`. */
export function xOf(index: number, unit: TimeUnit = monthUnit): number {
  return ((index - originMonth) * unitsPerStep) / unit.months;
}

/** The start of the step nearest `x`: what a move or a resize snaps to. */
export function nearestMonthAt(x: number, unit: TimeUnit = monthUnit): number {
  return originMonth + roundAwayFromZero(x / unitsPerStep) * unit.months;
}

/** The start of the step `x` falls inside: what a toolbox drop means. */
export function monthContaining(x: number, unit: TimeUnit = monthUnit): number {
  return originMonth + Math.floor(x / unitsPerStep) * unit.months;
}

export function widthOf(months: number, unit: TimeUnit = monthUnit): number {
  return (months * unitsPerStep) / unit.months;
}

export function topOf(row: number): number {
  return row * rowStep;
}

/** The row whose top edge is nearest `top`: what a move snaps to. */
export function rowAtTop(top: number): number {
  return toNearestRow(top, rowStep);
}

/** The row whose vertical middle is nearest `y`: what a drop snaps to. */
export function rowAtMiddle(y: number): number {
  return rowAtTop(y - trendHeight / 2);
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDate(index: number, unit: TimeUnit, long: boolean): string {
  const year = Math.floor(index / 12);
  if (unit.months > 1) return String(year);
  const name = monthNames[index - year * 12];
  return `${long ? name : name.slice(0, 3)} ${year}`;
}

/** A date as a trigger's label writes it: `Dec 1947` in a diagram of months, the year alone in a coarser one. */
export function formatWhen(index: number, unit: TimeUnit): string {
  return formatDate(index, unit, false);
}

/** The same date in full, for a tooltip: `December 1947`, or the year alone. */
export function formatWhenLong(index: number, unit: TimeUnit): string {
  return formatDate(index, unit, true);
}