import { beforeEach, describe, expect, it } from 'vitest';
import type { Action, EditRequest } from '../../../src/core/frame/toolType';
import type { FromCanvas, ToCanvas } from '../../../src/core/frame/protocol';
import { gartnerHypecycleGraph as handCoded } from '../../../src/core/gartner-hypecycle-graph/index';
import { createScene, type Scene, type SceneNode } from '../../../src/core/scene/scene';
import { Canvas } from '../../../src/webview/diagram/canvas';
import '../../../src/webview/tools';
import { read } from '../../core/files';
import { canvasTool } from '../../core/scene/tool';

// The canvas drawing a scene, in a simulated browser: what a tool type read from its definition
// sends in the `view` message (etalii.adp spec 027, contracts/tool-type.md "Messages"). There is no
// layout there, so the surface is at the origin at a zoom of one and a pointer position in pixels
// is the same position in canvas units. The scene is the hype cycle graph's definition over a
// fixture, with what a tool type adds to it set by hand.

const made = canvasTool();
const scene: Scene = {
  ...createScene(made.sceneTool, made.fixture('triggers-and-notes').value),
  readOnly: false,
  tokens: { 'ghg.peak': { light: '#f7e7a1', dark: '#6b5a17' }, 'ghg.note': { light: '#fef9c3', dark: '#423a10' } },
  chrome: {
    rulers: [{
      axis: 'x', position: 'bottom', size: 22, attach: 'view',
      levels: [
        { spacing: 4, minSpacing: 64, ticks: [{ at: 0, label: 'Jan 1900' }] },
        { spacing: 400, minSpacing: 64, ticks: [{ at: 0, label: '1900' }, { at: 400, label: '2000' }] },
        { spacing: 4000, minSpacing: 64, ticks: [{ at: 0, label: '19th' }] },
      ],
    }],
    filters: [{ id: 'tags', label: 'Filter by tags', control: 'chips', options: ['electronics', 'invention'], value: [], match: 'any', matchToggle: true, kept: false }],
    toggles: [{ viewpoint: 'compact', label: 'Compact', on: false }],
    legend: [{ id: 'Phase.peak', label: 'Peak', fill: { token: 'ghg.peak' } }, { id: 'Note', label: 'Note', fill: '#fef9c3' }],
    background: '#fafafa',
  },
};
const node = (id: string): SceneNode => scene.nodes.find((candidate) => candidate.id === id)!;
const withNode = (changed: SceneNode): Scene => ({ ...scene, nodes: scene.nodes.map((other) => (other.id === changed.id ? changed : other)) });
const actions: Action[] = [{ id: 'editLabel', label: 'Rename…', enabled: true }, { id: 'delete', label: 'Remove', enabled: true }];

let canvas: Canvas;
let sent: FromCanvas[];

const viewMessage = (view: unknown = scene, offered: readonly Action[] = []): ToCanvas => ({
  v: 2, type: 'view', origin: 'gartner/hypecycle-graph', kind: 'diagram', view, actions: offered, version: 7,
});
const requests = (): EditRequest[] => sent.filter((message) => message.type === 'edit').map((message) => (message as Extract<FromCanvas, { type: 'edit' }>).request as EditRequest);
const group = (id: string): Element => document.querySelector(`.adp-content [data-id="${id}"]`)!;
const part = (id: string, name: string): Element => group(id).querySelector(`[data-part="${name}"]`)!;
const surface = (): Element => document.querySelector('.adp-surface')!;
const pointer = (target: EventTarget, kind: string, x: number, y: number, button = 0): void => {
  target.dispatchEvent(new MouseEvent(kind, { bubbles: true, cancelable: true, clientX: x, clientY: y, button }));
};
const drag = (from: Element, start: [number, number], end: [number, number], button = 0): void => {
  pointer(from, 'pointerdown', start[0], start[1], button);
  pointer(window, 'pointermove', (start[0] + end[0]) / 2, (start[1] + end[1]) / 2, button);
  pointer(window, 'pointermove', end[0], end[1], button);
  pointer(window, 'pointerup', end[0], end[1], button);
};

