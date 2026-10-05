import type { EditRequest, ViewElement, ViewModel, ViewRelation } from '../../core/frame/diagramType';

/** What a notation is given to draw one thing: the whole view, and the elements by id. */
export interface DrawContext {
  readonly view: ViewModel;
  readonly elements: ReadonlyMap<string, ViewElement>;
}

/** A point in canvas units. */
export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

/** Something a selection shows that can be dragged, such as a phase boundary or an end of a relation. */
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
 * One diagram type's notation: how each element and relation of its view model is drawn, and what
 * its own handles do. A notation is a set of pure functions over the view model; the canvas does
 * everything else.
 */
export interface Notation {
  /** The diagram type's origin. */
  readonly origin: string;
  /** What the canvas is called for assistive technology. */
  readonly label: string;
  element(element: ViewElement, context: DrawContext): SVGGElement;
  /** A relation, or nothing when it is not drawn. */
  relation(relation: ViewRelation, context: DrawContext): SVGGElement | undefined;
  /** The handles a selected element or relation shows. */
  handles?(selected: ViewElement | ViewRelation, context: DrawContext): Handle[];
  dragHandle?(selected: ViewElement | ViewRelation, handle: string, point: CanvasPoint, context: DrawContext): HandleDrag;
  /**
   * Whether a press at this point of an element starts drawing a relation rather than moving the
   * element. The text says where on the element the relation leaves, empty when the type has no
   * such thing; undefined means the press does not start a relation.
   */
  connectFrom?(element: ViewElement, point: CanvasPoint): string | undefined;
  /** Where on an element a relation dropped at this point arrives, when the type has such a thing. */
  connectTo?(element: ViewElement, point: CanvasPoint): string | undefined;
  /** The line shown while a relation is being drawn from an element to a point. */
  connecting?(from: ViewElement, fromEnd: string, to: CanvasPoint, context: DrawContext): SVGElement;
}

export function isRelation(selected: ViewElement | ViewRelation): selected is ViewRelation {
  return 'from' in selected;
}

const notations = new Map<string, Notation>();

export function registerNotation(notation: Notation): void {
  notations.set(notation.origin, notation);
}

export function notationFor(origin: string): Notation | undefined {
  return notations.get(origin);
}
