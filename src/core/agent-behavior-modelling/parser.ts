import type { LineDocument } from '../text/lineDocument';
import { emptyModel, kindFromKeyword, kindIds, type Model, type Node, type Problem } from './model';

// Reads the behavior tree out of a Markdown file: the first bullet list under the first heading
// called Behavior. Never throws, and never reads anything else in the file.
//
// Everything outside the list is the author's: the title, the prose about the agent, other
// sections, code blocks. It is neither modelled nor touched, and survives every edit by never being
// spliced. Nesting is indentation, as Markdown means it; a tab counts as four columns. An item
// without a keyword is read as a Do rather than dropped, so a list written by hand still draws.

export const ruleNoKeyword = 'abm.no-keyword';

const headingPattern = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const itemPattern = /^([ \t]*)([-*+])([ \t]+)((?![-*_](\s*[-*_]){2,}\s*$)\S.*)$/;
const boldLead = /^\*\*([^*]+?)\*\*(.*)$/;

interface RawItem {
  readonly line: number;
  readonly text: string;
  readonly marker: string;
  readonly space: string;
  readonly body: string;
  readonly noteLines: number[];
}

/** The column a text's first non-blank character sits at, a tab counting four. */
export function columnOf(text: string): number {
  let column = 0;
  for (const character of text) {
    if (character === ' ') column++;
    else if (character === '\t') column += 4 - (column % 4);
    else break;
  }
  return column;
}

/** Removes up to `columns` columns of leading whitespace, and whitespace at the end. */
export function dedent(text: string, columns: number): string {
  let column = 0;
  let index = 0;
  while (index < text.length && column < columns && (text[index] === ' ' || text[index] === '\t')) {
    column += text[index] === '\t' ? 4 - (column % 4) : 1;
    index++;
  }
  return text.slice(index).trimEnd();
}

function columnWidth(whitespace: string, startColumn: number): number {
  let column = startColumn;
  for (const character of whitespace) column += character === '\t' ? 4 - (column % 4) : 1;
  return column - startColumn;
}

const isBehavior = (heading: string): boolean => ['behavior', 'behaviour'].includes(heading.trim().toLowerCase());

/** Whether a Markdown text has a Behavior heading, so opening it as a behavior model is offered. */
export function hasBehaviorHeading(text: string): boolean {
  const lines = text.split(/\r?\n/);
  const fenced = fencedLines(lines);
  return lines.some((line, index) => {
    const heading = fenced[index] ? null : headingPattern.exec(line);
    return heading !== null && isBehavior(heading[2]);
  });
}

// Which lines are inside a fenced code block, fences included: never read as headings or items.
function fencedLines(lines: readonly string[]): boolean[] {
  const fenced = new Array<boolean>(lines.length).fill(false);
  let open: string | undefined;
  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trimStart();
    if (open === undefined) {
      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        open = trimmed.slice(0, 3);
        fenced[index] = true;
      }
      continue;
    }
    fenced[index] = true;
    if (trimmed.startsWith(open)) open = undefined;
  }
  return fenced;
}

export function parse(document: LineDocument): Model {
  const lines = document.lines.map((line) => line.text);
  const fenced = fencedLines(lines);

  // The section: the first Behavior heading, up to the next heading of its level or above.
  let sectionLine: number | undefined;
  let level = 0;
  for (let index = 0; index < lines.length; index++) {
    const heading = fenced[index] ? null : headingPattern.exec(lines[index]);
    if (heading && isBehavior(heading[2])) {
      sectionLine = index;
      level = heading[1].length;
      break;
    }
  }
  if (sectionLine === undefined) return emptyModel;

  let sectionEnd = lines.length - 1;
  for (let index = sectionLine + 1; index < lines.length; index++) {
    const heading = fenced[index] ? null : headingPattern.exec(lines[index]);
    if (heading && heading[1].length <= level) {
      sectionEnd = index - 1;
      break;
    }
  }

  // The list: its first item sets the column the roots sit at.
  let listStart = -1;
  for (let index = sectionLine + 1; index <= sectionEnd; index++) {
    if (!fenced[index] && itemPattern.test(lines[index])) {
      listStart = index;
      break;
    }
  }
  if (listStart < 0) return { nodes: [], sectionLine, sectionEnd, listIndent: 0, problems: [] };

  const baseIndent = columnOf(lines[listStart]);
  const raws: RawItem[] = [];
  for (let index = listStart; index <= sectionEnd; index++) {
    const text = lines[index];
    // A blank line inside a list is a loose list, not its end.
    if (text.trim().length === 0) continue;
    const item = itemPattern.exec(text);
    if (item && columnOf(text) >= baseIndent) {
      raws.push({ line: index, text, marker: item[2], space: item[3], body: item[4], noteLines: [] });
      continue;
    }
    if (columnOf(text) > baseIndent && raws.length > 0) {
      raws[raws.length - 1].noteLines.push(index);
      continue;
    }
    // A line at the list's own column that is not an item ends the list.
    break;
  }

  return build(raws, lines, sectionLine, sectionEnd, baseIndent);
}

