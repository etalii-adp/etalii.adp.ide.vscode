import { beforeEach, describe, expect, it } from 'vitest';
import type { HierarchyRequest } from '../../../src/core/tool/hierarchyView';
import { sortIn, withSort, wordAt } from '../../../src/webview/hierarchy/filterBar';
import { box, button, click, harness, key, options, requests, show, typeInto, viewOf, type Harness } from './pageSupport';

// The bar that narrows and sorts the page, as the standalone host draws it (its `FilterBar.tsx`,
// `SortMenu.tsx` and `filterQuery.ts`): the filter is applied as it is typed and writes nothing,
// going to the extension as a view option and coming back as the view it leaves; the word the
// caret is in, anywhere in the field, is completed from the words the view gives; and the stored
// filters are stored, renamed and removed by the gestures the view names for them.

let h: Harness;
const field = (): HTMLInputElement => document.querySelector<HTMLInputElement>('.hs-filter-query')!;
const offered = (): string[] => [...document.querySelectorAll('.hs-filter-completion')].map((option) => option.querySelector('.hs-filter-completion-word')!.textContent ?? '');
const marked = (): string => document.querySelector('.hs-filter-completion-active .hs-filter-completion-word')?.textContent ?? '';

/** Types a filter as a person does, and shows the view the extension makes with it. */
function type(text: string, version = 2): void {
  field().focus();
  typeInto(field(), text);
  show(h.page, viewOf({ query: text }), version);
}

beforeEach(() => {
  h = harness();
});

describe('the filter', () => {
  it('is applied as it is typed, as a view option that writes nothing, and the page shows what it leaves and how much', () => {
    show(h.page, viewOf());
    type('#security');
    expect(options(h.sent).at(-1)).toEqual({ query: '#security' });
    expect(requests(h.sent)).toEqual([]);
    expect(box('REQ-0001')).toBeNull();
    expect(box('REQ-0006')).not.toBeNull();
    expect(document.querySelector('.hs-filter-count')!.textContent).toBe('3 of 17');
    // A focus keeps the filter, and the filter keeps the focus.
    click(box('ITEM-0004').querySelector('.hs-focus')!);
    expect(options(h.sent).at(-1)).toEqual({ query: '#security', focus: 'ITEM-0004' });
    click(button('Clear the filter')!);
    expect(field().value).toBe('');
    expect(options(h.sent).at(-1)).toEqual({ focus: 'ITEM-0004' });
  });

  it('is completed from the words the view gives: the labels\' members, then their prefixes, the word of a title and of an order', () => {
    show(h.page, viewOf());
    type('#se');
    expect(offered()).toEqual(['#search', '#security']);
    expect(document.querySelector('.hs-filter-completion .hs-filter-completion-hint')!.textContent).toBe('Tag');
    expect(marked()).toBe('#search');
    key(field(), { key: 'ArrowDown' });
    expect(marked()).toBe('#security');
    key(field(), { key: 'Tab' });
    // A whole word takes a space after it, and the next word is offered the prefixes, from the view.
    expect(field().value).toBe('#security ');
    expect(options(h.sent).at(-1)).toEqual({ query: '#security ' });
    show(h.page, viewOf({ query: '#security ' }), 3);
    expect(offered()).toEqual(['#', 'category:', '@', 'item:', 'sort:']);
    key(field(), { key: 'ArrowUp' });
    key(field(), { key: 'ArrowUp' });
    expect(marked()).toBe('item:');
    key(field(), { key: 'ArrowDown' });
    key(field(), { key: 'ArrowUp' });
    key(field(), { key: 'ArrowUp' });
    expect(marked()).toBe('@');
    key(field(), { key: 'Enter' });
    // A prefix stays open for its name: `@` names a state because the view says so.
    expect(field().value).toBe('#security @');
    show(h.page, viewOf({ query: '#security @' }), 4);
    expect(offered()).toEqual(['@proposed', '@accepted', '@rejected', '@done']);
    expect(document.querySelector('.hs-filter-completion .hs-filter-completion-hint')!.textContent).toBe('State');
    // Escape closes the list and nothing else; the arrow down brings it back.
    expect(key(field(), { key: 'Escape' })).toBe(false);
    expect(offered()).toEqual([]);
    key(field(), { key: 'ArrowDown' });
    expect(offered()).toHaveLength(4);
    expect(requests(h.sent)).toEqual([]);
  });

  it('offers nothing while the view of the word typed has not come', () => {
    show(h.page, viewOf());
    field().focus();
    typeInto(field(), '#se');
    expect(offered()).toEqual([]);
    show(h.page, viewOf({ query: '#se' }), 2);
    expect(offered()).toHaveLength(2);
  });

  it('completes the word the caret stands in anywhere in the field, from what the view gives, and asks nothing when the caret moves', () => {
    show(h.page, viewOf());
    type('@pr #security');
    const asked = h.sent.length;
    // The caret after `@pr`, in the first word: what of it stands before the caret is completed.
    field().setSelectionRange(3, 3);
    field().dispatchEvent(new KeyboardEvent('keyup'));
    expect(offered()).toEqual(['@proposed']);
    field().setSelectionRange(1, 1);
    field().dispatchEvent(new KeyboardEvent('keyup'));
    expect(offered()).toEqual(['@proposed', '@accepted', '@rejected', '@done']);
    expect(h.sent.length).toBe(asked);
    field().setSelectionRange(3, 3);
    field().dispatchEvent(new KeyboardEvent('keyup'));
    key(field(), { key: 'Enter' });
    // The word the caret is in is replaced whole, and the rest of the filter stays.
    expect(field().value).toBe('@proposed #security');
    expect(field().selectionStart).toBe('@proposed '.length);
    expect(options(h.sent).at(-1)).toEqual({ query: '@proposed #security' });
    // At the start of a word, with nothing of it before the caret, the prefixes are offered.
    show(h.page, viewOf({ query: '@proposed #security' }), 3);
    field().setSelectionRange(10, 10);
    field().dispatchEvent(new KeyboardEvent('keyup'));
    expect(offered()).toEqual(['#', 'category:', '@', 'item:', 'sort:']);
  });

  it('sorts by the order picked, in the filter\'s own word, which the view names', () => {
    show(h.page, viewOf());
    type('#security');
    const sort = document.querySelector<HTMLSelectElement>('.hs-sort select')!;
    expect([...sort.options].map((choice) => choice.textContent)).toEqual(['File order', 'Number', 'Title', 'Tag', 'Category', 'State']);
    sort.value = 'state';
    sort.dispatchEvent(new Event('change'));
    expect(field().value).toBe('#security sort:state');
    expect(options(h.sent).at(-1)).toEqual({ query: '#security sort:state' });
    expect([withSort('a sort:x b sort:y', 'sort:', 'title'), withSort('a sort:x', 'sort:', ''), sortIn('#a sort:state', 'sort:')]).toEqual(['a sort:title b', 'a', 'state']);
    expect(wordAt('#a @pr x', 6)).toEqual({ start: 3, end: 6, typed: '@pr' });
  });
});

