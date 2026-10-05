import { describe, expect, it } from 'vitest';
import { LineDocument } from '../../../src/core/text/lineDocument';
import { applySplice, spliceBetween } from '../../../src/core/text/splice';

describe('a line document', () => {
  it.each([
    ['CRLF', 'a\r\nb\r\n'],
    ['LF', 'a\nb\n'],
    ['mixed endings', 'a\r\nb\nc\r\n'],
    ['no final newline', 'a\nb'],
    ['empty', ''],
    ['only a newline', '\n'],
  ])('gives back %s text byte for byte', (_name, text) => {
    expect(LineDocument.parse(text).text).toBe(text);
  });

  it('gives a new line the ending most lines use, and CRLF on a tie', () => {
    const lf = LineDocument.parse('a\nb\n');
    lf.insert(1, ['x']);
    expect(lf.text).toBe('a\nx\nb\n');
    const tie = LineDocument.parse('');
    tie.insert(0, ['x']);
    expect(tie.text).toBe('x\r\n');
  });

  it('appends to a file without a final newline without adding one, and removing the line restores it', () => {
    const document = LineDocument.parse('a\nb');
    document.insert(2, ['c']);
    expect(document.text).toBe('a\nb\nc');
    document.remove({ start: 2, end: 2 });
    expect(document.text).toBe('a\nb');
  });

  it('replaces the last line of an unterminated file without terminating it', () => {
    const document = LineDocument.parse('a\nb');
    document.replace({ start: 1, end: 1 }, ['x', 'y']);
    expect(document.text).toBe('a\nx\ny');
  });

  it('refuses a range outside the document rather than clamping it', () => {
    const document = LineDocument.parse('a\n');
    expect(() => document.remove({ start: 0, end: 1 })).toThrow(RangeError);
    expect(() => document.replace({ start: 1, end: 0 }, [])).toThrow(RangeError);
  });
});

describe('the splice between two texts', () => {
  it('is nothing when they are the same', () => {
    expect(spliceBetween('a\nb\n', 'a\nb\n')).toBeUndefined();
  });

  it.each([
    ['a changed line', 'a\nb\nc\n', 'a\nB\nc\n', { startLine: 1, endLine: 2, text: 'B\n' }],
    ['an inserted line', 'a\nc\n', 'a\nb\nc\n', { startLine: 1, endLine: 1, text: 'b\n' }],
    ['a removed line', 'a\nb\nc\n', 'a\nc\n', { startLine: 1, endLine: 2, text: '' }],
    ['a first line', 'a\nb\n', 'x\nb\n', { startLine: 0, endLine: 1, text: 'x\n' }],
    ['a last line without a newline', 'a\nb', 'a\nx', { startLine: 1, endLine: 2, text: 'x' }],
  ])('covers only %s', (_name, before, after, expected) => {
    const splice = spliceBetween(before, after);
    expect(splice).toEqual(expected);
    expect(applySplice(before, splice!)).toBe(after);
  });
});