// What a designer shows and what a gesture on it asks (etalii.adp spec 027, contracts/tool-type.md;
// DESL 7): the table of a document, with the view that is shown applied to it. A table view is
// plain data, as a scene is: it crosses to the webview as JSON, and holds nothing of a definition
// beyond the ids, the names and the values the document and the definition give.

import type { DesignerOperation, Parameter } from '../desl/operations';
import type { Editor, TableSurface, ValueType } from '../desl/surface';
import { attributesOf, defaultOf, valueKind, type Metamodel } from '../disl/metamodel';
import type { Change } from '../disl/behavior';
import type { Model, ModelElement, Value } from '../disl/model';
import type { Severity } from '../frame/toolType';
import { isCel, localized } from '../disl/specification';

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
  readonly summary?: { readonly label: string; readonly text: string };
  /** Why its cells are shown and not edited; absent for a column that is edited. */
  readonly readOnly?: string;
  /** For a column whose values name rows: the rows a cell may name, by title, when their file can be read. */
  readonly related?: readonly TableOption[];
  /** Whether a cell names one row at most, so that choosing another replaces it. */
  readonly single?: boolean;
}

/** One of several values of a cell. */
export interface TableItem {
  readonly id: string;
  /** What the item holds: the id of an option or of a row. */
  readonly value: string;
  readonly label: string;
  readonly colour?: ThemedColour;
  /** For a row it names: where that row lives, its file as the column names it (`.` for this one) and its id. */
  readonly link?: { readonly file: string; readonly row: string };
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
  /** The findings about the cell or a value in it. */
  readonly findings?: readonly TableFinding[];
}

/** A finding as a cell or a row shows it: how grave it is, and its sentence. */
export interface TableFinding {
  readonly severity: Severity;
  readonly message: string;
}

