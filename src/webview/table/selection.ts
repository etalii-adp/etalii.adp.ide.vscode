import type { TableField, TableGestures, TableProperty, TableRequest } from '../../core/tool/tableView';
import { html } from '../diagram/dom';
import { icon } from '../diagram/icons';
import { filled } from './requests';

/**
 * The bar of the rows selected (etalii.adp spec 079, FR-018): how many, one property set for all of
 * them as one edit, delete, and clearing the selection. It is drawn again only when what it offers
 * changed, so that a value typed in it stays.
 */
export class SelectionBar {
  readonly element = html('div', { class: 'adp-table-selection', role: 'group', 'aria-label': 'Selected rows' });
  private drawn = '';
  /** The rows selected when it was last asked, which a press acts on. */
  private rows: readonly string[] = [];

  constructor(private readonly make: (request: TableRequest) => void, private readonly clear: () => void) {
    this.element.hidden = true;
  }

  draw(rows: readonly string[], bulk: TableGestures['bulk'], shown: readonly TableProperty[]): void {
    this.rows = rows;
    const key = rows.length === 0 || !bulk ? '' : JSON.stringify([rows.length, bulk]);
    this.element.hidden = key === '';
    if (key === this.drawn) return;
    this.drawn = key;
    if (!bulk || key === '') {
      this.element.replaceChildren();
      return;
    }
    const properties = shown.filter((property) => bulk.set[property.id]);
    const which = html('select', { 'aria-label': 'Property to set' }, ...properties.map((property) => html('option', { value: property.id }, property.name)));
    const slot = html('span', { class: 'adp-table-selection-value' });
    let value: () => string | number | boolean | undefined = () => undefined;
    const field = (): void => {
      const given: TableField | undefined = bulk.set[which.value];
      if (!given) return;
      if (given.control === 'choice') {
        const select = html('select', { 'aria-label': 'Value' }, ...(given.options ?? []).map((option) => html('option', { value: option.value }, option.label)));
        value = () => (select.value === 'true' || select.value === 'false' ? select.value === 'true' : select.value);
        slot.replaceChildren(select);
      } else {
        const input = html('input', { 'aria-label': 'Value', type: given.control === 'dateTime' || given.control === 'none' ? 'text' : given.control });
        value = () => (input.value === '' && given.control !== 'text' ? undefined : given.control === 'number' ? Number(input.value) : input.value);
        slot.replaceChildren(input);
      }
    };
    which.addEventListener('change', field);
    field();
    const set = html('button', { type: 'button', class: 'adp-table-panel-button', 'data-control': 'set' }, 'Set');
    set.addEventListener('click', () => {
      const given = bulk.set[which.value];
      const typed = value();
      if (!given?.request || typed === undefined) return;
      this.make({ kind: 'steps', steps: this.rows.map((row) => filled(given.request!, typed, row)) });
    });
    const label = rows.length > 1 && bulk.remove.plural ? bulk.remove.plural.replace('{count}', String(rows.length)) : bulk.remove.label;
    const remove = html('button', { type: 'button', class: 'adp-table-panel-button', 'data-control': 'delete' }, icon('mdi-trash-can-outline'), label);
    remove.addEventListener('click', () => bulk.remove.request && this.make(bulk.remove.request));
    const clear = html('button', { type: 'button', class: 'adp-table-panel-close', 'data-control': 'clear', 'aria-label': 'Clear the selection' }, '×');
    clear.addEventListener('click', () => this.clear());
    this.element.replaceChildren(html('span', { class: 'adp-table-selection-count' }, `${rows.length} selected`), which, slot, set, remove, clear);
  }
}
