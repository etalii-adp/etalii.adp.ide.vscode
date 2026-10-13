// The planner of the persistence plugin `net.etalii.adp.etalii.abmMarkdown` (etalii.adp spec 027,
// research R8 and R12): the edits a behavior model supports, planned as the lines each touches and
// none of the others. A node is one line, its notes the lines under it, its subtree a contiguous
// range; so a rename rewrites one line, notes replace their own range, a removal cuts the
// subtree's range and a move cuts it and inserts it elsewhere, re-indented by the difference.
//
// New lines follow the file, not a house style: a new child takes its first sibling's indentation
// and list marker, or the parent's text column when it has no sibling.

import type { ChangePosition, ModelChange, PluginPlanRequest, PluginPlanResult } from '../../fbl';
import type { LineBody } from './lineBody';
import {
  categoryOf, childrenOf, defaultRetryCount, isWithin, keywordOf, kindIds, kindOfType, nodeOf, rootsOf, shownKeyword, takesAnotherChild,
  type Kind, type Model, type Node,
} from './model';
import { columnOf, outdent } from './parser';
import { bodyOf, readTree } from './reader';

/** A change that cannot be made, with the sentence the host shows (FBL 6.4). */
class Refusal extends Error {}

const refuse = (sentence: string): never => {
  throw new Refusal(sentence);
};

const GONE = 'That node is no longer in this behavior model.';
const ADDED_UNDER_GONE = 'The node it was added under is no longer in this behavior model.';
const MOVED_UNDER_GONE = 'The node it was moved under is no longer in this behavior model.';
const NOT_BESIDE = 'The node to place it beside is not under that node.';
const ALREADY_THERE = 'That node is already there.';
const ONE_ATTEMPT = 'A Retry allows at least one attempt.';
const IMPLICIT = 'Whether a node has a keyword follows from how its line is written. Change its kind to give it one.';
const NOT_HELD = 'The Markdown of a behavior model cannot hold that change.';

type Add = Extract<ModelChange, { kind: 'add' }>;
type Move = Extract<ModelChange, { kind: 'move' }>;
type Retype = Extract<ModelChange, { kind: 'retype' }>;
type SetAttributes = Extract<ModelChange, { kind: 'set' }>;

/** A body being planned: its lines as edits change them, their text as it was read, and the tree read from them. */
interface Planning {
  readonly body: LineBody;
  readonly lines: readonly string[];
  readonly model: Model;
}

/** One item line: the prefix, then the keyword in bold with its colon, then the label. */
export function itemLine(prefix: string, keyword: string, label: string): string {
  return label.length > 0 ? `${prefix}**${keyword}:** ${label}` : `${prefix}**${keyword}:**`;
}

/** A label as one line: newlines become spaces, and the ends are trimmed. */
export function oneLine(label: string): string {
  return label.replaceAll('\r', '').split('\n').map((part) => part.trim()).filter((part) => part.length > 0).join(' ');
}

const count = (number: number, one: string, many: string): string => (number === 1 ? `1 ${one}` : `${number} ${many}`);

/** A value of a change as text; null and nothing are the empty text. */
const textOf = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

/** A value of a change as a number, an integer of the model being a bigint; not a number when it is neither. */
function numberOf(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return typeof value === 'string' && /^\s*[+-]?\d+\s*$/.test(value) ? Number(value) : Number.NaN;
}

const isCount = (attempts: number): boolean => Number.isInteger(attempts) && attempts >= 1;

/** The kind a type of the metamodel is written as, refused in the words of an unknown kind. */
const kindFor = (type: string): Kind => kindOfType(type) ?? refuse(`A behavior model has no \`${type}\` node.`);

// The item line's indentation and marker, as written: everything before its text.
function prefixOf(lines: readonly string[], node: Node): string {
  const text = lines[node.line];
  let index = 0;
  while (index < text.length && (text[index] === ' ' || text[index] === '\t')) index++;
  index++; // the marker
  while (index < text.length && (text[index] === ' ' || text[index] === '\t')) index++;
  return text.slice(0, Math.min(index, text.length));
}

// A sibling's prefix, normalised to one space after the marker.
const prefixFor = (lines: readonly string[], sibling: Node): string => `${prefixOf(lines, sibling).trimEnd()} `;

/** Notes as the lines written under an item whose text starts at a column; none when the notes are empty. */
function noteLines(notes: string, column: number): string[] {
  const indent = ' '.repeat(column);
  const lines = notes.replaceAll('\r\n', '\n').replace(/^\n+|\n+$/g, '').split('\n').map((line) => (line.trim().length === 0 ? '' : indent + line.trimEnd()));
  return lines.every((line) => line.length === 0) ? [] : lines;
}

/** Where a new node goes among the nodes it joins: before the one now at the answer, or after the last. */
function placeAmong(siblings: readonly Node[], position: ChangePosition | undefined): number {
  if (position === undefined) return siblings.length;
  if ('index' in position) return position.index >= 0 && position.index < siblings.length ? Math.trunc(position.index) : siblings.length;
  const id = 'after' in position ? position.after : position.before;
  const beside = siblings.findIndex((sibling) => sibling.id === id);
  if (beside < 0) return refuse(NOT_BESIDE);
  return 'after' in position ? beside + 1 : beside;
}