beforeEach(() => {
  document.body.replaceChildren();
  document.body.removeAttribute('class');
  sent = [];
  canvas = new Canvas(document.body, (message) => sent.push(message));
  canvas.receive(viewMessage());
});

describe('the canvas, sent a scene', () => {
  it('draws every edge and node of it, edges beneath nodes', () => {
    const drawn = [...document.querySelectorAll('.adp-content > [data-id]')].map((element) => element.getAttribute('data-id'));
    expect(drawn).toEqual(['i-12', 'i-13', 'transistors', 'radio', 'transistor-invented', 'note-1', 'note-2']);
    expect(part('transistors', 'peakFill').getAttribute('style')).toContain('fill: #f7e7a1');
  });

  it('draws it again in the colours of the theme when the theme changes', async () => {
    document.body.className = 'vscode-dark';
    await new Promise((resolve) => setTimeout(resolve));
    expect(part('transistors', 'peakFill').getAttribute('style')).toContain('fill: #6b5a17');
  });

  it('selects what is clicked, tells the extension, and clears the selection on empty canvas', () => {
    pointer(part('radio', 'peakFill'), 'click', 230, 128);
    expect(group('radio').classList.contains('adp-selected')).toBe(true);
    expect(sent).toContainEqual({ v: 2, type: 'selection', ids: ['radio'] });
    pointer(surface(), 'click', 5, 5);
    expect(sent[sent.length - 1]).toEqual({ v: 2, type: 'selection', ids: [] });
  });

  it('does not select a node that is not selectable', () => {
    canvas.receive(viewMessage(withNode({ ...node('radio'), selectable: false })));
    pointer(part('radio', 'peakFill'), 'click', 230, 128);
    expect(sent.filter((message) => message.type === 'selection' && message.ids.length > 0)).toEqual([]);
  });

  it('shows the notice of the scene, and none when there is none', () => {
    const notice = document.querySelector('.adp-notice') as HTMLElement;
    expect(notice.hidden).toBe(true);
    canvas.receive(viewMessage({ ...scene, readOnly: true, notice: 'This file is opened read-only.' }));
    expect([notice.hidden, notice.textContent]).toEqual([false, 'This file is opened read-only.']);
  });

  it('adds an ADP Toolbox entry dropped on it where it was dropped, and one activated in its view at the centre', () => {
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.assign(drop, { clientX: 120, clientY: 64, dataTransfer: { getData: (kind: string) => (kind === 'application/x-adp-toolbox' ? 'trend' : '') } });
    surface().dispatchEvent(drop);
    canvas.receive({ v: 2, type: 'addAtCentre', entry: 'note' });
    expect(requests()).toEqual([{ kind: 'drop', entry: 'trend', x: 120, y: 64 }, { kind: 'drop', entry: 'note', x: 0, y: 0 }]);
  });
});

