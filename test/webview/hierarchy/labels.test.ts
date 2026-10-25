import { beforeEach, describe, expect, it } from 'vitest';
import type { HierarchyRequest } from '../../../src/core/tool/hierarchyView';
import { lookOf, pluralOf } from '../../../src/webview/hierarchy/labels';
import { box, button, click, harness, key, requests, show, typeInto, viewOf, type Harness } from './pageSupport';

// A box's labels and the lists they name, as the standalone host changes them (its `TagField.tsx`,
// `ClassificationPicker.tsx` and `listEditing.ts`): each label in a look of its own, chosen from what
// the view says of it since DESL's surface names no look; a label's searchable list that picks,
// takes off and creates; and the editor of the list, each change the operation the view names for it.

let h: Harness;
const popup = (): HTMLElement | null => document.querySelector('.hs-label-list');
const editor = (): HTMLElement | null => document.querySelector('.hs-list-editor');
const values = (id: string, label: string): HTMLElement => box(id).querySelector<HTMLElement>(`.hs-label-values[data-label="${label}"]`)!;
const option = (name: string): HTMLElement => [...popup()!.querySelectorAll<HTMLElement>('[role="option"]')].find((candidate) => candidate.textContent === name)!;

beforeEach(() => {
  h = harness();
});

describe('the looks of the labels', () => {
  it('draws a label of several values as a tag with its sign, and one of one value as a badge, or as a status where a sign names it', () => {
    show(h.page, viewOf());
    const looks = [...box('REQ-0001').querySelectorAll<HTMLElement>('.hs-label')].map((label) => [label.dataset.label, label.className.replace('hs-label ', ''), label.dataset.sign ?? '', label.textContent]);
    expect(looks).toEqual([['tags', 'hs-look-tag', '#', 'search'], ['category', 'hs-look-badge', '', 'functional'], ['state', 'hs-look-status', '', 'accepted']]);
    // The rule names no list: it reads only what the view says of one.
    expect([lookOf({ many: true, prefix: 'topic:' }), lookOf({ many: false, prefix: 'phase:' }), lookOf({ many: false, prefix: '!' })]).toEqual(['tag', 'badge', 'status']);
    expect([pluralOf('Tag'), pluralOf('Category'), pluralOf('Status')]).toEqual(['Tags', 'Categories', 'Statuses']);
  });
});

describe('a label of several values', () => {
  it('opens its list from its values, picks a member, takes one off by a pick again or its cross, and creates one from text', () => {
    show(h.page, viewOf());
    const opener = values('REQ-0004', 'tags');
    expect(opener.getAttribute('aria-label')).toBe('Tags of REQ-0004: mail');
    click(opener);
    expect(popup()!.getAttribute('aria-label')).toBe('Tag of REQ-0004');
    expect(h.sent.some((message) => message.type === 'selection')).toBe(true);
    const field = popup()!.querySelector<HTMLInputElement>('input')!;
    expect(document.activeElement).toBe(field);
    expect(option('mail').getAttribute('aria-selected')).toBe('true');
    click(option('security'));
    click(option('mail'));
    click(popup()!.querySelector<HTMLElement>('.hs-tag-remove')!);
    typeInto(field, 'Brand New');
    expect([...popup()!.querySelectorAll('[role="option"]')].map((row) => row.textContent)).toEqual(['Create “Brand New”']);
    key(field, { key: 'Enter' });
    expect(requests(h.sent)).toEqual<HierarchyRequest[]>([
      { kind: 'operation', operation: 'addTag', on: ['REQ-0004'], args: { name: 'security' } },
      { kind: 'operation', operation: 'removeTag', on: ['REQ-0004'], args: { name: 'mail' } },
      { kind: 'operation', operation: 'removeTag', on: ['REQ-0004'], args: { name: 'mail' } },
      { kind: 'operation', operation: 'addTag', on: ['REQ-0004'], args: { name: 'Brand New' } },
    ]);
  });

  it('opens its list from the control in the box\'s header where the box carries none yet', () => {
    show(h.page, viewOf());
    const add = box('REQ-0003').querySelector<HTMLButtonElement>('.hs-tag-add')!;
    expect(add.getAttribute('aria-label')).toBe('Add tag to REQ-0003');
    click(add);
    expect(popup()!.querySelector('.hs-tag-chosen')!.hasAttribute('hidden')).toBe(true);
    key(popup()!.querySelector('input')!, { key: 'Escape' });
    expect(popup()).toBeNull();
  });
});

