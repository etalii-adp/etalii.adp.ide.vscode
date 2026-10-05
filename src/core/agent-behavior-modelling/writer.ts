import type { LineDocument } from '../text/lineDocument';
import { clamp } from '../text/rounding';
import {
  categoryOf, childrenOf, defaultRetryCount, isKnownKind, isWithin, keywordOf, kindIds, kindOf, rootsOf, shownKeyword, takesAnotherChild,
  type Model, type Node,
} from './model';
import { columnOf } from './parser';

// Splices the edits a behavior model supports into its Markdown: the lines a change touches, and
// none of the others. A node is one line, its notes the lines under it, its subtree a contiguous
// range; so a rename rewrites one line, notes replace their own range, a removal cuts the
// subtree's range and a move cuts it and inserts it elsewhere, re-indented by the difference.
//
// New lines follow the file, not a house style: a new child takes its first sibling's indentation
// and list marker, or the parent's text column when it has no sibling.
//
// Each function returns the sentence of a refusal, or undefined when the edit was spliced.

export type Refusal = string | undefined;

/** One item line: the prefix, then the keyword in bold with its colon, then the label. */
export function itemLine(prefix: string, keyword: string, label: string): string {
  return label.length > 0 ? `${prefix}**${keyword}:** ${label}` : `${prefix}**${keyword}:**`;
}

/** A label as one line: newlines become spaces, and the ends are trimmed. */
export function oneLine(label: string): string {
  return label.replaceAll('\r', '').split('\n').map((part) => part.trim()).filter((part) => part.length > 0).join(' ');
}

const count = (number: number, one: string, many: string): string => (number === 1 ? `1 ${one}` : `${number} ${many}`);

// The item line's indentation and marker, as written: everything before its text.
function prefixOf(document: LineDocument, node: Node): string {
  const text = document.lines[node.line].text;
  let index = 0;
  while (index < text.length && (text[index] === ' ' || text[index] === '\t')) index++;
  index++; // the marker
  while (index < text.length && (text[index] === ' ' || text[index] === '\t')) index++;
  return text.slice(0, Math.min(index, text.length));
}

// A sibling's prefix, normalised to one space after the marker.
const prefixFor = (document: LineDocument, sibling: Node): string => `${prefixOf(document, sibling).trimEnd()} `;

function outdent(text: string, columns: number): string {
  let column = 0;
  let index = 0;
  while (index < text.length && column < columns && (text[index] === ' ' || text[index] === '\t')) {
    column += text[index] === '\t' ? 4 - (column % 4) : 1;
    index++;
  }
  return text.slice(index);
}

/** Sets a node's label, keeping its keyword as the author wrote it. */
export function setLabel(document: LineDocument, node: Node, label: string): Refusal {
  const text = oneLine(label);
  const line = node.hasKeyword ? itemLine(prefixOf(document, node), node.keywordText, text) : prefixOf(document, node) + text;
  document.replace({ start: node.line, end: node.line }, [line.trimEnd()]);
  return undefined;
}

/** Changes a node's kind, refusing a kind that cannot hold the children it already has. */
export function setKind(document: LineDocument, node: Node, kind: string, retryCount: number): Refusal {
  if (!isKnownKind(kind)) return `A behavior model has no \`${kind}\` node.`;
  if (kind === kindIds.retry && retryCount < 1) return 'A Retry allows at least one attempt.';
  const category = kindOf(kind).category;
  if (category === 'leaf' && node.childIds.length > 0) {
    return `"${kindOf(kind).keyword}" holds no children, and this node has ${count(node.childIds.length, 'child', 'children')}.`;
  }
  if (category === 'decorator' && node.childIds.length > 1) {
    return `"${keywordOf(kind, retryCount)}" holds exactly one child, and this node has ${node.childIds.length}.`;
  }
  const line = itemLine(prefixOf(document, node), keywordOf(kind, kind === kindIds.retry ? retryCount : 0), node.label);
  document.replace({ start: node.line, end: node.line }, [line.trimEnd()]);
  return undefined;
}

/** Replaces a node's notes; empty notes remove them. */
export function setNotes(document: LineDocument, node: Node, notes: string): Refusal {
  const indent = ' '.repeat(node.contentIndent);
  const lines = notes.replaceAll('\r\n', '\n').replace(/^\n+|\n+$/g, '').split('\n').map((line) => (line.trim().length === 0 ? '' : indent + line.trimEnd()));
  const empty = lines.every((line) => line.length === 0);
  if (node.notesRange) {
    if (empty) document.remove(node.notesRange);
    else document.replace(node.notesRange, lines);
  } else if (!empty) {
    document.insert(node.line + 1, lines);
  }
  return undefined;
}

// The first root of a file that has none: under its Behavior heading, or in a new Behavior section at the end.
function addFirstRoot(document: LineDocument, model: Model, item: string): void {
  if (model.sectionLine !== undefined) {
    document.insert(model.sectionLine + 1, ['', item]);
    return;
  }
  const lines = document.lines;
  const opening = lines.length > 0 && lines[lines.length - 1].text.trim().length > 0 ? [''] : [];
  document.insert(lines.length, [...opening, '## Behavior', '', item]);
}

