import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FromCanvas, ToCanvas } from '../../../src/core/frame/protocol';
import type { TableGestures, TableProperty, TableRequest, TableView } from '../../../src/core/tool/tableView';
import { Table } from '../../../src/webview/table/table';

// The table surface of a tool type that gives its gestures (etalii.adp spec 079, FR-001 to FR-012):
// the standalone host's layout, each control making the request its tool type gave it.

const property = (id: string, more: Partial<TableProperty> = {}): TableProperty => ({
  id, name: id, valueType: 'text', editor: 'text', many: false, title: false, options: [], visible: true, wrap: false, frozen: false, ...more,
});
const op = (operation: string, on: readonly string[] = [], args: Readonly<Record<string, string | number | boolean>> = {}): TableRequest => ({ kind: 'operation', operation, on, args });

const gestures: TableGestures = {
  newView: op('addView', [], { name: 'Table' }),
  viewMenus: { va: [[{ id: 'rename', label: 'Rename', request: op('renameView', ['va']) }, { id: 'delete', label: 'Delete', disabled: 'A table keeps at least one view.', request: op('deleteView', ['va']) }]] },
  newProperty: [{ id: 'text', label: 'Text', request: op('addProperty', [], { valueType: 'text', after: 'size' }) }, { id: 'number', label: 'Number', request: op('addProperty', [], { valueType: 'number', after: 'size' }) }],
  columnMenus: {
    size: [
      [{ id: 'rename', label: 'Rename', request: op('renameProperty', ['size']) }, { id: 'changeType', label: 'Change type', entries: [{ id: 'text', label: 'Text', request: op('changePropertyType', ['size'], { valueType: 'text' }) }] }],
      [{ id: 'sortAscending', label: 'Sort ascending', request: op('addSort', ['va'], { property: 'size', direction: 'ascending' }) }],
    ],
  },
  rowMenu: [[{ id: 'delete', label: 'Delete', request: op('deleteRows', ['$selection']) }]],
  newRow: op('addRow'),
  newRowIn: { big: { kind: 'steps', steps: [op('addRow'), op('setOption', ['$created:0'], { property: 'kind', value: 'big' })] } },
  items: [{ id: 's1', kind: 'sort', text: 'size', descending: true, remove: op('removeSort', ['s1']) }, { id: 'c1', kind: 'filter', text: 'kind is Big', remove: op('removeCondition', ['c1']) }],
};

const view: TableView = {
  name: 'Things',
  properties: [property('name', { title: true }), property('size', { valueType: 'number', editor: 'number' })],
  rows: [
    { id: 'r1', title: 'One', cells: { name: { id: 'r1.name', value: 'One', items: [], text: 'One' } } },
    { id: 'r2', title: 'Two', cells: { name: { id: 'r2.name', value: 'Two', items: [], text: 'Two' } } },
  ],
  total: 2,
  views: [{ id: 'va', name: 'All', active: true }, { id: 'vb', name: 'Board', active: false }],
  settings: [],
  operations: {
    renameView: { id: 'renameView', label: 'Rename', params: [{ name: 'name', label: 'Name', control: 'text', required: true }] },
    renameProperty: { id: 'renameProperty', label: 'Rename', params: [{ name: 'name', label: 'Name', control: 'text', required: true }] },
    addProperty: { id: 'addProperty', label: 'New property', params: [{ name: 'name', label: 'Name', control: 'text', required: true }, { name: 'valueType', label: 'Type', control: 'choice', required: true, value: 'text', options: [] }] },
    addView: { id: 'addView', label: 'New view', params: [{ name: 'name', label: 'Name', control: 'text', required: true, value: 'Table' }] },
    addRow: { id: 'addRow', label: 'New row', params: [] },
    deleteRows: { id: 'deleteRows', label: 'Delete', params: [] },
  },
  readOnly: false,
  gestures,
};

let sent: FromCanvas[];
let surface: Table;
const message = (shown: TableView = view): ToCanvas => ({ v: 2, type: 'view', origin: 'etalii/things', kind: 'designer', view: shown, actions: [{ id: 'addRow', label: 'Add row', enabled: true }], version: 1 });
const edits = (): TableRequest[] => sent.filter((given) => given.type === 'edit').map((given) => (given as Extract<FromCanvas, { type: 'edit' }>).request as TableRequest);
const all = <E extends HTMLElement = HTMLElement>(selector: string): E[] => [...document.querySelectorAll<E>(selector)];
const one = <E extends HTMLElement = HTMLElement>(selector: string): E => document.querySelector<E>(selector)!;
const press = (target: Element): void => {
  for (const kind of ['mousedown', 'mouseup', 'click']) target.dispatchEvent(new MouseEvent(kind, { bubbles: true, cancelable: true }));
};
const entries = (): HTMLElement[] => (one('.adp-table-menu').hidden ? [] : all('.adp-table-menu [role="menuitem"], .adp-table-menu [role="menuitemcheckbox"]'));
const entry = (id: string): HTMLElement => entries().find((item) => item.dataset.entry === id)!;
const tick = (box: HTMLInputElement): void => {
  box.checked = !box.checked;
  box.dispatchEvent(new Event('change', { bubbles: true }));
};

beforeEach(() => {
  document.body.replaceChildren();
  document.body.className = 'vscode-dark';
  sent = [];
  surface = new Table(document.body, (given) => sent.push(given));
  surface.receive(message());
});