describe('gestures on a scene', () => {
  it('moves a node with the pointer, and asks for the move with the new top-left of its box', () => {
    // The radio is at 216,112; a press in its middle, away from its edges, moves it.
    pointer(part('radio', 'peakFill'), 'pointerdown', 230, 128);
    pointer(window, 'pointermove', 241, 190);
    expect(group('radio').getAttribute('transform')).toBe('translate(11 62)');
    pointer(window, 'pointerup', 241, 190);
    expect(requests()).toEqual([{ kind: 'move', id: 'radio', x: 227, y: 174 }]);
    expect(sent.at(-1)).toMatchObject({ v: 2, type: 'edit', version: 7 });
    canvas.receive({ v: 2, type: 'outcome', seq: 1, result: 'refused', sentence: 'No.' });
    expect(group('radio').getAttribute('transform')).toBeNull();
  });

  it('moves a node only along the axes it may be moved on', () => {
    canvas.receive(viewMessage(withNode({ ...node('radio'), movable: { x: true, y: false } })));
    drag(part('radio', 'peakFill'), [230, 128], [241, 190]);
    canvas.receive(viewMessage(withNode({ ...node('radio'), movable: { x: false, y: false } })));
    drag(part('radio', 'peakFill'), [230, 128], [60, 400]);
    expect(requests()).toEqual([{ kind: 'move', id: 'radio', x: 227, y: 112 }]);
  });

  it('does not ask for anything when a press is let go where it began, or when a newer view arrives while it runs', () => {
    pointer(part('radio', 'peakFill'), 'pointerdown', 230, 128);
    pointer(window, 'pointerup', 230, 128);
    pointer(part('radio', 'peakFill'), 'pointerdown', 230, 128);
    pointer(window, 'pointermove', 260, 128);
    canvas.receive(viewMessage());
    pointer(window, 'pointerup', 300, 128);
    expect(requests()).toEqual([]);
  });

  it('resizes a selected node by the sides it may be resized by, and asks for the new bounds', () => {
    pointer(part('radio', 'peakFill'), 'click', 230, 128);
    expect([...document.querySelectorAll('.adp-overlay [data-resize]')].map((handle) => handle.getAttribute('data-resize'))).toEqual(['left', 'right']);
    drag(document.querySelector('[data-resize="right"]')!, [300, 128], [322, 128]);
    expect(requests()).toEqual([{ kind: 'resize', id: 'radio', side: 'right', bounds: { x: 216, y: 112, width: 106, height: 32 } }]);

    pointer(group('note-2').querySelector('.adp-shape')!, 'click', 250, 290);
    expect(document.querySelectorAll('.adp-overlay [data-resize]')).toHaveLength(5);
    drag(document.querySelector('[data-resize="corner"]')!, [360, 320], [381, 331]);
    expect(requests()[1]).toEqual({ kind: 'resize', id: 'note-2', side: 'corner', bounds: { x: 240, y: 280, width: 141, height: 51 } });
  });

  it('shows the visible handles of a selected node, and asks to move the one that is dragged by its index and the x it is let go at', () => {
    pointer(part('transistors', 'peakFill'), 'click', 210, 72);
    const handles = [...document.querySelectorAll('.adp-overlay [data-handle]')];
    expect(handles.map((handle) => [handle.getAttribute('data-handle'), handle.getAttribute('cx')])).toEqual([['0', '240'], ['1', '280'], ['2', '320']]);
    drag(handles[1], [280, 72], [293, 72]);
    expect(requests()).toEqual([{ kind: 'handle', id: 'transistors', handle: 1, x: 293 }]);
  });

  it('draws an edge from a press on the edge of a part an end may be on, to the node it is let go over, with the part, the side and how far along on each', () => {
    const target = part('radio', 'peakFill');
    document.elementFromPoint = () => target;
    // The bottom edge of the transistors' first phase, to the top edge of the radio's.
    drag(part('transistors', 'peakFill'), [212, 87], [222, 113]);
    expect(requests()).toEqual([{ kind: 'connect', from: 'transistors', to: 'radio', fromEnd: 'peak/bottom/0.5', toEnd: 'peak/top/0.5' }]);
  });

  it('draws an edge with the right button from anywhere on a node that may be connected, and nothing from one that may not', () => {
    const target = part('radio', 'peakFill');
    document.elementFromPoint = () => target;
    // The trigger has no part an end is on, so the edge says only which nodes it joins.
    drag(group('transistor-invented').querySelector('.adp-shape')!, [190, 72], [222, 113], 2);
    drag(group('note-1').querySelector('.adp-shape')!, [250, 200], [222, 113], 2);
    expect(requests()).toEqual([{ kind: 'connect', from: 'transistor-invented', to: 'radio', toEnd: 'peak/top/0.5' }]);
  });

  it('draws nothing when an edge is let go over empty canvas', () => {
    document.elementFromPoint = () => null;
    drag(part('transistors', 'peakFill'), [212, 87], [228, 500]);
    expect(requests()).toEqual([]);
  });

  it('shows a handle on each end of a selected edge that is on a part, and asks to move the one that is dragged', () => {
    pointer(group('i-13').querySelector('.adp-relation-hit')!, 'click', 250, 100);
    const ends = [...document.querySelectorAll('.adp-overlay [data-end]')];
    expect(ends.map((end) => [end.getAttribute('data-end'), end.getAttribute('cx'), end.getAttribute('cy')])).toEqual([['from', '284', '88'], ['to', '217.2', '112']]);
    // Along the top of the radio, into its second phase, which runs from 228 to 256.
    drag(ends[1], [217, 112], [242, 113]);
    expect(requests()).toEqual([{ kind: 'moveEnd', id: 'i-13', end: 'to', value: 'trough/top/0.5' }]);

    // The edge from the trigger leaves it at an anchor and no part, so only its other end has a handle.
    pointer(group('i-12').querySelector('.adp-relation-hit')!, 'click', 200, 60);
    expect([...document.querySelectorAll('.adp-overlay [data-end]')].map((end) => end.getAttribute('data-end'))).toEqual(['to']);
  });

  it('opens the label of what is double-clicked for editing in place, and asks to rename on Enter', () => {
    pointer(part('radio', 'peakFill'), 'dblclick', 230, 128);
    const box = document.querySelector('.adp-inline-editor') as HTMLInputElement;
    expect([box.tagName, box.value]).toEqual(['INPUT', 'Transistor radio']);
    expect(sent).toContainEqual({ v: 2, type: 'editing', active: true });
    box.value = 'Pocket radio';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(requests()).toEqual([{ kind: 'rename', id: 'radio', text: 'Pocket radio' }]);
  });

  it('edits the text a label is edited as, on several lines when the label says so, and when the extension asks for it', () => {
    pointer(group('transistor-invented').querySelector('.adp-shape')!, 'dblclick', 190, 72);
    // The trigger is drawn with its year; its name alone is edited.
    expect((document.querySelector('.adp-inline-editor') as HTMLInputElement).value).toBe('Transistor invented');
    canvas.receive({ v: 2, type: 'reveal', id: 'note-1', editLabel: true, multiline: true });
    const box = document.querySelector('.adp-inline-editor') as HTMLTextAreaElement;
    expect([box.tagName, box.value]).toEqual(['TEXTAREA', 'Dates are illustrative.\n\nSee the readme.']);
    expect(group('note-1').classList.contains('adp-selected')).toBe(true);
    pointer(group('note-2').querySelector('.adp-shape')!, 'dblclick', 250, 290);
    expect(document.querySelector('.adp-inline-editor')?.tagName).toBe('TEXTAREA');
  });

  it('leaves a label that is edited in a form to ADP Properties, and opens nothing for one that is not edited', () => {
    const [name] = node('radio').labels;
    canvas.receive(viewMessage(withNode({ ...node('radio'), labels: [{ ...name, editable: 'form' }] })));
    pointer(part('radio', 'peakFill'), 'dblclick', 230, 128);
    expect(requests()).toEqual([{ kind: 'action', action: 'editLabel', id: 'radio' }]);
    canvas.receive(viewMessage(withNode({ ...node('radio'), labels: [{ ...name, editable: false }] })));
    pointer(part('radio', 'peakFill'), 'dblclick', 230, 128);
    expect(requests()).toHaveLength(1);
    expect(document.querySelector('.adp-inline-editor')).toBeNull();
  });

  it('opens the context menu with the actions the extension sends for what was pointed at, and asks for the one chosen', () => {
    pointer(part('radio', 'peakFill'), 'contextmenu', 230, 128, 2);
    expect(sent.at(-1)).toEqual({ v: 2, type: 'selection', ids: ['radio'] });
    canvas.receive(viewMessage(scene, actions));
    const items = [...document.querySelectorAll('.adp-menu-item')];
    expect(items.map((item) => item.querySelector('.adp-menu-label')?.textContent)).toEqual(['Rename…', 'Remove']);
    (items[1] as HTMLElement).click();
    expect(requests()).toEqual([{ kind: 'action', action: 'delete', id: 'radio' }]);
  });

  it('asks for an action of the empty canvas at the point that was clicked', () => {
    pointer(surface(), 'contextmenu', 40, 300, 2);
    canvas.receive(viewMessage(scene, [{ id: 'arrange', label: 'Arrange diagram', enabled: true }]));
    (document.querySelector('.adp-menu-item') as HTMLElement).click();
    expect(requests()).toEqual([{ kind: 'action', action: 'arrange', x: 40, y: 300 }]);
  });

  it('offers nothing that edits on a read-only scene', () => {
    canvas.receive(viewMessage({ ...scene, readOnly: true }));
    const target = part('radio', 'peakFill');
    document.elementFromPoint = () => target;
    pointer(target, 'click', 230, 128);
    expect(group('radio').classList.contains('adp-selected')).toBe(true);
    expect(document.querySelectorAll('.adp-overlay *')).toHaveLength(0);
    drag(target, [230, 128], [330, 128]);
    drag(part('transistors', 'peakFill'), [212, 87], [222, 113]);
    drag(part('transistors', 'peakFill'), [212, 72], [222, 113], 2);
    pointer(target, 'dblclick', 230, 128);
    pointer(target, 'contextmenu', 230, 128, 2);
    canvas.receive({ v: 2, type: 'addAtCentre', entry: 'note' });
    expect(document.querySelector('.adp-inline-editor')).toBeNull();
    expect(requests()).toEqual([]);
  });
});

