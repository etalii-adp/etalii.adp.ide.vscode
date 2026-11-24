import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FromCanvas, ToCanvas } from '../../../src/core/frame/protocol';
import type { Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import type { TableRequest, TableView } from '../../../src/core/tool/tableView';
import { Table } from '../../../src/webview/table/table';
import { definitionOf, designerOf } from '../../core/tool/support';

// A column's menu on the Knowledge designer's own view of cities.yaml (etalii.adp spec 079,
// FR-011, T019; spec 080, FR-011): the standalone menu's groups and order, what cannot be done
// shown disabled with its reason, what does not suit the column left out, and each entry making
// its request.

const type = designerOf(definitionOf('knowledge'), registry);
const read = (name: string): string => readFileSync(`examples/knowledge/${name}`, 'utf8');
const source: Source = { fileName: 'cities.yaml', text: read('cities.yaml'), related: { 'provinces.yaml': { fileName: 'provinces.yaml', text: read('provinces.yaml') } } };

let sent: FromCanvas[];
let surface: Table;
const all = <E extends HTMLElement = HTMLElement>(selector: string): E[] => [...document.querySelectorAll<E>(selector)];
const one = <E extends HTMLElement = HTMLElement>(selector: string): E => document.querySelector<E>(selector)!;
const press = (target: Element): void => {
  for (const kind of ['mousedown', 'mouseup', 'click']) target.dispatchEvent(new MouseEvent(kind, { bubbles: true, cancelable: true }));
};
const edits = (): TableRequest[] => sent.filter((given) => given.type === 'edit').map((given) => (given as Extract<FromCanvas, { type: 'edit' }>).request as TableRequest);
const shown = (): string[] => all('.adp-table-menu > li').map((item) => (item.getAttribute('role') === 'separator' ? '—' : item.querySelector('.adp-menu-label')?.textContent ?? ''));
const entry = (id: string): HTMLElement => one(`.adp-table-menu [data-entry="${id}"]`);
const header = (id: string): HTMLElement => one(`[role="columnheader"][data-id="${id}"]`);

beforeEach(() => {
  document.body.replaceChildren();
  document.body.className = 'vscode-dark';
  sent = [];
  const view = type.view(source, {}) as TableView;
  const message: ToCanvas = { v: 2, type: 'view', origin: 'etalii/knowledge', kind: 'designer', view, actions: [], version: 1 };
  surface = new Table(document.body, (given) => sent.push(given));
  surface.receive(message);
});

describe('a column\'s menu', () => {
  it('is grouped and ordered as the standalone menu, with Edit options on a selection', () => {
    press(header('p2'));
    expect(shown()).toEqual([
      'Rename', 'Change type', 'Edit options', '—',
      'Filter', 'Sort ascending', 'Sort descending', 'Group', '—',
      'Hide in view', 'Wrap text', 'Freeze up to column', '—',
      'Insert left', 'Insert right', 'Duplicate', 'Delete',
    ]);
  });

  it('leaves out what does not suit the column, and shows disabled, with its reason, what it cannot do', () => {
    press(header('p3'));
    expect(shown()).not.toContain('Edit options');
    press(header('p1'));
    expect(['changeType', 'hide', 'delete'].map((id) => [entry(id).getAttribute('aria-disabled'), entry(id).title])).toEqual([
      ['true', 'The column that names a row is always text.'],
      ['true', 'The column that names a row is always there.'],
      ['true', 'The title property cannot be deleted.'],
    ]);
    press(entry('delete'));
    expect(edits()).toEqual([]);
  });

  it('makes its entry\'s request on the column it was opened on, without asking which', () => {
    press(header('p3'));
    press(entry('sortAscending'));
    expect(edits()).toEqual([{ kind: 'operation', operation: 'addSort', on: ['v1'], args: { property: 'p3', direction: 'ascending' } }]);
  });

  it('edits a relation: its file shown, its limit and whether it is two-way, each a state with a tick', () => {
    press(header('p5'));
    expect(shown().slice(0, 3)).toEqual(['Rename', 'Change type', 'Edit relation']);
    press(entry('relation'));
    expect(all('.adp-table-menu [data-entry]').map((item) => [item.querySelector('.adp-menu-label')?.textContent, item.getAttribute('aria-checked')])).toEqual([
      ['Related to provinces.yaml', null], ['No limit', 'false'], ['1 row', 'true'], ['Two-way relation', 'false'],
    ]);
  });

  it('asks the name its backlinks are shown by before making a relation two-way, as the standalone relation editor does', () => {
    press(header('p5'));
    press(entry('relation'));
    press(entry('twoWay'));
    expect(edits()).toEqual([]);
    const name = one<HTMLInputElement>('form.adp-table-params input');
    expect(one('form.adp-table-params').getAttribute('aria-label')).toBe('Make two-way');
    expect(name.closest('label')?.textContent).toContain('Backlink name');
    name.value = 'Cities';
    one<HTMLFormElement>('form.adp-table-params').requestSubmit();
    expect(edits()).toEqual([{ kind: 'operation', operation: 'setRelationOtherSide', on: ['p5'], args: { twoWay: true, backlinkName: 'Cities' } }]);
  });

  it('inserts a property beside the column through the panel of a new property: its name, then its type', () => {
    press(header('p3'));
    press(entry('insertRight'));
    expect(one('.adp-table-menu').hidden).toBe(true);
    const name = one<HTMLInputElement>('.adp-table-new-panel .adp-table-property-name');
    name.value = 'Area';
    press(one('.adp-table-new-panel [data-entry="number"]'));
    expect(edits()).toEqual([{ kind: 'operation', operation: 'addProperty', on: [], args: { name: 'Area', valueType: 'number', after: 'p3' } }]);
  });

  it('asks the name of a property added without one in its header, once it is shown', () => {
    press(header('p3'));
    press(entry('insertRight'));
    press(one('.adp-table-new-panel [data-entry="number"]'));
    expect(edits()).toEqual([{ kind: 'operation', operation: 'addProperty', on: [], args: { name: 'Number', valueType: 'number', after: 'p3' } }]);
    // The extension reveals what a step made once its view is shown; p3 stands in for the new property here.
    surface.receive({ v: 2, type: 'reveal', id: 'p3' });
    const input = one<HTMLInputElement>('[role="columnheader"][data-id="p3"] .adp-table-rename');
    expect(document.activeElement).toBe(input);
    input.value = 'Inhabitants';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(edits().at(-1)).toEqual({ kind: 'operation', operation: 'renameProperty', on: ['p3'], args: { name: 'Inhabitants' } });
  });

  it('asks nothing of a property given its name', () => {
    press(header('p3'));
    press(entry('insertRight'));
    one<HTMLInputElement>('.adp-table-new-panel .adp-table-property-name').value = 'Area';
    press(one('.adp-table-new-panel [data-entry="number"]'));
    surface.receive({ v: 2, type: 'reveal', id: 'p3' });
    expect(document.querySelector('.adp-table-rename')).toBeNull();
  });
});

describe('a column renamed from its menu after the table was drawn again', () => {
  it('asks the name in the header as it is drawn now, and never sends a rename without one', () => {
    press(header('p2'));
    // Pressing a header selects its column, and the view that comes back draws the headers anew.
    const view = type.view(source, {}) as TableView;
    surface.receive({ v: 2, type: 'view', origin: 'etalii/knowledge', kind: 'designer', view, actions: [], version: 2 });
    press(entry('rename'));
    expect(edits()).toEqual([]);
    const input = one<HTMLInputElement>('[role="columnheader"][data-id="p2"] .adp-table-rename');
    expect(document.activeElement).toBe(input);
    input.value = 'Land';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(edits()).toEqual([{ kind: 'operation', operation: 'renameProperty', on: ['p2'], args: { name: 'Land' } }]);
  });
});
