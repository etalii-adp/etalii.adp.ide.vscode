// The frame: what every diagram type shares in this host, and the one contract a type implements
// (etalii.adp spec 006, contracts/frame.md). Everything here is data that crosses to a webview as
// JSON, so nothing in it is a class or a function except the contract itself.

/** How a finding is rated; the definitions' own four severities. */
export type Severity = 'error' | 'warning' | 'information' | 'hint';

/** The result of evaluating a rule or of reading a document, located by its zero-based line. */
export interface Finding {
  readonly rule: string;
  readonly severity: Severity;
  readonly message: string;
  readonly line: number;
}

/** A rectangle in canvas units. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One drawn element: its top-left, its size and what its type's notation needs to draw it. */
export interface ViewElement extends Box {
  readonly id: string;
  /** The element type within its diagram type, such as `trend`. */
  readonly type: string;
  /** The text an in-place edit opens with. */
  readonly label: string;
  readonly tooltip?: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/** One drawn relation between two elements. */
export interface ViewRelation {
  readonly id: string;
  readonly type: string;
  readonly from: string;
  readonly to: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/** What a canvas draws: the elements, the relations and whatever its type shows around them. */
export interface ViewModel {
  readonly elements: readonly ViewElement[];
  readonly relations: readonly ViewRelation[];
  /** True when nothing that edits may be offered. */
  readonly readOnly: boolean;
  /** Why the diagram is read-only or empty, when there is something to say. */
  readonly notice?: string;
  /** What the type's notation shows around the drawing: a ruler, a filter, a legend. */
  readonly chrome: Readonly<Record<string, unknown>>;
}

/** Per open editor, never saved. A diagram type reads the options it knows and ignores the rest. */
export interface ViewOptions {
  /** The part of the canvas in view; absent means everything. */
  readonly viewport?: Box;
  readonly filterTags?: readonly string[];
  readonly filterMode?: 'any' | 'all';
  readonly compact?: boolean;
}

export interface ToolboxEntry {
  readonly id: string;
  readonly label: string;
  /** A Material Design icon name, as the definition gives it. */
  readonly icon: string;
  readonly description: string;
}

export type Control = 'text' | 'multiline' | 'number' | 'choice' | 'slider' | 'tags';

/** One row of ADP Properties. */
export interface Field {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly control: Control;
  readonly value: string;
  /** The candidates of a choice or a slider, in order, or the suggestions of a tags field. */
  readonly options?: readonly string[];
  /** Why the field is shown and not edited; absent for an editable field. */
  readonly readOnly?: string;
}

/** Something that can be done to the selection or, with no selection, to the diagram. */
export interface Action {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly shortcut?: string;
  readonly enabled: boolean;
  /** Why it is not enabled. */
  readonly disabledReason?: string;
}

/** Every gesture a canvas, the toolbox or the property grid can ask of a diagram type. */
export type EditRequest =
  /** A toolbox entry dropped at a point. */
  | { readonly kind: 'drop'; readonly entry: string; readonly x: number; readonly y: number }
  /** An element dropped with its top-left at a point. */
  | { readonly kind: 'move'; readonly id: string; readonly x: number; readonly y: number }
  /** An element resized by one of its sides to new bounds. */
  | { readonly kind: 'resize'; readonly id: string; readonly side: 'left' | 'right' | 'top' | 'bottom' | 'corner'; readonly bounds: Box }
  /** A relation drawn from one element to another; the ends say where on each, when the type has that. */
  | { readonly kind: 'connect'; readonly from: string; readonly to: string; readonly fromEnd?: string; readonly toEnd?: string }
  /** One end of a relation moved along its element. */
  | { readonly kind: 'moveEnd'; readonly id: string; readonly end: 'from' | 'to'; readonly value: string }
  /** A shape handle dragged, such as a phase boundary, to an x. */
  | { readonly kind: 'handle'; readonly id: string; readonly handle: number; readonly x: number }
  /** Text edited in place. */
  | { readonly kind: 'rename'; readonly id: string; readonly text: string }
  /** A property edited in ADP Properties. */
  | { readonly kind: 'setField'; readonly id: string; readonly field: string; readonly value: string }
  /** An action invoked on an element or relation, or on the diagram when there is no id. */
  | { readonly kind: 'action'; readonly action: string; readonly id?: string };

/** What an edit request came to. */
export type EditOutcome =
  /** The document's new text, and the registration's when the edit changed it (null removes it). */
  | { readonly kind: 'applied'; readonly text: string; readonly registration?: string | null; readonly select?: string; readonly editLabel?: boolean }
  /** Nothing changed, and this is the sentence to show. */
  | { readonly kind: 'refused'; readonly sentence: string }
  /** Ask first; when confirmed, the same request is made again with `confirmed`. */
  | { readonly kind: 'confirm'; readonly title: string; readonly message: string; readonly confirmLabel: string; readonly danger: boolean }
  /** The request asks for text edited in place before anything is written. */
  | { readonly kind: 'editInPlace'; readonly id: string; readonly multiline: boolean };

/** A document as a diagram type reads it: its text and, where one exists, its registration's. */
export interface Source {
  readonly text: string;
  readonly registration?: string;
}

/**
 * One diagram type as the frame sees it. A type is listed once in the extension's list of diagram
 * types and supplies nothing else to it; what it draws is its notation in the webview.
 */
export interface DiagramType {
  /** The tool type's origin, `<vendor>/<type>`, the same in every ADP host. */
  readonly origin: string;
  /** The one display name of the tool type. */
  readonly displayName: string;
  /** File extensions without the dot. */
  readonly extensions: readonly string[];
  /** True when the extension belongs to other tools too, so a file is this type only by choice. */
  readonly shared: boolean;
  /** Whether a file of a shared extension looks like this type, so opening it as one is offered. */
  suggests(text: string): boolean;
  /** Everything wrong with the document. Never throws. */
  findings(source: Source): Finding[];
  /** What to draw. Never throws. */
  view(source: Source, options: ViewOptions): ViewModel;
  toolbox(source: Source): ToolboxEntry[];
  /** The rows of ADP Properties for a selection; empty when there is nothing to show. */
  fields(source: Source, selection: readonly string[]): Field[];
  /** What can be done to the selection, or to the diagram when it is empty. */
  actions(source: Source, selection: readonly string[]): Action[];
  /** Applies one request to the document as it is now. `confirmed` answers an earlier `confirm`. */
  edit(source: Source, request: EditRequest, options: ViewOptions, confirmed: boolean): EditOutcome;
  /** The text of a new document. */
  newDocument(name: string): string;
}

/** The identifier a diagram type registers under: `etalii.adp.<vendor>.<type>`. */
export function viewTypeOf(type: Pick<DiagramType, 'origin'>): string {
  return `etalii.adp.${type.origin.replace('/', '.')}`;
}