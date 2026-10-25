import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FromCanvas, ToCanvas, ViewCause } from '../../../src/core/frame/protocol';
import type { Source, ViewOptions } from '../../../src/core/frame/toolType';
import type { HierarchyRequest, HierarchyView } from '../../../src/core/tool/hierarchyView';
import { HierarchyPage } from '../../../src/webview/hierarchy/page';
import { definitionOf, hierarchyDesignerOf } from '../../core/tool/support';
import { pointer } from '../support';

// The page of boxes in a simulated browser, drawing the view the Hierarchical Requirement Designer
// makes of its web-shop example, as the extension sends it. Every change the page asks for is a
// request whose operation the view names for the gesture; the view that follows draws its result.
// There is no layout in a simulated browser: a width is given to the page where a test needs one,
// and the box under the pointer is named by the test.

const type = hierarchyDesignerOf(definitionOf('hierarchical-requirement'));
const source: Source = {
  fileName: 'C:/work/web-shop.md',
  text: readFileSync('examples/hierarchical-requirement/web-shop.md', 'utf8'),
  registration: readFileSync('examples/hierarchical-requirement/web-shop.adp', 'utf8'),
};

let sent: FromCanvas[];
let page: HierarchyPage;

const show = (view: HierarchyView, version = 1, cause?: ViewCause): void =>
  page.receive({ v: 2, type: 'view', origin: type.origin, kind: 'designer', view, actions: [], version, ...(cause === undefined ? {} : { cause }) } satisfies ToCanvas);
