import { html } from '../diagram/dom';
import { icon } from '../diagram/icons';

// The searchable list the standalone host's Knowledge designer shares (its `SearchList.tsx`), on the
// DOM: a field that narrows the items by what is typed, a pick by Enter or a click, and, where its
// owner allows, an item created from text that names none. It holds no choice of its own: what is
// chosen is given, and a pick goes out.

export interface SearchItem {
  readonly id: string;
  readonly label: string;
}

export interface SearchListOptions {
  /** What the list is for, read out with its field. */
  readonly label: string;
  readonly placeholder?: string;
  /** An item was picked, or picked again when it was already chosen. */
  readonly pick: (id: string) => void;
  /** Text that names no item, asked to exist; absent, the list only picks. */
  readonly create?: (text: string) => void;
  /** Escape was pressed in the list. */
  readonly close?: () => void;
}

type Row = { readonly kind: 'item'; readonly item: SearchItem } | { readonly kind: 'create'; readonly text: string };

let lists = 0;

/** The items whose label holds the typed text, case ignored; all of them for no text. */
export function matching(items: readonly SearchItem[], text: string): SearchItem[] {
  const wanted = text.trim().toLowerCase();
  return wanted === '' ? [...items] : items.filter((item) => item.label.toLowerCase().includes(wanted));
}

export class SearchList {
  readonly field: HTMLInputElement;
  readonly element: HTMLElement;
  private readonly rows: HTMLUListElement;
  private readonly id = `hs-search-${(lists += 1)}`;
  private items: readonly SearchItem[] = [];
  private selected: ReadonlySet<string> = new Set();
  private active = 0;

  constructor(private readonly options: SearchListOptions) {
    this.field = html('input', {
      class: 'hs-search-field', type: 'text', role: 'combobox', 'aria-label': options.label, 'aria-expanded': 'true', 'aria-controls': this.id,
      placeholder: options.placeholder ?? '', autocomplete: 'off', spellcheck: 'false',
    });
    this.rows = html('ul', { class: 'hs-search-rows', id: this.id, role: 'listbox', 'aria-label': options.label });
    this.element = html('div', { class: 'hs-search' }, this.field, this.rows);
    this.field.addEventListener('input', () => {
      this.active = 0;
      this.draw();
    });
    this.field.addEventListener('keydown', (event) => this.key(event));
  }

  /** The items and which of them are chosen now; what is typed is kept. */
  show(items: readonly SearchItem[], selected: readonly string[] = []): void {
    this.items = items;
    this.selected = new Set(selected);
    this.draw();
  }

  private rowsNow(): Row[] {
    const found: Row[] = matching(this.items, this.field.value).map((item) => ({ kind: 'item', item }));
    const typed = this.field.value.trim();
    // Offered only for text that names no item exactly: a second item of the same name is never what was meant.
    if (this.options.create !== undefined && typed !== '' && !this.items.some((item) => item.label.toLowerCase() === typed.toLowerCase())) found.push({ kind: 'create', text: typed });
    return found;
  }

  private draw(): void {
    const rows = this.rowsNow();
    const current = Math.min(this.active, Math.max(0, rows.length - 1));
    this.rows.replaceChildren(...rows.map((row, index) => {
      const id = `${this.id}-${index}`;
      const active = index === current ? ' hs-search-row-active' : '';
      const line = row.kind === 'create'
        ? html('li', { id, class: `hs-search-row hs-search-create${active}`, role: 'option', 'aria-selected': 'false' }, icon('mdi-plus'), html('span', {}, `Create “${row.text}”`))
        : html('li', { id, class: `hs-search-row${active}`, role: 'option', 'aria-selected': String(this.selected.has(row.item.id)), 'data-id': row.item.id },
          this.selected.has(row.item.id) ? icon('mdi-check') : html('span', { class: 'hs-search-blank', 'aria-hidden': 'true' }), html('span', {}, row.item.label));
      // The field keeps the focus: a press that took it would end whatever the list is part of.
      line.addEventListener('mousedown', (event) => event.preventDefault());
      line.addEventListener('pointerdown', (event) => event.preventDefault());
      line.addEventListener('click', () => this.choose(row));
      return line;
    }), ...(rows.length === 0 ? [html('li', { class: 'hs-search-empty', role: 'presentation' }, 'Nothing matches.')] : []));
    if (rows.length > 0) this.field.setAttribute('aria-activedescendant', `${this.id}-${current}`);
    else this.field.removeAttribute('aria-activedescendant');
  }

  private choose(row: Row | undefined): void {
    if (row === undefined) return;
    if (row.kind === 'item') {
      this.options.pick(row.item.id);
      return;
    }
    this.field.value = '';
    this.options.create?.(row.text);
    this.draw();
  }

  private key(event: KeyboardEvent): void {
    const rows = this.rowsNow();
    const current = Math.min(this.active, Math.max(0, rows.length - 1));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.active = event.key === 'ArrowDown' ? Math.min(current + 1, rows.length - 1) : Math.max(current - 1, 0);
      this.draw();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.choose(rows[current]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.options.close?.();
    }
  }
}

/** The gap between a popup and what it opens from, and between a popup and the window's edges, in pixels. */
const GAP = 4;

/**
 * Places a popup that stands over every pane, fixed in the window: under `anchor`, its left edge on
 * the anchor's or, with `alignRight`, its right edge on the anchor's, kept inside the window, and
 * above the anchor where the window has no room below.
 */
export function placePopup(popup: HTMLElement, anchor: Element, alignRight = false): void {
  const at = anchor.getBoundingClientRect();
  const { width, height } = popup.getBoundingClientRect();
  const wanted = alignRight ? at.right - width : at.left;
  const left = Math.max(GAP, Math.min(wanted, window.innerWidth - width - GAP));
  const below = at.bottom + GAP;
  const top = below + height > window.innerHeight - GAP && at.top - GAP - height >= GAP ? at.top - GAP - height : below;
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}
