import type { TableCell, TableProperty } from '../../core/tool/tableView';
import { html } from '../diagram/dom';
import { tag } from './editors';

// The list of a column's options over a cell (etalii.adp spec 079, FR-024): one of them or none for
// a choice, any number for choices. With gestures, a search field over the list has the focus, and
// a name that is no option makes one and chooses it. A relation's cell lists the rows of its file by
// title the same way (spec 080, FR-003): one or none where it holds one row, any number otherwise.

export interface CellListHost {
  /** What the cell holds now: the list follows it while it is open. */
  readonly held: () => TableCell | undefined;
  readonly searchable: boolean;
  /** Whether a name that is no option makes one. */
  readonly creates: boolean;
  /** An option chosen: for a choice its value, `''` for none; for choices whether it is now present. */
  readonly choose: (value: string, present?: boolean) => void;
  /** A name that is no option made, of the kind chosen where `kinds` offers several. */
  readonly create: (name: string, kind?: string) => void;
  /**
   * The kinds a name can be made as, each offered as a "Create" row of its own while a name that is no option is typed: a
   * diagram's kinds of element, for a relation to one (etalii.adp spec 092, FR-025). Absent for one kind, made on Enter.
   */
  readonly kinds?: readonly { readonly id: string; readonly label: string }[];
  /** The list closed: the focus goes back to the cell where `refocus`. */
  readonly closed: (refocus: boolean) => void;
}

const clamp = (value: number, last: number): number => Math.max(0, Math.min(value, last));

/** Opens the list under the cell; `sync` marks what the cell holds again, `close` closes it without moving the focus. */
export function openCellList(root: HTMLElement, cell: HTMLElement, property: TableProperty, host: CellListHost): { sync(): void; close(): void } {
  const rows = property.editor === 'rows';
  const many = property.editor === 'choices' || (rows && property.single !== true);
  const state = many ? 'aria-checked' : 'aria-selected';
  const option = (value: string, content: Node | string): HTMLLIElement => html('li', { role: 'option', tabindex: -1, 'data-value': value }, content);
  const choices = rows ? property.related ?? [] : property.options;
  const items = [...(many ? [] : [option('', 'None')]), ...choices.map((candidate) => option(candidate.id, tag(candidate.name || candidate.id, candidate.colour)))];
  const element = html('ul', { class: 'adp-table-list', role: 'listbox', 'aria-label': property.name, 'aria-multiselectable': many ? 'true' : undefined }, ...items);
  const search = host.searchable ? html('input', { class: 'adp-table-list-search', type: 'text', 'aria-label': `Search or create an option of ${property.name}`, placeholder: host.creates ? 'Search, or create an option' : 'Search' }) : undefined;
  const frame = search ? html('div', { class: 'adp-table-picker' }, search, element) : element;
  // The "Create" rows of a name typed that is no option, one per kind, below the options.
  let creating: HTMLLIElement[] = [];
  const shown = (): HTMLLIElement[] => [...items, ...creating].filter((item) => !item.hidden);
  const has = (value: string): boolean => {
    const held = host.held();
    if (many) return held?.items.some((item) => item.value === value) === true;
    return (rows ? held?.items[0]?.value ?? '' : held?.value ?? '') === value;
  };
  const sync = (): void => items.forEach((item) => item.setAttribute(state, String(has(item.dataset.value ?? ''))));
  const outside = (event: Event): void => {
    if (!frame.contains(event.target as Node)) close(false);
  };
  const close = (refocus: boolean): void => {
    frame.remove();
    window.removeEventListener('pointerdown', outside, true);
    host.closed(refocus);
  };
  const choose = (item: HTMLElement): void => {
    if (item.dataset.kind !== undefined) {
      const typed = search?.value.trim() ?? '';
      close(true);
      host.create(typed, item.dataset.kind);
      return;
    }
    const value = item.dataset.value ?? '';
    if (many) {
      const present = item.getAttribute(state) !== 'true';
      item.setAttribute(state, String(present));
      host.choose(value, present);
      return;
    }
    const unchanged = has(value);
    close(true);
    if (!unchanged) host.choose(value);
  };
  element.addEventListener('click', (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    if (item) choose(item);
  });
  element.addEventListener('keydown', (event) => {
    event.stopPropagation();
    const rows = shown();
    const index = rows.indexOf(document.activeElement as HTMLLIElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') rows[clamp(index + (event.key === 'ArrowDown' ? 1 : -1), rows.length - 1)]?.focus();
    else if ((event.key === 'Enter' || event.key === ' ') && rows[index]) choose(rows[index]);
    else if (event.key === 'Escape' || event.key === 'Tab') close(true);
    else return;
    event.preventDefault();
  });
  search?.addEventListener('input', () => {
    const needle = search.value.trim().toLowerCase();
    for (const item of items) item.hidden = needle !== '' && !(item.textContent ?? '').toLowerCase().includes(needle);
    for (const row of creating) row.remove();
    const typed = search.value.trim();
    const named = items.some((item) => item.dataset.value !== '' && (item.textContent ?? '').toLowerCase() === typed.toLowerCase());
    creating = typed === '' || named || !host.creates || (host.kinds?.length ?? 0) < 2 ? [] : host.kinds!.map((kind) => html('li', { role: 'option', tabindex: -1, class: 'adp-table-list-create', 'data-kind': kind.id }, `Create ${kind.label.toLowerCase()} “${typed}”`));
    element.append(...creating);
  });
  search?.addEventListener('keydown', (event) => {
    event.stopPropagation();
    const typed = search.value.trim();
    if (event.key === 'ArrowDown') shown()[0]?.focus();
    else if (event.key === 'Escape' || event.key === 'Tab') close(true);
    else if (event.key === 'Enter') {
      const same = items.find((item) => item.dataset.value !== '' && (item.textContent ?? '').toLowerCase() === typed.toLowerCase());
      if (same ?? (typed !== '' ? undefined : shown()[0])) choose((same ?? shown()[0])!);
      else if (creating[0]) creating[0].focus();
      else if (typed !== '' && host.creates) {
        close(true);
        host.create(typed);
      } else if (shown()[0]) choose(shown()[0]);
    } else return;
    event.preventDefault();
  });
  const box = cell.getBoundingClientRect();
  const bounds = root.getBoundingClientRect();
  frame.style.left = `${box.left - bounds.left}px`;
  frame.style.top = `${box.bottom - bounds.top}px`;
  root.append(frame);
  sync();
  if (search) search.focus();
  else (items.find((item) => item.getAttribute(state) === 'true') ?? items[0])?.focus();
  window.addEventListener('pointerdown', outside, true);
  return { sync, close: () => close(false) };
}
