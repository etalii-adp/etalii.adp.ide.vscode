// What a designer shows and what a gesture on it asks (etalii.adp spec 027, contracts/tool-type.md;
// DESL 7): the table of a document, with the view that is shown applied to it. A table view is
// plain data, as a scene is: it crosses to the webview as JSON, and holds nothing of a definition
// beyond the ids, the names and the values the document and the definition give.

import type { Editor } from '../desl/surface';

/** A value of the model as a request carries it. */
export type TableValue = string | number | boolean | null;

/** A colour for each kind of colour theme, as CSS colours. */
export interface ThemedColour {
  readonly light: string;
  readonly dark: string;
}

/** One value a choice may take. */
export interface TableOption {
  readonly id: string;
  readonly name: string;
  /** Absent for an option the surface draws as it draws any text. */
  readonly colour?: ThemedColour;
}

/** One column, as the view that is shown shows it. */
export interface TableProperty {
  readonly id: string;
  readonly name: string;
  /** The key of its value type among the definition's, or what the document holds when that is none of them. */
  readonly valueType: string;
  /** How a cell of it is edited; absent for a value type the definition does not have. */
  readonly editor?: Editor;
  /** Whether a cell holds any number of values, as items. */
  readonly many: boolean;
  /** A Material Design icon name for its value type, where the definition gives one. */
  readonly icon?: string;
  /** Whether its value names a row. */
  readonly title: boolean;
  readonly options: readonly TableOption[];
  readonly visible: boolean;
  /** In pixels at zoom 1; absent for the default width. */
  readonly width?: number;
  readonly wrap: boolean;
  /** Whether it stays in sight when the table scrolls sideways. */
  readonly frozen: boolean;
  /** What the line under the column shows of the rows in sight. */
  readonly calculation?: { readonly label: string; readonly text: string };
  /** Why its cells are shown and not edited; absent for a column that is edited. */
  readonly readOnly?: string;
}

/** One of several values of a cell. */
export interface TableItem {
  readonly id: string;
  /** What the item holds: the id of an option or of a row. */
  readonly value: string;
  readonly label: string;
  readonly colour?: ThemedColour;
}

/** A row's value for one column. */
export interface TableCell {
  /** The id of the cell's element. */
  readonly id: string;
  /** The value under the key of the column's value type; null when the cell holds none there. */
  readonly value: TableValue;
  readonly items: readonly TableItem[];
  /** The value as the cell shows it: its written form, the name of an option, the items' labels joined. */
  readonly text: string;
  readonly colour?: ThemedColour;
}

export interface TableRow {
  readonly id: string;
  /** The text of its cell of the title column. */
  readonly title: string;
  /** By the column's id. A column the row has no value for has no entry. */
  readonly cells: Readonly<Record<string, TableCell>>;
}

/** The rows that share a value of the column a view is grouped by. */
export interface TableGroup {
  readonly key: string;
  readonly label: string;
  readonly colour?: ThemedColour;
  readonly collapsed: boolean;
  /** The ids of its rows, in the order of the view. */
  readonly rows: readonly string[];
}

export interface TableTab {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

/** An element of the view that is shown that stores one of its settings: what the operations for its type are for. */
export interface TableSetting {
  readonly id: string;
  /** Its role as the surface names it: `columns`, `sorts`, `conditions`, `filterGroups` or `groups`. */
  readonly role: string;
  readonly label: string;
  /** How deep it lies in the view: 0 for a setting of the view itself. */
  readonly depth: number;
}

/** One parameter of an operation, as the control that asks it. */
export interface TableParam {
  readonly name: string;
  readonly label: string;
  readonly control: 'text' | 'multiline' | 'number' | 'checkbox' | 'date' | 'dateTime' | 'time' | 'choice';
  readonly required: boolean;
  /** The value it starts with: its default. */
  readonly value?: TableValue;
  /** The values of a choice: those of an enumeration, or the elements of a type of the document. */
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

/** An operation of the definition, as a gesture asks its arguments. Which are offered now is in the frame's actions, by the same id. */
export interface TableOperation {
  readonly id: string;
  readonly label: string;
  readonly params: readonly TableParam[];
}

/** What a table surface draws. */
export interface TableView {
  /** The name of the document. */
  readonly name: string;
  /** Every column, in the order of the view that is shown; one it hides has `visible` false. */
  readonly properties: readonly TableProperty[];
  /** The rows in sight, in the order of the view that is shown. */
  readonly rows: readonly TableRow[];
  /** How many rows the document has, in sight or not. */
  readonly total: number;
  /** The groups of the view that is shown, in its order, when it groups its rows. */
  readonly groups?: readonly TableGroup[];
  readonly views: readonly TableTab[];
  readonly settings: readonly TableSetting[];
  /** Every operation of the definition, by its id. */
  readonly operations: Readonly<Record<string, TableOperation>>;
  /** True when nothing that edits may be offered. */
  readonly readOnly: boolean;
  /** Why the table is read-only or empty, when there is something to say. */
  readonly notice?: string;
}

/** Every gesture a table surface or the property grid can ask of a designer. */
export type TableRequest =
  /** An operation of the definition run on what is selected, or on the document when nothing is, with its arguments. */
  | { readonly kind: 'operation'; readonly operation: string; readonly on?: readonly string[]; readonly args?: Readonly<Record<string, TableValue>> }
  /** A cell edited in place: the value of a row for a column, or null to empty it. */
  | { readonly kind: 'cell'; readonly row: string; readonly property: string; readonly value: TableValue }
  /** One of several values of a cell added or taken away. */
  | { readonly kind: 'item'; readonly row: string; readonly property: string; readonly value: string; readonly present: boolean }
  /** Another view shown. */
  | { readonly kind: 'show'; readonly view: string }
  /** A property of a row edited in ADP Properties. */
  | { readonly kind: 'setField'; readonly id: string; readonly field: string; readonly value: string };
