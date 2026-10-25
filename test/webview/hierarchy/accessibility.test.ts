import { beforeEach, describe, expect, it } from 'vitest';
import type { HierarchyNode, HierarchyRequest } from '../../../src/core/tool/hierarchyView';
import { applied, box, click, harness, key, requests, show, source, typeInto, viewOf, type Harness } from './pageSupport';

// The page of boxes to assistive technology and the keyboard (spec 036, FR-011): every interactive
// part has a role, a name and its state, and everything a pointer does has a key. The boxes are a
// tree whose selection the arrow keys move, and Alt with an arrow moves the selected box as a drag
// would, by the operation its move gesture names.

let h: Harness;
const pageElement = (): HTMLElement => document.querySelector<HTMLElement>('.hs-page')!;
const node = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-node="${id}"]`)!;
const selected = (): string | undefined => h.sent.filter((message) => message.type === 'selection').at(-1)?.ids[0];
const all = (nodes: readonly HierarchyNode[]): HierarchyNode[] => nodes.flatMap((one) => [one, ...all(one.entries), ...all(one.levels)]);

/** The name assistive technology gives an element: its label, the element its label names, or its text. */
function nameOf(element: Element): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy !== null) return labelledBy.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
  return (element.getAttribute('aria-label') ?? element.textContent ?? '').trim();
}

/** Selects a box as a click does, with the page holding the focus as it then does. */
function choose(id: string): void {
  click(box(id));
  pageElement().focus();
}

beforeEach(() => {
  h = harness();
});

describe('roles, names and states', () => {
  it('makes the boxes a tree of items, each with its name, its level, whether it is expanded and whether it is selected', () => {
    show(h.page, viewOf());
    expect(pageElement().getAttribute('role')).toBe('tree');
    expect(pageElement().getAttribute('aria-label')).toBe('web-shop');
    const described = (id: string): (string | null)[] => ['role', 'aria-label', 'aria-level', 'aria-expanded', 'aria-selected'].map((name) => node(id).getAttribute(name));
    expect(described('ITEM-0001')).toEqual(['treeitem', 'ITEM-0001 Storefront', '1', 'true', 'false']);
    expect(described('REQ-0001')).toEqual(['treeitem', 'REQ-0001 A customer finds a product by its name or its description.', '2', 'true', 'false']);
    expect(described('ITEM-0002')).toEqual(['treeitem', 'ITEM-0002 Checkout', '2', 'true', 'false']);
    expect(described('ITEM-0003')).toEqual(['treeitem', 'ITEM-0003 Guest checkout', '3', 'false', 'false']);
    expect(node('ITEM-0001').querySelector(':scope > .hs-level-content')!.getAttribute('role')).toBe('group');
    choose('ITEM-0002');
    expect(node('ITEM-0002').getAttribute('aria-selected')).toBe('true');
    expect(pageElement().getAttribute('aria-activedescendant')).toBe(node('ITEM-0002').id);
  });

  it('names every control on the page and in its popups, and says the state of each that opens something', () => {
    show(h.page, viewOf());
    choose('REQ-0006');
    click(box('REQ-0006').querySelector('.hs-note-mark')!);
    const controls = (): Element[] => [...document.querySelectorAll('button, [role="button"], [role="separator"], [role="combobox"], [role="dialog"], [role="listbox"], input, select, textarea')];
    const unnamed = (): string[] => controls().filter((control) => nameOf(control) === '').map((control) => control.outerHTML.slice(0, 120));
    expect(unnamed()).toEqual([]);
    const notes = document.querySelector('.hs-note-list')!;
    expect([notes.getAttribute('role'), notes.getAttribute('aria-label')]).toEqual(['dialog', 'Note of REQ-0006']);
    expect(notes.querySelector('.hs-notes')!.getAttribute('aria-label')).toBe('Note about REQ-0006');
    expect(box('REQ-0006').querySelector('.hs-note-mark')!.getAttribute('aria-expanded')).toBe('true');
    // The kind of a new note is a combobox whose list names its active option.
    const kind = notes.querySelector<HTMLElement>('.hs-kind-button')!;
    expect(kind.getAttribute('aria-expanded')).toBe('false');
    click(kind);
    expect(kind.getAttribute('aria-expanded')).toBe('true');
    const list = document.getElementById(kind.getAttribute('aria-controls')!)!;
    expect(list.getAttribute('role')).toBe('listbox');
    expect(document.getElementById(kind.getAttribute('aria-activedescendant')!)!.getAttribute('role')).toBe('option');

    // A label's list and the editor of the list.
    key(document.activeElement!, { key: 'Escape' });
    click(box('REQ-0006').querySelector('.hs-label-values')!);
    expect(unnamed()).toEqual([]);
    const field = document.querySelector('.hs-label-field, [role="dialog"]')!;
    expect(field.getAttribute('aria-label')).not.toBe('');
  });

  it('makes the filter a combobox whose completions are a list with its active option', () => {
    show(h.page, viewOf());
    const field = document.querySelector<HTMLInputElement>('.hs-filter-query')!;
    expect([field.getAttribute('role'), field.getAttribute('aria-expanded')]).toEqual(['combobox', 'false']);
    field.focus();
    typeInto(field, '#se');
    show(h.page, viewOf({ query: '#se' }), 2);
    expect(field.getAttribute('aria-expanded')).toBe('true');
    const list = document.getElementById(field.getAttribute('aria-controls')!)!;
    expect(list.getAttribute('role')).toBe('listbox');
    expect(document.getElementById(field.getAttribute('aria-activedescendant')!)!.textContent).toContain('#search');
  });

  it('asks its questions in a modal dialog named by its title', () => {
    show(h.page, viewOf());
    h.page.receive({ v: 2, type: 'confirm', seq: 1, title: 'Delete', message: 'Delete ITEM-0002?', confirmLabel: 'Delete', danger: true });
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')!;
    expect(nameOf(dialog)).toBe('Delete');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)!.textContent).toBe('Delete ITEM-0002?');
  });

  it('lists the keys of the page, the moves and the column edges among them', () => {
    show(h.page, viewOf());
    click(document.querySelector('.hs-help-button')!);
    const rows = [...document.querySelectorAll('.hs-help dt')].map((term) => `${term.textContent}: ${term.nextElementSibling!.textContent}`);
    expect(rows).toContain('Alt+Up, Alt+Down: Move it earlier or later among its kind');
    expect(rows).toContain('Alt+Left, Alt+Right: Move it out of its item, or into the one before it');
    expect(rows.some((row) => row.startsWith('Drag the right edge of a column: '))).toBe(true);
    expect(rows.some((row) => row.startsWith('Arrow keys, Home, End: '))).toBe(true);
  });
});

describe('the keys of the tree', () => {
  it('move the selection down and up through the boxes as the page draws them, into a level and back out', () => {
    show(h.page, viewOf());
    pageElement().focus();
    expect(key(pageElement(), { key: 'ArrowDown' })).toBe(false);
    expect(selected()).toBe('ITEM-0001');
    key(pageElement(), { key: 'ArrowDown' });
    expect(selected()).toBe('REQ-0001');
    key(pageElement(), { key: 'ArrowLeft' });
    expect(selected()).toBe('ITEM-0001');
    key(pageElement(), { key: 'ArrowRight' });
    expect(selected()).toBe('REQ-0001');
    key(pageElement(), { key: 'End' });
    expect(selected()).toBe('REQ-0010');
    key(pageElement(), { key: 'ArrowUp' });
    expect(selected()).toBe('REQ-0009');
    key(pageElement(), { key: 'Home' });
    expect(selected()).toBe('ITEM-0001');
    expect(pageElement().getAttribute('aria-activedescendant')).toBe(node('ITEM-0001').id);
    expect(requests(h.sent)).toEqual([]);
  });

  it('collapse an expanded level with Left and expand a collapsed one with Right, by its fold', () => {
    show(h.page, viewOf());
    choose('ITEM-0001');
    key(pageElement(), { key: 'ArrowLeft' });
    choose('ITEM-0003');
    key(pageElement(), { key: 'ArrowRight' });
    expect(requests(h.sent)).toEqual([
      { kind: 'operation', operation: 'toggleCollapsed', on: ['ITEM-0001'] },
      { kind: 'operation', operation: 'toggleCollapsed', on: ['ITEM-0003'] },
    ]);
  });
});

describe('moving a box by keys', () => {
  const moved = (id: string, init: KeyboardEventInit): boolean => {
    choose(id);
    return key(pageElement(), { altKey: true, ...init });
  };

  it('moves the selected box earlier or later among its kind, out of its level, or into the level before it, as a drag would', () => {
    show(h.page, viewOf());
    let reached = 0;
    window.addEventListener('keydown', () => (reached += 1), { once: true });
    expect(moved('REQ-0003', { key: 'ArrowDown' })).toBe(false);
    moved('REQ-0004', { key: 'ArrowUp' });
    moved('ITEM-0004', { key: 'ArrowUp' });
    moved('ITEM-0002', { key: 'ArrowLeft' });
    moved('ITEM-0004', { key: 'ArrowRight' });
    moved('REQ-0001', { key: 'ArrowRight' });
    moved('REQ-0003', { key: 'ArrowLeft' });
    expect(requests(h.sent)).toEqual([
      { kind: 'operation', operation: 'moveRequirement', on: ['REQ-0003'], args: { item: 'ITEM-0002', after: 'REQ-0004' } },
      { kind: 'operation', operation: 'moveRequirement', on: ['REQ-0004'], args: { item: 'ITEM-0002' } },
      { kind: 'operation', operation: 'moveItem', on: ['ITEM-0004'] },
      { kind: 'operation', operation: 'moveItem', on: ['ITEM-0002'], args: { after: 'ITEM-0001' } },
      { kind: 'operation', operation: 'moveItem', on: ['ITEM-0004'], args: { item: 'ITEM-0001' } },
      { kind: 'operation', operation: 'moveRequirement', on: ['REQ-0001'], args: { item: 'ITEM-0002' } },
      { kind: 'operation', operation: 'moveRequirement', on: ['REQ-0003'], args: { item: 'ITEM-0001' } },
    ]);
    // Kept from Visual Studio Code, whose Alt+Left goes back to the editor before.
    expect(reached).toBe(0);
  });

  it('moves the box where the document then has it', () => {
    show(h.page, viewOf());
    const after = (id: string, init: KeyboardEventInit): ReturnType<typeof viewOf> => {
      h.sent.length = 0;
      moved(id, init);
      return viewOf({}, applied(source, requests(h.sent)[0] as HierarchyRequest));
    };
    expect(after('REQ-0004', { key: 'ArrowUp' }).roots[0].levels[0].entries.map((entry) => entry.id)).toEqual(['REQ-0004', 'REQ-0003']);
    expect(after('ITEM-0004', { key: 'ArrowUp' }).roots.map((root) => root.id)).toEqual(['ITEM-0004', 'ITEM-0001', 'ITEM-0006']);
    expect(after('ITEM-0002', { key: 'ArrowLeft' }).roots.map((root) => root.id)).toEqual(['ITEM-0001', 'ITEM-0002', 'ITEM-0004', 'ITEM-0006']);
    const indented = after('REQ-0003', { key: 'ArrowLeft' });
    expect(all(indented.roots).find((one) => one.id === 'REQ-0003')!.parent).toBe('ITEM-0001');
  });

  it('says so where the box can go no further, and moves nothing', () => {
    show(h.page, viewOf());
    moved('REQ-0001', { key: 'ArrowUp' });
    expect(document.querySelector('.adp-hierarchy-status')!.textContent).toBe('REQ-0001 cannot be moved further that way.');
    moved('ITEM-0001', { key: 'ArrowLeft' });
    moved('REQ-0006', { key: 'ArrowLeft' });
    moved('ITEM-0006', { key: 'ArrowDown' });
    expect(requests(h.sent)).toEqual([]);
  });

  it('moves it earlier and later from the Command Palette as by its keys', () => {
    show(h.page, viewOf());
    choose('REQ-0003');
    h.page.receive({ v: 2, type: 'command', command: 'moveLater' });
    h.page.receive({ v: 2, type: 'command', command: 'moveEarlier' });
    expect(requests(h.sent)).toEqual([{ kind: 'operation', operation: 'moveRequirement', on: ['REQ-0003'], args: { item: 'ITEM-0002', after: 'REQ-0004' } }]);
    expect(document.querySelector('.adp-hierarchy-status')!.textContent).toBe('REQ-0003 cannot be moved further that way.');
  });

  it('moves a member of a label\'s list up and down with Alt and the arrows in its line', () => {
    show(h.page, viewOf());
    choose('REQ-0001');
    click(box('REQ-0001').querySelector('.hs-label-values')!);
    click(document.querySelector('.hs-tag-edit-list')!);
    const line = document.querySelectorAll<HTMLElement>('.hs-list-line')[1];
    const name = line.querySelector('input')!;
    expect(document.querySelector('.hs-list-lines')!.getAttribute('aria-label')).toBe('Tags');
    expect(key(name, { key: 'ArrowUp', altKey: true })).toBe(false);
    const moves = requests(h.sent);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ kind: 'operation', on: [line.dataset.member] });
  });
});