describe('a table with gestures', () => {
  it('has a lead column of checkboxes and handles, no row numbers, no toolbar of actions and no menu buttons', () => {
    expect(all('tbody [role="rowheader"]').map((cell) => cell.textContent)).toEqual(['', '']);
    expect(all('tbody .adp-table-check')).toHaveLength(2);
    expect(all('tbody .adp-table-handle')).toHaveLength(2);
    expect(one('thead .adp-table-all')).not.toBeNull();
    expect(all('.adp-table-action')).toHaveLength(0);
    expect(all('.adp-table-menu-button')).toHaveLength(0);
  });

  it('opens the menu of the active tab when it is pressed, and asks what an entry leaves out', () => {
    press(one('[role="tab"][data-view="va"]'));
    expect(entries().map((item) => item.textContent)).toEqual(['Rename', 'Delete']);
    expect(entry('delete').getAttribute('aria-disabled')).toBe('true');
    expect(entry('delete').title).toBe('A table keeps at least one view.');
    press(entry('delete'));
    expect(edits()).toEqual([]);
    press(entry('rename'));
    const name = one<HTMLInputElement>('.adp-table-params input[name="name"]');
    name.value = 'Every thing';
    one<HTMLFormElement>('.adp-table-params').requestSubmit();
    expect(edits()).toEqual([op('renameView', ['va'], { name: 'Every thing' })]);
  });

  it('shows another view when its tab is pressed, and makes a new one with the + after the tabs', () => {
    press(one('[role="tab"][data-view="vb"]'));
    press(one('.adp-table-new-view'));
    expect(edits()).toEqual([{ kind: 'show', view: 'vb' }, op('addView', [], { name: 'Table' })]);
  });

  it('keeps the search behind a magnifier until it is pressed', () => {
    expect(one('.adp-table-search').hidden).toBe(true);
    press(one('.adp-table-find'));
    expect(one('.adp-table-search').hidden).toBe(false);
    expect(document.activeElement).toBe(one('.adp-table-search'));
  });

  it('says the sorts and filters in words, and removes one with its ×', () => {
    expect(all('.adp-table-item').map((item) => item.querySelector('.adp-table-item-text')?.textContent)).toEqual(['size', 'kind is Big']);
    press(all('.adp-table-item-remove')[1]);
    expect(edits()).toEqual([op('removeCondition', ['c1'])]);
  });

  it('opens a column\'s menu when its header is pressed, in groups, with entries of entries', () => {
    press(one('[role="columnheader"][data-id="size"]'));
    expect(all('.adp-table-menu > li').map((item) => (item.getAttribute('role') === 'separator' ? '—' : item.textContent?.replace('›', '')))).toEqual(['Rename', 'Change type', '—', 'Sort ascending']);
    press(entry('changeType'));
    expect(entries().map((item) => item.textContent)).toEqual(['Text']);
    press(entry('text'));
    expect(edits()).toEqual([op('changePropertyType', ['size'], { valueType: 'text' })]);
  });

  it('makes a new property from the + after the headers: its name, then its type', () => {
    press(one('.adp-table-new-property'));
    one<HTMLInputElement>('.adp-table-property-name').value = 'Weight';
    press(one('.adp-table-types [data-entry="number"]'));
    expect(edits()).toEqual([op('addProperty', [], { name: 'Weight', valueType: 'number', after: 'size' })]);
    press(one('.adp-table-new-property'));
    press(one('.adp-table-types [data-entry="text"]'));
    expect(edits()[1]).toEqual(op('addProperty', [], { name: 'Text', valueType: 'text', after: 'size' }));
  });

  it('makes a row from + New under the rows, and under a group with the group\'s request', () => {
    press(one('.adp-table-new-row'));
    surface.receive(message({ ...view, groups: [{ key: 'big', label: 'Big', collapsed: false, rows: ['r1'] }, { key: 'small', label: 'Small', collapsed: false, rows: ['r2'] }] }));
    expect(all('.adp-table-new-row').map((button) => button.dataset.group)).toEqual(['big']);
    press(one('.adp-table-new-row[data-group="big"]'));
    expect(edits()).toEqual([op('addRow'), gestures.newRowIn!.big]);
  });

  it('selects rows by their checkboxes, and all of them by the one in the header; a row\'s menu acts on them', () => {
    tick(one<HTMLInputElement>('tbody tr[data-id="r2"] .adp-table-check'));
    tick(one<HTMLInputElement>('tbody tr[data-id="r1"] .adp-table-check'));
    expect(one<HTMLInputElement>('.adp-table-all').checked).toBe(true);
    one('tbody tr[data-id="r1"] [role="gridcell"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    press(entry('delete'));
    expect(edits()).toEqual([op('deleteRows', ['r2', 'r1'])]);
    tick(one<HTMLInputElement>('.adp-table-all'));
    expect(all<HTMLInputElement>('tbody .adp-table-check').map((box) => box.checked)).toEqual([false, false]);
  });

  it('selects a row by a press on its checkbox, which focuses the checkbox before it changes', () => {
    const box = one<HTMLInputElement>('tbody tr[data-id="r1"] .adp-table-check');
    // A press with the pointer focuses the checkbox first; that focus selects nothing of its own.
    box.focus();
    tick(box);
    expect(box.checked).toBe(true);
    expect(one<HTMLInputElement>('.adp-table-all').checked).toBe(false);
    const other = one<HTMLInputElement>('tbody tr[data-id="r2"] .adp-table-check');
    other.focus();
    tick(other);
    expect([box.checked, other.checked, one<HTMLInputElement>('.adp-table-all').checked]).toEqual([true, true, true]);
  });

  it('draws the surface it drew before for a table without gestures', () => {
    surface.receive(message({ ...view, gestures: undefined }));
    expect(all('tbody [role="rowheader"]').map((cell) => cell.textContent)).toEqual(['1', '2']);
    expect(all('.adp-table-action')).toHaveLength(1);
    expect(one('.adp-table-search').hidden).toBe(false);
  });
});

describe('a column of options on a table with gestures', () => {
  it('draws no strip of options when the column is selected, so the grid does not move under the pointer', () => {
    surface.receive(message({ ...view, properties: [...view.properties, property('kind', { valueType: 'selection', editor: 'choice', options: [{ id: 'big', name: 'Big' }] })] }));
    press(one('[role="columnheader"][data-id="kind"]'));
    expect(one('.adp-table-options').hidden).toBe(true);
  });
});

describe('the settings control and the panels of a table with gestures', () => {
  const settings: NonNullable<TableGestures['settings']> = {
    visibility: [
      { id: 'name', label: 'name', checked: true, disabled: 'The column that names a row is always there.', request: op('setColumn', ['va'], { property: 'name', visible: false }) },
      { id: 'size', label: 'size', checked: true, request: op('setColumn', ['va'], { property: 'size', visible: false }) },
    ],
    filter: {
      id: 'va', match: [{ id: 'all', label: 'All', checked: true, request: op('setMatch', ['va'], { match: 'all' }) }, { id: 'any', label: 'Any', request: op('setMatch', ['va'], { match: 'any' }) }],
      conditions: [{
        id: 'c1',
        properties: [{ id: 'size', label: 'size', checked: true }],
        operators: [{ id: 'equals', label: '=', checked: true }, { id: 'greater-than', label: '>', request: op('setCondition', ['c1'], { operator: 'greater-than' }) }],
        value: { control: 'number', value: '3', request: { kind: 'steps', steps: [op('addCondition', ['va'], { property: 'size', operator: 'equals', number: '$typed' }), op('removeCondition', ['c1'])] } },
        remove: op('removeCondition', ['c1']),
      }],
      groups: [],
      add: [{ id: 'name', label: 'name', request: op('addCondition', ['va'], { property: 'name', operator: 'contains' }) }],
      addGroup: { id: 'addGroup', label: 'Add filter group', request: op('addFilterGroup', ['va']) },
    },
    sortLines: [{ id: 's1', label: 'size', direction: [{ id: 'ascending', label: 'Ascending' }, { id: 'descending', label: 'Descending', checked: true }], remove: op('removeSort', ['s1']) }],
    addSort: [{ id: 'name', label: 'name', request: op('addSort', ['va'], { property: 'name', direction: 'ascending' }) }],
    group: {
      by: [{ id: '', label: 'None' }, { id: 'kind', label: 'kind', checked: true }],
      groups: [{ id: 'big', label: 'Big', checked: true, request: op('setGroup', ['va'], { slot: 'hiddenGroups', key: 'big' }) }],
      showAll: { id: 'showAll', label: 'Show all', disabled: 'No group is hidden.', request: { kind: 'steps', steps: [] } },
    },
  };
  const more: TableGestures = {
    ...gestures,
    items: gestures.items!.map((item) => ({ ...item, opens: { panel: item.kind } })),
    columnMenus: { size: [[{ id: 'options', label: 'Edit options', opens: { panel: 'options', property: 'size' } }]] },
    settings,
    options: { size: { options: [{ id: 'o1', name: 'Small', rename: op('renameOption', ['o1'], { name: '$typed' }), colours: [{ id: 'red', label: 'Red', request: op('recolourOption', ['o1'], { colour: 'red' }) }], remove: op('deleteOption', ['o1']) }], add: op('addOption', ['size'], { name: '$typed' }) } },
    calculations: { name: [[{ id: '', label: 'None', checked: true }], [{ id: 'countAll', label: 'Count all', request: op('calculate', ['va'], { property: 'name', calculation: 'countAll' }) }]], size: [[{ id: '', label: 'None' }]] },
  };
  const shown: TableView = { ...view, gestures: more, properties: view.properties.map((given) => (given.id === 'size' ? { ...given, summary: { label: 'Sum', text: '12' } } : given)) };
  const panel = (): HTMLElement => one('.adp-table-panel');
  const change = (control: HTMLInputElement | HTMLSelectElement, value: string): void => {
    control.value = value;
    control.dispatchEvent(new Event('change', { bubbles: true }));
  };

  beforeEach(() => surface.receive(message(shown)));

  it('lists the four editors under one control, opens one at a time and closes it', () => {
    press(one('.adp-table-tune'));
    expect(entries().map((item) => item.textContent)).toEqual(['Property visibility', 'Filter', 'Sort', 'Group']);
    press(entry('filter'));
    expect([panel().hidden, panel().dataset.panel]).toEqual([false, 'filter']);
    press(one('.adp-table-tune'));
    press(entry('sort'));
    expect(all('.adp-table-panel')).toHaveLength(1);
    expect(panel().dataset.panel).toBe('sort');
    press(one('.adp-table-panel-close'));
    expect(panel().hidden).toBe(true);
  });

  it('opens the editor of a sort or a filter when its item is pressed', () => {
    press(all('.adp-table-item-text')[1]);
    expect(panel().dataset.panel).toBe('filter');
    press(all('.adp-table-item-text')[0]);
    expect(panel().dataset.panel).toBe('sort');
    expect(edits()).toEqual([]);
  });

  it('shows and hides a property by its tick, the title\'s kept set', () => {
    press(one('.adp-table-tune'));
    press(entry('visibility'));
    const boxes = all<HTMLInputElement>('.adp-table-panel input[type="checkbox"]');
    expect(boxes.map((box) => [box.checked, box.disabled])).toEqual([[true, true], [true, false]]);
    tick(boxes[1]);
    expect(edits()).toEqual([op('setColumn', ['va'], { property: 'size', visible: false })]);
  });

  it('edits a condition in place: its comparison, and its value as a number', () => {
    press(all('.adp-table-item-text')[1]);
    change(one<HTMLSelectElement>('.adp-table-condition select[aria-label="Comparison"]'), 'greater-than');
    change(one<HTMLInputElement>('.adp-table-condition input[aria-label="Value"]'), '5');
    expect(edits()).toEqual([op('setCondition', ['c1'], { operator: 'greater-than' }), { kind: 'steps', steps: [op('addCondition', ['va'], { property: 'size', operator: 'equals', number: 5 }), op('removeCondition', ['c1'])] }]);
  });

  it('adds a filter and a sort from their lists, and hides a group by its eye', () => {
    press(all('.adp-table-item-text')[1]);
    change(one<HTMLSelectElement>('.adp-table-panel select[aria-label="Add filter"]'), 'name');
    press(all('.adp-table-item-text')[0]);
    change(one<HTMLSelectElement>('.adp-table-panel select[aria-label="Add sort"]'), 'name');
    press(one('.adp-table-tune'));
    press(entry('group'));
    press(one('.adp-table-eye'));
    press(all<HTMLElement>('.adp-table-panel-button').find((button) => button.textContent === 'Show all')!);
    expect(edits()).toEqual([op('addCondition', ['va'], { property: 'name', operator: 'contains' }), op('addSort', ['va'], { property: 'name', direction: 'ascending' }), op('setGroup', ['va'], { slot: 'hiddenGroups', key: 'big' })]);
  });

  it('offers all or any from the first condition, as the standalone host does', () => {
    press(all('.adp-table-item-text')[1]);
    change(one<HTMLSelectElement>('.adp-table-filter select[aria-label="All or any"]'), 'any');
    expect(edits()).toEqual([op('setMatch', ['va'], { match: 'any' })]);
  });

  it('keeps what is typed in an editor when the same view comes again', () => {
    press(all('.adp-table-item-text')[1]);
    const value = one<HTMLInputElement>('.adp-table-condition input[aria-label="Value"]');
    value.value = '42';
    surface.receive(message(shown));
    expect(one<HTMLInputElement>('.adp-table-condition input[aria-label="Value"]')).toBe(value);
    expect(value.value).toBe('42');
  });

  it('edits a column\'s options in its panel: rename in place, colour, delete, and a new one', () => {
    press(one('[role="columnheader"][data-id="size"]'));
    press(entry('options'));
    expect(panel().dataset.panel).toBe('options');
    change(one<HTMLInputElement>('.adp-table-panel input[aria-label="Name of Small"]'), 'Tiny');
    change(one<HTMLSelectElement>('.adp-table-panel select[aria-label="Colour of Small"]'), 'red');
    press(one('.adp-table-panel .adp-table-panel-remove'));
    const adding = one<HTMLInputElement>('.adp-table-panel input[aria-label="New option"]');
    adding.value = 'Huge';
    adding.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(edits()).toEqual([op('renameOption', ['o1'], { name: 'Tiny' }), op('recolourOption', ['o1'], { colour: 'red' }), op('deleteOption', ['o1']), op('addOption', ['size'], { name: 'Huge' })]);
  });

  it('has a calculation line: each column\'s calculation, or Calculate, whose menu chooses one', () => {
    expect(all('.adp-table-calculate').map((button) => button.textContent)).toEqual(['Calculate', 'Sum 12']);
    press(all('.adp-table-calculate')[0]);
    expect(entries().map((item) => [item.querySelector('.adp-menu-label')?.textContent, item.getAttribute('aria-checked')])).toEqual([['None', 'true'], ['Count all', null]]);
    press(entry('countAll'));
    expect(edits()).toEqual([op('calculate', ['va'], { property: 'name', calculation: 'countAll' })]);
  });
});

describe('the rows and groups of a table with gestures', () => {
  const kind = property('kind', { valueType: 'selection', editor: 'choice', options: [{ id: 'big', name: 'Big' }, { id: 'small', name: 'Small' }] });
  const more: TableGestures = {
    ...gestures,
    rowMenu: [[{ id: 'delete', label: 'Delete row', plural: 'Delete {count} rows', request: op('deleteRows', ['$selection']) }]],
    groupHeads: {
      big: { fold: op('setGroup', ['va'], { slot: 'collapsed', key: 'big' }), down: { kind: 'steps', steps: [op('setGroup', ['va'], { slot: 'groupOrder', key: 'small' })] }, hide: op('setGroup', ['va'], { slot: 'hiddenGroups', key: 'big' }) },
      small: { fold: op('unsetGroup', ['g1']), up: { kind: 'steps', steps: [op('setGroup', ['va'], { slot: 'groupOrder', key: 'small' })] }, hide: op('setGroup', ['va'], { slot: 'hiddenGroups', key: 'small' }) },
    },
    bulk: {
      set: { size: { control: 'number', value: '', request: op('setNumber', ['$row'], { property: 'size', value: '$typed' }) } },
      remove: { id: 'delete', label: 'Delete row', plural: 'Delete {count} rows', request: op('deleteRows', ['$selection']) },
    },
    createOption: { kind: { kind: 'steps', steps: [op('addOption', ['kind'], { name: '$typed' }), op('setOption', ['$row'], { property: 'kind', value: '$created:0' })] } },
    newRowAfter: { kind: 'steps', steps: [op('addRow'), op('moveRow', ['$created:0'], { after: '$row' })] },
  };
  const shown: TableView = {
    ...view, properties: [...view.properties, kind], gestures: more,
    groups: [{ key: 'big', label: 'Big', collapsed: false, rows: ['r1'] }, { key: 'small', label: 'Small', collapsed: true, rows: ['r2'] }],
  };
  beforeEach(() => surface.receive(message(shown)));

  it('gives a group heading a fold, its count, and controls that move and hide it', () => {
    const heads = all('tr.adp-table-group');
    expect(heads.map((head) => [...head.querySelectorAll<HTMLElement>('[data-control]')].map((control) => control.dataset.control))).toEqual([['fold', 'down', 'hide'], ['fold', 'up', 'hide']]);
    expect(heads[1].querySelector('.adp-table-fold')?.getAttribute('aria-expanded')).toBe('false');
    press(heads[0].querySelector('[data-control="fold"]')!);
    press(heads[0].querySelector('[data-control="down"]')!);
    press(heads[1].querySelector('[data-control="hide"]')!);
    expect(edits()).toEqual([more.groupHeads!.big.fold, more.groupHeads!.big.down, more.groupHeads!.small.hide]);
  });

  it('shows a bar while rows are selected: how many, a value set for all in one edit, delete, and clear', () => {
    surface.receive(message({ ...shown, groups: undefined }));
    expect(one('.adp-table-selection').hidden).toBe(true);
    tick(one<HTMLInputElement>('tbody tr[data-id="r1"] .adp-table-check'));
    tick(one<HTMLInputElement>('tbody tr[data-id="r2"] .adp-table-check'));
    expect(one('.adp-table-selection').hidden).toBe(false);
    expect(one('.adp-table-selection-count').textContent).toBe('2 selected');
    one<HTMLInputElement>('.adp-table-selection input[aria-label="Value"]').value = '4';
    press(one('.adp-table-selection [data-control="set"]'));
    expect(one('.adp-table-selection [data-control="delete"]').textContent).toBe('Delete 2 rows');
    press(one('.adp-table-selection [data-control="delete"]'));
    expect(edits()).toEqual([
      { kind: 'steps', steps: [op('setNumber', ['r1'], { property: 'size', value: 4 }), op('setNumber', ['r2'], { property: 'size', value: 4 })] },
      op('deleteRows', ['r1', 'r2']),
    ]);
    press(one('.adp-table-selection [data-control="clear"]'));
    expect(one('.adp-table-selection').hidden).toBe(true);
  });

  it('keeps the sort and filter items beside the bar of the rows selected, as the standalone host does', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/webview/table/table.css', 'utf8');
    document.head.append(style);
    try {
      surface.receive(message({ ...shown, groups: undefined }));
      tick(one<HTMLInputElement>('tbody tr[data-id="r1"] .adp-table-check'));
      expect(one('.adp-table-selection').hidden).toBe(false);
      expect(one('.adp-table-settings').textContent).toContain('size');
      expect(getComputedStyle(one('.adp-table-settings')).display).not.toBe('none');
      expect(getComputedStyle(one('.adp-table-find')).display).not.toBe('none');
    } finally {
      style.remove();
    }
  });

  it('says how many rows a row\'s menu deletes', () => {
    surface.receive(message({ ...shown, groups: undefined }));
    tick(one<HTMLInputElement>('tbody tr[data-id="r1"] .adp-table-check'));
    tick(one<HTMLInputElement>('tbody tr[data-id="r2"] .adp-table-check'));
    one('tbody tr[data-id="r1"] [role="gridcell"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(entries().map((item) => item.textContent)).toEqual(['Delete 2 rows']);
  });

  it('adds a row under the one Shift+Enter is pressed on', () => {
    surface.receive(message({ ...shown, groups: undefined }));
    const cell = one<HTMLElement>('tbody tr[data-id="r1"] [role="gridcell"][data-column="name"]');
    cell.focus();
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    expect(edits()).toEqual([{ kind: 'steps', steps: [op('addRow'), op('moveRow', ['$created:0'], { after: 'r1' })] }]);
  });

  it('opens a cell\'s options with a search field that has the focus, and makes an option of a new name', () => {
    surface.receive(message({ ...shown, groups: undefined }));
    const cell = one<HTMLElement>('tbody tr[data-id="r2"] [role="gridcell"][data-column="kind"]');
    cell.focus();
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const search = one<HTMLInputElement>('.adp-table-list-search');
    expect(document.activeElement).toBe(search);
    search.value = 'sma';
    search.dispatchEvent(new Event('input'));
    expect(all('.adp-table-list [role="option"]').filter((item) => !item.hidden).map((item) => item.textContent)).toEqual(['Small']);
    search.value = 'Huge';
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(edits()).toEqual([{ kind: 'steps', steps: [op('addOption', ['kind'], { name: 'Huge' }), op('setOption', ['r2'], { property: 'kind', value: '$created:0' })] }]);
  });
});

describe('rows nested under their parents', () => {
  const nested: TableView = {
    ...view,
    rows: [...view.rows, { id: 'r3', title: 'Three', cells: { name: { id: 'r3.name', value: 'Three', items: [], text: 'Three' } } }],
    tree: { r1: { depth: 0, parent: true, collapsed: false }, r2: { depth: 1, parent: false, collapsed: false }, r3: { depth: 0, parent: true, collapsed: true } },
    gestures: { ...gestures, folds: { r1: op('setGroup', ['va'], { slot: 'collapsed', key: 'r1' }), r3: op('unsetGroup', ['g9']) } },
  };

  it('indents a row\'s title by its depth, gives a parent its fold, and folds it in one edit', () => {
    surface.receive(message(nested));
    const title = (row: string): HTMLElement => one(`tbody tr[data-id="${row}"] [role="gridcell"][data-column="name"]`);
    expect(['r1', 'r2', 'r3'].map((row) => [title(row).style.paddingLeft, one(`tbody tr[data-id="${row}"]`).getAttribute('aria-level')])).toEqual([['8px', '1'], ['26px', '2'], ['8px', '1']]);
    expect(all('.adp-table-row-fold').map((fold) => [fold.dataset.row, fold.getAttribute('aria-expanded')])).toEqual([['r1', 'true'], ['r3', 'false']]);
    press(title('r1').querySelector('.adp-table-row-fold')!);
    expect(edits()).toEqual([op('setGroup', ['va'], { slot: 'collapsed', key: 'r1' })]);
  });
});

describe('a long table', () => {
  const many = Array.from({ length: 10_000 }, (_, index) => ({ id: `r${index}`, title: `Row ${index}`, cells: { name: { id: `r${index}.name`, value: `Row ${index}`, items: [], text: `Row ${index}` } } }));
  const long: TableView = { ...view, rows: many, total: 10_000 };

  it('draws only the rows near sight, with the scroll bar spanning them all and the whole count told', async () => {
    surface.receive(message(long));
    const drawn = all('tbody tr.adp-table-row');
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(200);
    expect(one('table[role="grid"]').getAttribute('aria-rowcount')).toBe('10001');
    const spacers = all<HTMLElement>('tbody tr.adp-table-spacer');
    expect(spacers).toHaveLength(1);
    expect(parseInt(spacers[0].style.height, 10)).toBeGreaterThan(200_000);
    const scroller = one<HTMLElement>('.adp-table-scroll');
    Object.defineProperty(scroller, 'scrollTop', { value: 150_000, configurable: true });
    scroller.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const ids = all('tbody tr.adp-table-row').map((row) => Number(row.dataset.id?.slice(1)));
    expect(Math.min(...ids)).toBeLessThanOrEqual(5_000);
    expect(Math.max(...ids)).toBeGreaterThanOrEqual(5_000);
    expect(all('tbody tr.adp-table-spacer')).toHaveLength(2);
  });
});

describe('dragging on a table with gestures, and the keyboard\'s way to the same', () => {
  const placed = (after?: string): Readonly<Record<string, string>> => (after === undefined ? {} : { after });
  const listMoves = (ids: readonly string[], operation: string): Record<string, Record<string, TableRequest>> => Object.fromEntries(ids.map((id) => [id,
    Object.fromEntries([['', op(operation, [id])], ...ids.filter((other) => other !== id).map((other) => [other, op(operation, [id], placed(other))])])]));
  const moving: TableGestures = {
    ...gestures,
    viewMenus: { va: [[{ id: 'rename', label: 'Rename', inPlace: true, request: op('renameView', ['va'], { name: '$typed' }) }]] },
    columnMenus: { size: [[{ id: 'rename', label: 'Rename', inPlace: true, request: op('renameProperty', ['size'], { name: '$typed' }) }]] },
    moves: {
      views: listMoves(['va', 'vb'], 'moveView'),
      columns: listMoves(['name', 'size'], 'moveColumn'),
      rows: { first: op('moveRow', ['$row']), after: op('moveRow', ['$row'], { after: '$typed' }) },
    },
    widths: { name: op('setColumn', ['va'], { property: 'name', width: '$typed' }), size: op('setColumn', ['va'], { property: 'size', width: '$typed' }) },
  };
  const three: TableView = {
    ...view, gestures: moving, total: 3,
    rows: [...view.rows, { id: 'r3', title: 'Three', cells: { name: { id: 'r3.name', value: 'Three', items: [], text: 'Three' } } }],
  };
  /** Lays elements out side by side, or one under another, each 100 pixels. */
  const lay = (elements: readonly HTMLElement[], axis: 'x' | 'y'): void => elements.forEach((element, index) => {
    const at = index * 100;
    element.getBoundingClientRect = () => ({ left: axis === 'x' ? at : 0, top: axis === 'y' ? at : 0, width: 100, height: 100, right: axis === 'x' ? at + 100 : 100, bottom: axis === 'y' ? at + 100 : 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  });
  const mouse = (target: EventTarget, kind: string, x: number, y: number): void => {
    target.dispatchEvent(new MouseEvent(kind, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
  };
  /** Presses at one point, moves to another and lets go there, ending with the click a browser sends. */
  const dragFrom = (target: Element, from: [number, number], to: [number, number]): void => {
    mouse(target, 'mousedown', ...from);
    mouse(window, 'mousemove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
    mouse(window, 'mousemove', ...to);
    mouse(window, 'mouseup', ...to);
    mouse(target, 'click', ...to);
  };
  const key = (target: Element, name: string, more: KeyboardEventInit = {}): void => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...more }));
  };

  beforeEach(() => surface.receive(message(three)));

  it('moves a view\'s tab where it is let go, and nothing, with no menu, where it started', () => {
    lay(all('.adp-table-tab'), 'x');
    dragFrom(one('[role="tab"][data-view="va"]'), [50, 10], [180, 10]);
    expect(edits()).toEqual([op('moveView', ['va'], { after: 'vb' })]);
    dragFrom(one('[role="tab"][data-view="vb"]'), [150, 10], [140, 12]);
    expect(edits()).toHaveLength(1);
    expect(entries()).toEqual([]);
    key(one('[role="tab"][data-view="vb"]'), 'ArrowLeft', { altKey: true });
    expect(edits()[1]).toEqual(op('moveView', ['vb']));
  });

  it('shows where a header would land while it is dragged, and moves the column when it is let go', () => {
    const headers = all('thead [role="columnheader"][data-id]');
    lay(headers, 'x');
    mouse(headers[1], 'mousedown', 150, 10);
    mouse(window, 'mousemove', 20, 10);
    expect(headers[1].classList.contains('adp-table-dragging')).toBe(true);
    expect(headers[0].classList.contains('adp-table-drop-before')).toBe(true);
    mouse(window, 'mouseup', 20, 10);
    expect(headers[1].classList.contains('adp-table-dragging')).toBe(false);
    expect(edits()).toEqual([op('moveColumn', ['size'])]);
    key(one('thead [data-id="name"]'), 'ArrowRight', { altKey: true });
    expect(edits()[1]).toEqual(op('moveColumn', ['name'], { after: 'size' }));
  });

  it('widens a column while its border is dragged, never below the minimum, and writes one width when let go', () => {
    const header = one<HTMLElement>('thead [data-id="size"]');
    mouse(header.querySelector('.adp-table-resizer')!, 'mousedown', 300, 10);
    mouse(window, 'mousemove', 340, 10);
    expect(header.style.width).toBe('200px');
    expect(edits()).toEqual([]);
    mouse(window, 'mouseup', 340, 10);
    expect(edits()).toEqual([op('setColumn', ['va'], { property: 'size', width: 200 })]);
    mouse(header.querySelector('.adp-table-resizer')!, 'mousedown', 300, 10);
    mouse(window, 'mousemove', 0, 10);
    expect(header.style.width).toBe('60px');
    mouse(window, 'mouseup', 0, 10);
    expect(edits()[1]).toEqual(op('setColumn', ['va'], { property: 'size', width: 60 }));
    key(header, 'ArrowRight', { altKey: true, shiftKey: true });
    expect(edits()[2]).toEqual(op('setColumn', ['va'], { property: 'size', width: 180 }));
  });

  it('keeps a column following the pointer when the table is drawn again while its border is held, and selects nothing by the press', () => {
    const selections = (): number => sent.filter((given) => given.type === 'selection').length;
    const before = selections();
    mouse(one('thead [data-id="size"] .adp-table-resizer'), 'mousedown', 300, 10);
    expect(selections()).toBe(before);
    mouse(window, 'mousemove', 320, 10);
    // In Visual Studio Code a view comes while the border is held, as it does after a selection: the table is drawn again.
    surface.receive(message(three));
    mouse(window, 'mousemove', 340, 10);
    const header = one<HTMLElement>('thead [data-id="size"]');
    expect(header.style.width).toBe('200px');
    expect(header.classList.contains('adp-table-resizing')).toBe(true);
    mouse(window, 'mouseup', 340, 10);
    expect(edits()).toEqual([op('setColumn', ['va'], { property: 'size', width: 200 })]);
    expect(one('thead [data-id="size"]').classList.contains('adp-table-resizing')).toBe(false);
  });

  it('moves a row by its handle, the rows selected with it, and by Alt with an arrow', () => {
    const lines = all('tbody tr.adp-table-row');
    lay(lines, 'y');
    dragFrom(lines[0].querySelector('.adp-table-handle')!, [10, 50], [10, 260]);
    expect(edits()).toEqual([op('moveRow', ['r1'], { after: 'r3' })]);
    key(lines[2].querySelector('[role="rowheader"]')!, 'Escape');
    tick(lines[0].querySelector<HTMLInputElement>('.adp-table-check')!);
    tick(lines[1].querySelector<HTMLInputElement>('.adp-table-check')!);
    dragFrom(lines[1].querySelector('.adp-table-handle')!, [10, 150], [10, 260]);
    expect(edits()[1]).toEqual({ kind: 'steps', steps: [op('moveRow', ['r1'], { after: 'r3' }), op('moveRow', ['r2'], { after: 'r1' })] });
    key(lines[2].querySelector('[role="rowheader"]')!, 'ArrowUp', { altKey: true });
    expect(edits()[2]).toEqual(op('moveRow', ['r3'], { after: 'r1' }));
  });

  it('moves no row in a view whose sort places them', () => {
    surface.receive(message({ ...three, gestures: { ...moving, moves: { views: moving.moves!.views, columns: moving.moves!.columns } } }));
    const lines = all('tbody tr.adp-table-row');
    lay(lines, 'y');
    dragFrom(lines[0].querySelector('.adp-table-handle')!, [10, 50], [10, 260]);
    key(lines[0].querySelector('[role="rowheader"]')!, 'ArrowDown', { altKey: true });
    expect(edits()).toEqual([]);
    expect(lines[0].querySelector('.adp-table-movable')).toBeNull();
  });

  it('moves a sort in its editor by its handle, dragged or by the arrow keys', () => {
    const settings: NonNullable<TableGestures['settings']> = {
      visibility: [], addSort: [],
      filter: { id: 'va', match: [], conditions: [], groups: [], add: [] },
      sortLines: ['s1', 's2'].map((id, index) => ({ id, label: `sort ${index + 1}`, direction: [], remove: op('removeSort', [id]), moves: listMoves(['s1', 's2'], 'moveSort')[id] })),
      group: { by: [] },
    };
    surface.receive(message({ ...three, gestures: { ...moving, settings, items: [{ id: 's1', kind: 'sort', text: 'sort 1', opens: { panel: 'sort' } }] } }));
    press(one('.adp-table-item'));
    const handles = all('.adp-table-panel .adp-table-panel-handle');
    expect(handles.map((handle) => handle.getAttribute('aria-label'))).toEqual(['Move sort sort 1', 'Move sort sort 2']);
    lay(handles.map((handle) => handle.closest<HTMLElement>('.adp-table-panel-line')!), 'y');
    dragFrom(handles[0], [10, 50], [10, 180]);
    expect(edits()).toEqual([op('moveSort', ['s1'], { after: 's2' })]);
    key(handles[1], 'ArrowUp');
    expect(edits()[1]).toEqual(op('moveSort', ['s2']));
  });

  it('renames a view in its tab: Enter keeps it once the document has, a refusal is said at the field', () => {
    press(one('[role="tab"][data-view="va"]'));
    press(entry('rename'));
    const input = one<HTMLInputElement>('.adp-table-rename');
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('All');
    input.value = 'Every thing';
    key(input, 'Enter');
    expect(edits()).toEqual([op('renameView', ['va'], { name: 'Every thing' })]);
    surface.receive({ v: 2, type: 'outcome', seq: 1, result: 'refused', sentence: 'A view has that name.' });
    expect(one('.adp-table-rename-error').textContent).toBe('A view has that name.');
    expect(one('.adp-table-rename').getAttribute('aria-invalid')).toBe('true');
    input.value = 'Every';
    key(input, 'Enter');
    surface.receive({ v: 2, type: 'outcome', seq: 2, result: 'applied' });
    expect(all('.adp-table-rename')).toHaveLength(0);
    expect(document.activeElement).toBe(one('[role="tab"][data-view="va"]'));
  });

  it('renames a column in its header, and keeps the old name on Escape or an empty one', () => {
    press(one('thead [data-id="size"]'));
    press(entry('rename'));
    const input = one<HTMLInputElement>('thead .adp-table-rename');
    input.value = 'Weight';
    key(input, 'Escape');
    press(one('thead [data-id="size"]'));
    press(entry('rename'));
    one<HTMLInputElement>('thead .adp-table-rename').value = '  ';
    key(one('thead .adp-table-rename'), 'Enter');
    expect(edits()).toEqual([]);
    expect(one('thead [data-id="size"] .adp-table-name').hidden).toBe(false);
  });
});

describe('the findings on a table', () => {
  it('marks a cell and a row with their findings, the gravest\'s colour, and says them', () => {
    const rows = [
      { ...view.rows[0], cells: { name: { ...view.rows[0].cells.name, findings: [{ severity: 'warning' as const, message: 'Looks odd.' }, { severity: 'error' as const, message: 'Not a number.' }] } } },
      { ...view.rows[1], findings: [{ severity: 'information' as const, message: 'About the row.' }] },
    ];
    surface.receive(message({ ...view, rows }));
    const cell = one('tbody tr[data-id="r1"] [data-column="name"]');
    expect(cell.classList.contains('adp-table-finding-error')).toBe(true);
    expect(cell.getAttribute('aria-invalid')).toBe('true');
    expect(cell.querySelector('.adp-table-finding-mark')?.getAttribute('aria-label')).toBe('Looks odd.\nNot a number.');
    const lead = one('tbody tr[data-id="r2"] [role="rowheader"]');
    expect(lead.classList.contains('adp-table-finding-information')).toBe(true);
    expect(lead.title).toBe('About the row.');
    expect(all('.adp-table-finding')).toHaveLength(2);
  });
});
