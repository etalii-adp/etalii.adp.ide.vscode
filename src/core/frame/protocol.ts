import type { Action, EditRequest, Field, ToolboxEntry, ViewModel, ViewOptions } from './diagramType';

// The messages between the extension and its webviews (etalii.adp spec 006, contracts/frame.md).
// The canvas never changes the model itself: it sends a request and draws the view that follows.

export const protocolVersion = 1;

export type ToCanvas =
  /** What to draw, and the version of the document it was computed from. */
  | {
    readonly v: 1; readonly type: 'view'; readonly origin: string; readonly view: ViewModel; readonly toolbox: readonly ToolboxEntry[];
    readonly actions: readonly Action[]; readonly version: number;
  }
  /** The answer to an edit request. */
  | { readonly v: 1; readonly type: 'outcome'; readonly seq: number; readonly result: 'applied' | 'refused' | 'cancelled'; readonly sentence?: string }
  /** Select an element and bring it into view; with `editLabel`, open its text for editing in place. */
  | { readonly v: 1; readonly type: 'reveal'; readonly id: string; readonly editLabel?: boolean; readonly multiline?: boolean }
  /** A command invoked from the Command Palette or a shortcut, for the canvas to carry out on its selection. */
  | { readonly v: 1; readonly type: 'command'; readonly command: string };

export type FromCanvas =
  | { readonly v: 1; readonly type: 'ready' }
  | { readonly v: 1; readonly type: 'viewOptions'; readonly options: ViewOptions }
  | { readonly v: 1; readonly type: 'selection'; readonly ids: readonly string[] }
  /** An edit, with the document version the gesture began on. */
  | { readonly v: 1; readonly type: 'edit'; readonly seq: number; readonly request: EditRequest; readonly version: number };

export type ToProperties =
  /** The rows for the active diagram's selection, or a sentence when there is nothing to show. */
  | { readonly v: 1; readonly type: 'fields'; readonly fields: readonly Field[]; readonly target?: string; readonly empty?: string }
  | { readonly v: 1; readonly type: 'fieldOutcome'; readonly field: string; readonly refused?: string };

export type FromProperties =
  | { readonly v: 1; readonly type: 'ready' }
  | { readonly v: 1; readonly type: 'setField'; readonly target: string; readonly field: string; readonly value: string };