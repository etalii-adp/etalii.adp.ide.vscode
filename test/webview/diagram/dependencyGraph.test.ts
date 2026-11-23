import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FromCanvas } from '../../../src/core/frame/protocol';
import { Canvas, freePointNear } from '../../../src/webview/diagram/canvas';
import { drawScene, type ThemeKind } from '../../../src/webview/diagram/scene';
import { diagram, group, pointer, requestsOf } from '../support';

// The dependency graph's look in both themes (etalii.adp spec 088, task T019): standalone's colours, which the
// definition states as tokens and their `modes.dark` (`index.css` of the standalone client), the arrowhead a
// filled triangle in its line's colour, and the label in the lines' colour.

const type = diagram('dependency-graph');
const scene = type.view({ fileName: 'services.dgr', text: readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8') }, {});

const paint = (element: Element | null | undefined, property: 'fill' | 'stroke' | 'color'): string | undefined =>
  new RegExp(`(?:^|; )${property}: ([^;]+)`).exec(element?.getAttribute('style') ?? '')?.[1];

const colours = (kind: ThemeKind): Record<string, string | undefined> => {
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  root.append(...drawScene(scene, kind));
  const node = root.querySelector('[data-id="checkout-web"]');
  const dependency = root.querySelector('[data-id="r-web-gateway"]');
  const marker = dependency?.querySelector('[data-marker][data-end="target"]');
  const text = node?.querySelector('[data-label]');
  return {
    fill: paint(node?.querySelector('.adp-shape'), 'fill'), border: paint(node?.querySelector('.adp-shape'), 'stroke'),
    text: paint(text?.firstElementChild, 'color') ?? paint(text, 'fill'),
    line: paint(dependency?.querySelector('.adp-line'), 'stroke'), arrowhead: `${marker?.getAttribute('data-marker')} ${paint(marker, 'fill')} ${paint(marker, 'stroke')}`,
    label: paint(dependency?.querySelector('[data-label]'), 'fill'),
  };
};

describe('the dependency graph drawn', () => {
  it('takes standalone\'s light colours in a light theme', () => {
    expect(colours('light')).toEqual({ fill: '#FFFFFF', border: '#E2E8F0', text: '#0F172A', line: '#64748B', arrowhead: 'arrowFilled #64748B #64748B', label: '#64748B' });
  });

  it('takes standalone\'s dark colours in a dark theme', () => {
    expect(colours('dark')).toEqual({ fill: '#1E293B', border: '#334155', text: '#F1F5F9', line: '#94A3B8', arrowhead: 'arrowFilled #94A3B8 #94A3B8', label: '#94A3B8' });
  });
});

// The dependency graph's gestures on the canvas (etalii.adp spec 088, tasks T022 and T024): Tab and Enter on a
// selected node run the actions with those shortcuts, and a line is drawn out of a node's left or right anchor, to
// another node or onto empty canvas, the anchor saying which end the node is.
describe('the dependency graph\'s canvas', () => {
  const source = { fileName: 'services.dgr', text: readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8') };
  let sent: FromCanvas[];
  let canvas: Canvas;
  const open = (selection: string[]): void => {
    document.body.replaceChildren();
    sent = [];
    canvas = new Canvas(document.body, (message) => sent.push(message));
    canvas.receive({ v: 2, type: 'view', origin: type.origin, kind: 'diagram', view: type.view(source, {}), actions: type.actions(source, selection), version: 1 });
    if (selection.length > 0) canvas.receive({ v: 2, type: 'reveal', id: selection[0] });
  };
  const anchorOf = (id: string, anchor: string): { x: number; y: number } => scene.nodes.find((node) => node.id === id)!.anchors!.find((candidate) => candidate.id === anchor)!;
  const screen = (point: { x: number; y: number }): [number, number] => {
    const transform = /translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)\s*scale\(([-\d.e]+)\)/.exec(document.querySelector('.adp-viewport, [transform]')?.getAttribute('transform') ?? '');
    const [tx, ty, scale] = transform ? [Number(transform[1]), Number(transform[2]), Number(transform[3])] : [0, 0, 1];
    return [point.x * scale + tx, point.y * scale + ty];
  };
  const drag = (from: Element, start: [number, number], end: [number, number]): void => {
    pointer(from, 'pointerdown', start[0], start[1]);
    pointer(window, 'pointermove', (start[0] + end[0]) / 2, (start[1] + end[1]) / 2);
    pointer(window, 'pointermove', end[0], end[1]);
    pointer(window, 'pointerup', end[0], end[1]);
  };

  it('names the left and right anchors of every node, on the middle of its sides', () => {
    const node = scene.nodes.find((candidate) => candidate.id === 'checkout-web')!;
    expect(node.anchors).toEqual([
      { id: 'left', x: node.box.x, y: node.box.y + node.box.height / 2 },
      { id: 'right', x: node.box.x + node.box.width, y: node.box.y + node.box.height / 2 },
    ]);
  });

  it('runs Add node to the right on Tab and Add node below on Enter, on the selected node', () => {
    open(['checkout-web']);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(requestsOf(sent)).toEqual([
      { kind: 'action', action: 'dependencies.add-after', id: 'checkout-web' },
      { kind: 'action', action: 'dependencies.add-below', id: 'checkout-web' },
    ]);
  });

  it('draws a line out of a node\'s right anchor to another node, naming the anchor', () => {
    open([]);
    const target = group('api-gateway');
    document.elementFromPoint = () => target;
    drag(group('checkout-web'), screen(anchorOf('checkout-web', 'right')), screen(anchorOf('api-gateway', 'left')));
    expect(requestsOf(sent)).toEqual([{ kind: 'connect', from: 'checkout-web', to: 'api-gateway', fromAnchor: 'right' }]);
  });

  it('asks for a node where a line out of an anchor is let go on empty canvas', () => {
    open([]);
    document.elementFromPoint = () => null;
    const start = anchorOf('checkout-web', 'left');
    drag(group('checkout-web'), screen(start), screen({ x: start.x - 200, y: start.y + 60 }));
    const [request] = requestsOf(sent);
    expect(request).toMatchObject({ kind: 'connect', from: 'checkout-web', to: '', fromAnchor: 'left' });
    expect(request.kind === 'connect' && request.toPoint).toEqual({ x: expect.closeTo(start.x - 200, 3), y: expect.closeTo(start.y + 60, 3) });
  });

  it('shows the anchors of every node as dots a line can be drawn out of, as the standalone host does', () => {
    open([]);
    const dots = [...document.querySelectorAll('.adp-anchor')];
    expect(dots.length).toBe(scene.nodes.length * 2);
    expect(dots.filter((dot) => dot.getAttribute('data-node') === 'checkout-web').map((dot) => dot.getAttribute('data-anchor'))).toEqual(['left', 'right']);
  });

  it('draws a line from a press anywhere in the ring around a dot, which lies over the node', () => {
    open([]);
    document.elementFromPoint = () => null;
    const zone = document.querySelector('.adp-anchor-zone[data-node="checkout-web"][data-anchor="right"]')!;
    const start = anchorOf('checkout-web', 'right');
    drag(zone, screen({ x: start.x - 9, y: start.y + 3 }), screen({ x: start.x + 200, y: start.y + 60 }));
    expect(requestsOf(sent)[0]).toMatchObject({ kind: 'connect', from: 'checkout-web', to: '', fromAnchor: 'right' });
  });
});

describe('the dependency graph\'s anchors under the pointer', () => {
  it('draws a line from a press a few pixels inside an anchor dot, at any zoom', () => {
    document.body.replaceChildren();
    const sent: FromCanvas[] = [];
    const canvas = new Canvas(document.body, (message) => sent.push(message));
    const source = { fileName: 'services.dgr', text: readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8') };
    canvas.receive({ v: 2, type: 'view', origin: type.origin, kind: 'diagram', view: type.view(source, {}), actions: type.actions(source, ['checkout-web']), version: 1 });
    canvas.receive({ v: 2, type: 'reveal', id: 'checkout-web' });
    const dot = document.querySelector('.adp-anchor[data-anchor="right"]')!;
    const cx = Number(dot.getAttribute('cx'));
    const cy = Number(dot.getAttribute('cy'));
    const transform = /translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)\s*scale\(([-\d.e]+)\)/.exec(document.querySelector('[transform]')?.getAttribute('transform') ?? '');
    const [tx, ty, scale] = transform ? [Number(transform[1]), Number(transform[2]), Number(transform[3])] : [0, 0, 1];
    const at = (x: number, y: number): [number, number] => [x * scale + tx, y * scale + ty];
    // Five screen pixels inside the node from the dot's centre, pressed on the node's own shape.
    const [sx, sy] = at(cx, cy);
    document.elementFromPoint = () => null;
    pointer(group('checkout-web'), 'pointerdown', sx - 5, sy);
    pointer(window, 'pointermove', sx + 60, sy + 40);
    pointer(window, 'pointermove', sx + 120, sy + 80);
    pointer(window, 'pointerup', sx + 120, sy + 80);
    expect(requestsOf(sent)[0]).toMatchObject({ kind: 'connect', from: 'checkout-web', fromAnchor: 'right' });
  });
});

describe('the dependency graph\'s canvas helping a first-time user', () => {
  const source = { fileName: 'services.dgr', text: readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8') };
  it('adds a toolbox entry at a free point near the centre, not on top of a node', () => {
    // The centre of the view is on Order service: the entry goes to the nearest point clear of every node.
    const order = scene.nodes.find((node) => node.id === 'order-service')!.box;
    const centre = { x: order.x + order.width / 2, y: order.y + order.height / 2 };
    const at = freePointNear(scene.nodes, centre, { x: centre.x - 600, y: centre.y - 400, width: 1200, height: 800 });
    const width = Math.max(...scene.nodes.map((node) => node.box.width));
    const height = Math.max(...scene.nodes.map((node) => node.box.height));
    expect(scene.nodes.filter((node) => at.x + width > node.box.x && at.x - width < node.box.x + node.box.width && at.y + height > node.box.y && at.y - height < node.box.y + node.box.height).map((node) => node.id)).toEqual([]);
    expect(Math.hypot(at.x - centre.x, at.y - centre.y)).toBeLessThan(600);
    // Where the wanted point is clear, it is kept.
    expect(freePointNear(scene.nodes, { x: -5000, y: -5000 }, { x: -5600, y: -5400, width: 1200, height: 800 })).toEqual({ x: -5000, y: -5000 });
  });

  it('brings a node into view without selecting it when asked to keep the selection', () => {
    document.body.replaceChildren();
    const sent: FromCanvas[] = [];
    const canvas = new Canvas(document.body, (message) => sent.push(message));
    canvas.receive({ v: 2, type: 'view', origin: type.origin, kind: 'diagram', view: type.view(source, {}), actions: type.actions(source, []), version: 1 });
    canvas.receive({ v: 2, type: 'reveal', id: 'checkout-web', keepSelection: true });
    expect(document.querySelectorAll('.adp-selected, [data-selected="true"]').length).toBe(0);
    expect(sent.filter((message) => (message as { type?: string }).type === 'select')).toEqual([]);
  });
});
