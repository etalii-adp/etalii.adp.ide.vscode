// The gestures of the Knowledge designer's table surface, each as the operation of `knowledge.des`
// that carries it out (etalii.adp spec 079, research R1). The definition says what each operation
// does; its section "Gestures and operations" says which gesture comes to which, and DESL has no
// words for that, so this host says it here, once, in the order and words of the standalone host.
// The core marks an entry that cannot run now with its definition's reason; the webview asks in a
// form for a parameter an entry's request leaves out.

import type { ModelElement, Value } from '../../disl/model';
import type { TableBarItem, TableData, TableEntry, TableGestures, TableGroup, TableMenu, TableProperty, TableRequest } from '../../tool/tableView';

const operation = (name: string, on: readonly string[] = [], args: Readonly<Record<string, string | number | boolean>> = {}): TableRequest => ({ kind: 'operation', operation: name, on, args });
const text = (value: Value | undefined): string => (value === undefined || value === null ? '' : String(value));
const icon = (name: unknown): { readonly icon?: string } => (typeof name !== 'string' ? {} : { icon: name.replace(/^mdi-/, '') });

/** Who a gesture on several rows names: the rows selected, which the webview puts in its place. */
export const SELECTION = '$selection';

/** How a filter's comparison reads, in words. */
const comparisons: Readonly<Record<string, string>> = {
  is: 'is', 'is-not': 'is not', contains: 'contains', 'does-not-contain': 'does not contain', 'starts-with': 'starts with', 'ends-with': 'ends with',
  'is-empty': 'is empty', 'is-not-empty': 'is not empty', 'is-checked': 'is checked', 'is-not-checked': 'is not checked',
  equals: '=', 'does-not-equal': '≠', 'greater-than': '>', 'less-than': '<', 'at-least': '≥', 'at-most': '≤',
  'is-before': 'is before', 'is-after': 'is after', 'is-on-or-before': 'is on or before', 'is-on-or-after': 'is on or after',
};

