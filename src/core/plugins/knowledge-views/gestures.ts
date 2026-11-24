// The gestures of the Knowledge designer's table surface, each as the operation of `knowledge.des`
// that carries it out (etalii.adp spec 079, research R1). The definition says what each operation
// does; its section "Gestures and operations" says which gesture comes to which, and DESL has no
// words for that, so this host says it here, once, in the order and words of the standalone host.
// The core marks an entry that cannot run now with its definition's reason; the webview asks in a
// form for a parameter an entry's request leaves out.

import type { ModelElement, Value } from '../../disl/model';
import { ROW, TYPED, type TableBarItem, type TableData, type TableEntry, type TableField, type TableGestures, type TableGroup, type TableMenu, type TableMoves, type TableNest, type TableOperation, type TableProperty, type TableRequest, type ThemedColour } from '../../tool/tableView';
import { calculationsFor, movesOf, optionsOf, settingsOf, type Group } from './settings';
import { parseLink } from '../../fbl/links/link';
import { isLink, ownIdOf, SELF } from './links';
import { SET_LIMIT, SET_OTHER_SIDE } from './relations';

const operation = (name: string, on: readonly string[] = [], args: Readonly<Record<string, string | number | boolean>> = {}): TableRequest => ({ kind: 'operation', operation: name, on, args });
/** What making a relation two-way asks first, as the standalone host's relation editor does: the name its backlinks are shown by in the target. */
const OTHER_SIDE: TableOperation = { id: SET_OTHER_SIDE, label: 'Make two-way', params: [{ name: 'backlinkName', label: 'Backlink name', control: 'text', required: false }] };
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
export function gesturesOf(table: TableData, groups: readonly TableGroup[] | undefined, columns: readonly { readonly id: string; readonly visible?: boolean; readonly width?: number; readonly wrap?: boolean; readonly frozen?: boolean }[], every: readonly Group[], colour: (key: string) => ThemedColour | undefined, tree?: Readonly<Record<string, TableNest>>): TableGestures {
  const { model } = table;
  const views = model.elements.filter((element) => element.type === 'View');
  const view = views.find((element) => element.id === table.view);
  const types = table.metamodel.enums.ValueType?.values ?? [];
  const properties = table.properties;
  const propertyOf = (id: Value | undefined): TableProperty | undefined => properties.find((property) => property.id === id);

  // ---- views ----

  const viewMenus = Object.fromEntries(views.map((tab): [string, TableMenu] => [tab.id, [[
    { id: 'rename', label: 'Rename', icon: 'pencil-outline', inPlace: true, request: operation('renameView', [tab.id], { name: TYPED }) },
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

  const listed = new Map(view === undefined ? [] : model.elements.filter((element) => element.parent === view.id && element.type === 'Column').map((element) => [text(element.attributes.property), element]));
  const columnSetting = (id: string, width?: number | string): TableRequest => {
    const shown = columns.find((column) => column.id === id);
    const given = width ?? shown?.width;
    return operation('setColumn', [view!.id], { property: id, visible: shown?.visible ?? true, wrap: shown?.wrap ?? false, ...(given === undefined ? {} : { width: given }) });
  };
  // A setting given to a column the view has none for would list it before every column without one, and so
  // move it there. Each such column shown before it is first given a setting of its own, so that it stays
  // where it is shown, as the standalone host does.
  const keptInPlace = (id: string, request: TableRequest): TableRequest => {
    const before = listed.has(id) ? [] : columns.slice(0, columns.findIndex((column) => column.id === id)).map((column) => column.id).filter((other) => !listed.has(other));
    return before.length === 0 ? request : { kind: 'steps', steps: [...before.map((other) => columnSetting(other)), request] };
  };

  const columnMenus = view === undefined ? {} : Object.fromEntries(properties.map((property, index): [string, TableMenu] => {
    const shown: { readonly visible?: boolean; readonly width?: number; readonly wrap?: boolean } = columns.find((column) => column.id === property.id) ?? {};
    const setting = (change: Readonly<Record<string, boolean>>): TableRequest => keptInPlace(property.id, operation('setColumn', [view.id], {
      property: property.id, visible: shown.visible ?? true, wrap: shown.wrap ?? false, ...(shown.width === undefined ? {} : { width: shown.width }), ...change,
    }));
    const frozenUpTo = text(view.attributes.freeze) === property.id;
    const selecting = property.valueType === 'selection' || property.valueType === 'multipleSelection';
    const element = model.elements.find((found) => found.id === property.id);
    const parentable = property.valueType === 'relation' && relatesToItself(text(element?.attributes.targetFile), ownIdOf(model));
    const twoWay = property.valueType === 'relation' && text(element?.attributes.counterpart) !== '';
    const ownRelation = property.valueType === 'relation' && element !== undefined && element.attributes.computed !== true && text(element.attributes.targetFile) !== '';
    const menu: TableEntry[][] = [
      [
        { id: 'rename', label: 'Rename', icon: 'pencil-outline', inPlace: true, request: operation('renameProperty', [property.id], { name: TYPED }) },
        {
          id: 'changeType', label: 'Change type', icon: 'swap-horizontal',
          ...(property.title ? { disabled: 'The column that names a row is always text.' } : {}),
          entries: types.filter((type) => type.key !== 'relation').map((type): TableEntry => ({ id: type.key, label: type.label, ...icon(type.icon), request: operation('changePropertyType', [property.id], { valueType: type.key }) })),
        },
        ...(selecting ? [{ id: 'options', label: 'Edit options', icon: 'format-list-bulleted-square', opens: { panel: 'options' as const, property: property.id } }] : []),
        ...(ownRelation ? [editRelation(property.id, element!, ownIdOf(model))] : []),
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
        { id: 'insertLeft', label: 'Insert left', icon: 'table-column-plus-before', named: true, entries: index === 0 ? newProperty(undefined, true) : newProperty(properties[index - 1].id) },
        { id: 'insertRight', label: 'Insert right', icon: 'table-column-plus-after', named: true, entries: newProperty(property.id) },
        { id: 'duplicate', label: 'Duplicate', icon: 'content-duplicate', request: operation('duplicateProperty', [property.id]) },
        // One side of a two-way relation asks what becomes of the other (etalii.adp spec 080, FR-008).
        twoWay
          ? { id: 'delete', label: 'Delete', icon: 'trash-can-outline', entries: [
            { id: 'deleteBoth', label: 'Delete both sides', request: operation('deleteProperty', [property.id], { otherSide: 'delete' }) },
            { id: 'keepOther', label: 'Keep the other side as a one-way relation', request: operation('deleteProperty', [property.id], { otherSide: 'keep' }) },
          ] }
          : { id: 'delete', label: 'Delete', icon: 'trash-can-outline', request: operation('deleteProperty', [property.id]) },
      ],
    ];
    return [property.id, menu];
  }));

  // ---- rows ----

  const remove: TableEntry = { id: 'delete', label: 'Delete row', plural: 'Delete {count} rows', icon: 'trash-can-outline', request: operation('deleteRows', [SELECTION]) };
  const rowMenu: TableMenu = [[remove]];
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

  // ---- a group heading: fold, up, down, hide ----

  const groupSettings = (slot: string): ModelElement[] => (view === undefined ? [] : model.elements.filter((element) => element.parent === view.id && element.type === 'GroupSetting' && element.slot === slot));
  const keys = every.map((group) => group.key);
  const reordered = (order: readonly string[]): TableRequest => ({ kind: 'steps', steps: [...groupSettings('groupOrder').map((setting) => operation('unsetGroup', [setting.id])), ...order.map((key) => operation('setGroup', [view!.id], { slot: 'groupOrder', key }))] });
  const swapped = (index: number, other: number): string[] => keys.map((key, at) => (at === index ? keys[other] : at === other ? keys[index] : key));
  const groupHeads = view === undefined ? {} : Object.fromEntries((groups ?? []).map((group) => {
    const folded = groupSettings('collapsed').find((setting) => text(setting.attributes.key) === group.key);
    const index = keys.indexOf(group.key);
    return [group.key, {
      fold: folded ? operation('unsetGroup', [folded.id]) : operation('setGroup', [view.id], { slot: 'collapsed', key: group.key }),
      ...(index > 0 ? { up: reordered(swapped(index, index - 1)) } : {}),
      ...(index >= 0 && index < keys.length - 1 ? { down: reordered(swapped(index, index + 1)) } : {}),
      hide: operation('setGroup', [view.id], { slot: 'hiddenGroups', key: group.key }),
    }];
  }));

  // ---- the fold of a row others are nested under ----

  const folds = view === undefined || tree === undefined ? undefined : Object.fromEntries(Object.entries(tree).filter(([, nest]) => nest.parent).map(([row]) => {
    const folded = groupSettings('collapsed').find((setting) => text(setting.attributes.key) === row);
    return [row, folded ? operation('unsetGroup', [folded.id]) : operation('setGroup', [view.id], { slot: 'collapsed', key: row })];
  }));

  // ---- the bar of selected rows, a new option from a cell, a row added under another ----

  const setterOf = (property: TableProperty): TableField | undefined => {
    const on = [ROW];
    switch (property.valueType) {
      case 'text': return { control: 'text', value: '', request: operation('setText', on, { property: property.id, value: TYPED }) };
      case 'number': return { control: 'number', value: '', request: operation('setNumber', on, { property: property.id, value: TYPED }) };
      case 'checkbox': return { control: 'choice', value: '', options: [{ value: 'true', label: 'Checked' }, { value: 'false', label: 'Unchecked' }], request: operation('setChecked', on, { property: property.id, value: TYPED }) };
      case 'date': return { control: 'date', value: '', request: operation('setDate', on, { property: property.id, value: TYPED }) };
      case 'dateTime': return { control: 'dateTime', value: '', request: operation('setDateTime', on, { property: property.id, value: TYPED }) };
      case 'time': return { control: 'time', value: '', request: operation('setTime', on, { property: property.id, value: TYPED }) };
      case 'selection': return { control: 'choice', value: '', options: property.options.map((option) => ({ value: option.id, label: option.name })), request: operation('setOption', on, { property: property.id, value: TYPED }) };
      case 'multipleSelection': return { control: 'choice', value: '', options: property.options.map((option) => ({ value: option.id, label: option.name })), request: { kind: 'item', row: ROW, property: property.id, value: TYPED, present: true } };
      default: return undefined;
    }
  };
  const bulk = { set: Object.fromEntries(properties.flatMap((property) => { const field = setterOf(property); return field && !property.readOnly ? [[property.id, field]] : []; })), remove };
  const createOption = Object.fromEntries(properties.filter((property) => property.valueType === 'selection' || property.valueType === 'multipleSelection').map((property): [string, TableRequest] => [property.id, {
    kind: 'steps', steps: [operation('addOption', [property.id], { name: TYPED }), property.many
      ? { kind: 'item', row: ROW, property: property.id, value: '$created:0', present: true }
      : operation('setOption', [ROW], { property: property.id, value: '$created:0' })],
  }]));
  // In a view with a sort the row is placed by the sort; elsewhere directly under the one the key was pressed on.
  const sorted = view !== undefined && model.elements.some((element) => element.parent === view.id && element.type === 'Sort');
  const newRowAfter: TableRequest = sorted ? newRow : { kind: 'steps', steps: [newRow, operation('moveRow', ['$created:0'], { after: ROW })] };

  // ---- what dragging moves: a view's tab, a column's header, a row's handle; a column's border ----

  const placed = (after?: string): Readonly<Record<string, string>> => (after === undefined ? {} : { after });
  const viewIds = views.map((tab) => tab.id);
  const columnOf = (id: string): ModelElement | undefined => listed.get(id);
  // The order of the columns is the view's own: a column moved there, and each before it, is first given a setting where it has none.
  const columnMoved = (id: string, after?: string): TableRequest => {
    const others = columns.map((column) => column.id).filter((other) => other !== id);
    const order = [...others.slice(0, after === undefined ? 0 : others.indexOf(after) + 1), id];
    const unlisted = order.filter((other) => columnOf(other) === undefined);
    const ref = (other: string): string => columnOf(other)?.id ?? `$created:${unlisted.indexOf(other)}`;
    const move = operation('moveColumn', [ref(id)], placed(after === undefined ? undefined : ref(after)));
    return unlisted.length === 0 ? move : { kind: 'steps', steps: [...unlisted.map((other) => columnSetting(other)), move] };
  };
  const moves: TableMoves | undefined = view === undefined ? undefined : {
    views: Object.fromEntries(viewIds.map((id) => [id, movesOf(viewIds, id, (after) => operation('moveView', [id], placed(after)))])),
    columns: Object.fromEntries(columns.map((column) => [column.id, movesOf(columns.map((other) => other.id), column.id, (after) => columnMoved(column.id, after))])),
    // In a view with a sort, the sort places the rows: a row's handle moves nothing.
    ...(sorted ? {} : { rows: { first: operation('moveRow', [ROW]), after: operation('moveRow', [ROW], { after: TYPED }) } }),
  };
  const widths = view === undefined ? undefined : Object.fromEntries(columns.map((column) => [column.id, keptInPlace(column.id, columnSetting(column.id, TYPED))]));

  // ---- the sorts and filters, in words ----

  const settings = (type: string): ModelElement[] => (view === undefined ? [] : model.elements.filter((element) => element.parent === view.id && element.type === type));
  const sorts = settings('Sort').flatMap((sort): TableBarItem[] => {
    const property = propertyOf(sort.attributes.property);
    const descending = sort.attributes.direction === 'descending';
    return property ? [{ id: sort.id, kind: 'sort', text: property.name, descending, remove: operation('removeSort', [sort.id]), opens: { panel: 'sort' } }] : [];
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
      return [{ id: condition.id, kind: 'filter', text: `${count} ${count === 1 ? 'rule' : 'rules'}`, remove: operation('removeCondition', [condition.id]), opens: { panel: 'filter' } }];
    }
    const property = propertyOf(condition.attributes.property);
    return property ? [{ id: condition.id, kind: 'filter', text: compared(condition, property), remove: operation('removeCondition', [condition.id]), opens: { panel: 'filter' } }] : [];
  });

  return {
    newView: operation('addView', [], { name: 'Table' }),
    viewMenus,
    newProperty: newProperty(properties[properties.length - 1]?.id),
    columnMenus,
    rowMenu,
    groupHeads,
    bulk,
    createOption,
    newRowAfter,
    ...(folds ? { folds } : {}),
    ...(moves ? { moves } : {}),
    ...(widths ? { widths } : {}),
    newRow,
    newRowIn,
    items: [...sorts, ...filters],
    ...(view === undefined ? {} : { settings: settingsOf(table, view, columns, every), calculations: calculationsFor(table, view) }),
    options: optionsOf(table, colour),
  };
}

/** Whether a relation's target is the document itself: `.`, or a link to its own id (FBL 17.1). */
function relatesToItself(target: string, own: string): boolean {
  return target === SELF || (own !== '' && isLink(target) && parseLink(target)?.documentId === own);
}

/**
 * "Edit relation" (spec 079, FR-011; spec 080, FR-011): the file the relation relates to, which is
 * said and never changed, how many rows a cell holds, and whether the other file shows it too.
 */
function editRelation(property: string, element: ModelElement, own: string): TableEntry {
  const target = text(element.attributes.targetFile);
  const one = element.attributes.limit === 'one';
  const twoWay = text(element.attributes.counterpart) !== '' || text(element.attributes.backlinkName) !== '';
  const named = relatesToItself(target, own) ? 'this table' : isLink(target) ? parseLink(target)?.documentName ?? target : target;
  return {
    id: 'relation', label: 'Edit relation', icon: 'arrow-top-right', entries: [
      { id: 'target', label: `Related to ${named}`, disabled: 'The file a relation relates to is chosen when it is made.' },
      { id: 'limitNone', label: 'No limit', checked: !one, request: operation(SET_LIMIT, [property], { limit: 'none' }) },
      { id: 'limitOne', label: '1 row', checked: one, request: operation(SET_LIMIT, [property], { limit: 'one' }) },
      // Made two-way, the other side's name is asked first; left empty, it is this table's (spec 080, FR-011).
      { id: 'twoWay', label: 'Two-way relation', checked: twoWay, request: operation(SET_OTHER_SIDE, [property], { twoWay: !twoWay }), ...(twoWay ? {} : { asks: OTHER_SIDE }) },
    ],
  };
}