describe('a scene of nodes that hold nodes', () => {
  // A mind map's nodes are placed by its layout, so none is movable, and one with children folds.
  const fixed = { x: false, y: false };
  const tree: Scene = { ...scene, nodes: scene.nodes.map((one) => ({ ...one, movable: fixed, connectable: false, ...(one.id === 'radio' ? { fold: 'unfolded' } : {}) })) };

  beforeEach(() => canvas.receive(viewMessage(tree)));

  it('asks to fold a node whose fold marker is clicked, and to unfold one that is folded', () => {
    pointer(group('radio').querySelector('[data-fold]')!, 'click', 258, 144);
    canvas.receive(viewMessage(withNode({ ...node('radio'), fold: 'folded' } as SceneNode)));
    pointer(group('radio').querySelector('[data-fold]')!, 'click', 258, 144);
    expect(requests()).toEqual([{ kind: 'fold', id: 'radio', folded: true }, { kind: 'fold', id: 'radio', folded: false }]);
  });

  it('asks to fold in a read-only scene too, since a fold writes nothing', () => {
    canvas.receive(viewMessage({ ...tree, readOnly: true }));
    pointer(group('radio').querySelector('[data-fold]')!, 'click', 258, 144);
    expect(requests()).toEqual([{ kind: 'fold', id: 'radio', folded: true }]);
  });

  it('does not take a press or a double click on the fold marker for a drag or an edit', () => {
    const marker = group('radio').querySelector('[data-fold]')!;
    drag(marker, [258, 144], [210, 72]);
    pointer(marker, 'dblclick', 258, 144);
    expect(requests()).toEqual([]);
    expect(document.querySelector('.adp-inline-editor')).toBeNull();
  });

  it('asks to put a node that is dragged onto another under it, and shows where it would go while it is dragged', () => {
    // The second note, at 240,280, onto the transistors, at 200,56 and 160 by 32.
    pointer(group('note-2').querySelector('.adp-shape')!, 'pointerdown', 250, 290);
    pointer(window, 'pointermove', 150, 250);
    expect(group('note-2').getAttribute('transform')).toBe('translate(-100 -40)');
    expect(document.querySelector('.adp-drop-target')).toBeNull();
    pointer(window, 'pointermove', 230, 70);
    expect(group('note-2').getAttribute('transform')).toBe('translate(-20 -220)');
    expect(group('transistors').classList.contains('adp-drop-target')).toBe(true);
    pointer(window, 'pointerup', 230, 70);
    expect(requests()).toEqual([{ kind: 'reparent', id: 'note-2', parent: 'transistors' }]);
    expect(group('note-2').getAttribute('transform')).toBeNull();
    expect(document.querySelector('.adp-drop-target')).toBeNull();
  });

  it('asks for nothing when the node is let go over empty canvas, and puts it back', () => {
    drag(group('note-2').querySelector('.adp-shape')!, [250, 290], [20, 400]);
    expect(requests()).toEqual([]);
    expect(group('note-2').getAttribute('transform')).toBeNull();
  });

  it('moves a node that is movable where it is let go, also over another node', () => {
    canvas.receive(viewMessage(scene));
    drag(group('note-2').querySelector('.adp-shape')!, [250, 290], [230, 70]);
    expect(requests()).toEqual([{ kind: 'move', id: 'note-2', x: 220, y: 60 }]);
  });

  it('adds an ADP Toolbox entry dropped on a node at the point it was dropped, for the tool type to find the node', () => {
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.assign(drop, { clientX: 230, clientY: 128, dataTransfer: { getData: (kind: string) => (kind === 'application/x-adp-toolbox' ? 'child' : '') } });
    group('radio').querySelector('.adp-shape')!.dispatchEvent(drop);
    expect(requests()).toEqual([{ kind: 'drop', entry: 'child', x: 230, y: 128 }]);
  });
});

