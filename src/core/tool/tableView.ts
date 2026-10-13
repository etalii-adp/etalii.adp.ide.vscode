// What a designer shows and what a gesture on it asks (etalii.adp spec 027, contracts/tool-type.md;
// DESL 7): the table of a document, with the view that is shown applied to it. A table view is
// plain data, as a scene is: it crosses to the webview as JSON, and holds nothing of a definition
// beyond the ids, the names and the values the document and the definition give.

import type { DesignerOperation, Parameter } from '../desl/operations';
import type { Editor, Surface, ValueType } from '../desl/surface';
import { attributesOf, defaultOf, valueKind, type Metamodel } from '../disl/metamodel';
import type { Model, ModelElement, Value } from '../disl/model';
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
}

/** The table of a document before a view is applied to it. */
export interface TableData {
  readonly model: Model;
  readonly metamodel: Metamodel;
  /** The id of the view that is shown, when the document has one. */
  readonly view?: string;
  readonly properties: readonly TableProperty[];
  readonly rows: readonly TableRow[];
}

export interface ShownView {
  /** What the view says of its columns, in its order. A column it does not list follows, as it is by default. */
  readonly columns?: readonly (Partial<Pick<TableProperty, 'visible' | 'width' | 'wrap' | 'frozen' | 'calculation'>> & { readonly id: string })[];
  /** The ids of the rows in sight, in order. Absent for every row, in the document's order. */
  readonly rows?: readonly string[];
  readonly groups?: readonly TableGroup[];
}

/** What a table view is made of. */
export interface TableParts {
  readonly surface: Surface;
  readonly metamodel: Metamodel;
  readonly operations: readonly DesignerOperation[];
  readonly logic?: ViewLogic;
  readonly locale?: string;
}

const UNKNOWN_TYPE = 'This column is of a type this tool does not have, so its values are shown and not edited.';

const textOf = (value: Value | undefined): string => (value === undefined || value === null ? '' : String(value));

/** What reads a model as a table: the view, and the parts of it a tool type asks for by themselves. */
export function tableReader(parts: TableParts) {
  const { surface, metamodel, logic } = parts;
  const { columns, cells, rows, views } = surface;
  const locale = parts.locale ?? 'en';
  const childrenOf = (model: Model, id: string, type: string): ModelElement[] => model.elements.filter((element) => element.parent === id && element.type === type);
  const valueTypeOf = (column: ModelElement): ValueType | undefined => {
    const name = column.attributes[columns.valueType];
    return typeof name === 'string' && Object.hasOwn(surface.valueTypes, name) ? surface.valueTypes[name] : undefined;
  };

  /** The text of a row's cell of the column that titles a row, when the surface names how one is marked. */
  const titleOf = (model: Model, row: string): string => {
    const column = columns.title === undefined ? undefined : model.elements.find((element) => element.type === columns.type && element.attributes[columns.title!] === true);
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
    const kinds = valueKind(metamodel, attributesOf(metamodel, columns.type)[columns.valueType]?.type ?? '');
    return model.elements.filter((element) => element.type === columns.type).map((column): TableProperty => {
      const valueType = valueTypeOf(column);
      const named = column.attributes[columns.valueType];
      const icon = kinds.kind === 'enum' ? kinds.enum.values.find((value) => value.key === named)?.icon : undefined;
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

  /** The control that asks a parameter, with the values an enumeration or a type of the document gives a choice. */
  function paramOf(model: Model, param: Parameter): TableParam {
    const kind = valueKind(metamodel, param.type);
    const value = param.default === undefined || typeof param.default === 'object' ? {} : { value: param.default };
    const common = { name: param.name, label: param.label, required: param.required };
    if (kind.kind === 'enum') return { ...common, control: 'choice', ...value, options: kind.enum.values.map((candidate) => ({ value: candidate.key, label: candidate.label })) };
    if (kind.kind === 'reference') return { ...common, control: 'choice', options: model.elements.filter((element) => element.type === kind.type).map((element) => ({ value: element.id, label: labelOf(model, element) })) };
    const controls: Readonly<Record<string, TableParam['control']>> = { bool: 'checkbox', int: 'number', number: 'number', date: 'date', datetime: 'dateTime', time: 'time', text: 'multiline' };
    return { ...common, control: (kind.kind === 'primitive' ? controls[kind.primitive] : undefined) ?? 'text', ...value };
  }

  /** The table view of a model: the view the document is left in, else the first (DESL 7.4), applied to its columns and rows. */
  function view(model: Model, state: Pick<TableView, 'readOnly' | 'notice'>): TableView {
    const tabs = model.elements.filter((element) => element.type === views.type);
    const left = views.active === undefined ? undefined : model.diagram[views.active];
    const active = (tabs.find((tab) => tab.id === left) ?? tabs[0])?.id;
    const all = { properties: propertiesOf(model), rows: rowsOf(model) };
    const shown: ShownView = logic?.shown({ model, metamodel, ...(active === undefined ? {} : { view: active }), ...all }) ?? {};
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

    // The document is named by its first required attribute that is a string, as an element type is (DESL 4.5).
    const named = Object.keys(metamodel.diagram).find((name) => metamodel.diagram[name].type === 'string' && metamodel.diagram[name].required === true);
    return {
      name: named === undefined ? '' : textOf(model.diagram[named]),
      properties: [...listed, ...all.properties.filter((property) => !listed.some((column) => column.id === property.id))],
      rows: shown.rows === undefined ? all.rows : shown.rows.flatMap((id) => all.rows.filter((row) => row.id === id)),
      total: all.rows.length,
      ...(shown.groups === undefined ? {} : { groups: shown.groups }),
      views: tabs.map((tab) => ({ id: tab.id, name: textOf(tab.attributes[views.name]), active: tab.id === active })),
      settings,
      operations: Object.fromEntries(parts.operations.map((operation) => [operation.id, {
        id: operation.id, label: localized(isCel(operation.label) ? undefined : operation.label, locale) ?? operation.id, params: operation.params.map((param) => paramOf(model, param)),
      }])),
      ...state,
    };
  }

  return { view, propertiesOf, rowsOf };
}
