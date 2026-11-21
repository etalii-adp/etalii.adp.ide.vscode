import type { TableEntry, TableMenu } from '../../core/tool/tableView';
import { html } from '../diagram/dom';
import { icon } from '../diagram/icons';

/**
 * A menu of the table surface: a column's, a view tab's, a row's, or the types of a new property.
 * An entry that cannot run now is shown with the reason, not left out; an entry with entries of its
 * own opens them in its place.
 */
export class EntryMenu {
  private readonly element = html('ul', { class: 'adp-menu adp-table-menu', role: 'menu' });
  private back: (() => void) | undefined;
  private readonly dismiss = (event: Event): void => {
    if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
    if (event instanceof MouseEvent && this.element.contains(event.target as Node)) return;
    this.close();
  };

  constructor(private readonly host: HTMLElement, private readonly choose: (entry: TableEntry) => void) {
    this.element.hidden = true;
    host.append(this.element);
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(menu: TableMenu, clientX: number, clientY: number, label = ''): void {
    const groups = menu.filter((group) => group.length > 0);
    if (groups.length === 0) return;
    this.element.setAttribute('aria-label', label);
    this.element.replaceChildren(...groups.flatMap((group, index) => [
      ...(index === 0 ? [] : [html('li', { class: 'adp-menu-separator', role: 'separator' })]),
      ...group.map((entry) => this.item(entry, clientX, clientY)),
    ]));
    const bounds = this.host.getBoundingClientRect();
    this.element.hidden = false;
    this.element.style.left = `${Math.max(0, Math.min(clientX - bounds.left, bounds.width - this.element.offsetWidth))}px`;
    this.element.style.top = `${Math.max(0, clientY - bounds.top)}px`;
    (this.element.querySelector('button:not([aria-disabled])') as HTMLElement | null)?.focus();
    window.addEventListener('pointerdown', this.dismiss, true);
    window.addEventListener('keydown', this.dismiss, true);
    window.addEventListener('blur', this.dismiss);
  }

  close(): void {
    this.element.hidden = true;
    this.back?.();
    this.back = undefined;
    window.removeEventListener('pointerdown', this.dismiss, true);
    window.removeEventListener('keydown', this.dismiss, true);
    window.removeEventListener('blur', this.dismiss);
  }

  /** Where the focus goes when the menu closes. */
  returnTo(element: HTMLElement | undefined): void {
    this.back = element === undefined ? undefined : () => element.focus();
  }

  private item(entry: TableEntry, x: number, y: number): HTMLElement {
    // An entry that is a state says whether it is on, with a tick where a submenu's arrow would be.
    const state = entry.checked !== undefined;
    const item = html('button', { class: 'adp-menu-item', type: 'button', role: state ? 'menuitemcheckbox' : 'menuitem', 'data-entry': entry.id, title: entry.disabled ?? '', 'aria-haspopup': entry.entries ? 'menu' : undefined, 'aria-checked': state ? String(entry.checked) : undefined },
      icon(entry.icon === undefined ? undefined : `mdi-${entry.icon}`), html('span', { class: 'adp-menu-label' }, entry.label),
      html('span', { class: 'adp-menu-shortcut' }, entry.entries ? '›' : entry.checked === true ? '✓' : ''));
    if (entry.disabled !== undefined) item.setAttribute('aria-disabled', 'true');
    item.addEventListener('click', () => {
      if (entry.disabled !== undefined) return;
      if (entry.entries && !entry.named) {
        this.open([entry.entries], x, y, entry.label);
        return;
      }
      this.element.hidden = true;
      this.close();
      this.choose(entry);
    });
    return html('li', { role: 'none' }, item);
  }
}
