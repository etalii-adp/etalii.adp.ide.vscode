import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FromCanvas, ToCanvas } from '../../../src/core/frame/protocol';
import { plugins } from '../../../src/core/plugins/index';
import type { SectionsRequest, SectionsView } from '../../../src/core/tool/sectionsView';
import { Sections } from '../../../src/webview/designer/sections/page';
import { definitionOf, designerOf } from '../../core/tool/support';

// The page of sections in a simulated browser (etalii.adp spec 090, task T018): the post-incident
// review's view as the extension sends it, drawn, read by a screen reader's names, selected with
// the pointer and the keyboard, and the requests its gestures send. There is no layout here, so
// nothing asks where a part is drawn.

const type = designerOf(definitionOf('post-incident-review'), plugins);
const text = readFileSync('examples/post-incident-review/certificate-expiry.md', 'utf8');
const reviewView = (): SectionsView => type.view({ fileName: 'certificate-expiry.md', text }, {}) as unknown as SectionsView;

let sent: FromCanvas[];
let page: Sections;
const show = (view: SectionsView = reviewView(), version = 1): void => page.receive({ v: 2, type: 'view', origin: 'etalii/post-incident-review', kind: 'designer', view, actions: [], version } satisfies ToCanvas);
const requests = (): SectionsRequest[] => sent.filter((message) => message.type === 'edit').map((message) => (message as Extract<FromCanvas, { type: 'edit' }>).request as SectionsRequest);
const row = (id: string): HTMLElement => document.querySelector<HTMLElement>(`.adp-sections-row[data-id="${id}"]`)!;
const part = (id: string): HTMLElement => document.querySelector<HTMLElement>(`.adp-sections-part[data-part="${id}"]`)!;
const key = (target: Element, name: string, more: KeyboardEventInit = {}): void => void target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...more }));

beforeEach(() => {
  document.body.replaceChildren();
  sent = [];
  page = new Sections(document.body, (message) => sent.push(message));
  show();
});

