import { beforeEach, describe, expect, it } from 'vitest';
import type { FromCanvas, ToCanvas } from '../../../src/core/frame/protocol';
import type { TableProperty, TableRequest, TableView } from '../../../src/core/tool/tableView';
import { Table } from '../../../src/webview/table/table';

// A relation's cells on the table surface (etalii.adp spec 080, FR-001 to FR-003): each related row
// by its title, as a link that opens it where it lives, and a searchable list of the rows of its file.

const property = (id: string, more: Partial<TableProperty> = {}): TableProperty => ({
  id, name: id, valueType: 'text', editor: 'text', many: false, title: false, options: [], visible: true, wrap: false, frozen: false, ...more,
});
const provinces = [{ id: 'nh', name: 'Noord-Holland' }, { id: 'zh', name: 'Zuid-Holland' }, { id: 'an', name: 'Antwerpen' }];
const relation = (single: boolean): TableProperty => property('province', { valueType: 'relation', editor: 'rows', many: true, related: provinces, single });
const linked = (id: string, row: string, label: string, file = 'provinces.yaml') => ({ id, value: row, label, link: { file, row } });

const viewOf = (single: boolean): TableView => ({
  name: 'Cities',
  properties: [property('name', { title: true }), relation(single), property('part', { valueType: 'relation', editor: 'rows', many: true, related: [], single: true })],
  rows: [
    { id: 'r1', title: 'Amsterdam', cells: {
      name: { id: 'r1.name', value: 'Amsterdam', items: [], text: 'Amsterdam' },
      province: { id: 'r1.province', value: null, items: [linked('i1', 'nh', 'Noord-Holland')], text: 'Noord-Holland' },
    } },
    { id: 'r2', title: 'Rotterdam', cells: {
      name: { id: 'r2.name', value: 'Rotterdam', items: [], text: 'Rotterdam' },
      part: { id: 'r2.part', value: null, items: [linked('i2', 'r1', 'Amsterdam', '.')], text: 'Amsterdam' },
    } },
  ],
  total: 2,
  views: [{ id: 'va', name: 'All', active: true }],
  settings: [],
  operations: {},
  readOnly: false,
  gestures: {},
});

let sent: FromCanvas[];
let surface: Table;
const message = (shown: TableView): ToCanvas => ({ v: 2, type: 'view', origin: 'etalii/things', kind: 'designer', view: shown, actions: [], version: 1 });
const edits = (): TableRequest[] => sent.filter((given) => given.type === 'edit').map((given) => (given as Extract<FromCanvas, { type: 'edit' }>).request as TableRequest);
const all = <E extends HTMLElement = HTMLElement>(selector: string): E[] => [...document.querySelectorAll<E>(selector)];
const one = <E extends HTMLElement = HTMLElement>(selector: string): E => document.querySelector<E>(selector)!;
const press = (target: Element): void => {
  for (const kind of ['mousedown', 'mouseup', 'click']) target.dispatchEvent(new MouseEvent(kind, { bubbles: true, cancelable: true }));
};
const key = (target: Element, name: string, more: KeyboardEventInit = {}): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...more }));
};
const cellOf = (row: string, column: string): HTMLElement => one(`tbody tr[data-id="${row}"] [role="gridcell"][data-column="${column}"]`);
const selected = (): string[] => all('tbody tr[aria-selected="true"]').map((line) => line.dataset.id ?? '');

const open = (single: boolean): void => {
  surface.receive(message(viewOf(single)));
};

beforeEach(() => {
  document.body.replaceChildren();
  document.body.className = 'vscode-dark';
  sent = [];
  surface = new Table(document.body, (given) => sent.push(given));
});

describe('a relation\'s cells', () => {
  it('show each related row by its title, as a link that opens it in its file', () => {
    open(true);
    const link = one('tbody tr[data-id="r1"] .adp-table-link');
    expect(link.textContent).toBe('Noord-Holland');
    press(link);
    expect(edits()).toEqual([{ kind: 'follow', file: 'provinces.yaml', row: 'nh' }]);
  });

  it('select a related row of the same table in place, writing nothing', () => {
    open(true);
    press(one('tbody tr[data-id="r2"] .adp-table-link'));
    expect(edits()).toEqual([]);
    expect(selected()).toEqual(['r1']);
  });

  it('open the first related row with Ctrl+Enter', () => {
    open(true);
    const cell = cellOf('r1', 'province');
    cell.focus();
    key(cell, 'Enter', { ctrlKey: true });
    expect(edits()).toEqual([{ kind: 'follow', file: 'provinces.yaml', row: 'nh' }]);
  });

  it('list the rows of the file by title with a search field, and replace the one there where a cell holds one', () => {
    open(true);
    const cell = cellOf('r1', 'province');
    cell.focus();
    key(cell, 'Enter');
    const search = one<HTMLInputElement>('.adp-table-list-search');
    expect(document.activeElement).toBe(search);
    expect(all('.adp-table-list [role="option"]').map((item) => item.textContent)).toEqual(['None', 'Noord-Holland', 'Zuid-Holland', 'Antwerpen']);
    expect(one('.adp-table-list [data-value="nh"]').getAttribute('aria-selected')).toBe('true');
    search.value = 'zuid';
    search.dispatchEvent(new Event('input'));
    key(search, 'Enter');
    expect(edits()).toEqual([{ kind: 'steps', steps: [
      { kind: 'item', row: 'r1', property: 'province', value: 'nh', present: false },
      { kind: 'item', row: 'r1', property: 'province', value: 'zh', present: true },
    ] }]);
  });

  it('add a row of the file where a cell holds any number', () => {
    open(false);
    const cell = cellOf('r2', 'province');
    cell.focus();
    key(cell, 'Enter');
    expect(all('.adp-table-list [role="option"]').map((item) => item.textContent)).toEqual(['Noord-Holland', 'Zuid-Holland', 'Antwerpen']);
    press(one('.adp-table-list [data-value="an"]'));
    expect(edits()).toEqual([{ kind: 'item', row: 'r2', property: 'province', value: 'an', present: true }]);
  });
});

