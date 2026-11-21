import type { TableEntry, TableField, TableFilter, TableGestures, TablePanel, TableRequest } from '../../core/tool/tableView';
import { html } from '../diagram/dom';
import { icon } from '../diagram/icons';
import { tag } from './editors';

// The editors of the table surface's settings control (property visibility, filter, sort, group)
// and a column's options panel: one open at a time, under the bar, each drawn from what the tool
// type gives and making its requests. A value typed or picked goes in the place of `$typed`.

export type Make = (request: TableRequest, typed?: string | number) => void;

const titles: Readonly<Record<TablePanel['panel'], string>> = { visibility: 'Property visibility', filter: 'Filter', sort: 'Sort', group: 'Group', options: 'Options' };

/** A list of entries as a select: the checked one chosen, each disabled one with its reason. */
function choice(label: string, entries: readonly TableEntry[], make: Make, placeholder?: string): HTMLSelectElement {
  const select = html('select', { 'aria-label': label },
    placeholder === undefined ? undefined : html('option', { value: '' }, placeholder),
    ...entries.map((entry) => {
      const option = html('option', { value: entry.id, title: entry.disabled ?? '' }, entry.label);
      option.disabled = entry.disabled !== undefined;
      option.selected = entry.checked === true;
      return option;
    }));
  if (placeholder !== undefined && !entries.some((entry) => entry.checked)) select.value = '';
  select.addEventListener('change', () => {
    const entry = entries.find((candidate) => candidate.id === select.value);
    if (entry?.request) make(entry.request);
  });
  return select;
}

/** A button for an entry, disabled with its reason. */
function button(entry: TableEntry, make: Make, className: string): HTMLButtonElement {
  const element = html('button', { type: 'button', class: className, title: entry.disabled ?? '' }, entry.icon ? icon(`mdi-${entry.icon}`) : undefined, entry.label);
  if (entry.disabled !== undefined) element.setAttribute('aria-disabled', 'true');
  element.addEventListener('click', () => {
    if (entry.disabled === undefined && entry.request) make(entry.request);
  });
  return element;
}

const remover = (label: string, request: TableRequest | undefined, make: Make): HTMLButtonElement | undefined => {
  if (!request) return undefined;
  const element = html('button', { type: 'button', class: 'adp-table-panel-remove', 'aria-label': `Remove ${label}`, title: 'Remove' }, '×');
  element.addEventListener('click', () => make(request));
  return element;
};

/** The control of a value asked in place: it commits when it changes. */
function field(label: string, given: TableField, make: Make): HTMLElement | undefined {
  if (given.control === 'none' || !given.request) return undefined;
  const request = given.request;
  if (given.control === 'choice') {
    const select = html('select', { 'aria-label': label }, html('option', { value: '' }), ...(given.options ?? []).map((option) => html('option', { value: option.value }, option.label)));
    select.value = given.value;
    select.addEventListener('change', () => make(request, select.value));
    return select;
  }
  const input = html('input', { 'aria-label': label, type: given.control === 'dateTime' ? 'text' : given.control, value: given.value, placeholder: given.control === 'dateTime' ? 'YYYY-MM-DDThh:mm:ss+hh:mm' : 'Value' });
  input.value = given.value;
  input.addEventListener('change', () => {
    if (input.value !== given.value) make(request, given.control === 'number' && input.value !== '' ? Number(input.value) : input.value);
  });
  return input;
}

function filterOf(filter: TableFilter, make: Make, depth: number): HTMLElement {
  const count = filter.conditions.length + filter.groups.length;
  return html('div', { class: depth === 0 ? 'adp-table-filter' : 'adp-table-filter adp-table-filter-group', 'data-id': filter.id },
    count > 1 || depth > 0 ? html('div', { class: 'adp-table-panel-line' }, html('span', {}, 'Where'), choice('All or any', filter.match, make), html('span', {}, 'of these are true'), remover('filter group', filter.remove, make)) : undefined,
    ...filter.conditions.map((condition) => html('div', { class: 'adp-table-panel-line adp-table-condition', 'data-id': condition.id },
      choice('Property', condition.properties, make),
      choice('Comparison', condition.operators, make),
      field('Value', condition.value, make),
      remover('filter', condition.remove, make))),
    ...filter.groups.map((group) => filterOf(group, make, depth + 1)),
    html('div', { class: 'adp-table-panel-line' },
      choice('Add filter', filter.add, make, '+ Add filter'),
      filter.addGroup ? button(filter.addGroup, make, 'adp-table-panel-button') : undefined));
}