/**
 * Where a moved node goes among the nodes it joins, counted as they are before the move, the node
 * itself included when it is one of them. An index of the change counts them once the node is
 * taken out (FBL 11.2), so it names the sibling the node lands before.
 */
function placeOfMoved(siblings: readonly Node[], node: Node, position: ChangePosition | undefined): number {
  if (position === undefined) return siblings.length;
  if ('index' in position) {
    const before = position.index >= 0 ? siblings.filter((sibling) => sibling.id !== node.id)[Math.trunc(position.index)] : undefined;
    return before ? siblings.indexOf(before) : siblings.length;
  }
  const id = 'after' in position ? position.after : position.before;
  if (id === node.id) return refuse(ALREADY_THERE);
  const beside = siblings.findIndex((sibling) => sibling.id === id);
  if (beside < 0) return refuse(NOT_BESIDE);
  return 'after' in position ? beside + 1 : beside;
}

/**
 * Adds a node under a parent, or as a root when there is none. The first root of a file that has
 * none goes under its Behavior heading, or in a new Behavior section at the end.
 */
function add({ body, lines, model }: Planning, change: Add): void {
  const kind = kindFor(change.type);
  const given = numberOf(change.attributes.attempts);
  const keyword = keywordOf(kind.id, kind.id === kindIds.retry && !isCount(given) ? defaultRetryCount : given);
  const label = oneLine(textOf(change.attributes.label));
  // The item, and the notes it is given at the column its text starts at.
  const written = (prefix: string): string[] => [itemLine(prefix, keyword, label).trimEnd(), ...noteLines(textOf(change.attributes.notes), columnOf(prefix) + 2)];

  if (change.parent === undefined) {
    const roots = rootsOf(model);
    if (roots.length === 0) {
      if (model.sectionLine !== undefined) return body.insert(model.sectionLine + 1, ['', ...written('- ')], 'insert-entry');
      const opening = lines.length > 0 && lines[lines.length - 1].trim().length > 0 ? [''] : [];
      return body.insert(lines.length, [...opening, '## Behavior', '', ...written('- ')], 'insert-entry');
    }
    const at = placeAmong(roots, change.position);
    return body.insert(at < roots.length ? roots[at].line : roots[roots.length - 1].subtreeEnd + 1, written(prefixFor(lines, roots[0])), 'insert-entry');
  }

  const parent = nodeOf(model, change.parent) ?? refuse(ADDED_UNDER_GONE);
  if (!takesAnotherChild(parent)) {
    refuse(categoryOf(parent) === 'leaf'
      ? `"${shownKeyword(parent)}" holds no children. Add the node under a Do in order, Try in order or Do together.`
      : `"${shownKeyword(parent)}" holds exactly one child, and already has it.`);
  }
  const children = childrenOf(model, parent);
  const at = placeAmong(children, change.position);
  const prefix = children.length > 0 ? prefixFor(lines, children[0]) : `${' '.repeat(parent.contentIndent)}${parent.marker} `;
  body.insert(at < children.length ? children[at].line : parent.subtreeEnd + 1, written(prefix), 'insert-entry');
}

/** Sets a node's label, keeping its keyword as the author wrote it, its notes, and a Retry's attempts. */
function set({ body, lines, model }: Planning, change: SetAttributes): void {
  const node = nodeOf(model, change.id) ?? refuse(GONE);
  const attributes = change.attributes;
  for (const name of Object.keys(attributes)) {
    if (name === 'implicit') refuse(IMPLICIT);
    if (!['label', 'notes', 'attempts'].includes(name)) refuse(`A node of a behavior model has no \`${name}\` to change.`);
  }
  const prefix = prefixOf(lines, node);
  const label = 'label' in attributes ? oneLine(textOf(attributes.label)) : node.label;
  let item: string | undefined;
  if ('attempts' in attributes) {
    if (node.kind !== kindIds.retry) refuse(`"${shownKeyword(node)}" has no number of attempts. Only a Retry has one.`);
    const attempts = numberOf(attributes.attempts);
    if (!isCount(attempts)) refuse(ONE_ATTEMPT);
    item = itemLine(prefix, keywordOf(kindIds.retry, attempts), label);
  } else if ('label' in attributes) {
    item = node.hasKeyword ? itemLine(prefix, node.keywordText, label) : prefix + label;
  }

  // The notes first: they are the lines after the item, so the item's line stays where it is.
  if ('notes' in attributes) {
    const notes = noteLines(textOf(attributes.notes), node.contentIndent);
    if (node.notesRange) {
      if (notes.length === 0) body.remove(node.notesRange, 'remove-key');
      else body.replace(node.notesRange, notes, 'replace-value');
    } else {
      body.insert(node.line + 1, notes, 'insert-key');
    }
  }
  if (item !== undefined) body.replace({ start: node.line, end: node.line }, [item.trimEnd()], 're-emit-line');
}