describe('the keys of a scene', () => {
  const offered: Action[] = [
    { id: 'addSibling', label: 'Add sibling', shortcut: 'Enter', enabled: true },
    { id: 'toggleFold', label: 'Collapse', shortcut: 'Space', enabled: true },
    { id: 'addChild', label: 'Add child', shortcut: 'Insert', enabled: false, disabledReason: 'Not here.' },
    { id: 'reorder', label: 'Move up', shortcut: 'Ctrl+Up', enabled: true },
    { id: 'delete', label: 'Remove', shortcut: 'Delete', enabled: true },
    { id: 'editLabel', label: 'Rename…', shortcut: 'F2', enabled: true },
  ];
  const key = (target: EventTarget, name: string, more: KeyboardEventInit = {}): boolean =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...more }));

  beforeEach(() => {
    pointer(part('radio', 'peakFill'), 'click', 230, 128);
    canvas.receive(viewMessage(scene, offered));
  });

  it('ask for the action the view offers under the key that is pressed, on what is selected', () => {
    expect(key(surface(), 'Enter')).toBe(false);
    key(surface(), ' ');
    key(surface(), 'ArrowUp', { ctrlKey: true });
    expect(requests()).toEqual([
      { kind: 'action', action: 'addSibling', id: 'radio' }, { kind: 'action', action: 'toggleFold', id: 'radio' }, { kind: 'action', action: 'reorder', id: 'radio' },
    ]);
  });

  it('ask for nothing under a key no action has, a key with another modifier, or the key of an action that is not enabled', () => {
    expect(key(surface(), 'a')).toBe(true);
    key(surface(), 'Enter', { shiftKey: true });
    key(surface(), 'Insert');
    expect(requests()).toEqual([]);
  });

  it('leave to the extension the keys its own commands are bound to, so an action is not asked for twice', () => {
    key(surface(), 'Delete');
    key(surface(), 'F2');
    expect(requests()).toEqual([]);
  });

  it('are the text box\'s own while something is typed', () => {
    key(document.querySelector('.adp-filter-input')!, 'Enter');
    expect(requests()).toEqual([]);
  });

  it('are not a view model\'s: its keys stay the extension\'s', () => {
    const source = { text: read('fixtures/gartner-hypecycle-graph/triggers-and-notes.ghg') };
    canvas.receive(viewMessage(handCoded.view(source, {}), offered));
    key(surface(), 'Enter');
    expect(requests()).toEqual([]);
  });
});

