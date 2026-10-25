import type { Action, Field, ToolboxEntry, ViewOptions } from './toolType';

// The messages between the extension and its webviews (etalii.adp spec 027, contracts/tool-type.md).
// The canvas never changes the model itself: it sends a request and draws the view that follows.

export const protocolVersion = 2;

/** What change of the document a view follows: an edit of this editor's own, or one made anywhere else. */
export type ViewCause = 'edit' | 'outside';

export type ToCanvas =
  /**
   * What to show, and the version of the document it was computed from. The view is the tool type's
   * own: a `Scene`, a `TableView` or a `HierarchyView`. `cause` says what change of the document it
   * follows: `edit` an edit this editor made, `outside` any other (another editor or the text, the
   * disk, an undo or a redo); absent when it follows none, as when it was opened or its options or
   * selection changed.
   */
  | {
    readonly v: 2; readonly type: 'view'; readonly origin: string; readonly kind: 'diagram' | 'designer'; readonly view: unknown; readonly actions: readonly Action[]; readonly version: number;
    readonly cause?: ViewCause;
  }
  /** The answer to an edit request. */
  | { readonly v: 2; readonly type: 'outcome'; readonly seq: number; readonly result: 'applied' | 'refused' | 'cancelled'; readonly sentence?: string }
  /**
   * An edit asks first, in the definition's words. Sent to a page that asks in its own place (a page
   * of boxes), which answers with `confirmed`; the outcome of the edit follows under the same `seq`.
   */
  | { readonly v: 2; readonly type: 'confirm'; readonly seq: number; readonly title: string; readonly message: string; readonly confirmLabel: string; readonly danger: boolean }
  /** Select an element and bring it into view; with `editLabel`, open its text for editing in place. */
  | { readonly v: 2; readonly type: 'reveal'; readonly id: string; readonly editLabel?: boolean; readonly multiline?: boolean }
  /** A command invoked from the Command Palette or a shortcut, for the canvas to carry out on its selection. */
  | { readonly v: 2; readonly type: 'command'; readonly command: string }
  /** An ADP Toolbox entry activated in its view: added at the centre of what the canvas shows. */
  | { readonly v: 2; readonly type: 'addAtCentre'; readonly entry: string };

export type FromCanvas =
  | { readonly v: 2; readonly type: 'ready' }
  | { readonly v: 2; readonly type: 'viewOptions'; readonly options: ViewOptions }
  | { readonly v: 2; readonly type: 'selection'; readonly ids: readonly string[] }
  /** Text is being edited in place, or no longer is, so shortcuts such as Delete are the text box's. */
  | { readonly v: 2; readonly type: 'editing'; readonly active: boolean }
  /** An edit, with the document version the gesture began on. The request is the tool type's own. */
  | { readonly v: 2; readonly type: 'edit'; readonly seq: number; readonly request: unknown; readonly version: number }
  /** The answer to `confirm`: the edit of that `seq` is made, or cancelled. */
  | { readonly v: 2; readonly type: 'confirmed'; readonly seq: number; readonly confirmed: boolean };

export type ToProperties =
  /** The rows for the active diagram's selection, or a sentence when there is nothing to show. */
  | { readonly v: 2; readonly type: 'fields'; readonly fields: readonly Field[]; readonly target?: string; readonly empty?: string }
  | { readonly v: 2; readonly type: 'fieldOutcome'; readonly field: string; readonly refused?: string };

export type FromProperties =
  | { readonly v: 2; readonly type: 'ready' }
  | { readonly v: 2; readonly type: 'setField'; readonly target: string; readonly field: string; readonly value: string };
export type ToToolbox =
  /** The entries of the active diagram's type, or a sentence when there is nothing to add to. */
  | { readonly v: 2; readonly type: 'entries'; readonly entries: readonly ToolboxEntry[]; readonly empty?: string };

export type FromToolbox =
  | { readonly v: 2; readonly type: 'ready' }
  /** An entry activated with a click, Enter or Space. */
  | { readonly v: 2; readonly type: 'add'; readonly entry: string };
