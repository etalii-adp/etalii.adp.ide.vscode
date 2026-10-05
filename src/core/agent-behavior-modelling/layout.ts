import type { Position } from '../registration/registration';
import { childrenOf, isWithin, nodeOf, rootsOf, siblingsOf, type Model, type Node } from './model';

// Where each node is drawn: a top-down tree, children left to right in the order the Markdown
// lists them, each parent centred over its children.
//
// Computed, because the order is the meaning: the left-to-right order of a node's children is the
// order they are tried in. An author's drag moves a row, never a single box. Across, a node's place
// is its order among its siblings, so the computed x always holds and a drag sideways changes the
// order instead. Down, every child of one parent sits at the same height, and the registration
// keeps the height a row was dragged to; everything beneath a row follows it.
//
// Positions are top-left corners, as the registration stores them.

export const nodeWidth = 200;
export const nodeHeight = 60;
/** The space between two neighbouring subtrees. */
export const horizontalGap = 28;
/** The space between a parent's bottom and its children's top. */
export const verticalGap = 56;
/** The least space a dragged row keeps between its parent's bottom and its own top. */
export const minimumGap = 16;

type Outline = { left: number; right: number }[];

// Places outlines left to right, each as far left as keeps `gap` clear of everything before it at
// every depth they share; answers each one's offset and the combined outline.
function pack(outlines: readonly Outline[], gap: number): { offsets: number[]; outline: Outline } {
  const offsets: number[] = [];
  const combined: Outline = [];
  for (const outline of outlines) {
    let offset = 0;
    if (combined.length > 0) {
      offset = Number.NEGATIVE_INFINITY;
      for (let depth = 0; depth < Math.min(combined.length, outline.length); depth++) {
        offset = Math.max(offset, combined[depth].right + gap - outline[depth].left);
      }
    }
    offsets.push(offset);
    for (let depth = 0; depth < outline.length; depth++) {
      const left = outline[depth].left + offset;
      const right = outline[depth].right + offset;
      if (depth < combined.length) combined[depth] = { left: Math.min(combined[depth].left, left), right: Math.max(combined[depth].right, right) };
      else combined.push({ left, right });
    }
  }
  return { offsets, outline: combined };
}

/**
 * The top-left of every node as the tree alone places it. Tidy, not boxed: each subtree is placed
 * as close to its left sibling as their outlines allow, so a shallow subtree tucks in under a deep
 * neighbour's empty corner. The order is never traded for room.
 */
export function compute(model: Model): Map<string, Position> {
  // Each node's left edge relative to its parent's, and each subtree's outline per depth relative
  // to its own root's left edge. Document order is depth-first, so walking it backwards meets every
  // child before its parent.
  const offsets = new Map<string, number>();
  const outlines = new Map<string, Outline>();
  for (const node of [...model.nodes].reverse()) {
    const placed = pack(node.childIds.map((id) => outlines.get(id) ?? [{ left: 0, right: nodeWidth }]), horizontalGap);
    if (placed.offsets.length === 0) {
      outlines.set(node.id, [{ left: 0, right: nodeWidth }]);
      continue;
    }
    // Centred over the first and last child, whose roots sit at their packed offsets.
    const left = (placed.offsets[0] + placed.offsets[placed.offsets.length - 1]) / 2;
    node.childIds.forEach((id, index) => offsets.set(id, placed.offsets[index] - left));
    outlines.set(node.id, [{ left: 0, right: nodeWidth }, ...placed.outline.map((level) => ({ left: level.left - left, right: level.right - left }))]);
  }

  // The roots side by side, packed the same way with a wider gap between whole trees.
  const roots = rootsOf(model);
  const rootLefts = pack(roots.map((root) => outlines.get(root.id) ?? [{ left: 0, right: nodeWidth }]), horizontalGap * 2).offsets;
  const positions = new Map<string, Position>();
  const place = (node: Node, left: number, depth: number): void => {
    positions.set(node.id, { x: left, y: depth * (nodeHeight + verticalGap) });
    for (const child of childrenOf(model, node)) place(child, left + (offsets.get(child.id) ?? 0), depth + 1);
  };
  roots.forEach((root, index) => place(root, rootLefts[index], 0));

  // From the leftmost node at zero.
  const shift = positions.size === 0 ? 0 : Math.min(...[...positions.values()].map((position) => position.x));
  return new Map([...positions].map(([id, position]) => [id, { x: position.x - shift, y: position.y }]));
}

/**
 * Where each node is drawn, the author's drags included: the computed x, and the height of its row,
 * which is the first height stored for any node of the row, or the computed distance below its
 * parent when none is. A row is never drawn closer to its parent than the minimum gap.
 */
export function arrange(model: Model, stored: ReadonlyMap<string, Position>): Map<string, Position> {
  const computed = compute(model);
  const positions = new Map<string, Position>();
  const placeRow = (row: readonly Node[], hangingY: number, floor: number): void => {
    const dragged = row.map((node) => stored.get(node.id)?.y).find((y) => y !== undefined);
    const y = Math.max(dragged ?? hangingY, floor);
    for (const node of row) {
      positions.set(node.id, { x: computed.get(node.id)?.x ?? 0, y });
      placeRow(childrenOf(model, node), y + nodeHeight + verticalGap, y + nodeHeight + minimumGap);
    }
  };
  placeRow(rootsOf(model), 0, Number.NEGATIVE_INFINITY);
  return positions;
}

