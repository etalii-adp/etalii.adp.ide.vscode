import { applySplices, inverseSplices, type Edit, type FblSplice } from '../splice';
import { byteLength } from '../text/utf8';
import { digestOf } from './digest';

/** One recorded edit: its splices, those that undo it, the digests of the body before and after, and the body before for a snapshot. */
export interface HistoryEntry {
  readonly edit: Edit;
  readonly inverse: readonly FblSplice[];
  readonly beforeDigest: string;
  readonly afterDigest: string;
  readonly snapshot?: Uint8Array;
}

/**
 * The history of one body (FBL 7.1): each edit with the splices that undo it and the digests of
 * the body before and after it. A snapshot edit keeps the whole body before it as well; its undo
 * gives the same bytes as the inverse splices.
 */
export class EditHistory {
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  record(before: Uint8Array, after: Uint8Array, edit: Edit): void {
    this.undoStack.push({
      edit,
      inverse: inverseSplices(before, edit.splices),
      beforeDigest: digestOf(before),
      afterDigest: digestOf(after),
      snapshot: edit.snapshot ? before : undefined,
    });
    this.redoStack.length = 0;
  }

  peekUndo(): HistoryEntry {
    return this.undoStack[this.undoStack.length - 1];
  }

  peekRedo(): HistoryEntry {
    return this.redoStack[this.redoStack.length - 1];
  }

  undone(): void {
    this.redoStack.push(this.undoStack.pop()!);
  }

  redone(): void {
    this.undoStack.push(this.redoStack.pop()!);
  }

  /**
   * Carries every entry over an edit that is no step of the history (FBL 0.7 §7.1): `through`,
   * already applied, which made the body `current`. Each entry's splices are moved by the bytes the
   * edit added or removed before them, and its digests are those of the bodies the entries now lead
   * through, so that the drift check of FBL 7.2 compares the body with those writes in it. When the
   * edit overlaps an entry's splices, the history is cleared: that entry cannot be undone without
   * undoing the edit.
   */
  carryOver(current: Uint8Array, through: readonly FblSplice[]): void {
    const undo: HistoryEntry[] = [];
    let state = current;
    let outside = through;
    // From the most recent entry back: each is moved over the outside edit as it stands after it,
    // and the outside edit is then moved back over the entry to stand before it.
    for (let i = this.undoStack.length - 1; i >= 0; i--) {
      const entry = this.undoStack[i];
      const inverse = moved(entry.inverse, outside);
      if (!inverse) return this.clear();
      const before = applySplices(state, inverse);
      undo.unshift({ edit: { splices: inverseSplices(state, inverse) }, inverse, beforeDigest: digestOf(before), afterDigest: digestOf(state) });
      const earlier = moved(outside, entry.inverse);
      if (!earlier) return this.clear();
      outside = earlier;
      state = before;
    }
    const redo: HistoryEntry[] = [];
    state = current;
    outside = through;
    for (let i = this.redoStack.length - 1; i >= 0; i--) {
      const entry = this.redoStack[i];
      const splices = moved(entry.edit.splices, outside);
      if (!splices) return this.clear();
      const after = applySplices(state, splices);
      redo.unshift({ edit: { splices }, inverse: inverseSplices(state, splices), beforeDigest: digestOf(state), afterDigest: digestOf(after) });
      const later = moved(outside, entry.edit.splices);
      if (!later) return this.clear();
      outside = later;
      state = after;
    }
    this.undoStack.splice(0, this.undoStack.length, ...undo);
    this.redoStack.splice(0, this.redoStack.length, ...redo);
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}

/**
 * `splices` with their offsets moved over `through`, both in the offsets of one body (an edit outside
 * the history is carried past an entry by that entry's own splices, not by its moved ones): by the
 * bytes every splice of `through` that ends before one (or inserts where it starts) adds or removes.
 * Nothing when the two overlap.
 */
function moved(splices: readonly FblSplice[], through: readonly FblSplice[]): FblSplice[] | undefined {
  const result: FblSplice[] = [];
  for (const splice of splices) {
    let shift = 0;
    for (const other of through) {
      if (other.start < splice.end && splice.start < other.end) return undefined;
      if (other.end <= splice.start) shift += byteLength(other.text) - (other.end - other.start);
    }
    result.push({ ...splice, start: splice.start + shift, end: splice.end + shift });
  }
  return result;
}
