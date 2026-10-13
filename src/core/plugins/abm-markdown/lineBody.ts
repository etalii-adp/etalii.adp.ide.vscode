import type { FblSplice, SpliceOperation } from '../../fbl';
import type { LineRange } from './model';

// A body as the lines it is made of, edited by replacing, inserting and removing lines, and given
// back as the splices that make those edits in its bytes. Every line and every line ending
// remembers the place in the body it was read from; one that no edit touched is in no splice, so
// the prose, the line endings and everything else the author wrote survive byte for byte. The rules
// for line endings are those every ADP host's line document has.

/** One line as it was read: its text, its own terminator, and the bytes they are at. */
interface SourceLine {
  readonly text: string;
  /** `\r\n`, `\n`, or nothing on an unterminated last line. */
  readonly ending: string;
  readonly start: number;
  readonly textEnd: number;
  readonly end: number;
}

/** One line as it is now. `textFrom` and `endingFrom` name the line of the body its text and its ending are still those of. */
interface Line {
  readonly text: string;
  readonly textFrom?: number;
  readonly ending: string;
  readonly endingFrom?: number;
  /** What the edit that wrote this line is named. */
  readonly operation?: SpliceOperation;
}

const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
const lineFeed = 0x0a;
const carriageReturn = 0x0d;

export class LineBody {
  private readonly items: Line[];
  private readonly removed = new Map<number, SpliceOperation>();

  private constructor(
    private readonly bytes: Uint8Array,
    private readonly source: readonly SourceLine[],
    /** Where the lines start: after a byte-order mark, which is no part of the first line. */
    private readonly contentStart: number,
    /** The terminator most lines use, which a newly inserted line adopts. A tie goes to CRLF. */
    readonly dominantEnding: string,
  ) {
    this.items = source.map((line, index) => ({ text: line.text, textFrom: index, ending: line.ending, endingFrom: index }));
  }

  /** Splits a body into lines at its line feeds, keeping each line's own terminator and its offsets in bytes. */
  static parse(bytes: Uint8Array): LineBody {
    const contentStart = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
    const lines: SourceLine[] = [];
    let start = contentStart;
    let crlf = 0;
    let lf = 0;
    for (let index = start; index < bytes.length; index++) {
      if (bytes[index] !== lineFeed) continue;
      const hasCarriageReturn = index > start && bytes[index - 1] === carriageReturn;
      const textEnd = hasCarriageReturn ? index - 1 : index;
      lines.push({ text: decoder.decode(bytes.subarray(start, textEnd)), ending: hasCarriageReturn ? '\r\n' : '\n', start, textEnd, end: index + 1 });
      if (hasCarriageReturn) crlf++;
      else lf++;
      start = index + 1;
    }
    if (start < bytes.length) lines.push({ text: decoder.decode(bytes.subarray(start)), ending: '', start, textEnd: bytes.length, end: bytes.length });
    return new LineBody(bytes, lines, contentStart, lf > crlf ? '\n' : '\r\n');
  }

  /** The text of every line as it is now, without its terminator. */
  get lines(): readonly string[] {
    return this.items.map((line) => line.text);
  }

  /** The bytes a range of lines of the body as it was read covers, the last line's terminator included. */
  spanOf(range: LineRange): { start: number; end: number } {
    return { start: this.source[range.start].start, end: this.source[range.end].end };
  }

  /**
   * Replaces the lines in a range. The replacement's last line keeps the terminator the range's
   * last line had, so replacing the last line of a file without a final newline does not add one.
   * Lines replaced by what they already say are left alone.
   */
  replace(range: LineRange, replacement: readonly string[], operation: SpliceOperation): void {
    this.guard(range);
    const count = range.end - range.start + 1;
    if (replacement.length === count && replacement.every((text, index) => text === this.items[range.start + index].text)) return;
    const last = this.items[range.end];
    const lines: Line[] = replacement.map((text, index) => (index === replacement.length - 1
      ? { text, ending: last.ending, endingFrom: last.endingFrom, operation }
      : { text, ending: this.dominantEnding, operation }));
    this.items.splice(range.start, count, ...lines);
  }

