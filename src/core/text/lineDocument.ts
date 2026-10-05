/** An inclusive range of zero-based line indices: the lines that declare one construct. */
export interface LineRange {
  readonly start: number;
  readonly end: number;
}

/** One line: its text and its own terminator (`\r\n`, `\n`, or none on an unterminated last line). */
export interface Line {
  readonly text: string;
  readonly ending: string;
}

/**
 * A hand-authored file as the lines it is made of, edited by splicing a range of them rather than
 * by regenerating the document. Holding the lines makes a byte-identical round trip structural: a
 * line nothing splices is never touched, so comments, key order and keys a tool does not know
 * survive. The same rules as every other ADP host's line document.
 */
export class LineDocument {
  private constructor(
    private readonly items: Line[],
    /** The terminator most lines use, which a newly inserted line adopts. A tie goes to CRLF. */
    readonly dominantEnding: string,
  ) {}

  get lines(): readonly Line[] {
    return this.items;
  }

  /** Splits text into lines, keeping each line's own terminator. */
  static parse(text: string): LineDocument {
    const lines: Line[] = [];
    let start = 0;
    let crlf = 0;
    let lf = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '\n') continue;
      const hasCarriageReturn = i > start && text[i - 1] === '\r';
      lines.push({ text: text.slice(start, hasCarriageReturn ? i - 1 : i), ending: hasCarriageReturn ? '\r\n' : '\n' });
      if (hasCarriageReturn) crlf++;
      else lf++;
      start = i + 1;
    }
    if (start < text.length) {
      lines.push({ text: text.slice(start), ending: '' });
    }
    return new LineDocument(lines, lf > crlf ? '\n' : '\r\n');
  }

  /** The document as text: byte-identical to what `parse` was given when nothing was spliced. */
  get text(): string {
    return this.items.map((line) => line.text + line.ending).join('');
  }

  /**
   * Replaces the lines in a range. The replacement's last line inherits the terminator the range's
   * last line had, so replacing the last line of a file without a final newline does not add one.
   */
  replace(range: LineRange, replacement: readonly string[]): void {
    this.guard(range);
    const ending = this.items[range.end].ending;
    const lines = replacement.map((text, index) => ({ text, ending: index === replacement.length - 1 ? ending : this.dominantEnding }));
    this.items.splice(range.start, range.end - range.start + 1, ...lines);
  }

  /**
   * Inserts lines before an index. Appending to a file whose last line has no terminator moves that
   * missing terminator to the new last line, which keeps an append reversible byte for byte.
   */
  insert(index: number, lines: readonly string[]): void {
    if (index < 0 || index > this.items.length) {
      throw new RangeError(`Line ${index} is outside a document of ${this.items.length} lines.`);
    }
    const appendingToUnterminated = index === this.items.length && this.items.length > 0 && this.items[this.items.length - 1].ending.length === 0;
    if (appendingToUnterminated) {
      const last = this.items[this.items.length - 1];
      this.items[this.items.length - 1] = { text: last.text, ending: this.dominantEnding };
    }
    const inserted = lines.map((text) => ({ text, ending: this.dominantEnding }));
    if (appendingToUnterminated && inserted.length > 0) {
      inserted[inserted.length - 1] = { text: inserted[inserted.length - 1].text, ending: '' };
    }
    this.items.splice(index, 0, ...inserted);
  }

  /** Removes the lines in a range. How the file ends passes to the line that becomes last. */
  remove(range: LineRange): void {
    this.guard(range);
    const removingTheEnd = range.end === this.items.length - 1;
    const ending = this.items[range.end].ending;
    this.items.splice(range.start, range.end - range.start + 1);
    if (removingTheEnd && this.items.length > 0) {
      const last = this.items[this.items.length - 1];
      this.items[this.items.length - 1] = { text: last.text, ending };
    }
  }

  /** Refused rather than clamped: a clamped range splices the wrong line. */
  private guard(range: LineRange): void {
    if (range.start < 0 || range.end < range.start) {
      throw new RangeError(`Line ${range.end} cannot precede line ${range.start}.`);
    }
    if (range.end >= this.items.length) {
      throw new RangeError(`Lines ${range.start}-${range.end} are outside a document of ${this.items.length} lines.`);
    }
  }
}