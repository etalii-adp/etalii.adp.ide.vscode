import { readFileSync } from 'node:fs';
import type { FromCanvas, ToCanvas } from '../../../src/core/frame/protocol';
import type { Source, ViewOptions } from '../../../src/core/frame/toolType';
import type { HierarchyRequest, HierarchyView } from '../../../src/core/tool/hierarchyView';
import { HierarchyPage } from '../../../src/webview/hierarchy/page';
import { definitionOf, hierarchyDesignerOf } from '../../core/tool/support';

// What the tests of the page of boxes share: the Hierarchical Requirement Designer read from its
// definition, its web-shop example as the extension opens it, and a page in a simulated browser
// that records what it sends. There is no layout in a simulated browser: what a test needs of one,
// such as the box under the pointer, it gives itself.

export const type = hierarchyDesignerOf(definitionOf('hierarchical-requirement'));
export const source: Source = {
  fileName: 'C:/work/web-shop.md',
  text: readFileSync('examples/hierarchical-requirement/web-shop.md', 'utf8'),
  registration: readFileSync('examples/hierarchical-requirement/web-shop.adp', 'utf8'),
};

export interface Harness {
  readonly page: HierarchyPage;
  readonly sent: FromCanvas[];
}

/** A page on an empty body, recording what it sends. */
export function harness(): Harness {
  document.body.replaceChildren();
  const sent: FromCanvas[] = [];
  return { page: new HierarchyPage(document.body, (message) => sent.push(message)), sent };
}

export const viewOf = (options: ViewOptions = {}, from: Source = source): HierarchyView => type.view(from, options);

export const show = (page: HierarchyPage, view: HierarchyView, version = 1): void =>
  page.receive({ v: 2, type: 'view', origin: type.origin, kind: 'designer', view, actions: [], version } satisfies ToCanvas);

export const requests = (sent: readonly FromCanvas[]): HierarchyRequest[] =>
  sent.filter((message) => message.type === 'edit').map((message) => (message as Extract<FromCanvas, { type: 'edit' }>).request as HierarchyRequest);

export const options = (sent: readonly FromCanvas[]): ViewOptions[] =>
  sent.filter((message) => message.type === 'viewOptions').map((message) => (message as Extract<FromCanvas, { type: 'viewOptions' }>).options);

export const box = (id: string): HTMLElement => document.querySelector<HTMLElement>(`.hs-box[data-id="${id}"]`)!;

export const click = (target: Element): void => {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};

export const dblclick = (target: Element): void => {
  target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
};

export const key = (target: Element, init: KeyboardEventInit): boolean => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

/** Types into a field as a browser reports it: its new value, the caret at its end, and the input. */
export function typeInto(field: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  field.value = text;
  field.setSelectionRange(text.length, text.length);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/** The button whose accessible name or text is `name`, anywhere on the page. */
export const button = (name: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>('button, [role="button"]')].find((candidate) => candidate.getAttribute('aria-label') === name || candidate.textContent === name);

/** The document after an edit the type makes of it, as the extension would apply it. */
export function applied(from: Source, request: HierarchyRequest): Source {
  const outcome = type.edit(from, request, {}, true);
  if (outcome.kind !== 'applied') throw new Error(`not applied: ${JSON.stringify(outcome)}`);
  let text = from.text;
  for (const splice of [...outcome.splices].sort((a, b) => b.offset - a.offset)) text = text.slice(0, splice.offset) + splice.text + text.slice(splice.offset + splice.length);
  return { ...from, text, ...(outcome.registration ? { registration: outcome.registration } : {}) };
}
