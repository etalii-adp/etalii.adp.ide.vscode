import type { ViewElement, ViewModel, ViewRelation } from '../../core/frame/diagramType';

/** What a notation is given to draw one thing: the whole view, and the elements by id. */
export interface DrawContext {
  readonly view: ViewModel;
  readonly elements: ReadonlyMap<string, ViewElement>;
}

/**
 * One diagram type's notation: how each element and relation of its view model is drawn. A notation
 * is a set of pure functions from the view model to SVG; the canvas does everything else.
 */
export interface Notation {
  /** The diagram type's origin. */
  readonly origin: string;
  /** What the canvas is called for assistive technology. */
  readonly label: string;
  element(element: ViewElement, context: DrawContext): SVGGElement;
  /** A relation, or nothing when it is not drawn. */
  relation(relation: ViewRelation, context: DrawContext): SVGGElement | undefined;
}

const notations = new Map<string, Notation>();

export function registerNotation(notation: Notation): void {
  notations.set(notation.origin, notation);
}

export function notationFor(origin: string): Notation | undefined {
  return notations.get(origin);
}