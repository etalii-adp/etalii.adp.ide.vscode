import type { Route } from '../../core/diagram/connectors';
import type { TreeSpacing } from '../../core/diagram/layout/tree';
import type { BuiltInShape } from '../../core/diagram/shapes/outline';

// What a diagram type tells the diagram library about how it looks and what its gestures do, stated
// once as data: the shape of each element type, its labels and where relations attach to it, the
// route of each relation type, and how a drag rearranges the drawing. The library draws everything
// from this; a diagram type writes no drawing code of its own. It is this host's counterpart of the
// standalone host's `DiagramDefinition` (`canvas/library/definition/diagramDefinition.ts`), with
// the same words for the same things, sized to what the diagram types here use.

/** A piece of text an element shows. */
export interface LabelDefinition {
  /** The field of the element's data that holds the text; the element's own label when absent. */
  readonly text?: string;
  /** Inside the shape, stacked with the type's other inside labels; or before it, on its left. */
  readonly placement: 'inside' | 'before';
  readonly className?: string;
}

/** A shape cut into segments, such as a hype cycle trend cut into its phases. */
export interface SegmentsDefinition {
  /** The field of the element's data that holds how many segments are drawn. */
  readonly count: string;
  /** The field that holds the inner boundaries as fractions of the width; evenly spread when absent. */
  readonly boundaries: string;
  /** Each segment's name by its index: the class it is painted by, after `classPrefix`, and the name an attachment to it is written with. */
  readonly names: readonly string[];
  readonly classPrefix: string;
  /** The field that holds each segment's tooltip. */
  readonly tooltips?: string;
  /** Whether a selected element whose data says `movable` shows a handle on each boundary, and the step a dragged boundary lands on. */
  readonly draggableBoundaries?: { readonly step: number };
}

/**
 * Where a relation meets an element, and whether a press on it starts one.
 * - `edge`: the middle of the top or the bottom, whichever faces the other end. It draws no handle,
 *   so a relation starts with a right-button drag from anywhere on the element.
 * - `along`: anywhere along a segment of the top or bottom edge; the relation stores where. A press
 *   within `band` of either edge starts a relation.
 * - `compass`: whichever of the named points is nearest the other end; the relation stores nothing.
 *   A press near one of them starts a relation.
 */
export type AnchorDefinition =
  | { readonly kind: 'edge' }
  | { readonly kind: 'along'; readonly band: number }
  | { readonly kind: 'compass'; readonly positions: readonly ('n' | 'e' | 's' | 'w')[] };

/** One element type: its shape, its classes and its text. */
export interface ElementTypeDefinition {
  /** The element type within its diagram type, as the view names it. */
  readonly id: string;
  readonly shape: BuiltInShape;
  /** The class on the element's group, which its stylesheet paints by. */
  readonly className: string;
  /** The class on its outline. */
  readonly shapeClassName?: string;
  /** A class the element takes while a field of its data is true. */
  readonly classWhen?: readonly { readonly data: string; readonly className: string }[];
  readonly labels?: readonly LabelDefinition[];
  /** The class of the box the inside labels are stacked in. */
  readonly textClassName?: string;
  readonly segments?: SegmentsDefinition;
  readonly anchors?: AnchorDefinition;
}

/** One relation type: the route it runs along and how it ends. */
export interface RelationTypeDefinition {
  readonly id: string;
  readonly route: Route;
  readonly className?: string;
  /** Whether it can be pointed at and selected; a line that only shows a place in a tree cannot. */
  readonly selectable: boolean;
  /** A field of the relation's data that, while true, keeps it from being drawn. */
  readonly hiddenWhen?: string;
  /** Whether a selected relation shows a handle on each end that sits `along` an element, to slide it. */
  readonly movableEnds?: boolean;
}

/**
 * What a drag of an element does besides moving it. `tree-rows`: the elements form a tree, given
 * whole with the view as `chrome.tree`; the dragged one carries its subtree, its row follows it up
 * and down, and the siblings it passes step aside to where the new order would put them.
 */
export type DraggingDefinition = { readonly kind: 'tree-rows'; readonly spacing: TreeSpacing };

/** One diagram type, as the diagram library draws it. */
export interface DiagramDefinition {
  /** The tool type's origin, `<vendor>/<type>`. */
  readonly origin: string;
  /** What the canvas is called for assistive technology. */
  readonly label: string;
  readonly elementTypes: readonly ElementTypeDefinition[];
  readonly relationTypes: readonly RelationTypeDefinition[];
  readonly dragging?: DraggingDefinition;
  /** The Material Design icons the type's toolbox and menus name, by those names. */
  readonly icons?: Readonly<Record<string, string>>;
}
