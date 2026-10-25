import { attributeOf, type FblBinding, type HeaderSettings, type Rule, type Slot } from '../../documents/types';
import { RegexBudgetError, type BoundedRegex } from '../../expressions/regexMatcher';
import { findingCodes } from '../../finding';
import { messages } from '../../messages';
import type { ResolvedOptions } from '../../model';
import type { ChangePosition } from '../../planning/modelChange';
import { plain, render } from '../../planning/newText';
import {
  positionIndex, readOnlyAbsent, refuse,
  type Candidate, type Entry, type InsertRequest, type ReadElement, type Reading, type SlotChange, type SlotRead, type SplicePlan,
} from '../../rules/familyReader';
import type { Span } from '../../span';
import type { BodyText } from '../../text/bodyText';
import { LinesFamily, type Statement } from '../lines/linesFamily';
import { Bullet, BulletsParser } from './bulletsParser';
import { columnsOf, indented, linesOf, shifted } from './columns';

/** Where a new or moved item goes, in the body before the edit, and the indentation and marker it takes (FBL 0.7 6.3). */
interface Place {
  readonly offset: number;
  readonly indent: string;
  readonly marker: string;
  readonly blankBefore: boolean;
}

/**
 * The `bullets` family (FBL 0.7 4.8, 6.3): the list items under the headings a binding names, read
 * as a tree, and the statements outside every item, read as the `lines` family reads its own. An
 * item's text is matched and written as a statement is, so the groups, the words and re-emitting
 * are those of `LinesFamily`; what is the family's own is its kinds of line, its sections, the
 * continuation, and where a new or moved item goes. A port of standalone's `BulletsFamily`.
 */
export class BulletsFamily extends LinesFamily {
  private lineEntries: Statement[] = [];
  private lineLeaves: Span[] = [];
  /** Each section the body has, by name: the line of its heading and the line it ends before. */
  private readonly sections = new Map<string, { readonly first: number; readonly end: number }>();

  constructor(text: BodyText, binding: FblBinding, options: ResolvedOptions) {
    super(text, binding, options, false);
  }

  override get familyName(): string {
    return 'bullets';
  }

  override get entries(): readonly Entry[] {
    return this.lineEntries;
  }

  override get leaves(): readonly Span[] {
    return this.lineLeaves;
  }

  override get placesByPosition(): boolean {
    return true;
  }

  /** The body is never unreadable for its family: Markdown has no malformed list (FBL 0.7 4.8). */
  override parse(): void {
    const parser = new BulletsParser(this.text);
    parser.parse();
    this.lineEntries = parser.entries;
    this.lineLeaves = parser.leaves;
    // A section is the lines after the first heading that matches, up to the next heading with as many # or fewer.
    for (const section of this.binding.sections) {
      const regex = this.regex(section.heading, section.caseInsensitive);
      const first = parser.headings.find((heading) => this.holds(regex, heading.text));
      if (!first) continue;
      const end = parser.headings.find((heading) => heading.line > first.line && heading.level <= first.level)?.line ?? this.text.lines.length;
      this.sections.set(section.name, { first: first.line, end });
    }
  }

  /** Whether a text matches; an expression that takes too long reads it as not matching. */
  private holds(regex: BoundedRegex, input: string): boolean {
    try {
      return regex.isMatch(input);
    } catch (error) {
      if (error instanceof RegexBudgetError) return false;
      throw error;
    }
  }

  /** Whether `item` stands in the section `name`: its item line is one of the section's lines. */
  private standsIn(item: Bullet, name: string): boolean {
    const section = this.sections.get(name);
    return section !== undefined && section.first < item.firstLine && item.firstLine < section.end;
  }

  /** Line 1, after a byte-order mark, must match the header (FBL 0.7 5.6); when it is a statement, no rule reads it. */
  override headerHolds(header: HeaderSettings): boolean {
    if (header.line === undefined) return true;
    const line = this.text.lines[0];
    let first = this.text.bomLength;
    while (first < line.contentEnd && (this.text.bytes[first] === 0x20 || this.text.bytes[first] === 0x09)) first++;
    if (!this.holds(this.regex(header.line, false), this.text.text(first, line.contentEnd))) return false;
    const statement = this.lineEntries.find((entry) => entry.firstLine === 0 && !(entry instanceof Bullet));
    if (statement) statement.isHeader = true;
    return true;
  }

