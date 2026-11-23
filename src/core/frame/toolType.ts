import type { Scene } from '../scene/scene';
import type { HierarchyRequest, HierarchyView } from '../tool/hierarchyView';
import type { TableRequest, TableView } from '../tool/tableView';

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

/** Per open editor, never saved. A tool type reads the options it knows and ignores the rest. */
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
  /** The nodes this viewer folded (true) or unfolded (false), by id; a node not named is as the definition says. */
  readonly collapsed?: Readonly<Record<string, boolean>>;
  /**
   * Where the centre of each node was on screen before the document last changed, by id: a layout
   * that runs on every change starts from there, so what the change does not touch moves little.
   */
  readonly placed?: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
  /** The words of the filter a viewer applied to a page of boxes, as typed; nothing is written for them (DESL 7.7.3). */
  readonly query?: string;
  /** The level a viewer narrowed a page of boxes to, by id. */
  readonly focus?: string;
}

export interface ToolboxEntry {
  readonly id: string;
  readonly label: string;
  /** A Material Design icon name, as the definition gives it. */
  readonly icon: string;
  readonly description: string;
}

export type Control = 'text' | 'multiline' | 'number' | 'choice' | 'slider' | 'tags' | 'toggle';

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
  | { readonly kind: 'drop'; readonly entry: string; readonly x: number; readonly y: number; readonly params?: Readonly<Record<string, string>>; readonly check?: boolean }
  /** An element dropped with its top-left at a point. */
  | { readonly kind: 'move'; readonly id: string; readonly x: number; readonly y: number }
  /** An element resized by one of its sides to new bounds. */
  | { readonly kind: 'resize'; readonly id: string; readonly side: 'left' | 'right' | 'top' | 'bottom' | 'corner'; readonly bounds: Box }
  /**
   * A relation drawn from one element to another; the ends say where on each, when the type has that. `fromAnchor` is the
   * anchor the line was drawn out of, which decides its direction where the edge type's `connect.from` maps it (DISL 6.10).
   * A line let go over no element names the point it was let go at as `toPoint`, and `to` is empty.
   */
  | { readonly kind: 'connect'; readonly from: string; readonly to: string; readonly fromEnd?: string; readonly toEnd?: string; readonly fromAnchor?: string; readonly toPoint?: { readonly x: number; readonly y: number } }
  /** One end of a relation moved along its element. */
  | { readonly kind: 'moveEnd'; readonly id: string; readonly end: 'from' | 'to'; readonly value: string }
  /** A shape handle dragged, such as a phase boundary, to an x. */
  | { readonly kind: 'handle'; readonly id: string; readonly handle: number; readonly x: number }
  /** Text edited in place. */
  | { readonly kind: 'rename'; readonly id: string; readonly text: string }
  /** A property edited in ADP Properties. */
  | { readonly kind: 'setField'; readonly id: string; readonly field: string; readonly value: string }
  /**
   * An action invoked on an element or relation, or on the diagram when there is no id. `params`
   * answers the form an `ask` showed, by parameter; with `check`, they are only validated: the
   * outcome is the refusal of the first that is not accepted, else an applied outcome of no splice.
   */
  | { readonly kind: 'action'; readonly action: string; readonly id?: string; readonly x?: number; readonly y?: number; readonly params?: Readonly<Record<string, string>>; readonly check?: boolean }
  /** A node dragged onto another node, to become its child, at a position among its children when given. */
  | { readonly kind: 'reparent'; readonly id: string; readonly parent: string; readonly index?: number }
  /** The children of a node hidden or shown; with `group`, the items of one group of the node's, by the group's key. */
  | { readonly kind: 'fold'; readonly id: string; readonly folded: boolean; readonly group?: string }
  /** A node kept where it was put, or given back to the layout. */
  | { readonly kind: 'pin'; readonly id: string; readonly pinned: boolean }
  /** The link of a node followed; with `compartment` and `item`, the link of that item of the node's compartment, counted among its items as they are drawn. */
  | { readonly kind: 'openLink'; readonly id: string; readonly compartment?: string; readonly item?: number }
  /** A filter of the canvas that is kept with the diagram set to a value. */
  | { readonly kind: 'filter'; readonly id: string; readonly value: unknown };

/** One FBL splice of the body: a range of UTF-8 bytes of `Source.text` and what replaces it. */
export interface TextSplice {
  readonly offset: number;
  readonly length: number;
  readonly text: string;
}

/** One value an `ask` asks for: the parameter it answers, its label and the value it starts from. */
export interface AskedField {
  readonly param: string;
  readonly label: string;
  readonly initial: string;
}

