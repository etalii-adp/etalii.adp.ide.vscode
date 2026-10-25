import { beforeEach, describe, expect, it } from 'vitest';
import { box, click, dblclick, harness, key, options, requests, show, source, typeInto, viewOf, type Harness } from './pageSupport';

// A reference typed in a description and a reference standing in one, as the standalone host has
// them (its `ReferenceLookup.tsx`, `ReferenceBox.tsx` and `reveal.ts`): `#` opens a lookup of what a
// mention there may name, by number or title, and a pick writes the mention as the view says one is
// written; a reference shows what it names when selected, by the focus that keeps it in sight and
// the folds that hide it, and writes nothing else.

let h: Harness;
const lookup = (): HTMLElement | null => document.querySelector('.hs-reference-lookup');
const search = (): HTMLInputElement => lookup()!.querySelector<HTMLInputElement>('input')!;
const options_ = (): string[] => [...lookup()!.querySelectorAll('[role="option"]')].map((option) => option.textContent ?? '');

/** Opens the description of `id` for typing and types one `#` at its end. */
function hash(id: string): HTMLTextAreaElement {
  dblclick(box(id).querySelector('.hs-description')!);
  const field = document.querySelector<HTMLTextAreaElement>('.hs-field-multiline')!;
  typeInto(field, `${field.value} `);
  typeInto(field, `${field.value}#`);
  return field;
}

beforeEach(() => {
  h = harness();
});

describe('the lookup # opens in a description', () => {
  it('lists the levels and entries a mention there may name, by number and title, narrowed by either as typed', () => {
    show(h.page, viewOf());
    hash('REQ-0006');
    expect(document.activeElement).toBe(search());
    expect(search().getAttribute('aria-label')).toBe('Refer to');
    expect(options_().slice(0, 3)).toEqual(['ITEM-0001 Storefront', 'REQ-0001 A customer finds a product by its name or its description.', 'REQ-0002 Every page loads within two seconds on a mobile connection.']);
    typeInto(search(), 'mail');
    expect(options_()).toEqual([
      'REQ-0004 An order is confirmed by e-mail once its payment succeeds.', 'REQ-0007 Customers sign in with an e-mail address and a password.',
      'ITEM-0005 Mail', 'REQ-0008 Mail goes through one provider, and its outage does not stop an order.',
    ]);
    typeInto(search(), 'item-0005');
    expect(options_()).toEqual(['ITEM-0005 Mail']);
  });

  it('writes the pick as the view says a mention is written, in place of the #, and commits only when the field is kept', () => {
    show(h.page, viewOf());
    expect(viewOf().mentions.Requirement).toMatchObject({ before: '[', after: ']' });
    hash('REQ-0006');
    typeInto(search(), 'mail');
    key(search(), { key: 'ArrowDown' });
    key(search(), { key: 'ArrowDown' });
    key(search(), { key: 'Enter' });
    expect(lookup()).toBeNull();
    const field = document.querySelector<HTMLTextAreaElement>('.hs-field-multiline')!;
    expect(field.value).toBe('Activity is any request the customer makes. See [REQ-0007] for signing in. [ITEM-0005]');
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(field.value.length);
    expect(requests(h.sent)).toEqual([]);
    key(field, { key: 'Enter', ctrlKey: true });
    expect(requests(h.sent)).toEqual([{ kind: 'operation', operation: 'setDescription', on: ['REQ-0006'], args: { description: 'Activity is any request the customer makes. See [REQ-0007] for signing in. [ITEM-0005]' } }]);
  });

  it('goes back to the text on Escape, with the # kept and nothing committed; the focus going to it is no leaving', () => {
    show(h.page, viewOf());
    const field = hash('REQ-0006');
    field.dispatchEvent(new FocusEvent('blur', { relatedTarget: search() }));
    expect(requests(h.sent)).toEqual([]);
    key(search(), { key: 'Escape' });
    expect(lookup()).toBeNull();
    expect(field.value.endsWith(' #')).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(requests(h.sent)).toEqual([]);
  });

  it('commits the text when the focus leaves the lookup for the page, and opens nothing in a title', () => {
    show(h.page, viewOf());
    const field = hash('REQ-0006');
    search().dispatchEvent(new FocusEvent('blur', { relatedTarget: document.querySelector('.hs-page') }));
    expect(lookup()).toBeNull();
    expect(requests(h.sent)).toEqual([{ kind: 'operation', operation: 'setDescription', on: ['REQ-0006'], args: { description: `${field.value}` } }]);
    dblclick(box('REQ-0007').querySelector('.hs-title')!);
    const title = document.querySelector<HTMLTextAreaElement>('.hs-field-title')!;
    typeInto(title, `${title.value}#`);
    expect(lookup()).toBeNull();
  });
});

describe('a reference in a description', () => {
  it('is a button with what it names, which opens no field when it is double-clicked', () => {
    show(h.page, viewOf());
    const reference = box('REQ-0004').querySelector<HTMLElement>('.hs-reference[data-id="ITEM-0005"]')!;
    expect(reference.getAttribute('role')).toBe('button');
    expect(reference.tabIndex).toBe(0);
    expect(reference.getAttribute('aria-label')).toBe('ITEM-0005 Mail');
    dblclick(reference);
    expect(document.querySelector('.hs-field')).toBeNull();
  });

  it('shows its target when selected: the focus that keeps it in sight, the folds that hide it opened, selected, and nothing else written', () => {
    show(h.page, viewOf());
    // Narrowed to Backend, Storefront and all in it are out of sight; Guest checkout is collapsed.
    click(box('ITEM-0004').querySelector('.hs-focus')!);
    expect(box('ITEM-0001')).toBeNull();
    const withReference = { ...source, text: source.text.replace('See [REQ-0007] for signing in.', 'See [REQ-0005] for signing in.') };
    show(h.page, viewOf({ focus: 'ITEM-0004' }, withReference), 2);
    click(box('REQ-0006').querySelector('.hs-reference[data-id="REQ-0005"]')!);
    expect(options(h.sent).at(-1)).toEqual({});
    expect(requests(h.sent)).toEqual([{ kind: 'operation', operation: 'toggleCollapsed', on: ['ITEM-0003'] }]);
    expect(h.sent.at(-1)).toEqual({ v: 2, type: 'selection', ids: ['REQ-0005'] });
  });

  it('shows its target from the keyboard too, by Enter on it', () => {
    show(h.page, viewOf());
    const reference = box('REQ-0004').querySelector<HTMLElement>('.hs-reference[data-id="REQ-0003"]')!;
    key(reference, { key: 'Enter' });
    expect(h.sent.at(-1)).toEqual({ v: 2, type: 'selection', ids: ['REQ-0003'] });
    expect(requests(h.sent)).toEqual([]);
  });
});
