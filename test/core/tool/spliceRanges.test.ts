import { describe, expect, it } from 'vitest';
import { applySplices } from '../../../src/core/fbl/splice';
import { byteLength, decode, encode } from '../../../src/core/fbl/text/utf8';
import type { TextSplice } from '../../../src/core/frame/toolType';
import { spliceRanges, type RangeSplice } from '../../../src/core/tool/spliceRanges';

// FBL's splices as ranges of a text document (etalii.adp spec 027, research R5; data-model.md,
// "Document edit"). A splice is at UTF-8 byte offsets of the text; a range is in lines and UTF-16
// characters, both from zero, as Visual Studio Code's `Position` counts them.

/** The byte offset of the first occurrence of a part of a text. */
const offsetOf = (text: string, part: string): number => byteLength(text.slice(0, text.indexOf(part)));
const replacing = (text: string, part: string, by: string): TextSplice => ({ offset: offsetOf(text, part), length: byteLength(part), text: by });

/** A text with ranges replaced, as a text document applies one edit: every range is of the text before. */
function ranged(text: string, ranges: readonly RangeSplice[]): string {
  const starts = [0];
  for (const ending of text.matchAll(/\r\n|\r|\n/g)) starts.push(ending.index + ending[0].length);
  const index = (position: RangeSplice['start']): number => starts[position.line] + position.character;
  let after = text;
  for (const range of [...ranges].reverse()) after = after.slice(0, index(range.start)) + range.text + after.slice(index(range.end));
  return after;
}

/** The text the library makes of the same splices. */
const byBytes = (text: string, splices: readonly TextSplice[]): string =>
  decode(applySplices(encode(text), splices.map((splice) => ({ operation: 'replace-value' as const, start: splice.offset, end: splice.offset + splice.length, text: splice.text }))));

describe('a splice as a range of the text', () => {
  it('is in lines and characters, both counted from zero', () => {
    const text = 'name: Radio\nrow: 2\n';
    expect(spliceRanges(text, [replacing(text, '2', '5')])).toEqual([{ start: { line: 1, character: 5 }, end: { line: 1, character: 6 }, text: '5' }]);
    expect(spliceRanges(text, [{ offset: 0, length: 0, text: '# first\n' }])).toEqual([{ start: { line: 0, character: 0 }, end: { line: 0, character: 0 }, text: '# first\n' }]);
  });

  it('is plain data, and none for no splice', () => {
    expect(spliceRanges('anything', [])).toEqual([]);
    const [range] = spliceRanges('a\nb', [{ offset: 2, length: 1, text: 'c' }]);
    expect(JSON.parse(JSON.stringify(range))).toEqual(range);
  });
});

describe('multi-byte text', () => {
  // Two, three and four bytes in UTF-8; the last is two characters in UTF-16.
  const text = 'name: Café\nprice: 5 €\nmood: 😀 fine\nrow: 1\n';

  it('counts a character of several bytes as the characters it is in UTF-16', () => {
    expect(byteLength('é')).toBe(2);
    expect(byteLength('€')).toBe(3);
    expect(byteLength('😀')).toBe(4);
    expect(spliceRanges(text, [replacing(text, 'fine', 'well')])).toEqual([{ start: { line: 2, character: 9 }, end: { line: 2, character: 13 }, text: 'well' }]);
    expect(spliceRanges(text, [replacing(text, '😀', ':)')])).toEqual([{ start: { line: 2, character: 6 }, end: { line: 2, character: 8 }, text: ':)' }]);
    expect(spliceRanges(text, [replacing(text, '1', '2')])).toEqual([{ start: { line: 3, character: 5 }, end: { line: 3, character: 6 }, text: '2' }]);
  });

  it('ends a range after a character of several bytes, not inside it', () => {
    expect(spliceRanges(text, [replacing(text, 'Café', 'Bar')])).toEqual([{ start: { line: 0, character: 6 }, end: { line: 0, character: 10 }, text: 'Bar' }]);
    expect(spliceRanges(text, [replacing(text, '5 €', '6 €')])).toEqual([{ start: { line: 1, character: 7 }, end: { line: 1, character: 10 }, text: '6 €' }]);
  });

  it('gives the text the bytes give', () => {
    const splices = [replacing(text, 'Café', 'Thé'), replacing(text, '€', '£'), replacing(text, '😀', '🙂🙂')];
    expect(ranged(text, spliceRanges(text, splices))).toBe(byBytes(text, splices));
    expect(ranged(text, spliceRanges(text, splices))).toBe('name: Thé\nprice: 5 £\nmood: 🙂🙂 fine\nrow: 1\n');
  });
});