describe('what a scene shows around the drawing', () => {
  const options = (): Extract<FromCanvas, { type: 'viewOptions' }>['options'] => (sent.at(-1) as Extract<FromCanvas, { type: 'viewOptions' }>).options;

  it('is the ruler, at the finest level whose ticks have room, with the ticks in view', () => {
    // At a zoom of one, 4 units are too close and 400 are far enough apart; only the tick at 0 is in view.
    const ticks = [...document.querySelectorAll('.adp-ruler-tick')] as HTMLElement[];
    expect(ticks.map((tick) => [tick.textContent, tick.getAttribute('style')])).toEqual([['1900', 'left: 0px']]);
    canvas.receive(viewMessage({ ...scene, chrome: { ...scene.chrome!, rulers: [] } }));
    expect((document.querySelector('.adp-ruler') as HTMLElement).hidden).toBe(true);
  });

  it('is the filter, which asks for the view with its value by the filter\'s id; none of it is an edit', () => {
    const input = document.querySelector('.adp-filter-input') as HTMLInputElement;
    expect(input.placeholder).toBe('Filter by tags');
    expect([...document.querySelectorAll('#adp-filter-tags option')].map((option) => option.getAttribute('value'))).toEqual(['electronics', 'invention']);
    input.value = 'electronics';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(sent.at(-1)).toMatchObject({ v: 2, type: 'viewOptions', options: { filters: { tags: { value: ['electronics'], match: 'any' } } } });
    expect(options().viewpoint).toBeUndefined();
    expect(requests()).toEqual([]);
  });

  it('is the toggle of a viewpoint, which asks for the view in that viewpoint, and in the default one when it is turned off', () => {
    const toggle = document.querySelector('#adp-compact') as HTMLInputElement;
    expect([toggle.checked, document.querySelector('.adp-compact')?.textContent]).toEqual([false, 'Compact']);
    toggle.click();
    expect(options()).toMatchObject({ viewpoint: 'compact', filters: { tags: { value: [], match: 'any' } } });
    toggle.click();
    expect('viewpoint' in options()).toBe(false);
    // The view that follows says whether the toggle is on.
    canvas.receive(viewMessage({ ...scene, chrome: { ...scene.chrome!, toggles: [{ viewpoint: 'compact', label: 'Compact', on: true }] } }));
    expect(toggle.checked).toBe(true);
  });

  it('is the legend, each entry in its colour, and the background', () => {
    expect([...document.querySelectorAll('.adp-legend li')].map((entry) => entry.textContent)).toEqual(['Peak', 'Note']);
    expect([...document.querySelectorAll('.adp-legend-swatch')].map((swatch) => swatch.getAttribute('style'))).toEqual(['background: #f7e7a1', 'background: #fef9c3']);
    expect(document.querySelector('.adp-stage')?.getAttribute('style')).toBe('background: #fafafa');
  });

  it('is nothing for a scene that states none', () => {
    canvas.receive(viewMessage({ ...scene, chrome: { rulers: [], filters: [], toggles: [], legend: [] } }));
    expect((document.querySelector('.adp-panel') as HTMLElement).hidden).toBe(true);
    expect(document.querySelector('.adp-stage')?.getAttribute('style') ?? '').toBe('');
  });
});

describe('the canvas, sent a view model', () => {
  it('draws it with its type\'s notation as before, and asks as before', () => {
    const source = { text: read('fixtures/gartner-hypecycle-graph/triggers-and-notes.ghg') };
    canvas.receive(viewMessage(handCoded.view(source, {})));
    expect(group('transistors').querySelectorAll('.adp-segment')).toHaveLength(4);
    expect(document.querySelector('.adp-surface')?.getAttribute('aria-label')).toBe('Gartner hype cycle graph');
    expect(document.querySelector('.adp-stage')?.getAttribute('style') ?? '').toBe('');
    drag(group('radio').querySelector('.adp-segment')!, [230, 128], [241, 190]);
    expect(requests()).toEqual([{ kind: 'move', id: 'radio', x: 228, y: 168 }]);
  });
});
