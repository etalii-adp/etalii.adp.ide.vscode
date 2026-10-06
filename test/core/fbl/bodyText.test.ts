import { describe, expect, it } from 'vitest';
import { BodyText } from '../../../src/core/fbl/text/bodyText';
import { utf8 } from './support/repository';

// Bytes, lines and positions (FBL 2.6). Counterparts of standalone's Bytes/BodyText.Tests.cs.
describe('a body\'s text', () => {
  it('a column counts code points not bytes or UTF-16 units', () => {
    // An emoji is four bytes and two UTF-16 units, but one code point.
    const text = new BodyText(utf8('a😀b: x\n'));
    expect(text.position(utf8('a😀b').length)).toEqual({ line: 1, column: 4 });
  });

  it('the byte order mark belongs to no column', () => {
    const text = new BodyText(Uint8Array.of(0xef, 0xbb, 0xbf, 0x61, 0x62));
    expect(text.bomLength).toBe(3);
    expect(text.position(4)).toEqual({ line: 1, column: 2 });
  });

  it('CRLF LF and a lone CR each end a line', () => {
    const text = new BodyText(utf8('a\r\nb\nc\rd'));
    expect(text.lines.map((line) => line.ending)).toEqual(['\r\n', '\n', '\r', '']);
    expect(text.position(7)).toEqual({ line: 4, column: 1 });
  });

  it('a body of only a lone CR is one empty line ended by CR', () => {
    const text = new BodyText(utf8('\r'));
    expect(text.lines).toEqual([{ start: 0, contentEnd: 0, end: 1, ending: '\r' }]);
    expect(text.dominantEnding).toBe('\r');
  });

  it.each([
    ['a\r\nb\nc', '\r\n'],
    ['a\r\nb\nc\n', '\n'],
    ['a\rb\rc\r\n', '\r\n'],
    ['abc', undefined],
  ])('CRLF wins a tie and a lone CR counts as neither: %j', (body, dominant) => {
    expect(new BodyText(utf8(body)).dominantEnding).toBe(dominant);
  });

  it('an invalid UTF-8 sequence is found with its offset', () => {
    // A lone continuation byte after two valid bytes.
    const text = new BodyText(Uint8Array.of(0x61, 0x62, 0x80, 0x63));
    expect(text.isValidUtf8).toBe(false);
    expect(text.invalidOffset).toBe(2);
  });
});
