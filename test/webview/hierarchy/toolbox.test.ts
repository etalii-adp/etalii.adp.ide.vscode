import { beforeEach, describe, expect, it } from 'vitest';
import type { HierarchyRequest } from '../../../src/core/tool/hierarchyView';
import { Toolbox, toolboxEntryMime, toolboxMime } from '../../../src/webview/toolbox/toolbox';
import { box, click, harness, requests, show, type, source, viewOf, type Harness } from './pageSupport';

// An ADP Toolbox entry on the page of boxes (the maintainer's choice for Visual Studio Code): dragged
// onto the page it goes where a box dragged there would, shown meanwhile, and dropped it is the drop
// the view's frame takes, into a level and after a sibling there; activated in its view it is added
// at the selection, or at the top.

let h: Harness;

/** A drag of a toolbox entry over `target`, at `y` within a box 40 pixels high; dropped, it carries the entry's id. */
function drag(kind: 'dragover' | 'drop' | 'dragleave', target: Element, entry: string, y = 30): boolean {
  const event = new Event(kind, { bubbles: true, cancelable: true });
  const carried: Record<string, string> = { [toolboxMime]: entry, [`${toolboxEntryMime}${entry.toLowerCase()}`]: entry };
  // While a drag lasts its data cannot be read, only its types.
  const transfer = { types: Object.keys(carried), getData: (format: string) => (kind === 'drop' ? carried[format] ?? '' : ''), dropEffect: 'none' };
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  Object.defineProperty(event, 'clientY', { value: y });
  Object.defineProperty(event, 'relatedTarget', { value: null });
  return target.dispatchEvent(event);
}

/** Gives a box its place on the screen: 40 pixels high from the top. */
function placed(id: string): HTMLElement {
  const element = box(id);
  element.getBoundingClientRect = () => ({ left: 0, right: 200, top: 0, bottom: 40, width: 200, height: 40, x: 0, y: 0, toJSON: () => ({}) });
  return element;
}

const slot = (): HTMLElement | null => document.querySelector('.hs-drop-slot');

beforeEach(() => {
  h = harness();
});

describe('an ADP Toolbox entry dragged onto the page', () => {
  it('offers the item and the requirement, each naming its type in the data it carries', () => {
    expect(type.toolbox(source).map((entry) => entry.id)).toEqual(['Item', 'Requirement']);
    const host = document.createElement('div');
    const toolbox = new Toolbox(host, () => undefined);
    toolbox.show(type.toolbox(source), undefined);
    const set: Record<string, string> = {};
    const start = new Event('dragstart', { bubbles: true });
    Object.defineProperty(start, 'dataTransfer', { value: { setData: (format: string, value: string) => void (set[format] = value), effectAllowed: '' } });
    host.querySelector('[data-entry="Requirement"]')!.dispatchEvent(start);
    expect(set).toMatchObject({ [toolboxMime]: 'Requirement', [`${toolboxEntryMime}requirement`]: 'Requirement' });
  });

  it('shows where a requirement dropped on a requirement\'s lower half would go, and drops it after that one', () => {
    show(h.page, viewOf());
    expect(drag('dragover', placed('REQ-0003'), 'Requirement')).toBe(false);
    expect(slot()!.textContent).toContain('Requirement');
    expect((slot()!.previousElementSibling as HTMLElement).dataset.node).toBe('REQ-0003');
    expect(box('REQ-0003').classList.contains('hs-drop-after')).toBe(true);
    drag('drop', placed('REQ-0003'), 'Requirement');
    expect(slot()).toBeNull();
    expect(requests(h.sent)).toEqual<HierarchyRequest[]>([{ kind: 'drop', entry: 'Requirement', parent: 'ITEM-0002', after: 'REQ-0003' }]);
  });

  it('drops a requirement on the upper half of a level\'s first one first among them, and on a level where a new one goes', () => {
    show(h.page, viewOf());
    drag('dragover', placed('REQ-0003'), 'Requirement', 10);
    expect((slot()!.nextElementSibling as HTMLElement).dataset.node).toBe('REQ-0003');
    drag('drop', placed('REQ-0003'), 'Requirement', 10);
    drag('drop', placed('ITEM-0005'), 'Requirement', 10);
    expect(requests(h.sent)).toEqual<HierarchyRequest[]>([
      { kind: 'drop', entry: 'Requirement', parent: 'ITEM-0002', after: '' },
      { kind: 'drop', entry: 'Requirement', parent: 'ITEM-0005' },
    ]);
  });

  it('drops an item into an item from its upper half, after it from its lower half, and at the top over no box', () => {
    show(h.page, viewOf());
    drag('drop', placed('ITEM-0004'), 'Item', 10);
    drag('drop', placed('ITEM-0004'), 'Item', 30);
    drag('dragover', document.querySelector('.hs-page')!, 'Item');
    expect((slot()!.previousElementSibling as HTMLElement).dataset.node).toBe('ITEM-0006');
    drag('drop', document.querySelector('.hs-page')!, 'Item');
    expect(requests(h.sent)).toEqual<HierarchyRequest[]>([
      { kind: 'drop', entry: 'Item', parent: 'ITEM-0004' },
      { kind: 'drop', entry: 'Item', after: 'ITEM-0004' },
      { kind: 'drop', entry: 'Item' },
    ]);
  });

  it('shows nothing once the drag leaves the page, and takes no drop on a document that cannot be changed', () => {
    show(h.page, viewOf());
    drag('dragover', placed('REQ-0003'), 'Requirement');
    drag('dragleave', document.querySelector('.hs-page')!, 'Requirement');
    expect(slot()).toBeNull();
    show(h.page, { ...viewOf(), readOnly: true }, 2);
    expect(drag('dragover', placed('REQ-0003'), 'Requirement')).toBe(true);
    drag('drop', placed('REQ-0003'), 'Requirement');
    expect(requests(h.sent)).toEqual([]);
  });
});

describe('an ADP Toolbox entry activated in its view', () => {
  it('is added into the selected level, after the selected entry, or at the top with nothing selected', () => {
    show(h.page, viewOf());
    h.page.receive({ v: 2, type: 'addAtCentre', entry: 'Item' });
    click(box('REQ-0001'));
    h.page.receive({ v: 2, type: 'addAtCentre', entry: 'Requirement' });
    h.page.receive({ v: 2, type: 'addAtCentre', entry: 'Item' });
    click(box('ITEM-0004'));
    h.page.receive({ v: 2, type: 'addAtCentre', entry: 'Requirement' });
    expect(requests(h.sent)).toEqual<HierarchyRequest[]>([
      { kind: 'drop', entry: 'Item' },
      { kind: 'drop', entry: 'Requirement', parent: 'ITEM-0001', after: 'REQ-0001' },
      { kind: 'drop', entry: 'Item', parent: 'ITEM-0001' },
      { kind: 'drop', entry: 'Requirement', parent: 'ITEM-0004' },
    ]);
  });
});
