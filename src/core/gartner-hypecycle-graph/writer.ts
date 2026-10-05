import type { LineDocument, LineRange } from '../text/lineDocument';
import { findKey, findSection, indentOf, insertionPointFor, keyIndentWithin, quote, removeKey, setKey } from '../text/lineSplice';
import { roundHalfEven } from '../text/rounding';
import {
  boundaryKeys, formatAt, hasSpan, isNoEnd, isPlaceable, isReadableEnd, phaseCount,
  type End, type Influence, type Model, type Note, type Trend, type Trigger,
} from './model';
import { formatMonth } from './scale';

// Turns an edit into a splice of the lines that edit affects, and nothing else. Nothing serialises
// a model back to a file: every write is a splice of a range the parser recorded, so an unchanged
// document is byte-identical and an unknown key survives because nobody splices its line.
//
// A new key goes where a reader expects it: after the keys that precede it in the entry's key
// order, so a dragged boundary sits beside `phases`.
//
// Each function returns the sentence of a refusal, or undefined when the edit was spliced.

export type Refusal = string | undefined;

export const trendsSection = 'trends:';
export const triggersSection = 'triggers:';
export const notesSection = 'notes:';
export const influencesSection = 'influences:';

const trendKeyOrder = ['id', 'name', 'start', 'stop', 'row', 'phases', 'peak-end', 'trough-end', 'slope-end', 'tags', 'description'];
const triggerKeyOrder = ['id', 'name', 'date', 'row', 'tags', 'description'];
const noteKeyOrder = ['id', 'text', 'at', 'row', 'width', 'height'];
const influenceKeyOrder = ['id', 'from', 'from-phase', 'from-edge', 'from-at', 'to', 'to-phase', 'to-edge', 'to-at', 'description'];

const badAttachment = 'An influence attaches to a phase, on its top or bottom edge, at a fraction from 0 to 1.';

/** A range that follows its entry as keys are added to it and removed from it. */
interface Cursor {
  range: LineRange;
}

const leading = (text: string): string => text.slice(0, text.length - text.trimStart().length);

export function setTrendName(document: LineDocument, trend: Trend, name: string): Refusal {
  if (name.trim().length === 0) return 'A trend needs a name.';
  set(document, { range: trend.range }, trendKeyOrder, 'name', quote(name.trim()));
  return undefined;
}

export function setTriggerName(document: LineDocument, trigger: Trigger, name: string): Refusal {
  if (name.trim().length === 0) return 'A trigger needs a name.';
  set(document, { range: trigger.range }, triggerKeyOrder, 'name', quote(name.trim()));
  return undefined;
}

/** Rewrites a description; an empty one removes the key. */
export function setDescription(document: LineDocument, kind: 'trend' | 'trigger' | 'influence', entry: { range: LineRange }, description: string): Refusal {
  const order = kind === 'trend' ? trendKeyOrder : kind === 'trigger' ? triggerKeyOrder : influenceKeyOrder;
  const cursor = { range: entry.range };
  if (description.trim().length === 0) remove(document, cursor, 'description');
  else set(document, cursor, order, 'description', quote(description));
  return undefined;
}

/** Rewrites a trend's dates, row and stored boundaries: a move, a resize, or a date typed in the grid. */
export function setSpan(document: LineDocument, trend: Trend, start: number, stop: number, row: number, dragged: readonly (number | undefined)[]): Refusal {
  if (stop <= start) return 'A trend must be at least one month long.';
  const cursor = { range: trend.range };
  set(document, cursor, trendKeyOrder, 'start', formatMonth(start));
  set(document, cursor, trendKeyOrder, 'stop', formatMonth(stop));
  if (row !== trend.row || findKey(document, cursor.range, 'row') >= 0) {
    set(document, cursor, trendKeyOrder, 'row', String(row));
  }
  writeBoundaries(document, cursor, dragged);
  return undefined;
}

/** Rewrites a trend's stored boundaries: a dragged one written, a cleared one removed. */
export function setBoundaries(document: LineDocument, trend: Trend, dragged: readonly (number | undefined)[]): Refusal {
  writeBoundaries(document, { range: trend.range }, dragged);
  return undefined;
}

/** Rewrites how many phases a trend shows. Its stored boundaries are kept. */
export function setPhases(document: LineDocument, trend: Trend, phases: number): Refusal {
  if (!Number.isInteger(phases) || phases < 1 || phases > phaseCount) return `A trend shows 1 to ${phaseCount} phases.`;
  set(document, { range: trend.range }, trendKeyOrder, 'phases', String(phases));
  return undefined;
}

