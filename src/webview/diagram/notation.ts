import type { Point } from '../../core/diagram/geometry';
import { treeDragPreview, type TreeNode } from '../../core/diagram/layout/tree';
import { boundaryLanding, nearestAttachment } from '../../core/diagram/shapes/segments';
import type { EditRequest, ViewElement, ViewModel, ViewRelation } from '../../core/frame/diagramType';
import type { DiagramDefinition, DraggingDefinition } from './definition';
import { bannerOfElement, drawElement } from './elements';
import { registerIcons } from './icons';
import { attachmentText, connectFrom, connectTo, drawConnecting, drawRelation, elementTypeOf, relationEnds, relationTypeOf } from './relations';

/** What a notation is given to draw one thing: the whole view, and the elements by id. */
export interface DrawContext {
  readonly view: ViewModel;
  readonly elements: ReadonlyMap<string, ViewElement>;
}

/** A point in canvas units. */
export type CanvasPoint = Point;

/** Something a selection shows that can be dragged, such as a segment boundary or an end of a relation. */
export interface Handle {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly cursor: string;
  readonly title: string;
}

/** What dragging a handle to a point shows while it moves and asks for when it is let go. */
export interface HandleDrag {
  /** The selected element as it would be drawn. */
  readonly element?: ViewElement;
  /** The selected relation as it would be drawn. */
  readonly relation?: ViewRelation;
  /** What letting go here asks for; absent when it would change nothing. */
  readonly request?: EditRequest;
}

/**
 * One diagram type's notation, as the canvas uses it: how each element and relation of its view
 * model is drawn, and what its handles and gestures do. Every notation is made by the diagram
 * library from a {@link DiagramDefinition}; a diagram type only states its definition.
 */
export interface Notation {
  readonly origin: string;
  readonly label: string;
  element(element: ViewElement, context: DrawContext): SVGGElement;
  /** A relation, or nothing when it is not drawn. */
  relation(relation: ViewRelation, context: DrawContext): SVGGElement | undefined;
  /** The handles a selected element or relation shows. */
  handles(selected: ViewElement | ViewRelation, context: DrawContext): Handle[];
  dragHandle(selected: ViewElement | ViewRelation, handle: string, point: CanvasPoint, context: DrawContext): HandleDrag;
  /**
   * Whether a press at this point of an element starts drawing a relation rather than moving the
   * element. The text says where on the element the relation leaves, empty when the type stores no
   * such thing; undefined means the press does not start a relation.
   */
  connectFrom(element: ViewElement, point: CanvasPoint): string | undefined;
  /** Where on an element a relation dropped at this point arrives, when the type stores such a thing. */
  connectTo(element: ViewElement, point: CanvasPoint): string | undefined;
  /**
   * How far every element is drawn from its place while one is dragged with its top-left at a point:
   * the dragged element itself, and whatever moves with it or makes way for it. Undefined leaves it
   * to the canvas, which moves the element with what its view says goes with it.
   */
  dragging(element: ViewElement, at: CanvasPoint, context: DrawContext): Map<string, CanvasPoint> | undefined;
  /** The line shown while a relation is being drawn from an element to a point. */
  connecting(from: ViewElement, fromEnd: string, to: CanvasPoint): SVGElement;
}

export function isRelation(selected: ViewElement | ViewRelation): selected is ViewRelation {
  return 'from' in selected;
}

interface TreeEntry {
  readonly id: string;
  readonly parent: string | null;
  readonly x: number;
  readonly y: number;
}

// While a node of a tree is dragged it carries everything beneath it, its row follows it up and
// down, and the siblings it has passed are drawn where the new order would put them. The tree and
// where each node is drawn come with the view, whole, so the preview is right whatever part of the
// tree is in view.
function treeRows(dragging: DraggingDefinition, element: ViewElement, at: CanvasPoint, context: DrawContext): Map<string, CanvasPoint> | undefined {
  const tree = context.view.chrome.tree as TreeEntry[] | undefined;
  if (!tree) return undefined;
  const nodes: TreeNode[] = tree.map((entry) => ({ id: entry.id, parentId: entry.parent ?? undefined, childIds: tree.filter((other) => other.parent === entry.id).map((other) => other.id) }));
  const node = nodes.find((candidate) => candidate.id === element.id);
  if (!node) return undefined;
  const now = new Map(tree.map((entry) => [entry.id, { x: entry.x, y: entry.y }]));
  const preview = treeDragPreview(nodes, now, node, at.x, at.y, dragging.spacing);
  const offsets = new Map<string, CanvasPoint>();
  for (const [id, position] of preview) {
    const was = now.get(id);
    if (was) offsets.set(id, { x: position.x - was.x, y: position.y - was.y });
  }
  return offsets;
}

