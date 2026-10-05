import { LineDocument } from '../text/lineDocument';
import { newShortGuid } from '../text/shortGuid';
import { rowsOf } from './arrangement';
import {
  bottomEdge, hasSpan, monthsOf, parseEnd, parseInteger, parseNumber, phaseCount, phaseNames, topEdge, visiblePhases,
  type End, type Model, type Note, type Trend, type Trigger, type Influence,
} from './model';
import { parse } from './parser';
import { moved, rescaled, withBoundary } from './phases';
import { alreadyInfluences } from './rules';
import { formatMonth, monthContaining, nearestMonthAt, parseMonth, rowAtMiddle, rowAtTop, rowStep, triggerSize } from './scale';
import * as writer from './writer';

// Every edit the hype cycle graph offers, as data. An edit is checked against the document as it
// is now, never against what the canvas believed, and it either splices the lines it concerns or
// is refused with a sentence. The sentences are the tool's own, the same in every ADP host.

export type Edit =
  | { readonly kind: 'addTrend'; readonly x: number; readonly y: number; readonly id?: string }
  | { readonly kind: 'addTrigger'; readonly x: number; readonly y: number; readonly id?: string }
  | { readonly kind: 'addNote'; readonly x: number; readonly y: number; readonly id?: string }
  | { readonly kind: 'addInfluence'; readonly from: string; readonly to: string; readonly fromEnd?: End; readonly toEnd?: End; readonly id?: string }
  | { readonly kind: 'rename'; readonly id: string; readonly name: string }
  | { readonly kind: 'remove'; readonly id: string }
  | { readonly kind: 'removeInfluence'; readonly id: string }
  /** A move: the top-left the element was dropped at. */
  | { readonly kind: 'setPlacement'; readonly id: string; readonly x: number; readonly y: number }
  /** A date typed in the grid, or a resize; an absent date keeps what the trend has. */
  | { readonly kind: 'setSpan'; readonly id: string; readonly start?: string; readonly stop?: string }
  | { readonly kind: 'setPhases'; readonly id: string; readonly phases: number }
  | { readonly kind: 'setBoundary'; readonly id: string; readonly index: number; readonly month: string }
  | { readonly kind: 'clearBoundaries'; readonly id: string }
  /** One end of an influence, written `phase/edge/at`. */
  | { readonly kind: 'setAttachment'; readonly id: string; readonly side: string; readonly end: string }
  /** Tags separated by commas. */
  | { readonly kind: 'setTags'; readonly id: string; readonly tags: string }
  | { readonly kind: 'setDescription'; readonly id: string; readonly description: string }
  /** `W x H`, optionally followed by `at YYYY-MM` and `row N`. */
  | { readonly kind: 'setNoteSize'; readonly id: string; readonly size: string }
  | { readonly kind: 'arrange' };

export type Outcome = { readonly text: string; readonly refusal?: undefined } | { readonly refusal: string; readonly text?: undefined };

export const defaultTrendName = 'New trend';
export const defaultTriggerName = 'Trigger';
export const defaultTrendSteps = 12;
export const defaultNoteWidth = 160;
export const defaultNoteHeight = 64;

const gone = 'That is no longer in this graph.';
const noSpan = "This trend's dates cannot be read, so it cannot be changed until they are fixed in the file.";
const idTaken = 'That id is already used in this graph.';
export const unreadable = 'The graph could not be read, so it cannot be edited.';

export const trendOf = (model: Model, id: string): Trend | undefined => model.trends.find((trend) => trend.id === id);
export const triggerOf = (model: Model, id: string): Trigger | undefined => model.triggers.find((trigger) => trigger.id === id);
export const noteOf = (model: Model, id: string): Note | undefined => model.notes.find((note) => note.id === id);
export const influenceOf = (model: Model, id: string): Influence | undefined => model.influences.find((influence) => influence.id === id);

function isIdTaken(model: Model, id: string): boolean {
  return [...model.trends, ...model.triggers, ...model.notes, ...model.influences].some((entry) => entry.id === id);
}

