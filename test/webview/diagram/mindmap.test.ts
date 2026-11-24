import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FromCanvas } from '../../../src/core/frame/protocol';
import type { EditRequest, Source } from '../../../src/core/frame/toolType';
import { Canvas } from '../../../src/webview/diagram/canvas';
import { diagram, requestsOf } from '../support';

// A new mind map, as "ADP: New Mind map" makes it, in the canvas: what a first-time user does to add a node.
// The ADP Toolbox's Node entry, activated in its view, landed at a free point beside the central topic and
// added nothing, and the one key of Add child is Insert, which a Mac keyboard does not have.

const type = diagram('mindmap');
const source: Source = { fileName: 'untitled.mm', text: type.newDocument('untitled.mm') };
const root = type.view(source, {}).nodes[0].id;
const entry = type.toolbox(source)[0].id;

let sent: FromCanvas[];
let canvas: Canvas;

const open = (selection: string[]): void => {
  document.body.replaceChildren();
  sent = [];
  canvas = new Canvas(document.body, (message) => sent.push(message));
  canvas.receive({ v: 2, type: 'view', origin: type.origin, kind: 'diagram', view: type.view(source, {}), actions: type.actions(source, selection), version: 1 });
  if (selection.length > 0) canvas.receive({ v: 2, type: 'reveal', id: selection[0] });
};

/** The node the one request the canvas made adds, by the text the tool type writes for it. */
function added(): string {
  const requests: EditRequest[] = requestsOf(sent);
  expect(requests).toHaveLength(1);
  const outcome = type.edit(source, requests[0], {}, false);
  expect(outcome.kind).toBe('applied');
  const splices = outcome.kind === 'applied' ? outcome.splices : [];
  expect(splices.length).toBeGreaterThan(0);
  return splices.map((splice) => splice.text).join('');
}

describe('a new mind map\'s canvas', () => {
  // The canvas as large as an editor shows it: in a canvas of no size the middle of the view is on the central
  // topic, and the toolbox's entry lands on it, which hid the defect.
  const sizes = ['clientWidth', 'clientHeight'].map((name) => [name, Object.getOwnPropertyDescriptor(Element.prototype, name)] as const);
  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 800 });
  });
  afterAll(() => {
    for (const [name, descriptor] of sizes) if (descriptor) Object.defineProperty(Element.prototype, name, descriptor);
  });
  beforeEach(() => open([]));

  it('adds a node under the central topic when the toolbox\'s Node is activated with nothing selected', () => {
    canvas.receive({ v: 2, type: 'addAtCentre', entry });
    expect(added()).toMatch(/<node TEXT="Node" ID="[^"]+"\/>/);
  });

  it('adds a node under the selected node when the toolbox\'s Node is activated', () => {
    open([root]);
    canvas.receive({ v: 2, type: 'addAtCentre', entry });
    expect(requestsOf(sent)[0]).toMatchObject({ kind: 'drop', entry, selected: [root] });
    expect(added()).toMatch(/<node TEXT="Node" ID="[^"]+"\/>/);
  });

  it('adds a child of the selected node on Tab, as on Insert', () => {
    open([root]);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(requestsOf(sent)).toEqual([{ kind: 'action', action: 'mindmap.add-child', id: root }]);
    expect(added()).toMatch(/<node TEXT="Node" ID="[^"]+"\/>/);
  });
});