/**
 * Adds a node under a parent, or as a root when there is none, before the child now at `index`, or
 * after the last when the index is negative or past them. Answers the new node's id.
 */
export function add(document: LineDocument, model: Model, parent: Node | undefined, index: number, kind: string, label: string, retryCount = 0): { refusal: Refusal; id: string } {
  if (!isKnownKind(kind)) return { refusal: `A behavior model has no \`${kind}\` node.`, id: '' };
  const attempts = kind === kindIds.retry && retryCount < 1 ? defaultRetryCount : retryCount;
  const keyword = keywordOf(kind, attempts);
  const text = oneLine(label);

  if (!parent) {
    const roots = rootsOf(model);
    if (roots.length === 0) {
      addFirstRoot(document, model, itemLine('- ', keyword, text).trimEnd());
      return { refusal: undefined, id: '1' };
    }
    const at = clamp(index < 0 ? roots.length : index, 0, roots.length);
    const line = at < roots.length ? roots[at].line : roots[roots.length - 1].subtreeEnd + 1;
    document.insert(line, [itemLine(prefixFor(document, roots[0]), keyword, text).trimEnd()]);
    return { refusal: undefined, id: String(at + 1) };
  }

  if (!takesAnotherChild(parent)) {
    return {
      refusal: categoryOf(parent) === 'leaf'
        ? `"${shownKeyword(parent)}" holds no children. Add the node under a Do in order, Try in order or Do together.`
        : `"${shownKeyword(parent)}" holds exactly one child, and already has it.`,
      id: '',
    };
  }

  const children = childrenOf(model, parent);
  const position = clamp(index < 0 ? children.length : index, 0, children.length);
  const insertAt = position < children.length ? children[position].line : parent.subtreeEnd + 1;
  const prefix = children.length > 0 ? prefixFor(document, children[0]) : `${' '.repeat(parent.contentIndent)}${parent.marker} `;
  document.insert(insertAt, [itemLine(prefix, keyword, text).trimEnd()]);
  return { refusal: undefined, id: `${parent.id}.${position + 1}` };
}

/** Removes a node, its notes and everything beneath it. */
export function remove(document: LineDocument, node: Node): Refusal {
  document.remove({ start: node.line, end: node.subtreeEnd });
  return undefined;
}

/**
 * Moves a node and its subtree under a new parent, or to the roots when there is none, before the
 * child now at `index` there, or after the last.
 *
 * The index counts the target's children as they are BEFORE the move, the node itself included when
 * it is one of them: so "one earlier" is the node's index minus one, and "one later" its index plus two.
 */
export function move(document: LineDocument, model: Model, node: Node, newParent: Node | undefined, index: number): Refusal {
  if (newParent) {
    if (isWithin(newParent.id, node.id)) return 'A node cannot move beneath itself.';
    const category = categoryOf(newParent);
    const accepts = category === 'composite' || (category === 'decorator' && (newParent.childIds.length === 0 || node.parentId === newParent.id));
    if (!accepts) {
      return category === 'leaf' ? `"${shownKeyword(newParent)}" holds no children.` : `"${shownKeyword(newParent)}" holds exactly one child, and already has it.`;
    }
  }

  const roots = rootsOf(model);
  const siblings = newParent ? childrenOf(model, newParent) : roots;
  const at = clamp(index < 0 ? siblings.length : index, 0, siblings.length);
  const current = node.parentId === newParent?.id ? siblings.findIndex((sibling) => sibling.id === node.id) : -1;
  if (current >= 0 && (at === current || at === current + 1)) return 'That node is already there.';

  const target = at < siblings.length ? siblings[at].line : (newParent?.subtreeEnd ?? roots[roots.length - 1].subtreeEnd) + 1;

  // The indentation it lands at: a sibling's other than itself, or the parent's text column.
  const neighbour = siblings.find((sibling) => sibling.id !== node.id);
  const prefix = neighbour
    ? prefixFor(document, neighbour)
    : newParent
      ? `${' '.repeat(newParent.contentIndent)}${newParent.marker} `
      : `${' '.repeat(model.listIndent)}${node.marker} `;
  const delta = columnOf(prefix) - node.indent;

  const own = prefixOf(document, node);
  const moved: string[] = [];
  for (let line = node.line; line <= node.subtreeEnd; line++) {
    const text = document.lines[line].text;
    if (line === node.line) moved.push(prefix + text.slice(own.length));
    else if (text.trim().length === 0) moved.push('');
    else moved.push(delta >= 0 ? ' '.repeat(delta) + text : outdent(text, -delta));
  }

  const subtree = { start: node.line, end: node.subtreeEnd };
  if (target > node.subtreeEnd) {
    document.insert(target, moved);
    document.remove(subtree);
  } else {
    document.remove(subtree);
    document.insert(target, moved);
  }
  return undefined;
}