describe('the page of sections', () => {
  it('draws its parts in order, each a region named by its title', () => {
    const regions = [...document.querySelectorAll<HTMLElement>('.adp-sections-part')];
    expect(regions.map((region) => region.getAttribute('role'))).toEqual(Array(6).fill('region'));
    expect(regions.map((region) => document.getElementById(region.getAttribute('aria-labelledby')!)?.textContent)).toEqual(['Summary', 'Impact', 'Timeline', 'Contributing factors', 'Actions', 'Categories']);
  });

  it('shows a record\'s fields and the figures beside its title', () => {
    const summary = part('summary');
    expect([...summary.querySelectorAll('.adp-sections-figure')].map((figure) => figure.textContent)).toEqual(['Time to detect47m', 'Time to engage8m', 'Time to mitigate51m', 'Time to resolve3h']);
    const zone = summary.querySelector<HTMLInputElement>('input[data-field="timeZone"]')!;
    expect(zone.value).toBe('UTC');
    expect(zone.getAttribute('aria-label')).toBe('Time zone');
  });

  it('lists the rows of a list in the view\'s order, under their groups with their counts', () => {
    expect([...part('timeline').querySelectorAll<HTMLElement>('.adp-sections-row')].map((shown) => shown.dataset.id)).toEqual(['E-0001', 'E-0002', 'E-0009', 'E-0003', 'E-0004', 'E-0005', 'E-0006', 'E-0007', 'E-0008']);
    expect([...part('factors').querySelectorAll('.adp-sections-group-heading')].map((heading) => heading.textContent)).toEqual(['change (1)', 'detection (2)', 'people (2)']);
  });

  it('draws the marks of a row as badges, a warning apart from an info', () => {
    const badges = [...row('F-0004').querySelectorAll<HTMLElement>('.adp-sections-badge')];
    expect(badges.map((badge) => `${badge.textContent} ${badge.dataset.style}`)).toEqual(['Unaddressed warning']);
    expect(row('F-0004').getAttribute('aria-description')).toContain('Unaddressed');
  });

  it('stands the timeline\'s entries on its time strip, the milestones labelled, and selects a row from its mark', () => {
    const marks = [...part('timeline').querySelectorAll<HTMLButtonElement>('.adp-sections-strip-mark')];
    expect(marks).toHaveLength(9);
    const detection = marks.find((mark) => mark.dataset.row === 'E-0003')!;
    expect(detection.classList.contains('adp-sections-strip-emphasised')).toBe(true);
    expect(detection.getAttribute('aria-label')).toContain('Detection');
    expect(detection.style.left).toBe(`${(47 / 180) * 100}%`);
    detection.click();
    expect(sent.at(-1)).toEqual({ v: 2, type: 'selection', ids: ['E-0003'] });
  });

  it('selects a row by the pointer, and highlights what it mentions and what mentions it', () => {
    row('F-0002').click();
    expect(sent.at(-1)).toEqual({ v: 2, type: 'selection', ids: ['F-0002'] });
    expect(row('F-0002').getAttribute('aria-selected')).toBe('true');
    expect([...document.querySelectorAll<HTMLElement>('.adp-sections-related')].map((shown) => shown.dataset.id).sort()).toEqual(['A-0002', 'E-0001', 'E-0003']);
  });

  it('moves the selection between rows by the arrow keys, across the parts', () => {
    row('E-0008').focus();
    row('E-0008').click();
    key(row('E-0008'), 'ArrowDown');
    expect(document.activeElement).toBe(row('F-0001'));
    expect(sent.at(-1)).toEqual({ v: 2, type: 'selection', ids: ['F-0001'] });
    key(row('F-0001'), 'ArrowUp');
    expect(document.activeElement).toBe(row('E-0008'));
  });

  it('runs a row\'s operation from its button, and shows why one cannot run', () => {
    const buttons = [...row('F-0005').querySelectorAll<HTMLButtonElement>('.adp-sections-operation')];
    expect(buttons.map((button) => `${button.textContent} ${button.disabled ? 'disabled' : 'enabled'}`)).toEqual(['Accept enabled', 'Reject disabled', 'New action for this factor enabled']);
    expect(buttons[1].title).toBe('This factor is rejected.');
    buttons[0].click();
    expect(requests()).toEqual([{ kind: 'operation', operation: 'acceptFactor', on: ['F-0005'] }]);
    expect(sent.at(-1)).toMatchObject({ type: 'edit', version: 1 });
  });

  it('adds by a part\'s add button, and asks first what an operation needs', () => {
    part('timeline').querySelector<HTMLButtonElement>('.adp-sections-add')!.click();
    expect(requests().at(-1)).toEqual({ kind: 'operation', operation: 'addEntry' });
    part('categories').querySelector<HTMLButtonElement>('.adp-sections-add')!.click();
    const name = part('categories').querySelector<HTMLInputElement>('.adp-sections-ask input')!;
    expect(name.getAttribute('aria-label')).toBe('Name');
    expect(document.activeElement).toBe(name);
    name.value = 'tooling';
    name.form!.requestSubmit();
    expect(requests().at(-1)).toEqual({ kind: 'operation', operation: 'addCategory', args: { name: 'tooling' } });
  });

  it('gives a field its value when it is changed, and a checkbox at once', () => {
    const zone = part('summary').querySelector<HTMLInputElement>('input[data-field="timeZone"]')!;
    zone.value = 'Europe/Amsterdam';
    zone.dispatchEvent(new Event('change', { bubbles: true }));
    expect(requests().at(-1)).toEqual({ kind: 'setField', id: '', field: 'timeZone', value: 'Europe/Amsterdam' });
    const done = row('A-0002').querySelector<HTMLInputElement>('input[type="checkbox"][data-field="done"]')!;
    expect(done.checked).toBe(false);
    done.click();
    expect(requests().at(-1)).toEqual({ kind: 'setField', id: 'A-0002', field: 'done', value: 'true' });
  });

  it('says why an edit was refused, and draws the view again', () => {
    const zone = part('summary').querySelector<HTMLInputElement>('input[data-field="timeZone"]')!;
    zone.value = 'Europe/Amsterdam';
    zone.dispatchEvent(new Event('change', { bubbles: true }));
    const { seq } = sent.at(-1) as Extract<FromCanvas, { type: 'edit' }>;
    page.receive({ v: 2, type: 'outcome', seq, result: 'refused', sentence: 'Time zone does not have the form it must have.' });
    const status = document.querySelector<HTMLElement>('[role="status"]')!;
    expect(status.textContent).toBe('Time zone does not have the form it must have.');
    expect(part('summary').querySelector<HTMLInputElement>('input[data-field="timeZone"]')!.value).toBe('UTC');
  });

  it('selects the row a reveal names, once it is drawn', () => {
    page.receive({ v: 2, type: 'reveal', id: 'A-0003' });
    expect(row('A-0003').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(row('A-0003'));
  });

  it('selects a row a reveal named before the view that holds it arrived', () => {
    document.body.replaceChildren();
    page = new Sections(document.body, (message) => sent.push(message));
    page.receive({ v: 2, type: 'reveal', id: 'F-0003' });
    show();
    expect(row('F-0003').getAttribute('aria-selected')).toBe('true');
  });

  it('is reached by Tab at one row, the selected one', () => {
    expect([...document.querySelectorAll<HTMLElement>('.adp-sections-row')].filter((shown) => shown.tabIndex === 0).map((shown) => shown.dataset.id)).toEqual(['E-0001']);
    row('A-0001').click();
    expect([...document.querySelectorAll<HTMLElement>('.adp-sections-row')].filter((shown) => shown.tabIndex === 0).map((shown) => shown.dataset.id)).toEqual(['A-0001']);
  });

  it('shows a document it cannot change with its notice, and offers no gesture', () => {
    show({ ...reviewView(), readOnly: true, notice: 'This file is read-only.' });
    expect(document.querySelector('.adp-sections-notice')!.textContent).toBe('This file is read-only.');
    expect(document.querySelectorAll('.adp-sections-add, .adp-sections-operation')).toHaveLength(0);
    expect(part('summary').querySelector<HTMLInputElement>('input[data-field="timeZone"]')!.readOnly).toBe(true);
  });

  it('says what an empty list holds and how to add to it', () => {
    const view = reviewView();
    show({ ...view, parts: view.parts.map((shown) => (shown.id === 'actions' ? { ...shown, groups: [{ count: 0, rows: [] }] } : shown)) });
    expect(part('actions').querySelector('.adp-sections-empty')!.textContent).toBe('Nothing here yet. Use New action to add one.');
  });
});
