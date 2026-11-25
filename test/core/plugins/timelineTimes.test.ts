import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readTime, timelineTimes } from '../../../src/core/plugins/timeline-times/index';

// The timeline's time functions (etalii.adp spec 091, task T008), against what standalone's module reads: the times
// of the `findings` conformance fixture, which holds what .NET's invariant reading accepts and refuses, and every
// time the examples write.

const call = (name: string, ...args: unknown[]): unknown => timelineTimes.functions[name](args, () => undefined, (target, end) => (target as Record<string, unknown>)[end]);

describe('the timeline\'s time functions', () => {
  it('reads what standalone reads, as the findings fixture holds it', () => {
    const readable = ['2026-01-05', '2026-01-19', 'Tuesday 7 July 2026', 'July 21, 2026', '2026/07/01', '2026-08-01T10:00:00+02:00', '07/04/2026', '2026-07', '2026-03-10T09:30:15.25Z', '2026-03-01', '5 Jul 2026', '2026-12-31 23:59'];
    const unreadable = ['Monday 7 July 2026', '2026-02-30', '2026-11-31', '', 'someday'];
    expect(readable.filter((text) => call('readableTime', text) !== true)).toEqual([]);
    expect(unreadable.filter((text) => call('readableTime', text) !== false)).toEqual([]);
    expect(readTime('07/04/2026')).toBe(Date.UTC(2026, 6, 4));
    expect(readTime('2026-07')).toBe(Date.UTC(2026, 6, 1));
    expect(readTime('2026-08-01T10:00:00+02:00')).toBe(Date.UTC(2026, 7, 1, 8));
  });

  it('reads every time the four examples write', () => {
    const files = ['example-1/roadmap.tml', 'example-2/roadmap.tml', 'marvel-universe-overview/marvel-universe-overview.tml', 'marvel-universe/marvel-universe.tml'];
    const times = files.flatMap((file) => [...readFileSync(`examples/timeline/${file}`, 'utf8').matchAll(/^\s*(?:begin|end):\s*['"]?([^'"\n]+?)['"]?\s*$/gm)].map((match) => match[1]));
    expect(times.length).toBeGreaterThan(400);
    expect(times.filter((text) => readTime(text) === undefined)).toEqual([]);
    expect(readTime('0079-08-24')).toBe(new Date(0).setUTCFullYear(79, 7, 24));
  });

  it('compares, adds days and writes a date as standalone does', () => {
    expect([call('compareTimes', '07/04/2026', '2026-07'), call('compareTimes', '2026-07-01', '2026/07/01'), call('compareTimes', '2026-03-01', '2026-03-10T09:30:15.25Z')]).toEqual([1n, 0n, -1n]);
    expect(call('dateAfter', '2025-04-27', 14n)).toBe('2025-05-11');
    expect(call('dateAfter', '2025-04-27T09:30', 1n)).toBe('2025-04-28');
    expect(call('dateAfter', '0079-08-24', 7n)).toBe('0079-08-31');
    expect(call('today')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(() => call('compareTimes', 'someday', '2026-01-01')).toThrow("'someday' is not a time this timeline can read.");
  });

  it('gives a relation\'s end as the file writes it, also where it names no element', () => {
    expect([call('writtenEnd', { source: 'written', target: 'ghost' }, 'target'), call('writtenEnd', { source: null }, 'source'), call('writtenEnd', {}, 'neither')]).toEqual(['ghost', '', '']);
  });
});
