import type { HierarchyNode } from '../../core/tool/hierarchyView';
import { ancestorsOf, type HierarchyIndex } from './layout';

// Where a level or an entry dragged by its grip goes, as the standalone host decides it (its
// `useDragEntry.ts`): into a level, after a sibling there, and where the page shows it meanwhile.

/** Where a dropped node goes: into a level (empty for the top), after a sibling there (empty for none). */
export interface EntryDrop {
  readonly into: string;
  readonly after: string;
}

/** What the page shows while a node is dragged: the box under the pointer and how the drop stands to it, and the drop. */
export interface DropHint {
  readonly over: string;
  readonly kind: 'into' | 'after' | 'before';
  readonly dragged: HierarchyNode;
  readonly drop: EntryDrop;
}

/**
 * Where `dragged` goes when dropped on `over`'s box, in its lower half or its upper one; undefined
 * where it cannot go: on itself, into what it holds, or an entry onto the top. A level dropped on a
 * level goes after it from the lower half and into it from the upper one; on an entry, into that
 * entry's level. An entry dropped on an entry goes after it from the lower half and before it from
 * the upper one; on a level, into it, where a new entry would go.
 */
export function dropOf(index: HierarchyIndex, dragged: HierarchyNode, over: HierarchyNode, lowerHalf: boolean): EntryDrop | undefined {
  if (over.id === dragged.id || ancestorsOf(index, over.id).some((node) => node.id === dragged.id)) return undefined;
  if (dragged.role === 'level') {
    if (over.role === 'entry') return { into: over.parent ?? '', after: '' };
    return lowerHalf ? { into: over.parent ?? '', after: over.id } : { into: over.id, after: '' };
  }
  if (over.role === 'level') return { into: over.id, after: '' };
  if (over.parent === undefined) return undefined;
  if (lowerHalf) return { into: over.parent, after: over.id };
  const level = index.byId.get(over.parent);
  const siblings = (level?.entries ?? []).filter((node) => node.id !== dragged.id);
  const before = siblings[siblings.findIndex((node) => node.id === over.id) - 1];
  return { into: over.parent, after: before?.id ?? '' };
}

/**
 * Where the place a drop shows stands among `shown`, the children of its level as the page draws
 * them, entries before levels; -1 where it stands nowhere among them. A move after a sibling goes
 * right after it; without one, to the front of its kind within its own level, and after the last of
 * its kind into another, as the move operation places it.
 */
export function slotIndex(shown: readonly HierarchyNode[], hint: DropHint): number {
  const { dragged, drop } = hint;
  if (drop.after !== '') {
    const at = shown.findIndex((node) => node.id === drop.after);
    return at < 0 ? -1 : at + 1;
  }
  const entries = shown.filter((node) => node.role !== 'level').length;
  if ((dragged.parent ?? '') === drop.into) return dragged.role === 'level' ? entries : 0;
  return dragged.role === 'level' ? shown.length : entries;
}
