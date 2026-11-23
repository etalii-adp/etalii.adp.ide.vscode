import type { FromCanvas, ToCanvas } from '../../../core/frame/protocol';
import type { SectionsFieldView, SectionsOperation, SectionsPartView, SectionsRequest, SectionsRow, SectionsTimeStrip, SectionsView } from '../../../core/tool/sectionsView';
import { html } from '../../diagram/dom';

// The page of a designer of the `sections` kind (DESL 7.8): one titled part below another, a record
// as a form of its fields, a list as its rows under their groups, with the time strip above them,
// the figures beside a part's title and the marks of a row as badges. The page never changes the
// document itself: a gesture sends a request, and the view that follows is drawn.

/** The editor a field is drawn with on the page. */
const inputTypes: Readonly<Record<string, string>> = { number: 'number', date: 'date', time: 'time' };

export class Sections {
  private readonly root = html('main', { class: 'adp-sections', 'aria-label': 'Page' });
  private readonly notice = html('p', { class: 'adp-sections-notice', role: 'note' });
  private readonly status = html('p', { class: 'adp-sections-status', role: 'status', 'aria-live': 'polite' });
  private readonly content = html('div', { class: 'adp-sections-content' });
  private view: SectionsView | undefined;
  private version = 0;
  private seq = 0;
  private selected: string | undefined;
  /** A row a reveal named before the view that holds it was drawn. */
  private revealing: string | undefined;

  constructor(host: HTMLElement, private readonly send: (message: FromCanvas) => void) {
    this.root.append(this.notice, this.status, this.content);
    host.append(this.root);
    this.root.addEventListener('click', (event) => this.clicked(event));
    this.root.addEventListener('change', (event) => this.changed(event.target));
    this.root.addEventListener('keydown', (event) => this.key(event));
  }

  receive(message: ToCanvas): void {
    if (message.type === 'view' && message.kind === 'designer') {
      this.view = message.view as SectionsView;
      this.version = message.version;
      this.render();
      if (this.revealing !== undefined) this.reveal(this.revealing);
    } else if (message.type === 'outcome' && message.seq === this.seq) {
      this.status.textContent = message.result === 'refused' ? message.sentence ?? '' : '';
      // A refusal is followed by no view: what a gesture changed on the page goes back to what the view says.
      if (message.result === 'refused') this.render();
    } else if (message.type === 'reveal') {
      this.reveal(message.id);
    }
  }

  // ---- drawing ----

  private render(): void {
    const view = this.view;
    if (!view) return;
    const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.adp-sections-row')?.dataset.id;
    this.notice.textContent = view.notice ?? '';
    this.notice.hidden = view.notice === undefined;
    this.content.replaceChildren(...view.parts.map((part) => this.partOf(part, view.readOnly)));
    this.highlight();
    this.rove();
    if (focused !== undefined) this.rowOf(focused)?.focus();
  }

  /** One row is reached by Tab: the selected one, else the first. */
  private rove(): void {
    const rows = this.rows();
    const reached = rows.find((row) => row.dataset.id === this.selected) ?? rows[0];
    for (const row of rows) row.tabIndex = row === reached ? 0 : -1;
  }

  private partOf(part: SectionsPartView, readOnly: boolean): HTMLElement {
    const heading = `adp-sections-title-${part.id}`;
    const header = html('header', { class: 'adp-sections-header' },
      html('h2', { id: heading }, part.title),
      part.figures.length === 0 ? undefined : html('dl', { class: 'adp-sections-figures' }, ...part.figures.map((figure) => html('div', { class: 'adp-sections-figure', 'data-absent': figure.absent ? 'true' : undefined },
        html('dt', {}, figure.label), html('dd', {}, figure.text)))),
      part.add && !readOnly ? this.operationButton(part.add, [], 'adp-sections-add') : undefined);
    const section = html('section', { class: 'adp-sections-part', 'data-part': part.id, 'data-kind': part.kind, role: 'region', 'aria-labelledby': heading }, header);
    if (part.record) {
      section.append(html('div', { class: 'adp-sections-record', 'data-id': part.record.id }, ...part.fields.map((field) => this.fieldOf(field, part.record!, readOnly))));
      return section;
    }
    if (part.timeStrip && part.timeStrip.marks.length > 0) section.append(this.stripOf(part.timeStrip, part));
    const groups = part.groups ?? [];
    const rows = groups.flatMap((group) => group.rows);
    if (rows.length === 0) {
      section.append(html('p', { class: 'adp-sections-empty' }, part.add && !readOnly ? `Nothing here yet. Use ${part.add.label} to add one.` : 'Nothing here yet.'));
      return section;
    }
    for (const group of groups) {
      const list = html('div', { class: 'adp-sections-rows', role: 'listbox', 'aria-label': group.key === undefined ? part.title : `${part.title}: ${group.key}` }, ...group.rows.map((row) => this.rowView(part, row, readOnly)));
      if (group.key === undefined) section.append(list);
      else section.append(html('div', { class: 'adp-sections-group' }, html('h3', { class: 'adp-sections-group-heading' }, `${group.key} (${group.count})`), list));
    }
    return section;
  }

