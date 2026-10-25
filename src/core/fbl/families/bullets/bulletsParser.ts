import type { Span } from '../../span';
import type { BodyText } from '../../text/bodyText';
import { byteLength, trimEndOf, trimStartOf } from '../../text/utf8';
import { byteOffsets, Statement } from '../lines/linesFamily';
import { columnsOf, without } from './columns';

const thematicBreak = /^[ \t]*(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const fenceOpening = /^(`{3,}|~{3,})/;
const headingMark = /^(#{1,6})(?:[ \t]|$)/;
const closingHashes = /(?:^|[ \t]+)#+$/;

const isBlank = (character: string | undefined): boolean => character === ' ' || character === '\t';
const trimBlanks = (text: string): string => trimEndOf(trimStartOf(text, ' \t'), ' \t');

/** A heading of a bullets body (FBL 0.7 4.8): its 0-based line, its level and its text. */
export interface Heading {
  readonly line: number;
  readonly level: number;
  readonly text: string;
}

/**
 * A list item of the `bullets` family (FBL 0.7 4.8). As a `Statement` its content is the item's
 * text, which a rule with `within` matches; its own span runs from its marker to the end of its last
 * line, and its line span adds the indentation before the marker and the last line's ending.
 */
export class Bullet extends Statement {
  /** The 0-based lines of the continuation: from its first line to its last before the first nested item, blank lines between them included. */
  readonly continuation: number[] = [];

  /** Which of `continuation` are blank lines, read as empty lines. */
  private readonly blankLines = new Set<number>();

  /** Blank lines seen since the last continuation line: part of the continuation only when a line follows them there. */
  private blanks: number[] = [];

  private nested = false;

  constructor(
    own: Span,
    indent: number,
    firstLine: number,
    content: string,
    offsets: readonly number[],
    /** The column of the marker, a tab counting four columns. */
    readonly markerColumn: number,
    /** The column where the item's text begins, or the marker's column plus two when it has none. */
    readonly contentColumn: number,
    /** The marker: `-`, `*` or `+`. */
    readonly marker: string,
    /** The whitespace before the marker, as written. */
    readonly indentText: string,
  ) {
    super(own, indent, firstLine, content, offsets);
  }

  /** A line that is no item and stands while this item is the deepest open one. */
  addLine(line: number): void {
    if (!this.nested) {
      this.continuation.push(...this.blanks, line);
      this.blanks = [];
    }
    this.lastLine = line;
  }

  /** A blank line while this item is the deepest open one. */
  addBlank(line: number): void {
    if (this.nested || this.continuation.length === 0) return;
    this.blanks.push(line);
    this.blankLines.add(line);
  }

  nest(item: Bullet): void {
    this.nested = true;
    item.parent = this;
    this.children.push(item);
  }

  /** Ends the spans at the item's last line, once every line is read; nested items are closed first. */
  close(text: BodyText): void {
    for (const child of this.children) {
      if (child instanceof Bullet) this.lastLine = Math.max(this.lastLine, child.lastLine);
    }
    const last = text.lines[this.lastLine];
    this.own = { start: this.own.start, end: last.contentEnd };
    this.lineSpan = { start: this.lineSpan!.start, end: last.end };
  }

  /**
   * The span the continuation's value is written in (FBL 0.7 6.3): from the end of the item line,
   * before its ending, to the end of the continuation's last line, before its ending; nothing without continuation.
   */
  continuationSpan(text: BodyText): Span | undefined {
    if (this.continuation.length === 0) return undefined;
    return { start: text.lines[this.firstLine].contentEnd, end: text.lines[this.continuation[this.continuation.length - 1]].contentEnd };
  }

  /**
   * The continuation as text (FBL 0.7 4.8): its lines joined by LF, each without the whitespace
   * before the content column, a blank line read as an empty one.
   */
  continuationText(text: BodyText): string {
    return this.continuation
      .map((line) => (this.blankLines.has(line) ? '' : without(text.text(text.lines[line].start, text.lines[line].contentEnd), this.contentColumn)))
      .join('\n');
  }
}

/**
 * The reading of a body of the `bullets` family into its kinds of line (FBL 0.7 4.8): list items
 * nested by their indentation, headings, statements, and the fences and thematic breaks that are
 * none of these. A port of standalone's `BulletsParser`, which mirrors `bullets_of` in etalii.adp's
 * `.github/scripts/validate-examples.py`.
 */
export class BulletsParser {
  /** Every item and statement, in document order. */
  readonly entries: Statement[] = [];

  readonly headings: Heading[] = [];

  /** The content of every line that is not blank: every byte of the body is in one, or is whitespace. */
  readonly leaves: Span[] = [];

  constructor(private readonly text: BodyText) {}

  parse(): void {
    const text = this.text;
    const open: Bullet[] = [];
    let fence: { character: string; length: number; owner?: Bullet } | undefined;
    for (let index = 0; index < text.lines.length; index++) {
      const line = text.lines[index];
      const start = index === 0 ? Math.max(line.start, text.bomLength) : line.start;
      let first = start;
      while (first < line.contentEnd && (text.bytes[first] === 0x20 || text.bytes[first] === 0x09)) first++;
      if (first < line.contentEnd) this.leaves.push({ start: first, end: line.contentEnd });
      const rest = text.text(first, line.contentEnd);
      // Rule 1: the lines after the one that opens a fence, up to the one that closes it.
      if (fence) {
        const inside = fence;
        if (closes(rest, inside.character, inside.length)) fence = undefined;
        inside.owner?.addLine(index);
        continue;
      }
      // Rule 2: a blank line closes nothing.
      if (first === line.contentEnd) {
        open[open.length - 1]?.addBlank(index);
        continue;
      }
      // Rule 3: any other line closes every open item whose marker stands at its indentation or deeper.
      const indentation = columnsOf(text.text(start, first));
      while (open.length > 0 && open[open.length - 1].markerColumn >= indentation) open.pop();
      const whole = text.text(start, line.contentEnd);
      // Rule 4: an item line.
      if ((rest[0] === '-' || rest[0] === '*' || rest[0] === '+') && (rest.length === 1 || isBlank(rest[1])) && !thematicBreak.test(whole)) {
        const item = this.item(index, start, first, indentation, rest, open[open.length - 1]);
        this.entries.push(item);
        open.push(item);
        continue;
      }
      const opens = fenceOpening.exec(rest);
      // Rule 5: a continuation line of the deepest open item, which owns a fence opening on it.
      if (open.length > 0) {
        const deepest = open[open.length - 1];
        deepest.addLine(index);
        if (opens) fence = { character: opens[1][0], length: opens[1].length, owner: deepest };
        continue;
      }
      // Rules 6 to 9, with no item open: a heading, an unbound fence, a thematic break, a statement.
      const heading = indentation <= 3 ? headingMark.exec(rest) : null;
      if (heading) {
        const title = trimBlanks(trimBlanks(rest.slice(heading[1].length)).replace(closingHashes, ''));
        this.headings.push({ line: index, level: heading[1].length, text: title });
      } else if (opens) {
        fence = { character: opens[1][0], length: opens[1].length };
      } else if (!thematicBreak.test(whole)) {
        this.entries.push(this.statement(index, start, first, rest));
      }
    }
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      if (entry instanceof Bullet) entry.close(text);
    }
  }

  private item(index: number, start: number, first: number, indentation: number, rest: string, parent: Bullet | undefined): Bullet {
    const line = this.text.lines[index];
    const after = rest.slice(1);
    const itemText = trimStartOf(after, ' \t');
    const whitespace = after.slice(0, after.length - itemText.length);
    const textStart = first + 1 + byteLength(whitespace);
    const item = new Bullet(
      { start: first, end: line.contentEnd },
      first - start,
      index,
      itemText,
      byteOffsets(itemText, textStart),
      indentation,
      itemText.length > 0 ? indentation + 1 + columnsOf(whitespace) : indentation + 2,
      rest[0],
      this.text.text(start, first),
    );
    item.lineSpan = { start, end: line.end };
    item.firstLineSpan = { start: textStart, end: line.contentEnd };
    parent?.nest(item);
    return item;
  }

  private statement(index: number, start: number, first: number, rest: string): Statement {
    const line = this.text.lines[index];
    const trimmed = trimEndOf(rest, ' \t');
    const statement = new Statement({ start: first, end: first + byteLength(trimmed) }, first - start, index, rest, byteOffsets(rest, first));
    statement.lineSpan = { start, end: line.end };
    return statement;
  }
}

/** Whether a line's text after its indentation closes a fence of `length` or more of `character`, with nothing but whitespace after the run. */
function closes(rest: string, character: string, length: number): boolean {
  let run = 0;
  while (run < rest.length && rest[run] === character) run++;
  if (run < length) return false;
  for (let i = run; i < rest.length; i++) {
    if (!isBlank(rest[i])) return false;
  }
  return true;
}
