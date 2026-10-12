import type { Scene } from '../scene/scene';

// The frame: what every tool type shares in this host, and the one contract a type implements
// (etalii.adp spec 027, contracts/tool-type.md). Everything here is data that crosses to a webview as
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
  /** The viewpoint to draw, by its name; the default one when absent. */
  readonly viewpoint?: string;
  /** The value of each filter that is not at its default, by the filter's id. */
  readonly filters?: Readonly<Record<string, { readonly value?: unknown; readonly match?: 'any' | 'all' }>>;
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

/** Every gesture a canvas, the toolbox or the property grid can ask of a diagram. */
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
  | { readonly kind: 'action'; readonly action: string; readonly id?: string; readonly x?: number; readonly y?: number }
  /** A node dragged onto another node, to become its child, at a position among its children when given. */
  | { readonly kind: 'reparent'; readonly id: string; readonly parent: string; readonly index?: number }
  /** The children of a node hidden or shown. */
  | { readonly kind: 'fold'; readonly id: string; readonly folded: boolean }
  /** A node kept where it was put, or given back to the layout. */
  | { readonly kind: 'pin'; readonly id: string; readonly pinned: boolean }
  /** The link of a node followed. */
  | { readonly kind: 'openLink'; readonly id: string };

/** One FBL splice of the body: a range of UTF-8 bytes of `Source.text` and what replaces it. */
export interface TextSplice {
  readonly offset: number;
  readonly length: number;
  readonly text: string;
}

/** What an edit request came to. */
export type EditOutcome =
  /** The splices of the gesture, and the registration's new text when the edit changed it (null removes it). */
  | { readonly kind: 'applied'; readonly splices: readonly TextSplice[]; readonly registration?: string | null; readonly select?: string; readonly editLabel?: boolean; readonly multiline?: boolean }
  /** Nothing changed, and this is the definition's sentence to show. */
  | { readonly kind: 'refused'; readonly sentence: string }
  /** Ask first; when confirmed, the same request is made again with `confirmed`. */
  | { readonly kind: 'confirm'; readonly title: string; readonly message: string; readonly confirmLabel: string; readonly danger: boolean }
  /** The request asks for text edited in place before anything is written. */
  | { readonly kind: 'editInPlace'; readonly id: string; readonly multiline: boolean }
  /** The request is answered in ADP Properties: the named field is where the user goes on. */
  | { readonly kind: 'showField'; readonly field: string }
  /** A linked file or folder is opened by the extension; nothing is written. */
  | { readonly kind: 'open'
  /** A path is asked with the platform's file and folder dialog; chosen, it is set as the named field, relative to the document. */
  | { readonly kind: 'pickPath'; readonly id: string; readonly field: string }; readonly path: string };

/** A document as a tool type reads it: its text and, where one exists, its registration's. */
export interface Source {
  readonly fileName: string;
  readonly text: string;
  readonly registration?: string;
}

/** One binding's claim, as its FBL `claims` states it. */
export interface Claim {
  /** File extensions without the dot. */
  readonly extensions: readonly string[];
  /** True when the extensions belong to other tools too. */
  readonly shared: boolean;
  /** True when the binding has a marker a file must match. */
  readonly marker: boolean;
  /** True when the binding claims the extension for its registration only. */
  readonly registrationOnly: boolean;
}

/** One tool type as the frame sees it, generic over what it shows and what a gesture asks. */
export interface ToolType<View, Request> {
  /** The tool type's origin, `<vendor>/<type>`, the same in every ADP host. */
  readonly origin: string;
  /** The tool's kind, as docs/terminology.md has it. */
  readonly kind: 'diagram' | 'designer';
  /** The one display name of the tool type. */
  readonly displayName: string;
  /** What the binding claims: one entry per binding of the definition. */
  readonly claims: readonly Claim[];
  /** Whether a file is this tool type's: extension and marker both. */
  claimed(fileName: string, text: string): boolean;
  /** Whether a file of a shared extension looks like this type, from the binding's `claims.suggest`. */
  suggests(fileName: string, text: string): boolean;
  /** Everything wrong with the document. Never throws. */
  findings(source: Source): Finding[];
  /** What to show. Never throws. */
  view(source: Source, options: ViewOptions): View;
  toolbox(source: Source): ToolboxEntry[];
  /** The rows of ADP Properties for a selection; empty when there is nothing to show. */
  fields(source: Source, selection: readonly string[]): Field[];
  /** What can be done to the selection, or to the document when it is empty. */
  actions(source: Source, selection: readonly string[]): Action[];
  /** Applies one request to the document as it is now. `confirmed` answers an earlier `confirm`. */
  edit(source: Source, request: Request, options: ViewOptions, confirmed: boolean): EditOutcome;
  /** The text of a new document, from the binding's template. */
  newDocument(name: string): string;
}

/** A diagram read from its definition. */
export type DiagramToolType = ToolType<Scene, EditRequest>;
// DesignerToolType arrives with TableView and TableRequest of src/core/tool/tableView.ts.

/** A hand-coded diagram, until the last pull request of spec 027 (User Story 4) removes the two. */
export type DiagramType = ToolType<ViewModel, EditRequest>;

/** The identifier a tool type registers under: `etalii.adp.<vendor>.<type>`. */
export function viewTypeOf(type: Pick<ToolType<unknown, unknown>, 'origin'>): string {
  return `etalii.adp.${type.origin.replace('/', '.')}`;
}
