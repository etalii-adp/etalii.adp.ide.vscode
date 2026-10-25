import { messages } from '../messages';
import type { Span } from '../span';
import { applySplices, type Edit, type FblSplice } from '../splice';
import { decode, encode } from '../text/utf8';
import { digestOf } from './digest';
import { EditHistory } from './editHistory';

/** FBL 7.2's sentence for an undo refused because the file changed underneath it. */
export const driftUndo = messages.driftUndo;

export const driftRedo = messages.driftRedo;

/** FBL 0.7 7.2's sentence for an edit refused because the file changed after it was read, before the edit was applied. */
export const driftEdit = messages.driftEdit;

/** What an undo or a redo did: the splices it applied, or why it was refused. */
export type UndoResult = { readonly done: readonly FblSplice[] } | { readonly refused: string };

/**
 * A file written only by splices, with the one history of its edits (FBL 7.1): a body, or a
 * registration. Applying an edit applies its splices and reads the file again. Undo and redo check
 * for drift first and refuse with FBL 7.2's sentence, writing nothing.
 */
export abstract class SplicedFile {
  private readonly history = new EditHistory();
  private current: Uint8Array;

  protected constructor(bytes: Uint8Array) {
    this.current = bytes;
  }

  /** The file's bytes after every applied edit. */
  get bytes(): Uint8Array {
    return this.current;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  /** Applies an edit planned against the current bytes, records it, and reads the file again. */
  apply(edit: Edit): void {
    if (edit.splices.length === 0) return;
    const before = this.current;
    const after = applySplices(before, edit.splices);
    this.history.record(before, after, edit);
    this.replace(after);
  }

  /**
   * Applies an edit that is no step of the history (FBL 0.7 7.1, a block declared `history: false`),
   * and reads the file again. The history is kept: every entry is carried over the edit, so an undo
   * or a redo after it passes it by and writes its own splices at the offsets the edit moved. An
   * entry whose splices the edit overlaps cannot be carried, and the history is cleared instead.
   */
  protected applyOutsideHistory(edit: Edit): void {
    if (edit.splices.length === 0) return;
    const after = applySplices(this.current, edit.splices);
    this.history.carryOver(after, edit.splices);
    this.replace(after);
  }

  /**
   * Whether `current`, the file as it is now on disk or in another editor's buffer, differs from the
   * bytes an edit is planned against (FBL 0.7 7.2). When it does, the file is read again from
   * `current` and its history cleared, as for any external change (FBL 7.3), and the caller refuses
   * the edit with `driftEdit`, writing nothing. A difference only in the spans the comparison leaves
   * out (`outsideHistory`) is no drift: it is taken as a write outside the history.
   */
  protected drifted(current: Uint8Array | undefined): boolean {
    if (current === undefined || sameBytes(current, this.current) || this.tookOutsideHistory(current)) return false;
    this.reload(current);
    return true;
  }

  /**
   * The spans of `bytes` that the comparison of FBL 7.2 leaves out: for a registration, the lines of
   * its declared blocks with `history: false` (FBL 0.7 7.1). A body has none.
   */
  protected outsideHistory(bytes: Uint8Array): readonly Span[] {
    void bytes;
    return [];
  }

  /**
   * When `current` differs from the file's bytes only in the spans the comparison of FBL 7.2 leaves
   * out (FBL 0.7 7.1), takes those differences as writes outside the history, the history carried
   * over them, and says so; otherwise changes nothing.
   */
  private tookOutsideHistory(current: Uint8Array): boolean {
    const splices = differenceOutside(this.current, this.outsideHistory(this.current), current, this.outsideHistory(current));
    if (!splices) return false;
    this.applyOutsideHistory({ splices });
    return true;
  }

  /**
   * Undoes the most recent edit. `current` is the file as it is now on disk or in another editor's
   * buffer; when it differs from what the history expects, the undo is refused and nothing is written.
   */
  undo(current?: Uint8Array): UndoResult {
    if (!this.history.canUndo) return { refused: messages.nothingToUndo };
    if (current !== undefined && !sameBytes(current, this.current) && this.tookOutsideHistory(current) && !this.history.canUndo) return { refused: driftUndo };
    const entry = this.history.peekUndo();
    if (digestOf(current ?? this.current) !== entry.afterDigest) return { refused: driftUndo };
    this.history.undone();
    this.replace(entry.snapshot ?? applySplices(this.current, entry.inverse));
    return { done: entry.inverse };
  }

  /** Redoes the most recently undone edit, refused on drift as an undo is. */
  redo(current?: Uint8Array): UndoResult {
    if (!this.history.canRedo) return { refused: messages.nothingToRedo };
    if (current !== undefined && !sameBytes(current, this.current) && this.tookOutsideHistory(current) && !this.history.canRedo) return { refused: driftRedo };
    const entry = this.history.peekRedo();
    if (digestOf(current ?? this.current) !== entry.beforeDigest) return { refused: driftRedo };
    this.history.redone();
    this.replace(applySplices(this.current, entry.edit.splices));
    return { done: entry.edit.splices };
  }

  /** Replaces the bytes after an external change the host has accepted (FBL 7.3): reads again and clears the history. */
  reload(bytes: Uint8Array): void {
    this.history.clear();
    this.replace(bytes);
  }

  /** Called whenever the bytes change, to read them again. */
  protected abstract reread(): void;

  private replace(bytes: Uint8Array): void {
    this.current = bytes;
    this.reread();
  }
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((byte, at) => byte === b[at]);

/**
 * The splices that make `before` into `after` when the two differ only in their spans left out
 * (`beforeOut`, `afterOut`, each in order and apart): every byte outside them the same and in the
 * same order. One splice for each place between two such bytes where the left-out text differs;
 * nothing when any other byte differs.
 */
function differenceOutside(before: Uint8Array, beforeOut: readonly Span[], after: Uint8Array, afterOut: readonly Span[]): FblSplice[] | undefined {
  if (beforeOut.length === 0 && afterOut.length === 0) return undefined;
  const beforeGaps = gapsOf(before, beforeOut);
  const afterGaps = gapsOf(after, afterOut);
  if (beforeGaps === undefined || afterGaps === undefined) return undefined;
  const kept = (bytes: Uint8Array, out: readonly Span[]): number[] => {
    const result: number[] = [];
    let at = 0;
    for (const range of [...out, { start: bytes.length, end: bytes.length }]) {
      for (; at < range.start; at++) result.push(bytes[at]);
      at = Math.max(at, range.end);
    }
    return result;
  };
  const keptBefore = kept(before, beforeOut);
  const keptAfter = kept(after, afterOut);
  if (keptBefore.length !== keptAfter.length || keptBefore.some((byte, at) => byte !== keptAfter[at])) return undefined;
  const splices: FblSplice[] = [];
  for (const index of [...new Set([...beforeGaps.keys(), ...afterGaps.keys()])].sort((a, b) => a - b)) {
    const was = beforeGaps.get(index) ?? { start: offsetOfKept(before, beforeOut, index), end: offsetOfKept(before, beforeOut, index), text: '' };
    const now = afterGaps.get(index)?.text ?? '';
    if (was.text !== now) splices.push({ operation: 'replace-value', start: was.start, end: was.end, text: now });
  }
  splices.sort((a, b) => a.start - b.start);
  return splices.length > 0 ? splices : undefined;
}

/**
 * The left-out text of `bytes`, by the number of other bytes before it, with its span; spans with no
 * byte between them are one. Nothing when such a text is not whole UTF-8.
 */
function gapsOf(bytes: Uint8Array, out: readonly Span[]): Map<number, { start: number; end: number; text: string }> | undefined {
  const gaps = new Map<number, { start: number; end: number; text: string }>();
  let keptBefore = 0;
  let position = 0;
  for (const range of out) {
    keptBefore += range.start - position;
    position = range.end;
    const previous = gaps.get(keptBefore);
    const start = previous?.start ?? range.start;
    const text = decode(bytes, start, range.end);
    if (!sameBytes(encode(text), bytes.subarray(start, range.end))) return undefined;
    gaps.set(keptBefore, { start, end: range.end, text });
  }
  return gaps;
}

/** The offset in `bytes` right after its `count`-th byte outside the spans left out. */
function offsetOfKept(bytes: Uint8Array, out: readonly Span[], count: number): number {
  let remaining = count;
  let position = 0;
  for (const range of out) {
    if (range.start - position >= remaining) return position + remaining;
    remaining -= range.start - position;
    position = range.end;
  }
  return position + remaining;
}