/** The surface's gestures for the view that is shown. */
export function gesturesOf(table: TableData, groups: readonly TableGroup[] | undefined, columns: readonly { readonly id: string; readonly visible?: boolean; readonly width?: number; readonly wrap?: boolean; readonly frozen?: boolean }[]): TableGestures {
  const { model } = table;
  const views = model.elements.filter((element) => element.type === 'View');
  const view = views.find((element) => element.id === table.view);
  const types = table.metamodel.enums.ValueType?.values ?? [];
  const properties = table.properties;
  const propertyOf = (id: Value | undefined): TableProperty | undefined => properties.find((property) => property.id === id);

  // ---- views ----

  const viewMenus = Object.fromEntries(views.map((tab): [string, TableMenu] => [tab.id, [[
    { id: 'rename', label: 'Rename', icon: 'pencil-outline', request: operation('renameView', [tab.id]) },
    { id: 'duplicate', label: 'Duplicate', icon: 'content-duplicate', request: operation('duplicateView', [tab.id]) },
    { id: 'delete', label: 'Delete', icon: 'trash-can-outline', request: operation('deleteView', [tab.id]) },
  ]]]));

  // ---- a new property, of each type: after the one given, or first where `first` ----

  const newProperty = (after?: string, first = false): TableEntry[] => types.map((type): TableEntry => {
    const placed: Readonly<Record<string, string>> = after === undefined ? {} : { after };
    const request = type.key === 'relation' ? operation('createRelation', [], {}) : operation('addProperty', [], { valueType: type.key, ...placed });
    // A relation is made where the definition makes it; a property put first is moved there in the same step.
    const moved: TableRequest = first ? { kind: 'steps', steps: [request, operation('moveProperty', ['$created:0'])] } : request;
    return { id: type.key, label: type.label, ...icon(type.icon), request: moved };
  });

  // ---- columns, in the standalone host's order ----

  const columnMenus = view === undefined ? {} : Object.fromEntries(properties.map((property, index): [string, TableMenu] => {
    const shown: { readonly visible?: boolean; readonly width?: number; readonly wrap?: boolean } = columns.find((column) => column.id === property.id) ?? {};
    const setting = (change: Readonly<Record<string, boolean>>): TableRequest => operation('setColumn', [view.id], {
      property: property.id, visible: shown.visible ?? true, wrap: shown.wrap ?? false, ...(shown.width === undefined ? {} : { width: shown.width }), ...change,
    });
    const frozenUpTo = text(view.attributes.freeze) === property.id;
    const selecting = property.valueType === 'selection' || property.valueType === 'multipleSelection';
    const element = model.elements.find((found) => found.id === property.id);
    const parentable = property.valueType === 'relation' && text(element?.attributes.targetFile) === '.';
    const menu: TableEntry[][] = [
      [
        { id: 'rename', label: 'Rename', icon: 'pencil-outline', request: operation('renameProperty', [property.id]) },
        {
          id: 'changeType', label: 'Change type', icon: 'swap-horizontal',
          ...(property.title ? { disabled: 'The column that names a row is always text.' } : {}),
          entries: types.filter((type) => type.key !== 'relation').map((type): TableEntry => ({ id: type.key, label: type.label, ...icon(type.icon), request: operation('changePropertyType', [property.id], { valueType: type.key }) })),
        },
        ...(selecting ? [{ id: 'options', label: 'New option', icon: 'format-list-bulleted-square', request: operation('addOption', [property.id]) }] : []),
      ],
      [
        { id: 'filter', label: 'Filter', icon: 'filter-outline', request: operation('addCondition', [view.id], { property: property.id }) },
        { id: 'sortAscending', label: 'Sort ascending', icon: 'sort-ascending', request: operation('addSort', [view.id], { property: property.id, direction: 'ascending' }) },
        { id: 'sortDescending', label: 'Sort descending', icon: 'sort-descending', request: operation('addSort', [view.id], { property: property.id, direction: 'descending' }) },
        { id: 'group', label: 'Group', icon: 'format-list-group', request: operation('groupBy', [view.id], { property: property.id }) },
        ...(parentable ? [{ id: 'nest', label: element?.attributes.isParent === true ? 'Nested by this' : 'Nest rows by this', icon: 'file-tree-outline', request: operation('setParentRelation', [property.id]) }] : []),
      ],
      [
        { id: 'hide', label: 'Hide in view', icon: 'eye-off-outline', ...(property.title ? { disabled: 'The column that names a row is always there.' } : {}), request: setting({ visible: false }) },
        { id: 'wrap', label: shown.wrap === true ? 'Do not wrap' : 'Wrap text', icon: 'wrap', request: setting({ wrap: shown.wrap !== true }) },
        frozenUpTo
          ? { id: 'freeze', label: 'Unfreeze columns', icon: 'pin-off-outline', request: operation('unfreeze', [view.id]) }
          : { id: 'freeze', label: 'Freeze up to column', icon: 'pin-outline', request: operation('freeze', [view.id], { property: property.id }) },
      ],
      [
        { id: 'insertLeft', label: 'Insert left', icon: 'table-column-plus-before', entries: index === 0 ? newProperty(undefined, true) : newProperty(properties[index - 1].id) },
        { id: 'insertRight', label: 'Insert right', icon: 'table-column-plus-after', entries: newProperty(property.id) },
        { id: 'duplicate', label: 'Duplicate', icon: 'content-duplicate', request: operation('duplicateProperty', [property.id]) },
        { id: 'delete', label: 'Delete', icon: 'trash-can-outline', request: operation('deleteProperty', [property.id]) },
      ],
    ];
    return [property.id, menu];
  }));

  // ---- rows ----

  const rowMenu: TableMenu = [[{ id: 'delete', label: 'Delete', icon: 'trash-can-outline', request: operation('deleteRows', [SELECTION]) }]];
  const newRow = operation('addRow');
  // A row made under a group has the group's value, in the same step (`addRow`'s own words: the host sets it).
  const by = propertyOf(view?.attributes.groupBy);
  const valued = (key: string): TableRequest => {
    const row = '$created:0';
    if (!by || key === 'none') return newRow;
    const given: TableRequest = by.editor === 'checkbox' ? operation('setChecked', [row], { property: by.id, value: key === 'true' })
      : by.many ? { kind: 'item', row, property: by.id, value: key, present: true }
        : operation('setOption', [row], { property: by.id, value: key });
    return { kind: 'steps', steps: [newRow, given] };
  };
  const newRowIn = Object.fromEntries((groups ?? []).map((group) => [group.key, valued(group.key)]));

  // ---- the sorts and filters, in words ----

  const settings = (type: string): ModelElement[] => (view === undefined ? [] : model.elements.filter((element) => element.parent === view.id && element.type === type));
  const sorts = settings('Sort').flatMap((sort): TableBarItem[] => {
    const property = propertyOf(sort.attributes.property);
    const descending = sort.attributes.direction === 'descending';
    return property ? [{ id: sort.id, kind: 'sort', text: property.name, descending, remove: operation('removeSort', [sort.id]) }] : [];
  });
  const compared = (condition: ModelElement, property: TableProperty): string => {
    const attributes = condition.attributes;
    const option = property.options.find((found) => found.id === attributes.option)?.name;
    const value = option ?? text(attributes.text ?? attributes.number ?? attributes.date ?? attributes.dateTime ?? attributes.time);
    const operator = text(attributes.operator);
    return [property.name, comparisons[operator] ?? operator, value].filter((part) => part !== '').join(' ');
  };
  const filters = [...settings('Condition'), ...settings('FilterGroup')].flatMap((condition): TableBarItem[] => {
    if (condition.type === 'FilterGroup') {
      const count = model.elements.filter((element) => element.parent === condition.id).length;
      return [{ id: condition.id, kind: 'filter', text: `${count} ${count === 1 ? 'rule' : 'rules'}`, remove: operation('removeCondition', [condition.id]) }];
    }
    const property = propertyOf(condition.attributes.property);
    return property ? [{ id: condition.id, kind: 'filter', text: compared(condition, property), remove: operation('removeCondition', [condition.id]) }] : [];
  });

  return {
    newView: operation('addView', [], { name: 'Table' }),
    viewMenus,
    newProperty: newProperty(properties[properties.length - 1]?.id),
    columnMenus,
    rowMenu,
    newRow,
    newRowIn,
    items: [...sorts, ...filters],
  };
}
