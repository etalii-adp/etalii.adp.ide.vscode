import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FromCanvas, ToCanvas } from '../../../src/core/frame/protocol';
import type { ViewOptions } from '../../../src/core/frame/toolType';
import type { HierarchyView } from '../../../src/core/tool/hierarchyView';
import { HierarchyPage } from '../../../src/webview/hierarchy/page';
import { definitionOf, hierarchyDesignerOf } from '../../core/tool/support';

// The page of boxes in a simulated browser, drawing the view the Hierarchical Requirement Designer
// makes of its web-shop example, as the extension sends it: an outline of the levels and entries
// with their ids and titles, folded as the view says, a fold asked for as the operation the view
// names, and a selection told to the extension.

const type = hierarchyDesignerOf(definitionOf('hierarchical-requirement'));
const source = {
  fileName: 'C:/work/web-shop.md',
  text: readFileSync('examples/hierarchical-requirement/web-shop.md', 'utf8'),
  registration: readFileSync('examples/hierarchical-requirement/web-shop.adp', 'utf8'),
};

let sent: FromCanvas[];
let page: HierarchyPage;

const show = (view: HierarchyView, version = 1): void => page.receive({ v: 2, type: 'view', origin: type.origin, kind: 'designer', view, actions: [], version } satisfies ToCanvas);
const viewOf = (options: ViewOptions = {}): HierarchyView => type.view(source, options);
const item = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
const rowText = (id: string): string => item(id).querySelector('.adp-hierarchy-row')!.textContent ?? '';

beforeEach(() => {
  document.body.replaceChildren();
  sent = [];
  page = new HierarchyPage(document.body, (message) => sent.push(message));
});

describe('the page of boxes', () => {
  it('draws the levels and the entries nested as the view nests them, each with its id and title', () => {
    show(viewOf());
    expect(document.querySelector('.adp-hierarchy-name')!.textContent).toBe('web-shop');
    const top = [...document.querySelectorAll<HTMLElement>('[role="tree"] > [role="treeitem"]')].map((node) => node.dataset.id);
    expect(top).toEqual(['ITEM-0001', 'ITEM-0004', 'ITEM-0006']);
    expect(rowText('ITEM-0001')).toBe('ITEM-0001Storefront');
    const inStorefront = [...item('ITEM-0001').querySelectorAll<HTMLElement>(':scope > [role="group"] > [role="treeitem"]')].map((node) => node.dataset.id);
    expect(inStorefront).toEqual(['REQ-0001', 'REQ-0002', 'ITEM-0002']);
    expect(item('ITEM-0001').classList.contains('adp-hierarchy-level')).toBe(true);
    expect(item('REQ-0001').classList.contains('adp-hierarchy-entry')).toBe(true);
    expect(document.querySelector('.adp-hierarchy-notice')!.hasAttribute('hidden')).toBe(true);
  });

  it('hides what a collapsed level holds, and says it is collapsed', () => {
    show(viewOf());
    // ITEM-0003 is collapsed in the example's registration.
    expect(item('ITEM-0003').getAttribute('aria-expanded')).toBe('false');
    expect(item('ITEM-0003').querySelector('[role="group"]')).toBeNull();
    expect(item('ITEM-0002').getAttribute('aria-expanded')).toBe('true');
    expect(item('ITEM-0002').querySelector('[data-id="ITEM-0003"]')).not.toBeNull();
  });

  it('asks for a fold as the operation the view names for the gesture, and changes nothing itself', () => {
    show(viewOf());
    const fold = viewOf().roots[0].gestures.fold!;
    item('ITEM-0001').querySelector<HTMLButtonElement>('.adp-hierarchy-toggle')!.click();
    expect(sent).toEqual([{ v: 2, type: 'edit', seq: 1, request: { kind: 'operation', operation: fold.operation, on: ['ITEM-0001'] }, version: 1 }]);
    expect(item('ITEM-0001').getAttribute('aria-expanded')).toBe('true');
    // The view that follows, of the registration the fold wrote, draws it.
    show(type.view({ ...source, registration: source.registration.replace(/^collapsed:(\r?\n)/m, 'collapsed:$1  ITEM-0001: yes$1') }, {}), 2);
    expect(item('ITEM-0001').getAttribute('aria-expanded')).toBe('false');
    expect(item('ITEM-0001').querySelector('[role="group"]')).toBeNull();
  });

  it('tells the extension what is selected, and forgets what the document no longer has', () => {
    show(viewOf());
    item('REQ-0001').querySelector<HTMLElement>('.adp-hierarchy-title')!.click();
    expect(sent).toEqual([{ v: 2, type: 'selection', ids: ['REQ-0001'] }]);
    expect(item('REQ-0001').getAttribute('aria-selected')).toBe('true');
    show({ ...viewOf(), roots: viewOf().roots.slice(1) }, 2);
    expect(sent.at(-1)).toEqual({ v: 2, type: 'selection', ids: [] });
  });

  it('shows the refusal of its request, and a read-only document\'s notice with no fold offered', () => {
    show(viewOf());
    item('ITEM-0001').querySelector<HTMLButtonElement>('.adp-hierarchy-toggle')!.click();
    page.receive({ v: 2, type: 'outcome', seq: 1, result: 'refused', sentence: 'Not now.' });
    expect(document.querySelector('.adp-hierarchy-status')!.textContent).toBe('Not now.');

    const later = { ...source, text: source.text.replace('<!-- ded: 0.2 ', '<!-- ded: 0.3 ') };
    show(type.view(later, {}), 2);
    const notice = document.querySelector('.adp-hierarchy-notice')!;
    expect(notice.hasAttribute('hidden')).toBe(false);
    expect(notice.textContent).toContain('DED 0.3');
    const toggle = item('ITEM-0001').querySelector<HTMLButtonElement>('.adp-hierarchy-toggle')!;
    expect(toggle.disabled).toBe(true);
    sent = [];
    toggle.click();
    expect(sent).toEqual([]);
  });
});