function build(raws: readonly RawItem[], lines: readonly string[], sectionLine: number, sectionEnd: number, baseIndent: number): Model {
  const problems: Problem[] = [];
  const parents = new Array<number>(raws.length).fill(-1);
  const childCounts = new Array<number>(raws.length).fill(0);
  const ids = new Array<string>(raws.length).fill('');
  const stack: number[] = [];
  let rootCount = 0;

  for (let index = 0; index < raws.length; index++) {
    const indent = columnOf(raws[index].text);
    while (stack.length > 0 && columnOf(raws[stack[stack.length - 1]].text) >= indent) stack.pop();
    if (stack.length === 0) {
      ids[index] = String(++rootCount);
    } else {
      const parent = stack[stack.length - 1];
      parents[index] = parent;
      ids[index] = `${ids[parent]}.${++childCounts[parent]}`;
    }
    stack.push(index);
  }

  // A node's last line: its notes, then whatever its last descendant reaches.
  const ends = raws.map((raw) => (raw.noteLines.length > 0 ? raw.noteLines[raw.noteLines.length - 1] : raw.line));
  for (let index = raws.length - 1; index >= 0; index--) {
    if (parents[index] >= 0) ends[parents[index]] = Math.max(ends[parents[index]], ends[index]);
  }

  const nodes: Node[] = raws.map((raw, index) => {
    const indent = columnOf(raw.text);
    const contentIndent = indent + 1 + columnWidth(raw.space, indent + 1);
    const read = readText(raw.body.trimEnd());
    if (!read.hasKeyword) {
      problems.push({
        rule: ruleNoKeyword,
        message: `"${shorten(read.label)}" has no keyword, so it is read as a Do. Start it with one, such as **Do:** or **Check:**.`,
        line: raw.line,
      });
    }
    const first = raw.noteLines[0];
    const last = raw.noteLines[raw.noteLines.length - 1];
    const notes = raw.noteLines.length === 0
      ? ''
      : Array.from({ length: last - first + 1 }, (_, offset) => dedent(lines[first + offset], contentIndent)).join('\n').replace(/^\n+|\n+$/g, '');
    return {
      id: ids[index], ...read, notes, line: raw.line,
      notesRange: raw.noteLines.length > 0 ? { start: first, end: last } : undefined,
      subtreeEnd: ends[index], indent, contentIndent, marker: raw.marker,
      parentId: parents[index] >= 0 ? ids[parents[index]] : undefined,
      childIds: raws.map((_, child) => child).filter((child) => parents[child] === index).map((child) => ids[child]),
    };
  });

  return { nodes, sectionLine, sectionEnd, listIndent: baseIndent, problems };
}

// The item's kind, label and keyword, or a Do labelled with the whole text when it carries no keyword.
function readText(text: string): Pick<Node, 'kind' | 'retryCount' | 'label' | 'keywordText' | 'hasKeyword'> {
  const lead = boldLead.exec(text);
  if (lead) {
    let keyword = lead[1].trim();
    let label = lead[2];
    if (keyword.endsWith(':')) keyword = keyword.slice(0, -1).trimEnd();
    else if (label.startsWith(':')) label = label.slice(1);
    const known = kindFromKeyword(keyword);
    if (known) return { kind: known.kind.id, retryCount: known.retryCount, label: label.trim(), keywordText: keyword, hasKeyword: true };
  }
  return { kind: kindIds.action, retryCount: 0, label: text.trim(), keywordText: '', hasKeyword: false };
}

const shorten = (text: string): string => (text.length <= 60 ? text : `${text.slice(0, 57)}...`);