/** Changes a node's kind by rewriting its keyword, refusing a kind that cannot hold the children it already has. */
function retype({ body, lines, model }: Planning, change: Retype): void {
  const node = nodeOf(model, change.id) ?? refuse(GONE);
  const kind = kindFor(change.type);
  const given = change.attributes.attempts;
  // A node made a Retry keeps the attempts it has when it has three or more, and gets three otherwise.
  const attempts = kind.id !== kindIds.retry ? 0 : given === undefined || given === null ? Math.max(node.retryCount, defaultRetryCount) : numberOf(given);
  if (kind.id === kindIds.retry && !isCount(attempts)) refuse(ONE_ATTEMPT);
  if (kind.category === 'leaf' && node.childIds.length > 0) {
    refuse(`"${kind.keyword}" holds no children, and this node has ${count(node.childIds.length, 'child', 'children')}.`);
  }
  if (kind.category === 'decorator' && node.childIds.length > 1) {
    refuse(`"${keywordOf(kind.id, attempts)}" holds exactly one child, and this node has ${node.childIds.length}.`);
  }
  const item = itemLine(prefixOf(lines, node), keywordOf(kind.id, attempts), node.label);
  body.replace({ start: node.line, end: node.line }, [item.trimEnd()], 're-emit-line');
}

/** Removes a node, its notes and everything beneath it. */
function remove({ body, model }: Planning, id: string): void {
  const node = nodeOf(model, id) ?? refuse(GONE);
  body.remove({ start: node.line, end: node.subtreeEnd }, 'remove-entry');
}

/** Moves a node and its subtree under a new parent, or to the roots when there is none. */
function move({ body, lines, model }: Planning, change: Move): void {
  const node = nodeOf(model, change.id) ?? refuse(GONE);
  const newParent = change.parent === undefined ? undefined : nodeOf(model, change.parent) ?? refuse(MOVED_UNDER_GONE);
  if (newParent) {
    if (isWithin(newParent.id, node.id)) refuse('A node cannot move beneath itself.');
    const category = categoryOf(newParent);
    const accepts = category === 'composite' || (category === 'decorator' && (newParent.childIds.length === 0 || node.parentId === newParent.id));
    if (!accepts) {
      refuse(category === 'leaf' ? `"${shownKeyword(newParent)}" holds no children.` : `"${shownKeyword(newParent)}" holds exactly one child, and already has it.`);
    }
  }

  const roots = rootsOf(model);
  const siblings = newParent ? childrenOf(model, newParent) : roots;
  const at = placeOfMoved(siblings, node, change.position);
  const current = siblings.findIndex((sibling) => sibling.id === node.id);
  if (current >= 0 && (at === current || at === current + 1)) refuse(ALREADY_THERE);

  const target = at < siblings.length ? siblings[at].line : (newParent?.subtreeEnd ?? roots[roots.length - 1].subtreeEnd) + 1;

  // The indentation it lands at: a sibling's other than itself, or the parent's text column.
  const neighbour = siblings.find((sibling) => sibling.id !== node.id);
  const prefix = neighbour
    ? prefixFor(lines, neighbour)
    : newParent
      ? `${' '.repeat(newParent.contentIndent)}${newParent.marker} `
      : `${' '.repeat(model.listIndent)}${node.marker} `;
  const delta = columnOf(prefix) - node.indent;

  const own = prefixOf(lines, node);
  const moved: string[] = [];
  for (let line = node.line; line <= node.subtreeEnd; line++) {
    const text = lines[line];
    if (line === node.line) moved.push(prefix + text.slice(own.length));
    else if (text.trim().length === 0) moved.push('');
    else moved.push(delta >= 0 ? ' '.repeat(delta) + text : outdent(text, -delta));
  }

  // The later of the two places first, so the earlier one is still at the line it was read at.
  const subtree = { start: node.line, end: node.subtreeEnd };
  if (target > node.subtreeEnd) {
    body.insert(target, moved, 'insert-entry');
    body.remove(subtree, 'remove-entry');
  } else {
    body.remove(subtree, 'remove-entry');
    body.insert(target, moved, 'insert-entry');
  }
}

/** FBL 11.2 `plan`: the splices that realise one model change, or the sentence that refuses it. */
export function plan(request: PluginPlanRequest): PluginPlanResult {
  // The bytes are read again: the plan is of the body as it is given, not of the last reading.
  const { body, model } = readTree(bodyOf(request.files));
  const planning: Planning = { body, lines: body.lines, model };
  const change = request.change;
  try {
    switch (change.kind) {
      case 'save': return { planned: [] };
      case 'add': add(planning, change); break;
      case 'set': set(planning, change); break;
      case 'retype': retype(planning, change); break;
      case 'remove': remove(planning, change.id); break;
      case 'move': move(planning, change); break;
      // The tree is all the Markdown holds: a place on the canvas and an identity are the registration's.
      default: return { refused: NOT_HELD };
    }
  } catch (error) {
    if (error instanceof Refusal) return { refused: error.message };
    throw error;
  }
  return { planned: body.splices().map((splice) => ({ file: '', splice })) };
}