  private rowView(part: SectionsPartView, row: SectionsRow, readOnly: boolean): HTMLElement {
    const marks = row.marks.map((mark) => mark.label);
    const findings = row.findings.map((finding) => finding.message);
    const described = [...marks, ...findings].join('. ');
    const element = html('div', {
      class: 'adp-sections-row', role: 'option', tabindex: row.id === this.selected ? '0' : '-1', 'data-id': row.id, 'aria-selected': String(row.id === this.selected),
      'aria-label': `${row.id} ${part.fields.map((field) => row.values[field.attribute]).find((value) => value !== undefined && value !== '' && !/^\d{4}-/.test(value) && value !== 'true' && value !== 'false') ?? ''}`.trim(),
      'aria-description': described === '' ? undefined : described,
    },
    html('div', { class: 'adp-sections-row-head' },
      html('span', { class: 'adp-sections-id' }, row.id),
      ...row.marks.map((mark) => html('span', { class: 'adp-sections-badge', 'data-style': mark.style }, mark.label)),
      ...row.findings.map((finding) => html('span', { class: 'adp-sections-finding', 'data-severity': finding.severity, title: finding.message }, finding.severity === 'error' ? 'Error' : finding.severity === 'warning' ? 'Warning' : 'Note')),
      ...(readOnly ? [] : row.operations.map((operation) => this.operationButton(operation, [row.id], 'adp-sections-operation')))),
    html('div', { class: 'adp-sections-fields' }, ...part.fields.map((field) => this.fieldOf(field, row, readOnly))));
    return element;
  }

  /** A field as a label and the editor of its widget, holding the row's value. */
  private fieldOf(field: SectionsFieldView, row: SectionsRow, readOnly: boolean): HTMLElement {
    const value = row.values[field.attribute] ?? '';
    const common = { 'data-field': field.attribute, 'data-row': row.id, 'aria-label': field.label };
    let control: HTMLElement;
    if (field.widget === 'checkbox') {
      const box = html('input', { ...common, type: 'checkbox' });
      box.checked = value === 'true';
      box.disabled = readOnly;
      control = box;
    } else if (field.widget === 'choice' && !field.many) {
      const select = html('select', common, html('option', { value: '' }, ''), ...(field.options ?? []).map((option) => html('option', { value: option }, option)));
      select.value = value;
      select.disabled = readOnly;
      control = select;
    } else if (field.widget === 'text' && !field.many && field.attribute !== '' && (value.includes('\n') || value.length > 80)) {
      const area = html('textarea', { ...common, rows: String(Math.min(6, value.split('\n').length + 1)) });
      area.value = value;
      area.readOnly = readOnly;
      control = area;
    } else {
      const input = html('input', { ...common, type: inputTypes[field.widget] ?? 'text', placeholder: field.widget === 'dateTime' ? '2026-11-03T10:12+01:00' : undefined });
      input.value = value;
      input.readOnly = readOnly;
      control = input;
    }
    return html('label', { class: 'adp-sections-field', 'data-widget': field.widget }, html('span', { class: 'adp-sections-label' }, field.label), control);
  }

  private operationButton(operation: SectionsOperation, on: readonly string[], kind: string): HTMLButtonElement {
    const button = html('button', { class: kind, type: 'button', 'data-operation': operation.operation, 'data-on': on.join(' '), title: operation.reason }, operation.label);
    button.disabled = !operation.enabled;
    return button;
  }

  private stripOf(strip: SectionsTimeStrip, part: SectionsPartView): HTMLElement {
    const band = html('div', { class: 'adp-sections-strip', role: 'group', 'aria-label': `${part.title}: from ${strip.from} to ${strip.to}` },
      html('span', { class: 'adp-sections-strip-from' }, strip.from), html('span', { class: 'adp-sections-strip-to' }, strip.to));
    const axis = html('div', { class: 'adp-sections-strip-axis' });
    for (const mark of strip.marks) {
      const button = html('button', {
        class: `adp-sections-strip-mark${mark.emphasised ? ' adp-sections-strip-emphasised' : ''}`, type: 'button', 'data-row': mark.row,
        'aria-label': `${mark.label === undefined ? '' : `${mark.label}, `}${mark.at}, ${mark.row}`, title: `${mark.label === undefined ? '' : `${mark.label}: `}${mark.at}`,
      }, mark.label === undefined ? undefined : html('span', { class: 'adp-sections-strip-label' }, mark.label));
      button.style.left = `${mark.offset * 100}%`;
      axis.append(button);
    }
    band.append(axis);
    if (strip.untimed.length > 0) band.append(html('p', { class: 'adp-sections-untimed' }, `No time: ${strip.untimed.join(', ')}`));
    return band;
  }

  // ---- selection ----

