// The settings control of the Knowledge designer's table, its options panels and its calculation
// line (etalii.adp spec 079, FR-005 to FR-009, FR-016 and FR-026): what each editor shows of the
// view that is shown, and the operation of `knowledge.des` each of its controls makes. The
// comparisons of each value type and which calculations suit it are the companion's
// (`knowledge.md`, "Values" and the enum `Calculation`).

import type { ModelElement, Value } from '../../disl/model';
import { TYPED, type TableCondition, type TableData, type TableEntry, type TableField, type TableFilter, type TableMenu, type TableOptionsPanel, type TableProperty, type TableRequest, type TableSettings, type TableSortLine, type ThemedColour } from '../../tool/tableView';

const operation = (name: string, on: readonly string[] = [], args: Readonly<Record<string, string | number | boolean>> = {}): TableRequest => ({ kind: 'operation', operation: name, on, args });
const steps = (list: readonly TableRequest[]): TableRequest => (list.length === 1 ? list[0] : { kind: 'steps', steps: list });
const text = (value: Value | undefined): string => (value === undefined || value === null ? '' : String(value));

/** The comparisons of each value type in the order of `knowledge.md`, the first the one a new condition starts with; every type also has the two of emptiness. */
const comparisons: Readonly<Record<string, readonly string[]>> = {
  text: ['is', 'is-not', 'contains', 'does-not-contain', 'starts-with', 'ends-with'],
  number: ['equals', 'does-not-equal', 'greater-than', 'less-than', 'at-least', 'at-most'],
  checkbox: ['is-checked', 'is-not-checked'],
  date: ['is', 'is-before', 'is-after', 'is-on-or-before', 'is-on-or-after'],
  selection: ['is', 'is-not'],
  multipleSelection: ['contains', 'does-not-contain'],
  relation: ['contains', 'does-not-contain'],
};
const comparisonsOf = (type: string): readonly string[] => [...(comparisons[type] ?? comparisons[type === 'dateTime' || type === 'time' ? 'date' : 'text']), 'is-empty', 'is-not-empty'];
const words: Readonly<Record<string, string>> = {
  is: 'Is', 'is-not': 'Is not', contains: 'Contains', 'does-not-contain': 'Does not contain', 'starts-with': 'Starts with', 'ends-with': 'Ends with',
  'is-empty': 'Is empty', 'is-not-empty': 'Is not empty', 'is-checked': 'Is checked', 'is-not-checked': 'Is not checked',
  equals: '=', 'does-not-equal': '≠', 'greater-than': '>', 'less-than': '<', 'at-least': '≥', 'at-most': '≤',
  'is-before': 'Is before', 'is-after': 'Is after', 'is-on-or-before': 'Is on or before', 'is-on-or-after': 'Is on or after',
};
/** The key a condition keeps its value under: a cell's, but one option or one row of several. */
const keyOf = (type: string): string | undefined => ({ text: 'text', number: 'number', date: 'date', dateTime: 'dateTime', time: 'time', selection: 'option', multipleSelection: 'option', relation: 'text' } as Record<string, string>)[type];

/** Which calculations suit a value type: the counts every one, the dates three more, the numbers six. */
const calculationsOf = (type: string): readonly string[] => [
  'countAll', 'countValues', 'countUnique', 'countEmpty', 'countNotEmpty', 'percentEmpty', 'percentNotEmpty',
  ...(type === 'date' || type === 'dateTime' ? ['earliest', 'latest', 'dateRange'] : []),
  ...(type === 'number' ? ['sum', 'average', 'median', 'min', 'max', 'range'] : []),
];

/** The requests that move one of several: first, by `''`, and after each other one, by its id. */
export const movesOf = (ids: readonly string[], id: string, move: (after?: string) => TableRequest): Record<string, TableRequest> =>
  Object.fromEntries([['', move()], ...ids.filter((other) => other !== id).map((other) => [other, move(other)])]);

export interface Group { readonly key: string; readonly label: string; readonly colour?: ThemedColour }

