import type { FromCanvas, ToCanvas } from '../../core/frame/protocol';
import type { Action } from '../../core/frame/toolType';
import type { TableBarItem, TableCell, TableEntry, TableFinding, TableGestures, TableGroup, TableMenu, TableOperation, TablePanel, TableProperty, TableRequest, TableRow, TableValue, TableView } from '../../core/tool/tableView';
import { html } from '../diagram/dom';
import { icon } from '../diagram/icons';
import { Menu } from '../diagram/menu';
import { afterOf, follow, reorder, stepped } from './drag';
import { controlOf, given, tag } from './editors';
import { EntryMenu } from './entries';
import { Panels } from './panels';
import { filled, SELECTION } from './requests';
import { SelectionBar } from './selection';
import { openCellList } from './cellList';
import { lineHeight, windowFrom, windowOf } from './windowing';

// The table surface of a designer: it draws the table view it is sent and asks for every change
// with a request. It never changes the model itself, so what it shows after a gesture is the view
// that follows it.

/** The width of the column of row numbers and of a column that gives none, in pixels. */
const numberWidth = 44;
/** The width of the lead column of a surface with gestures: a row's checkbox and its handle. */
const leadWidth = 52;
const defaultWidth = 160;
/** The narrowest a drag of its border leaves a column, as in the standalone host; and how far a key widens or narrows it. */
const minimumWidth = 60;
const widthStep = 20;

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
/** The gravest first: how a cell with several findings is marked. */
const gravity = ['error', 'warning', 'information', 'hint'];
/** Marks a cell with the findings about it: a sign in the colour of the gravest, and their sentences as its title and its name for assistive technology. */
const marked = <E extends HTMLElement>(element: E, findings: readonly TableFinding[] | undefined): E => {
  if (!findings || findings.length === 0) return element;
  const worst = [...findings].sort((a, b) => gravity.indexOf(a.severity) - gravity.indexOf(b.severity))[0].severity;
  const said = findings.map((finding) => finding.message).join('\n');
  element.classList.add('adp-table-finding', `adp-table-finding-${worst}`);
  if (worst === 'error') element.setAttribute('aria-invalid', 'true');
  element.title = [element.title, said].filter((part) => part !== '').join('\n');
  element.append(html('span', { class: 'adp-table-finding-mark', role: 'img', 'aria-label': said }, icon(worst === 'error' ? 'mdi-alert-circle' : worst === 'warning' ? 'mdi-alert' : 'mdi-information-outline')));
  return element;
};
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
  private readonly scroller = html('div', { class: 'adp-table-scroll' }, this.grid);
  /** A drawing asked for by a scroll and not yet made. */
  private scrolled = false;
  /** Whether the body is drawn in part, the lines near sight. */
  private windowed = false;
  private readonly status = html('p', { class: 'adp-table-status', role: 'status' });
  /** The bar of the rows selected: how many, a value set for all of them, delete, and clearing the selection. */
  private readonly bar = new SelectionBar((request) => this.make(request), () => this.select([]));
  private readonly tune = html('button', { class: 'adp-table-tune', type: 'button', 'aria-label': 'Settings', title: 'Settings', 'aria-haspopup': 'menu' }, icon('mdi-tune-variant'));
  /** The editor of the settings control, or the options panel, that is open. */
  private panel: TablePanel | undefined;
  private readonly panels = new Panels((request, typed) => this.make(request, undefined, typed), () => {
    this.panel = undefined;
    this.render();
  });
  private readonly root = html('div', { class: 'adp-table' },
    this.tabs,
    html('div', { class: 'adp-table-toolbar', role: 'toolbar', 'aria-label': 'Table' }, this.buttons, this.search, this.chips, this.tune, this.bar.element),
    this.panels.element, this.options, this.notice, this.scroller, this.status);
  private readonly menu: Menu;
  private readonly entries: EntryMenu;
  private readonly find = html('button', { class: 'adp-table-find', type: 'button', 'aria-label': 'Search', 'aria-expanded': 'false' }, icon('mdi-magnify'));

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
  /** What a view's or a column's menu was opened on: a name renamed in place is typed there. */
  private menuAt: HTMLElement | undefined;
  /** A name typed in place and sent: what its outcome does. */
  private renaming: { readonly seq: number; readonly refused: (sentence: string) => void; readonly done: () => void } | undefined;

  constructor(host: HTMLElement, private readonly send: (message: FromCanvas) => void) {
    host.append(this.root);
    this.menu = new Menu(this.root, (action) => this.run(action, true));
    this.entries = new EntryMenu(this.root, (entry) => this.chosen(entry));
    this.search.before(this.find);
    this.find.hidden = true;
    this.root.addEventListener('click', (event) => this.click(event));
    this.root.addEventListener('keydown', (event) => this.key(event));
    this.root.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.menuFor(event.target as HTMLElement, event.clientX, event.clientY);
    });
    this.grid.addEventListener('mousedown', (event) => this.down(event));
    this.root.addEventListener('mousedown', (event) => this.drag(event));
    this.grid.addEventListener('dblclick', (event) => this.edit((event.target as HTMLElement).closest<HTMLElement>('[role="gridcell"]')));
    this.grid.addEventListener('focusin', (event) => this.focused(event.target as HTMLElement));
    this.grid.addEventListener('change', (event) => {
      const box = event.target;
      const at = box instanceof HTMLInputElement && box.type === 'checkbox' ? this.at(box.closest<HTMLElement>('[data-column]')) : undefined;
      if (box instanceof HTMLInputElement && at) this.request({ kind: 'cell', row: at.row.id, property: at.property.id, value: box.checked });
      if (box instanceof HTMLInputElement && box.classList.contains('adp-table-check')) this.checked(box);
    });
    window.addEventListener('mouseup', () => { this.silent = false; });
    this.scroller.addEventListener('scroll', () => {
      if (!this.windowed || this.scrolled) return;
      this.scrolled = true;
      requestAnimationFrame(() => {
        this.scrolled = false;
        this.render();
      });
    });
    this.search.addEventListener('input', () => this.filter());
    this.search.addEventListener('blur', () => {
      if (this.gestures && this.search.value === '') this.searching(false);
    });
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
    } else if (message.type === 'outcome' && this.renaming?.seq === message.seq) {
      // A name typed in place stays open with the reason it was refused for, and closes once it is kept.
      const renaming = this.renaming;
      this.renaming = undefined;
      if (message.result === 'refused') renaming.refused(message.sentence ?? '');
      else renaming.done();
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
    const gestures = this.gestures;
    this.root.classList.toggle('adp-table-gestures', gestures !== undefined);
    // A tab moved by the keyboard keeps the focus when the tabs are drawn again.
    const onTab = this.tabs.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.view : undefined;
    this.tabs.replaceChildren(...view.views.map((tab) => html('span', { class: 'adp-table-tab', 'data-id': tab.id },
      html('button', { type: 'button', role: 'tab', 'aria-selected': String(tab.active), 'data-view': tab.id, 'aria-haspopup': gestures && tab.active ? 'menu' : undefined, 'aria-keyshortcuts': gestures?.moves?.views ? 'Alt+ArrowLeft Alt+ArrowRight' : undefined }, tab.name),
      view.readOnly || gestures ? undefined : menuButton(tab.name, 0))),
    ...(gestures?.newView ? [html('button', { class: 'adp-table-new-view', type: 'button', 'aria-label': 'New view', title: 'New view' }, icon('mdi-plus'))] : []));
    if (onTab !== undefined) [...this.tabs.querySelectorAll<HTMLElement>('[role="tab"]')].find((tab) => tab.dataset.view === onTab)?.focus();
    this.find.hidden = gestures === undefined;
    if (!gestures) this.searching(true);
    else if (this.search.value === '' && document.activeElement !== this.search) this.searching(false);
    this.tune.hidden = gestures?.settings === undefined;
    if (this.panel?.panel === 'options' && !gestures?.options?.[this.panel.property]) this.panel = undefined;
    this.panels.draw(gestures, this.panel);
    this.chips.replaceChildren(...(gestures ? (gestures.items ?? []).map((item) => this.itemOf(item)) : view.settings.map((setting) => {
      const chip = html('button', { class: 'adp-table-chip', type: 'button', 'data-id': setting.id, 'data-depth': setting.depth }, setting.label);
      chip.style.marginLeft = `${setting.depth * 12}px`;
      return chip;
    })));
    this.drawActions();
    this.drawOptions();

    const columns = view.properties.filter((property) => property.visible);
    const widths = columns.map((property) => property.width ?? defaultWidth);
    // A frozen column stays at the sum of the widths of what is frozen before it.
    const lefts = new Map<string, number>();
    const lead = gestures ? leadWidth : numberWidth;
    columns.reduce((left, property, index) => (property.frozen ? (lefts.set(property.id, left), left + widths[index]) : left), lead);
    const frozen = <E extends HTMLElement>(cell: E, property: TableProperty): E => {
      const left = lefts.get(property.id);
      if (left === undefined) return cell;
      cell.classList.add('adp-table-frozen');
      cell.style.left = `${left}px`;
      return cell;
    };
    const numbers = new Map(view.rows.map((row, index) => [row.id, index + 1]));
    const leadOf = (row: TableRow): HTMLElement => marked(gestures
      ? html('th', { class: 'adp-table-number adp-table-lead', role: 'rowheader', scope: 'row', 'data-column': '', tabindex: -1, 'aria-keyshortcuts': gestures.moves?.rows ? 'Alt+ArrowUp Alt+ArrowDown' : undefined },
        html('span', { class: gestures.moves?.rows ? 'adp-table-handle adp-table-movable' : 'adp-table-handle', 'aria-hidden': 'true', title: gestures.moves?.rows ? 'Drag to move' : undefined }, icon('mdi-drag-vertical')),
        html('input', { class: 'adp-table-check', type: 'checkbox', tabindex: -1, 'aria-label': `Select ${row.cells[columns.find((property) => property.title)?.id ?? '']?.text || 'row'}`, 'data-row': row.id }))
      : html('th', { class: 'adp-table-number', role: 'rowheader', scope: 'row', 'data-column': '', tabindex: -1 }, String(numbers.get(row.id) ?? '')), row.findings);
    const line = (row: TableRow, key: string): HTMLElement => html('tr', { class: 'adp-table-row', role: 'row', 'data-id': row.id, 'data-key': key, 'aria-level': view.tree?.[row.id] ? String(view.tree[row.id].depth + 1) : undefined },
      leadOf(row), ...columns.map((property) => frozen(this.cellOf(row, property), property)));
    const span = columns.length + (gestures?.newProperty ? 2 : 1);
    const adding = (request: TableRequest | undefined, group?: string): HTMLElement[] => (request === undefined || view.readOnly ? [] : [html('tr', { class: 'adp-table-new', role: 'row', 'data-group': group },
      html('td', { colspan: span }, html('button', { class: 'adp-table-new-row', type: 'button', 'data-group': group }, icon('mdi-plus'), 'New')))]);
    const control = (kind: string, label: string, name: string): HTMLElement => html('button', { type: 'button', class: `adp-table-group-control adp-table-group-${kind}`, 'data-control': kind, 'aria-label': label, title: label }, icon(name));
    const heading = (group: TableGroup): HTMLElement => {
      const head = gestures?.groupHeads?.[group.key];
      const label = group.label || 'No value';
      return html('tr', { class: 'adp-table-group', role: 'row', 'aria-expanded': String(!group.collapsed), 'data-group': group.key },
        html('th', { role: 'rowheader', scope: 'rowgroup', colspan: span },
          head ? html('button', { type: 'button', class: 'adp-table-fold', 'data-control': 'fold', 'aria-expanded': String(!group.collapsed), 'aria-label': `${group.collapsed ? 'Expand' : 'Collapse'} ${label}` }, icon(group.collapsed ? 'mdi-chevron-right' : 'mdi-chevron-down')) : undefined,
          html('span', { class: head ? 'adp-table-group-label adp-table-folds' : 'adp-table-group-label' }, group.colour ? tag(label, group.colour) : label),
          html('span', { class: 'adp-table-count' }, String(group.rows.length)),
          ...(head ? [html('span', { class: 'adp-table-group-controls' },
            head.up ? control('up', `Move ${label} up`, 'mdi-arrow-up') : undefined,
            head.down ? control('down', `Move ${label} down`, 'mdi-arrow-down') : undefined,
            control('hide', `Hide ${label}`, 'mdi-eye-off-outline'))] : [])));
    };
    // Each line of the body as what draws it, so that a long table draws only the lines near sight.
    const later = (elements: HTMLElement[]): (() => HTMLElement)[] => elements.map((element) => () => element);
    const body: (() => HTMLElement)[] = view.groups
      ? view.groups.flatMap((group, index) => [() => heading(group), ...(group.collapsed ? [] : [
        ...group.rows.flatMap((id) => {
          const row = this.rows.get(id);
          return row ? [() => line(row, `${index}/${id}`)] : [];
        }),
        ...later(adding(gestures?.newRowIn?.[group.key], group.key))])])
      : [...view.rows.map((row) => () => line(row, row.id)), ...later(adding(gestures?.newRow))];
    const [start, end] = windowOf(body.length, this.scroller.scrollTop, this.scroller.clientHeight);
    this.windowed = body.length > windowFrom;
    const spacer = (lines: number): HTMLElement[] => {
      if (lines === 0) return [];
      const element = html('tr', { class: 'adp-table-spacer', 'aria-hidden': 'true' }, html('td', { colspan: span }));
      element.style.height = `${lines * lineHeight}px`;
      return [element];
    };


    this.grid.setAttribute('aria-label', view.name);
    this.grid.setAttribute('aria-rowcount', String(view.total + 1));
    this.grid.setAttribute('aria-colcount', String(columns.length + 1));
    this.grid.style.width = `${widths.reduce((sum, width) => sum + width, lead + (gestures?.newProperty ? 32 : 0))}px`;
    this.grid.replaceChildren(
      html('thead', {}, html('tr', { role: 'row', 'data-key': '' },
        gestures
          ? html('th', { class: 'adp-table-number adp-table-lead', role: 'columnheader', scope: 'col', 'data-column': '', tabindex: -1, 'aria-label': 'Row' },
            html('input', { class: 'adp-table-check adp-table-all', type: 'checkbox', tabindex: -1, 'aria-label': 'Select all rows' }))
          : html('th', { class: 'adp-table-number', role: 'columnheader', scope: 'col', 'data-column': '', tabindex: -1, 'aria-label': 'Row' }),
        ...columns.map((property, index) => {
          const shortcuts = [...(gestures?.moves?.columns ? ['Alt+ArrowLeft', 'Alt+ArrowRight'] : []), ...(gestures?.widths ? ['Alt+Shift+ArrowLeft', 'Alt+Shift+ArrowRight'] : [])];
          const cell = html('th', { role: 'columnheader', scope: 'col', 'data-id': property.id, 'data-column': property.id, tabindex: -1, 'aria-haspopup': gestures?.columnMenus?.[property.id] ? 'menu' : undefined, 'aria-keyshortcuts': shortcuts.length > 0 ? shortcuts.join(' ') : undefined },
            property.icon ? icon(property.icon) : undefined, html('span', { class: 'adp-table-name' }, property.name),
            view.readOnly || gestures ? undefined : menuButton(property.name, -1),
            gestures?.widths?.[property.id] ? html('span', { class: 'adp-table-resizer', 'aria-hidden': 'true' }) : undefined);
          cell.style.width = `${widths[index]}px`;
          return frozen(cell, property);
        }),
        ...(gestures?.newProperty ? [html('th', { class: 'adp-table-add-column', role: 'columnheader', scope: 'col' },
          html('button', { class: 'adp-table-new-property', type: 'button', 'aria-label': 'New property', title: 'New property', 'aria-haspopup': 'dialog' }, icon('mdi-plus')))] : []))),
      html('tbody', {}, ...spacer(start), ...body.slice(start, end).map((draw) => draw()), ...spacer(body.length - end)),
      ...(columns.some((property) => property.summary) || gestures?.calculations ? [html('tfoot', {}, html('tr', { role: 'row' },
        html('td', { class: 'adp-table-number' }),
        ...columns.map((property) => frozen(html('td', { 'data-calculation': property.id }, gestures?.calculations?.[property.id]
          ? html('button', { type: 'button', class: property.summary ? 'adp-table-calculate adp-table-calculated' : 'adp-table-calculate', 'aria-haspopup': 'menu', 'data-property': property.id },
            ...(property.summary ? [html('span', { class: 'adp-table-calculation-label' }, property.summary.label), ` ${property.summary.text}`] : ['Calculate']))
          : property.summary ? `${property.summary.label} ${property.summary.text}` : ''), property)),
        ...(gestures?.newProperty ? [html('td', {})] : [])))] : []),
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
    // Where rows nest under their parents, the title is indented by its depth, a parent's with its fold.
    const nest = property.title ? this.view?.tree?.[row.id] : undefined;
    if (nest) {
      const fold = this.gestures?.folds?.[row.id];
      element.classList.add('adp-table-nested');
      element.style.paddingLeft = `${8 + nest.depth * 18}px`;
      element.prepend(nest.parent && fold
        ? html('button', { type: 'button', class: 'adp-table-fold adp-table-row-fold', tabindex: -1, 'data-row': row.id, 'aria-expanded': String(!nest.collapsed), 'aria-label': `${nest.collapsed ? 'Expand' : 'Collapse'} ${cell?.text ?? 'row'}` }, icon(nest.collapsed ? 'mdi-chevron-right' : 'mdi-chevron-down'))
        : html('span', { class: 'adp-table-fold-space', 'aria-hidden': 'true' }));
    }
    return marked(element, cell?.findings);
  }

  /** The actions of the document as buttons, while nothing is selected. */
  private drawActions(): void {
    const offered = this.view && !this.view.readOnly && !this.gestures && this.selection.length === 0 && !this.awaiting ? this.actions : [];
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
    // A surface with gestures edits options from the column's menu: no strip moves the grid under the pointer.
    const property = this.gestures ? undefined : this.view?.properties.find((candidate) => candidate.options.length > 0 && (chosen(candidate.id) || candidate.options.some((option) => chosen(option.id))));
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
    for (const box of this.grid.querySelectorAll<HTMLInputElement>('.adp-table-check[data-row]')) box.checked = this.selection.includes(box.dataset.row ?? '');
    const boxes = [...this.grid.querySelectorAll<HTMLInputElement>('.adp-table-check[data-row]')].filter((box) => !box.closest('tr')?.hidden);
    const every = this.grid.querySelector<HTMLInputElement>('.adp-table-all');
    if (every) every.checked = boxes.length > 0 && boxes.every((box) => box.checked);
    this.root.classList.toggle('adp-table-picking', this.selection.some((id) => this.rows.has(id)));
    this.drawBar();
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
    if (!cell || event.button !== 0 || target.closest('.adp-table-editor, button, .adp-table-check')) return;
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
    } else if (!(row !== undefined && target.closest('.adp-table-handle') && this.selection.includes(row))) {
      // A selected row's handle drags the selection: pressing it keeps it.
      this.anchor = row;
      this.select(this.idsOf(target));
    }
    this.focus(placeOf(cell));
  }

  private click(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.gestures && this.gesture(target)) return;
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
    if (event.altKey && this.gestures && this.moveByKey(target, event)) {
      event.preventDefault();
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
    } else if ((event.key === 'Enter' || event.key === ' ') && this.gestures && cell.matches('[role="columnheader"][data-id]')) {
      event.preventDefault();
      this.columnMenu(cell);
    } else if (event.key === 'Enter' && event.shiftKey && this.gestures?.newRowAfter && line.dataset.id !== undefined) {
      // As in the standalone host: a row under the one the key was pressed on.
      event.preventDefault();
      this.make(this.gestures.newRowAfter, undefined, undefined, line.dataset.id);
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
    // On a surface with gestures, the menu of a row is the row's: of the rows selected, where it is one of them.
    const line = this.gestures ? element.closest<HTMLElement>('tr.adp-table-row')?.dataset.id : undefined;
    const [id] = line === undefined ? this.idsOf(element) : [line];
    if (id === undefined) return;
    this.select(this.selection.includes(id) ? this.selection : [id]);
    if (!this.view || this.view.readOnly) return;
    const gestures = this.gestures;
    if (gestures) {
      const header = element.closest<HTMLElement>('[role="columnheader"][data-id]');
      const tab = element.closest<HTMLElement>('.adp-table-tab');
      if (header) this.columnMenu(header, x, y);
      else if (tab) {
        this.menuAt = tab.querySelector<HTMLElement>('[role="tab"]') ?? undefined;
        this.entries.open(gestures.viewMenus?.[tab.dataset.id ?? ''] ?? [], x, y, 'View');
      }
      else if (element.closest('tr.adp-table-row')) this.entries.open(this.counted(gestures.rowMenu ?? []), x, y, 'Row');
      return;
    }
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

  private ask(operation: TableOperation, on: readonly string[], fixed: Readonly<Record<string, TableValue>> = {}, made: (args: Record<string, TableValue>) => TableRequest = (args) => ({ kind: 'operation', operation: operation.id, on, args })): void {
    this.form?.remove();
    const controls = operation.params.filter((param) => !(param.name in fixed)).map((param) => ({ param, control: controlOf(param) }));
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
      const args: Record<string, TableValue> = { ...fixed };
      for (const { param, control } of controls) {
        const value = given(param, control);
        if (value !== undefined) args[param.name] = value;
      }
      close();
      this.request(made(args));
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

  // The gestures a tool type gives its table.

  private get gestures(): TableGestures | undefined {
    return this.view?.readOnly === false ? this.view.gestures : undefined;
  }

  /** Shows the search box, or folds it back into its magnifier. */
  private searching(open: boolean): void {
    this.search.hidden = !open;
    this.find.setAttribute('aria-expanded', String(open));
  }

  /** A sort or a filter of the view, in words, with the × that removes it. */
  private itemOf(item: TableBarItem): HTMLElement {
    return html('span', { class: `adp-table-item adp-table-${item.kind}`, 'data-id': item.id },
      icon(item.kind === 'filter' ? 'mdi-filter-outline' : item.descending ? 'mdi-arrow-down' : 'mdi-arrow-up'),
      html('span', { class: 'adp-table-item-text' }, item.text),
      item.remove ? html('button', { class: 'adp-table-item-remove', type: 'button', 'aria-label': `Remove ${item.kind} ${item.text}`, 'data-item': item.id }, '×') : undefined);
  }

  /** A row's checkbox, or the one that selects every row in sight. */
  private checked(box: HTMLInputElement): void {
    const rows = this.selection.filter((id) => this.rows.has(id));
    if (box.classList.contains('adp-table-all')) {
      const sight = this.lines().flatMap((line) => line.dataset.id ?? []);
      this.select(box.checked ? [...new Set(sight)] : []);
    } else {
      const row = box.dataset.row ?? '';
      this.anchor = row;
      this.select(box.checked ? [...rows.filter((id) => id !== row), row] : rows.filter((id) => id !== row));
    }
  }

  /** A press on a control of the gesture surface; false for one it does not have. */
  private gesture(target: HTMLElement): boolean {
    const gestures = this.gestures!;
    const below = (element: HTMLElement): [number, number] => {
      const box = element.getBoundingClientRect();
      return [box.left, box.bottom];
    };
    const tab = target.closest<HTMLElement>('[role="tab"]');
    const remove = target.closest<HTMLElement>('.adp-table-item-remove');
    const header = target.closest<HTMLElement>('[role="columnheader"][data-id]');
    const adding = target.closest<HTMLElement>('.adp-table-new-row');
    const item = target.closest<HTMLElement>('.adp-table-item');
    const rowFold = target.closest<HTMLElement>('.adp-table-row-fold');
    if (rowFold) {
      const request = gestures.folds?.[rowFold.dataset.row ?? ''];
      if (request) this.make(request);
      return request !== undefined;
    }
    const groupControl = target.closest<HTMLElement>('.adp-table-group [data-control]');
    if (groupControl) {
      const head = gestures.groupHeads?.[groupControl.closest<HTMLElement>('tr')?.dataset.group ?? ''];
      const request = head?.[groupControl.dataset.control as 'fold' | 'up' | 'down' | 'hide'];
      if (request) this.make(request);
      return request !== undefined;
    }
    const calculate = target.closest<HTMLElement>('.adp-table-calculate');
    if (target.closest('.adp-table-tune')) {
      const tune = target.closest<HTMLElement>('.adp-table-tune')!;
      this.entries.returnTo(tune);
      this.entries.open([[
        { id: 'visibility', label: 'Property visibility', icon: 'eye-outline', opens: { panel: 'visibility' } },
        { id: 'filter', label: 'Filter', icon: 'filter-outline', opens: { panel: 'filter' } },
        { id: 'sort', label: 'Sort', icon: 'sort', opens: { panel: 'sort' } },
        { id: 'group', label: 'Group', icon: 'format-list-group', opens: { panel: 'group' } },
      ]], ...below(tune), 'Settings');
    } else if (calculate) {
      const menu = gestures.calculations?.[calculate.dataset.property ?? ''];
      if (!menu) return false;
      this.entries.returnTo(calculate);
      this.entries.open(menu, ...below(calculate), 'Calculate');
    } else if (item && !target.closest('.adp-table-item-remove')) {
      const opens = gestures.items?.find((candidate) => candidate.id === item.dataset.id)?.opens;
      if (!opens) return false;
      this.openPanel(opens);
    } else if (target.closest('.adp-table-find')) {
      this.searching(true);
      this.search.focus();
    } else if (target.closest('.adp-table-new-view') && gestures.newView) {
      this.make(gestures.newView);
    } else if (tab && tab.getAttribute('aria-selected') === 'true') {
      const menu = gestures.viewMenus?.[tab.dataset.view ?? ''];
      if (!menu) return false;
      this.menuAt = tab;
      this.entries.returnTo(tab);
      this.entries.open(menu, ...below(tab), tab.textContent ?? '');
    } else if (remove) {
      const item = gestures.items?.find((candidate) => candidate.id === remove.dataset.item);
      if (item?.remove) this.make(item.remove);
    } else if (target.closest('.adp-table-new-property') && gestures.newProperty) {
      this.newProperty(target.closest<HTMLElement>('.adp-table-new-property')!, gestures.newProperty);
    } else if (adding) {
      const group = adding.dataset.group;
      const request = group === undefined ? gestures.newRow : gestures.newRowIn?.[group];
      if (request) this.make(request);
    } else if (header && !target.closest('.adp-table-check, .adp-table-renaming')) {
      this.columnMenu(header);
    } else {
      return false;
    }
    return true;
  }

  /** The menu of a column, under its header or where the pointer is. */
  private columnMenu(header: HTMLElement, x?: number, y?: number): void {
    const menu = this.gestures?.columnMenus?.[header.dataset.id ?? ''];
    if (!menu) return;
    const box = header.getBoundingClientRect();
    this.menuAt = header;
    this.entries.returnTo(header);
    this.entries.open(menu, x ?? box.left, y ?? box.bottom, header.textContent ?? '');
  }

  /** Draws the bar of the rows selected, again only when what it offers changed. */
  private drawBar(): void {
    const rows = this.selection.filter((id) => this.rows.has(id));
    this.bar.draw(rows, this.gestures?.bulk, this.view?.properties ?? []);
  }

  /** A menu for the rows selected: each entry with a label for several says how many. */
  private counted(menu: TableMenu): TableMenu {
    const count = this.selection.filter((id) => this.rows.has(id)).length;
    return menu.map((group) => group.map((entry) => (entry.plural && count > 1 ? { ...entry, label: entry.plural.replace('{count}', String(count)) } : entry)));
  }

  /** An entry of a menu chosen: renamed in place, a panel opened, or its request made. */
  private chosen(entry: TableEntry): void {
    if (entry.inPlace && entry.request && this.menuAt?.isConnected) this.rename(this.menuAt, entry.request);
    else if (entry.opens) this.openPanel(entry.opens);
    else if (entry.request) this.make(entry.request);
  }

  /** Opens an editor of the settings control, or a column's options, in place of the one that was open. */
  private openPanel(panel: TablePanel): void {
    this.panel = panel;
    this.render();
    this.panels.element.querySelector<HTMLElement>('select, input, button:not(.adp-table-panel-close)')?.focus();
  }

  /**
   * Makes a gesture's request: the rows selected put in for `$selection`, and the required
   * parameters of its operation that it does not give asked first. Of several steps, the first
   * operation's are asked.
   */
  private make(given: TableRequest, name?: string, typed?: string | number | boolean, row?: string): void {
    // What was typed or picked goes in the place the request leaves for it, and the row it is for in the row's.
    const request = filled(given, typed, row);
    const rows = this.selection.filter((id) => this.rows.has(id));
    const put = (given: TableRequest): TableRequest => (given.kind === 'operation' ? { ...given, on: (given.on ?? []).flatMap((id) => (id === SELECTION ? rows : [id])), ...(name === undefined ? {} : { args: { name, ...given.args } }) } : given);
    const resolved: TableRequest = request.kind === 'steps' ? { ...request, steps: request.steps.map((step, index) => (index === 0 ? put(step) : step)) } : put(request);
    const first = resolved.kind === 'steps' ? resolved.steps[0] : resolved;
    const operation = first?.kind === 'operation' ? this.view?.operations[first.operation] : undefined;
    const fixed: Record<string, TableValue> = first?.kind === 'operation' ? { ...first.args } : {};
    const missing = operation?.params.some((param) => param.required && param.value === undefined && !(param.name in fixed)) === true;
    if (!operation || !missing || first?.kind !== 'operation') {
      this.request(resolved);
      return;
    }
    // What is given keeps its value; the rest are asked, each starting at its default.
    this.ask(operation, first.on ?? [], fixed, (args) => {
      const step: TableRequest = { ...first, args };
      return resolved.kind === 'steps' ? { ...resolved, steps: [step, ...resolved.steps.slice(1)] } : step;
    });
  }

  /** The panel of a new property: its name first, then its type, as the standalone host asks them. */
  private newProperty(anchor: HTMLElement, types: readonly TableEntry[]): void {
    this.form?.remove();
    const input = html('input', { class: 'adp-table-property-name', type: 'text', 'aria-label': 'Property name', placeholder: 'Property name' });
    const list = html('div', { class: 'adp-table-types', role: 'group', 'aria-label': 'Type' }, ...types.map((type) => {
      const button = html('button', { type: 'button', 'data-entry': type.id, title: type.disabled ?? '' }, icon(type.icon === undefined ? undefined : `mdi-${type.icon}`), type.label);
      if (type.disabled !== undefined) button.setAttribute('aria-disabled', 'true');
      return button;
    }));
    const form = html('form', { class: 'adp-table-params adp-table-new-panel', role: 'dialog', 'aria-label': 'New property' }, input, list);
    const close = (): void => {
      form.remove();
      this.form = undefined;
      anchor.focus();
    };
    const create = (type: TableEntry): void => {
      if (type.disabled !== undefined || !type.request) return;
      const name = input.value.trim();
      close();
      this.make(type.request, name === '' ? type.label : name);
    };
    list.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-entry]');
      const type = types.find((candidate) => candidate.id === button?.dataset.entry);
      if (type) create(type);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      // Enter makes a property of the first type, as a click on it would.
      const type = types.find((candidate) => candidate.disabled === undefined);
      if (type) create(type);
    });
    form.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') close();
    });
    const box = anchor.getBoundingClientRect();
    const frame = this.root.getBoundingClientRect();
    form.style.left = `${Math.max(0, box.right - frame.left - 240)}px`;
    form.style.top = `${box.bottom - frame.top}px`;
    this.form = form;
    this.root.append(form);
    input.focus();
  }

  // Moving by dragging, and by the keyboard one place at a time.

  /** A press that may become a drag: of a view's tab, a column's header or its border, or a row's handle. */
  private drag(event: MouseEvent): void {
    const moves = this.gestures?.moves;
    const target = event.target as HTMLElement;
    if (!this.gestures || event.button !== 0 || target.closest('input, .adp-table-renaming')) return;
    const resizer = target.closest<HTMLElement>('.adp-table-resizer');
    const tab = target.closest<HTMLElement>('.adp-table-tab');
    const header = target.closest<HTMLElement>('[role="columnheader"][data-id]');
    const handle = target.closest<HTMLElement>('.adp-table-handle');
    if (resizer && header) {
      event.preventDefault();
      this.resize(event, header);
    } else if (tab && moves?.views) {
      // Prevented, or the browser selects text and scrolls the table while the pointer moves.
      event.preventDefault();
      const tabs = [...this.tabs.querySelectorAll<HTMLElement>('.adp-table-tab')];
      const index = tabs.indexOf(tab);
      reorder(event, tabs, index, 'x', (to) => this.moved(moves.views?.[tab.dataset.id ?? ''], afterOf(tabs.map((each) => each.dataset.id ?? ''), index, to)));
    } else if (header && moves?.columns) {
      event.preventDefault();
      const headers = [...this.grid.querySelectorAll<HTMLElement>('thead [role="columnheader"][data-id]')];
      const index = headers.indexOf(header);
      reorder(event, headers, index, 'x', (to) => this.moved(moves.columns?.[header.dataset.id ?? ''], afterOf(headers.map((each) => each.dataset.id ?? ''), index, to)));
    } else if (handle && moves?.rows) {
      const line = handle.closest<HTMLElement>('tr.adp-table-row');
      const lines = [...this.grid.querySelectorAll<HTMLElement>('tbody tr.adp-table-row')];
      const index = line ? lines.indexOf(line) : -1;
      event.preventDefault();
      reorder(event, lines, index, 'y', (to) => {
        const after = afterOf(lines.map((each) => each.dataset.id ?? ''), index, to);
        if (after !== undefined && line?.dataset.id) this.moveRows(line.dataset.id, after, true);
      });
    }
  }

  /** The request of one of several that lands after another, `''` for the first place. */
  private moved(moves: Readonly<Record<string, TableRequest>> | undefined, after: string | undefined): void {
    const request = after === undefined ? undefined : moves?.[after];
    if (request) this.make(request);
  }

  /**
   * Moves a row after another, `''` for the first place, as one edit. A row dragged among the rows
   * selected takes them along, in their order, each after the one before, as the standalone host
   * does; a row let go among them moves nothing.
   */
  private moveRows(row: string, after: string, withSelection: boolean): void {
    const rows = this.gestures?.moves?.rows;
    if (!rows) return;
    const chosen = this.selection.filter((id) => this.rows.has(id));
    const sight = [...new Set(this.lines().flatMap((line) => (line.classList.contains('adp-table-row') ? line.dataset.id ?? [] : [])))];
    const moved = withSelection && chosen.includes(row) ? sight.filter((id) => chosen.includes(id)) : [row];
    if (moved.includes(after)) return;
    const steps = moved.map((id, index) => (index > 0 ? filled(rows.after, moved[index - 1], id) : after === '' ? filled(rows.first, undefined, id) : filled(rows.after, after, id)));
    this.make(steps.length === 1 ? steps[0] : { kind: 'steps', steps });
  }

  /** A column's border dragged: the column follows the pointer, never narrower than the minimum, and one width is written when it is let go. */
  private resize(start: MouseEvent, header: HTMLElement): void {
    const id = header.dataset.id ?? '';
    const request = this.gestures?.widths?.[id];
    if (!request) return;
    const grabbed = this.view?.properties.find((property) => property.id === id)?.width ?? defaultWidth;
    const table = Number.parseFloat(this.grid.style.width) || 0;
    const widthAt = (dx: number): number => Math.max(minimumWidth, Math.round(grabbed + dx));
    header.classList.add('adp-table-resizing');
    follow(start, (dx) => {
      const width = widthAt(dx);
      header.style.width = `${width}px`;
      this.grid.style.width = `${table + width - grabbed}px`;
    }, (dx, _dy, dragged) => {
      header.classList.remove('adp-table-resizing');
      const width = widthAt(dx);
      if (dragged && width !== grabbed) this.make(request, undefined, width);
    });
  }

  /** Alt with an arrow on a tab, a header or a row: the keyboard's way to what dragging does. */
  private moveByKey(target: HTMLElement, event: KeyboardEvent): boolean {
    const gestures = this.gestures!;
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (step === undefined) return false;
    const across = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    const tab = target.closest<HTMLElement>('[role="tab"]');
    const header = this.grid.contains(target) ? target.closest<HTMLElement>('[role="columnheader"][data-id]') : null;
    const line = this.grid.contains(target) ? target.closest<HTMLElement>('tr.adp-table-row') : null;
    if (tab && across && gestures.moves?.views) {
      const ids = [...this.tabs.querySelectorAll<HTMLElement>('[role="tab"]')].map((each) => each.dataset.view ?? '');
      const id = tab.dataset.view ?? '';
      this.moved(gestures.moves.views[id], stepped(ids, ids.indexOf(id), step));
      return true;
    }
    if (header && across && event.shiftKey && gestures.widths?.[header.dataset.id ?? '']) {
      const id = header.dataset.id ?? '';
      const width = this.view?.properties.find((property) => property.id === id)?.width ?? defaultWidth;
      const next = Math.max(minimumWidth, width + step * widthStep);
      if (next !== width) this.make(gestures.widths[id], undefined, next);
      return true;
    }
    if (header && across && gestures.moves?.columns) {
      const ids = [...this.grid.querySelectorAll<HTMLElement>('thead [role="columnheader"][data-id]')].map((each) => each.dataset.id ?? '');
      const id = header.dataset.id ?? '';
      this.moved(gestures.moves.columns[id], stepped(ids, ids.indexOf(id), step));
      return true;
    }
    if (line?.dataset.id && !across && gestures.moves?.rows) {
      const ids = [...new Set(this.lines().flatMap((each) => (each.classList.contains('adp-table-row') ? each.dataset.id ?? [] : [])))];
      const after = stepped(ids, ids.indexOf(line.dataset.id), step);
      if (after !== undefined) this.moveRows(line.dataset.id, after, false);
      return true;
    }
    return false;
  }

  /**
   * A view's or a column's name typed in place of its name: Enter keeps it once the document has,
   * and a refusal is said at the field, which stays; Escape, an empty name or the same name keep the
   * old one; leaving the field keeps what was typed.
   */
  private rename(anchor: HTMLElement, request: TableRequest): void {
    const tab = anchor.matches('[role="tab"]');
    const name = tab ? anchor : anchor.querySelector<HTMLElement>('.adp-table-name');
    const place = tab ? anchor.parentElement : anchor;
    if (!name || !place) return;
    const before = name.textContent ?? '';
    const input = html('input', { class: 'adp-table-editor adp-table-rename', type: 'text', 'aria-label': `Rename ${before}` });
    input.value = before;
    const error = html('span', { class: 'adp-table-rename-error', role: 'alert' });
    error.hidden = true;
    const box = html('span', { class: 'adp-table-renaming' }, input, error);
    const view = anchor.dataset.view;
    const column = anchor.dataset.id;
    const finish = (): void => {
      if (this.closeEditor !== close) return;
      this.closeEditor = undefined;
      this.renaming = undefined;
      box.remove();
      name.hidden = false;
      this.render();
      if (view !== undefined) [...this.tabs.querySelectorAll<HTMLElement>('[role="tab"]')].find((each) => each.dataset.view === view)?.focus();
      else if (column !== undefined) this.focus({ key: '', column });
    };
    const send = (wait: boolean): void => {
      const typed = input.value.trim();
      if (typed === '' || typed === before) {
        finish();
        return;
      }
      this.make(request, undefined, typed);
      if (!wait) {
        finish();
        return;
      }
      this.renaming = {
        seq: this.seq,
        refused: (sentence) => {
          error.textContent = sentence;
          error.hidden = sentence === '';
          input.setAttribute('aria-invalid', 'true');
          input.focus();
        },
        done: finish,
      };
    };
    const close = (commit: boolean): void => (commit ? send(false) : finish());
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        send(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish();
      }
    });
    input.addEventListener('input', () => {
      error.hidden = true;
      input.removeAttribute('aria-invalid');
    });
    input.addEventListener('blur', () => {
      if (this.renaming === undefined && this.closeEditor === close) send(false);
    });
    this.closeEditor = close;
    name.hidden = true;
    place.append(box);
    input.focus();
    input.select();
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
    const here = placeOf(cell);
    const gestures = this.gestures;
    this.list = openCellList(this.root, cell, property, {
      held: () => this.rows.get(row.id)?.cells[property.id],
      searchable: gestures !== undefined,
      creates: gestures?.createOption?.[property.id] !== undefined,
      choose: (value, present) => this.request(present === undefined
        ? { kind: 'cell', row: row.id, property: property.id, value: value === '' ? null : value }
        : { kind: 'item', row: row.id, property: property.id, value, present }),
      create: (name) => this.make(gestures!.createOption![property.id], undefined, name, row.id),
      closed: (refocus) => {
        this.list = undefined;
        if (refocus) this.focus(here);
      },
    });
  }
}