const viewOf = (options: ViewOptions = {}, from: Source = source): HierarchyView => type.view(from, options);
const box = (id: string): HTMLElement => document.querySelector<HTMLElement>(`.hs-box[data-id="${id}"]`)!;
const node = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-node="${id}"]`)!;
const childrenIds = (element: Element | null): string[] => [...(element?.children ?? [])].map((child) => (child as HTMLElement).dataset.node ?? '').filter((id) => id !== '');
const contentOf = (id: string): HTMLElement | null => node(id).querySelector(':scope > .hs-level-content');
const requests = (): HierarchyRequest[] => sent.filter((message) => message.type === 'edit').map((message) => (message as Extract<FromCanvas, { type: 'edit' }>).request as HierarchyRequest);
const button = (name: string): HTMLButtonElement => [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.getAttribute('aria-label') === name || candidate.textContent === name)!;
const key = (target: Element, init: KeyboardEventInit): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
};
const dblclick = (target: Element): void => {
  target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
};
const typeInto = (field: HTMLTextAreaElement, text: string): void => {
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
};
/** Gives the page a width, as a window of that size would. */
const widen = (width: number): void => {
  Object.defineProperty(document.querySelector('.hs-page'), 'clientWidth', { value: width, configurable: true });
  window.dispatchEvent(new Event('resize'));
};

/** The document after an edit the type makes of it, as the extension would apply it. */
function applied(from: Source, request: HierarchyRequest): Source {
  const outcome = type.edit(from, request, {}, true);
  if (outcome.kind !== 'applied') throw new Error(`not applied: ${JSON.stringify(outcome)}`);
  let text = from.text;
  for (const splice of [...outcome.splices].sort((a, b) => b.offset - a.offset)) text = text.slice(0, splice.offset) + splice.text + text.slice(splice.offset + splice.length);
  return { ...from, text, ...(outcome.registration ? { registration: outcome.registration } : {}) };
}

beforeEach(() => {
  document.body.replaceChildren();
  sent = [];
  page = new HierarchyPage(document.body, (message) => sent.push(message));
});

describe('the page of boxes', () => {
  it('draws a level as a box with its entries and then its levels to its right, in document order, its top levels stacked at the left', () => {
    show(viewOf());
    expect(document.querySelector('.adp-hierarchy-name')!.textContent).toBe('web-shop');
    expect(childrenIds(document.querySelector('.hs-page'))).toEqual(['ITEM-0001', 'ITEM-0004', 'ITEM-0006']);
    expect(node('ITEM-0001').classList.contains('hs-level')).toBe(true);
    expect(node('ITEM-0001').querySelector(':scope > .hs-level-box')!.getAttribute('style')).toContain('width: 240px');
    expect(childrenIds(contentOf('ITEM-0001'))).toEqual(['REQ-0001', 'REQ-0002', 'ITEM-0002']);
    expect(childrenIds(contentOf('ITEM-0002'))).toEqual(['REQ-0003', 'REQ-0004', 'ITEM-0003']);
    expect(node('REQ-0001').classList.contains('hs-entry')).toBe(true);
    expect(node('REQ-0001').getAttribute('role')).toBe('treeitem');
    expect(document.querySelector('.adp-hierarchy-notice')!.hasAttribute('hidden')).toBe(true);
  });

  it('shows the number beside the title, the labels under the title and the description under them, a mention as a box with its target', () => {
    show(viewOf());
    const header = box('ITEM-0001').querySelector('.hs-box-header')!;
    expect(header.querySelector('.hs-number')!.textContent).toBe('ITEM-0001');
    expect(header.querySelector('.hs-title')!.textContent).toBe('Storefront');
    const labels = [...box('REQ-0001').querySelectorAll<HTMLElement>('.hs-tags .hs-label')].map((label) => [label.textContent, label.dataset.colour]);
    expect(labels).toEqual([['search', 'default'], ['functional', 'blue'], ['accepted', 'green']]);
    const description = box('REQ-0004').querySelector('.hs-description')!;
    expect(description.previousElementSibling!.classList.contains('hs-tags')).toBe(true);
    const references = [...description.querySelectorAll('.hs-reference')].map((reference) => reference.textContent);
    expect(references).toEqual(['REQ-0003 A customer pays by card, iDEAL or PayPal.', 'ITEM-0005 Mail']);
    expect(description.textContent).toBe('Sent when REQ-0003 A customer pays by card, iDEAL or PayPal. succeeds, through the service of ITEM-0005 Mail.');
  });

  it('marks a mention that names nothing, keeping its text as written', () => {
    show(viewOf({}, { ...source, text: source.text.replace('[ITEM-0005]', '[ITEM-0099]') }));
    const broken = box('REQ-0004').querySelector('.hs-reference-broken')!;
    expect(broken.textContent).toBe('[ITEM-0099]');
    expect(broken.getAttribute('aria-label')).toBe('[ITEM-0099] names nothing in this document');
  });

  it('marks the open notes of a box: the kind\'s icon for one, its text in the tooltip', () => {
    show(viewOf());
    expect(box('REQ-0006').querySelector('.hs-note-mark')!.getAttribute('title')).toBe('Question: Is 30 minutes right for the mobile app?');
    // The warning about ITEM-0002 is resolved.
    expect(box('ITEM-0002').querySelector('.hs-note-mark')).toBeNull();
    expect(box('REQ-0001').querySelector('.hs-note-mark')).toBeNull();
  });
});

describe('collapsing', () => {
  it('shows a collapsed level\'s number, title, labels and notes only, and nothing it holds', () => {
    show(viewOf());
    // ITEM-0003 and REQ-0002 are collapsed in the example's registration.
    expect(node('ITEM-0003').getAttribute('aria-expanded')).toBe('false');
    expect(contentOf('ITEM-0003')).toBeNull();
    expect(box('ITEM-0003').querySelector('.hs-focus')).toBeNull();
    expect(node('ITEM-0002').getAttribute('aria-expanded')).toBe('true');
    expect(box('REQ-0002').querySelector('.hs-description')).toBeNull();
    expect(box('REQ-0002').querySelectorAll('.hs-label')).toHaveLength(3);
    expect(box('REQ-0002').classList.contains('hs-collapsed')).toBe(true);
  });

  it('asks for a fold as the operation the view names for the gesture, and changes nothing itself', () => {
    show(viewOf());
    const fold = viewOf().roots[0].gestures.fold!;
    box('ITEM-0001').querySelector<HTMLButtonElement>('.hs-toggle')!.click();
    expect(sent).toEqual([{ v: 2, type: 'edit', seq: 1, request: { kind: 'operation', operation: fold.operation, on: ['ITEM-0001'] }, version: 1 }]);
    expect(node('ITEM-0001').getAttribute('aria-expanded')).toBe('true');
    show(type.view({ ...source, registration: source.registration!.replace(/^collapsed:(\r?\n)/m, 'collapsed:$1  ITEM-0001: yes$1') }, {}), 2);
    expect(node('ITEM-0001').getAttribute('aria-expanded')).toBe('false');
    expect(contentOf('ITEM-0001')).toBeNull();
  });
});

describe('focus', () => {
  it('shows as many levels as fit the width, marks the levels that do not fit, and narrows the page to a level and back', () => {
    show(viewOf());
    // Room for two columns of levels beside the entries of the deepest.
    widen(280 + 2 * 240);
    expect(childrenIds(contentOf('ITEM-0002'))).toEqual(['REQ-0003', 'REQ-0004']);
    const more = box('ITEM-0002').querySelector<HTMLButtonElement>('.hs-hidden-levels')!;
    expect(more.title).toBe('1 more level');
    expect(more.getAttribute('aria-label')).toBe('1 more level: show the levels of ITEM-0002 Checkout');
    expect(box('ITEM-0001').querySelector('.hs-hidden-levels')).toBeNull();

    more.click();
    expect(sent.at(-1)).toEqual({ v: 2, type: 'viewOptions', options: { focus: 'ITEM-0002' } });
    expect(childrenIds(document.querySelector('.hs-page'))).toEqual(['ITEM-0002']);
    expect(childrenIds(contentOf('ITEM-0002'))).toEqual(['REQ-0003', 'REQ-0004', 'ITEM-0003']);
    expect(requests()).toEqual([]);

    // The trail leads back.
    const trail = document.querySelector('.hs-trail')!;
    expect([...trail.querySelectorAll('.hs-trail-link, .hs-trail-current')].map((step) => step.textContent)).toEqual(['web-shop', 'ITEM-0001 Storefront', 'ITEM-0002 Checkout']);
    expect(trail.querySelector('.hs-trail-current')!.textContent).toBe('ITEM-0002 Checkout');
    button('ITEM-0001 Storefront').click();
    expect(sent.at(-1)).toEqual({ v: 2, type: 'viewOptions', options: { focus: 'ITEM-0001' } });
    button('web-shop').click();
    expect(sent.at(-1)).toEqual({ v: 2, type: 'viewOptions', options: {} });
    expect(childrenIds(document.querySelector('.hs-page'))).toEqual(['ITEM-0001', 'ITEM-0004', 'ITEM-0006']);
  });

  it('shows the levels inside a level in its place where only one level fits', () => {
    show(viewOf());
    widen(600);
    expect(contentOf('ITEM-0001')!.querySelector('[data-node="ITEM-0002"]')).toBeNull();
    box('ITEM-0001').querySelector<HTMLButtonElement>('.hs-hidden-levels')!.click();
    expect(childrenIds(document.querySelector('.hs-page'))).toEqual(['ITEM-0002']);
    expect(document.querySelector('.hs-trail-current')).toBeNull();
  });

  it('focuses on any level by its focus control, and keeps the level the editor kept', () => {
    show(viewOf({ focus: 'ITEM-0004' }));
    expect(childrenIds(document.querySelector('.hs-page'))).toEqual(['ITEM-0004']);
    box('ITEM-0005').querySelector<HTMLButtonElement>('.hs-focus')!.click();
    expect(sent.at(-1)).toEqual({ v: 2, type: 'viewOptions', options: { focus: 'ITEM-0005' } });
    expect(childrenIds(document.querySelector('.hs-page'))).toEqual(['ITEM-0005']);
  });

  it('shows the trail of the selection, naming its levels only', () => {
    show(viewOf());
    expect([...document.querySelectorAll('.hs-trail-step')]).toHaveLength(0);
    box('REQ-0003').click();
    expect([...document.querySelectorAll('.hs-trail-step')].map((step) => step.textContent)).toEqual(['ITEM-0001 Storefront', 'ITEM-0002 Checkout']);
    box('ITEM-0003').click();
    expect([...document.querySelectorAll('.hs-trail-step')].map((step) => step.textContent)).toEqual(['ITEM-0001 Storefront', 'ITEM-0002 Checkout', 'ITEM-0003 Guest checkout']);
  });
});

describe('selecting and adding', () => {
  it('tells the extension what is selected, and forgets what the document no longer has', () => {
    show(viewOf());
    box('REQ-0001').querySelector<HTMLElement>('.hs-title')!.click();
    expect(sent).toEqual([{ v: 2, type: 'selection', ids: ['REQ-0001'] }]);
    expect(node('REQ-0001').getAttribute('aria-selected')).toBe('true');
    expect(box('REQ-0001').classList.contains('hs-selected')).toBe(true);
    show({ ...viewOf(), roots: viewOf().roots.slice(1) }, 2);
    expect(sent.at(-1)).toEqual({ v: 2, type: 'selection', ids: [] });
  });

  it('offers adding at the end of every level and of the page, as icons, and asks for the operation each names', () => {
    show(viewOf());
    const adds = contentOf('ITEM-0002')!.querySelector(':scope > .hs-add')!;
    expect([...adds.querySelectorAll('button')].map((control) => [control.getAttribute('aria-label'), control.title, control.textContent])).toEqual([
      ['New requirement in ITEM-0002', 'New requirement', ''],
      ['New item in ITEM-0002', 'New item', ''],
    ]);
    button('New requirement in ITEM-0002').click();
    button('New item in ITEM-0002').click();
    button('New item').click();
    expect(requests()).toEqual([
      { kind: 'operation', operation: 'addRequirement', on: ['ITEM-0002'] },
      { kind: 'operation', operation: 'addItem', on: ['ITEM-0002'] },
      { kind: 'operation', operation: 'addTopItem' },
    ]);
    // Nothing is added inside a collapsed level.
    expect(button('New requirement in ITEM-0003')).toBeUndefined();
  });

  it('adds below the selection with Ctrl+Enter, and a requirement into a selected level with Ctrl+Shift+Enter', () => {
    show(viewOf());
    const surface = document.querySelector('.hs-page')!;
    box('REQ-0001').click();
    key(surface, { key: 'Enter', ctrlKey: true });
    key(surface, { key: 'Enter' });
    box('ITEM-0001').click();
    key(surface, { key: 'Enter', ctrlKey: true });
    key(surface, { key: 'Enter', ctrlKey: true, shiftKey: true });
    expect(requests()).toEqual([
      { kind: 'operation', operation: 'addRequirementBelow', on: ['REQ-0001'] },
      { kind: 'operation', operation: 'addItemBelow', on: ['ITEM-0001'] },
      { kind: 'operation', operation: 'addRequirement', on: ['ITEM-0001'] },
    ]);
  });

  it('reveals and selects the entry an add made, and opens its title for typing after its number', () => {
    show(viewOf());
    widen(280 + 240);
    const after = applied(source, { kind: 'operation', operation: 'addRequirement', on: ['ITEM-0003'] });
    show(viewOf({}, after), 2, 'edit');
    // As the extension says it after the edit: the outcome's `select` with `editLabel`.
    page.receive({ v: 2, type: 'reveal', id: 'REQ-0014', editLabel: true });

    // ITEM-0003 is collapsed and two levels deep: the page narrows to it and expands it by its fold.
    expect(requests()).toEqual([{ kind: 'operation', operation: 'toggleCollapsed', on: ['ITEM-0003'] }]);
    expect(sent).toContainEqual({ v: 2, type: 'viewOptions', options: { focus: 'ITEM-0003' } });
    expect(sent).toContainEqual({ v: 2, type: 'selection', ids: ['REQ-0014'] });
    show(viewOf({ focus: 'ITEM-0003' }, applied(after, { kind: 'operation', operation: 'toggleCollapsed', on: ['ITEM-0003'] })), 3, 'edit');
    const field = box('REQ-0014').querySelector<HTMLTextAreaElement>('textarea')!;
    expect(field.getAttribute('aria-label')).toBe('Title of REQ-0014');
    expect(field.value).toBe('New requirement');
    expect(field.previousElementSibling!.classList.contains('hs-number')).toBe(true);
    expect(document.activeElement).toBe(field);
  });
});

describe('typing in place', () => {
  it('keeps a title typed on Enter as the rename the view names, after its number and one line high', () => {
    show(viewOf());
    dblclick(box('REQ-0001').querySelector('.hs-title')!);
    const field = box('REQ-0001').querySelector<HTMLTextAreaElement>('.hs-field-title')!;
    expect(field.rows).toBe(1);
    expect(field.previousElementSibling!.textContent).toBe('REQ-0001');
    typeInto(field, 'A customer finds\na product.');
    expect(field.value).toBe('A customer finds a product.');
    key(field, { key: 'Enter' });
    expect(requests()).toEqual([{ kind: 'operation', operation: 'setTitle', on: ['REQ-0001'], args: { title: 'A customer finds a product.' } }]);
    expect(box('REQ-0001').querySelector('textarea')).toBeNull();
  });

  it('drops the text on Escape, and sends nothing for a title left as it was', () => {
    show(viewOf());
    dblclick(box('REQ-0001').querySelector('.hs-title')!);
    const field = box('REQ-0001').querySelector<HTMLTextAreaElement>('textarea')!;
    typeInto(field, 'Something else');
    key(field, { key: 'Escape' });
    expect(box('REQ-0001').querySelector('textarea')).toBeNull();
    expect(box('REQ-0001').querySelector('.hs-title')!.textContent).toBe('A customer finds a product by its name or its description.');
    box('REQ-0001').click();
    key(document.querySelector('.hs-page')!, { key: 'F2' });
    key(box('REQ-0001').querySelector('textarea')!, { key: 'Enter' });
    expect(requests()).toEqual([]);
  });

  it('keeps a description typed in its place on Ctrl+Enter, Enter starting a new line', () => {
    show(viewOf());
    dblclick(box('REQ-0004').querySelector('.hs-description')!);
    const field = box('REQ-0004').querySelector<HTMLTextAreaElement>('.hs-description-field > textarea')!;
    expect(field.getAttribute('aria-label')).toBe('Description of REQ-0004');
    expect(field.value).toBe('Sent when [REQ-0003] succeeds, through the service of [ITEM-0005].');
    typeInto(field, 'Sent once.\nAgain.');
    key(field, { key: 'Enter' });
    expect(requests()).toEqual([]);
    key(field, { key: 'Enter', ctrlKey: true });
    expect(requests()).toEqual([{ kind: 'operation', operation: 'setDescription', on: ['REQ-0004'], args: { description: 'Sent once.\nAgain.' } }]);
  });

  it('offers a description on a selected box that has none', () => {
    show(viewOf());
    expect(box('REQ-0001').querySelector('.hs-add-description')).toBeNull();
    box('REQ-0001').click();
    box('REQ-0001').querySelector<HTMLButtonElement>('.hs-add-description')!.click();
    expect(box('REQ-0001').querySelector<HTMLTextAreaElement>('.hs-description-field > textarea')!.value).toBe('');
  });

  it('keeps the field, its text and the focus when a new view arrives', () => {
    show(viewOf());
    dblclick(box('REQ-0001').querySelector('.hs-title')!);
    const field = box('REQ-0001').querySelector<HTMLTextAreaElement>('textarea')!;
    typeInto(field, 'Half typed');
    show(viewOf({}, applied(source, { kind: 'operation', operation: 'setTitle', on: ['REQ-0009'], args: { title: 'Kept for seven years.' } })), 2, 'edit');
    expect(box('REQ-0009').querySelector('.hs-title')!.textContent).toBe('Kept for seven years.');
    expect(box('REQ-0001').querySelector('textarea')).toBe(field);
    expect(field.value).toBe('Half typed');
    expect(document.activeElement).toBe(field);
    expect(document.querySelector('.hs-conflict')!.hasAttribute('hidden')).toBe(true);
  });
});

describe('the bar of a change from outside', () => {
  it('asks what to do with the text when the file changes outside the designer while a field is open', () => {
    show(viewOf());
    dblclick(box('REQ-0001').querySelector('.hs-title')!);
    const field = box('REQ-0001').querySelector<HTMLTextAreaElement>('textarea')!;
    typeInto(field, 'My text');
    const outside = applied(source, { kind: 'operation', operation: 'setTitle', on: ['REQ-0002'], args: { title: 'Pages load fast.' } });
    show(viewOf({}, outside), 2, 'outside');
    const bar = document.querySelector<HTMLElement>('.hs-conflict')!;
    expect(bar.hidden).toBe(false);
    expect(bar.textContent).toContain('This file was changed outside the designer.');
    expect(box('REQ-0002').querySelector('.hs-title')!.textContent).toBe('Pages load fast.');

    button('Keep my text').click();
    expect(bar.hidden).toBe(true);
    expect(box('REQ-0001').querySelector('textarea')!.value).toBe('My text');

    show(viewOf({}, outside), 3, 'outside');
    expect(bar.hidden).toBe(false);
    button('Show the file').click();
    expect(bar.hidden).toBe(true);
    expect(box('REQ-0001').querySelector('textarea')).toBeNull();
    expect(requests()).toEqual([]);
  });

  it('is not shown for the designer\'s own edit, nor while no field is open', () => {
    show(viewOf());
    show(viewOf(), 2, 'outside');
    expect(document.querySelector<HTMLElement>('.hs-conflict')!.hidden).toBe(true);
    dblclick(box('REQ-0001').querySelector('.hs-title')!);
    show(viewOf(), 3, 'edit');
    expect(document.querySelector<HTMLElement>('.hs-conflict')!.hidden).toBe(true);
  });
});

describe('deleting', () => {
  it('asks for the removal with Delete, and asks the extension\'s question in the page, answering it', () => {
    show(viewOf());
    box('ITEM-0002').click();
    key(document.querySelector('.hs-page')!, { key: 'Delete' });
    expect(requests()).toEqual([{ kind: 'operation', operation: 'deleteEntry', on: ['ITEM-0002'] }]);

    const message = 'Delete ITEM-0002 with everything in it? 4 entries, references or assessments concern it; the references and assessments are kept, and reported.';
    page.receive({ v: 2, type: 'confirm', seq: 1, title: 'Delete', message, confirmLabel: 'OK', danger: false });
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(message);
    expect(document.activeElement).toBe(button('Cancel'));
    button('Cancel').click();
    expect(sent.at(-1)).toEqual({ v: 2, type: 'confirmed', seq: 1, confirmed: false });
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    page.receive({ v: 2, type: 'confirm', seq: 1, title: 'Delete', message, confirmLabel: 'OK', danger: false });
    button('OK').click();
    expect(sent.at(-1)).toEqual({ v: 2, type: 'confirmed', seq: 1, confirmed: true });
    page.receive({ v: 2, type: 'confirm', seq: 2, title: 'Delete', message, confirmLabel: 'OK', danger: false });
    key(document.querySelector('[role="dialog"]')!, { key: 'Escape' });
    expect(sent.at(-1)).toEqual({ v: 2, type: 'confirmed', seq: 2, confirmed: false });
  });

  it('offers a selected box\'s delete at its bottom right, keeping its place on every box that can be deleted', () => {
    show(viewOf());
    expect(box('REQ-0001').querySelector('.hs-delete-place')).not.toBeNull();
    expect(box('REQ-0001').querySelector('.hs-delete')).toBeNull();
    box('REQ-0001').click();
    button('Delete REQ-0001 A customer finds a product by its name or its description.').click();
    expect(requests()).toEqual([{ kind: 'operation', operation: 'deleteEntry', on: ['REQ-0001'] }]);
  });
});

describe('dragging', () => {
  /** Puts `element` under the pointer, its box 40 pixels high from the top. */
  function under(element: Element): void {
    document.elementFromPoint = vi.fn(() => element);
    (element as HTMLElement).getBoundingClientRect = () => ({ left: 0, right: 200, top: 0, bottom: 40, width: 200, height: 40, x: 0, y: 0, toJSON: () => ({}) });
  }
  const grip = (id: string): Element => box(id).querySelector('.hs-grip')!;
  function drag(id: string, toY: number, drop = true): void {
    pointer(grip(id), 'pointerdown', 5, 5);
    pointer(grip(id), 'pointermove', 5, toY);
    if (drop) pointer(window, 'pointerup', 5, toY);
  }

  it('moves a requirement after another from its lower half, showing where it would stand meanwhile', () => {
    show(viewOf());
    under(box('REQ-0003'));
    drag('REQ-0001', 30, false);
    const slot = document.querySelector('.hs-drop-slot')!;
    expect(slot.textContent).toBe('REQ-0001 A customer finds a product by its name or its description.');
    expect((slot.previousElementSibling as HTMLElement).dataset.node).toBe('REQ-0003');
    expect(node('REQ-0001').classList.contains('hs-dragging')).toBe(true);
    expect(requests()).toEqual([]);

    // Over the place it would stand, the drop stays.
    under(slot);
    pointer(window, 'pointermove', 5, 34);
    expect(document.querySelector('.hs-drop-slot')).not.toBeNull();
    pointer(window, 'pointerup', 5, 34);
    expect(requests()).toEqual([{ kind: 'operation', operation: 'moveRequirement', on: ['REQ-0001'], args: { item: 'ITEM-0002', after: 'REQ-0003' } }]);
    expect(document.querySelector('.hs-drop-slot')).toBeNull();
  });

  it('moves an item with what it holds into an item from its upper half, and after one from its lower half', () => {
    show(viewOf());
    under(box('ITEM-0002'));
    drag('ITEM-0005', 10);
    under(box('ITEM-0006'));
    drag('ITEM-0004', 30);
    expect(requests()).toEqual([
      { kind: 'operation', operation: 'moveItem', on: ['ITEM-0005'], args: { item: 'ITEM-0002' } },
      { kind: 'operation', operation: 'moveItem', on: ['ITEM-0004'], args: { after: 'ITEM-0006' } },
    ]);
  });

  it('moves nothing into itself, and nothing by a press that does not move', () => {
    show(viewOf());
    under(box('ITEM-0003'));
    drag('ITEM-0002', 10);
    pointer(grip('REQ-0001'), 'pointerdown', 5, 5);
    pointer(window, 'pointerup', 5, 5);
    expect(requests()).toEqual([]);
  });
});

describe('findings', () => {
  it('lists every finding, which shows its entry when it is selected', () => {
    show(viewOf());
    const list = document.querySelector('.hs-findings')!;
    expect(list.textContent).toContain('REQ-0013 is numbered when the document is next changed: the file holds REQ-NEW.');
    expect(list.querySelector('.hs-finding-line')!.textContent).toBe('line 43');
    list.querySelector<HTMLButtonElement>('.hs-finding-link')!.click();
    // REQ-0013 stands in ITEM-0003, which is collapsed: its fold opens it.
    expect(requests()).toEqual([{ kind: 'operation', operation: 'toggleCollapsed', on: ['ITEM-0003'] }]);
    expect(sent.at(-1)).toEqual({ v: 2, type: 'selection', ids: ['REQ-0013'] });
  });

  it('stays listed when the filter hides its entry', () => {
    show(viewOf({ query: '#security' }));
    expect(document.querySelector('[data-node="REQ-0013"]')).toBeNull();
    expect(document.querySelector('.hs-findings')!.textContent).toContain('REQ-0013 is numbered');
  });
});

describe('the rest of the page', () => {
  it('shows its keys, in the words of the operations they run', () => {
    show(viewOf());
    const help = document.querySelector<HTMLElement>('.hs-help')!;
    expect(help.hidden).toBe(true);
    button('Keys').click();
    expect(help.hidden).toBe(false);
    const rows = [...help.querySelectorAll('dt')].map((term) => `${term.textContent}: ${term.nextElementSibling!.textContent}`);
    expect(rows.slice(0, 3)).toEqual([
      'Ctrl+Enter: New item below or New requirement below',
      'Ctrl+Shift+Enter: New requirement in the selected item',
      'Delete: Delete, asking first when anything concerns it',
    ]);
  });

  it('shows the refusal of its request, and a read-only document\'s notice with nothing that edits offered', () => {
    show(viewOf());
    box('ITEM-0001').querySelector<HTMLButtonElement>('.hs-toggle')!.click();
    page.receive({ v: 2, type: 'outcome', seq: 1, result: 'refused', sentence: 'Not now.' });
    expect(document.querySelector('.adp-hierarchy-status')!.textContent).toBe('Not now.');

    const later = { ...source, text: source.text.replace('<!-- ded: 0.2 ', '<!-- ded: 0.3 ') };
    show(type.view(later, {}), 2);
    const notice = document.querySelector('.adp-hierarchy-notice')!;
    expect(notice.hasAttribute('hidden')).toBe(false);
    expect(notice.textContent).toContain('DED 0.3');
    const toggle = box('ITEM-0001').querySelector<HTMLButtonElement>('.hs-toggle')!;
    expect(toggle.disabled).toBe(true);
    expect(document.querySelectorAll('.hs-add, .hs-grip, .hs-delete-place')).toHaveLength(0);
    sent = [];
    toggle.click();
    dblclick(box('REQ-0001').querySelector('.hs-title')!);
    expect(document.querySelector('textarea')).toBeNull();
    expect(sent).toEqual([]);
  });
});
