import type { FromCanvas, ToCanvas } from '../../core/frame/protocol';
import type { Action } from '../../core/frame/toolType';
import type { TableCell, TableGroup, TableOperation, TableProperty, TableRequest, TableRow, TableValue, TableView } from '../../core/tool/tableView';
import { html } from '../diagram/dom';
import { icon } from '../diagram/icons';
import { Menu } from '../diagram/menu';
import { controlOf, given, tag } from './editors';

// The table surface of a designer: it draws the table view it is sent and asks for every change
// with a request. It never changes the model itself, so what it shows after a gesture is the view
// that follows it.

/** The width of the column of row numbers and of a column that gives none, in pixels. */
const numberWidth = 44;
const defaultWidth = 160;

/** Where a cell is: the key of its line (empty for the header) and its column (empty for the row numbers). */
interface Place {
  readonly key: string;
  readonly column: string;
}

/** What a body cell stands for. */
interface At {
  readonly row: TableRow;
  readonly property: TableProperty;
  readonly cell: TableCell | undefined;
}

const moves: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Home: [0, -Infinity], End: [0, Infinity],
};
const clamp = (value: number, last: number): number => Math.max(0, Math.min(value, last));
const same = (left: readonly string[], right: readonly string[]): boolean => left.length === right.length && left.every((id, index) => id === right[index]);
const placeOf = (cell: HTMLElement): Place => ({ key: cell.closest('tr')?.dataset.key ?? '', column: cell.dataset.column ?? '' });
const several = (property: TableProperty): boolean => property.many || property.editor === 'choices' || property.editor === 'rows';
const menuButton = (name: string, tabindex: number): HTMLButtonElement => html('button',
  { class: 'adp-table-menu-button', type: 'button', tabindex, 'aria-haspopup': 'menu', 'aria-label': `Menu of ${name}` }, icon('mdi-dots-horizontal'));

export class Table {
  private readonly notice = html('p', { class: 'adp-table-notice', role: 'alert' });
  private readonly tabs = html('div', { class: 'adp-table-tabs', role: 'tablist', 'aria-label': 'Views' });
  private readonly buttons = html('span', { class: 'adp-table-actions' });
  private readonly search = html('input', { class: 'adp-table-search', type: 'search', 'aria-label': 'Search', placeholder: 'Search' });
  private readonly chips = html('span', { class: 'adp-table-settings' });
  private readonly options = html('div', { class: 'adp-table-options' });
  private readonly grid = html('table', { class: 'adp-table-grid', role: 'grid' });
  private readonly status = html('p', { class: 'adp-table-status', role: 'status' });
  private readonly root = html('div', { class: 'adp-table' },
    this.tabs,
    html('div', { class: 'adp-table-toolbar', role: 'toolbar', 'aria-label': 'Table' }, this.buttons, this.search, this.chips),
    this.options, this.notice, html('div', { class: 'adp-table-scroll' }, this.grid), this.status);
  private readonly menu: Menu;

  private view: TableView | undefined;
  private rows = new Map<string, TableRow>();
  private actions: readonly Action[] = [];
  private version = 0;
  private seq = 0;
  private selection: readonly string[] = [];
  /** A selection was sent and the view with its actions has not arrived. */
  private awaiting = false;
  /** Where the menu opens when the view for the selection arrives. */
  private wanted: { readonly x: number; readonly y: number } | undefined;
  private place: Place = { key: '', column: '' };
  /** The row a Shift click extends the selection from. */
  private anchor: string | undefined;
  /** True while a cell takes the focus without becoming the selection: the pointer chose it, or a drawing gives it back. */
  private silent = false;
  /** Closes the editor that is open in a cell. */
  private closeEditor: ((commit: boolean) => void) | undefined;
  /** A view arrived while an editor was open, and is drawn when it closes. */
  private stale = false;
  /** The list of options that is open over a cell. */
  private list: { sync(): void; close(): void } | undefined;
  private form: HTMLFormElement | undefined;

