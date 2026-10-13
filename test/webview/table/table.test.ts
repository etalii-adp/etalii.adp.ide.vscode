import { beforeEach, describe, expect, it } from 'vitest';
import type { FromCanvas, ToCanvas } from '../../../src/core/frame/protocol';
import type { Action } from '../../../src/core/frame/toolType';
import type { TableCell, TableProperty, TableRequest, TableRow, TableView } from '../../../src/core/tool/tableView';
import { Table } from '../../../src/webview/table/table';

// The table surface in a simulated browser. There is no layout there, so nothing here asks where
// a cell is drawn: only what is drawn, what has the focus and what is sent.

const red = { light: 'rgb(255, 238, 238)', dark: 'rgb(51, 0, 0)' };
const green = { light: 'rgb(238, 255, 238)', dark: 'rgb(0, 51, 0)' };

const property = (id: string, more: Partial<TableProperty> = {}): TableProperty => ({
  id, name: id, valueType: 'text', editor: 'text', many: false, title: false, options: [], visible: true, wrap: false, frozen: false, ...more,
});
const cell = (id: string, value: TableCell['value'], more: Partial<TableCell> = {}): TableCell => ({ id, value, items: [], text: value === null ? '' : String(value), ...more });

const properties: TableProperty[] = [
  property('title', { title: true, frozen: true, width: 200, icon: 'mdi-format-title', calculation: { label: 'Count', text: '3' } }),
  property('estimate', { valueType: 'number', editor: 'number', wrap: true }),
  property('done', { valueType: 'checkbox', editor: 'checkbox' }),
  property('due', { valueType: 'date', editor: 'date' }),
  property('at', { valueType: 'dateTime', editor: 'dateTime' }),
  property('start', { valueType: 'time', editor: 'time' }),
  property('status', { valueType: 'select', editor: 'choice', options: [{ id: 'opt-todo', name: 'To do', colour: red }, { id: 'opt-done', name: 'Done', colour: green }] }),
  property('tags', { valueType: 'multiSelect', editor: 'choices', many: true, options: [{ id: 'tag-a', name: 'Alpha', colour: red }, { id: 'tag-b', name: 'Beta' }] }),
  property('blocks', { valueType: 'relation', editor: 'rows', many: true }),
  property('formula', { valueType: 'formula', editor: undefined, readOnly: 'A formula is computed.' }),
  property('secret', { visible: false }),
];

const rows: TableRow[] = [
  {
    id: 'r1', title: 'Write', cells: {
      title: cell('r1.title', 'Write'),
      estimate: cell('r1.estimate', 3),
      done: cell('r1.done', true),
      due: cell('r1.due', '2026-10-13'),
      at: cell('r1.at', '2026-10-13T09:00:00+02:00'),
      start: cell('r1.start', '09:00'),
      status: cell('r1.status', 'opt-todo', { text: 'To do', colour: red }),
      tags: cell('r1.tags', null, { text: 'Alpha', items: [{ id: 'r1.tags.0', value: 'tag-a', label: 'Alpha', colour: red }] }),
      blocks: cell('r1.blocks', null, { text: 'Review', items: [{ id: 'r1.blocks.0', value: 'r2', label: 'Review' }] }),
      formula: cell('r1.formula', '6'),
    },
  },
  { id: 'r2', title: 'Review', cells: { title: cell('r2.title', 'Review'), done: cell('r2.done', false) } },
  { id: 'r3', title: 'Ship', cells: { title: cell('r3.title', 'Ship'), status: cell('r3.status', 'opt-done', { text: 'Done', colour: green }) } },
];