export interface TableRow {
  readonly id: string;
  /** The text of its cell of the title column. */
  readonly title: string;
  /** By the column's id. A column the row has no value for has no entry. */
  readonly cells: Readonly<Record<string, TableCell>>;
  /** The findings about the row itself rather than one of its cells. */
  readonly findings?: readonly TableFinding[];
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

/**
 * An entry of a menu the table surface draws (a column's, a view tab's, a row's) or of a control
 * of it (the `+` after the tabs and after the headers, a `+ New` line): what it is called and the
 * request it makes. An operation whose parameters the request does not give all of is asked in a
 * form, with the given ones left out. An entry with `entries` opens them instead.
 */
export interface TableEntry {
  readonly id: string;
  readonly label: string;
  /** A Material Design icon name. */
  readonly icon?: string;
  /** Why it cannot be done now; absent for an entry that can. */
  readonly disabled?: string;
  readonly request?: TableRequest;
  readonly entries?: readonly TableEntry[];
  /** Its label when it acts on several rows, `{count}` standing for how many. */
  readonly plural?: string;
  /** For an entry that is a state: whether it is on (a tick, an eye, the choice made). */
  readonly checked?: boolean;
  readonly colour?: ThemedColour;
  /** A panel of the surface the entry opens instead of making a request. */
  readonly opens?: TablePanel;
  /** Its request's `$typed` is a new name, typed in place of the name of what the menu was opened on. */
  readonly inPlace?: boolean;
}

/** A panel the table surface opens under its bar or over a column. */
export type TablePanel =
  | { readonly panel: 'visibility' | 'filter' | 'sort' | 'group' }
  | { readonly panel: 'options'; readonly property: string };

/**
 * A value a request leaves to be typed or picked: the surface puts what was given in its place,
 * as the kind of value of `TableField.control`.
 */
export const TYPED = '$typed';

/** A value the surface asks in place: what it holds now, how it is edited, and the request that sets it, with `$typed` for the value. */
export interface TableField {
  readonly control: 'text' | 'number' | 'date' | 'dateTime' | 'time' | 'choice' | 'none';
  readonly value: string;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  readonly request?: TableRequest;
}

/** A condition of a filter, as its editor shows it. */
export interface TableCondition {
  readonly id: string;
  /** Each property it may compare, the one it compares checked; another replaces the condition by one on that property. */
  readonly properties: readonly TableEntry[];
  readonly operators: readonly TableEntry[];
  readonly value: TableField;
  readonly remove: TableRequest;
}

/** A filter, or a group of conditions in it: all or any of them, its conditions and the groups in it. */
export interface TableFilter {
  readonly id: string;
  readonly match: readonly TableEntry[];
  readonly conditions: readonly TableCondition[];
  readonly groups: readonly TableFilter[];
  /** A condition on each property, to add. */
  readonly add: readonly TableEntry[];
  readonly addGroup?: TableEntry;
  readonly remove?: TableRequest;
}

/** A sort of the view, as its editor shows it. */
export interface TableSortLine {
  readonly id: string;
  readonly label: string;
  readonly direction: readonly TableEntry[];
  readonly remove: TableRequest;
  /** Moves it to the top, and after each other sort, by that sort's id. */
  readonly moves?: Readonly<Record<string, TableRequest>>;
}

/** The four editors of the settings control. */
export interface TableSettings {
  /** One tick per property: shown or hidden in the view. */
  readonly visibility: readonly TableEntry[];
  readonly filter: TableFilter;
  readonly sortLines: readonly TableSortLine[];
  readonly addSort: readonly TableEntry[];
  readonly group: {
    /** None and each property a view can be grouped by, the one it is grouped by checked. */
    readonly by: readonly TableEntry[];
    readonly hideEmpty?: TableEntry;
    /** The groups in their order by name, each way. */
    readonly order?: readonly TableEntry[];
    /** Every group, hidden ones too: checked for one that is shown. */
    readonly groups?: readonly TableEntry[];
    readonly showAll?: TableEntry;
    /** Moves a group to the top, and after each other group, by that group's key. */
    readonly moves?: Readonly<Record<string, Readonly<Record<string, TableRequest>>>>;
  };
}

/** The options of a property, as its options panel edits them. */
export interface TableOptionsPanel {
  readonly options: readonly {
    readonly id: string;
    readonly name: string;
    readonly colour?: ThemedColour;
    readonly rename: TableRequest;
    readonly colours: readonly TableEntry[];
    readonly remove: TableRequest;
    /** Moves it to the top, and after each other option, by that option's id. */
    readonly moves?: Readonly<Record<string, TableRequest>>;
  }[];
  readonly add: TableRequest;
}

/** A menu: its entries in groups, a line between two groups. */
export type TableMenu = readonly (readonly TableEntry[])[];

/** A sort or a filter of the view that is shown, as the bar says it: in words, with what removes it. */
export interface TableBarItem {
  readonly id: string;
  readonly kind: 'sort' | 'filter';
  readonly text: string;
  /** For a sort: whether it is descending. */
  readonly descending?: boolean;
  readonly remove?: TableRequest;
  /** The editor pressing it opens. */
  readonly opens?: TablePanel;
}

/**
 * What a tool type offers on its table, beside what the view shows: the gestures of the surface,
 * each as the request of its definition that carries it out. A tool type without them offers what
 * its definition's operations offer for what is selected.
 */
export interface TableGestures {
  /** The `+` after the view tabs. */
  readonly newView?: TableRequest;
  /** The menu of each view tab, by the view's id. */
  readonly viewMenus?: Readonly<Record<string, TableMenu>>;
  /** The `+` after the last header: one entry per type a new property may have; the name typed is given as `name`. */
  readonly newProperty?: readonly TableEntry[];
  /** The menu of each column, by the property's id. */
  readonly columnMenus?: Readonly<Record<string, TableMenu>>;
  /** The menu of a row, or of several selected rows; `$selection` stands for the rows selected. */
  readonly rowMenu?: TableMenu;
  /** The `+ New` line under the rows, and under each group by its key. */
  readonly newRow?: TableRequest;
  readonly newRowIn?: Readonly<Record<string, TableRequest>>;
  /** The sorts and filters of the view, in words. */
  readonly items?: readonly TableBarItem[];
  /** The editors of the settings control. */
  readonly settings?: TableSettings;
  /** The options panel of each property with options, by its id. */
  readonly options?: Readonly<Record<string, TableOptionsPanel>>;
  /** What the calculation line offers under each column, by the property's id. */
  readonly calculations?: Readonly<Record<string, TableMenu>>;
  /** The controls of each group heading, by the group's key. */
  readonly groupHeads?: Readonly<Record<string, TableGroupHead>>;
  /**
   * What the bar of selected rows sets for all of them, by property: one request per row, `$row`
   * standing for each and `$typed` for the value; and what deletes them.
   */
  readonly bulk?: { readonly set: Readonly<Record<string, TableField>>; readonly remove: TableEntry };
  /** A new option made and chosen in a cell's list, by property: `$row` the row, `$typed` the name. */
  readonly createOption?: Readonly<Record<string, TableRequest>>;
  /** The fold of each row rows are nested under, by its id. */
  readonly folds?: Readonly<Record<string, TableRequest>>;
  /** A row added under another, `$row` standing for that one: the key that adds a row. */
  readonly newRowAfter?: TableRequest;
  /** What dragging moves, and the keyboard moves one place at a time. */
  readonly moves?: TableMoves;
  /** A column's width, by the property's id, `$typed` standing for the width in pixels: dragging its header's right border. */
  readonly widths?: Readonly<Record<string, TableRequest>>;
}

/**
 * What a drag moves. A view or a column, by its id: the request that puts it first, by `''`, and
 * after each other one, by that one's id.
 */
export interface TableMoves {
  readonly views?: Readonly<Record<string, Readonly<Record<string, TableRequest>>>>;
  readonly columns?: Readonly<Record<string, Readonly<Record<string, TableRequest>>>>;
  /** A row, `$row` standing for the one moved and `$typed` for the one it lands after; absent where a sort places the rows. */
  readonly rows?: { readonly first: TableRequest; readonly after: TableRequest };
}

/** The controls of a group heading. */
export interface TableGroupHead {
  readonly fold: TableRequest;
  readonly up?: TableRequest;
  readonly down?: TableRequest;
  readonly hide: TableRequest;
}

/** How a gesture names one row of several it is made for. */
export const ROW = '$row';

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
  /** Where the view nests its rows under their parents: each row's place in the tree, by its id. */
  readonly tree?: Readonly<Record<string, TableNest>>;
  readonly views: readonly TableTab[];
  readonly settings: readonly TableSetting[];
  /** Every operation of the definition, by its id. */
  readonly operations: Readonly<Record<string, TableOperation>>;
  /** True when nothing that edits may be offered. */
  readonly readOnly: boolean;
  /** Why the table is read-only or empty, when there is something to say. */
  readonly notice?: string;
  /** The surface's gestures, where the tool type gives them. */
  readonly gestures?: TableGestures;
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
  | { readonly kind: 'setField'; readonly id: string; readonly field: string; readonly value: string }
  /**
   * Several requests made one after another as one edit and one undo step: a gesture that is more than one
   * operation. A value written `$created:N` stands for the Nth element the steps before it created, from 0.
   */
  | { readonly kind: 'steps'; readonly steps: readonly TableRequest[] }
  /** A related row opened where it lives: its file as the column names it, and its id. Nothing is written. */
  | { readonly kind: 'follow'; readonly file: string; readonly row: string };

/** How a step names what a step before it created. */
export const CREATED = '$created:';

// ---- the table of a model ----

/**
 * What a definition cannot state of a view, carried for one tool type (etalii.adp spec 027, FR-003):
 * DESL names the types that store a view's settings by their role and not what an attribute of
 * them means (DESL 7.4), so which columns, rows and groups a view shows is its tool type's to say.
 * A tool type without one shows every column and every row, in the document's order.
 */
export interface ViewLogic {
  /** The origin of the tool type it is for. */
  readonly id: string;
  shown(table: TableData): ShownView;
  /** The colour of an option, by the value its colour attribute holds. */
  colour?(key: string): ThemedColour | undefined;
  /** The files other than its own that a document's columns name rows of, as it writes them. */
  targets?(model: Model): readonly string[];
  /** The columns whose values name rows, by the property's id: of which file, and that file's rows. */
  relations?(table: TableData): Readonly<Record<string, TableRelation>>;
  /** What the tool type finds of those values and files that no constraint can state, because it reads another file. */
  findings?(table: TableData, relations: Readonly<Record<string, TableRelation>>): readonly TableFound[];
  /**
   * What an operation that was run changes beyond what its definition says, where it is a step that
   * writes two files: nothing for any other, or why it cannot be made.
   */
  across?(step: TableStep): TableAcross | { readonly refused: string } | { readonly confirm: TableConfirm } | undefined;
  /**
   * Operations the definition does not have, which the tool type makes itself: each is given to
   * `across` with nothing changed by the definition, and is refused there when it cannot be made.
   */
  readonly ownSteps?: readonly string[];
  /** The changes that keep a document's names of other files true when files move: `moved` gives a name's new form, undefined for one that stays. */
  retarget?(model: Model, moved: (file: string) => string | undefined): readonly Change[];
  /**
   * The values a parameter of an operation may take where the definition types it as text but only
   * some values make sense, such as a file of the same tool type: by operation, then parameter. A
   * required one is still asked, starting at the first.
   */
  choices?(table: TableData): Readonly<Record<string, Readonly<Record<string, readonly { readonly value: string; readonly label: string }[]>>>>;
}

/** An operation run on a document, as a step that may write another file too. */
export interface TableStep {
  readonly operation: string;
  readonly on: readonly string[];
  readonly args: Readonly<Record<string, TableValue>>;
  /** The model before the operation, and after it, with what it created. */
  readonly before: Model;
  readonly after: Model;
  readonly created: readonly string[];
  readonly related?: RelatedRows;
  /** How a file the document names names the document in turn. */
  readonly back: (file: string) => string;
  /** A new id for an element of a type. */
  readonly newId: (type: string) => string;
  /** The other documents of the same tool type the host knows of, as the document names them: their text is in `related` too. */
  readonly peers: readonly string[];
  /** Whether the user has confirmed the step already. */
  readonly confirmed: boolean;
}

/** A question to ask before a step is made. */
export interface TableConfirm {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly danger: boolean;
}

/** The rest of a step that writes two files: what it adds of this document, and what it changes of the other. */
export interface TableAcross {
  /** The other file as the document names it; `.` when the other side is the document itself, whose changes are then all `here`. */
  readonly file: string;
  readonly here: readonly Change[];
  readonly there: readonly Change[];
}

/** A column whose values name rows of a file. */
export interface TableRelation {
  /** The file as the column names it; `.` is the document itself. */
  readonly file: string;
  /** Whether a cell names one row at most. */
  readonly single: boolean;
  /** Its rows, by title, in its order; absent when the file cannot be read as a document of this tool type. */
  readonly rows?: readonly TableOption[];
  /**
   * For a column that holds no values of its own but shows those of another: the rows it shows, by
   * the id of each row of this document. Its cells are made of them.
   */
  readonly values?: Readonly<Record<string, readonly string[]>>;
  /** Why its cells are shown and not edited. */
  readonly readOnly?: string;
}

/** A finding of the tool type's own, on the element it is about. */
export interface TableFound {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
  readonly element: string;
}

/** Another document of the same tool type that a document names: its rows by title, and its model. */
export interface RelatedTable {
  readonly rows: readonly TableOption[];
  readonly model: Model;
}

/** A file a document names, read; undefined when it cannot be read as a document of the same tool type. */
export type RelatedRows = (file: string) => RelatedTable | undefined;

/** The table of a document before a view is applied to it. */
export interface TableData {
  readonly model: Model;
  readonly metamodel: Metamodel;
  /** The id of the view that is shown, when the document has one. */
  readonly view?: string;
  readonly properties: readonly TableProperty[];
  readonly rows: readonly TableRow[];
  /** The rows of another file the document names; absent where the host gives none. */
  readonly related?: RelatedRows;
  /** The other documents of the same tool type the host knows of, each as this one would name it. */
  readonly peers?: readonly string[];
}

export interface ShownView {
  /** The surface's gestures for this view, where the tool type gives them. */
  readonly gestures?: TableGestures;
  /** What the view says of its columns, in its order. A column it does not list follows, as it is by default. */
  readonly columns?: readonly (Partial<Pick<TableProperty, 'visible' | 'width' | 'wrap' | 'frozen' | 'summary'>> & { readonly id: string })[];
  /** The ids of the rows in sight, in order. Absent for every row, in the document's order. */
  readonly rows?: readonly string[];
  readonly groups?: readonly TableGroup[];
  readonly tree?: Readonly<Record<string, TableNest>>;
}

/** A row's place where the view nests rows under their parents. */
export interface TableNest {
  /** How deep it is: 0 for a row without a parent in sight. */
  readonly depth: number;
  /** Whether rows are nested under it. */
  readonly parent: boolean;
  /** Whether those rows are folded away. */
  readonly collapsed: boolean;
}

/** What a table view is made of. */
export interface TableParts {
  readonly surface: TableSurface;
  readonly metamodel: Metamodel;
  readonly operations: readonly DesignerOperation[];
  readonly logic?: ViewLogic;
  readonly locale?: string;
}

/**
 * Every operation of a definition as a gesture asks its arguments, by its id: each parameter as the
 * control that asks it, with the values an enumeration or a type of the document gives a choice,
 * each element of a type named by `labelOf`.
 */
export function operationsOf(model: Model, metamodel: Metamodel, operations: readonly DesignerOperation[], locale: string, labelOf: (model: Model, element: ModelElement) => string): Record<string, TableOperation> {
  const paramOf = (param: Parameter): TableParam => {
    const kind = valueKind(metamodel, param.type);
    const value = param.default === undefined || typeof param.default === 'object' ? {} : { value: param.default };
    const common = { name: param.name, label: param.label, required: param.required };
    if (kind.kind === 'enum') return { ...common, control: 'choice', ...value, options: kind.enum.values.map((candidate) => ({ value: candidate.key, label: candidate.label })) };
    if (kind.kind === 'reference') return { ...common, control: 'choice', options: model.elements.filter((element) => element.type === kind.type).map((element) => ({ value: element.id, label: labelOf(model, element) })) };
    const controls: Readonly<Record<string, TableParam['control']>> = { bool: 'checkbox', int: 'number', number: 'number', date: 'date', datetime: 'dateTime', time: 'time', text: 'multiline' };
    return { ...common, control: (kind.kind === 'primitive' ? controls[kind.primitive] : undefined) ?? 'text', ...value };
  };
  return Object.fromEntries(operations.map((operation) => [operation.id, {
    id: operation.id, label: localized(isCel(operation.label) ? undefined : operation.label, locale) ?? operation.id, params: operation.params.map(paramOf),
  }]));
}

const UNKNOWN_TYPE = 'This column is of a type this tool does not have, so its values are shown and not edited.';

const textOf = (value: Value | undefined): string => (value === undefined || value === null ? '' : String(value));

/** What reads a model as a table: the view, and the parts of it a tool type asks for by themselves. */
export function tableReader(parts: TableParts) {
  const { surface, metamodel, logic } = parts;
  const { columns, cells, rows, views } = surface;
  const locale = parts.locale ?? 'en';
  // The children of each element, gathered once for a model: a table of many rows asks for them for every row and cell.
  const indexes = new WeakMap<readonly ModelElement[], { readonly children: Map<string, ModelElement[]>; readonly title: ModelElement | undefined }>();
  const indexOf = (model: Model): { readonly children: Map<string, ModelElement[]>; readonly title: ModelElement | undefined } => {
    const known = indexes.get(model.elements);
    if (known) return known;
    const children = new Map<string, ModelElement[]>();
    for (const element of model.elements) {
      if (element.parent === undefined) continue;
      const siblings = children.get(element.parent);
      if (siblings) siblings.push(element);
      else children.set(element.parent, [element]);
    }
    const title = columns.title === undefined ? undefined : model.elements.find((element) => element.type === columns.type && element.attributes[columns.title!] === true);
    const index = { children, title };
    indexes.set(model.elements, index);
    return index;
  };
  const childrenOf = (model: Model, id: string, type: string): ModelElement[] => (indexOf(model).children.get(id) ?? []).filter((element) => element.type === type);
  const valueTypeOf = (column: ModelElement): ValueType | undefined => {
    const name = column.attributes[columns.valueType];
    return typeof name === 'string' && Object.hasOwn(surface.valueTypes, name) ? surface.valueTypes[name] : undefined;
  };

  /** The text of a row's cell of the column that titles a row, when the surface names how one is marked. */
  const titleOf = (model: Model, row: string): string => {
    const column = indexOf(model).title;
    const valueType = column && valueTypeOf(column);
    const cell = column && childrenOf(model, row, cells.type).find((candidate) => candidate.attributes[cells.column] === column.id);
    return cell && valueType ? textOf(cell.attributes[valueType.key]) : '';
  };

  /** How an element is named where it is listed: by its label attribute, a row by its title, anything else by what it holds. */
  function labelOf(model: Model, element: ModelElement): string {
    if (element.type === rows.type) return titleOf(model, element.id) || element.id;
    const named = metamodel.types[element.type]?.labelAttribute;
    return named !== undefined && typeof element.attributes[named] === 'string' ? element.attributes[named] : described(model, element);
  }
  /** The values an element holds that are not its attributes' defaults, in the order of its type: what tells one setting from another. */
  function described(model: Model, element: ModelElement): string {
    return Object.entries(attributesOf(metamodel, element.type)).flatMap(([name, attribute]) => {
      const value = element.attributes[name];
      if (value === undefined || value === null || JSON.stringify(value) === JSON.stringify(defaultOf(attribute))) return [];
      const kind = valueKind(metamodel, attribute.type);
      if (kind.kind === 'enum') return [kind.enum.values.find((candidate) => candidate.key === value)?.label ?? textOf(value)];
      const named = kind.kind === 'reference' ? model.elements.find((candidate) => candidate.id === value) : undefined;
      return [named ? labelOf(model, named) : textOf(value)];
    }).join(', ');
  }

  const colourOf = (option: ModelElement | undefined): ThemedColour | undefined => {
    const key = option && columns.options?.colour !== undefined ? option.attributes[columns.options.colour] : undefined;
    return typeof key === 'string' ? logic?.colour?.(key) : undefined;
  };

  /** The columns of a model, in its order, each as it is without a view. */
  function propertiesOf(model: Model): TableProperty[] {
    const typed = valueKind(metamodel, attributesOf(metamodel, columns.type)[columns.valueType]?.type ?? '');
    return model.elements.filter((element) => element.type === columns.type).map((column): TableProperty => {
      const valueType = valueTypeOf(column);
      const named = column.attributes[columns.valueType];
      const icon = typed.kind === 'enum' ? typed.enum.values.find((value) => value.key === named)?.icon : undefined;
      const options = columns.options;
      return {
        id: column.id, name: textOf(column.attributes[columns.name]), valueType: textOf(named),
        ...(valueType ? { editor: valueType.editor } : { readOnly: UNKNOWN_TYPE }), many: valueType?.many === true,
        ...(typeof icon === 'string' ? { icon } : {}),
        title: columns.title !== undefined && column.attributes[columns.title] === true,
        options: options ? childrenOf(model, column.id, options.type).map((option) => {
          const colour = colourOf(option);
          return { id: option.id, name: textOf(option.attributes[options.name]), ...(colour ? { colour } : {}) };
        }) : [],
        visible: true, wrap: false, frozen: false,
      };
    });
  }

  /** The rows of a model, in its order, each with the cells it has a value for. */
  function rowsOf(model: Model): TableRow[] {
    const byId = new Map(model.elements.map((element) => [element.id, element]));
    const columnsById = new Map(model.elements.filter((element) => element.type === columns.type).map((column) => [column.id, column]));
    return model.elements.filter((element) => element.type === rows.type).map((row): TableRow => {
      const held: Record<string, TableCell> = {};
      for (const cell of childrenOf(model, row.id, cells.type)) {
        const column = columnsById.get(textOf(cell.attributes[cells.column]));
        if (!column || Object.hasOwn(held, column.id)) continue;
        const valueType = valueTypeOf(column);
        const attribute = valueType && attributesOf(metamodel, valueType.many ? cells.items ?? cells.type : cells.type)[valueType.key];
        const reference = attribute !== undefined && valueKind(metamodel, attribute.type).kind === 'reference';
        const named = (value: Value | undefined): ModelElement | undefined => (typeof value === 'string' ? byId.get(value) : undefined);
        // What a value shows as: the element it names by its label, a row of this document by its title, anything else as it is written.
        const shown = (value: Value | undefined): string => {
          const element = named(value);
          return element && (reference || element.type === rows.type) ? labelOf(model, element) : textOf(value);
        };
        const items: TableItem[] = !valueType?.many || cells.items === undefined ? [] : childrenOf(model, cell.id, cells.items).flatMap((item) => {
          const value = item.attributes[valueType.key];
          if (value === undefined || value === null) return [];
          const colour = reference ? colourOf(named(value)) : undefined;
          return [{ id: item.id, value: textOf(value), label: shown(value), ...(colour ? { colour } : {}) }];
        });
        // A value under another type's key is still shown, as it is written (DESL 7.5).
        const stored = valueType && !valueType.many ? cell.attributes[valueType.key] : undefined;
        const other = valueType?.many || stored !== undefined ? undefined : Object.values(surface.valueTypes).map((candidate) => (candidate.many ? undefined : cell.attributes[candidate.key])).find((value) => value !== undefined);
        const value = stored === undefined || typeof stored === 'object' ? null : stored;
        const colour = reference && !valueType?.many ? colourOf(named(stored)) : undefined;
        held[column.id] = { id: cell.id, value, items, text: valueType?.many ? items.map((item) => item.label).join(', ') : shown(stored ?? other), ...(colour ? { colour } : {}) };
      }
      return { id: row.id, title: titleOf(model, row.id), cells: held };
    });
  }

  /** The table view of a model: the view the document is left in, else the first (DESL 7.4), applied to its columns and rows. */
  function view(model: Model, state: Pick<TableView, 'readOnly' | 'notice'>, related?: RelatedRows, peers?: readonly string[]): TableView {
    const tabs = model.elements.filter((element) => element.type === views.type);
    const left = views.active === undefined ? undefined : model.diagram[views.active];
    const active = (tabs.find((tab) => tab.id === left) ?? tabs[0])?.id;
    const all = tableOf(model, related);
    const data: TableData = { model, metamodel, ...(active === undefined ? {} : { view: active }), properties: all.properties, rows: all.rows, ...(related ? { related } : {}), ...(peers ? { peers } : {}) };
    const shown: ShownView = logic?.shown(data) ?? {};
    const operations = operationsOf(model, metamodel, parts.operations, locale, labelOf);
    for (const [operation, params] of Object.entries(logic?.choices?.(data) ?? {})) {
      const given = operations[operation];
      if (!given) continue;
      operations[operation] = { ...given, params: given.params.map((param) => (params[param.name]?.length ? { ...param, control: 'choice', options: params[param.name] } : param)) };
    }
    const listed = (shown.columns ?? []).flatMap((column) => {
      const property = all.properties.find((candidate) => candidate.id === column.id);
      return property ? [{ ...property, ...column }] : [];
    });

    // The settings of the view that is shown: every element in it of a type the surface names for one, with how deep it lies.
    const roles = new Map(Object.entries(views.settings).map(([role, type]) => [type, role]));
    const settings: TableSetting[] = [];
    const within = (parent: string, depth: number): void => {
      for (const element of model.elements.filter((candidate) => candidate.parent === parent)) {
        if (roles.has(element.type)) settings.push({ id: element.id, role: roles.get(element.type)!, label: described(model, element), depth });
        within(element.id, depth + 1);
      }
    };
    if (active !== undefined) within(active, 0);

    const rowById = new Map(all.rows.map((row) => [row.id, row]));
    // The document is named by its first required attribute that is a string, as an element type is (DESL 4.5).
    const named = Object.keys(metamodel.diagram).find((name) => metamodel.diagram[name].type === 'string' && metamodel.diagram[name].required === true);
    return {
      name: named === undefined ? '' : textOf(model.diagram[named]),
      properties: [...listed, ...all.properties.filter((property) => !listed.some((column) => column.id === property.id))],
      rows: shown.rows === undefined ? all.rows : shown.rows.flatMap((id) => rowById.get(id) ?? []),
      total: all.rows.length,
      ...(shown.groups === undefined ? {} : { groups: shown.groups }),
      ...(shown.tree === undefined ? {} : { tree: shown.tree }),
      views: tabs.map((tab) => ({ id: tab.id, name: textOf(tab.attributes[views.name]), active: tab.id === active })),
      settings,
      operations,
      ...state,
      ...(shown.gestures === undefined || state.readOnly ? {} : { gestures: shown.gestures }),
    };
  }

  /** The rows of a model by their titles, in its order: what another document that names them shows. */
  const titlesOf = (model: Model): TableOption[] => model.elements.filter((element) => element.type === rows.type).map((row) => ({ id: row.id, name: titleOf(model, row.id) }));

  /**
   * The columns and rows of a model with each value that names a row shown by that row's title, as a
   * link to it, and what the tool type finds of them: a related row is named by its title, not its id.
   */
  // The last table made: the view and the findings of one document ask for it in turn.
  let last: { readonly model: Model; readonly related?: RelatedRows; readonly table: ReturnType<typeof tableOf> } | undefined;
  function tableOf(model: Model, related?: RelatedRows): { readonly properties: readonly TableProperty[]; readonly rows: readonly TableRow[]; readonly found: readonly TableFound[] } {
    if (last && last.model === model && last.related === related) return last.table;
    const table = linkedTable(model, related);
    last = { model, ...(related ? { related } : {}), table };
    return table;
  }

  function linkedTable(model: Model, related?: RelatedRows): { readonly properties: readonly TableProperty[]; readonly rows: readonly TableRow[]; readonly found: readonly TableFound[] } {
    const data: TableData = { model, metamodel, properties: propertiesOf(model), rows: rowsOf(model), ...(related ? { related } : {}) };
    const relations = logic?.relations?.(data) ?? {};
    if (Object.keys(relations).length === 0) return { properties: data.properties, rows: data.rows, found: [] };
    const titles = new Map(Object.entries(relations).map(([id, relation]) => [id, relation.rows && new Map(relation.rows.map((row) => [row.id, row.name]))]));
    const properties = data.properties.map((property) => {
      const relation = relations[property.id];
      return relation ? { ...property, single: relation.single, ...(relation.rows ? { related: relation.rows } : {}), ...(relation.readOnly === undefined ? {} : { readOnly: relation.readOnly }) } : property;
    });
    const linked = data.rows.map((row): TableRow => {
      let cells: Record<string, TableCell> | undefined;
      for (const [id, relation] of Object.entries(relations)) {
        // A column that shows the values of another is given cells of them; it holds none of its own.
        const shown = relation.values?.[row.id];
        const cell = shown && shown.length > 0
          ? { id: `${row.id}/${id}`, value: null, text: '', items: shown.map((value) => ({ id: `${row.id}/${id}/${value}`, value, label: value })) }
          : row.cells[id];
        const named = titles.get(id);
        if (!cell || !named) continue;
        const items = cell.items.map((item): TableItem => {
          const title = named.get(item.value);
          return title === undefined ? { ...item, label: item.value } : { ...item, label: title || item.value, link: { file: relation.file, row: item.value } };
        });
        cells ??= { ...row.cells };
        cells[id] = { ...cell, items, text: items.map((item) => item.label).join(', ') };
      }
      return cells ? { ...row, cells } : row;
    });
    return { properties, rows: linked, found: logic?.findings?.(data, relations) ?? [] };
  }

  /** What the tool type finds of the values that name rows of another file. */
  const foundOf = (model: Model, related?: RelatedRows): readonly TableFound[] => (logic?.relations ? tableOf(model, related).found : []);

  return { view, propertiesOf, rowsOf, titlesOf, foundOf };
}

/**
 * The view with each finding on what it is about (etalii.adp spec 079, FR-025): on the cell it
 * names or the cell a value it names is in, on the row it names, and, where it names nothing, on
 * the cell or row its line falls in. A finding about anything else stays in the Problems panel only.
 */
export function withFindings(view: TableView, found: readonly { readonly severity: Severity; readonly message: string; readonly line: number; readonly element?: string }[], model: Model): TableView {
  if (found.length === 0) return view;
  const byId = new Map(model.elements.map((element) => [element.id, element]));
  const shown = new Map<string, string>();
  for (const row of view.rows) {
    shown.set(row.id, row.id);
    for (const cell of Object.values(row.cells)) shown.set(cell.id, cell.id);
  }
  // The element a finding that names none is about: the last to start at or above its line, which counts from 0 where an element's counts from 1.
  const startsAbove = (line: number): string | undefined => {
    let best: ModelElement | undefined;
    for (const element of model.elements) if (element.line > 0 && element.line <= line + 1 && (best === undefined || element.line >= best.line)) best = element;
    return best?.id;
  };
  // What it is shown on: that element, or the nearest around it that is shown.
  const onto = (finding: (typeof found)[number]): string | undefined => {
    const named = finding.element ?? (finding.line > 0 ? startsAbove(finding.line) : undefined);
    for (let id = named; id !== undefined; id = byId.get(id)?.parent) if (shown.has(id)) return id;
    return undefined;
  };
  const marks = new Map<string, TableFinding[]>();
  for (const finding of found) {
    const id = onto(finding);
    if (id !== undefined) marks.set(id, [...(marks.get(id) ?? []), { severity: finding.severity, message: finding.message }]);
  }
  if (marks.size === 0) return view;
  return {
    ...view,
    rows: view.rows.map((row) => {
      const cells = Object.fromEntries(Object.entries(row.cells).map(([key, cell]) => [key, marks.has(cell.id) ? { ...cell, findings: marks.get(cell.id)! } : cell]));
      return { ...row, cells, ...(marks.has(row.id) ? { findings: marks.get(row.id)! } : {}) };
    }),
  };
}