/** The body of one editor. */
function bodyOf(gestures: TableGestures, panel: TablePanel, make: Make): HTMLElement[] {
  const settings = gestures.settings;
  switch (panel.panel) {
    case 'visibility':
      return (settings?.visibility ?? []).map((entry) => {
        const box = html('input', { type: 'checkbox', 'aria-label': `Show ${entry.label}`, title: entry.disabled ?? '' });
        box.checked = entry.checked === true;
        box.disabled = entry.disabled !== undefined;
        box.addEventListener('change', () => entry.request && make(entry.request));
        return html('label', { class: 'adp-table-panel-line', 'data-id': entry.id }, entry.icon ? icon(`mdi-${entry.icon}`) : undefined, html('span', { class: 'adp-table-panel-grow' }, entry.label), box);
      });
    case 'filter':
      return settings ? [filterOf(settings.filter, make, 0)] : [];
    case 'sort':
      return settings ? [
        ...settings.sortLines.map((sort) => html('div', { class: 'adp-table-panel-line', 'data-id': sort.id },
          html('span', { class: 'adp-table-panel-grow' }, sort.label), choice('Direction', sort.direction, make), remover(`sort ${sort.label}`, sort.remove, make))),
        html('div', { class: 'adp-table-panel-line' }, choice('Add sort', settings.addSort, make, '+ Add sort')),
      ] : [];
    case 'group': {
      const group = settings?.group;
      if (!group) return [];
      return [
        html('div', { class: 'adp-table-panel-line' }, html('span', { class: 'adp-table-panel-grow' }, 'Group by'), choice('Group by', group.by, make)),
        ...(group.hideEmpty ? [(() => {
          const box = html('input', { type: 'checkbox', 'aria-label': group.hideEmpty.label });
          box.checked = group.hideEmpty.checked === true;
          box.addEventListener('change', () => group.hideEmpty?.request && make(group.hideEmpty.request));
          return html('label', { class: 'adp-table-panel-line' }, html('span', { class: 'adp-table-panel-grow' }, group.hideEmpty.label), box);
        })()] : []),
        ...(group.order ? [html('div', { class: 'adp-table-panel-line' }, html('span', { class: 'adp-table-panel-grow' }, 'Sort groups'), ...group.order.map((entry) => button(entry, make, 'adp-table-panel-button')))] : []),
        ...(group.groups ?? []).map((entry) => {
          const eye = html('button', { type: 'button', class: 'adp-table-eye', 'aria-pressed': String(entry.checked === true), 'aria-label': `${entry.checked ? 'Hide' : 'Show'} ${entry.label}` }, icon(entry.checked ? 'mdi-eye-outline' : 'mdi-eye-off-outline'));
          eye.addEventListener('click', () => entry.request && make(entry.request));
          return html('div', { class: 'adp-table-panel-line', 'data-id': entry.id }, html('span', { class: 'adp-table-panel-grow' }, entry.colour ? tag(entry.label, entry.colour) : entry.label), eye);
        }),
        ...(group.showAll ? [html('div', { class: 'adp-table-panel-line' }, button(group.showAll, make, 'adp-table-panel-button'))] : []),
      ];
    }
    case 'options': {
      const options = gestures.options?.[panel.property];
      if (!options) return [];
      const adding = html('input', { type: 'text', class: 'adp-table-panel-grow', 'aria-label': 'New option', placeholder: '+ New option' });
      adding.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || adding.value.trim() === '') return;
        event.preventDefault();
        make(options.add, adding.value.trim());
      });
      return [
        ...options.options.map((option) => {
          const name = html('input', { type: 'text', class: 'adp-table-panel-grow', 'aria-label': `Name of ${option.name}`, value: option.name });
          name.value = option.name;
          name.addEventListener('change', () => {
            if (name.value.trim() !== '' && name.value !== option.name) make(option.rename, name.value.trim());
          });
          return html('div', { class: 'adp-table-panel-line', 'data-id': option.id }, tag('', option.colour, { class: 'adp-table-tag adp-table-swatch' }), name, choice(`Colour of ${option.name}`, option.colours, make), remover(`option ${option.name}`, option.remove, make));
        }),
        html('div', { class: 'adp-table-panel-line' }, adding),
      ];
    }
  }
}

/** The editor that is open, drawn again only when what it shows changed, so that what is typed in it stays. */
export class Panels {
  readonly element = html('div', { class: 'adp-table-panel', role: 'region' });
  private drawn = '';

  constructor(private readonly make: Make, private readonly closed: () => void) {
    this.element.hidden = true;
  }

  draw(gestures: TableGestures | undefined, panel: TablePanel | undefined): void {
    if (!gestures || !panel) {
      this.element.hidden = true;
      this.element.replaceChildren();
      this.drawn = '';
      return;
    }
    const data = panel.panel === 'options' ? gestures.options?.[panel.property] : panel.panel === 'visibility' ? gestures.settings?.visibility : panel.panel === 'group' ? gestures.settings?.group : gestures.settings;
    const key = JSON.stringify([panel, data]);
    if (key === this.drawn && !this.element.hidden) return;
    this.drawn = key;
    const close = html('button', { type: 'button', class: 'adp-table-panel-close', 'aria-label': `Close ${titles[panel.panel]}` }, '×');
    close.addEventListener('click', () => this.closed());
    this.element.setAttribute('aria-label', titles[panel.panel]);
    this.element.dataset.panel = panel.panel;
    this.element.replaceChildren(html('div', { class: 'adp-table-panel-head' }, html('span', { class: 'adp-table-panel-grow' }, titles[panel.panel]), close), ...bodyOf(gestures, panel, this.make));
    this.element.hidden = false;
  }
}