/** Rewrites tags as one flow sequence line, so a tag added rewrites one line. No tags removes the key. */
export function setTags(document: LineDocument, kind: 'trend' | 'trigger', entry: { range: LineRange }, tags: readonly string[]): Refusal {
  const cursor = { range: entry.range };
  if (tags.length === 0) remove(document, cursor, 'tags');
  else set(document, cursor, kind === 'trend' ? trendKeyOrder : triggerKeyOrder, 'tags', flowSequence(tags));
  return undefined;
}

/** Rewrites one end of an influence: its phase, edge and `at`. */
export function setEnd(document: LineDocument, influence: Influence, side: string, end: End): Refusal {
  if (side !== 'from' && side !== 'to') return 'An influence has a from end and a to end.';
  if (!isReadableEnd(end)) return badAttachment;
  const cursor = { range: influence.range };
  set(document, cursor, influenceKeyOrder, `${side}-phase`, end.phase);
  set(document, cursor, influenceKeyOrder, `${side}-edge`, end.edge);
  set(document, cursor, influenceKeyOrder, `${side}-at`, formatAt(end.at));
  return undefined;
}

/** Removes a trend or trigger and every influence touching it, bottom-up, so one undo restores all of them. */
export function removeWithInfluences(document: LineDocument, model: Model, entry: { id: string; range: LineRange }): Refusal {
  const ranges = model.influences
    .filter((influence) => influence.from === entry.id || influence.to === entry.id)
    .map((influence) => influence.range)
    .concat(entry.range)
    .sort((a, b) => b.start - a.start);
  for (const range of ranges) document.remove(range);
  return undefined;
}

/** Removes one influence, or one note, which takes part in no relation. */
export function removeEntry(document: LineDocument, entry: { range: LineRange }): Refusal {
  document.remove(entry.range);
  return undefined;
}

/** Appends a trend entry, matching whatever indentation the document already uses. */
export function addTrend(document: LineDocument, model: Model, trend: Omit<Trend, 'range' | 'draggedEnds' | 'description'>): Refusal {
  if (!hasSpan(trend)) return 'A trend must be at least one month long.';
  const ranges = model.trends.map((existing) => existing.range);
  const at = insertionPointFor(document, ranges, trendsSection);
  if (at < 0) return `The document has no \`${trendsSection}\` section to add to.`;
  const { itemIndent, dashGap, keyIndent } = indentOf(document, ranges);
  const lines = [
    `${itemIndent}-${dashGap}id: ${quote(trend.id)}`,
    `${keyIndent}name: ${quote(trend.name)}`,
    `${keyIndent}start: ${formatMonth(trend.start)}`,
    `${keyIndent}stop: ${formatMonth(trend.stop)}`,
    `${keyIndent}row: ${trend.row}`,
    `${keyIndent}phases: ${trend.phases}`,
  ];
  if (trend.tags.length > 0) lines.push(`${keyIndent}tags: ${flowSequence(trend.tags)}`);
  document.insert(at, lines);
  return undefined;
}

/** Appends an influence entry. One from a trigger states no from end at all; every other end must read. */
export function addInfluence(document: LineDocument, model: Model, influence: Omit<Influence, 'range' | 'description'>): Refusal {
  if ((!isNoEnd(influence.fromEnd) && !isReadableEnd(influence.fromEnd)) || !isReadableEnd(influence.toEnd)) return badAttachment;
  const ranges = model.influences.map((existing) => existing.range);
  const at = insertionPointFor(document, ranges, influencesSection);
  if (at < 0) return `The document has no \`${influencesSection}\` section to add to.`;
  // With no influence yet to copy, the trends' indentation is the document's style.
  const { itemIndent, dashGap, keyIndent } = indentOf(document, ranges.length > 0 ? ranges : trendRanges(document, model));
  const lines = [`${itemIndent}-${dashGap}id: ${quote(influence.id)}`, `${keyIndent}from: ${quote(influence.from)}`];
  if (!isNoEnd(influence.fromEnd)) {
    lines.push(`${keyIndent}from-phase: ${influence.fromEnd.phase}`, `${keyIndent}from-edge: ${influence.fromEnd.edge}`, `${keyIndent}from-at: ${formatAt(influence.fromEnd.at as number)}`);
  }
  lines.push(`${keyIndent}to: ${quote(influence.to)}`, `${keyIndent}to-phase: ${influence.toEnd.phase}`, `${keyIndent}to-edge: ${influence.toEnd.edge}`, `${keyIndent}to-at: ${formatAt(influence.toEnd.at)}`);
  document.insert(at, lines);
  return undefined;
}

