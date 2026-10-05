import { isMap, isScalar, isSeq, parseDocument, type Node, type YAMLMap } from 'yaml';
import type { LineDocument, LineRange } from '../text/lineDocument';
import { LineIndex, rangeOfNode, scalarText } from '../text/yamlRange';
import {
  boundaryKeys, currentVersion, emptyModel, headerKey, monthUnit, noEnd, parseInteger, parseNumber, phaseCount, timeUnitNamed, timeUnits,
  type End, type Influence, type Model, type Note, type Problem, type TimeUnit, type Trend, type Trigger,
} from './model';
import { parseMonth } from './scale';

// Reads a line document into a model, recording which lines declare what. The YAML library reads
// and never writes: every write is a line splice.
//
// THIS PARSER NEVER THROWS. Text that is not YAML yields an empty model that is not readable, with
// the problem and its line. An unknown key, a malformed date or a phase count that is not a number
// is passed over: the entry is kept with whatever could be read, and a problem is recorded.
// What breaks a rule is not a parse problem; the rules report those under their own ids.

const trendKeys = ['id', 'name', 'start', 'stop', 'row', 'phases', 'peak-end', 'trough-end', 'slope-end', 'tags', 'description'];
const triggerKeys = ['id', 'name', 'date', 'row', 'tags', 'description'];
const noteKeys = ['id', 'text', 'at', 'row', 'width', 'height'];
const influenceKeys = ['id', 'from', 'from-phase', 'from-edge', 'from-at', 'to', 'to-phase', 'to-edge', 'to-at', 'description'];

interface Context {
  readonly document: LineDocument;
  readonly index: LineIndex;
  readonly problems: Problem[];
}

export function parse(document: LineDocument): Model {
  const text = document.text;
  const index = new LineIndex(text);
  let yaml;
  try {
    yaml = parseDocument(text, { prettyErrors: false, strict: true, uniqueKeys: true });
  } catch (error) {
    return unreadable(0, error instanceof Error ? error.message : String(error));
  }
  const failure = yaml.errors[0];
  if (failure) {
    return unreadable(index.lineOf(failure.pos[0]), failure.message);
  }
  const root = yaml.contents;
  if (!isMap(root)) return emptyModel;

  const context: Context = { document, index, problems: [] };
  const version = readVersion(root, context);
  const trends = readTrends(root, context);
  const triggers = readTriggers(root, context);
  const notes = readNotes(root, context);
  const influences = readInfluences(root, context, trends, triggers);
  const unit = readUnit(root, context);
  return { trends, triggers, notes, influences, problems: context.problems, version, unit, readable: true };
}

function unreadable(line: number, message: string): Model {
  return { ...emptyModel, readable: false, problems: [{ line: Math.max(0, line), message: `The document could not be read as YAML: ${message}` }] };
}

function readUnit(root: YAMLMap, context: Context): TimeUnit {
  const node = nodeOf(root, 'unit');
  if (node === undefined) return monthUnit;
  const unit = isScalar(node) ? timeUnitNamed(scalarText(node)) : undefined;
  if (unit) return unit;
  context.problems.push({ line: lineOf(node, context), message: `\`unit\` is not one of ${timeUnits.map((known) => known.name).join(', ')}; the diagram is drawn in months.` });
  return monthUnit;
}

function readVersion(root: YAMLMap, context: Context): number | undefined {
  const node = nodeOf(root, headerKey);
  const text = scalarText(node);
  if (text === undefined) {
    context.problems.push({ line: 0, message: `The document does not begin with \`${headerKey}: ${currentVersion}\`.` });
    return undefined;
  }
  const version = parseInteger(text);
  if (version === undefined) {
    context.problems.push({ line: lineOf(node, context), message: `The version \`${text}\` is not a number.` });
    return undefined;
  }
  if (version !== currentVersion) {
    context.problems.push({ line: lineOf(node, context), message: `This document states version ${version}; this module reads version ${currentVersion}.` });
  }
  return version;
}

function readTrends(root: YAMLMap, context: Context): Trend[] {
  const trends: Trend[] = [];
  for (const node of sequenceOf(root, 'trends')) {
    if (!isMap(node)) {
      context.problems.push({ line: lineOf(node, context), message: 'A trend entry is not a mapping and was passed over.' });
      continue;
    }
    reportUnknownKeys(node, trendKeys, context, 'trend');
    // The order of these reads is the order their problems are reported in.
    const start = month(node, 'start', context, true);
    const stop = month(node, 'stop', context, true);
    const row = integer(node, 'row', 0, context, false);
    const phases = integer(node, 'phases', phaseCount, context, true);
    const draggedEnds = boundaryKeys.map((key) => month(node, key, context, false));
    trends.push({
      id: scalar(node, 'id') ?? '', name: scalar(node, 'name') ?? '', start, stop, row, phases, draggedEnds,
      tags: tags(node, context), description: scalar(node, 'description') ?? '', range: rangeOf(node, context),
    });
  }
  return trends;
}

// A missing or malformed date is not reported here but by ghg.trigger-date, so one breach is reported once.
function readTriggers(root: YAMLMap, context: Context): Trigger[] {
  const triggers: Trigger[] = [];
  for (const node of sequenceOf(root, 'triggers')) {
    if (!isMap(node)) {
      context.problems.push({ line: lineOf(node, context), message: 'A trigger entry is not a mapping and was passed over.' });
      continue;
    }
    reportUnknownKeys(node, triggerKeys, context, 'trigger');
    triggers.push({
      id: scalar(node, 'id') ?? '', name: scalar(node, 'name') ?? '', date: parseMonth(scalar(node, 'date')), row: integer(node, 'row', 0, context, false),
      tags: tags(node, context), description: scalar(node, 'description') ?? '', range: rangeOf(node, context),
    });
  }
  return triggers;
}

