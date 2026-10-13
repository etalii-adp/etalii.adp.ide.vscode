// The standard layout `tidyTree` (DISL 10.3): containment drawn as a tidy tree, top-down, and what
// a drag of one of its nodes means. Across, a node's place is its order among its siblings, so the
// computed place always holds and a drag sideways changes the order instead. Down, all children of
// one parent share a row, and what is kept of a dragged row is its height; everything beneath a
// row hangs from it. Positions are top-left corners, in canvas units.

/** One node of the tree, in model order: its children are the nodes that name it as their parent, in that order. */
export interface TreeItem {
  readonly id: string;
  /** The node it lies in; a node whose parent is not in the tree is a root. */
  readonly parent?: string;
  readonly width: number;
  readonly height: number;
}

/** `$defs/TidyTree` (DISL 10.3), with its defaults filled in, and the `spacing` of its configuration. */
export interface TidyTree {
  readonly parentAlign: 'firstLastCentre' | 'childrenCentre';
  readonly origin: 'leftmostAtZero' | 'rootAtZero';
  readonly rows: { readonly stored: 'none' | 'y'; readonly minGap: number };
  readonly drag: { readonly carry: 'subtree' | 'node'; readonly across: 'reorder' | 'none'; readonly down: 'row' | 'none' };
  /** `node`: between neighbouring subtrees; `layer`: from a parent's bottom to its children's top; `component`: between the trees of two roots. */
  readonly spacing: { readonly node: number; readonly layer: number; readonly component: number };
}

export interface TreePoint {
  readonly x: number;
  readonly y: number;
}

/** What one drop means for a node: its place among its siblings before and after, and how far its row moves down. */
export interface TreeDrop {
  readonly from: number;
  readonly to: number;
  /** How far its row, and everything beneath it, moves down; negative is up. */
  readonly dy: number;
}

interface Tree {
  readonly byId: ReadonlyMap<string, TreeItem>;
  readonly roots: readonly TreeItem[];
  childrenOf(id: string): readonly TreeItem[];
  /** The node's siblings, itself included, in order: its parent's children, or the roots. */
  siblingsOf(item: TreeItem): readonly TreeItem[];
  isBeneath(candidate: string, ancestor: string): boolean;
}

function treeOf(items: readonly TreeItem[]): Tree {
  const byId = new Map(items.map((item) => [item.id, item]));
  const children = new Map<string, TreeItem[]>();
  const roots: TreeItem[] = [];
  for (const item of items) {
    if (item.parent === undefined || !byId.has(item.parent) || item.parent === item.id) roots.push(item);
    else children.set(item.parent, [...(children.get(item.parent) ?? []), item]);
  }
  const childrenOf = (id: string): readonly TreeItem[] => children.get(id) ?? [];
  const parentOf = (item: TreeItem): TreeItem | undefined => (roots.includes(item) ? undefined : byId.get(item.parent!));
  return {
    byId, roots, childrenOf,
    siblingsOf: (item) => { const parent = parentOf(item); return parent ? childrenOf(parent.id) : roots; },
    isBeneath: (candidate, ancestor) => {
      for (let current = byId.get(candidate), seen = 0; current && seen <= items.length; current = parentOf(current), seen++) if (current.id === ancestor) return true;
      return false;
    },
  };
}

/** A node and everything beneath it, in the order of the list. */
export function subtreeOf(items: readonly TreeItem[], id: string): string[] {
  const tree = treeOf(items);
  return items.filter((item) => tree.isBeneath(item.id, id)).map((item) => item.id);
}

/** Every node of a node's row and beneath it: what a drag of one node of the row moves up and down. */
export function rowAndBeneath(items: readonly TreeItem[], id: string): string[] {
  const tree = treeOf(items);
  const item = tree.byId.get(id);
  const row = item ? tree.siblingsOf(item) : [];
  return items.filter((candidate) => row.some((member) => tree.isBeneath(candidate.id, member.id))).map((candidate) => candidate.id);
}

type Outline = { left: number; right: number }[];