  /** A rule with `within` matches the items of the sections it names; one without matches statements (FBL 0.7 4.8). */
  override candidates(rule: Rule): Candidate[] {
    const line = rule.line;
    if (line === undefined) return [];
    const found: Candidate[] = [];
    for (const entry of this.lineEntries) {
      if (entry.isHeader) continue;
      const within = rule.within;
      if (within !== undefined ? !(entry instanceof Bullet) || !within.some((name) => this.standsIn(entry, name)) : entry instanceof Bullet) continue;
      const groups = this.match(line, rule.caseInsensitive, entry);
      if (groups) found.push({ rule, entry, captures: new Map([...groups].map(([name, group]) => [name, group.value])) });
    }
    return found;
  }

  override blockCandidates(): Candidate[] {
    return [];
  }

  /** An item nested in an item no rule read, or one that could not be read, is not looked into (FBL 0.7 4.8). */
  override admits(within: readonly string[] | undefined, entry: Entry, claimedBy: (entry: Entry) => string | undefined): boolean {
    void within;
    return entry.parent === undefined || claimedBy(entry.parent) !== undefined;
  }

  override read(candidate: Candidate, slot: Slot): SlotRead {
    if (slot.continuation !== true) return super.read(candidate, slot);
    const item = candidate.entry;
    if (!(item instanceof Bullet)) return readOnlyAbsent(messages.statementHasNoContinuation);
    return { value: item.continuationText(this.text), span: item.continuationSpan(this.text), present: true, writable: true, node: item };
  }

  override afterRead(claimedBy: (entry: Entry) => string | undefined): void {
    if (!this.binding.reportUnmatched) return;
    for (const statement of this.lineEntries) {
      if (statement instanceof Bullet || statement.isHeader || claimedBy(statement) !== undefined) continue;
      this.report(findingCodes.unboundStatement, 'warning', messages.unboundStatement, statement.firstLineSpan);
    }
  }

  // ---- writing the continuation (FBL 0.7 6.3) ----

  /**
   * The continuation is written here, every other slot as the `lines` family writes it: setting it is
   * a `replace-value` of its value span, an `insert-key` at the end of the item line when it has none,
   * and setting the empty text a `remove-key` of the span.
   */
  override write(plan: SplicePlan, element: ReadElement, changes: readonly SlotChange[]): void {
    const others: SlotChange[] = [];
    for (const change of changes) {
      if (change.binding.continuation !== true) {
        others.push(change);
        continue;
      }
      const item = element.entry as Bullet;
      const span = change.read.span;
      const value = change.isEmpty ? '' : plain(change.value);
      if (span) {
        if (value === change.read.value) continue;
        if (value.length === 0) plan.addAt('remove-key', span, '');
        else plan.addAt('replace-value', span, indented(value, item.contentColumn, this.newlineAt(span.start)));
        continue;
      }
      if (value.length === 0) continue;
      const offset = this.text.lines[item.firstLine].contentEnd;
      plan.add('insert-key', offset, offset, indented(value, item.contentColumn, this.newlineAt(offset)));
    }
    if (others.length > 0) super.write(plan, element, others);
  }

  // ---- new and moved items (FBL 0.7 6.2, 6.3) ----

  override insert(plan: SplicePlan, request: InsertRequest): void {
    const rule = request.rule;
    const settings = rule.insert;
    if (settings?.emit === undefined) refuse(messages.noEmit(rule.type));
    if (settings.place === 'after-header' && rule.within === undefined) {
      // A statement written right after the line the header matched, as a line of its own (FBL 0.7 6.2).
      const afterHeader = this.text.lines[0].end;
      const line = render(settings.emit, (name) => this.placeholder(rule, name, request.values, request.id, undefined, undefined));
      plan.add('insert-entry', afterHeader, afterHeader, this.asLines(line, afterHeader, false, this.newlineAt(afterHeader)));
      return;
    }
    if (!['after-last', 'end', 'last-child', 'start'].includes(settings.place)) refuse(messages.cannotPlace(this.familyName, settings.place));
    const line = render(settings.emit, (name) => this.placeholder(rule, name, request.values, request.id, request.source?.key, request.target?.key));
    const parent = request.parent?.entry as Bullet | undefined;
    const siblings = this.siblings(plan.reading, rule, request.parent);
    const index = request.position !== undefined ? positionIndex(request.position, siblings, rule.type) : settings.place === 'start' ? 0 : siblings.length;
    const place = this.place(plan, rule, parent, siblings, index);
    let lines = `${place.indent}${place.marker} ${line}`;
    const continuation = rule.attributes.find(([, attribute]) => attribute.continuation === true)?.[0];
    const notes = continuation === undefined ? '' : plain(request.values.get(continuation));
    if (notes.length > 0) lines += indented(notes, columnsOf(place.indent) + 2, '\n');
    plan.add('insert-entry', place.offset, place.offset, this.asLines(lines, place.offset, place.blankBefore, this.newlineAt(place.offset)));
  }