/** Rewrites an entry's row alone: an arrangement, which never touches a date. */
export function setRow(document: LineDocument, kind: 'trend' | 'trigger' | 'note', entry: { range: LineRange }, row: number): Refusal {
  const order = kind === 'trend' ? trendKeyOrder : kind === 'trigger' ? triggerKeyOrder : noteKeyOrder;
  set(document, { range: entry.range }, order, 'row', String(row));
  return undefined;
}

/** Rewrites a trigger's date and row: a move, or a date typed in the grid. */
export function setTriggerPlacement(document: LineDocument, trigger: Trigger, date: number, row: number): Refusal {
  const cursor = { range: trigger.range };
  set(document, cursor, triggerKeyOrder, 'date', formatMonth(date));
  if (row !== trigger.row || findKey(document, cursor.range, 'row') >= 0) {
    set(document, cursor, triggerKeyOrder, 'row', String(row));
  }
  return undefined;
}

/** Rewrites a note's text: one line as a plain or quoted scalar, several as a literal block. */
export function setNoteText(document: LineDocument, note: Note, text: string): Refusal {
  const range = note.range;
  const indent = keyIndentWithin(document, range);
  const index = findKey(document, range, 'text');
  if (index >= 0) {
    const existing = document.lines[index].text;
    const prefix = existing.trimStart().startsWith('- ') ? `${leading(existing)}- ` : leading(existing);
    document.replace({ start: index, end: blockEnd(document, range, index) }, textLines(prefix, indent, text));
    return undefined;
  }
  const after = findKey(document, range, 'id');
  document.insert((after >= 0 ? after : range.start) + 1, textLines(indent, indent, text));
  return undefined;
}

/** Rewrites where a note's top-left sits: the month of its left edge and the row of its top. */
export function setNotePlacement(document: LineDocument, note: Note, at: number, row: number): Refusal {
  const cursor = { range: note.range };
  set(document, cursor, noteKeyOrder, 'at', formatMonth(at));
  set(document, cursor, noteKeyOrder, 'row', String(row));
  return undefined;
}

/** Rewrites a note's size, and its left edge's month and top's row when the left or top border moved. */
export function setNoteSize(document: LineDocument, note: Note, at: number, row: number, width: number, height: number): Refusal {
  if (width <= 0 || height <= 0) return 'A note needs a width and a height.';
  const cursor = { range: note.range };
  if (note.at !== at) set(document, cursor, noteKeyOrder, 'at', formatMonth(at));
  if (note.row !== row) set(document, cursor, noteKeyOrder, 'row', String(row));
  set(document, cursor, noteKeyOrder, 'width', formatSize(width));
  set(document, cursor, noteKeyOrder, 'height', formatSize(height));
  return undefined;
}

/** Appends a trigger entry, opening a `triggers:` list before `influences:` when the document has none. */
export function addTrigger(document: LineDocument, model: Model, trigger: Omit<Trigger, 'range' | 'description'>): Refusal {
  if (trigger.date === undefined) return 'A trigger needs a date.';
  const ranges = model.triggers.map((existing) => existing.range);
  const { at, itemIndent, dashGap, keyIndent } = entryPoint(document, model, ranges, triggersSection);
  const lines = [
    `${itemIndent}-${dashGap}id: ${quote(trigger.id)}`,
    `${keyIndent}name: ${quote(trigger.name)}`,
    `${keyIndent}date: ${formatMonth(trigger.date)}`,
    `${keyIndent}row: ${trigger.row}`,
  ];
  if (trigger.tags.length > 0) lines.push(`${keyIndent}tags: ${flowSequence(trigger.tags)}`);
  document.insert(at, lines);
  return undefined;
}

/** Appends a note entry, opening a `notes:` list before `influences:` when the document has none. */
export function addNote(document: LineDocument, model: Model, note: Omit<Note, 'range'>): Refusal {
  if (!isPlaceable(note)) return 'A note needs a position, a width and a height.';
  const ranges = model.notes.map((existing) => existing.range);
  const { at, itemIndent, dashGap, keyIndent } = entryPoint(document, model, ranges, notesSection);
  const lines = [
    `${itemIndent}-${dashGap}id: ${quote(note.id)}`,
    ...textLines(keyIndent, keyIndent, note.text),
    `${keyIndent}at: ${formatMonth(note.at)}`,
    `${keyIndent}row: ${note.row}`,
    `${keyIndent}width: ${formatSize(note.width)}`,
    `${keyIndent}height: ${formatSize(note.height)}`,
  ];
  document.insert(at, lines);
  return undefined;
}

