// The timeline's reading of times (`net.etalii.adp.generic.timelineTimes`; etalii.adp spec 091, research R3), which
// DISL's CEL cannot do because it has no timestamps: a time is kept as the text it was written with, and read here
// as standalone's module reads it (`TimelineTimes.cs`, `TimelineInstants.cs`): trimmed, at face value, offset zero.
// .NET's invariant reading accepts more than ISO 8601, and the timeline's `findings` fixture holds what it accepts:
// a weekday that must be the date's, a month by name, `yyyy/MM/dd`, the month first in `MM/dd/yyyy`, `yyyy-MM`.
// Those forms are read here; one the fixtures and the examples do not hold is listed in `docs/parity.md`.

import type { CelFunctionsPlugin, PluginFunction } from '../../tool/pluginRegistry';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** A month or a weekday by its name or the name's first three letters, as .NET's invariant culture names them. */
const named = (names: readonly string[], word: string): number | undefined => {
  const lower = word.toLowerCase().replace(/\.$/, '');
  const index = names.findIndex((name) => name === lower || (lower.length === 3 && name.startsWith(lower)));
  return index < 0 ? undefined : index;
};

const monthOf = (word: string): number | undefined => {
  const index = named(MONTHS, word);
  return index === undefined ? undefined : index + 1;
};
const clock = String.raw`(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,7}))?)?)?(Z|[+-]\d{2}:\d{2})?`;
/** Each form read, with how its numbers and names give the year, the month (from 1) and the day. */
const forms: readonly [RegExp, (parts: readonly string[]) => [number, number | undefined, number]][] = [
  [new RegExp(`^(\\d{4})-(\\d{1,2})-(\\d{1,2})${clock}$`, 'i'), ([y, m, d]) => [Number(y), Number(m), Number(d)]],
  [new RegExp(`^(\\d{4})/(\\d{1,2})/(\\d{1,2})${clock}$`, 'i'), ([y, m, d]) => [Number(y), Number(m), Number(d)]],
  [new RegExp(`^(\\d{1,2})/(\\d{1,2})/(\\d{4})${clock}$`, 'i'), ([m, d, y]) => [Number(y), Number(m), Number(d)]],
  [new RegExp(`^(\\d{4})-(\\d{1,2})${clock}$`, 'i'), ([y, m]) => [Number(y), Number(m), 1]],
  [new RegExp(`^(\\d{1,2})\\s+([a-z]+\\.?)\\s+(\\d{4})${clock}$`, 'i'), ([d, m, y]) => [Number(y), monthOf(m), Number(d)]],
  [new RegExp(`^([a-z]+\\.?)\\s+(\\d{1,2}),?\\s+(\\d{4})${clock}$`, 'i'), ([m, d, y]) => [Number(y), monthOf(m), Number(d)]],
];

/** The instant `text` names, in milliseconds since 1970 at offset zero; nothing when it does not read. */
export function readTime(text: string): number | undefined {
  let rest = text.trim();
  // A leading weekday is read, and must be the date's own.
  const weekday = /^([a-z]+\.?),?\s+(?=\S)/i.exec(rest);
  const day = weekday ? named(WEEKDAYS, weekday[1]) : undefined;
  if (weekday && day !== undefined) rest = rest.slice(weekday[0].length);
  for (const [form, date] of forms) {
    const parts = form.exec(rest);
    if (!parts) continue;
    const [year, month, dayOfMonth] = date(parts.slice(1, 4));
    const [hour, minute, second] = parts.slice(4, 7).map((part) => (part === undefined ? 0 : Number(part)));
    if (month === undefined) return undefined;
    const at = new Date(0);
    at.setUTCFullYear(year, month - 1, dayOfMonth);
    at.setUTCHours(hour, minute, second, parts[7] === undefined ? 0 : Math.floor(Number(`0.${parts[7]}`) * 1000));
    // A day or an hour out of range is no time, rather than the next month's or day's.
    if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== dayOfMonth || hour > 23 || minute > 59 || second > 59) return undefined;
    if (day !== undefined && at.getUTCDay() !== day) return undefined;
    const offset = parts[8];
    if (offset === undefined || offset.toUpperCase() === 'Z') return at.getTime();
    const sign = offset.startsWith('-') ? -1 : 1;
    return at.getTime() - sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6))) * 60_000;
  }
  return undefined;
}

/** A time as a date, `yyyy-MM-dd`, as standalone's `TimelineScale.ToText` writes one. */
export function dateText(time: number): string {
  const at = new Date(time);
  return `${String(at.getUTCFullYear()).padStart(4, '0')}-${String(at.getUTCMonth() + 1).padStart(2, '0')}-${String(at.getUTCDate()).padStart(2, '0')}`;
}

const text = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('A timeline time function takes text.');
  return value;
};
const readable = (value: unknown): number => {
  const time = readTime(text(value));
  if (time === undefined) throw new Error(`'${text(value)}' is not a time this timeline can read.`);
  return time;
};
const DAY = 86_400_000;

const readableTime: PluginFunction = ([value]) => readTime(text(value)) !== undefined;
const compareTimes: PluginFunction = ([a, b]) => BigInt(Math.sign(readable(a) - readable(b)));
const dateAfter: PluginFunction = ([value, days]) => {
  if (typeof days !== 'bigint') throw new Error('dateAfter() takes a whole number of days.');
  return dateText(readable(value) + Number(days) * DAY);
};
const today: PluginFunction = () => dateText(Date.now());
/** The id the `source` or `target` end is written with, which the model holds as null where it names no element. */
const writtenEnd: PluginFunction = ([relation, end], _read, host) => {
  const written = end === 'source' || end === 'target' ? host(relation, end) : undefined;
  return written === undefined || written === null ? '' : String(written);
};

export const timelineTimes: CelFunctionsPlugin = { id: 'net.etalii.adp.generic.timelineTimes', functions: { readableTime, compareTimes, dateAfter, today, writtenEnd } };