describe('a new relation', () => {
  it('asks its target among the knowledge files, this file first, then its limit and its other side', () => {
    const shown = viewOf(true);
    surface.receive(message({
      ...shown,
      gestures: { newProperty: [{ id: 'relation', label: 'Relation', request: { kind: 'operation', operation: 'createRelation', on: [], args: {} } }] },
      operations: {
        createRelation: { id: 'createRelation', label: 'New relation', params: [
          { name: 'name', label: 'Name', control: 'text', required: true },
          { name: 'targetFile', label: 'Target file', control: 'choice', required: true, options: [{ value: '.', label: 'This file' }, { value: 'provinces.yaml', label: 'provinces.yaml' }] },
          { name: 'limit', label: 'Limit', control: 'choice', required: false, value: 'none', options: [{ value: 'none', label: 'No limit' }, { value: 'one', label: '1 row' }] },
          { name: 'backlinkName', label: 'Backlink name', control: 'text', required: false },
        ] },
      },
    }));
    press(one('.adp-table-new-property'));
    one<HTMLInputElement>('.adp-table-property-name').value = 'Seat of';
    press(one('.adp-table-types [data-entry="relation"]'));
    const form = one<HTMLFormElement>('.adp-table-params');
    expect([...form.querySelectorAll<HTMLElement>('[name]')].map((field) => field.getAttribute('name'))).toEqual(['targetFile', 'limit', 'backlinkName']);
    const target = form.querySelector<HTMLSelectElement>('select[name="targetFile"]')!;
    expect(target.value).toBe('.');
    target.value = 'provinces.yaml';
    form.querySelector<HTMLInputElement>('input[name="backlinkName"]')!.value = 'Seats';
    form.requestSubmit();
    expect(edits()).toEqual([{ kind: 'operation', operation: 'createRelation', on: [], args: { name: 'Seat of', targetFile: 'provinces.yaml', limit: 'none', backlinkName: 'Seats' } }]);
  });
});

// A relation to a diagram (etalii.adp spec 092, FR-025): a name its elements do not hold makes one in the diagram, of the
// kind chosen where it offers several, and relates it, as one request the designer makes over both files.
describe('a relation to a diagram', () => {
  const withKinds = (kinds: readonly { id: string; label: string }[]): TableView => {
    const shown = viewOf(false);
    return { ...shown, properties: shown.properties.map((given) => (given.id === 'province' ? { ...given, elsewhere: 'plan.tml', createKinds: kinds } : given)) };
  };
  const typeIn = (text: string): HTMLInputElement => {
    const cell = cellOf('r2', 'province');
    cell.focus();
    key(cell, 'Enter');
    const search = one<HTMLInputElement>('.adp-table-list-search');
    search.value = text;
    search.dispatchEvent(new Event('input'));
    return search;
  };

  it('offers a Create for each kind of element, and makes the one chosen', () => {
    surface.receive(message(withKinds([{ id: 'timeline.add-element', label: 'Element' }, { id: 'timeline.add-moment', label: 'Moment' }])));
    const search = typeIn('Retro');
    expect(all('.adp-table-list [role="option"]').filter((item) => !item.hidden).map((item) => item.textContent)).toEqual(['Create element “Retro”', 'Create moment “Retro”']);
    key(search, 'Enter');
    expect(document.activeElement?.textContent).toBe('Create element “Retro”');
    press(all('.adp-table-list [data-kind]')[1]!);
    expect(edits()).toEqual([{ kind: 'createRelated', row: 'r2', property: 'province', name: 'Retro', elementKind: 'timeline.add-moment' }]);
  });

  it('makes the one kind there is on Enter, and offers none where the diagram can be given none', () => {
    surface.receive(message(withKinds([{ id: 'mindmap.add-child', label: 'Node' }])));
    key(typeIn('Retro'), 'Enter');
    expect(edits()).toEqual([{ kind: 'createRelated', row: 'r2', property: 'province', name: 'Retro' }]);
    sent = [];
    surface.receive(message(withKinds([])));
    key(typeIn('Retro'), 'Enter');
    expect(edits()).toEqual([]);
  });
});

