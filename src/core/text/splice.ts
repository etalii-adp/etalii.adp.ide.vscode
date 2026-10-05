import { LineDocument } from './lineDocument';

/** One replacement of whole lines: lines `startLine` up to, not including, `endLine` become `text`. */
export interface Splice {
  readonly startLine: number;
  readonly endLine: number;
  /** The replacement, terminators included; empty for a removal. */
  readonly text: string;
}

/**
 * The one splice that turns `before` into `after`: the lines that differ, and nothing either side of
 * them. Undefined when the two are the same text.
 */
export function spliceBetween(before: string, after: string): Splice | undefined {
  if (before === after) return undefined;
  const a = LineDocument.parse(before).lines.map((line) => line.text + line.ending);
  const b = LineDocument.parse(after).lines.map((line) => line.text + line.ending);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  return { startLine: head, endLine: a.length - tail, text: b.slice(head, b.length - tail).join('') };
}

/** Applies a splice to text; what the extension's workspace edit does to the document. */
export function applySplice(text: string, splice: Splice): string {
  const lines = LineDocument.parse(text).lines.map((line) => line.text + line.ending);
  return [...lines.slice(0, splice.startLine), splice.text, ...lines.slice(splice.endLine)].join('');
}