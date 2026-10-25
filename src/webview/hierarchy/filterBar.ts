import type { HierarchyGestureState, HierarchyView } from '../../core/tool/hierarchyView';
import type { TableValue } from '../../core/tool/tableView';
import { html } from '../diagram/dom';
import { icon } from '../diagram/icons';

// The bar above the page that narrows and sorts it, as the standalone host draws it (its
// `FilterBar.tsx`, `SortMenu.tsx` and the words of `filterQuery.ts`): a filter typed in the notation
// of DESL 7.7.3, applied as it is typed, the order of the entries, and the filters the document
// stores, each applied by picking it. Applying a filter or an order writes nothing: the filter goes
// to the extension as a view option, and the view that follows is what it leaves, with how much of
// the page it leaves and the words that complete the one the caret is in. Storing the filter applied,
// renaming the stored filter it is and removing it are the gestures the view names for them. The
// words of a filter are the view's: the labels' prefixes, the word of a level's title and the word
// of an order; nothing here names one.

type Run = (gesture: HierarchyGestureState | undefined, on: string | undefined, args?: Readonly<Record<string, TableValue>>) => void;

/** The most completions offered at once. */
const MOST_OFFERED = 12;

/** The word the caret stands in or at the end of: where it starts and ends, and what of it is typed. */
export function wordAt(text: string, caret: number): { readonly start: number; readonly end: number; readonly typed: string } {
  const start = text.slice(0, caret).search(/\S*$/);
  const rest = text.slice(caret).search(/\s|$/);
  return { start, end: caret + rest, typed: text.slice(start, caret) };
}

/** The filter with its order set to `key`, in the place of the first word of an order, or last; empty takes every such word out. */
export function withSort(text: string, sortWord: string, key: string): string {
  const words = text.split(/\s+/).filter((word) => word !== '');
  const isSort = (word: string): boolean => word.toLowerCase().startsWith(sortWord.toLowerCase()) && word.length > sortWord.length;
  if (key === '') return words.filter((word) => !isSort(word)).join(' ');
  const at = words.findIndex(isSort);
  const sort = `${sortWord}${key}`;
  return (at < 0 ? [...words, sort] : words.flatMap((word, place) => (!isSort(word) ? [word] : place === at ? [sort] : []))).join(' ');
}

/** The order a filter holds: of several words of an order the first; empty for the document's. */
export function sortIn(text: string, sortWord: string): string {
  const word = text.split(/\s+/).find((candidate) => candidate.toLowerCase().startsWith(sortWord.toLowerCase()) && candidate.length > sortWord.length);
  return word === undefined ? '' : word.slice(sortWord.length);
}

export class FilterBar {
  readonly element = html('div', { class: 'hs-filter-bar', role: 'search', 'aria-label': 'Narrow and sort' });
  private readonly field = html('input', {
    type: 'text', class: 'hs-filter-query', role: 'combobox', 'aria-label': 'Filter', 'aria-autocomplete': 'list', 'aria-controls': 'hs-filter-completions', 'aria-expanded': 'false',
    spellcheck: 'false', autocomplete: 'off',
  });
  private readonly completions = html('ul', { id: 'hs-filter-completions', class: 'hs-filter-completions', role: 'listbox', 'aria-label': 'Completions', hidden: '' });
  private readonly sort = html('select', { 'aria-label': 'Sort' });
  private readonly stored = html('select', { class: 'hs-stored-filters', 'aria-label': 'Stored filters' });
  private readonly actions = html('span', { class: 'hs-filter-actions' });
  private readonly count = html('span', { class: 'hs-filter-count', role: 'status' });
  private view: HierarchyView | undefined;
  /** The filter typed: the page's own, applied as it is typed. */
  private text = '';
  private active = 0;
  private dismissed = false;
  private naming: { readonly kind: 'store' } | { readonly kind: 'rename'; readonly id: string; readonly name: string } | undefined;
  private readonly name = html('input', { type: 'text', class: 'hs-filter-name', placeholder: 'Name' });
  /** Whether the actions are being drawn again: the name field losing the focus meanwhile is not left. */
  private redrawing = false;

