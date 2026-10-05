import { beforeEach, describe, expect, it } from 'vitest';
import { agentBehaviorModelling as type } from '../../../src/core/agent-behavior-modelling/index';
import type { EditRequest, Source } from '../../../src/core/frame/diagramType';
import type { FromCanvas } from '../../../src/core/frame/protocol';
import { Canvas } from '../../../src/webview/diagram/canvas';
import { notationFor, type DrawContext } from '../../../src/webview/diagram/notation';
import '../../../src/webview/tools';
import { read } from '../../core/files';

const notation = notationFor(type.origin)!;

const text = '## Behavior\n\n- **Do in order:** Root\n  - **Retry up to 2 times:** Wrapped\n    - **Check:** Is it so\n  - **Ask the user:** What now\n  - **Delegate:** Hand over\n  - plain item\n  - **Do:** Work\n    Use the tool.\n';
const view = type.view({ text }, {});
const context: DrawContext = { view, elements: new Map(view.elements.map((element) => [element.id, element])) };
const draw = (id: string): SVGGElement => notation.element(context.elements.get(id)!, context);

describe('a node', () => {
  it('is drawn in the shape of its kind and the colour of its family', () => {
    const shape = (id: string): [string, string] => {
      const outline = draw(id).querySelector('.adp-node')!;
      return [outline.tagName, outline.getAttribute('class')!.replace('adp-node ', '')];
    };
    expect(shape('1')).toEqual(['polygon', 'abm-composite']);
    expect(shape('1.1')).toEqual(['polygon', 'abm-decorator']);
    expect(shape('1.1.1')).toEqual(['rect', 'abm-check']);
    expect(shape('1.2')).toEqual(['polygon', 'abm-other']);
    expect(shape('1.3')).toEqual(['polygon', 'abm-other']);
    expect(shape('1.5')).toEqual(['rect', 'abm-action']);
    // A wrapper is a hexagon, a pill is rounded by half its height.
    expect(draw('1.1').querySelector('.adp-node')!.getAttribute('points')!.split(' ')).toHaveLength(6);
    expect(draw('1.1.1').querySelector('.adp-node')!.getAttribute('rx')).toBe('30');
  });

  it('shows its keyword above its label, a Retry with its count', () => {
    const wrapped = draw('1.1');
    expect(wrapped.querySelector('.abm-keyword')?.textContent).toBe('Retry up to 2 times');
    expect(wrapped.querySelector('.abm-label')?.textContent).toBe('Wrapped');
  });

  it('is dashed when its item has no keyword, and carries its notes as a tooltip', () => {
    expect(draw('1.4').classList.contains('abm-implicit')).toBe(true);
    expect(draw('1.5').classList.contains('abm-implicit')).toBe(false);
    expect(draw('1.5').querySelector('title')?.textContent).toBe('Use the tool.');
  });
});

describe('a parent line', () => {
  it('runs from the parent\'s bottom down, across and down to the child\'s top, with an arrow', () => {
    const line = notation.relation(view.relations[0], context)!;
    const parent = context.elements.get('1')!;
    const child = context.elements.get('1.1')!;
    expect(line.querySelector('path')?.getAttribute('d')).toBe(
      `M ${parent.x + 100} 60 V ${60 + (child.y - 60) / 2} H ${child.x + 100} V ${child.y}`);
    expect(line.getAttribute('data-id')).toBe('child:1.1');
    expect(line.querySelector('path')?.getAttribute('marker-end')).toBe('url(#adp-arrow)');
  });
});

describe('gestures on a behavior model', () => {
  const source: Source = { text: read('examples/agent-behavior-modelling/research-assistant/research-assistant.md') };
  const research = type.view(source, {});
  let sent: FromCanvas[];
  const requests = (): EditRequest[] => sent.filter((message) => message.type === 'edit').map((message) => (message as Extract<FromCanvas, { type: 'edit' }>).request);
  const group = (id: string): Element => document.querySelector(`.adp-content [data-id="${id}"]`)!;
  const pointer = (target: EventTarget, kind: string, x: number, y: number, button = 0): void => {
    target.dispatchEvent(new MouseEvent(kind, { bubbles: true, cancelable: true, clientX: x, clientY: y, button }));
  };
  const at = (id: string) => research.elements.find((element) => element.id === id)!;

  beforeEach(() => {
    document.body.replaceChildren();
    sent = [];
    const canvas = new Canvas(document.body, (message) => sent.push(message));
    canvas.receive({ v: 1, type: 'view', origin: type.origin, view: research, actions: [], version: 1 });
  });

  it('carries the subtree with a dragged node, and its row up and down only', () => {
    const node = at('1.2');
    pointer(group('1.2').querySelector('.adp-node')!, 'pointerdown', node.x + 100, node.y + 30);
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

  it('stores a drop on whole canvas units, whatever the zoom made of the pointer\'s travel', () => {
    const node = at('1.2');
    pointer(group('1.2').querySelector('.adp-node')!, 'pointerdown', node.x + 100, node.y + 30);
    pointer(window, 'pointermove', node.x + 130.6, node.y + 80.4);
    pointer(window, 'pointerup', node.x + 130.6, node.y + 80.4);
    expect(requests()).toEqual([{ kind: 'move', id: '1.2', x: node.x + 31, y: node.y + 50 }]);
  });

  it('draws the lines to what moves again while it is dragged, and puts them back when the drag is given up', () => {
    const node = at('1.2');
    const parent = at('1');
    const line = (id: string): string => group(id).querySelector('.adp-relation-line')!.getAttribute('d')!;
    const before = line('child:1.2');
    pointer(group('1.2').querySelector('.adp-node')!, 'pointerdown', node.x + 100, node.y + 30);
    pointer(window, 'pointermove', node.x + 130, node.y + 80);
    // From the parent's bottom to the dragged node's top where it is drawn now; and to its child, which moves with it.
    expect(line('child:1.2')).toBe(`M ${parent.x + 100} ${parent.y + 60} V ${(parent.y + 60 + node.y + 50) / 2} H ${node.x + 130} V ${node.y + 50}`);
    const child = at('1.2.1');
    expect(line('child:1.2.1')).toBe(`M ${node.x + 130} ${node.y + 110} V ${(node.y + 110 + child.y + 50) / 2} H ${child.x + 130} V ${child.y + 50}`);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(line('child:1.2')).toBe(before);
  });

  it('makes the siblings a dragged node has passed step aside to where the new order would put them', () => {
    const first = at('1.1');
    const second = at('1.2');
    pointer(group('1.1').querySelector('.adp-node')!, 'pointerdown', first.x + 100, first.y + 30);
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
    const target = group('1.4').querySelector('.adp-node')!;
    document.elementFromPoint = () => target;
    const parent = at('1.2');
    pointer(group('1.2').querySelector('.adp-node')!, 'pointerdown', parent.x + 100, parent.y + 30, 2);
    pointer(window, 'pointermove', parent.x + 300, parent.y + 30, 2);
    pointer(window, 'pointerup', at('1.4').x + 100, at('1.4').y + 30, 2);
    expect(requests()).toEqual([{ kind: 'connect', from: '1.2', to: '1.4' }]);
  });

  it('starts no parent line from a leaf', () => {
    const leaf = at('1.4');
    pointer(group('1.4').querySelector('.adp-node')!, 'pointerdown', leaf.x + 100, leaf.y + 30, 2);
    pointer(window, 'pointermove', leaf.x + 300, leaf.y + 30, 2);
    pointer(window, 'pointerup', leaf.x + 300, leaf.y + 30, 2);
    expect(requests()).toEqual([]);
  });
});
