import type { LineDocument, LineRange } from './lineDocument';

// Finding and replacing lines inside a LineDocument: the mechanics a line-splicing writer needs,
// for the one YAML shape ADP's own formats use, a sequence of `- key: value` items under a section
// key. It is not a general YAML editor.

export const defaultItemIndent = '  ';
export const defaultKeyIndent = '    ';

const leading = (text: string): string => text.slice(0, text.length - text.trimStart().length);

/** The index of the line carrying a section key, or -1. */
export function findSection(document: LineDocument, sectionKey: string): number {
  return document.lines.findIndex((line) => line.text.trimStart().startsWith(sectionKey));
}

/** The index of the line carrying a key within a range, or -1. A key on the `- id:` line is found too. */
export function findKey(document: LineDocument, range: LineRange, key: string): number {
  for (let i = range.start; i <= range.end && i < document.lines.length; i++) {
    let trimmed = document.lines[i].text.trimStart();
    if (trimmed.startsWith('- ')) trimmed = trimmed.slice(2);
    if (trimmed.startsWith(`${key}:`)) return i;
  }
  return -1;
}

/** Replaces one key's value inside a range, keeping the line's indentation, or adds the key. */
export function setKey(document: LineDocument, range: LineRange, key: string, value: string): void {
  const index = findKey(document, range, key);
  if (index >= 0) {
    const existing = document.lines[index].text;
    const prefix = existing.trimStart().startsWith('- ') ? '- ' : '';
    document.replace({ start: index, end: index }, [`${leading(existing)}${prefix}${key}: ${value}`]);
    return;
  }
  document.insert(range.start + 1, [`${keyIndentWithin(document, range)}${key}: ${value}`]);
}

/** Removes one key's line from within a range, if it is there. */
export function removeKey(document: LineDocument, range: LineRange, key: string): void {
  const index = findKey(document, range, key);
  if (index >= 0) document.remove({ start: index, end: index });
}

/** The indentation the keys inside a range already use. */
export function keyIndentWithin(document: LineDocument, range: LineRange): string {
  for (let i = range.start + 1; i <= range.end && i < document.lines.length; i++) {
    const text = document.lines[i].text;
    if (text.trim().length > 0) return leading(text);
  }
  return leading(document.lines[range.start].text) + defaultItemIndent;
}

/** The item indentation, the gap after the dash and the key indentation an existing entry uses. */
export function indentOf(document: LineDocument, ranges: readonly LineRange[]): { itemIndent: string; dashGap: string; keyIndent: string } {
  const range = ranges[0];
  if (!range) return { itemIndent: defaultItemIndent, dashGap: ' ', keyIndent: defaultKeyIndent };
  const dash = document.lines[range.start].text;
  const afterDash = dash.trimStart();
  let dashGap = ' ';
  if (afterDash.startsWith('-')) {
    const gap = leading(afterDash.slice(1));
    if (gap.length > 0) dashGap = gap;
  }
  return { itemIndent: leading(dash), dashGap, keyIndent: keyIndentWithin(document, range) };
}

/**
 * Where a new entry goes: after the last existing one, or directly after the section key when
 * there are none; -1 when the section key is absent. A section written `key: []` is opened first.
 */
export function insertionPointFor(document: LineDocument, ranges: readonly LineRange[], sectionKey: string): number {
  const last = ranges[ranges.length - 1];
  if (last) return last.end + 1;
  for (let i = 0; i < document.lines.length; i++) {
    const text = document.lines[i].text;
    if (!text.trimStart().startsWith(sectionKey)) continue;
    const value = text.trimStart().slice(sectionKey.length).trim();
    if (value === '[]' || value === '[ ]') {
      document.replace({ start: i, end: i }, [`${leading(text)}${sectionKey}`]);
    }
    return i + 1;
  }
  return -1;
}

/** Quotes a value only where YAML needs it, so an ordinary label stays unquoted. */
export function quote(value: string): string {
  if (value.length === 0) return '""';
  const needsQuoting = value.includes(':') || value.includes('#') || value.startsWith('-') || value.startsWith(' ')
    || value.endsWith(' ') || value.startsWith('"') || value.startsWith("'");
  return needsQuoting ? `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"` : value;
}