/** A name not yet in use: the name itself, or the name with the first free number from 2. */
export function uniqueName(taken: Iterable<string>, name: string): string {
  const names = new Set(taken);
  if (!names.has(name)) return name;
  for (let number = 2; ; number++) {
    const candidate = `${name} ${number}`;
    if (!names.has(candidate)) return candidate;
  }
}

/** Why a trend showing `phases` phases cannot be `months` long, or undefined when it can. */
export function tooShort(months: number, phases: number): string | undefined {
  if (months >= Math.max(1, phases)) return undefined;
  return phases <= 1 ? 'A trend must be at least one month long.' : `A trend showing ${phases} phases must be at least ${phases} months long, one per phase.`;
}

/** Why an influence from one element to another cannot be drawn, or undefined when it can. */
export function influenceRefusal(model: Model, from: string, to: string): string | undefined {
  if (triggerOf(model, to) && !trendOf(model, to)) return 'An influence cannot end at a trigger.';
  if ((!trendOf(model, from) && !triggerOf(model, from)) || !trendOf(model, to)) return 'An influence is drawn from one trend to another.';
  if (from === to) return 'A trend cannot influence itself.';
  // Every influence in the document counts, including one hidden by a phase count.
  return alreadyInfluences(model, from, to) ? 'This trend already influences that one; a trend influences another once in each direction.' : undefined;
}

/** How many influences go with a trend or trigger when it is removed. */
export function influencesTouching(model: Model, id: string): number {
  return trendOf(model, id) || triggerOf(model, id) ? model.influences.filter((influence) => influence.from === id || influence.to === id).length : 0;
}

/** The question to ask before a removal, or undefined when it removes at once. */
export function removalConfirmation(model: Model, id: string): { title: string; message: string } | undefined {
  const count = influencesTouching(model, id);
  if (count === 0) return undefined;
  const what = trendOf(model, id) ? 'trend' : 'trigger';
  return { title: 'Remove', message: `Removing this ${what} also removes the ${count === 1 ? '1 influence' : `${count} influences`} to or from it.` };
}

/** Reads `W x H [at YYYY-MM] [row N]`, as the grid and a resize write a note's size. */
export function parseNoteSize(size: string | undefined): { width: number; height: number; at?: number; row?: number } | undefined {
  const match = /^\s*(?<width>[0-9.]+)\s*x\s*(?<height>[0-9.]+)\s*(at\s+(?<at>\S+))?\s*(row\s+(?<row>-?[0-9]+))?\s*$/.exec(size ?? '');
  if (!match?.groups) return undefined;
  const width = parseNumber(match.groups.width);
  const height = parseNumber(match.groups.height);
  if (width === undefined || height === undefined) return undefined;
  let at: number | undefined;
  if (match.groups.at !== undefined) {
    at = parseMonth(match.groups.at);
    if (at === undefined) return undefined;
  }
  const row = match.groups.row !== undefined ? parseInteger(match.groups.row) : undefined;
  return { width, height, ...(at !== undefined ? { at } : {}), ...(row !== undefined ? { row } : {}) };
}

/** Tags as the grid states them: separated by commas, trimmed, each once. */
export function parseTags(tags: string): string[] {
  return [...new Set(tags.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0))];
}

/** Applies one edit to a document's text: the new text, or the sentence of a refusal. */
export function apply(text: string, edit: Edit): Outcome {
  const document = LineDocument.parse(text);
  const model = parse(document);
  if (!model.readable) return { refusal: unreadable };
  const refusal = run(document, model, edit);
  return refusal === undefined ? { text: document.text } : { refusal };
}