  /**
   * Inserts lines before an index. Appending to a file whose last line has no terminator moves that
   * missing terminator to the new last line, which keeps an append reversible byte for byte.
   */
  insert(index: number, lines: readonly string[], operation: SpliceOperation): void {
    if (index < 0 || index > this.items.length) throw new RangeError(`Line ${index} is outside a document of ${this.items.length} lines.`);
    if (lines.length === 0) return;
    const inserted: Line[] = lines.map((text) => ({ text, ending: this.dominantEnding, operation }));
    const last = this.items[this.items.length - 1];
    if (index === this.items.length && last !== undefined && last.ending.length === 0) {
      this.items[this.items.length - 1] = { text: last.text, textFrom: last.textFrom, ending: this.dominantEnding, operation: last.operation };
      inserted[inserted.length - 1] = { text: lines[lines.length - 1], ending: '', endingFrom: last.endingFrom, operation };
    }
    this.items.splice(index, 0, ...inserted);
  }

  /** Removes the lines in a range. How the file ends passes to the line that becomes last. */
  remove(range: LineRange, operation: SpliceOperation): void {
    this.guard(range);
    const removingTheEnd = range.end === this.items.length - 1;
    const { ending, endingFrom } = this.items[range.end];
    for (const line of this.items.splice(range.start, range.end - range.start + 1)) {
      if (line.textFrom !== undefined) this.removed.set(line.textFrom, operation);
    }
    const last = this.items[this.items.length - 1];
    // A line that ends as the file did keeps its own terminator: only a different one is passed on.
    if (removingTheEnd && last !== undefined && last.ending !== ending) this.items[this.items.length - 1] = { ...last, ending, endingFrom };
  }

  /**
   * The edits as splices of the body that was read, in body order: every run of bytes between two
   * things that stayed (a line's text, a line's terminator) is replaced by what is there now.
   */
  splices(): FblSplice[] {
    const splices: FblSplice[] = [];
    // A text is counted at twice its line's index and a terminator one after it, so both are places in one order.
    let place = 0;
    let cursor = this.contentStart;
    let pending = '';
    let operations = new Set<SpliceOperation>();

    const close = (to: number, toPlace: number): void => {
      for (let line = Math.ceil(place / 2); 2 * line < toPlace; line++) {
        const operation = this.removed.get(line);
        if (operation) operations.add(operation);
      }
      if (decoder.decode(this.bytes.subarray(cursor, to)) !== pending) splices.push({ operation: nameOf(operations), start: cursor, end: to, text: pending });
      pending = '';
      operations = new Set();
    };
    const write = (text: string, operation: SpliceOperation | undefined): void => {
      pending += text;
      if (operation) operations.add(operation);
    };

    for (const line of this.items) {
      if (line.textFrom === undefined) write(line.text, line.operation);
      else {
        const from = this.source[line.textFrom];
        close(from.start, 2 * line.textFrom);
        cursor = from.textEnd;
        place = 2 * line.textFrom + 1;
      }
      if (line.endingFrom === undefined) write(line.ending, line.operation);
      else {
        const from = this.source[line.endingFrom];
        close(from.textEnd, 2 * line.endingFrom + 1);
        cursor = from.end;
        place = 2 * line.endingFrom + 2;
      }
    }
    close(this.bytes.length, 2 * this.source.length);
    return splices;
  }

  /** Refused rather than clamped: a clamped range splices the wrong line. */
  private guard(range: LineRange): void {
    if (range.start < 0 || range.end < range.start) throw new RangeError(`Line ${range.end} cannot precede line ${range.start}.`);
    if (range.end >= this.items.length) throw new RangeError(`Lines ${range.start}-${range.end} are outside a document of ${this.items.length} lines.`);
  }
}

/**
 * What one splice is named (FBL 6.1), from the edits that meet in it: lines taken out and other
 * lines put in at one place are lines written again.
 */
function nameOf(operations: ReadonlySet<SpliceOperation>): SpliceOperation {
  if (operations.has('re-emit-line')) return 're-emit-line';
  if (operations.has('replace-value')) return 'replace-value';
  const inserts = operations.has('insert-entry') || operations.has('insert-key');
  const removes = operations.has('remove-entry') || operations.has('remove-key');
  if (inserts && removes) return 're-emit-line';
  for (const operation of ['insert-entry', 'remove-entry', 'insert-key', 'remove-key'] as const) if (operations.has(operation)) return operation;
  return 're-emit-line';
}
