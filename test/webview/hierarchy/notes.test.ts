import { beforeEach, describe, expect, it } from 'vitest';
import type { HierarchyRequest } from '../../../src/core/tool/hierarchyView';
import { applied, box, button, click, harness, key, requests, show, source, typeInto, viewOf, type Harness } from './pageSupport';

// The list of a box's notes, as the standalone host draws it after its #695 and #696: opened from
// the icon at the box's top right, over every pane, each note resolved, changed or removed by the
// icons beside it in the definition's words, and a new one added below with its kind; every gesture
// the operation the view names for it.

let h: Harness;
const list = (): HTMLElement | null => document.querySelector('.hs-note-list');

beforeEach(() => {
  h = harness();
});

describe('the list of a box\'s notes', () => {
  it('opens from the mark of the notes, over the page rather than inside it, with each note, its kind\'s icon and what it is about', () => {
    show(h.page, viewOf());
    const mark = box('REQ-0006').querySelector<HTMLButtonElement>('.hs-note-mark')!;
    expect(mark.getAttribute('aria-expanded')).toBe('false');
    click(mark);
    const opened = list()!;
    expect(opened.closest('.hs-overlay')).not.toBeNull();
    expect(opened.closest('.hs-page')).toBeNull();
    expect(opened.getAttribute('role')).toBe('dialog');
    expect(opened.getAttribute('aria-label')).toBe('Note of REQ-0006');
    expect([...opened.querySelectorAll('.hs-note')].map((note) => note.querySelector('.hs-note-head')!.textContent)).toEqual(['REQ-0006Is 30 minutes right for the mobile app?']);
    expect(opened.querySelector('.hs-note-kind')!.getAttribute('aria-label')).toBe('Question');
    expect(box('REQ-0006').querySelector('.hs-note-mark')!.getAttribute('aria-expanded')).toBe('true');
    // The same icon closes it again.
    click(box('REQ-0006').querySelector('.hs-note-mark')!);
    expect(list()).toBeNull();
  });

  it('offers a box without open notes the way to add the first, which opens the list with a resolved one too', () => {
    show(h.page, viewOf());
    expect(box('REQ-0001').querySelector('.hs-note-add')!.getAttribute('aria-label')).toBe('New assessment on REQ-0001');
    // The warning about ITEM-0002 is resolved: it is listed, struck, and offers to be reopened.
    click(box('ITEM-0002').querySelector('.hs-note-add')!);
    const resolved = list()!.querySelector('.hs-note')!;
    expect(resolved.classList.contains('hs-note-resolved')).toBe(true);
    expect([...resolved.querySelectorAll('.hs-note-action')].map((action) => action.getAttribute('title'))).toEqual(['Reopen', 'Change', 'Remove']);
    expect(resolved.querySelector('.hs-note-detail')!.textContent).toBe('Resolved: the provider\'s session ends before ours.');
  });

  it('resolves, changes and removes a note by the operations the view names, in the words of the definition', () => {
    show(h.page, viewOf());
    click(box('REQ-0006').querySelector('.hs-note-mark')!);
    const actions = [...list()!.querySelectorAll<HTMLButtonElement>('.hs-note-action')];
    expect(actions.map((action) => action.getAttribute('aria-label'))).toEqual(['Resolve', 'Change', 'Remove']);
    click(actions[0]);
    click(actions[2]);
    click(actions[1]);
    const changing = list()!.querySelector('.hs-note-changing')!;
    const text = changing.querySelector<HTMLTextAreaElement>('.hs-note-text-field')!;
    expect(text.value).toBe('Is 30 minutes right for the mobile app?');
    typeInto(text, 'Is 30 minutes right?');
    typeInto(changing.querySelector<HTMLTextAreaElement>('.hs-note-detail-field')!, 'Ask support.');
    click(changing.querySelector<HTMLElement>('.hs-kind-button')!);
    click(changing.querySelector<HTMLElement>('.hs-kind-option[data-kind="warning"]')!);
    click([...list()!.querySelectorAll<HTMLButtonElement>('.hs-note-changing button')].find((candidate) => candidate.textContent === 'Change')!);
    expect(requests(h.sent)).toEqual<HierarchyRequest[]>([
      { kind: 'operation', operation: 'resolveAssessment', on: ['assessment/0'] },
      { kind: 'operation', operation: 'removeAssessment', on: ['assessment/0'] },
      { kind: 'operation', operation: 'changeAssessment', on: ['assessment/0'], args: { kind: 'warning', text: 'Is 30 minutes right?', detail: 'Ask support.' } },
    ]);
  });

  it('adds a note of the kind chosen with the text typed, the field three lines high with the Add below it, and follows the file', () => {
    show(h.page, viewOf());
    click(box('REQ-0001').querySelector('.hs-note-add')!);
    const field = list()!.querySelector<HTMLTextAreaElement>('.hs-note-new .hs-note-text-field')!;
    expect(field.rows).toBe(3);
    expect(document.activeElement).toBe(field);
    const add = list()!.querySelector<HTMLButtonElement>('.hs-note-add-button')!;
    expect(field.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(add.disabled).toBe(true);
    // The kinds, each with its icon, chosen by the keys.
    const kind = list()!.querySelector<HTMLElement>('.hs-note-new .hs-kind')!;
    key(kind.querySelector('.hs-kind-button')!, { key: 'ArrowDown' });
    expect([...kind.querySelectorAll('.hs-kind-option')].map((option) => option.textContent)).toEqual(['Question', 'Remark', 'Warning', 'Idea']);
    key(kind.querySelector('.hs-kind-button')!, { key: 'ArrowDown' });
    key(kind.querySelector('.hs-kind-button')!, { key: 'Enter' });
    typeInto(list()!.querySelector<HTMLTextAreaElement>('.hs-note-new .hs-note-text-field')!, 'Which search engine?');
    key(list()!.querySelector<HTMLTextAreaElement>('.hs-note-new .hs-note-text-field')!, { key: 'Enter' });
    const request = requests(h.sent)[0];
    expect(request).toEqual({ kind: 'operation', operation: 'addAssessment', on: ['REQ-0001'], args: { kind: 'remark', text: 'Which search engine?' } });
    // The view that follows lists it, and the box marks it.
    show(h.page, viewOf({}, applied(source, request)), 2);
    expect(list()!.querySelectorAll('.hs-note')).toHaveLength(1);
    expect(box('REQ-0001').querySelector('.hs-note-mark')!.getAttribute('title')).toBe('Remark: Which search engine?');
  });

  it('keeps its keys, and closes on Escape or a press outside', () => {
    show(h.page, viewOf());
    click(box('REQ-0006').querySelector('.hs-note-mark')!);
    click(box('REQ-0006'));
    // Delete typed in the list is not the page's delete.
    expect(key(list()!.querySelector('.hs-note-text-field')!, { key: 'Delete' })).toBe(true);
    expect(h.sent.filter((message) => message.type === 'confirmed' || message.type === 'edit')).toEqual([]);
    key(list()!.querySelector('.hs-note-text-field')!, { key: 'Escape' });
    expect(list()).toBeNull();
    click(box('REQ-0006').querySelector('.hs-note-mark')!);
    document.querySelector('.hs-page')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(list()).toBeNull();
  });

  it('places a note\'s controls beside it when it takes several lines, and under it when it takes one', () => {
    show(h.page, viewOf());
    const tall = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const height = this.classList.contains('hs-note-body') ? 60 : 0;
      return { left: 0, right: 0, top: 0, bottom: height, width: 0, height, x: 0, y: 0, toJSON: () => ({}) };
    };
    try {
      click(box('REQ-0006').querySelector('.hs-note-mark')!);
      expect(list()!.querySelector('.hs-note')!.classList.contains('hs-note-tall')).toBe(true);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = tall;
    }
    click(box('REQ-0006').querySelector('.hs-note-mark')!);
    click(box('REQ-0006').querySelector('.hs-note-mark')!);
    expect(list()!.querySelector('.hs-note')!.classList.contains('hs-note-tall')).toBe(false);
  });

  it('offers nothing that changes a note in a document that cannot be changed', () => {
    show(h.page, { ...viewOf(), readOnly: true });
    expect(box('REQ-0001').querySelector('.hs-note-add')).toBeNull();
    click(box('REQ-0006').querySelector('.hs-note-mark')!);
    expect(list()!.querySelectorAll('.hs-note-action, .hs-note-new')).toHaveLength(0);
    expect(button('Add')).toBeUndefined();
  });
});