function run(document: LineDocument, model: Model, edit: Edit): writer.Refusal {
  switch (edit.kind) {
    case 'addTrend': {
      const id = edit.id || newShortGuid();
      if (isIdTaken(model, id)) return idTaken;
      const start = monthContaining(edit.x, model.unit);
      return writer.addTrend(document, model, {
        id, name: uniqueName(model.trends.map((trend) => trend.name), defaultTrendName), start, stop: start + defaultTrendSteps * model.unit.months,
        row: rowAtMiddle(edit.y), phases: phaseCount, tags: [],
      });
    }
    case 'addTrigger': {
      const id = edit.id || newShortGuid();
      if (isIdTaken(model, id)) return idTaken;
      return writer.addTrigger(document, model, {
        id, name: uniqueName(model.triggers.map((trigger) => trigger.name), defaultTriggerName), date: monthContaining(edit.x, model.unit), row: rowAtMiddle(edit.y), tags: [],
      });
    }
    case 'addNote': {
      const id = edit.id || newShortGuid();
      if (isIdTaken(model, id)) return idTaken;
      return writer.addNote(document, model, { id, text: '', at: monthContaining(edit.x, model.unit), row: Math.floor(edit.y / rowStep), width: defaultNoteWidth, height: defaultNoteHeight });
    }
    case 'addInfluence': {
      const refusal = influenceRefusal(model, edit.from, edit.to);
      if (refusal) return refusal;
      const id = edit.id || newShortGuid();
      if (isIdTaken(model, id)) return idTaken;
      // A trigger has no phases, so an influence leaving one states no end at all.
      const from = trendOf(model, edit.from);
      const fromEnd: End = from ? edit.fromEnd ?? { phase: phaseNames[visiblePhases(from) - 1], edge: bottomEdge, at: 0.5 } : { phase: '', edge: '', at: undefined };
      return writer.addInfluence(document, model, { id, from: edit.from, fromEnd, to: edit.to, toEnd: edit.toEnd ?? { phase: phaseNames[0], edge: topEdge, at: 0.5 } });
    }
    case 'rename': {
      const trend = trendOf(model, edit.id);
      if (trend) return writer.setTrendName(document, trend, edit.name);
      const trigger = triggerOf(model, edit.id);
      if (trigger) return writer.setTriggerName(document, trigger, edit.name);
      const note = noteOf(model, edit.id);
      return note ? writer.setNoteText(document, note, edit.name) : gone;
    }
    case 'remove': {
      const element = trendOf(model, edit.id) ?? triggerOf(model, edit.id);
      if (element) return writer.removeWithInfluences(document, model, element);
      const note = noteOf(model, edit.id);
      return note ? writer.removeEntry(document, note) : gone;
    }
    case 'removeInfluence': {
      const influence = influenceOf(model, edit.id);
      return influence ? writer.removeEntry(document, influence) : gone;
    }
    case 'setPlacement': {
      const trigger = triggerOf(model, edit.id);
      if (trigger) {
        // The canvas sends the top-left; the trigger is placed by its centre.
        const half = triggerSize / 2;
        return writer.setTriggerPlacement(document, trigger, nearestMonthAt(edit.x + half, model.unit), rowAtMiddle(edit.y + half));
      }
      const note = noteOf(model, edit.id);
      if (note) return writer.setNotePlacement(document, note, nearestMonthAt(edit.x, model.unit), rowAtTop(edit.y));
      const trend = trendOf(model, edit.id);
      if (!trend) return gone;
      if (!hasSpan(trend)) return noSpan;
      const start = nearestMonthAt(edit.x, model.unit);
      const shift = start - trend.start;
      return writer.setSpan(document, trend, start, trend.stop + shift, rowAtTop(edit.y), moved(trend.draggedEnds, shift));
    }
    case 'setSpan': {
      const typed = edit.start ?? edit.stop;
      const trigger = triggerOf(model, edit.id);
      if (trigger) {
        const date = parseMonth(typed);
        return date === undefined ? `'${typed}' is not a date; write it as YYYY-MM, such as 1947-12.` : writer.setTriggerPlacement(document, trigger, date, trigger.row);
      }
      const trend = trendOf(model, edit.id);
      if (!trend) return gone;
      if (!hasSpan(trend)) return noSpan;
      const start = edit.start === undefined ? trend.start : parseMonth(edit.start);
      const stop = edit.stop === undefined ? trend.stop : parseMonth(edit.stop);
      if (start === undefined || stop === undefined) return `'${typed}' is not a date; write it as YYYY-MM, such as 2007-06.`;
      if (stop <= start) return 'A trend must stop after it starts, at least one month later.';
      const short = tooShort(stop - start, visiblePhases(trend));
      if (short) return short;
      return writer.setSpan(document, trend, start, stop, trend.row, rescaled(trend.draggedEnds, trend.start, trend.stop, start, stop, visiblePhases(trend)));
    }
    case 'setPhases': {
      const trend = trendOf(model, edit.id);
      if (!trend) return gone;
      const short = hasSpan(trend) ? tooShort(monthsOf(trend), edit.phases) : undefined;
      return short ?? writer.setPhases(document, trend, edit.phases);
    }
    case 'setBoundary': {
      const trend = trendOf(model, edit.id);
      if (!trend) return gone;
      if (!hasSpan(trend)) return noSpan;
      if (edit.index < 0 || edit.index >= visiblePhases(trend) - 1) return 'Only a boundary between two visible phases can be moved.';
      const month = parseMonth(edit.month);
      if (month === undefined) return `'${edit.month}' is not a date; write it as YYYY-MM, such as 2007-06.`;
      return writer.setBoundaries(document, trend, withBoundary(trend.draggedEnds, edit.index, month, trend.start, trend.stop, visiblePhases(trend)));
    }
    case 'clearBoundaries': {
      const trend = trendOf(model, edit.id);
      if (!trend) return gone;
      return trend.draggedEnds.every((boundary) => boundary === undefined)
        ? "This trend's phases are already even."
        : writer.setBoundaries(document, trend, [undefined, undefined, undefined]);
    }
    case 'setAttachment': {
      const influence = influenceOf(model, edit.id);
      if (!influence) return gone;
      return writer.setEnd(document, influence, edit.side, parseEnd(edit.end) ?? { phase: '', edge: '', at: undefined });
    }
    case 'setTags': {
      const trigger = triggerOf(model, edit.id);
      if (trigger) return writer.setTags(document, 'trigger', trigger, parseTags(edit.tags));
      const trend = trendOf(model, edit.id);
      return trend ? writer.setTags(document, 'trend', trend, parseTags(edit.tags)) : gone;
    }
    case 'setDescription': {
      const trend = trendOf(model, edit.id);
      if (trend) return writer.setDescription(document, 'trend', trend, edit.description);
      const trigger = triggerOf(model, edit.id);
      if (trigger) return writer.setDescription(document, 'trigger', trigger, edit.description);
      const influence = influenceOf(model, edit.id);
      return influence ? writer.setDescription(document, 'influence', influence, edit.description) : gone;
    }
    case 'setNoteSize': {
      const note = noteOf(model, edit.id);
      if (!note) return gone;
      const size = parseNoteSize(edit.size);
      if (!size) return `'${edit.size}' is not a size; write it as width x height, such as 160 x 64.`;
      const at = size.at ?? note.at;
      if (at === undefined) return "This note's position cannot be read, so it cannot be resized until it is fixed in the file.";
      return writer.setNoteSize(document, note, at, size.row ?? note.row, size.width, size.height);
    }
    case 'arrange': {
      const rows = rowsOf(model);
      if (rows.size === 0) return 'There is nothing to arrange until this graph has a trend.';
      const changes: { start: number; write: () => void }[] = [];
      const written = new Set<string>();
      const collect = (kind: 'trend' | 'trigger' | 'note', entries: readonly (Trend | Trigger | Note)[]): void => {
        for (const entry of entries) {
          const row = rows.get(entry.id);
          if (row !== undefined && row !== entry.row && !written.has(entry.id)) {
            written.add(entry.id);
            changes.push({ start: entry.range.start, write: () => void writer.setRow(document, kind, entry, row) });
          }
        }
      };
      collect('trend', model.trends);
      collect('trigger', model.triggers);
      collect('note', model.notes);
      if (changes.length === 0) return 'This graph is already arranged.';
      // Bottom-up, because a row key that is added moves every line after it.
      for (const change of changes.sort((a, b) => b.start - a.start)) change.write();
      return undefined;
    }
  }
}

/** A trend's start and stop as the dates a resize to this left edge and width means. */
export function spanOfResize(model: Model, x: number, width: number): { start: string; stop: string } {
  return { start: formatMonth(nearestMonthAt(x, model.unit)), stop: formatMonth(nearestMonthAt(x + width, model.unit)) };
}