export function settingsOf(table: TableData, view: ModelElement, columns: readonly { readonly id: string; readonly visible?: boolean; readonly width?: number; readonly wrap?: boolean }[], every: readonly Group[]): TableSettings {
  const { model, properties } = table;
  const children = (parent: string, type?: string): ModelElement[] => model.elements.filter((element) => element.parent === parent && (type === undefined || element.type === type));
  const propertyOf = (id: Value | undefined): TableProperty | undefined => properties.find((property) => property.id === id);
  const enumLabel = (name: string, key: string): string => table.metamodel.enums[name]?.values.find((value) => value.key === key)?.label ?? key;

  // ---- property visibility ----

  const visibility = properties.map((property): TableEntry => {
    const shown: { readonly visible?: boolean; readonly width?: number; readonly wrap?: boolean } = columns.find((column) => column.id === property.id) ?? {};
    const visible = shown.visible ?? true;
    return {
      id: property.id, label: property.name, ...(property.icon ? { icon: property.icon.replace(/^mdi-/, '') } : {}), checked: visible,
      ...(property.title ? { disabled: 'The column that names a row is always there.' } : {}),
      request: operation('setColumn', [view.id], { property: property.id, visible: !visible, wrap: shown.wrap ?? false, ...(shown.width === undefined ? {} : { width: shown.width }) }),
    };
  });

  // ---- the filter ----

  const conditionOf = (condition: ModelElement, parent: string): TableCondition | undefined => {
    const property = propertyOf(condition.attributes.property);
    if (!property) return undefined;
    const operator = text(condition.attributes.operator);
    const key = keyOf(property.valueType);
    // The new condition is added before the old one goes, so that a filter of one condition is
    // never empty in between and its block stays where the file has it, as the standalone host's
    // change in place leaves it.
    const replaced = (args: Readonly<Record<string, string | number | boolean>>): TableRequest => steps([operation('addCondition', [parent], args), operation('removeCondition', [condition.id])]);
    const empty = operator === 'is-empty' || operator === 'is-not-empty' || property.valueType === 'checkbox' || key === undefined;
    const choice = property.valueType === 'selection' || property.valueType === 'multipleSelection';
    const value: TableField = empty
      ? { control: 'none', value: '' }
      : {
        control: choice ? 'choice' : property.valueType === 'number' ? 'number' : (['date', 'dateTime', 'time'].includes(property.valueType) ? property.valueType : 'text') as TableField['control'],
        value: text(condition.attributes[key]),
        ...(choice ? { options: property.options.map((option) => ({ value: option.id, label: option.name })) } : {}),
        request: replaced({ property: property.id, operator, [key]: TYPED }),
      };
    return {
      id: condition.id,
      properties: properties.map((other) => ({ id: other.id, label: other.name, checked: other.id === property.id, request: replaced({ property: other.id, operator: comparisonsOf(other.valueType)[0] }) })),
      operators: comparisonsOf(property.valueType).map((key) => ({ id: key, label: words[key] ?? key, checked: key === operator, request: operation('setCondition', [condition.id], { operator: key }) })),
      value,
      remove: operation('removeCondition', [condition.id]),
    };
  };
  const filterOf = (element: ModelElement, depth: number): TableFilter => {
    const match = text(element.type === 'View' ? element.attributes.filterMatch : element.attributes.match) || 'all';
    const parts = children(element.id).filter((child) => child.type === 'Condition' || child.type === 'FilterGroup');
    return {
      id: element.id,
      match: ['all', 'any'].map((key) => ({ id: key, label: enumLabel('Match', key), checked: key === match, request: operation('setMatch', [element.id], { match: key }) })),
      conditions: parts.filter((child) => child.type === 'Condition').flatMap((child) => conditionOf(child, element.id) ?? []),
      groups: parts.filter((child) => child.type === 'FilterGroup').map((child) => filterOf(child, depth + 1)),
      add: properties.map((property) => ({ id: property.id, label: property.name, ...(property.icon ? { icon: property.icon.replace(/^mdi-/, '') } : {}), request: operation('addCondition', [element.id], { property: property.id, operator: comparisonsOf(property.valueType)[0] }) })),
      addGroup: { id: 'addGroup', label: 'Add filter group', icon: 'plus', request: operation('addFilterGroup', [element.id]) },
      ...(element.type === 'FilterGroup' ? { remove: operation('removeCondition', [element.id]) } : {}),
    };
  };

  // ---- the sorts ----

  const sortElements = children(view.id, 'Sort').filter((sort) => propertyOf(sort.attributes.property));
  const sorts = sortElements.map((sort): TableSortLine => {
    const direction = text(sort.attributes.direction) || 'ascending';
    return {
      id: sort.id, label: propertyOf(sort.attributes.property)!.name,
      direction: ['ascending', 'descending'].map((key) => ({ id: key, label: enumLabel('Direction', key), checked: key === direction, request: operation('setSortDirection', [sort.id], { direction: key }) })),
      remove: operation('removeSort', [sort.id]),
      moves: movesOf(sortElements.map((other) => other.id), sort.id, (after) => operation('moveSort', [sort.id], after === undefined ? {} : { after })),
    };
  });
  const sorted = new Set(sortElements.map((sort) => text(sort.attributes.property)));
  const addSort = properties.filter((property) => !sorted.has(property.id)).map((property): TableEntry => ({
    id: property.id, label: property.name, ...(property.icon ? { icon: property.icon.replace(/^mdi-/, '') } : {}), request: operation('addSort', [view.id], { property: property.id, direction: 'ascending' }),
  }));

  // ---- the groups ----

  const groupBy = text(view.attributes.groupBy);
  const groupable = properties.filter((property) => ['selection', 'multipleSelection', 'checkbox', 'relation'].includes(property.valueType));
  const settings = (slot: string): ModelElement[] => children(view.id, 'GroupSetting').filter((setting) => setting.slot === slot);
  const hidden = settings('hiddenGroups');
  const ordered = (descending: boolean): TableRequest => {
    const keys = [...every].sort((a, b) => a.label.localeCompare(b.label) * (descending ? -1 : 1)).map((group) => group.key);
    return steps([...settings('groupOrder').map((setting) => operation('unsetGroup', [setting.id])), ...keys.map((key) => operation('setGroup', [view.id], { slot: 'groupOrder', key }))]);
  };
  const group: TableSettings['group'] = {
    by: [
      { id: '', label: 'None', checked: groupBy === '', ...(groupBy === '' ? {} : { request: operation('ungroup', [view.id]) }) },
      ...groupable.map((property): TableEntry => ({ id: property.id, label: property.name, ...(property.icon ? { icon: property.icon.replace(/^mdi-/, '') } : {}), checked: property.id === groupBy, ...(property.id === groupBy ? {} : { request: operation('groupBy', [view.id], { property: property.id }) }) })),
    ],
    ...(groupBy === '' ? {} : {
      hideEmpty: { id: 'hideEmpty', label: 'Hide empty groups', checked: view.attributes.hideEmptyGroups === true, request: operation('hideEmptyGroups', [view.id], { hide: view.attributes.hideEmptyGroups !== true }) },
      order: [{ id: 'ascending', label: 'Name, ascending', icon: 'sort-alphabetical-ascending', request: ordered(false) }, { id: 'descending', label: 'Name, descending', icon: 'sort-alphabetical-descending', request: ordered(true) }],
      groups: every.map((each): TableEntry => {
        const setting = hidden.find((candidate) => text(candidate.attributes.key) === each.key);
        return {
          id: each.key, label: each.label || 'No value', ...(each.colour ? { colour: each.colour } : {}), checked: setting === undefined,
          request: setting ? operation('unsetGroup', [setting.id]) : operation('setGroup', [view.id], { slot: 'hiddenGroups', key: each.key }),
        };
      }),
      // A group dragged in the editor: the whole order of the groups written again, as the heading's arrows do.
      moves: Object.fromEntries(every.map((each) => [each.key, movesOf(every.map((other) => other.key), each.key, (after) => {
        const others = every.map((other) => other.key).filter((key) => key !== each.key);
        const at = after === undefined ? 0 : others.indexOf(after) + 1;
        const keys = [...others.slice(0, at), each.key, ...others.slice(at)];
        return steps([...settings('groupOrder').map((setting) => operation('unsetGroup', [setting.id])), ...keys.map((key) => operation('setGroup', [view.id], { slot: 'groupOrder', key }))]);
      })])),
      showAll: { id: 'showAll', label: 'Show all', ...(hidden.length === 0 ? { disabled: 'No group is hidden.' } : {}), request: steps(hidden.map((setting) => operation('unsetGroup', [setting.id]))) },
    }),
  };

  return { visibility, filter: filterOf(view, 0), sortLines: sorts, addSort, group };
}

