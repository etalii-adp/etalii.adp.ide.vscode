import type { RegistrationBlockDeclaration } from '../documents/types';
import { messages } from '../messages';
import type { ChangePosition, ModelChange } from '../planning/modelChange';
import { refuse } from '../rules/familyReader';
import type { FblSplice } from '../splice';
import type { BodyText } from '../text/bodyText';
import { decode, encode } from '../text/utf8';
import type { RegistrationBlock, RegistrationDocument, RegistrationEntry } from './registrationDocument';

/** A change to an entry of a declared block (FBL 0.7 8.4, 15.3). */
export type SettingChange = Extract<ModelChange, { kind: 'setting' }>;

/** A member of a list a declared block keeps: its key and its value, in their order. */
export interface BlockMember {
  readonly key: string;
  readonly value: string;
}

/**
 * Plans a setting written into a block of the registration that the binding declares (FBL 0.7 8.1,
 * 8.4): an entry `<key>: <value>`, indented by two spaces, with the registration's line ending; the
 * block created when it is missing, after the nearest block before it in the order `layout:`,
 * `identities:`, then the declared blocks; and the entries of a block keyed by ids that name no
 * element pruned in the same edit (FBL 8.5). Refuses by throwing `RefusedException`, which the
 * caller turns into a refusal.
 *
 * `members` is what the block stands for while it is absent, when the tool type's specification
 * gives a list for it (DESL 0.2 5.5): the first change then writes the whole list.
 */
export function planSetting(
  document: RegistrationDocument,
  declarations: readonly RegistrationBlockDeclaration[],
  declaration: RegistrationBlockDeclaration,
  setting: SettingChange,
  knownIds: ReadonlySet<string> | undefined,
  members?: readonly BlockMember[],
): FblSplice[] {
  const name = declaration.name;
  const block = document.block(name);
  if (!block && members) return whole(document, declarations, declaration, setting, members);
  const stale = !block || !declaration.keyedByIds || !knownIds ? [] : block.entries.filter((entry) => entry.key !== setting.key && !knownIds.has(entry.key));
  const splices: FblSplice[] = stale.map((entry) => ({ operation: 'remove-entry', start: entry.line.start, end: entry.line.end, text: '' }));
  const kept = block ? block.entries.filter((entry) => !stale.includes(entry)) : [];
  const existing = kept.find((entry) => entry.key === setting.key);
  if (setting.position && !declaration.kept) refuse(messages.blockNotMoved(name));

  if (setting.remove) {
    if (!existing) refuse(messages.noBlockEntry(name, setting.key));
    // The block's line goes with its last entry (FBL 0.7 8.4), before the entry's removal.
    if (kept.length === 1) splices.push({ operation: 'remove-container', start: block!.nameLine.start, end: block!.nameLine.end, text: '' });
    splices.push({ operation: 'remove-entry', start: existing!.line.start, end: existing!.line.end, text: '' });
    return ordered(splices);
  }
  if (setting.value !== undefined) checkValue(setting.value);
  const text = document.text;

  if (existing) {
    if (setting.rename !== undefined) {
      checkKey(setting.rename);
      if (setting.rename !== existing.key && kept.some((entry) => entry.key === setting.rename)) refuse(messages.blockEntryExists(name, setting.rename));
      if (setting.rename !== existing.key) splices.push({ operation: 'replace-value', start: existing.keySpan.start, end: existing.keySpan.end, text: setting.rename });
    }
    if (setting.position) {
      // A move is a remove-entry and an insert-entry of the entry's own bytes (FBL 0.7 8.4), its
      // place found among the other entries.
      const at = place(kept.filter((entry) => entry !== existing), setting.position, block!);
      let line = text.text(existing.line.start, existing.line.end);
      if (setting.value !== undefined && setting.value !== existing.value) {
        line = decode(text.bytes, existing.line.start, existing.valueSpan.start) + setting.value + decode(text.bytes, existing.valueSpan.end, existing.line.end);
      }
      splices.push({ operation: 'remove-entry', start: existing.line.start, end: existing.line.end, text: '' });
      splices.push({ operation: 'insert-entry', start: at, end: at, text: line });
    } else if (setting.value !== undefined && setting.value !== existing.value) {
      splices.push({ operation: 'replace-value', start: existing.valueSpan.start, end: existing.valueSpan.end, text: setting.value });
    }
    return ordered(splices);
  }

  checkKey(setting.key);
  if (setting.rename !== undefined) refuse(messages.noBlockEntryToRename(name, setting.key));
  if (setting.value === undefined) refuse(messages.newBlockEntryValue(name));
  const added = setting.value!;
  const indent = ' '.repeat(kept[0]?.indent ?? 2);
  if (!block) {
    const offset = createAt(document, declarations, name);
    const newline = text.newlineAt(Math.max(0, offset - 1), '\n');
    if (endless(text, offset)) {
      splices.push({ operation: 'ensure-container', start: offset, end: offset, text: `${newline}${name}:` });
      splices.push({ operation: 'insert-entry', start: offset, end: offset, text: `${newline}${indent}${setting.key}: ${added}` });
    } else {
      splices.push({ operation: 'ensure-container', start: offset, end: offset, text: `${name}:${newline}` });
      splices.push({ operation: 'insert-entry', start: offset, end: offset, text: `${indent}${setting.key}: ${added}${newline}` });
    }
    return splices;
  }
  const at = declaration.kept
    ? place(kept, setting.position, block)
    : kept.find((entry) => compareUtf8(entry.key, setting.key) > 0)?.line.start ?? kept[kept.length - 1]?.line.end ?? block.nameLine.end;
  const ending = text.newlineAt(Math.max(0, at - 1), '\n');
  splices.push({ operation: 'insert-entry', start: at, end: at, text: endless(text, at) ? `${ending}${indent}${setting.key}: ${added}` : `${indent}${setting.key}: ${added}${ending}` });
  return ordered(splices);
}