// Places outlines left to right, each as far left as keeps `gap` clear of everything before it at
// every depth they share; answers each one's offset and the combined outline.
function pack(outlines: readonly Outline[], gap: number): { readonly offsets: number[]; readonly outline: Outline } {
  const offsets: number[] = [];
  const combined: Outline = [];
  for (const outline of outlines) {
    let offset = 0;
    if (combined.length > 0) {
      offset = Number.NEGATIVE_INFINITY;
      for (let depth = 0; depth < Math.min(combined.length, outline.length); depth++) offset = Math.max(offset, combined[depth].right + gap - outline[depth].left);
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
 * The top-left of every node. Tidy, not boxed: each subtree is placed as close to its left sibling
 * as their outlines allow, so a shallow subtree tucks in under a deep neighbour's empty corner, and
 * the order is never traded for room. With `rows.stored: "y"`, a row is drawn at the first height
 * `stored` gives for any of its nodes, in model order, and never closer to its parent than `rows.minGap`.
 */
export function tidyTreePlaces(items: readonly TreeItem[], options: TidyTree, stored: (id: string) => number | undefined = () => undefined): Map<string, TreePoint> {
  // simplified: the tree grows downwards; turn the two axes for another `direction` when a definition names one.
  const tree = treeOf(items);
  const { spacing, rows } = options;

  // Each node's left edge relative to its parent's, and each subtree's outline per depth relative to its own root's left edge.
  const offsets = new Map<string, number>();
  const outlineOf = (item: TreeItem): Outline => {
    const children = tree.childrenOf(item.id);
    const own = { left: 0, right: item.width };
    if (children.length === 0) return [own];
    const packed = pack(children.map(outlineOf), spacing.node);
    const first = packed.offsets[0] + children[0].width / 2;
    const last = packed.offsets[children.length - 1] + children[children.length - 1].width / 2;
    const centre = options.parentAlign === 'childrenCentre' ? (packed.outline[0].left + packed.outline[0].right) / 2 : (first + last) / 2;
    const left = centre - item.width / 2;
    children.forEach((child, index) => offsets.set(child.id, packed.offsets[index] - left));
    return [own, ...packed.outline.map((level) => ({ left: level.left - left, right: level.right - left }))];
  };
  const rootLefts = pack(tree.roots.map(outlineOf), spacing.component).offsets;

  const across = new Map<string, number>();
  const placeAcross = (item: TreeItem, left: number): void => {
    across.set(item.id, left);
    for (const child of tree.childrenOf(item.id)) placeAcross(child, left + (offsets.get(child.id) ?? 0));
  };
  tree.roots.forEach((root, index) => placeAcross(root, rootLefts[index]));
  const shift = across.size === 0 ? 0 : options.origin === 'rootAtZero' ? across.get(tree.roots[0].id)! : Math.min(...across.values());

  const places = new Map<string, TreePoint>();
  const placeRow = (row: readonly TreeItem[], hanging: number, floor: number): void => {
    const kept = rows.stored === 'y' ? row.map((item) => stored(item.id)).find((y) => y !== undefined) : undefined;
    const y = Math.max(kept ?? hanging, floor);
    for (const item of row) {
      places.set(item.id, { x: across.get(item.id)! - shift, y });
      placeRow(tree.childrenOf(item.id), y + item.height + spacing.layer, y + item.height + rows.minGap);
    }
  };
  placeRow(tree.roots, 0, Number.NEGATIVE_INFINITY);
  // In the order of the list.
  return new Map(items.flatMap((item) => (places.has(item.id) ? [[item.id, places.get(item.id)!] as const] : [])));
}

/**
 * What dropping a node with its top-left at a point means, given where every node is drawn now.
 * Across, the order: the node goes before the first other sibling whose middle is right of the
 * drop's middle. Down, the row: the whole row moves by what the node moved, never closer to the
 * parent than `rows.minGap`. A tree that reorders by no drag, or stores no row, keeps that of the two.
 */
export function treeDrop(items: readonly TreeItem[], places: ReadonlyMap<string, TreePoint>, id: string, x: number, y: number, options: TidyTree): TreeDrop {
  const tree = treeOf(items);
  const item = tree.byId.get(id);
  if (!item) return { from: 0, to: 0, dy: 0 };
  const siblings = tree.siblingsOf(item);
  const from = siblings.indexOf(item);
  const middle = x + item.width / 2;
  const to = options.drag.across !== 'reorder' ? from : siblings.filter((sibling) => sibling !== item && (places.get(sibling.id)?.x ?? 0) + sibling.width / 2 < middle).length;
  const parent = tree.roots.includes(item) ? undefined : tree.byId.get(item.parent!);
  const above = parent && places.get(parent.id);
  const floor = parent && above ? above.y + parent.height + options.rows.minGap : Number.NEGATIVE_INFINITY;
  return { from, to, dy: options.drag.down !== 'row' ? 0 : Math.max(y, floor) - (places.get(id)?.y ?? 0) };
}

/** The list with a node at another place among its siblings, every node keeping its id. */
export function reordered(items: readonly TreeItem[], id: string, to: number): TreeItem[] {
  const tree = treeOf(items);
  const item = tree.byId.get(id);
  if (!item) return [...items];
  const order = tree.siblingsOf(item).filter((sibling) => sibling !== item);
  order.splice(to, 0, item);
  const moved = new Set(order);
  const listed = (row: readonly TreeItem[]): TreeItem[] => (row.some((member) => moved.has(member)) ? order : [...row]).flatMap((member) => [member, ...listed(tree.childrenOf(member.id))]);
  return listed(tree.roots);
}

/**
 * Where every node is drawn while one is dragged with its top-left at a point, before anything is
 * written. The dragged node carries what `drag.carry` says; the rest of its row, and what hangs
 * under that, follows it up and down; and when it has passed a sibling's middle, the others are
 * drawn where the new order would put them, so they step aside to show where it will land.
 */
export function treeDragPreview(items: readonly TreeItem[], places: ReadonlyMap<string, TreePoint>, id: string, x: number, y: number, options: TidyTree): Map<string, TreePoint> {
  const tree = treeOf(items);
  const drop = treeDrop(items, places, id, x, y, options);
  const at = places.get(id) ?? { x: 0, y: 0 };
  const across = drop.from === drop.to ? undefined : tidyTreePlaces(reordered(items, id, drop.to), { ...options, rows: { ...options.rows, stored: 'none' } });
  const lifted = new Set(rowAndBeneath(items, id));
  const carried = (other: string): boolean => (options.drag.carry === 'subtree' ? tree.isBeneath(other, id) : other === id);
  const preview = new Map<string, TreePoint>();
  for (const other of items) {
    const was = places.get(other.id);
    if (!was) continue;
    if (carried(other.id)) preview.set(other.id, { x: was.x + (x - at.x), y: was.y + drop.dy });
    else preview.set(other.id, { x: across?.get(other.id)?.x ?? was.x, y: was.y + (lifted.has(other.id) ? drop.dy : 0) });
  }
  return preview;
}