  /**
   * The text of new lines at `offset`, written with `newline`: each line followed by a line ending,
   * or, at the end of a body whose last line has none, each preceded by one and the body still
   * without a final newline (FBL 6.3). `blankBefore` writes one more ending first, so a blank line
   * stands before the text.
   */
  private asLines(text: string, offset: number, blankBefore: boolean, newline: string): string {
    const lines = this.text.lines;
    const endless = offset === this.text.length && this.text.length > 0 && lines[lines.length - 1].ending.length === 0;
    let output = endless ? newline : '';
    if (blankBefore) output += newline;
    text.split('\n').forEach((line, index) => {
      if (endless && index > 0) output += newline;
      output += line;
      if (!endless) output += newline;
    });
    return output;
  }

  /**
   * Where a new item goes among `siblings` at `index`, and the indentation and marker it takes (FBL
   * 0.7 6.3): after its previous sibling's line span with that sibling's; else at the start of its next
   * sibling's with that one's; else as its parent's first nested item, with the parent's marker at its
   * content column; else as the first item of its section, creating the section when it is missing.
   */
  private place(plan: SplicePlan, rule: Rule, parent: Bullet | undefined, siblings: readonly ReadElement[], index: number): Place {
    if (index > 0) {
      const previous = siblings[index - 1].entry as Bullet;
      return { offset: previous.lineSpan!.end, indent: previous.indentText, marker: previous.marker, blankBefore: false };
    }
    if (siblings.length > 0) {
      const next = siblings[0].entry as Bullet;
      return { offset: next.lineSpan!.start, indent: next.indentText, marker: next.marker, blankBefore: false };
    }
    if (parent) {
      const last = parent.continuation.length > 0 ? parent.continuation[parent.continuation.length - 1] : parent.firstLine;
      return { offset: this.text.lines[last].end, indent: ' '.repeat(parent.contentColumn), marker: parent.marker, blankBefore: false };
    }
    const name = rule.insert?.container ?? rule.within?.[0];
    const section = name === undefined ? undefined : this.sections.get(name);
    if (section) {
      let lastLine = section.first;
      for (let line = section.first + 1; line < section.end; line++) {
        if (!this.isBlankLine(line)) lastLine = line;
      }
      return { offset: this.text.lines[lastLine].end, indent: '', marker: '-', blankBefore: true };
    }
    const create = rule.insert?.create;
    if (create?.at !== 'end-of-document' || create.text === undefined) refuse(messages.noSection(rule.type));
    const offset = this.text.length;
    const blankOrEmpty = this.text.length === this.text.bomLength || this.isBlankLine(this.text.lines.length - 1);
    plan.add('ensure-container', offset, offset, this.asLines(create.text, offset, !blankOrEmpty, this.newlineAt(offset)));
    return { offset, indent: '', marker: '-', blankBefore: true };
  }

  private isBlankLine(index: number): boolean {
    const line = this.text.lines[index];
    for (let i = line.start; i < line.contentEnd; i++) {
      if (this.text.bytes[i] !== 0x20 && this.text.bytes[i] !== 0x09) return false;
    }
    return true;
  }