describe('the stored filters', () => {
  it('apply a stored filter by picking it, and rename and remove it by the gestures the view names', () => {
    show(h.page, viewOf());
    const stored = document.querySelector<HTMLSelectElement>('.hs-stored-filters')!;
    expect([...stored.options].map((choice) => choice.textContent)).toEqual(['Stored filters', 'Open security', 'Backend']);
    stored.value = 'filter/Backend';
    stored.dispatchEvent(new Event('change'));
    expect(field().value).toBe('item:back* sort:number');
    expect(options(h.sent).at(-1)).toEqual({ query: 'item:back* sort:number' });
    show(h.page, viewOf({ query: 'item:back* sort:number' }), 2);
    expect(button('Store this filter under a name')).toBeUndefined();
    click(button('Rename Backend')!);
    const name = document.querySelector<HTMLInputElement>('.hs-filter-name')!;
    expect(name.value).toBe('Backend');
    expect(document.activeElement).toBe(name);
    name.value = 'Server';
    key(name, { key: 'Enter' });
    click(button('Remove Backend')!);
    expect(requests(h.sent)).toEqual<HierarchyRequest[]>([
      { kind: 'operation', operation: 'renameFilter', on: ['filter/Backend'], args: { name: 'Server' } },
      { kind: 'operation', operation: 'removeFilter', on: ['filter/Backend'] },
    ]);
  });

  it('stores the filter applied under a name, by the page\'s gesture for it', () => {
    show(h.page, viewOf());
    type('#security @proposed');
    const store = button('Store filter')!;
    expect(store.getAttribute('title')).toBe('Store this filter under a name');
    click(store);
    const name = document.querySelector<HTMLInputElement>('.hs-filter-name')!;
    expect(name.getAttribute('aria-label')).toBe('Name of the filter');
    name.value = 'Open';
    key(name, { key: 'Enter' });
    expect(requests(h.sent)).toEqual([{ kind: 'operation', operation: 'storeFilter', args: { name: 'Open', query: '#security @proposed' } }]);
    expect(document.querySelector('.hs-filter-name')).toBeNull();
  });

  it('offers no store, rename or remove in a document that cannot be changed, and still filters', () => {
    show(h.page, { ...viewOf(), readOnly: true });
    type('#security');
    show(h.page, { ...viewOf({ query: '#security' }), readOnly: true }, 3);
    expect(button('Store filter')).toBeUndefined();
    expect(options(h.sent).at(-1)).toEqual({ query: '#security' });
  });
});
