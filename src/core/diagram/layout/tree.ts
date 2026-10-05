import type { Point } from '../geometry';

// A top-down tree: children left to right in their order, each parent centred over its children,
// and what a drag of one node means for it. Any diagram whose elements form a tree lays itself out
// with these, such as Agent Behavior Modelling, the way the standalone host's library offers its
// tree layout to every module.
//
// Computed, because the order is the meaning: across, a node's place is its order among its
// siblings, so the computed x always holds and a drag sideways changes the order instead. Down,
// every child of one parent sits at the same height, and what the diagram keeps of a dragged row is
// its height; everything beneath a row follows it.
//
// Positions are top-left corners.

/** One node of the tree. The nodes are listed depth first, so a subtree is one run of the list. */
export interface TreeNode {
  readonly id: string;
  readonly parentId?: string;
  readonly childIds: readonly string[];
}

/** How big a node is and how far apart the tree spaces them. */
export interface TreeSpacing {
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  /** The space between two neighbouring subtrees. */
  readonly horizontalGap: number;
  /** The space between a parent's bottom and its children's top. */
  readonly verticalGap: number;
  /** The least space a dragged row keeps between its parent's bottom and its own top. */
  readonly minimumGap: number;
}

/** What one drop means for a node's row: its new place among its siblings, and how far the row moves down. */
export interface TreeDrop {
  readonly from: number;
  readonly to: number;
  /** How far its row, and everything beneath it, moves down; negative is up. */
  readonly dy: number;
}

const nodeOf = (nodes: readonly TreeNode[], id: string | undefined): TreeNode | undefined => (id === undefined ? undefined : nodes.find((node) => node.id === id));
const rootsOf = <T extends TreeNode>(nodes: readonly T[]): T[] => nodes.filter((node) => node.parentId === undefined);
const childrenOf = <T extends TreeNode>(nodes: readonly T[], node: TreeNode): T[] =>
  node.childIds.map((id) => nodes.find((candidate) => candidate.id === id)).filter((child): child is T => child !== undefined);

/** A node's siblings, itself included, in order: its parent's children, or the roots. */
export function siblingsOf<T extends TreeNode>(nodes: readonly T[], node: TreeNode): T[] {
  const parent = nodeOf(nodes, node.parentId);
  return parent ? childrenOf(nodes, parent) : rootsOf(nodes);
}

/** Whether a node is the given one or lies beneath it. */
export function isBeneath(nodes: readonly TreeNode[], candidate: string, ancestor: string): boolean {
  for (let current = nodeOf(nodes, candidate); current; current = nodeOf(nodes, current.parentId)) {
    if (current.id === ancestor) return true;
  }
  return false;
}

/** A node and everything beneath it, in the order of the list. */
export function subtreeOf<T extends TreeNode>(nodes: readonly T[], node: TreeNode): T[] {
  return nodes.filter((candidate) => isBeneath(nodes, candidate.id, node.id));
}