/**
 * The first change to a block that is absent while its list has members (DESL 0.2 5.5, absent or
 * complete): the whole list with the change applied, as one `ensure-container` and one
 * `insert-entry` per member, all at the place the block is created (FBL 0.7 8.4). A member the
 * change names is changed where it stands; a new one goes at its position, else last.
 */
function whole(
  document: RegistrationDocument,
  declarations: readonly RegistrationBlockDeclaration[],
  declaration: RegistrationBlockDeclaration,
  setting: SettingChange,
  members: readonly BlockMember[],
): FblSplice[] {
  const name = declaration.name;
  let list = [...members];
  let at = list.findIndex((member) => member.key === setting.key);
  if (setting.position && !declaration.kept) refuse(messages.blockNotMoved(name));
  if (setting.remove) {
    if (at < 0) refuse(messages.noBlockEntry(name, setting.key));
    list.splice(at, 1);
  } else {
    if (setting.value !== undefined) checkValue(setting.value);
    if (at < 0) {
      checkKey(setting.key);
      if (setting.rename !== undefined) refuse(messages.noBlockEntryToRename(name, setting.key));
      if (setting.value === undefined) refuse(messages.newBlockEntryValue(name));
      list.push({ key: setting.key, value: setting.value! });
      at = list.length - 1;
    }
    let key = list[at].key;
    if (setting.rename !== undefined && setting.rename !== key) {
      checkKey(setting.rename);
      if (list.some((member) => member.key === setting.rename)) refuse(messages.blockEntryExists(name, setting.rename));
      key = setting.rename;
    }
    const entry = { key, value: setting.value ?? list[at].value };
    list[at] = entry;
    if (setting.position) {
      list.splice(at, 1);
      list.splice(indexIn(list, setting.position), 0, entry);
    }
  }
  if (!declaration.kept) list = list.sort((a, b) => compareUtf8(a.key, b.key));
  if (list.length === 0) return [];
  const text = document.text;
  const offset = createAt(document, declarations, name);
  const newline = text.newlineAt(Math.max(0, offset - 1), '\n');
  const atEnd = endless(text, offset);
  const splices: FblSplice[] = [{ operation: 'ensure-container', start: offset, end: offset, text: atEnd ? `${newline}${name}:` : `${name}:${newline}` }];
  for (const member of list) {
    splices.push({ operation: 'insert-entry', start: offset, end: offset, text: atEnd ? `${newline}  ${member.key}: ${member.value}` : `  ${member.key}: ${member.value}${newline}` });
  }
  return splices;
}