/** Rewrites the document's time unit: the top-level `unit:` key, written after the header. */
export function setUnit(document: LineDocument, unit: string): Refusal {
  const index = document.lines.findIndex((line) => /^unit\s*:/.test(line.text));
  if (index >= 0) {
    document.replace({ start: index, end: index }, [`unit: ${unit}`]);
    return undefined;
  }
  const header = document.lines.findIndex((line) => line.text.startsWith('gartner-hypecycle-graph'));
  document.insert(header >= 0 ? header + 1 : 0, [`unit: ${unit}`]);
  return undefined;
}

function trendRanges(document: LineDocument, model: Model): LineRange[] {
  return model.trends.map((trend) => trend.range).filter((range) => range.end < document.lines.length);
}

// Where a new entry of a list goes and the indentation to write it with: after the list's last
// entry; after its key when it has none; and, when the document has no such list at all, after a
// new key opened directly before `influences:`, or at the end when there is no `influences:` either.
function entryPoint(document: LineDocument, model: Model, ranges: LineRange[], section: string): { at: number; itemIndent: string; dashGap: string; keyIndent: string } {
  const indent = indentOf(document, ranges.length > 0 ? ranges : trendRanges(document, model));
  const at = insertionPointFor(document, ranges, section);
  if (at >= 0) return { at, ...indent };
  const influences = findSection(document, influencesSection);
  const opening = influences >= 0 ? influences : document.lines.length;
  document.insert(opening, [section]);
  return { at: opening + 1, ...indent };
}

// A note's text key as lines: one plain or quoted scalar for text without a line break, otherwise
// a literal block (`|-`) indented two further than the key. A block whose first line starts with a
// space states its indentation, or YAML would read the space as indentation.
function textLines(keyPrefix: string, keyIndent: string, text: string): string[] {
  const normalised = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').replace(/\n+$/, '');
  if (!normalised.includes('\n')) return [`${keyPrefix}text: ${quote(normalised)}`];
  const blockIndent = `${keyIndent}  `;
  const lines = [`${keyPrefix}text: ${normalised.startsWith(' ') ? '|2-' : '|-'}`];
  lines.push(...normalised.split('\n').map((line) => (line.length === 0 ? '' : blockIndent + line)));
  return lines;
}

// The last line of the key on `keyLine`: its own line, or the last line of the block scalar that
// follows it, which is every line indented further than the key, blank lines inside it included.
function blockEnd(document: LineDocument, range: LineRange, keyLine: number): number {
  const keyText = document.lines[keyLine].text;
  const keyIndent = keyText.length - keyText.trimStart().replace(/^-+/, '').trimStart().length;
  let end = keyLine;
  for (let index = keyLine + 1; index <= range.end && index < document.lines.length; index++) {
    const text = document.lines[index].text;
    if (text.trim().length === 0) continue;
    if (leading(text).length <= keyIndent) break;
    end = index;
  }
  return end;
}

/** A size as the document writes it: a whole number without decimals, otherwise at most two. */
export function formatSize(size: number): string {
  return String(roundHalfEven(size * 100) / 100);
}

/** Tags as a YAML flow sequence, quoting a tag only where a flow sequence needs it. */
export function flowSequence(tags: readonly string[]): string {
  return `[${tags.map(quoteInFlow).join(', ')}]`;
}

function quoteInFlow(tag: string): string {
  const quoted = quote(tag);
  if (quoted !== tag || !/[,[\]{}]/.test(tag)) return quoted;
  return `"${tag.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function writeBoundaries(document: LineDocument, cursor: Cursor, dragged: readonly (number | undefined)[]): void {
  boundaryKeys.forEach((key, index) => {
    const month = index < dragged.length ? dragged[index] : undefined;
    if (month !== undefined) set(document, cursor, trendKeyOrder, key, formatMonth(month));
    else remove(document, cursor, key);
  });
}

// Writes one key inside an entry: in place when it is there, otherwise after the last key that
// precedes it in the order. The cursor's range follows the lines added.
function set(document: LineDocument, cursor: Cursor, order: readonly string[], key: string, value: string): void {
  if (findKey(document, cursor.range, key) >= 0) {
    setKey(document, cursor.range, key, value);
    return;
  }
  let after = -1;
  for (const earlier of order) {
    if (earlier === key) break;
    after = Math.max(after, findKey(document, cursor.range, earlier));
  }
  document.insert((after >= 0 ? after : cursor.range.start) + 1, [`${keyIndentWithin(document, cursor.range)}${key}: ${value}`]);
  cursor.range = { start: cursor.range.start, end: cursor.range.end + 1 };
}

function remove(document: LineDocument, cursor: Cursor, key: string): void {
  if (findKey(document, cursor.range, key) >= 0) {
    removeKey(document, cursor.range, key);
    cursor.range = { start: cursor.range.start, end: cursor.range.end - 1 };
  }
}