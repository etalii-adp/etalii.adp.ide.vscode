// FBL's splices as ranges of a text document (etalii.adp spec 027, research R5): a splice is at
// UTF-8 byte offsets of the text, a range is in lines and UTF-16 characters, both from zero, as
// Visual Studio Code counts a position. The result is plain data: the core imports no editor.

import { byteLength } from '../fbl/text/utf8';
import type { TextSplice } from '../frame/toolType';

export interface RangeSplice {
  readonly start: { readonly line: number; readonly character: number };
  readonly end: { readonly line: number; readonly character: number };
  readonly text: string;
}

/** Each splice as a range of `text` as it is before any of them is applied, in the order given. */
export function spliceRanges(text: string, splices: readonly TextSplice[]): RangeSplice[] {
  // Where each line starts, as an index of the text and as a byte offset.
  const lines = [{ index: 0, offset: 0 }];
  for (const ending of text.matchAll(/\r\n|\r|\n/g)) {
    const last = lines[lines.length - 1];
    const index = ending.index + ending[0].length;
    lines.push({ index, offset: last.offset + byteLength(text.slice(last.index, index)) });
  }
  const position = (at: number): RangeSplice['start'] => {
    let line = lines.length - 1;
    while (line > 0 && lines[line].offset > at) line--;
    let index = lines[line].index;
    // A splice is of whole characters, so an offset never lies inside one.
    for (let bytes = lines[line].offset; bytes < at && index < text.length;) {
      const units = text.codePointAt(index)! > 0xffff ? 2 : 1;
      bytes += byteLength(text.slice(index, index + units));
      index += units;
    }
    return { line, character: index - lines[line].index };
  };
  return splices.map((splice) => ({ start: position(splice.offset), end: position(splice.offset + splice.length), text: splice.text }));
}