/** The place in `list`, the moved member taken out, that `position` names. */
function indexIn(list: readonly BlockMember[], position: ChangePosition): number {
  if ('index' in position) return position.index >= 0 && position.index < list.length ? position.index : list.length;
  const key = 'after' in position ? position.after : position.before;
  const at = list.findIndex((member) => member.key === key);
  if (at < 0) refuse(messages.positionNoEntry(key));
  return 'after' in position ? at + 1 : at;
}

/** A value is one line of text, not empty, and holds no `": "`, since an entry's key is everything before the last one (FBL 0.7 8.1). */
function checkValue(value: string): void {
  if (value.length === 0) refuse(messages.settingValueEmpty);
  if (value.includes(': ')) refuse(messages.settingValueColon);
  if (value.includes('\n') || value.includes('\r')) refuse(messages.settingValueLine);
}

function checkKey(key: string): void {
  if (key.length === 0) refuse(messages.settingKeyEmpty);
  if (key.includes('\n') || key.includes('\r')) refuse(messages.settingKeyLine);
}

/** Where an entry goes in a `kept` block among `others` (FBL 0.7 8.4): at its position, else after the last entry. */
function place(others: readonly RegistrationEntry[], position: ChangePosition | undefined, block: RegistrationBlock): number {
  const last = others[others.length - 1]?.line.end ?? block.nameLine.end;
  if (!position) return last;
  if ('index' in position) return position.index >= 0 && position.index < others.length ? others[position.index].line.start : last;
  if ('after' in position) return entryOf(others, position.after).line.end;
  return entryOf(others, position.before).line.start;
}

function entryOf(entries: readonly RegistrationEntry[], key: string): RegistrationEntry {
  const entry = entries.find((candidate) => candidate.key === key);
  if (!entry) refuse(messages.positionNoEntry(key));
  return entry!;
}

/**
 * Where a missing block is created (FBL 0.7 8.4): after the nearest block before it in the order of
 * blocks that exists, else after the headers.
 */
function createAt(document: RegistrationDocument, declarations: readonly RegistrationBlockDeclaration[], name: string): number {
  const order = ['layout', 'identities', ...declarations.map((declaration) => declaration.name)];
  for (let i = order.indexOf(name) - 1; i >= 0; i--) {
    const before = document.block(order[i]);
    if (before) return before.span.end;
  }
  return document.afterHeaders;
}

/** Whether `offset` is the end of a registration whose last line has no line ending. */
const endless = (text: BodyText, offset: number): boolean => offset === text.length && offset > 0 && text.lines[text.lines.length - 1].ending.length === 0;

/** The splices in body order; at one offset an insertion before a removal that starts there (FBL 8.5). */
const ordered = (splices: FblSplice[]): FblSplice[] =>
  splices
    .map((splice, index) => ({ splice, index }))
    .sort((a, b) => a.splice.start - b.splice.start || a.splice.end - b.splice.end || a.index - b.index)
    .map(({ splice }) => splice);

/** Ordinal order of keys: byte order of their UTF-8 encoding (FBL 8.3). */
export function compareUtf8(a: string, b: string): number {
  const left = encode(a);
  const right = encode(b);
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return left.length - right.length;
}