const table: TableView = {
  name: 'Tasks',
  properties,
  rows,
  total: 5,
  views: [{ id: 'view-all', name: 'All', active: true }, { id: 'view-open', name: 'Open', active: false }],
  settings: [{ id: 'sort-1', role: 'sorts', label: 'Sort by title', depth: 1 }],
  operations: {
    addRow: { id: 'addRow', label: 'Add row', params: [] },
    hide: { id: 'hide', label: 'Hide column', params: [] },
    remove: { id: 'remove', label: 'Delete column', params: [] },
    rename: {
      id: 'rename', label: 'Rename', params: [
        { name: 'name', label: 'Name', control: 'text', required: true },
        { name: 'note', label: 'Note', control: 'multiline', required: false },
        { name: 'width', label: 'Width', control: 'number', required: false, value: 120 },
        { name: 'wrap', label: 'Wrap', control: 'checkbox', required: false },
        { name: 'kind', label: 'Kind', control: 'choice', required: false, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
        { name: 'since', label: 'Since', control: 'date', required: false },
        { name: 'moment', label: 'Moment', control: 'dateTime', required: false },
      ],
    },
  },
  readOnly: false,
};

const documentActions: Action[] = [{ id: 'addRow', label: 'Add row', icon: 'mdi-plus', enabled: true }];
const columnActions: Action[] = [
  { id: 'hide', label: 'Hide column', enabled: true },
  { id: 'rename', label: 'Rename', enabled: true },
  { id: 'remove', label: 'Delete column', enabled: false, disabledReason: 'The title column stays.' },
];

let surface: Table;
let sent: FromCanvas[];

const viewMessage = (view: TableView = table, actions: Action[] = documentActions): ToCanvas => ({ v: 2, type: 'view', origin: 'etalii/tasks', kind: 'designer', view, actions, version: 7 });
const edits = (): TableRequest[] => sent.filter((message) => message.type === 'edit').map((message) => (message as Extract<FromCanvas, { type: 'edit' }>).request as TableRequest);
const selections = (): (readonly string[])[] => sent.filter((message) => message.type === 'selection').map((message) => (message as Extract<FromCanvas, { type: 'selection' }>).ids);
const all = <E extends HTMLElement = HTMLElement>(selector: string): E[] => [...document.querySelectorAll<E>(selector)];
const one = <E extends HTMLElement = HTMLElement>(selector: string): E => document.querySelector<E>(selector)!;
const header = (id: string): HTMLElement => one(`[role="columnheader"][data-column="${id}"]`);
const rowOf = (id: string): HTMLElement => one(`tbody tr[data-id="${id}"]`);
const cellAt = (row: string, column: string): HTMLElement => rowOf(row).querySelector<HTMLElement>(`[role="gridcell"][data-column="${column}"]`)!;
const number = (row: string): HTMLElement => rowOf(row).querySelector<HTMLElement>('[role="rowheader"]')!;
const key = (target: Element | null, name: string, more: KeyboardEventInit = {}): void => {
  target!.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...more }));
};
const press = (target: Element, more: MouseEventInit = {}): void => {
  for (const kind of ['mousedown', 'mouseup', 'click']) target.dispatchEvent(new MouseEvent(kind, { bubbles: true, cancelable: true, ...more }));
};
const active = (): HTMLElement => document.activeElement as HTMLElement;
const editor = (): HTMLInputElement => one<HTMLInputElement>('.adp-table-editor');
/** Opens the editor of a cell with Enter and returns it. */
const open = (row: string, column: string): HTMLInputElement => {
  cellAt(row, column).focus();
  key(active(), 'Enter');
  return editor();
};
const type = (input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const menuItems = (): HTMLElement[] => (one('.adp-menu').hidden ? [] : all('.adp-menu [role="menuitem"]'));
/** Selects a column by the menu button of its header and answers with the actions for it. */
const headerMenu = (id: string, actions: Action[] = columnActions): void => {
  press(header(id).querySelector('.adp-table-menu-button')!);
  surface.receive(viewMessage(table, actions));
};

beforeEach(() => {
  document.body.replaceChildren();
  document.body.className = 'vscode-dark';
  sent = [];
  surface = new Table(document.body, (message) => sent.push(message));
  surface.receive(viewMessage());
});

describe('the grid', () => {
  it('is a grid of a header row, a row header and a cell per visible column for every row', () => {
    const grid = one('table[role="grid"]');
    expect([grid.getAttribute('aria-rowcount'), grid.getAttribute('aria-colcount')]).toEqual(['6', '11']);
    expect(all('thead [role="columnheader"]').map((cell) => cell.getAttribute('data-column'))).toEqual(['', 'title', 'estimate', 'done', 'due', 'at', 'start', 'status', 'tags', 'blocks', 'formula']);
    expect(all('tbody [role="row"]').map((row) => row.getAttribute('data-id'))).toEqual(['r1', 'r2', 'r3']);
    expect(all('tbody [role="rowheader"]').map((cell) => cell.textContent)).toEqual(['1', '2', '3']);
    expect(rowOf('r1').querySelectorAll('[role="gridcell"]')).toHaveLength(10);
    expect(cellAt('r1', 'title').textContent).toBe('Write');
    expect(cellAt('r2', 'estimate').textContent).toBe('');
  });

  it('shows the icon, the name, the width and what is frozen in a header', () => {
    expect(header('title').querySelector(':scope > svg.adp-icon')).not.toBeNull();
    expect(header('estimate').querySelector(':scope > svg.adp-icon')).toBeNull();
    expect(header('title').querySelector('.adp-table-name')?.textContent).toBe('title');
    expect(header('title').style.width).toBe('200px');
    expect(header('title').classList.contains('adp-table-frozen')).toBe(true);
    expect(cellAt('r1', 'title').classList.contains('adp-table-frozen')).toBe(true);
    expect(cellAt('r1', 'estimate').classList.contains('adp-table-frozen')).toBe(false);
    expect(cellAt('r1', 'estimate').classList.contains('adp-table-wrap')).toBe(true);
    expect(cellAt('r1', 'title').classList.contains('adp-table-wrap')).toBe(false);
  });

  it('shows the items of a cell as tags, and why a column is not edited as the title of its cells', () => {
    expect([...cellAt('r1', 'tags').querySelectorAll('.adp-table-tag')].map((tag) => tag.textContent)).toEqual(['Alpha']);
    expect(cellAt('r1', 'status').querySelector('.adp-table-tag')?.textContent).toBe('To do');
    expect(cellAt('r1', 'formula').title).toBe('A formula is computed.');
  });

  it('shows the calculation of a column in a line under it', () => {
    const footer = all('tfoot td');
    expect(footer).toHaveLength(11);
    expect(footer[1].textContent).toBe('Count 3');
    expect(footer[2].textContent).toBe('');
  });

  it('draws the groups of a view with their rows, and not the rows of a collapsed one', () => {
    surface.receive(viewMessage({
      ...table, groups: [
        { key: 'opt-todo', label: 'To do', colour: red, collapsed: false, rows: ['r1', 'r3'] },
        { key: '', label: '', collapsed: false, rows: ['r1'] },
        { key: 'opt-done', label: 'Done', collapsed: true, rows: ['r2'] },
      ],
    }));
    const groups = all('tr.adp-table-group');
    expect(groups.map((group) => group.getAttribute('aria-expanded'))).toEqual(['true', 'true', 'false']);
    expect(groups.map((group) => group.querySelector('.adp-table-group-label')?.textContent)).toEqual(['To do', 'No value', 'Done']);
    expect(groups.map((group) => group.querySelector('.adp-table-count')?.textContent)).toEqual(['2', '1', '1']);
    expect(all('tbody tr').map((row) => row.getAttribute('data-id') ?? 'group')).toEqual(['group', 'r1', 'r3', 'group', 'r1', 'group']);
  });

  it('shows a read-only table with its notice and offers nothing that edits', () => {
    surface.receive(viewMessage({ ...table, readOnly: true, notice: 'The file is read-only.' }));
    expect(one('[role="alert"]').textContent).toBe('The file is read-only.');
    expect(all('.adp-table-menu-button')).toHaveLength(0);
    expect(all('.adp-table-toolbar .adp-table-action')).toHaveLength(0);
    expect(all('.adp-table-remove')).toHaveLength(0);
    expect(cellAt('r1', 'done').querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
    cellAt('r1', 'title').focus();
    key(active(), 'Enter');
    key(active(), 'Delete');
    key(active(), 'F10', { shiftKey: true });
    press(one('[role="tab"][aria-selected="false"]'));
    expect(document.querySelector('.adp-table-editor')).toBeNull();
    expect(edits()).toEqual([]);
    expect(selections()).toEqual([['r1.title']]);
    surface.receive(viewMessage({ ...table, readOnly: true }, columnActions));
    expect(menuItems()).toEqual([]);
  });

  it('shows no notice when the view has none', () => {
    expect(one('[role="alert"]').hidden).toBe(true);
  });
});

describe('the tabs', () => {
  it('shows a tab per view with the active one selected, and asks for another when it is clicked', () => {
    const tabs = all('[role="tablist"] [role="tab"]');
    expect(tabs.map((tab) => [tab.textContent, tab.getAttribute('aria-selected')])).toEqual([['All', 'true'], ['Open', 'false']]);
    press(tabs[0]);
    expect(edits()).toEqual([]);
    press(tabs[1]);
    expect(sent).toContainEqual({ v: 2, type: 'edit', seq: 1, request: { kind: 'show', view: 'view-open' }, version: 7 });
  });

  it('opens the menu of a tab for the tab as the selection', () => {
    press(all('[role="tablist"] .adp-table-menu-button')[1]);
    expect(selections()).toEqual([['view-open']]);
    expect(menuItems()).toEqual([]);
    surface.receive(viewMessage(table, columnActions));
    expect(menuItems()).toHaveLength(3);
  });
});

describe('the selection', () => {
  it('selects the cell that takes the focus, by its element or else by its row, and says so once', () => {
    cellAt('r1', 'title').focus();
    cellAt('r2', 'estimate').focus();
    cellAt('r2', 'due').focus();
    expect(selections()).toEqual([['r1.title'], ['r2']]);
    expect(rowOf('r2').classList.contains('adp-selected')).toBe(true);
  });

  it('selects a row by its number, and several with Ctrl and Shift', () => {
    press(number('r1'));
    press(number('r3'), { ctrlKey: true });
    expect(selections()).toEqual([['r1'], ['r1', 'r3']]);
    press(number('r2'));
    press(number('r3'), { shiftKey: true });
    expect(selections().slice(2)).toEqual([['r2'], ['r2', 'r3']]);
  });

  it('selects an item of a cell, a column and nothing at all', () => {
    press(cellAt('r1', 'tags').querySelector('.adp-table-tag')!);
    press(header('status'));
    key(active(), 'Escape');
    expect(selections()).toEqual([['r1.tags.0'], ['status'], []]);
  });

  it('shows the options of a selected column as chips, each selected with its menu', () => {
    expect(one('.adp-table-options').hidden).toBe(true);
    press(header('status'));
    const chips = all('.adp-table-options button');
    expect(chips.map((chip) => chip.textContent)).toEqual(['To do', 'Done']);
    press(chips[1]);
    expect(selections()).toEqual([['status'], ['opt-done']]);
    expect(all('.adp-table-options button')).toHaveLength(2);
    surface.receive(viewMessage(table, columnActions));
    expect(menuItems()).toHaveLength(3);
  });

  it('selects a setting by its chip and opens its menu', () => {
    const chip = one('.adp-table-toolbar .adp-table-chip');
    expect([chip.textContent, chip.getAttribute('data-depth')]).toEqual(['Sort by title', '1']);
    press(chip);
    expect(selections()).toEqual([['sort-1']]);
    surface.receive(viewMessage(table, columnActions));
    expect(menuItems()).toHaveLength(3);
  });

  it('selects and scrolls to the row or the column it is asked to reveal', () => {
    surface.receive({ v: 2, type: 'reveal', id: 'r3' });
    surface.receive({ v: 2, type: 'reveal', id: 'nothing' });
    expect(selections()).toEqual([['r3']]);
    expect(number('r3').tabIndex).toBe(0);
  });

  it('drops from the selection what the next view no longer has', () => {
    press(number('r3'));
    surface.receive(viewMessage({ ...table, rows: rows.slice(0, 2) }, columnActions));
    expect(selections()).toEqual([['r3'], []]);
  });
});

describe('the keyboard', () => {
  it('keeps one cell in the tab order and moves it with the arrows, Home and End', () => {
    expect(all('table [tabindex="0"]')).toHaveLength(1);
    cellAt('r1', 'title').focus();
    key(active(), 'ArrowRight');
    expect(active()).toBe(cellAt('r1', 'estimate'));
    key(active(), 'ArrowDown');
    expect(active()).toBe(cellAt('r2', 'estimate'));
    key(active(), 'ArrowLeft');
    key(active(), 'ArrowLeft');
    expect(active()).toBe(number('r2'));
    key(active(), 'End');
    expect(active()).toBe(cellAt('r2', 'formula'));
    key(active(), 'Home');
    expect(active()).toBe(number('r2'));
    key(active(), 'ArrowRight');
    key(active(), 'ArrowUp');
    key(active(), 'ArrowUp');
    key(active(), 'ArrowUp');
    expect(active()).toBe(header('title'));
    expect(all('table [tabindex="0"]')).toEqual([header('title')]);
    expect(selections().at(-1)).toEqual(['title']);
  });

  it('edits with Enter, cancels with Escape and commits with Enter', () => {
    const input = open('r1', 'title');
    expect(input.value).toBe('Write');
    type(input, 'Rewrite');
    key(input, 'Escape');
    expect(document.querySelector('.adp-table-editor')).toBeNull();
    expect(edits()).toEqual([]);
    expect(active()).toBe(cellAt('r1', 'title'));
    key(active(), 'F2');
    type(editor(), 'Rewrite');
    key(editor(), 'Enter');
    expect(edits()).toEqual([{ kind: 'cell', row: 'r1', property: 'title', value: 'Rewrite' }]);
    expect(active()).toBe(cellAt('r1', 'title'));
  });

  it('replaces the value with what is typed on a cell', () => {
    cellAt('r1', 'title').focus();
    key(active(), 'N');
    expect(editor().value).toBe('N');
    key(editor(), 'Enter');
    expect(edits()).toEqual([{ kind: 'cell', row: 'r1', property: 'title', value: 'N' }]);
  });

  it('commits with Tab and moves to the next cell, and to the one before with Shift', () => {
    type(open('r1', 'title'), 'Draft');
    key(editor(), 'Tab');
    expect(edits()).toEqual([{ kind: 'cell', row: 'r1', property: 'title', value: 'Draft' }]);
    expect(active()).toBe(cellAt('r1', 'estimate'));
    key(active(), 'Enter');
    key(editor(), 'Tab', { shiftKey: true });
    expect(active()).toBe(cellAt('r1', 'title'));
    expect(edits()).toHaveLength(1);
  });

  it('empties a cell of one value with Delete, and leaves an empty one and one of several values alone', () => {
    cellAt('r1', 'title').focus();
    key(active(), 'Delete');
    cellAt('r1', 'status').focus();
    key(active(), 'Backspace');
    cellAt('r2', 'estimate').focus();
    key(active(), 'Delete');
    cellAt('r1', 'tags').focus();
    key(active(), 'Delete');
    cellAt('r1', 'formula').focus();
    key(active(), 'Delete');
    expect(edits()).toEqual([{ kind: 'cell', row: 'r1', property: 'title', value: null }, { kind: 'cell', row: 'r1', property: 'status', value: null }]);
  });

  it('opens the menu of the focused cell with Shift+F10 and with the menu key', () => {
    cellAt('r1', 'title').focus();
    key(active(), 'F10', { shiftKey: true });
    surface.receive(viewMessage(table, columnActions));
    expect(menuItems()).toHaveLength(3);
    key(menuItems()[0], 'ArrowDown');
    expect(active()).toBe(menuItems()[1]);
    key(active(), 'Escape');
    expect(menuItems()).toEqual([]);
    expect(active()).toBe(cellAt('r1', 'title'));
    key(active(), 'ContextMenu');
    expect(menuItems()).toHaveLength(3);
  });

  it('keeps an editor that is open when a view arrives, and draws the view when it closes', () => {
    const input = open('r1', 'title');
    surface.receive(viewMessage({ ...table, rows: rows.slice(0, 1) }));
    expect(editor()).toBe(input);
    key(input, 'Escape');
    expect(all('tbody tr')).toHaveLength(1);
    expect(active()).toBe(cellAt('r1', 'title'));
  });
});

describe('the editors', () => {
  it('sends the text of a text cell, an empty one too, and nothing when it did not change', () => {
    key(open('r1', 'title'), 'Enter');
    type(open('r1', 'title'), '');
    key(editor(), 'Enter');
    key(open('r2', 'at'), 'Enter');
    expect(edits()).toEqual([{ kind: 'cell', row: 'r1', property: 'title', value: '' }]);
  });

  it('sends a number as a number and an emptied one as null', () => {
    const input = open('r1', 'estimate');
    expect([input.type, input.value]).toEqual(['number', '3']);
    type(input, '4.5');
    key(input, 'Enter');
    type(open('r1', 'estimate'), '');
    key(editor(), 'Enter');
    key(open('r1', 'estimate'), 'Enter');
    expect(edits()).toEqual([{ kind: 'cell', row: 'r1', property: 'estimate', value: 4.5 }, { kind: 'cell', row: 'r1', property: 'estimate', value: null }]);
  });

  it('sends a date, a date and time as typed, and a time', () => {
    const date = open('r1', 'due');
    expect([date.type, date.value]).toEqual(['date', '2026-10-13']);
    type(date, '2026-11-01');
    key(date, 'Enter');
    const moment = open('r2', 'at');
    expect([moment.type, moment.placeholder]).toEqual(['text', 'YYYY-MM-DDThh:mm:ss+hh:mm']);
    type(moment, '2026-11-01T10:30:00+01:00');
    key(moment, 'Enter');
    const time = open('r1', 'start');
    expect([time.type, time.value]).toEqual(['time', '09:00']);
    type(time, '10:15');
    key(time, 'Enter');
    type(open('r1', 'due'), '');
    key(editor(), 'Enter');
    expect(edits()).toEqual([
      { kind: 'cell', row: 'r1', property: 'due', value: '2026-11-01' },
      { kind: 'cell', row: 'r2', property: 'at', value: '2026-11-01T10:30:00+01:00' },
      { kind: 'cell', row: 'r1', property: 'start', value: '10:15' },
      { kind: 'cell', row: 'r1', property: 'due', value: null },
    ]);
  });

  it('commits an editor that loses the focus', () => {
    type(open('r1', 'title'), 'Elsewhere');
    one<HTMLInputElement>('input[type="search"]').focus();
    expect(edits()).toEqual([{ kind: 'cell', row: 'r1', property: 'title', value: 'Elsewhere' }]);
    expect(document.querySelector('.adp-table-editor')).toBeNull();
  });

  it('shows a checkbox that sends its new state, by the pointer and by Space', () => {
    const box = cellAt('r1', 'done').querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect([box.checked, cellAt('r2', 'done').querySelector<HTMLInputElement>('input')!.checked]).toEqual([true, false]);
    box.click();
    cellAt('r2', 'done').focus();
    key(active(), ' ');
    key(active(), 'x');
    expect(edits()).toEqual([{ kind: 'cell', row: 'r1', property: 'done', value: false }, { kind: 'cell', row: 'r2', property: 'done', value: true }]);
  });

  it('offers the options of a choice in a list, with None, and sends the one chosen', () => {
    cellAt('r1', 'status').focus();
    key(active(), 'Enter');
    const options = all('[role="listbox"] [role="option"]');
    expect(options.map((option) => [option.textContent, option.getAttribute('aria-selected')])).toEqual([['None', 'false'], ['To do', 'true'], ['Done', 'false']]);
    expect(options[1].querySelector<HTMLElement>('.adp-table-tag')!.style.backgroundColor).toBe(red.dark);
    expect(active()).toBe(options[1]);
    key(active(), 'ArrowDown');
    key(active(), 'Enter');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(active()).toBe(cellAt('r1', 'status'));
    key(active(), 'Enter');
    press(all('[role="option"]')[1]);
    key(active(), 'Enter');
    press(all('[role="option"]')[0]);
    key(active(), 'Enter');
    key(active(), 'Escape');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(edits()).toEqual([{ kind: 'cell', row: 'r1', property: 'status', value: 'opt-done' }, { kind: 'cell', row: 'r1', property: 'status', value: null }]);
  });

  it('checks the options a cell of several choices has, and sends each one toggled', () => {
    cellAt('r1', 'tags').focus();
    key(active(), 'Enter');
    const options = all('[role="listbox"] [role="option"]');
    expect(options.map((option) => [option.textContent, option.getAttribute('aria-checked')])).toEqual([['Alpha', 'true'], ['Beta', 'false']]);
    press(options[0]);
    press(options[1]);
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    expect(edits()).toEqual([
      { kind: 'item', row: 'r1', property: 'tags', value: 'tag-a', present: false },
      { kind: 'item', row: 'r1', property: 'tags', value: 'tag-b', present: true },
    ]);
    // The view that follows says what the cell holds now: the list shows that, still open.
    surface.receive(viewMessage());
    expect(all('[role="listbox"] [role="option"]').map((option) => option.getAttribute('aria-checked'))).toEqual(['true', 'false']);
  });

  it('adds a row to a cell of rows by what is typed, and takes one away by the button of its tag', () => {
    type(open('r1', 'blocks'), 'r3');
    key(editor(), 'Enter');
    key(open('r1', 'blocks'), 'Enter');
    press(cellAt('r1', 'blocks').querySelector('.adp-table-remove')!);
    expect(edits()).toEqual([
      { kind: 'item', row: 'r1', property: 'blocks', value: 'r3', present: true },
      { kind: 'item', row: 'r1', property: 'blocks', value: 'r2', present: false },
    ]);
  });

  it('does not edit a column that is read-only or has no editor', () => {
    cellAt('r1', 'formula').focus();
    key(active(), 'Enter');
    key(active(), 'x');
    expect(document.querySelector('.adp-table-editor')).toBeNull();
    expect(edits()).toEqual([]);
  });

  it('counts its requests and gives each the version of the view it was made on', () => {
    type(open('r1', 'title'), 'One');
    key(editor(), 'Enter');
    type(open('r2', 'title'), 'Two');
    key(editor(), 'Enter');
    expect(sent.filter((message) => message.type === 'edit').map((message) => [(message as { seq: number }).seq, (message as { version: number }).version])).toEqual([[1, 7], [2, 7]]);
  });
});

describe('the actions', () => {
  it('opens the menu of a column with the actions of the view that follows its selection', () => {
    press(header('title').querySelector('.adp-table-menu-button')!);
    expect(selections()).toEqual([['title']]);
    expect(menuItems()).toEqual([]);
    surface.receive(viewMessage(table, columnActions));
    expect(menuItems().map((item) => item.textContent)).toEqual(['Hide column', 'Rename', 'Delete column']);
  });

  it('opens the menu of a column on its context menu too, at once when the column is the selection already', () => {
    headerMenu('title');
    key(active(), 'Escape');
    header('title').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(selections()).toEqual([['title']]);
    expect(menuItems()).toHaveLength(3);
  });

  it('shows an action that cannot run with the reason, and does not run it', () => {
    headerMenu('title');
    const item = menuItems()[2];
    expect([item.getAttribute('aria-disabled'), item.title]).toEqual(['true', 'The title column stays.']);
    item.click();
    expect(edits()).toEqual([]);
  });

  it('runs an action without parameters on the selection at once', () => {
    headerMenu('title');
    menuItems()[0].click();
    expect(edits()).toEqual([{ kind: 'operation', operation: 'hide', on: ['title'] }]);
    expect(document.querySelector('.adp-table-params')).toBeNull();
  });

  it('asks the parameters of an action in a form and sends what was given, typed', () => {
    headerMenu('title');
    menuItems()[1].click();
    const form = one<HTMLFormElement>('form.adp-table-params');
    expect([form.getAttribute('role'), form.getAttribute('aria-label')]).toEqual(['dialog', 'Rename']);
    expect(all('.adp-table-params label').map((label) => label.textContent)).toEqual(['Name', 'Note', 'Width', 'Wrap', 'KindAB', 'Since', 'Moment']);
    const controls = all<HTMLInputElement>('.adp-table-params label > :is(input, textarea, select)');
    expect(controls.map((control) => control.tagName === 'INPUT' ? control.type : control.tagName)).toEqual(['text', 'TEXTAREA', 'number', 'checkbox', 'SELECT', 'date', 'text']);
    expect([controls[0].required, controls[1].required, controls[2].value, controls[4].value]).toEqual([true, false, '120', '']);
    const submit = one<HTMLButtonElement>('.adp-table-params button[type="submit"]');
    expect(submit.textContent).toBe('Rename');
    submit.click();
    expect(edits()).toEqual([]);
    expect(document.querySelector('.adp-table-params')).not.toBeNull();
    type(controls[0], 'Titel');
    type(controls[4], 'b');
    submit.click();
    expect(edits()).toEqual([{ kind: 'operation', operation: 'rename', on: ['title'], args: { name: 'Titel', width: 120, wrap: false, kind: 'b' } }]);
    expect(document.querySelector('.adp-table-params')).toBeNull();
  });

  it('cancels the form with its button and with Escape', () => {
    headerMenu('title');
    menuItems()[1].click();
    all<HTMLButtonElement>('.adp-table-params button').find((button) => button.textContent === 'Cancel')!.click();
    expect(document.querySelector('.adp-table-params')).toBeNull();
    headerMenu('estimate');
    menuItems()[1].click();
    key(one('.adp-table-params input'), 'Escape');
    expect(document.querySelector('.adp-table-params')).toBeNull();
    expect(edits()).toEqual([]);
  });

  it('offers the actions of the document as buttons while nothing is selected, and not otherwise', () => {
    const buttons = all('.adp-table-toolbar .adp-table-action');
    expect(buttons.map((button) => button.textContent)).toEqual(['Add row']);
    buttons[0].click();
    expect(edits()).toEqual([{ kind: 'operation', operation: 'addRow', on: [] }]);
    press(header('title'));
    expect(all('.adp-table-toolbar .adp-table-action')).toHaveLength(0);
    surface.receive(viewMessage(table, columnActions));
    expect(all('.adp-table-toolbar .adp-table-action')).toHaveLength(0);
    key(active(), 'Escape');
    surface.receive(viewMessage());
    expect(all('.adp-table-toolbar .adp-table-action')).toHaveLength(1);
  });

  it('shows a document action that cannot run with the reason, and does not run it', () => {
    surface.receive(viewMessage(table, [{ id: 'addRow', label: 'Add row', enabled: false, disabledReason: 'The table is full.' }]));
    const button = one('.adp-table-toolbar .adp-table-action');
    expect([button.getAttribute('aria-disabled'), button.title]).toEqual(['true', 'The table is full.']);
    button.click();
    expect(edits()).toEqual([]);
  });
});

describe('the toolbar', () => {
  it('hides the rows that do not have what is searched, whatever its case, and sends nothing', () => {
    const search = one<HTMLInputElement>('input[type="search"]');
    expect(search.getAttribute('aria-label')).toBe('Search');
    type(search, 'REV');
    expect(all('tbody tr').map((row) => row.hidden)).toEqual([false, false, true]);
    type(search, 'ship');
    expect(all('tbody tr').map((row) => row.hidden)).toEqual([true, true, false]);
    // A view that follows keeps what is searched.
    surface.receive(viewMessage());
    expect(all('tbody tr').map((row) => row.hidden)).toEqual([true, true, false]);
    type(search, '');
    expect(all('tbody tr').map((row) => row.hidden)).toEqual([false, false, false]);
    expect(sent).toEqual([]);
  });
});

describe('the status line', () => {
  it('shows the sentence of a refusal until the next gesture', () => {
    type(open('r1', 'title'), 'No');
    key(editor(), 'Enter');
    surface.receive({ v: 2, type: 'outcome', seq: 1, result: 'refused', sentence: 'A title is unique.' });
    const status = one('[role="status"].adp-table-status');
    expect(status.textContent).toBe('A title is unique.');
    surface.receive(viewMessage());
    expect(status.textContent).toBe('A title is unique.');
    key(active(), 'ArrowDown');
    expect(status.textContent).toBe('');
    surface.receive({ v: 2, type: 'outcome', seq: 1, result: 'applied' });
    expect(status.textContent).toBe('');
  });
});

describe('the colours', () => {
  const fill = (): string => cellAt('r1', 'status').querySelector<HTMLElement>('.adp-table-tag')!.style.backgroundColor;
  const outline = (): string => cellAt('r1', 'status').querySelector<HTMLElement>('.adp-table-tag')!.style.outline;
  const themed = (kind: string): void => {
    document.body.className = kind;
    surface.receive(viewMessage());
  };

  it('fills a tag with the colour of the kind of theme', () => {
    expect(fill()).toBe(red.dark);
    themed('vscode-light');
    expect(fill()).toBe(red.light);
    themed('vscode-high-contrast');
    expect(fill()).toBe(red.dark);
    themed('vscode-high-contrast vscode-high-contrast-light');
    expect(fill()).toBe(red.light);
    expect(cellAt('r1', 'tags').querySelector<HTMLElement>('.adp-table-tag')!.style.backgroundColor).toBe(red.light);
  });

  it('gives a tag the contrast border in high contrast, so it does not depend on its fill', () => {
    expect(outline()).toBe('');
    themed('vscode-high-contrast');
    expect(outline()).toBe('1px solid var(--vscode-contrastBorder)');
    expect(cellAt('r1', 'status').querySelector<HTMLElement>('.adp-table-tag')!.style.color).toBe('var(--vscode-editor-foreground)');
    themed('vscode-high-contrast-light');
    expect(outline()).toBe('1px solid var(--vscode-contrastBorder)');
  });
});
