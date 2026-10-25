// Columns as the `bullets` family counts them (FBL 0.7 4.8): from 0, a tab four columns wherever it stands.

const TAB_WIDTH = 4;

const width = (character: string): number => (character === '\t' ? TAB_WIDTH : 1);

/** The columns of a run of spaces and tabs. */
export function columnsOf(whitespace: string): number {
  let columns = 0;
  for (const character of whitespace) columns += width(character);
  return columns;
}

/**
 * `line` with the whitespace before `column` taken off: a line indented less loses all of it, and a
 * tab the column cuts into is replaced by the spaces that remain of it.
 */
export function without(line: string, column: number): string {
  let at = 0;
  let index = 0;
  while (index < line.length && (line[index] === ' ' || line[index] === '\t') && at < column) {
    const step = width(line[index]);
    if (at + step > column) return ' '.repeat(at + step - column) + line.slice(index + 1);
    at += step;
    index++;
  }
  return line.slice(index);
}

/** `line` shifted by `shift` columns: right by writing spaces before it, left by `without`. */
export const shifted = (line: string, shift: number): string => (shift >= 0 ? ' '.repeat(shift) + line : without(line, -shift));

/** The lines of `text` with their endings, each ending kept with its line. */
export function linesOf(text: string): { line: string; ending: string }[] {
  const lines: { line: string; ending: string }[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '\r' && text[i] !== '\n') continue;
    const ending = text[i] === '\r' && text[i + 1] === '\n' ? '\r\n' : text[i];
    lines.push({ line: text.slice(start, i), ending });
    i += ending.length - 1;
    start = i + 1;
  }
  if (start < text.length) lines.push({ line: text.slice(start), ending: '' });
  return lines;
}

/** Text written as lines, each after a line ending: `value`'s lines, each indented with spaces to `column`, an empty line written empty. */
export function indented(value: string, column: number, newline: string): string {
  return value.split('\n').map((line) => newline + (line.length === 0 ? '' : ' '.repeat(column) + line)).join('');
}