/** What an edit request came to. */
export type EditOutcome =
  /** The splices of the gesture, and the registration's new text when the edit changed it (null removes it). */
  | {
    readonly kind: 'applied'; readonly splices: readonly TextSplice[]; readonly viewOptions?: ViewOptions; readonly registration?: string | null; readonly select?: string; readonly editLabel?: boolean; readonly multiline?: boolean;
    /** The splices of other files the step changes as well, each by the name the document gives it in `Source.related`: written with the document's, or none is. */
    readonly others?: readonly { readonly file: string; readonly splices: readonly TextSplice[] }[];
    /** False when the edit changes only what the registration keeps outside the history (FBL 0.7 7.1): it is written at once and is no undo step. */
    readonly history?: false;
  }
  /** Nothing changed, and this is the definition's sentence to show. */
  | { readonly kind: 'refused'; readonly sentence: string }
  /** Ask first; when confirmed, the same request is made again with `confirmed`. */
  | { readonly kind: 'confirm'; readonly title: string; readonly message: string; readonly confirmLabel: string; readonly danger: boolean }
  /** The request (an action, or a drop that runs one) asks for values first, in the form of its operation: answered, the same request is made again with `params`. */
  | { readonly kind: 'ask'; readonly title: string; readonly icon?: string; readonly confirmLabel: string; readonly fields: readonly AskedField[] }
  /** The request asks for text edited in place before anything is written. */
  | { readonly kind: 'editInPlace'; readonly id: string; readonly multiline: boolean }
  /** The request is answered in ADP Properties: the named field is where the user goes on. */
  | { readonly kind: 'showField'; readonly field: string }
  /** A linked file or folder is opened by the extension; nothing is written. */
  | {
    readonly kind: 'open'; readonly path: string;
    /** The element to select once the file is open in this tool type, which then opens it rather than its default editor. */
    readonly select?: string;
  }
  /** A path is asked with the platform's file and folder dialog; chosen, it is set as the named field, relative to the document. */
  | { readonly kind: 'pickPath'; readonly id: string; readonly field: string }
  /** The named export of the tool type is asked for: the extension has it written beside the document (`ToolType.exported`); nothing of the document changes. */
  | { readonly kind: 'export'; readonly export: string };

/** What a tool type exports of a document, as its menu offers it. */
export interface ExportOffer {
  readonly id: string;
  readonly label: string;
}

/** A file an export writes beside the document: its name and its text. */
export interface Exported {
  readonly name: string;
  readonly text: string;
}

/** The action of the menu that asks for an export: `export:<id>`. */
export const exportAction = (id: string): string => `export:${id}`;
/** The export an action asks for; nothing for any other action. */
export const exportOf = (action: string): string | undefined => (action.startsWith('export:') ? action.slice('export:'.length) : undefined);

/** A document as a tool type reads it: its text and, where one exists, its registration's. */
export interface Source {
  readonly fileName: string;
  readonly text: string;
  readonly registration?: string;
  /**
   * The files the document names that its tool type reads as well, by the name the document gives
   * each (`ToolType.related`): their text, or null for one that cannot be read. One not given is read
   * as one that cannot be.
   */
  readonly related?: Readonly<Record<string, RelatedFile | null>>;
  /** The other documents of the same tool type the host knows of, each as this document would name it. */
  readonly peers?: readonly string[];
}

/** A file a document names, as the host found it: open in an editor, unsaved changes and all, or on disk. */
export interface RelatedFile {
  readonly fileName: string;
  readonly text: string;
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
  /** The page that shows a document: a canvas for a diagram, a table or a page of boxes for a designer (DESL 7). */
  readonly page: 'canvas' | 'table' | 'hierarchy';
  /** The one display name of the tool type. */
  readonly displayName: string;
  /** What the binding claims: one entry per binding of the definition. */
  readonly claims: readonly Claim[];
  /** Whether a file is this tool type's: extension and marker both. */
  claimed(fileName: string, text: string): boolean;
  /** The other files the document names whose text it needs, as it names them: given back in `Source.related`. */
  related?(source: Source): readonly string[];
  /**
   * The splices that keep the names of other files a document writes true when files move: `moved`
   * gives a name's new form, undefined for one that stays. Empty when nothing changes, undefined
   * when the document cannot be read.
   */
  retargeted?(source: Source, moved: (file: string) => string | undefined): readonly TextSplice[] | undefined;
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
  actions(source: Source, selection: readonly string[], options?: ViewOptions): Action[];
  /** Applies one request to the document as it is now. `confirmed` answers an earlier `confirm`. */
  edit(source: Source, request: Request, options: ViewOptions, confirmed: boolean): EditOutcome;
  /** The text of a new document, from the binding's template. */
  newDocument(name: string): string;
  /** What the tool type exports of a document; none when absent. */
  readonly exports?: readonly ExportOffer[];
  /** The file an export writes of the document as the canvas shows it with these options, at a moment of local time; nothing for an export the type does not have. */
  exported?(source: Source, id: string, options: ViewOptions, moment: Date): Exported | undefined;
  /**
   * The registration an undo or a redo gives back (FBL 0.7 7.1): `snapshot`, the text the step
   * restores, with the entries of the blocks the binding keeps outside the history taken from
   * `current`, the text it has now, since a write outside the history is no step and is carried
   * over every step. Undefined is no file. A tool type without such blocks gives `snapshot` back.
   */
  restoreRegistration(snapshot: string | undefined, current: string | undefined): string | undefined;
}

/** A diagram read from its definition. */
export type DiagramToolType = ToolType<Scene, EditRequest>;
/** A designer read from its definition. */
export type DesignerToolType = ToolType<TableView | HierarchyView, TableRequest | HierarchyRequest>;

/** The identifier a tool type registers under: `etalii.adp.<vendor>.<type>`. */
export function viewTypeOf(type: Pick<ToolType<unknown, unknown>, 'origin'>): string {
  return `etalii.adp.${type.origin.replace('/', '.')}`;
}