  /**
   * The elements a new or moved item of `rule` stands among (FBL 0.7 6.2): those read from items
   * nested in `parent`, or, at the top level, the top-level items of the rule's section.
   */
  private siblings(reading: Reading, rule: Rule, parent: ReadElement | undefined): ReadElement[] {
    const name = rule.insert?.container ?? rule.within?.[0];
    return reading.elements.filter((element) => {
      const item = element.entry;
      if (!(item instanceof Bullet) || element.parent !== parent) return false;
      return parent !== undefined || (item.parent === undefined && (name === undefined || this.standsIn(item, name)));
    });
  }

  /**
   * A retype (FBL 0.7 6.4): when the new type's rule has an `emit`, one `re-emit-line` of the item's
   * text from that `emit` with the retype's values; the marker, the continuation and the nested
   * items stay as they are, and nothing is warned of. The id is the one given, else the item's own.
   */
  override retype(plan: SplicePlan, element: ReadElement, rule: Rule, values: ReadonlyMap<string, unknown>): void {
    const emit = rule.insert?.emit;
    if (emit === undefined) refuse(messages.cannotRetype);
    const item = element.entry as Bullet;
    // The continuation stays where it is, so it is no part of the item's text.
    const given = new Map([...values].filter(([name]) => attributeOf(rule, name)?.continuation !== true));
    const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
    const id = text(given.get('id')) ?? text(element.idRead?.value) ?? element.id;
    const line = render(emit, (name) => this.placeholder(rule, name, given, id, undefined, undefined));
    const span = item.firstLineSpan;
    // An item with no text has its marker last on the line: the text is written a space after it.
    const lead = span.start === span.end && span.start > 0 && this.text.bytes[span.start - 1] !== 0x20 && this.text.bytes[span.start - 1] !== 0x09 ? ' ' : '';
    plan.addAt('re-emit-line', span, `${lead}${line}`);
  }

  /**
   * A move (FBL 0.7 5.5, 6.3): the item's line span is removed, and inserted where a new item would go
   * at `position` among `parent`'s children as they are without it, every line that is not blank
   * shifted by the difference between the column a new item's marker would have there and the
   * column its marker had. A move to where the item stands already writes nothing. In a body whose
   * last line has no line ending the body keeps having none (FBL 6.3): an item moved from the end of
   * it takes a line ending and leaves the one of the line before it removed, and an item moved to
   * the end of it is written after a line break and without its own last ending.
   */
  override moveTo(plan: SplicePlan, element: ReadElement, parent: ReadElement | undefined, position: ChangePosition | undefined): void {
    const item = element.entry as Bullet;
    const span = item.lineSpan!;
    const all = this.siblings(plan.reading, element.rule, parent);
    const siblings = all.filter((sibling) => sibling !== element);
    const index = positionIndex(position, siblings, element.rule.type);
    if (all.indexOf(element) === index) return;
    const place = this.place(plan, element.rule, parent?.entry as Bullet | undefined, siblings, index);
    // The place is taken in the body before the edit: just after the item's old parent is where the item starts.
    let offset = index > 0 && contains(siblings[index - 1].entry.lineSpan!, span) ? span.start : place.offset;
    const shift = columnsOf(place.indent) - item.markerColumn;
    const lines = linesOf(this.text.textOf(span));
    let moved = lines
      .map(({ line, ending }) => (line.replace(/[ \t]/g, '').length === 0 ? line : shifted(line, shift)) + ending)
      .join('');
    let removed: Span = span;
    const endless = this.text.length > 0 && this.text.lines[this.text.lines.length - 1].ending.length === 0;
    // Inserted right after the bytes it is taken from, the item stands where it would stand inserted before them.
    if (endless && offset === span.end) offset = span.start;
    if (endless && span.end === this.text.length && offset !== span.start) {
      // The item ends the body without a line ending: it takes one, and the line before it gives up its own.
      const previous = this.text.lines[this.text.lineIndexAt(span.start) - 1];
      moved += this.newlineAt(offset);
      removed = { start: previous.contentEnd, end: span.end };
    } else if (endless && offset === this.text.length) {
      // The item goes to the end of the body: the line break first, and none after it.
      const last = lines[lines.length - 1];
      moved = this.newlineAt(offset) + moved.slice(0, moved.length - last.ending.length);
    }
    plan.addAt('remove-entry', removed, '');
    plan.add('insert-entry', offset, offset, moved);
  }
}

const contains = (outer: Span, inner: Span): boolean => outer.start <= inner.start && inner.end <= outer.end;