/** The notation the diagram library draws a definition with. */
export function notationOf(definition: DiagramDefinition): Notation {
  return {
    origin: definition.origin,
    label: definition.label,
    element: (element) => drawElement(elementTypeOf(definition, element), element),
    relation: (relation, context) => drawRelation(definition, relation, context.elements),

    // A selected element whose segments may be moved shows a handle on each boundary; a selected
    // relation one on each end that sits along an element.
    handles(selected, context) {
      if (isRelation(selected)) {
        const type = relationTypeOf(definition, selected);
        const ends = relationEnds(definition, selected, context.elements);
        if (!type.movableEnds || !ends || (type.hiddenWhen !== undefined && selected.data[type.hiddenWhen] === true)) return [];
        const along = (id: string): boolean => {
          const element = context.elements.get(id);
          return element !== undefined && elementTypeOf(definition, element).anchors?.kind === 'along';
        };
        const list: Handle[] = [];
        if (along(selected.from)) list.push({ id: 'from', x: ends.from.point.x, y: ends.from.point.y, cursor: 'move', title: 'Drag along the edge to move where the line leaves' });
        if (along(selected.to)) list.push({ id: 'to', x: ends.to.point.x, y: ends.to.point.y, cursor: 'move', title: 'Drag along the edge to move where the line arrives' });
        return list;
      }
      const type = elementTypeOf(definition, selected);
      const banner = bannerOfElement(type, selected);
      if (!banner || !type.segments?.draggableBoundaries || selected.data.movable !== true) return [];
      return banner.dividers.map((divider) => ({
        id: String(divider.index), x: divider.x, y: selected.y + selected.height / 2, cursor: 'ew-resize', title: 'Drag to move where this segment ends',
      }));
    },

    dragHandle(selected, handle, point, context) {
      if (isRelation(selected)) {
        const element = context.elements.get(handle === 'from' ? selected.from : selected.to);
        const type = element ? elementTypeOf(definition, element) : undefined;
        const banner = type && element ? bannerOfElement(type, element) : undefined;
        if (!element || !type || !banner) return {};
        const attachment = nearestAttachment(point, element, banner);
        return {
          relation: { ...selected, data: { ...selected.data, [handle === 'from' ? 'source' : 'target']: attachment } },
          request: { kind: 'moveEnd', id: selected.id, end: handle === 'from' ? 'from' : 'to', value: attachmentText(type, attachment) },
        };
      }
      // A boundary lands on a step, at least one step from its neighbours.
      const type = elementTypeOf(definition, selected);
      const banner = bannerOfElement(type, selected);
      const segments = type.segments;
      if (!banner || !segments?.draggableBoundaries) return {};
      const index = Number(handle);
      const x = boundaryLanding(banner, selected, index, point.x, segments.draggableBoundaries.step);
      const boundaries = banner.dividers.map((divider) => (divider.index === index ? x : divider.x)).map((at) => (at - selected.x) / selected.width);
      return { element: { ...selected, data: { ...selected.data, [segments.boundaries]: boundaries } }, request: { kind: 'handle', id: selected.id, handle: index, x } };
    },

    connectFrom: (element, point) => connectFrom(elementTypeOf(definition, element), element, point),
    connectTo: (element, point) => connectTo(elementTypeOf(definition, element), element, point),
    dragging: (element, at, context) => (definition.dragging?.kind === 'tree-rows' ? treeRows(definition.dragging, element, at, context) : undefined),
    connecting: (from, fromEnd, to) => drawConnecting(definition, from, fromEnd, to),
  };
}

const notations = new Map<string, Notation>();

/** Makes a diagram type known to the library: its notation, and the icons its toolbox and menus name. */
export function registerDefinition(definition: DiagramDefinition): void {
  if (definition.icons) registerIcons(definition.icons);
  notations.set(definition.origin, notationOf(definition));
}

export function notationFor(origin: string): Notation | undefined {
  return notations.get(origin);
}