describe('a label of one value', () => {
  it('opens its list from its value, sets the member picked and clears it, and offers a value on the selected box that has none', () => {
    show(h.page, viewOf());
    click(values('REQ-0001', 'state'));
    expect(option('accepted').getAttribute('aria-selected')).toBe('true');
    click(option('done'));
    expect(popup()).toBeNull();
    click(values('REQ-0001', 'category'));
    click(popup()!.querySelector<HTMLElement>('.hs-pick-clear')!);
    expect(requests(h.sent)).toEqual<HierarchyRequest[]>([
      { kind: 'operation', operation: 'setState', on: ['REQ-0001'], args: { state: 'state/done' } },
      { kind: 'operation', operation: 'clearCategory', on: ['REQ-0001'] },
    ]);
  });

  it('offers the way to give a value only on the selected box that has none', () => {
    show(h.page, viewOf());
    // REQ-0010 has a category and no state.
    expect(box('REQ-0010').querySelector('.hs-pick-empty')).toBeNull();
    click(box('REQ-0010'));
    const empty = box('REQ-0010').querySelector<HTMLElement>('.hs-pick-empty')!;
    expect(empty.getAttribute('aria-label')).toBe('State of REQ-0010: none');
    expect(empty.textContent).toBe('State');
    click(empty);
    expect(popup()!.querySelector('.hs-pick-clear')!.hasAttribute('hidden')).toBe(true);
    click(option('proposed'));
    expect(requests(h.sent)).toEqual([{ kind: 'operation', operation: 'setState', on: ['REQ-0010'], args: { state: 'state/proposed' } }]);
  });
});

describe('the editor of a label\'s list', () => {
  it('renames, recolours, moves and deletes a member, and adds one where the view names how, each by its operation', () => {
    show(h.page, viewOf());
    click(values('REQ-0001', 'state'));
    click(popup()!.querySelector<HTMLElement>('.hs-tag-edit-list')!);
    expect(popup()).toBeNull();
    expect(editor()!.getAttribute('aria-label')).toBe('States');
    const lines = [...editor()!.querySelectorAll<HTMLElement>('.hs-list-line')];
    expect(lines.map((line) => line.dataset.member)).toEqual(['state/proposed', 'state/accepted', 'state/rejected', 'state/done']);
    const name = lines[1].querySelector<HTMLInputElement>('.hs-list-name')!;
    name.value = 'agreed';
    key(name, { key: 'Enter' });
    const colour = lines[1].querySelector<HTMLSelectElement>('.hs-list-colour')!;
    expect(colour.value).toBe('green');
    colour.value = 'purple';
    colour.dispatchEvent(new Event('change', { bubbles: true }));
    click(button('Move done up')!);
    click(button('Move accepted up')!);
    expect((button('Move proposed up') as HTMLButtonElement).disabled).toBe(true);
    click(button('Delete rejected')!);
    const adding = editor()!.querySelector<HTMLInputElement>('.hs-list-new')!;
    typeInto(adding, 'parked');
    key(adding, { key: 'Enter' });
    expect(requests(h.sent)).toEqual<HierarchyRequest[]>([
      { kind: 'operation', operation: 'renameState', on: ['state/accepted'], args: { name: 'agreed' } },
      { kind: 'operation', operation: 'recolourState', on: ['state/accepted'], args: { colour: 'purple' } },
      { kind: 'operation', operation: 'moveState', on: ['state/done'], args: { after: 'state/accepted' } },
      { kind: 'operation', operation: 'moveState', on: ['state/accepted'] },
      { kind: 'operation', operation: 'deleteState', on: ['state/rejected'] },
      { kind: 'operation', operation: 'addState', args: { name: 'parked' } },
    ]);
  });

  it('adds no member to a list the view names no way to add to: a tag is made by carrying it', () => {
    show(h.page, viewOf());
    click(values('REQ-0004', 'tags'));
    click(popup()!.querySelector<HTMLElement>('.hs-tag-edit-list')!);
    expect(editor()!.querySelector<HTMLElement>('.hs-list-add-row')!.hasAttribute('hidden')).toBe(true);
    expect(editor()!.querySelectorAll('.hs-list-line')).toHaveLength(9);
  });
});

describe('labels in a document that cannot be changed', () => {
  it('are drawn as they are, with nothing that opens a list', () => {
    show(h.page, { ...viewOf(), readOnly: true });
    expect(document.querySelectorAll('.hs-label-values, .hs-tag-add, .hs-pick-empty')).toHaveLength(0);
    expect(box('REQ-0001').querySelectorAll('.hs-label')).toHaveLength(3);
  });
});