  constructor(host: HTMLElement, private readonly send: (message: FromCanvas) => void) {
    host.append(this.root);
    this.menu = new Menu(this.root, (action) => this.run(action, true));
    this.root.addEventListener('click', (event) => this.click(event));
    this.root.addEventListener('keydown', (event) => this.key(event));
    this.root.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.menuFor(event.target as HTMLElement, event.clientX, event.clientY);
    });
    this.grid.addEventListener('mousedown', (event) => this.down(event));
    this.grid.addEventListener('dblclick', (event) => this.edit((event.target as HTMLElement).closest<HTMLElement>('[role="gridcell"]')));
    this.grid.addEventListener('focusin', (event) => this.focused(event.target as HTMLElement));
    this.grid.addEventListener('change', (event) => {
      const box = event.target;
      const at = box instanceof HTMLInputElement && box.type === 'checkbox' ? this.at(box.closest<HTMLElement>('[data-column]')) : undefined;
      if (box instanceof HTMLInputElement && at) this.request({ kind: 'cell', row: at.row.id, property: at.property.id, value: box.checked });
    });
    window.addEventListener('mouseup', () => { this.silent = false; });
    this.search.addEventListener('input', () => this.filter());
    // The colours of the options are those of the kind of theme, which changes without a message.
    new MutationObserver(() => this.render()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  receive(message: ToCanvas): void {
    if (message.type === 'view' && message.kind === 'designer') {
      const view = message.view as TableView;
      this.view = view;
      this.rows = new Map(view.rows.map((row) => [row.id, row]));
      this.actions = message.actions;
      this.version = message.version;
      this.awaiting = false;
      this.render();
      // What the document no longer has is no longer selected.
      const cells = view.rows.flatMap((row) => Object.values(row.cells));
      const known = new Set([view.properties, view.properties.flatMap((property) => property.options), view.rows, cells, cells.flatMap((cell) => cell.items), view.views, view.settings]
        .flatMap((list) => list.map((element) => element.id)));
      this.select(this.selection.filter((id) => known.has(id)));
      if (this.wanted && !this.awaiting && !view.readOnly) this.menu.open(this.actions, this.wanted.x, this.wanted.y);
      this.wanted = undefined;
    } else if (message.type === 'outcome' && message.seq === this.seq) {
      this.status.textContent = message.result === 'refused' ? message.sentence ?? '' : '';
      // A refusal is followed by no view: what a gesture changed on screen goes back to what the view says.
      if (message.result === 'refused') this.render();
    } else if (message.type === 'reveal') {
      const line = [...this.grid.querySelectorAll<HTMLElement>('tr[data-id]')].find((row) => row.dataset.id === message.id);
      const cell = line?.querySelector<HTMLElement>('[role="rowheader"]') ?? this.cell({ key: '', column: message.id });
      if (!cell || message.id === '') return;
      this.place = placeOf(cell);
      this.rove();
      this.select([message.id]);
      cell.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }

  // Drawing.

  private render(): void {
    const view = this.view;
    if (!view) return;
    if (this.closeEditor) {
      this.stale = true;
      return;
    }
    this.stale = false;
    const within = this.grid.contains(document.activeElement);
    this.notice.textContent = view.notice ?? '';
    this.notice.hidden = view.notice === undefined;
    this.tabs.replaceChildren(...view.views.map((tab) => html('span', { class: 'adp-table-tab', 'data-id': tab.id },
      html('button', { type: 'button', role: 'tab', 'aria-selected': String(tab.active), 'data-view': tab.id }, tab.name),
      view.readOnly ? undefined : menuButton(tab.name, 0))));
    this.chips.replaceChildren(...view.settings.map((setting) => {
      const chip = html('button', { class: 'adp-table-chip', type: 'button', 'data-id': setting.id, 'data-depth': setting.depth }, setting.label);
      chip.style.marginLeft = `${setting.depth * 12}px`;
      return chip;
    }));
    this.drawActions();
    this.drawOptions();

    const columns = view.properties.filter((property) => property.visible);
    const widths = columns.map((property) => property.width ?? defaultWidth);
    // A frozen column stays at the sum of the widths of what is frozen before it.
    const lefts = new Map<string, number>();
    columns.reduce((left, property, index) => (property.frozen ? (lefts.set(property.id, left), left + widths[index]) : left), numberWidth);
    const frozen = <E extends HTMLElement>(cell: E, property: TableProperty): E => {
      const left = lefts.get(property.id);
      if (left === undefined) return cell;
      cell.classList.add('adp-table-frozen');
      cell.style.left = `${left}px`;
      return cell;
    };
    const numbers = new Map(view.rows.map((row, index) => [row.id, index + 1]));
    const line = (row: TableRow, key: string): HTMLElement => html('tr', { class: 'adp-table-row', role: 'row', 'data-id': row.id, 'data-key': key },
      html('th', { class: 'adp-table-number', role: 'rowheader', scope: 'row', 'data-column': '', tabindex: -1 }, String(numbers.get(row.id) ?? '')),
      ...columns.map((property) => frozen(this.cellOf(row, property), property)));
    const heading = (group: TableGroup): HTMLElement => html('tr', { class: 'adp-table-group', role: 'row', 'aria-expanded': String(!group.collapsed) },
      html('th', { role: 'rowheader', scope: 'rowgroup', colspan: columns.length + 1 },
        html('span', { class: 'adp-table-group-label' }, group.colour ? tag(group.label || 'No value', group.colour) : group.label || 'No value'),
        html('span', { class: 'adp-table-count' }, String(group.rows.length))));
    const grouped = (group: TableGroup, index: number): HTMLElement[] => [heading(group), ...(group.collapsed ? [] : group.rows.flatMap((id) => {
      const row = this.rows.get(id);
      return row ? [line(row, `${index}/${id}`)] : [];
    }))];

    this.grid.setAttribute('aria-label', view.name);
    this.grid.setAttribute('aria-rowcount', String(view.total + 1));
    this.grid.setAttribute('aria-colcount', String(columns.length + 1));
    this.grid.style.width = `${widths.reduce((sum, width) => sum + width, numberWidth)}px`;
    this.grid.replaceChildren(
      html('thead', {}, html('tr', { role: 'row', 'data-key': '' },
        html('th', { class: 'adp-table-number', role: 'columnheader', scope: 'col', 'data-column': '', tabindex: -1, 'aria-label': 'Row' }),
        ...columns.map((property, index) => {
          const cell = html('th', { role: 'columnheader', scope: 'col', 'data-id': property.id, 'data-column': property.id, tabindex: -1 },
            property.icon ? icon(property.icon) : undefined, html('span', { class: 'adp-table-name' }, property.name),
            view.readOnly ? undefined : menuButton(property.name, -1));
          cell.style.width = `${widths[index]}px`;
          return frozen(cell, property);
        }))),
      html('tbody', {}, ...(view.groups ? view.groups.flatMap(grouped) : view.rows.map((row) => line(row, row.id)))),
      ...(columns.some((property) => property.summary) ? [html('tfoot', {}, html('tr', { role: 'row' },
        html('td', { class: 'adp-table-number' }),
        ...columns.map((property) => frozen(html('td', {}, property.summary ? `${property.summary.label} ${property.summary.text}` : ''), property))))] : []),
    );
    this.filter();
    this.mark();
    this.rove();
    this.list?.sync();
    if (within) this.focus(this.place);
  }

  /** One cell of a row: its text, its tags or its checkbox. */
  private cellOf(row: TableRow, property: TableProperty): HTMLTableCellElement {
    const cell = row.cells[property.id];
    const editable = this.editable(property);
    const element = html('td', {
      class: property.wrap ? 'adp-table-wrap' : undefined, role: 'gridcell', 'data-id': cell?.id, 'data-column': property.id, tabindex: -1,
      title: property.readOnly, 'aria-readonly': editable ? undefined : 'true',
    });
    if (property.editor === 'checkbox') {
      const box = html('input', { type: 'checkbox', tabindex: -1, 'aria-label': property.name });
      box.checked = cell?.value === true;
      box.disabled = !editable;
      element.append(box);
    } else if (several(property)) {
      element.append(...(cell?.items ?? []).map((item) => tag(item.label, item.colour ?? cell?.colour, { 'data-id': item.id },
        property.editor === 'rows' && editable
          ? html('button', { class: 'adp-table-remove', type: 'button', tabindex: -1, 'aria-label': `Remove ${item.label}`, 'data-value': item.value }, '×')
          : undefined)));
    } else if (cell?.colour && cell.text !== '') {
      element.append(tag(cell.text, cell.colour));
    } else {
      element.textContent = cell?.text ?? '';
    }
    return element;
  }

  /** The actions of the document as buttons, while nothing is selected. */
  private drawActions(): void {
    const offered = this.view && !this.view.readOnly && this.selection.length === 0 && !this.awaiting ? this.actions : [];
    this.buttons.replaceChildren(...offered.map((action) => {
      const button = html('button', { class: 'adp-table-action', type: 'button', 'data-action': action.id, title: action.enabled ? undefined : action.disabledReason },
        action.icon ? icon(action.icon) : undefined, action.label);
      if (!action.enabled) button.setAttribute('aria-disabled', 'true');
      return button;
    }));
  }

  /** The options of the column that is selected, or of the one an option of is. */
  private drawOptions(): void {
    const chosen = (id: string): boolean => this.selection.includes(id);
    const property = this.view?.properties.find((candidate) => candidate.options.length > 0 && (chosen(candidate.id) || candidate.options.some((option) => chosen(option.id))));
    this.options.hidden = !property;
    this.options.setAttribute('aria-label', property ? `Options of ${property.name}` : '');
    this.options.replaceChildren(...(property?.options ?? []).map((option) => html('button', { class: 'adp-table-chip', type: 'button', 'data-id': option.id }, tag(option.name, option.colour))));
  }

  /** Hides the rows that have nothing of what is searched. Nothing of it leaves the table. */
  private filter(): void {
    const needle = this.search.value.trim().toLowerCase();
    for (const line of this.grid.querySelectorAll<HTMLElement>('tr.adp-table-row')) {
      const row = this.rows.get(line.dataset.id ?? '');
      line.hidden = needle !== '' && row !== undefined && !Object.values(row.cells).some((cell) => cell.text.toLowerCase().includes(needle));
    }
  }

  /** Shows what is selected. */
  private mark(): void {
    for (const element of this.root.querySelectorAll<HTMLElement>('[data-id]')) {
      const selected = this.selection.includes(element.dataset.id ?? '');
      element.classList.toggle('adp-selected', selected);
      if (element.matches('tr, td, th')) element.setAttribute('aria-selected', String(selected));
    }
  }

  // Focus and selection.

  /** The lines the keyboard moves over: the header and the rows in sight. */
  private lines(): HTMLElement[] {
    return [...this.grid.querySelectorAll<HTMLElement>('tr[data-key]')].filter((line) => !line.hidden);
  }

  private cell(place: Place): HTMLElement | undefined {
    const line = this.lines().find((candidate) => candidate.dataset.key === place.key);
    return ([...(line?.children ?? [])] as HTMLElement[]).find((cell) => cell.dataset.column === place.column);
  }

  private at(cell: HTMLElement | null): At | undefined {
    const row = this.rows.get(cell?.closest('tr')?.dataset.id ?? '');
    const property = this.view?.properties.find((candidate) => candidate.id === cell?.dataset.column);
    return row && property ? { row, property, cell: row.cells[property.id] } : undefined;
  }

  /** Keeps one cell in the tab order: the one the keyboard is on. */
  private rove(): void {
    for (const cell of this.grid.querySelectorAll<HTMLElement>('[tabindex="0"][data-column]')) cell.tabIndex = -1;
    const cell = this.cell(this.place) ?? this.cell({ key: '', column: '' });
    if (cell) cell.tabIndex = 0;
  }

  /** Gives a cell the focus. A quiet focus leaves the selection as it is. */
  private focus(place: Place, quiet = true): void {
    const silent = this.silent;
    this.silent = quiet;
    this.cell(place)?.focus();
    this.silent = silent;
  }

  private focused(target: HTMLElement): void {
    const cell = target.closest<HTMLElement>('[data-column]');
    if (!cell || target.closest('.adp-table-editor')) return;
    this.place = placeOf(cell);
    this.rove();
    if (this.silent) return;
    this.anchor = cell.closest('tr')?.dataset.id;
    this.select(this.idsOf(cell));
  }

  /** What a place in the table selects: the nearest element around it. */
  private idsOf(element: HTMLElement): string[] {
    const id = element.closest<HTMLElement>('[data-id]')?.dataset.id;
    return id === undefined ? [] : [id];
  }

  private select(ids: readonly string[]): void {
    if (same(ids, this.selection)) return;
    this.selection = ids;
    this.awaiting = true;
    this.status.textContent = '';
    this.send({ v: 2, type: 'selection', ids });
    this.drawActions();
    this.drawOptions();
    this.mark();
  }

  private request(request: TableRequest): void {
    this.status.textContent = '';
    this.seq += 1;
    this.send({ v: 2, type: 'edit', seq: this.seq, request, version: this.version });
  }

  // Gestures.

  /** The pointer on the grid: it selects what it is on, and a row number with Ctrl or Shift extends to several rows. */
  private down(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const cell = target.closest<HTMLElement>('[data-column]');
    if (!cell || event.button !== 0 || target.closest('.adp-table-editor, button')) return;
    const row = cell.closest('tr')?.dataset.id;
    this.silent = true;
    if (row !== undefined && cell.matches('[role="rowheader"]') && (event.ctrlKey || event.metaKey || event.shiftKey)) {
      const picked = this.selection.filter((id) => this.rows.has(id));
      if (event.shiftKey) {
        const order = [...new Set(this.lines().flatMap((line) => line.dataset.id ?? []))];
        const ends = [Math.max(0, order.indexOf(this.anchor ?? row)), order.indexOf(row)];
        this.select(order.slice(Math.min(...ends), Math.max(...ends) + 1));
      } else {
        this.select(picked.includes(row) ? picked.filter((id) => id !== row) : [...picked, row]);
      }
    } else {
      this.anchor = row;
      this.select(this.idsOf(target));
    }
    this.focus(placeOf(cell));
  }

  private click(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const remove = target.closest<HTMLElement>('.adp-table-remove');
    const tab = target.closest<HTMLElement>('[role="tab"]');
    const action = target.closest<HTMLElement>('.adp-table-action');
    if (remove) {
      const at = this.at(remove.closest<HTMLElement>('[data-column]'));
      if (at) this.request({ kind: 'item', row: at.row.id, property: at.property.id, value: remove.dataset.value ?? '', present: false });
    } else if (target.closest('.adp-table-menu-button, .adp-table-chip')) {
      const box = target.getBoundingClientRect();
      this.menuFor(target, box.left, box.bottom);
    } else if (tab) {
      if (tab.getAttribute('aria-selected') !== 'true' && !this.view?.readOnly) this.request({ kind: 'show', view: tab.dataset.view ?? '' });
    } else if (action && !action.hasAttribute('aria-disabled')) {
      this.run(action.dataset.action ?? '', false);
    }
  }

  private key(event: KeyboardEvent): void {
    this.silent = false;
    const target = event.target as HTMLElement;
    const menu = target.closest('.adp-menu');
    if (menu) {
      // The menu closes itself on Escape; the focus goes back to where it came from.
      const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      if (event.key === 'Escape') this.focus(this.place);
      else if (step !== 0) items[(items.indexOf(target) + step + items.length) % items.length]?.focus();
      if (step !== 0) event.preventDefault();
      return;
    }
    if (target === this.search) return;
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      const box = target.getBoundingClientRect();
      this.menuFor(target, box.left, box.bottom);
      return;
    }
    const cell = this.grid.contains(target) ? target.closest<HTMLElement>('[data-column]') : null;
    const line = cell?.closest('tr');
    if (!cell || !line) return;
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const lines = this.lines();
      const cells = [...(lines[clamp(lines.indexOf(line) + move[0], lines.length - 1)]?.children ?? [])] as HTMLElement[];
      const next = cells[clamp([...line.children].indexOf(cell) + move[1], cells.length - 1)];
      if (next) this.focus(placeOf(next), false);
    } else if (event.key === 'Escape') {
      this.select([]);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      const at = this.at(cell);
      if (at && this.editable(at.property) && !several(at.property) && (at.cell?.value ?? null) !== null) this.request({ kind: 'cell', row: at.row.id, property: at.property.id, value: null });
    } else if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      this.edit(cell);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !(target instanceof HTMLInputElement)) {
      // Prevented, or the character would be typed a second time into the editor it opens.
      event.preventDefault();
      this.edit(cell, event.key);
    }
  }

  /** Selects what a menu is asked on, and opens the menu when the actions for it are known. */
  private menuFor(element: HTMLElement, x: number, y: number): void {
    const [id] = this.idsOf(element);
    if (id === undefined) return;
    this.select(this.selection.includes(id) ? this.selection : [id]);
    if (!this.view || this.view.readOnly) return;
    if (this.awaiting) this.wanted = { x, y };
    else this.menu.open(this.actions, x, y);
  }

  /** Runs an operation on the selection: at once, or after its parameters are asked. */
  private run(id: string, fromMenu: boolean): void {
    const operation = this.view?.operations[id];
    const on = this.selection;
    if (operation && operation.params.length > 0) {
      this.ask(operation, on);
      return;
    }
    this.request({ kind: 'operation', operation: id, on });
    if (fromMenu) this.focus(this.place);
  }

  private ask(operation: TableOperation, on: readonly string[]): void {
    this.form?.remove();
    const controls = operation.params.map((param) => ({ param, control: controlOf(param) }));
    const cancel = html('button', { type: 'button' }, 'Cancel');
    const form = html('form', { class: 'adp-table-params', role: 'dialog', 'aria-label': operation.label },
      ...controls.map(({ param, control }) => html('label', {}, html('span', {}, param.label), control)),
      html('div', { class: 'adp-table-buttons' }, html('button', { type: 'submit' }, operation.label), cancel));
    const close = (): void => {
      form.remove();
      this.form = undefined;
      this.focus(this.place);
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.checkValidity()) return;
      const args: Record<string, TableValue> = {};
      for (const { param, control } of controls) {
        const value = given(param, control);
        if (value !== undefined) args[param.name] = value;
      }
      close();
      this.request({ kind: 'operation', operation: operation.id, on, args });
    });
    form.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') close();
    });
    cancel.addEventListener('click', close);
    this.form = form;
    this.root.append(form);
    controls[0]?.control.focus();
  }

  // Editing in place.

  private editable(property: TableProperty): boolean {
    return this.view?.readOnly === false && property.editor !== undefined && property.readOnly === undefined;
  }

  /** Starts editing a cell with the editor of its column; `typed` is the character that started it. */
  private edit(cell: HTMLElement | null, typed?: string): void {
    const at = this.at(cell);
    if (!cell || !at || !this.editable(at.property)) return;
    if (at.property.editor === 'checkbox') {
      if (typed === undefined || typed === ' ') this.request({ kind: 'cell', row: at.row.id, property: at.property.id, value: at.cell?.value !== true });
    } else if (at.property.editor === 'choice' || at.property.editor === 'choices') {
      this.pick(cell, at);
    } else {
      this.type(cell, at, typed);
    }
  }

  /** A text box over the cell: Enter and Tab commit, Escape cancels, and so does nothing that did not change. */
  private type(cell: HTMLElement, at: At, typed: string | undefined): void {
    const { row, property } = at;
    const editor = property.editor;
    const adding = editor === 'rows';
    const input = html('input', {
      class: adding ? 'adp-table-editor adp-table-adding' : 'adp-table-editor', 'aria-label': property.name,
      type: editor === 'number' || editor === 'date' || editor === 'time' ? editor : 'text',
      placeholder: editor === 'dateTime' ? 'YYYY-MM-DDThh:mm:ss+hh:mm' : undefined,
    });
    const before = at.cell?.value ?? null;
    input.value = typed ?? (adding || before === null ? '' : String(before));
    const here = placeOf(cell);
    const close = (commit: boolean, next?: Place): void => {
      if (this.closeEditor !== close) return;
      this.closeEditor = undefined;
      const raw = input.value;
      input.remove();
      if (commit && adding) {
        if (raw.trim() !== '') this.request({ kind: 'item', row: row.id, property: property.id, value: raw.trim(), present: true });
      } else if (commit) {
        const value = editor === 'text' ? raw : raw === '' ? null : editor === 'number' ? Number(raw) : raw;
        if (value !== (editor === 'text' ? before ?? '' : before)) this.request({ kind: 'cell', row: row.id, property: property.id, value });
      }
      if (this.stale) this.render();
      if (next) this.focus(next, !same([next.key, next.column], [here.key, here.column]));
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key !== 'Enter' && event.key !== 'Escape' && event.key !== 'Tab') return;
      event.preventDefault();
      const cells = this.lines().flatMap((line) => [...line.querySelectorAll<HTMLElement>('[role="gridcell"]')]);
      const beside = cells[cells.indexOf(cell) + (event.shiftKey ? -1 : 1)];
      close(event.key !== 'Escape', event.key === 'Tab' && beside ? placeOf(beside) : here);
    });
    input.addEventListener('blur', () => close(true));
    this.closeEditor = close;
    cell.append(input);
    input.focus();
    if (typed === undefined) input.select();
  }

  /** A list of the column's options over the cell: one of them or none for a choice, any number for choices. */
  private pick(cell: HTMLElement, at: At): void {
    this.list?.close();
    const { row, property } = at;
    const many = property.editor === 'choices';
    const here = placeOf(cell);
    const state = many ? 'aria-checked' : 'aria-selected';
    const option = (value: string, content: Node | string): HTMLLIElement => html('li', { role: 'option', tabindex: -1, 'data-value': value }, content);
    const items = [...(many ? [] : [option('', 'None')]), ...property.options.map((candidate) => option(candidate.id, tag(candidate.name, candidate.colour)))];
    const element = html('ul', { class: 'adp-table-list', role: 'listbox', 'aria-label': property.name, 'aria-multiselectable': many ? 'true' : undefined }, ...items);
    const has = (value: string): boolean => {
      const held = this.rows.get(row.id)?.cells[property.id];
      return many ? held?.items.some((item) => item.value === value) === true : (held?.value ?? '') === value;
    };
    const sync = (): void => items.forEach((item) => item.setAttribute(state, String(has(item.dataset.value ?? ''))));
    const outside = (event: Event): void => {
      if (!element.contains(event.target as Node)) close(false);
    };
    const close = (refocus: boolean): void => {
      element.remove();
      window.removeEventListener('pointerdown', outside, true);
      this.list = undefined;
      if (refocus) this.focus(here);
    };
    const choose = (item: HTMLElement): void => {
      const value = item.dataset.value ?? '';
      if (many) {
        const present = item.getAttribute(state) !== 'true';
        item.setAttribute(state, String(present));
        this.request({ kind: 'item', row: row.id, property: property.id, value, present });
        return;
      }
      const unchanged = has(value);
      close(true);
      if (!unchanged) this.request({ kind: 'cell', row: row.id, property: property.id, value: value === '' ? null : value });
    };
    element.addEventListener('click', (event) => {
      const item = (event.target as HTMLElement).closest<HTMLElement>('[role="option"]');
      if (item) choose(item);
    });
    element.addEventListener('keydown', (event) => {
      event.stopPropagation();
      const index = items.indexOf(document.activeElement as HTMLLIElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') items[clamp(index + (event.key === 'ArrowDown' ? 1 : -1), items.length - 1)]?.focus();
      else if ((event.key === 'Enter' || event.key === ' ') && items[index]) choose(items[index]);
      else if (event.key === 'Escape' || event.key === 'Tab') close(true);
      else return;
      event.preventDefault();
    });
    const box = cell.getBoundingClientRect();
    const frame = this.root.getBoundingClientRect();
    element.style.left = `${box.left - frame.left}px`;
    element.style.top = `${box.bottom - frame.top}px`;
    this.root.append(element);
    sync();
    (items.find((item) => item.getAttribute(state) === 'true') ?? items[0])?.focus();
    window.addEventListener('pointerdown', outside, true);
    this.list = { sync, close: () => close(false) };
  }
}
