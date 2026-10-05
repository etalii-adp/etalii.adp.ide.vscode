import { beforeEach, describe, expect, it } from 'vitest';
import type { EditRequest } from '../../../src/core/frame/diagramType';
import type { FromCanvas, ToCanvas } from '../../../src/core/frame/protocol';
import { gartnerHypecycleGraph as type } from '../../../src/core/gartner-hypecycle-graph/index';
import { Canvas } from '../../../src/webview/diagram/canvas';
import '../../../src/webview/tools';
import { read } from '../../core/files';

// The canvas in a simulated browser. There is no layout there, so the surface is at the origin at
// a zoom of one and a pointer position in pixels is the same position in canvas units.

const source = { text: read('fixtures/gartner-hypecycle-graph/triggers-and-notes.ghg') };

let canvas: Canvas;
let sent: FromCanvas[];

const viewMessage = (selection: string[] = [], options = {}): ToCanvas => ({
  v: 1, type: 'view', origin: type.origin, view: type.view(source, options), toolbox: type.toolbox(source), actions: type.actions(source, selection), version: 7,
});
const requests = (): EditRequest[] => sent.filter((message) => message.type === 'edit').map((message) => (message as Extract<FromCanvas, { type: 'edit' }>).request);
const group = (id: string): Element => document.querySelector(`.adp-content [data-id="${id}"]`)!;
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
  sent = [];
  canvas = new Canvas(document.body, (message) => sent.push(message));
  canvas.receive(viewMessage());
});

describe('the canvas', () => {
  it('draws every element and relation of the view it is sent, relations beneath elements', () => {
    const drawn = [...document.querySelectorAll('.adp-content > [data-id]')].map((element) => element.getAttribute('data-id'));
    expect(drawn).toEqual(['i-12', 'i-13', 'transistors', 'radio', 'transistor-invented', 'note-1', 'note-2']);
    expect(document.querySelector('.adp-surface')?.getAttribute('aria-label')).toBe('Gartner hype cycle graph');
  });

  it('selects what is clicked, tells the extension, and clears the selection on empty canvas', () => {
    pointer(group('radio').querySelector('.adp-segment')!, 'click', 230, 128);
    expect(group('radio').classList.contains('adp-selected')).toBe(true);
    expect(sent).toContainEqual({ v: 1, type: 'selection', ids: ['radio'] });
    pointer(document.querySelector('.adp-surface')!, 'click', 5, 5);
    expect(sent[sent.length - 1]).toEqual({ v: 1, type: 'selection', ids: [] });
  });

  it('shows the toolbox it is sent, and adds an entry at the centre of the view when it is activated', () => {
    const entries = [...document.querySelectorAll('.adp-toolbox-entry')];
    expect(entries.map((entry) => entry.textContent)).toEqual(['Trend', 'Trigger', 'Note']);
    expect(entries[0].getAttribute('title')).toBe('A trend through the hype cycle. Drop it where it starts; it is a year long with all four phases.');
    expect(entries[0].getAttribute('draggable')).toBe('true');
    (entries[2] as HTMLElement).click();
    expect(requests()).toEqual([{ kind: 'drop', entry: 'ghg.add.note', x: 0, y: 0 }]);
  });

  it('shows the sentence of a refusal where the user is working', () => {
    canvas.receive({ v: 1, type: 'outcome', seq: 1, result: 'refused', sentence: 'A trend cannot influence itself.' });
    const status = document.querySelector('.adp-status') as HTMLElement;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe('A trend cannot influence itself.');
  });

  it('offers nothing that edits on a read-only view', () => {
    const view = { ...type.view(source, {}), readOnly: true };
    canvas.receive({ v: 1, type: 'view', origin: type.origin, view, toolbox: [], actions: [], version: 8 });
    expect((document.querySelector('.adp-toolbox') as HTMLElement).hidden).toBe(true);
    drag(group('radio').querySelector('.adp-segment')!, [230, 128], [330, 128]);
    expect(requests()).toEqual([]);
  });
});

