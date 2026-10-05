// The `.adp` registration beside a document (FBL, section 8): its first line names the tool type's
// origin, `body:` names the file that holds the model when it is not the file of the same name, and
// a `layout:` block keeps the positions a user placed, one `<id>: <x> <y>` a line.
//
// The block is ADP's own and may be rewritten whole; everything above and below it is kept byte for
// byte, each line with its own ending.

export interface Position {
  readonly x: number;
  readonly y: number;
}

interface RawLine {
  readonly content: string;
  readonly terminator: string;
}

const blockHeader = 'layout:';

function rawLines(text: string): RawLine[] {
  const lines: RawLine[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '\n') continue;
    const carriage = index > start && text[index - 1] === '\r';
    lines.push({ content: text.slice(start, index - (carriage ? 1 : 0)), terminator: carriage ? '\r\n' : '\n' });
    start = index + 1;
  }
  if (start < text.length) lines.push({ content: text.slice(start), terminator: '' });
  return lines;
}

function parseEntry(content: string): { id: string; position: Position } | undefined {
  // An entry is indented; the block header itself and any following section are not.
  if (content.length === 0 || !/\s/.test(content[0])) return undefined;
  const trimmed = content.trim();
  const colon = trimmed.lastIndexOf(': ');
  if (colon <= 0) return undefined;
  const parts = trimmed.slice(colon + 2).split(' ').filter((part) => part.length > 0);
  if (parts.length !== 2) return undefined;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || parts.some((part) => !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(part))) return undefined;
  return { id: trimmed.slice(0, colon), position: { x, y } };
}

/** The origin a registration names on its first line, or nothing for an empty file. */
export function originOf(registration: string): string | undefined {
  const first = rawLines(registration)[0]?.content.trim();
  return first && first.length > 0 ? first : undefined;
}

/** The body a registration names, relative to itself; nothing when it names none. */
export function bodyOf(registration: string): string | undefined {
  for (const line of rawLines(registration).slice(1)) {
    const match = /^body:\s*(.+?)\s*$/.exec(line.content);
    if (match) return match[1];
    if (line.content.trimEnd() === blockHeader) break;
  }
  return undefined;
}

/**
 * The stored positions; empty when there is no registration or no block. A malformed entry is
 * passed over: the block is metadata, and a hand-mangled line must never stop a diagram opening.
 */
export function readLayout(registration: string | undefined): Map<string, Position> {
  const positions = new Map<string, Position>();
  if (registration === undefined) return positions;
  let inBlock = false;
  for (const line of rawLines(registration)) {
    if (!inBlock) {
      inBlock = line.content.trimEnd() === blockHeader;
      continue;
    }
    const entry = parseEntry(line.content);
    if (entry) {
      positions.set(entry.id, entry.position);
      continue;
    }
    if (line.content.trim().length === 0) continue;
    break;
  }
  return positions;
}

const format = (value: number): string => String(Math.round(value * 1000) / 1000);

/**
 * The registration with its layout block replaced; an empty set removes the block. The block lands
 * where it was, or, when there was none, directly after the origin line and the headers under it.
 */
export function writeLayout(registration: string, positions: ReadonlyMap<string, Position>): string {
  const lines = rawLines(registration);
  const lfCount = lines.filter((line) => line.terminator === '\n').length;
  const crlfCount = lines.filter((line) => line.terminator === '\r\n').length;
  const newline = crlfCount > lfCount ? '\r\n' : '\n';

  let blockStart: number | undefined;
  let blockEnd = 0;
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].content.trimEnd() !== blockHeader) continue;
    blockStart = index;
    blockEnd = index + 1;
    while (blockEnd < lines.length && (parseEntry(lines[blockEnd].content) !== undefined || lines[blockEnd].content.trim().length === 0)) blockEnd++;
    break;
  }

  const isHeader = (content: string): boolean => {
    const trimmed = content.trim();
    if (trimmed.length === 0) return true;
    const colon = trimmed.indexOf(':');
    return colon > 0 && !trimmed.startsWith(blockHeader) && /^[\p{L}\p{N}_-]+$/u.test(trimmed.slice(0, colon));
  };
  let insertAt = blockStart;
  if (insertAt === undefined) {
    insertAt = Math.min(1, lines.length);
    while (insertAt < lines.length && isHeader(lines[insertAt].content)) insertAt++;
  }

  const block = positions.size === 0
    ? ''
    : blockHeader + newline + [...positions].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([id, position]) => `  ${id}: ${format(position.x)} ${format(position.y)}${newline}`).join('');

  let rebuilt = '';
  for (let index = 0; index < lines.length; index++) {
    if (index === insertAt) {
      // A block that follows a last line without an ending gives that line one first.
      if (block.length > 0 && rebuilt.length > 0 && !rebuilt.endsWith('\n')) rebuilt += newline;
      rebuilt += block;
    }
    if (blockStart !== undefined && index >= blockStart && index < blockEnd) continue;
    rebuilt += lines[index].content + lines[index].terminator;
  }
  if (insertAt >= lines.length) {
    if (block.length > 0 && rebuilt.length > 0 && !rebuilt.endsWith('\n')) rebuilt += newline;
    rebuilt += block;
  }
  return rebuilt;
}

/** A new registration for a document of a tool type: its origin line, and nothing else yet. */
export function newRegistration(origin: string): string {
  return `${origin}\n`;
}
