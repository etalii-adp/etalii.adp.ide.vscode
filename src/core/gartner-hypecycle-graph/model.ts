import type { LineRange } from '../text/lineDocument';
import { roundHalfEven } from '../text/rounding';

/** The step a diagram's time axis is drawn and snapped in. The dates stay months whatever the unit. */
export interface TimeUnit {
  readonly name: 'month' | 'year' | 'decade' | 'century';
  readonly months: number;
}

export const timeUnits: readonly TimeUnit[] = [
  { name: 'month', months: 1 },
  { name: 'year', months: 12 },
  { name: 'decade', months: 120 },
  { name: 'century', months: 1200 },
];

export const monthUnit: TimeUnit = timeUnits[0];

export function timeUnitNamed(name: string | undefined): TimeUnit | undefined {
  return timeUnits.find((unit) => unit.name === name?.trim());
}

/** One trend entry and the lines that declare it. Dates are month indices, `year * 12 + month - 1`. */
export interface Trend {
  readonly id: string;
  readonly name: string;
  readonly start: number | undefined;
  readonly stop: number | undefined;
  readonly row: number;
  /** How many phases are visible, as written. Outside 1 to 4 opens and is reported. */
  readonly phases: number;
  /** The stored inner boundaries: 0 is `peak-end`, 1 `trough-end`, 2 `slope-end`; undefined when never dragged. */
  readonly draggedEnds: readonly (number | undefined)[];
  readonly tags: readonly string[];
  readonly description: string;
  readonly range: LineRange;
}

export interface Trigger {
  readonly id: string;
  readonly name: string;
  readonly date: number | undefined;
  readonly row: number;
  readonly tags: readonly string[];
  readonly description: string;
  readonly range: LineRange;
}

export interface Note {
  readonly id: string;
  readonly text: string;
  readonly at: number | undefined;
  readonly row: number;
  readonly width: number | undefined;
  readonly height: number | undefined;
  readonly range: LineRange;
}

/** Where one end of an influence attaches, exactly as the document states it. */
export interface End {
  readonly phase: string;
  readonly edge: string;
  readonly at: number | undefined;
}

export interface Influence {
  readonly id: string;
  readonly from: string;
  /** `noEnd` when it leaves a trigger, which has no phases. */
  readonly fromEnd: End;
  readonly to: string;
  readonly toEnd: End;
  readonly description: string;
  readonly range: LineRange;
}

/** Something the parser could not read, and the zero-based line it was found on. */
export interface Problem {
  readonly line: number;
  readonly message: string;
}

/** Everything one `.ghg` document declares, and what the parser could not read. */
export interface Model {
  readonly trends: readonly Trend[];
  readonly triggers: readonly Trigger[];
  readonly notes: readonly Note[];
  readonly influences: readonly Influence[];
  readonly problems: readonly Problem[];
  readonly version: number | undefined;
  readonly unit: TimeUnit;
  /** False when the text could not be read as YAML at all: the diagram is then empty and read-only. */
  readonly readable: boolean;
}

export const currentVersion = 1;
export const headerKey = 'gartner-hypecycle-graph';

export const emptyModel: Model = { trends: [], triggers: [], notes: [], influences: [], problems: [], version: undefined, unit: monthUnit, readable: true };

export const phaseCount = 4;
export const phaseNames = ['peak', 'trough', 'slope', 'plateau'] as const;
export const phaseTitles = ['Peak', 'Trough', 'Slope', 'Plateau'] as const;
export const gartnerNames = ['Peak of Inflated Expectations', 'Trough of Disillusionment', 'Slope of Enlightenment', 'Plateau of Productivity'] as const;
/** The document key of each inner boundary: the end of the phase it closes. */
export const boundaryKeys = ['peak-end', 'trough-end', 'slope-end'] as const;

export const topEdge = 'top';
export const bottomEdge = 'bottom';
export const noEnd: End = { phase: '', edge: '', at: undefined };

export function hasSpan(trend: Pick<Trend, 'start' | 'stop'>): trend is { start: number; stop: number } {
  return trend.start !== undefined && trend.stop !== undefined && trend.stop > trend.start;
}

export function monthsOf(trend: Pick<Trend, 'start' | 'stop'>): number {
  return hasSpan(trend) ? trend.stop - trend.start : 0;
}

/** The phase count clamped into 1 to 4, which is what is drawn. */
export function visiblePhases(trend: Pick<Trend, 'phases'>): number {
  return Math.min(Math.max(trend.phases, 1), phaseCount);
}

export function isPlaceable(note: Pick<Note, 'at' | 'width' | 'height'>): note is { at: number; width: number; height: number } {
  return note.at !== undefined && note.width !== undefined && note.width > 0 && note.height !== undefined && note.height > 0;
}

export function phaseIndexOf(name: string | undefined): number {
  return phaseNames.indexOf(name as (typeof phaseNames)[number]);
}

export function isNoEnd(end: End): boolean {
  return end.phase.length === 0 && end.edge.length === 0 && end.at === undefined;
}

/** Whether every part of the end reads: a known phase, a known edge and an `at` in 0 to 1. */
export function isReadableEnd(end: End): end is End & { at: number } {
  return phaseIndexOf(end.phase) >= 0 && (end.edge === topEdge || end.edge === bottomEdge) && end.at !== undefined && end.at >= 0 && end.at <= 1;
}

/** The `at` as the document writes it: at most two decimals, at least one. */
export function formatAt(at: number): string {
  const rounded = roundHalfEven(at * 100) / 100;
  const text = rounded.toFixed(2);
  return text.endsWith('0') ? text.slice(0, -1) : text;
}

/** The end as the property grid and a gesture write it: `phase/edge/at`. */
export function formatEnd(end: End): string {
  return `${end.phase}/${end.edge}/${end.at === undefined ? '' : formatAt(end.at)}`;
}

/** Reads `phase/edge/at`; undefined for anything that is not a readable end. */
export function parseEnd(text: string | undefined): End | undefined {
  const parts = (text ?? '').trim().split('/');
  if (parts.length !== 3) return undefined;
  const at = parseNumber(parts[2]);
  if (at === undefined) return undefined;
  const end: End = { phase: parts[0].trim(), edge: parts[1].trim(), at: roundHalfEven(at * 100) / 100 };
  return isReadableEnd(end) ? end : undefined;
}

/** A floating-point number as the document writes one, or undefined. */
export function parseNumber(text: string | undefined): number | undefined {
  if (text === undefined || !/^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

/** A whole number as the document writes one, or undefined. */
export function parseInteger(text: string | undefined): number | undefined {
  if (text === undefined || !/^\s*[+-]?\d+\s*$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isSafeInteger(value) && Math.abs(value) <= 2147483647 ? value : undefined;
}