describe('gestures', () => {
  it('moves an element by whole steps and rows, and asks for the move with its new top-left', () => {
    // The radio is at 216,112; a press in its middle, away from its edges, moves it.
    drag(group('radio').querySelector('.adp-segment')!, [230, 128], [241, 190]);
    expect(requests()).toEqual([{ kind: 'move', id: 'radio', x: 228, y: 168 }]);
    expect(sent.at(-1)).toMatchObject({ type: 'edit', version: 7 });
  });

  it('does not ask for anything when a press is let go where it began', () => {
    const phase = group('radio').querySelector('.adp-segment')!;
    pointer(phase, 'pointerdown', 230, 128);
    pointer(window, 'pointerup', 230, 128);
    expect(requests()).toEqual([]);
  });

  it('gives a gesture up when a newer view arrives while it runs', () => {
    pointer(group('radio').querySelector('.adp-segment')!, 'pointerdown', 230, 128);
    pointer(window, 'pointermove', 260, 128);
    canvas.receive(viewMessage());
    pointer(window, 'pointerup', 300, 128);
    expect(requests()).toEqual([]);
  });

  it('shows a handle on each drawn boundary of a selected trend, and asks to move the one that is dragged', () => {
    pointer(group('transistors').querySelector('.adp-segment')!, 'click', 210, 72);
    const handles = [...document.querySelectorAll('.adp-overlay [data-handle]')];
    expect(handles.map((handle) => [handle.getAttribute('data-handle'), handle.getAttribute('cx')])).toEqual([['0', '240'], ['1', '280'], ['2', '320']]);
    drag(handles[0], [240, 72], [253, 72]);
    expect(requests()).toEqual([{ kind: 'handle', id: 'transistors', handle: 0, x: 252 }]);
  });

  it('resizes a trend by its left or right side to a step, and a note by any side', () => {
    pointer(group('radio').querySelector('.adp-segment')!, 'click', 230, 128);
    expect([...document.querySelectorAll('.adp-overlay [data-resize]')].map((handle) => handle.getAttribute('data-resize'))).toEqual(['left', 'right']);
    drag(document.querySelector('[data-resize="right"]')!, [300, 128], [322, 128]);
    expect(requests()).toEqual([{ kind: 'resize', id: 'radio', side: 'right', bounds: { x: 216, y: 112, width: 108, height: 32 } }]);

    pointer(group('note-2').querySelector('rect')!, 'click', 250, 290);
    expect(document.querySelectorAll('.adp-overlay [data-resize]')).toHaveLength(5);
    drag(document.querySelector('[data-resize="corner"]')!, [360, 320], [381, 331]);
    expect(requests()[1]).toEqual({ kind: 'resize', id: 'note-2', side: 'corner', bounds: { x: 240, y: 280, width: 140, height: 51 } });
  });

  it('draws an influence from a press on a trend\'s edge to the trend it is let go over, with where it attaches on each', () => {
    const target = group('radio').querySelector('.adp-segment')!;
    document.elementFromPoint = () => target;
    // The bottom edge of the transistors' Peak, to the top edge of the radio.
    drag(group('transistors').querySelector('.adp-segment')!, [212, 87], [222, 113]);
    expect(requests()).toEqual([{ kind: 'connect', from: 'transistors', to: 'radio', fromEnd: 'peak/bottom/0.5', toEnd: 'peak/top/0.5' }]);
  });

  it('draws nothing when an influence is let go over empty canvas', () => {
    document.elementFromPoint = () => null;
    drag(group('transistors').querySelector('.adp-segment')!, [212, 87], [228, 500]);
    expect(requests()).toEqual([]);
  });

  it('opens the text of what is double-clicked for editing in place, and asks to rename on Enter', () => {
    pointer(group('radio').querySelector('.adp-segment')!, 'dblclick', 230, 128);
    const box = document.querySelector('.adp-inline-editor') as HTMLInputElement;
    expect(box.value).toBe('Transistor radio');
    expect(sent).toContainEqual({ v: 1, type: 'editing', active: true });
    box.value = 'Pocket radio';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(requests()).toEqual([{ kind: 'rename', id: 'radio', text: 'Pocket radio' }]);
    expect(document.querySelector('.adp-inline-editor')).toBeNull();
  });

  it('gives an edit in place up on Escape', () => {
    canvas.receive({ v: 1, type: 'reveal', id: 'note-1', editLabel: true, multiline: true });
    const box = document.querySelector('.adp-inline-editor') as HTMLTextAreaElement;
    expect(box.tagName).toBe('TEXTAREA');
    box.value = 'Something else';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(requests()).toEqual([]);
  });
});

describe('the menu and the panel', () => {
  it('opens the context menu with the actions for what was pointed at, once the extension has sent them', () => {
    pointer(group('radio').querySelector('.adp-segment')!, 'contextmenu', 230, 128, 2);
    expect(sent.at(-1)).toEqual({ v: 1, type: 'selection', ids: ['radio'] });
    canvas.receive(viewMessage(['radio']));
    const items = [...document.querySelectorAll('.adp-menu-item')];
    expect(items.map((item) => item.querySelector('.adp-menu-label')?.textContent)).toEqual(['Rename…', 'Remove', 'Arrange diagram']);
    (items[1] as HTMLElement).click();
    expect(requests()).toEqual([{ kind: 'action', action: 'ghg.remove', id: 'radio' }]);
  });

  it('filters by tag chips with an Any or All switch, and has a Compact switch; none of it is an edit', () => {
    const input = document.querySelector('.adp-filter-input') as HTMLInputElement;
    expect(input.placeholder).toBe('Filter by tags');
    expect([...document.querySelectorAll('#adp-filter-tags option')].map((option) => option.getAttribute('value'))).toEqual(['electronics', 'invention']);
    input.value = 'electronics';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(sent.at(-1)).toMatchObject({ type: 'viewOptions', options: { filterTags: ['electronics'], filterMode: 'any', compact: false } });
    expect(document.querySelector('.adp-chip')?.textContent).toBe('electronics×');

    (document.querySelector('#adp-compact') as HTMLInputElement).click();
    const options = (sent.at(-1) as Extract<FromCanvas, { type: 'viewOptions' }>).options;
    expect(options).toMatchObject({ filterTags: ['electronics'], compact: true });
    expect(options.viewport).toBeUndefined();
    expect(requests()).toEqual([]);
  });

  it('shows the legend of the phases in their colours', () => {
    expect([...document.querySelectorAll('.adp-legend li')].map((entry) => entry.textContent)).toEqual(['Peak', 'Trough', 'Slope', 'Plateau']);
    expect(document.querySelector('.adp-legend-swatch')?.classList.contains('ghg-peak')).toBe(true);
  });
});
