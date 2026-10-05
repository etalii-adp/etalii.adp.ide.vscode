import type { Position } from '../registration/registration';
import { arrangeTree, rowAndBeneath as treeRowAndBeneath, treeDragPreview, treeDrop, treeLayout, type TreeDrop, type TreeSpacing } from '../diagram/layout/tree';
import { isWithin, type Model, type Node } from './model';

// Where each node is drawn: the diagram library's top-down tree (`../diagram/layout/tree`),
// children left to right in the order the Markdown lists them, because the left-to-right order of
// a node's children is the order they are tried in. An author's drag moves a row, never a single
// box, and the registration keeps the height a row was dragged to. What is this tool's own is the
// size of a node, and that a node's id is its place in the tree, so a reorder renames ids.
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

/** How big a node is and how far apart the tree spaces them. */
export const spacing: TreeSpacing = { nodeWidth, nodeHeight, horizontalGap, verticalGap, minimumGap };

/** The top-left of every node as the tree alone places it. */
export function compute(model: Model): Map<string, Position> {
  return treeLayout(model.nodes, spacing);
}

/** Where each node is drawn, the author's dragged row heights included. */
export function arrange(model: Model, stored: ReadonlyMap<string, Position>): Map<string, Position> {
  return arrangeTree(model.nodes, stored, spacing);
}

/** What one drop means for a node's row: its new place among its siblings, and how far the row moves down. */
export type Drop = TreeDrop;

/** What dropping a node with its top-left at a point means. */
export function dropOf(model: Model, stored: ReadonlyMap<string, Position>, node: Node, x: number, y: number): Drop {
  return treeDrop(model.nodes, arrange(model, stored), node, x, y, spacing);
}

/** Where every node is drawn while one is dragged with its top-left at a point, before anything is written. */
export function dragPreview(model: Model, now: ReadonlyMap<string, Position>, node: Node, x: number, y: number): Map<string, Position> {
  return treeDragPreview(model.nodes, now, node, x, y, spacing);
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
  return treeRowAndBeneath(model.nodes, node);
}