  constructor(private readonly apply: (query: string) => void, private readonly run: Run) {
    this.element.append(
      icon('mdi-filter-variant'),
      html('span', { class: 'hs-filter-field' }, this.field, this.completions),
      html('label', { class: 'hs-sort' }, icon('mdi-sort'), this.sort),
      this.stored, this.actions, this.count);
    this.field.addEventListener('input', () => {
      this.active = 0;
      this.dismissed = false;
      this.change(this.field.value);
    });
    this.field.addEventListener('keydown', (event) => this.key(event));
    for (const name of ['keyup', 'click', 'focus'] as const) this.field.addEventListener(name, () => this.drawCompletions());
    // The list closes once the field is left, after a press on it has been taken.
    this.field.addEventListener('blur', () => this.drawCompletions());
    this.sort.addEventListener('change', () => this.change(withSort(this.text, this.view?.queryWords.sort ?? '', this.sort.value)));
    this.stored.addEventListener('change', () => {
      const filter = this.view?.filters.find((candidate) => candidate.id === this.stored.value);
      if (filter !== undefined) this.change(filter.query);
    });
    this.name.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        this.commitName();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.naming = undefined;
        this.draw();
      }
    });
    this.name.addEventListener('blur', () => this.commitName());
  }

  /** The filter applied. */
  get query(): string {
    return this.text;
  }

  /** Applies a filter as if it were typed: the page to reveal what it hid sets one without the words that hid it. */
  set(query: string): void {
    this.active = 0;
    this.change(query);
  }

  /** Takes the filter a view was made with, when the page has none of its own yet. */
  adopt(query: string): void {
    this.text = query;
    this.field.value = query;
  }

  /** Shows the bar for a view: its stored filters, its order, how much it leaves, and the completions of the word typed. */
  show(view: HierarchyView): void {
    this.view = view;
    this.draw();
  }

  private change(text: string): void {
    this.text = text;
    if (this.field.value !== text) this.field.value = text;
    this.apply(text);
    this.draw();
  }

  private draw(): void {
    const view = this.view;
    if (view === undefined) return;
    this.field.placeholder = [...view.lists.map((list) => `${list.prefix}name`), `${view.queryWords.level}pattern`].join(' ');
    const keys = view.sortKeys;
    const current = sortIn(this.text, view.queryWords.sort);
    const known = current === '' || keys.includes(current);
    const keyLabel = (key: string): string => view.lists.find((list) => list.label === key)?.name ?? `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    this.sort.replaceChildren(html('option', { value: '' }, 'File order'), ...keys.map((key) => html('option', { value: key }, keyLabel(key))), ...(known ? [] : [html('option', { value: current }, current)]));
    this.sort.value = current;
    const applied = view.filters.find((filter) => filter.query === this.text.trim());
    this.stored.hidden = view.filters.length === 0;
    this.stored.replaceChildren(html('option', { value: '' }, 'Stored filters'), ...view.filters.map((filter) => html('option', { value: filter.id }, filter.name)));
    this.stored.value = applied?.id ?? '';
    this.drawActions(applied);
    this.count.textContent = view.applied === undefined ? '' : `${view.applied.shown} of ${view.applied.total}`;
    this.drawCompletions();
  }

  private drawActions(applied: HierarchyView['filters'][number] | undefined): void {
    const view = this.view!;
    const parts: Node[] = [];
    if (this.naming !== undefined) {
      this.name.setAttribute('aria-label', this.naming.kind === 'store' ? 'Name of the filter' : `New name of ${this.naming.name}`);
      parts.push(this.name);
    } else if (!view.readOnly) {
      const store = view.pageGestures.addFilter;
      if (this.text.trim() !== '' && applied === undefined && store?.enabled) {
        parts.push(this.button('mdi-bookmark-plus-outline', store.label ?? view.operations[store.operation]?.label ?? 'Store', 'Store this filter under a name', () => this.startNaming({ kind: 'store' }), true));
      }
      if (applied?.gestures.rename?.enabled) parts.push(this.button('mdi-pencil-outline', `Rename ${applied.name}`, 'Rename', () => this.startNaming({ kind: 'rename', id: applied.id, name: applied.name })));
      if (applied?.gestures.remove?.enabled) parts.push(this.button('mdi-bookmark-remove-outline', `Remove ${applied.name}`, 'Remove', () => this.run(applied.gestures.remove, applied.id)));
    }
    if (this.text !== '') parts.push(this.button('mdi-close', 'Clear the filter', 'Clear', () => this.change('')));
    const typing = document.activeElement === this.name;
    this.redrawing = true;
    try {
      this.actions.replaceChildren(...parts);
    } finally {
      this.redrawing = false;
    }
    if (typing && this.name.isConnected) this.name.focus();
  }

  private button(name: string, label: string, title: string, act: () => void, text = false): HTMLButtonElement {
    const button = html('button', { type: 'button', class: 'hs-filter-button', 'aria-label': label, title }, icon(name), text ? label : undefined);
    button.addEventListener('click', act);
    return button;
  }

  private startNaming(naming: NonNullable<FilterBar['naming']>): void {
    this.naming = naming;
    this.name.value = naming.kind === 'rename' ? naming.name : '';
    this.draw();
    this.name.focus();
    this.name.select();
  }

  private commitName(): void {
    const naming = this.naming;
    if (naming === undefined || this.redrawing) return;
    this.naming = undefined;
    const typed = this.name.value.trim();
    const view = this.view;
    if (view !== undefined && typed !== '') {
      if (naming.kind === 'store') {
        const store = view.pageGestures.addFilter;
        const args: Record<string, TableValue> = {};
        if (store?.params.name !== undefined) args[store.params.name] = typed;
        if (store?.params.query !== undefined) args[store.params.query] = this.text.trim();
        this.run(store, undefined, args);
      } else if (typed !== naming.name) {
        const rename = view.filters.find((filter) => filter.id === naming.id)?.gestures.rename;
        const param = Object.values(rename?.params ?? {})[0];
        this.run(rename, naming.id, param === undefined ? {} : { [param]: typed });
      }
    }
    this.draw();
    this.field.focus();
  }

  // ---- completion ----

  /**
   * The words offered for the one the caret is in, anywhere in the field: those the view gives for
   * what of that word stands before the caret. The view gives them for every caret in the filter it
   * was made with, so a caret moved asks nothing; a word typed that the view has not seen yet is
   * offered nothing until the view of it comes.
   */
  private offered(): readonly string[] {
    const view = this.view;
    if (view === undefined || this.dismissed || document.activeElement !== this.field) return [];
    const { typed } = wordAt(this.text, this.field.selectionStart ?? this.text.length);
    return Object.hasOwn(view.completions, typed) ? view.completions[typed].slice(0, MOST_OFFERED) : [];
  }

  /** What a word offered is: the name of the list its prefix names, a level's title, or an order. */
  private hintOf(word: string): string {
    const view = this.view!;
    const lower = word.toLowerCase();
    if (lower.startsWith(view.queryWords.sort.toLowerCase())) return 'order';
    if (lower.startsWith(view.queryWords.level.toLowerCase())) return 'title';
    const list = [...view.lists].sort((left, right) => right.prefix.length - left.prefix.length).find((candidate) => lower.startsWith(candidate.prefix.toLowerCase()));
    return list?.name ?? '';
  }

  /** Whether a word offered is a prefix that waits for its name, rather than a whole word. */
  private isPrefix(word: string): boolean {
    const view = this.view!;
    return [...view.lists.map((list) => list.prefix), view.queryWords.level, view.queryWords.sort].some((prefix) => prefix.toLowerCase() === word.toLowerCase());
  }

  private drawCompletions(): void {
    const offered = this.offered();
    const marked = Math.min(this.active, offered.length - 1);
    this.completions.hidden = offered.length === 0;
    this.field.setAttribute('aria-expanded', String(offered.length > 0));
    if (offered.length > 0) this.field.setAttribute('aria-activedescendant', `hs-filter-completion-${marked}`);
    else this.field.removeAttribute('aria-activedescendant');
    this.completions.replaceChildren(...offered.map((word, at) => {
      const option = html('li', { id: `hs-filter-completion-${at}`, role: 'option', 'aria-selected': String(at === marked), class: `hs-filter-completion${at === marked ? ' hs-filter-completion-active' : ''}` },
        html('span', { class: 'hs-filter-completion-word' }, word), html('span', { class: 'hs-filter-completion-hint' }, this.hintOf(word)));
      // Pressed before the field loses the focus, so the field keeps it and the word is taken.
      option.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.complete(word);
      });
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('pointerenter', () => {
        this.active = at;
        this.drawCompletions();
      });
      return option;
    }));
  }

  /** The word being typed becomes `word`: a prefix stays open for its name, a whole word gets a space after it. */
  private complete(word: string): void {
    const caret = this.field.selectionStart ?? this.text.length;
    const at = wordAt(this.text, caret);
    const whole = !this.isPrefix(word);
    const inserted = whole ? `${word} ` : word;
    const rest = this.text.slice(at.end).replace(/^\s+/, '');
    const tail = rest === '' || whole ? rest : ` ${rest}`;
    const next = `${this.text.slice(0, at.start)}${inserted}${tail}`;
    const place = at.start + inserted.length;
    this.active = 0;
    this.change(next);
    this.field.setSelectionRange(place, place);
    this.drawCompletions();
  }

  private key(event: KeyboardEvent): void {
    const offered = this.offered();
    if (offered.length === 0) {
      if (event.key === 'ArrowDown' && this.dismissed) {
        event.preventDefault();
        this.dismissed = false;
        this.drawCompletions();
      }
      return;
    }
    const marked = Math.min(this.active, offered.length - 1);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.active = (marked + (event.key === 'ArrowDown' ? 1 : -1) + offered.length) % offered.length;
      this.drawCompletions();
    } else if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
      event.preventDefault();
      this.complete(offered[marked]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.dismissed = true;
      this.drawCompletions();
    }
  }
}