/** What one drop means for a node's row: its new place among its siblings, and how far the row moves down. */
export interface Drop {
  readonly from: number;
  readonly to: number;
  /** How far its row, and everything beneath it, moves down; negative is up. */
  readonly dy: number;
}

/**
 * What dropping a node with its top-left at a point means. Across, the order: the node goes before
 * the first other sibling whose middle is right of the drop's middle. Down, the row: the whole row
 * moves by what the node moved, never closer to the parent than the minimum gap.
 */
export function dropOf(model: Model, stored: ReadonlyMap<string, Position>, node: Node, x: number, y: number): Drop {
  return dropAmong(model, arrange(model, stored), node, x, y);
}

/** What a drop means, given where every node is drawn now. */
export function dropAmong(model: Model, positions: ReadonlyMap<string, Position>, node: Node, x: number, y: number): Drop {
  const siblings = siblingsOf(model, node);
  const from = siblings.findIndex((sibling) => sibling.id === node.id);
  const middle = x + nodeWidth / 2;
  const to = siblings.filter((sibling) => sibling.id !== node.id && (positions.get(sibling.id)?.x ?? 0) + nodeWidth / 2 < middle).length;
  const parentY = node.parentId === undefined ? undefined : positions.get(node.parentId)?.y;
  const floor = parentY === undefined ? Number.NEGATIVE_INFINITY : parentY + nodeHeight + minimumGap;
  return { from, to, dy: Math.max(y, floor) - (positions.get(node.id)?.y ?? 0) };
}

/**
 * Where every node is drawn while one is dragged with its top-left at a point, before anything is
 * written. The dragged node carries everything beneath it; the rest of its row, and what hangs
 * under that, follows it up and down; and when it has passed a sibling's middle, the others are
 * drawn where the new order would put them, so they step aside to show where it will land.
 */
export function dragPreview(model: Model, now: ReadonlyMap<string, Position>, node: Node, x: number, y: number): Map<string, Position> {
  const drop = dropAmong(model, now, node, x, y);
  const at = now.get(node.id) ?? { x: 0, y: 0 };
  const across = drop.from === drop.to ? undefined : compute(reordered(model, node, drop));
  const lifted = new Set(rowAndBeneath(model, node).map((member) => member.id));
  const preview = new Map<string, Position>();
  for (const other of model.nodes) {
    const was = now.get(other.id);
    if (!was) continue;
    if (isWithin(other.id, node.id)) {
      preview.set(other.id, { x: was.x + (x - at.x), y: was.y + drop.dy });
    } else {
      preview.set(other.id, { x: across?.get(other.id)?.x ?? was.x, y: was.y + (lifted.has(other.id) ? drop.dy : 0) });
    }
  }
  return preview;
}

// The tree with a node at its new place among its siblings, every node keeping its id: what the
// layout is computed from for a preview, before the Markdown is touched.
function reordered(model: Model, node: Node, drop: Drop): Model {
  const order = siblingsOf(model, node).map((sibling) => sibling.id).filter((id) => id !== node.id);
  order.splice(drop.to, 0, node.id);
  if (node.parentId === undefined) {
    // The roots are in the order of the list, so their subtrees change places in it.
    return { ...model, nodes: order.flatMap((root) => model.nodes.filter((candidate) => isWithin(candidate.id, root))) };
  }
  return { ...model, nodes: model.nodes.map((candidate) => (candidate.id === node.parentId ? { ...candidate, childIds: order } : candidate)) };
}
/** Whether a drop changes nothing: the same place, and the same height. */
export const isNothing = (drop: Drop): boolean => drop.from === drop.to && Math.abs(drop.dy) < 0.5;

/** The index a move takes for a drop: before the child now there, the node itself still counted. */
export const moveIndexOf = (drop: Drop): number => (drop.to <= drop.from ? drop.to : drop.to + 1);

const placeOf = (parentId: string | undefined, index: number): string => (parentId === undefined ? String(index + 1) : `${parentId}.${index + 1}`);

/**
 * The stored positions with their ids following the nodes after a reorder: an id is a place in the
 * tree, so a reorder renames every id in the siblings' subtrees, and a position kept under the old
 * name would land on another node.
 */
export function renamed(drop: Drop, parentId: string | undefined, siblingCount: number, stored: ReadonlyMap<string, Position>): Map<string, Position> {
  const order = Array.from({ length: siblingCount }, (_, index) => index).filter((index) => index !== drop.from);
  order.splice(drop.to, 0, drop.from);
  const result = new Map<string, Position>();
  for (const [id, position] of stored) {
    let key = id;
    for (let newIndex = 0; newIndex < order.length; newIndex++) {
      const old = placeOf(parentId, order[newIndex]);
      if (isWithin(id, old)) {
        key = placeOf(parentId, newIndex) + id.slice(old.length);
        break;
      }
    }
    result.set(key, position);
  }
  return result;
}

/** Every node of a row and beneath it: what a drag of one node of the row moves. */
export function rowAndBeneath(model: Model, node: Node): Node[] {
  const parent = node.parentId === undefined ? undefined : nodeOf(model, node.parentId);
  const row = parent ? childrenOf(model, parent) : rootsOf(model);
  return model.nodes.filter((candidate) => row.some((member) => isWithin(candidate.id, member.id)));
}