// A missing or malformed at, width or height is reported by ghg.note-position.
function readNotes(root: YAMLMap, context: Context): Note[] {
  const notes: Note[] = [];
  for (const node of sequenceOf(root, 'notes')) {
    if (!isMap(node)) {
      context.problems.push({ line: lineOf(node, context), message: 'A note entry is not a mapping and was passed over.' });
      continue;
    }
    reportUnknownKeys(node, noteKeys, context, 'note');
    notes.push({
      id: scalar(node, 'id') ?? '', text: scalar(node, 'text') ?? '', at: parseMonth(scalar(node, 'at')), row: integer(node, 'row', 0, context, false),
      width: parseNumber(scalar(node, 'width')), height: parseNumber(scalar(node, 'height')), range: rangeOf(node, context),
    });
  }
  return notes;
}

// An influence from a trigger has no from end; any from-* key found on it is reported and ignored.
function readInfluences(root: YAMLMap, context: Context, trends: readonly Trend[], triggers: readonly Trigger[]): Influence[] {
  const trendIds = new Set(trends.map((trend) => trend.id));
  const triggerIds = new Set(triggers.map((trigger) => trigger.id).filter((id) => !trendIds.has(id)));
  const influences: Influence[] = [];
  for (const node of sequenceOf(root, 'influences')) {
    if (!isMap(node)) {
      context.problems.push({ line: lineOf(node, context), message: 'An influence entry is not a mapping and was passed over.' });
      continue;
    }
    reportUnknownKeys(node, influenceKeys, context, 'influence');
    const from = scalar(node, 'from') ?? '';
    const fromTrigger = triggerIds.has(from);
    if (fromTrigger) {
      for (const key of ['from-phase', 'from-edge', 'from-at']) {
        const stray = nodeOf(node, key);
        if (stray !== undefined) {
          context.problems.push({ line: lineOf(stray, context), message: `\`${key}\` is ignored on an influence from a trigger, which has no phases; the line is kept.` });
        }
      }
    }
    influences.push({
      id: scalar(node, 'id') ?? '', from, fromEnd: fromTrigger ? noEnd : end(node, 'from'), to: scalar(node, 'to') ?? '', toEnd: end(node, 'to'),
      description: scalar(node, 'description') ?? '', range: rangeOf(node, context),
    });
  }
  return influences;
}

// One end, verbatim. What does not read is reported by the rules as ghg.bad-attachment, not here.
function end(mapping: YAMLMap, prefix: string): End {
  return { phase: scalar(mapping, `${prefix}-phase`) ?? '', edge: scalar(mapping, `${prefix}-edge`) ?? '', at: parseNumber(scalar(mapping, `${prefix}-at`)) };
}

function tags(mapping: YAMLMap, context: Context): string[] {
  const node = nodeOf(mapping, 'tags');
  if (node === undefined) return [];
  if (isSeq(node)) {
    return node.items.map((item) => scalarText(item)).filter((tag): tag is string => tag !== undefined && tag.length > 0);
  }
  if (isScalar(node) && (scalarText(node) ?? '') === '') return [];
  context.problems.push({ line: lineOf(node, context), message: '`tags` is not a list of tags; the line is kept.' });
  return [];
}

function month(mapping: YAMLMap, key: string, context: Context, required: boolean): number | undefined {
  const node = nodeOf(mapping, key);
  const text = scalarText(node);
  if (text === undefined) {
    if (required) context.problems.push({ line: lineOf(mapping, context), message: `A trend has no \`${key}\` date; it cannot be drawn.` });
    return undefined;
  }
  const value = parseMonth(text);
  if (value === undefined) context.problems.push({ line: lineOf(node, context), message: `\`${key}: ${text}\` is not a date written as YYYY-MM.` });
  return value;
}

function integer(mapping: YAMLMap, key: string, fallback: number, context: Context, required: boolean): number {
  const node = nodeOf(mapping, key);
  const text = scalarText(node);
  if (text === undefined) {
    if (required) context.problems.push({ line: lineOf(mapping, context), message: `A trend has no \`${key}\`; ${fallback} was used.` });
    return fallback;
  }
  const value = parseInteger(text);
  if (value !== undefined) return value;
  context.problems.push({ line: lineOf(node, context), message: `\`${key}: ${text}\` is not a whole number; ${fallback} was used.` });
  return fallback;
}

function reportUnknownKeys(mapping: YAMLMap, known: readonly string[], context: Context, what: string): void {
  for (const pair of mapping.items) {
    const name = scalarText(pair.key);
    if (name !== undefined && !known.includes(name)) {
      context.problems.push({ line: lineOf(pair.key as Node, context), message: `\`${name}\` is not a key this module reads on a ${what}; the line is kept.` });
    }
  }
}

function nodeOf(mapping: YAMLMap, key: string): Node | undefined {
  const pair = mapping.items.find((item) => scalarText(item.key) === key);
  if (!pair) return undefined;
  return (pair.value ?? undefined) as Node | undefined;
}

function sequenceOf(root: YAMLMap, key: string): Node[] {
  const node = nodeOf(root, key);
  return isSeq(node) ? (node.items as Node[]) : [];
}

function scalar(mapping: YAMLMap, key: string): string | undefined {
  return scalarText(nodeOf(mapping, key));
}

function lineOf(node: Node | undefined, context: Context): number {
  const last = Math.max(0, context.document.lines.length - 1);
  return Math.min(Math.max(context.index.lineOf(node?.range?.[0] ?? 0), 0), last);
}

function rangeOf(node: Node, context: Context): LineRange {
  return rangeOfNode(node, context.index, context.document.lines);
}