  private rows(): HTMLElement[] {
    return [...this.content.querySelectorAll<HTMLElement>('.adp-sections-row')];
  }

  private rowOf(id: string): HTMLElement | undefined {
    return this.rows().find((row) => row.dataset.id === id);
  }

  private select(id: string | undefined): void {
    if (id === this.selected) return;
    this.selected = id;
    for (const row of this.rows()) row.setAttribute('aria-selected', String(row.dataset.id === id));
    this.highlight();
    this.rove();
    this.send({ v: 2, type: 'selection', ids: id === undefined ? [] : [id] });
  }

  /** The rows the selected one mentions and those that mention it (DESL 7.8.2). */
  private highlight(): void {
    const related = new Set(this.view?.parts.flatMap((part) => (part.groups ?? []).flatMap((group) => group.rows).concat(part.record ? [part.record] : [])).find((row) => row.id === this.selected && row.id !== '')?.related ?? []);
    for (const row of this.rows()) row.classList.toggle('adp-sections-related', related.has(row.dataset.id ?? ''));
  }

  private reveal(id: string): void {
    const row = this.rowOf(id);
    if (!row) {
      this.revealing = id;
      return;
    }
    this.revealing = undefined;
    this.select(id);
    row.focus();
    row.scrollIntoView?.({ block: 'nearest' });
  }

  // ---- gestures ----

  private request(request: SectionsRequest): void {
    this.seq += 1;
    this.status.textContent = '';
    this.send({ v: 2, type: 'edit', seq: this.seq, request, version: this.version });
  }

  private clicked(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const mark = target.closest<HTMLElement>('.adp-sections-strip-mark');
    if (mark) {
      this.select(mark.dataset.row);
      return;
    }
    const button = target.closest<HTMLButtonElement>('button[data-operation]');
    if (button && !button.disabled) {
      const on = button.dataset.on === '' || button.dataset.on === undefined ? [] : button.dataset.on.split(' ');
      const operation = this.operation(button.dataset.operation!, on);
      if (operation?.params && operation.params.length > 0) this.ask(button, operation, on);
      else this.request({ kind: 'operation', operation: button.dataset.operation!, ...(on.length === 0 ? {} : { on }) });
      return;
    }
    const row = target.closest<HTMLElement>('.adp-sections-row');
    if (row) this.select(row.dataset.id);
  }

  private operation(id: string, on: readonly string[]): SectionsOperation | undefined {
    for (const part of this.view?.parts ?? []) {
      if (on.length === 0 && part.add?.operation === id) return part.add;
      for (const row of (part.groups ?? []).flatMap((group) => group.rows)) if (row.id === on[0]) return row.operations.find((operation) => operation.operation === id);
    }
    return undefined;
  }

  /** A small form after the button, for what an operation needs before it runs. */
  private ask(button: HTMLElement, operation: SectionsOperation, on: readonly string[]): void {
    button.parentElement?.querySelector('.adp-sections-ask')?.remove();
    const inputs = (operation.params ?? []).map((param) => html('input', { type: 'text', name: param.name, 'aria-label': param.label, placeholder: param.label, required: param.required ? 'required' : undefined }));
    const form = html('form', { class: 'adp-sections-ask', 'aria-label': operation.label }, ...inputs, html('button', { type: 'submit' }, operation.label), html('button', { type: 'button', class: 'adp-sections-ask-cancel' }, 'Cancel'));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const args = Object.fromEntries(inputs.map((input) => [input.name, input.value.trim()]).filter(([, value]) => value !== ''));
      form.remove();
      this.request({ kind: 'operation', operation: operation.operation, ...(on.length === 0 ? {} : { on }), args });
    });
    form.querySelector('.adp-sections-ask-cancel')!.addEventListener('click', () => form.remove());
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') form.remove();
    });
    button.after(form);
    inputs[0]?.focus();
  }

  private changed(target: EventTarget | null): void {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    const field = target.dataset.field;
    if (field === undefined || target.closest('.adp-sections-ask')) return;
    const value = target instanceof HTMLInputElement && target.type === 'checkbox' ? String(target.checked) : target.value;
    this.request({ kind: 'setField', id: target.dataset.row ?? '', field, value });
  }

  private key(event: KeyboardEvent): void {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.adp-sections-row');
    // Keys in a field are the field's own.
    if (!row || event.target !== row) return;
    const rows = this.rows();
    const at = rows.indexOf(row);
    const next = event.key === 'ArrowDown' ? rows[at + 1] : event.key === 'ArrowUp' ? rows[at - 1] : event.key === 'Home' ? rows[0] : event.key === 'End' ? rows.at(-1) : undefined;
    if (next) {
      event.preventDefault();
      next.focus();
      this.select(next.dataset.id);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      row.querySelector<HTMLElement>('input, select, textarea')?.focus();
    } else if (event.key === ' ') {
      event.preventDefault();
      this.select(row.dataset.id);
    }
  }
}
