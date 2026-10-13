import { beforeEach, describe, expect, it } from 'vitest';
import type { FromCanvas } from '../../../src/core/frame/protocol';
import type { Source } from '../../../src/core/frame/toolType';
import { pathData } from '../../../src/core/scene/geometry';
import { Canvas } from '../../../src/webview/diagram/canvas';
import { drawScene } from '../../../src/webview/diagram/scene';
import { read } from '../../core/files';
import { diagram, group, pointer, requestsOf } from '../support';

// Agent Behavior Modelling on the canvas, in a simulated browser (etalii.adp spec 027, task T124):
// what spec 006 tested of its hand-written notation, named through the tool type its definition
// gives. The scene is the tool type's, drawn as the canvas draws any scene.

const type = diagram('agent-behavior-modelling');

const text = '## Behavior\n\n- **Do in order:** Root\n  - **Retry up to 2 times:** Wrapped\n    - **Check:** Is it so\n  - **Ask the user:** What now\n  - **Delegate:** Hand over\n  - plain item\n  - **Do:** Work\n    Use the tool.\n';
const scene = type.view({ fileName: 'agent.md', text }, {});
const drawn = drawScene(scene, 'light');
const draw = (id: string): SVGGElement => drawn.find((candidate) => candidate.getAttribute('data-id') === id)!;
const box = (id: string) => scene.nodes.find((node) => node.id === id)!.box;

describe('a node', () => {
  it('is drawn in the shape of its kind and the colour of its family', () => {
    const shape = (id: string): [string, string] => {
      const outline = draw(id).querySelector('.adp-shape')!;
      return [outline.tagName, /fill: ([^;]+)/.exec(outline.getAttribute('style')!)![1]];
    };
    const token = (name: string): string => String(scene.tokens![name].light);
    expect(shape('1')).toEqual(['path', token('color.abm.composite')]);
    expect(shape('1.1')).toEqual(['path', token('color.abm.decorator')]);
    expect(shape('1.1.1')).toEqual(['rect', token('color.abm.check')]);
    expect(shape('1.2')).toEqual(['path', token('color.abm.other')]);
    expect(shape('1.3')).toEqual(['path', token('color.abm.other')]);
    expect(shape('1.5')).toEqual(['rect', token('color.abm.action')]);
    // A wrapper is a hexagon, a pill is rounded by half its height.
    expect(draw('1.1').querySelector('.adp-shape')!.getAttribute('d')!.match(/[ML]/g)).toHaveLength(6);
    expect(draw('1.1.1').querySelector('.adp-shape')!.getAttribute('rx')).toBe('30');
  });

  it('shows its keyword above its label, a Retry with its count, in the case the definition gives it', () => {
    const wrapped = draw('1.1');
    const keyword = wrapped.querySelector('[data-label="keyword"]')!;
    expect(keyword.textContent).toBe('Retry up to 2 times');
    expect(keyword.getAttribute('style')).toContain('text-transform: uppercase');
    expect(wrapped.querySelector('[data-label="label"]')?.textContent).toBe('Wrapped');
    expect(Number(keyword.querySelector('tspan')!.getAttribute('y'))).toBeLessThan(Number(wrapped.querySelector('[data-label="label"] tspan')!.getAttribute('y')));
  });

  it('is dashed when its item has no keyword', () => {
    expect(draw('1.4').querySelector('.adp-shape')!.getAttribute('stroke-dasharray')).toBe('4 3');
    expect(draw('1.5').querySelector('.adp-shape')!.getAttribute('stroke-dasharray')).toBeNull();
  });

  it('keeps a label that is too long for it on one line within the node, cut off with an ellipsis and read in full as its tooltip', () => {
    const long = 'A label that goes on for much longer than a node of two hundred units is wide';
    const wide = type.view({ fileName: 'agent.md', text: `## Behavior\n\n- **Do:** ${long}\n` }, {});
    const label = drawScene(wide, 'light').find((candidate) => candidate.getAttribute('data-id') === '1')!.querySelector('[data-label="label"]')!;
    expect(label.tagName).toBe('foreignObject');
    expect(Number(label.getAttribute('width'))).toBeLessThan(wide.nodes[0].box.width);
    expect(label.querySelector('.adp-ellipsis')?.textContent).toBe(long);
    expect(label.querySelector('title')?.textContent).toBe(long);
  });
});

