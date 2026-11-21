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
const entries = (): HTMLElement[] => (one('.adp-table-menu').hidden ? [] : all('.adp-table-menu [role="menuitem"]'));
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