/** The options panel of each selection. */
export function optionsOf(table: TableData, colour: (key: string) => ThemedColour | undefined): Record<string, TableOptionsPanel> {
  const colours = table.metamodel.enums.Colour?.values ?? [];
  return Object.fromEntries(table.properties.filter((property) => property.valueType === 'selection' || property.valueType === 'multipleSelection').map((property): [string, TableOptionsPanel] => {
    const ids = property.options.map((option) => option.id);
    return [property.id, {
      options: property.options.map((option) => {
        const current = text(table.model.elements.find((element) => element.id === option.id)?.attributes.colour) || 'default';
        return {
          id: option.id, name: option.name, ...(option.colour ? { colour: option.colour } : {}),
          rename: operation('renameOption', [option.id], { name: TYPED }),
          colours: colours.map((value): TableEntry => {
            const shown = colour(value.key);
            return { id: value.key, label: value.label, checked: value.key === current, ...(shown ? { colour: shown } : {}), request: operation('recolourOption', [option.id], { colour: value.key }) };
          }),
          remove: operation('deleteOption', [option.id]),
          moves: movesOf(ids, option.id, (after) => operation('moveOption', [option.id], after === undefined ? {} : { after })),
        };
      }),
      add: operation('addOption', [property.id], { name: TYPED }),
    }];
  }));
}

/** What the calculation line offers under each column: None, and the calculations its type has. */
export function calculationsFor(table: TableData, view: ModelElement): Record<string, TableMenu> {
  const columns = table.model.elements.filter((element) => element.parent === view.id && element.type === 'Column');
  const labelOf = (key: string): string => table.metamodel.enums.Calculation?.values.find((value) => value.key === key)?.label ?? key;
  return Object.fromEntries(table.properties.map((property): [string, TableMenu] => {
    const column = columns.find((candidate) => candidate.attributes.property === property.id);
    const current = text(column?.attributes.calculate);
    return [property.id, [
      [{ id: '', label: 'None', checked: current === '', ...(column && current !== '' ? { request: operation('removeCalculation', [column.id]) } : {}) }],
      calculationsOf(property.valueType).map((key) => ({ id: key, label: labelOf(key), checked: key === current, request: operation('calculate', [view.id], { property: property.id, calculation: key }) })),
    ]];
  }));
}