describe('a parent line', () => {
  it('runs from the bottom of the parent down, across and down to the top of the child, with an arrow', () => {
    const line = draw('child:1.1');
    const parent = box('1');
    const child = box('1.1');
    expect(line.querySelector('.adp-line')?.getAttribute('d')).toBe(pathData([
      { op: 'M', x: parent.x + 100, y: 60 }, { op: 'L', x: parent.x + 100, y: 60 + (child.y - 60) / 2 }, { op: 'L', x: child.x + 100, y: 60 + (child.y - 60) / 2 }, { op: 'L', x: child.x + 100, y: child.y },
    ]));
    expect(line.querySelector('[data-marker]')?.getAttribute('data-end')).toBe('target');
    expect(line.querySelectorAll('[data-marker]')).toHaveLength(1);
  });
});

describe('gestures on a behavior model', () => {
  const source: Source = { fileName: 'research-assistant.md', text: read('examples/agent-behavior-modelling/research-assistant/research-assistant.md') };
  const research = type.view(source, {});
  let sent: FromCanvas[];
  const requests = () => requestsOf(sent);
  const at = (id: string) => research.nodes.find((node) => node.id === id)!.box;
  const shape = (id: string): Element => group(id).querySelector('.adp-shape')!;

  beforeEach(() => {
    document.body.replaceChildren();
    sent = [];
    const canvas = new Canvas(document.body, (message) => sent.push(message));
    canvas.receive({ v: 2, type: 'view', origin: type.origin, kind: 'diagram', view: research, actions: [], version: 1 });
  });

  it('carries the subtree with a dragged node, and its row up and down only', () => {
    const node = at('1.2');
    pointer(shape('1.2'), 'pointerdown', node.x + 100, node.y + 30);
    pointer(window, 'pointermove', node.x + 130, node.y + 80);
    expect(group('1.2').getAttribute('transform')).toBe('translate(30 50)');
    expect(group('1.2.3').getAttribute('transform')).toBe('translate(30 50)');
    // The rest of the row, and what hangs under it, follows down and not across.
    expect(group('1.1').getAttribute('transform')).toBe('translate(0 50)');
    expect(group('1.3.1.2').getAttribute('transform')).toBe('translate(0 50)');
    expect(group('1').getAttribute('transform')).toBeNull();
    pointer(window, 'pointerup', node.x + 130, node.y + 80);
    expect(requests()).toEqual([{ kind: 'move', id: '1.2', x: node.x + 30, y: node.y + 50 }]);
  });

  it('stores a drop on whole canvas units, whatever the zoom made of the travel of the pointer', () => {
    const node = at('1.2');
    pointer(shape('1.2'), 'pointerdown', node.x + 100, node.y + 30);
    pointer(window, 'pointermove', node.x + 130.6, node.y + 80.4);
    pointer(window, 'pointerup', node.x + 130.6, node.y + 80.4);
    expect(requests()).toEqual([{ kind: 'move', id: '1.2', x: node.x + 31, y: node.y + 50 }]);
  });

  it('draws the lines to what moves again while it is dragged, and puts them back when the drag is given up', () => {
    const node = at('1.2');
    const parent = at('1');
    const line = (id: string): string => group(id).querySelector('.adp-line')!.getAttribute('d')!;
    const right = (from: { x: number; y: number }, to: { x: number; y: number }): string =>
      pathData([{ op: 'M', ...from }, { op: 'L', x: from.x, y: (from.y + to.y) / 2 }, { op: 'L', x: to.x, y: (from.y + to.y) / 2 }, { op: 'L', ...to }]);
    const before = line('child:1.2');
    pointer(shape('1.2'), 'pointerdown', node.x + 100, node.y + 30);
    pointer(window, 'pointermove', node.x + 130, node.y + 80);
    // From the bottom of the parent to the top of the dragged node where it is drawn now; and to its child, which moves with it.
    expect(line('child:1.2')).toBe(right({ x: parent.x + 100, y: parent.y + 60 }, { x: node.x + 130, y: node.y + 50 }));
    const child = at('1.2.1');
    expect(line('child:1.2.1')).toBe(right({ x: node.x + 130, y: node.y + 110 }, { x: child.x + 130, y: child.y + 50 }));
    expect(group('child:1.2').querySelectorAll('[data-marker]')).toHaveLength(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(line('child:1.2')).toBe(before);
    expect(group('1.2').getAttribute('transform')).toBeNull();
  });

  it('makes the siblings a dragged node has passed step aside to where the new order would put them', () => {
    const first = at('1.1');
    const second = at('1.2');
    pointer(shape('1.1'), 'pointerdown', first.x + 100, first.y + 30);
    // Not yet past the middle of the next sibling: nothing else moves.
    pointer(window, 'pointermove', first.x + 140, first.y + 30);
    expect(group('1.2').getAttribute('transform')).toBeNull();
    // Past it: the sibling, with what is under it, is drawn further left, making room.
    pointer(window, 'pointermove', second.x + 110, first.y + 30);
    const shift = Number(/translate\((-?[\d.]+) /.exec(group('1.2').getAttribute('transform') ?? '')?.[1]);
    expect(shift).toBeLessThan(0);
    expect(group('1.2.1').getAttribute('transform')).toBe(group('1.2').getAttribute('transform'));
    expect(group('1.1').getAttribute('transform')).toBe(`translate(${second.x + 10 - first.x} 0)`);
    // Back before the middle, they return.
    pointer(window, 'pointermove', first.x + 140, first.y + 30);
    expect(group('1.2').getAttribute('transform')).toBeNull();
    pointer(window, 'pointerup', first.x + 140, first.y + 30);
    expect(requests()).toEqual([{ kind: 'move', id: '1.1', x: first.x + 40, y: first.y }]);
  });

  it('puts a node under another by a right-button drag from the new parent to it', () => {
    const target = shape('1.4');
    document.elementFromPoint = () => target;
    const parent = at('1.2');
    pointer(shape('1.2'), 'pointerdown', parent.x + 100, parent.y + 30, 2);
    pointer(window, 'pointermove', parent.x + 300, parent.y + 30, 2);
    pointer(window, 'pointerup', at('1.4').x + 100, at('1.4').y + 30, 2);
    expect(requests()).toEqual([{ kind: 'connect', from: '1.2', to: '1.4' }]);
  });

  it('asks for a parent line drawn from a leaf too, which the definition refuses with its sentence', () => {
    // The definition offers the line from any node and refuses it when it is run (the companion document, "Refusing a line from a leaf").
    const leaf = research.nodes.find((node) => node.type === 'Check')!;
    // A node the leaf does not lie in.
    const other = research.nodes.find((node) => node.id !== leaf.id && !leaf.id.startsWith(`${node.id}.`))!;
    const target = shape(other.id);
    document.elementFromPoint = () => target;
    pointer(shape(leaf.id), 'pointerdown', leaf.box.x + 100, leaf.box.y + 30, 2);
    pointer(window, 'pointermove', leaf.box.x + 300, leaf.box.y + 30, 2);
    pointer(window, 'pointerup', other.box.x + 100, other.box.y + 30, 2);
    expect(requests()).toEqual([{ kind: 'connect', from: leaf.id, to: other.id }]);
    expect(type.edit(source, requests()[0], {}, false)).toEqual({ kind: 'refused', sentence: '"Check" holds no children.' });
  });
});
