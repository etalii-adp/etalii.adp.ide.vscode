import { isMap, isPair, isScalar, isSeq, type Node, type Pair } from 'yaml';
import type { Line, LineRange } from './lineDocument';

/** Zero-based line numbers for offsets into a text. */
export class LineIndex {
  private readonly starts: number[] = [0];

  constructor(text: string) {
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') this.starts.push(i + 1);
    }
  }

  lineOf(offset: number): number {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.starts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low;
  }
}

/** The furthest end of content in a node's subtree, as an offset. */
function contentEnd(node: Node | Pair | null | undefined): number {
  if (!node) return 0;
  if (isPair(node)) return Math.max(contentEnd(node.key as Node), contentEnd(node.value as Node));
  let end = node.range?.[1] ?? 0;
  if (isMap(node) || isSeq(node)) {
    for (const item of node.items) end = Math.max(end, contentEnd(item as Node | Pair));
  }
  return end;
}

// A blank line or a YAML comment line: the first non-space character is '#'.
function saysNothing(text: string): boolean {
  return text.trim().length === 0 || text.replace(/^ +/, '').startsWith('#');
}

/**
 * The lines a parsed YAML node occupies, narrowed to the ones that say something: from the line it
 * starts on to the last line of its content, with trailing blank and comment lines left out, since
 * an edit has no business rewriting a comment that merely follows an entry.
 */
export function rangeOfNode(node: Node, index: LineIndex, lines: readonly Line[]): LineRange {
  const last = Math.max(0, lines.length - 1);
  const startOffset = node.range?.[0] ?? 0;
  const start = Math.min(Math.max(index.lineOf(startOffset), 0), last);
  const endOffset = contentEnd(node);
  let end = Math.min(Math.max(index.lineOf(Math.max(startOffset, endOffset - 1)), start), last);
  while (end > start && saysNothing(lines[end].text)) end--;
  return { start, end };
}

/** A scalar's text as the document states it, whatever YAML would make of it; undefined for a non-scalar. */
export function scalarText(node: unknown): string | undefined {
  if (!isScalar(node)) return undefined;
  if (typeof node.value === 'string') return node.value;
  return node.source ?? (node.value === null || node.value === undefined ? '' : String(node.value));
}