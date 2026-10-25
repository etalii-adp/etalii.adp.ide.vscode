import type { HierarchyGestures, HierarchyNode, HierarchyView } from '../../core/tool/hierarchyView';

// Where the levels and entries of a page of boxes stand, as the standalone host's page lays them
// out (its `layout.ts`): how many levels fit the page's width, the levels above a node and below a
// level, and the focus that brings a node into sight. Nothing here reads a definition: a node's
// place is the view's nesting.

/** The width of a level's own box, in pixels: each level that fits takes this much of the page. */
export const LEVEL_WIDTH = 240;

/** The least width the entries of the deepest level shown keep, in pixels. */
export const ENTRY_MIN_WIDTH = 280;

/** The most columns of levels the page counts; more than any document holds. */
const MOST_COLUMNS = 1000;

/**
 * How many levels fit a page of `width` pixels, at least one, its columns from the left having the
 * widths `columnWidth` gives them, counted from 0. An unmeasured page, width 0, shows them all.
 */
export function levelsThatFit(width: number, columnWidth: (column: number) => number = () => LEVEL_WIDTH): number {
  if (width <= 0) return Number.POSITIVE_INFINITY;
  let used = ENTRY_MIN_WIDTH;
  let fit = 0;
  while (fit < MOST_COLUMNS && used + columnWidth(fit) <= width) {
    used += columnWidth(fit);
    fit += 1;
  }
  return Math.max(1, fit);
}

/** How far an arrow key moves a column's right edge, in pixels. */
export const WIDTH_STEP = 16;

/** A width the document keeps for a column of levels: the one it names, and the width the page reads of it, absent where it reads none. */
export interface KeptWidth {
  readonly id: string;
  readonly width?: number;
  readonly gestures: HierarchyGestures;
}

/** The narrowest and the widest a column may be: the view's range, else the page's own width. */
export function widthRangeOf(view: HierarchyView | undefined): { readonly min: number; readonly max: number } {
  return { min: view?.widthRange?.min ?? LEVEL_WIDTH, max: view?.widthRange?.max ?? LEVEL_WIDTH };
}

/**
 * The widths the document keeps, by the depth of their column, 1 for the top levels, as the
 * standalone host reads them: a column named by no whole number from 1 is no column, and a width
 * that is no whole number or lies outside the view's range is a column the page gives its own
 * width. Of two for one depth, the first counts.
 */
export function keptWidthsOf(view: HierarchyView): ReadonlyMap<number, KeptWidth> {
  const range = view.widthRange;
  const kept = new Map<number, KeptWidth>();
  for (const column of view.widths) {
    if (!/^[1-9][0-9]*$/.test(column.level)) continue;
    const level = Number(column.level);
    if (kept.has(level)) continue;
    const { width } = column;
    const fits = Number.isInteger(width) && width > 0 && width >= (range?.min ?? 1) && width <= (range?.max ?? Number.POSITIVE_INFINITY);
    kept.set(level, { id: column.id, ...(fits ? { width } : {}), gestures: column.gestures });
  }
  return kept;
}

/** The levels and entries of one view, by id, each with what it holds as the page draws it: its entries, then its levels. */
export interface HierarchyIndex {
  readonly byId: ReadonlyMap<string, HierarchyNode>;
}

export function indexOf(view: HierarchyView): HierarchyIndex {
  const byId = new Map<string, HierarchyNode>();
  const add = (node: HierarchyNode): void => {
    if (byId.has(node.id)) return;
    byId.set(node.id, node);
    for (const child of [...node.entries, ...node.levels]) add(child);
  };
  for (const node of [...view.roots, ...view.stray]) add(node);
  return { byId };
}

/** What a level holds, as the page draws it: its entries, then its levels. */
export const childrenOf = (node: HierarchyNode): readonly HierarchyNode[] => [...node.entries, ...node.levels];

/** The levels above `id`, from the top down; empty for a node at the top. */
export function ancestorsOf(index: HierarchyIndex, id: string): HierarchyNode[] {
  const chain: HierarchyNode[] = [];
  const seen = new Set<string>([id]);
  for (let node = index.byId.get(id); node?.parent !== undefined;) {
    const parent = index.byId.get(node.parent);
    if (parent === undefined || seen.has(parent.id)) break;
    seen.add(parent.id);
    chain.unshift(parent);
    node = parent;
  }
  return chain;
}

/** How many levels stand below a level, counting the levels nested in it to their deepest. */
export function levelsBelow(node: HierarchyNode): number {
  let deepest = 0;
  for (const level of node.levels) deepest = Math.max(deepest, 1 + levelsBelow(level));
  return deepest;
}

/** What the page changes to show a node: the focus it takes, and the collapsed levels above it, from the top down. */
export interface RevealPlan {
  readonly focus: string;
  readonly expand: readonly HierarchyNode[];
}

/**
 * How to show `targetId` from where the page stands: the focus is kept when the node is inside it
 * and its level fits the `fit` columns the page shows; otherwise it moves to the deepest level the
 * two have in common, the whole page when they share none, and from there down the node's levels
 * only as far as its own level needs to fit. Undefined when the view has no such node.
 */
export function revealOf(index: HierarchyIndex, targetId: string, focused: string, fit: number): RevealPlan | undefined {
  const target = index.byId.get(targetId);
  if (target === undefined) return undefined;
  const above = ancestorsOf(index, targetId);
  const levels = target.role === 'level' ? [...above, target] : above;
  let edge = levels.findIndex((level) => level.id === focused);
  if (focused !== '' && edge < 0) {
    const shared = new Set(ancestorsOf(index, focused).map((node) => node.id));
    edge = levels.reduce((deepest, level, at) => (shared.has(level.id) ? at : deepest), -1);
  }
  while (levels.length - 1 - Math.max(edge, 0) >= fit) edge += 1;
  return { focus: edge < 0 ? '' : levels[edge].id, expand: above.filter((level) => level.collapsed) };
}