describe('CRLF', () => {
  const text = 'name: Café\r\nrow: 1\r\ntags: [a, b]\r\n';

  it('ends a line with its two characters, which are no characters of the next', () => {
    expect(spliceRanges(text, [replacing(text, '1', '2')])).toEqual([{ start: { line: 1, character: 5 }, end: { line: 1, character: 6 }, text: '2' }]);
    expect(spliceRanges(text, [replacing(text, 'tags', 'labels')])).toEqual([{ start: { line: 2, character: 0 }, end: { line: 2, character: 4 }, text: 'labels' }]);
  });

  it('has a whole line, with its ending, run to the start of the next', () => {
    const line = spliceRanges(text, [replacing(text, 'row: 1\r\n', '')]);
    expect(line).toEqual([{ start: { line: 1, character: 0 }, end: { line: 2, character: 0 }, text: '' }]);
    expect(ranged(text, line)).toBe('name: Café\r\ntags: [a, b]\r\n');
  });

  it('has the end of a line\'s content before its ending', () => {
    const value = spliceRanges(text, [{ offset: offsetOf(text, '\r\nrow'), length: 0, text: ' au lait' }]);
    expect(value).toEqual([{ start: { line: 0, character: 10 }, end: { line: 0, character: 10 }, text: ' au lait' }]);
  });

  it('reads a lone line feed and a lone carriage return as line endings too', () => {
    const mixed = 'a\nb\rc\r\nd';
    expect(spliceRanges(mixed, ['a', 'b', 'c', 'd'].map((letter) => replacing(mixed, letter, letter.toUpperCase()))).map((range) => range.start))
      .toEqual([{ line: 0, character: 0 }, { line: 1, character: 0 }, { line: 2, character: 0 }, { line: 3, character: 0 }]);
  });
});

describe('several splices of one gesture', () => {
  const text = 'trends:\r\n  - id: a\r\n    start: 1950-01\r\n    stop: 1990-01\r\n    row: 1\r\n  - id: b\r\n    row: 2\r\n';
  const splices = [replacing(text, '1950-01', '1955-01'), replacing(text, '1990-01', '1995-01'), replacing(text, 'row: 1', 'row: 12'), replacing(text, '  - id: b\r\n    row: 2\r\n', '')];

  it('are each a range of the text before the gesture, in the order they are given', () => {
    expect(spliceRanges(text, splices)).toEqual([
      { start: { line: 2, character: 11 }, end: { line: 2, character: 18 }, text: '1955-01' },
      { start: { line: 3, character: 10 }, end: { line: 3, character: 17 }, text: '1995-01' },
      { start: { line: 4, character: 4 }, end: { line: 4, character: 10 }, text: 'row: 12' },
      { start: { line: 5, character: 0 }, end: { line: 7, character: 0 }, text: '' },
    ]);
  });

  it('give together the text the bytes give', () => {
    expect(ranged(text, spliceRanges(text, splices))).toBe(byBytes(text, splices));
    expect(ranged(text, spliceRanges(text, splices))).toBe('trends:\r\n  - id: a\r\n    start: 1955-01\r\n    stop: 1995-01\r\n    row: 12\r\n');
  });
});

describe('the end of the body', () => {
  it('with a final newline is the start of the line after the last', () => {
    const text = 'trends: []\ninfluences: []\n';
    const added = spliceRanges(text, [{ offset: byteLength(text), length: 0, text: 'notes: []\n' }]);
    expect(added).toEqual([{ start: { line: 2, character: 0 }, end: { line: 2, character: 0 }, text: 'notes: []\n' }]);
    expect(ranged(text, added)).toBe('trends: []\ninfluences: []\nnotes: []\n');
  });

  it('without a final newline is the end of the last line', () => {
    const text = 'trends: []\r\ninfluences: []';
    const added = spliceRanges(text, [{ offset: byteLength(text), length: 0, text: '\r\nnotes: []' }]);
    expect(added).toEqual([{ start: { line: 1, character: 14 }, end: { line: 1, character: 14 }, text: '\r\nnotes: []' }]);
    expect(ranged(text, added)).toBe('trends: []\r\ninfluences: []\r\nnotes: []');
  });

  it('of an empty body is its start', () => {
    expect(spliceRanges('', [{ offset: 0, length: 0, text: 'trends: []\n' }])).toEqual([{ start: { line: 0, character: 0 }, end: { line: 0, character: 0 }, text: 'trends: []\n' }]);
  });

  it('takes the last line away whole, with or without its newline', () => {
    const ending = 'a: 1\nb: 2\n';
    expect(spliceRanges(ending, [replacing(ending, 'b: 2\n', '')])).toEqual([{ start: { line: 1, character: 0 }, end: { line: 2, character: 0 }, text: '' }]);
    const open = 'a: 1\nb: 2';
    expect(spliceRanges(open, [replacing(open, '\nb: 2', '')])).toEqual([{ start: { line: 0, character: 4 }, end: { line: 1, character: 4 }, text: '' }]);
  });
});