/** Every node of a node's row and beneath it: what a drag of one node of the row moves up and down. */
export function rowAndBeneath<T extends TreeNode>(nodes: readonly T[], node: TreeNode): T[] {
  const row = siblingsOf(nodes, node);
  return nodes.filter((candidate) => row.some((member) => isBeneath(nodes, candidate.id, member.id)));
}

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
export function treeLayout(nodes: readonly TreeNode[], spacing: TreeSpacing): Map<string, Point> {
  const { nodeWidth, nodeHeight, horizontalGap, verticalGap } = spacing;
  // Each node's left edge relative to its parent's, and each subtree's outline per depth relative
  // to its own root's left edge. The list is depth first, so walking it backwards meets every child
  // before its parent.
  const offsets = new Map<string, number>();
  const outlines = new Map<string, Outline>();
  for (const node of [...nodes].reverse()) {
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
  const roots = rootsOf(nodes);
  const rootLefts = pack(roots.map((root) => outlines.get(root.id) ?? [{ left: 0, right: nodeWidth }]), horizontalGap * 2).offsets;
  const positions = new Map<string, Point>();
  const place = (node: TreeNode, left: number, depth: number): void => {
    positions.set(node.id, { x: left, y: depth * (nodeHeight + verticalGap) });
    for (const child of childrenOf(nodes, node)) place(child, left + (offsets.get(child.id) ?? 0), depth + 1);
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
export function arrangeTree(nodes: readonly TreeNode[], stored: ReadonlyMap<string, Point>, spacing: TreeSpacing): Map<string, Point> {
  const computed = treeLayout(nodes, spacing);
  const positions = new Map<string, Point>();
  const placeRow = (row: readonly TreeNode[], hangingY: number, floor: number): void => {
    const dragged = row.map((node) => stored.get(node.id)?.y).find((y) => y !== undefined);
    const y = Math.max(dragged ?? hangingY, floor);
    for (const node of row) {
      positions.set(node.id, { x: computed.get(node.id)?.x ?? 0, y });
      placeRow(childrenOf(nodes, node), y + spacing.nodeHeight + spacing.verticalGap, y + spacing.nodeHeight + spacing.minimumGap);
    }
  };
  placeRow(rootsOf(nodes), 0, Number.NEGATIVE_INFINITY);
  return positions;
}

/**
 * What dropping a node with its top-left at a point means, given where every node is drawn now.
 * Across, the order: the node goes before the first other sibling whose middle is right of the
 * drop's middle. Down, the row: the whole row moves by what the node moved, never closer to the
 * parent than the minimum gap.
 */
export function treeDrop(nodes: readonly TreeNode[], positions: ReadonlyMap<string, Point>, node: TreeNode, x: number, y: number, spacing: TreeSpacing): TreeDrop {
  const { nodeWidth, nodeHeight, minimumGap } = spacing;
  const siblings = siblingsOf(nodes, node);
  const from = siblings.findIndex((sibling) => sibling.id === node.id);
  const middle = x + nodeWidth / 2;
  const to = siblings.filter((sibling) => sibling.id !== node.id && (positions.get(sibling.id)?.x ?? 0) + nodeWidth / 2 < middle).length;
  const parentY = node.parentId === undefined ? undefined : positions.get(node.parentId)?.y;
  const floor = parentY === undefined ? Number.NEGATIVE_INFINITY : parentY + nodeHeight + minimumGap;
  return { from, to, dy: Math.max(y, floor) - (positions.get(node.id)?.y ?? 0) };
}

// The tree with a node at its new place among its siblings, every node keeping its id: what the
// layout is computed from for a preview, before anything is written.
function reordered(nodes: readonly TreeNode[], node: TreeNode, drop: TreeDrop): TreeNode[] {
  const order = siblingsOf(nodes, node).map((sibling) => sibling.id).filter((id) => id !== node.id);
  order.splice(drop.to, 0, node.id);
  if (node.parentId === undefined) {
    // The roots are in the order of the list, so their subtrees change places in it.
    return order.flatMap((root) => nodes.filter((candidate) => isBeneath(nodes, candidate.id, root)));
  }
  return nodes.map((candidate) => (candidate.id === node.parentId ? { ...candidate, childIds: order } : candidate));
}

/**
 * Where every node is drawn while one is dragged with its top-left at a point, before anything is
 * written. The dragged node carries everything beneath it; the rest of its row, and what hangs
 * under that, follows it up and down; and when it has passed a sibling's middle, the others are
 * drawn where the new order would put them, so they step aside to show where it will land.
 */
export function treeDragPreview(nodes: readonly TreeNode[], now: ReadonlyMap<string, Point>, node: TreeNode, x: number, y: number, spacing: TreeSpacing): Map<string, Point> {
  const drop = treeDrop(nodes, now, node, x, y, spacing);
  const at = now.get(node.id) ?? { x: 0, y: 0 };
  const across = drop.from === drop.to ? undefined : treeLayout(reordered(nodes, node, drop), spacing);
  const lifted = new Set(rowAndBeneath(nodes, node).map((member) => member.id));
  const preview = new Map<string, Point>();
  for (const other of nodes) {
    const was = now.get(other.id);
    if (!was) continue;
    if (isBeneath(nodes, other.id, node.id)) {
      preview.set(other.id, { x: was.x + (x - at.x), y: was.y + drop.dy });
    } else {
      preview.set(other.id, { x: across?.get(other.id)?.x ?? was.x, y: was.y + (lifted.has(other.id) ? drop.dy : 0) });
    }
  }
  return preview;
}
