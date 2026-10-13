import { beforeEach, describe, expect, it } from 'vitest';
import type { FromCanvas, ToCanvas } from '../../../src/core/frame/protocol';
import type { Source, ViewOptions } from '../../../src/core/frame/toolType';
import { Canvas } from '../../../src/webview/diagram/canvas';
import { read } from '../../core/files';
import { diagram, group, pointer, requestsOf } from '../support';

// The canvas on the hype cycle graph, in a simulated browser (etalii.adp spec 027, task T124): what
// spec 006 tested with the hand-written diagram, named through the tool type its definition gives.
// What the canvas does with any scene is in canvasScene.test.ts; here it is sent what the extension
// sends for a real document: the tool type's own scene and its own actions.

const type = diagram('gartner-hype-cycle-graph');
const source: Source = { fileName: 'triggers-and-notes.ghg', text: read('fixtures/gartner-hypecycle-graph/triggers-and-notes.ghg') };

let canvas: Canvas;
let sent: FromCanvas[];

const viewMessage = (selection: string[] = [], options: ViewOptions = {}): ToCanvas => ({
  v: 2, type: 'view', origin: type.origin, kind: 'diagram', view: type.view(source, options), actions: type.actions(source, selection), version: 7,
});
const requests = () => requestsOf(sent);
const part = (id: string, name: string): Element => group(id).querySelector(`[data-part="${name}"]`)!;
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
    expect(document.querySelector('.adp-surface')?.getAttribute('role')).toBe('application');
  });

  it('adds an ADP Toolbox entry activated in its view at the centre of what it shows, under the id the tool type gives it', () => {
    const entry = type.toolbox(source)[2].id;
    canvas.receive({ v: 2, type: 'addAtCentre', entry });
    expect(requests()).toEqual([{ kind: 'drop', entry: 'ghg.add.note', x: 0, y: 0 }]);
  });

  it('shows the sentence of a refusal where the user is working', () => {
    const outcome = type.edit(source, { kind: 'connect', from: 'radio', to: 'radio' }, {}, false);
    canvas.receive({ v: 2, type: 'outcome', seq: 1, result: 'refused', sentence: outcome.kind === 'refused' ? outcome.sentence : '' });
    const status = document.querySelector('.adp-status') as HTMLElement;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe('A trend cannot influence itself.');
  });

  it('shows why a document that cannot be read is empty, and offers nothing that edits on it', () => {
    const unread: Source = { fileName: 'not-yaml.ghg', text: read('fixtures/gartner-hypecycle-graph/not-yaml.ghg') };
    canvas.receive({ v: 2, type: 'view', origin: type.origin, kind: 'diagram', view: type.view(unread, {}), actions: [], version: 8 });
    expect(document.querySelector('.adp-notice')?.textContent).toBe('The graph could not be read, so it cannot be edited.');
    canvas.receive({ v: 2, type: 'addAtCentre', entry: 'ghg.add.note' });
    expect(requests()).toEqual([]);
  });

  it('offers nothing that edits on a read-only view', () => {
    canvas.receive({ v: 2, type: 'view', origin: type.origin, kind: 'diagram', view: { ...type.view(source, {}), readOnly: true }, actions: [], version: 8 });
    canvas.receive({ v: 2, type: 'addAtCentre', entry: 'ghg.add.note' });
    drag(part('radio', 'peak'), [230, 128], [330, 128]);
    expect(requests()).toEqual([]);
  });
});

describe('gestures', () => {
  it('moves a trend with the pointer, and asks for the move with its new top-left, which the tool type lands on a step and a row', () => {
    // The radio is at 216,112; a press in its middle, away from its edges, moves it.
    drag(part('radio', 'peak'), [230, 128], [241, 190]);
    expect(requests()).toEqual([{ kind: 'move', id: 'radio', x: 227, y: 174 }]);
    expect(sent.at(-1)).toMatchObject({ type: 'edit', version: 7 });
    expect(type.edit(source, requests()[0], {}, false).kind).toBe('applied');
  });

  it('draws an influence again while an end of it is dragged along, so it stays attached, and as it was once the view answers', () => {
    const end = (): number[] => group('i-13').querySelector('.adp-line')!.getAttribute('d')!.split(/[ ,]+/).slice(-2).map(Number);
    const before = end();
    pointer(part('radio', 'peak'), 'pointerdown', 230, 128);
    pointer(window, 'pointermove', 241, 190);
    expect(group('radio').getAttribute('transform')).toBe('translate(11 62)');
    expect(end()).toEqual([before[0] + 11, before[1] + 62]);
    pointer(window, 'pointerup', 241, 190);
    canvas.receive({ v: 2, type: 'outcome', seq: 1, result: 'applied' });
    expect(end()).toEqual(before);
    expect(group('radio').getAttribute('transform')).toBeNull();
  });

  it('shows a handle on each drawn boundary of a selected trend, and asks to move the one that is dragged', () => {
    pointer(part('transistors', 'peak'), 'click', 210, 72);
    const handles = [...document.querySelectorAll('.adp-overlay [data-handle]')];
    expect(handles.map((handle) => [handle.getAttribute('data-handle'), handle.getAttribute('cx')])).toEqual([['0', '240'], ['1', '280'], ['2', '320']]);
    drag(handles[0], [240, 72], [253, 72]);
    expect(requests()).toEqual([{ kind: 'handle', id: 'transistors', handle: 0, x: 253 }]);
  });

  it('draws an influence from a press on the edge of a phase to the trend it is let go over, with where it attaches on each', () => {
    const target = part('radio', 'peak');
    document.elementFromPoint = () => target;
    // The bottom edge of the Peak of the transistors, to the top edge of the radio.
    drag(part('transistors', 'peak'), [212, 87], [222, 113]);
    expect(requests()).toEqual([{ kind: 'connect', from: 'transistors', to: 'radio', fromEnd: 'peak/bottom/0.5', toEnd: 'peak/top/0.5' }]);
  });

  it('opens the text of what is double-clicked for editing in place, asks to rename on Enter, and gives the edit up on Escape', () => {
    pointer(part('radio', 'peak'), 'dblclick', 230, 128);
    const box = document.querySelector('.adp-inline-editor') as HTMLInputElement;
    expect(box.value).toBe('Transistor radio');
    box.value = 'Pocket radio';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(requests()).toEqual([{ kind: 'rename', id: 'radio', text: 'Pocket radio' }]);

    canvas.receive({ v: 2, type: 'reveal', id: 'note-1', editLabel: true, multiline: true });
    const note = document.querySelector('.adp-inline-editor') as HTMLTextAreaElement;
    expect(note.tagName).toBe('TEXTAREA');
    note.value = 'Something else';
    note.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(requests()).toHaveLength(1);
  });
});

describe('the menu and the panel', () => {
  it('opens the context menu with the actions for what was pointed at, once the extension has sent them, under the ids the tool type gives them', () => {
    pointer(part('radio', 'peak'), 'contextmenu', 230, 128);
    expect(sent).toContainEqual({ v: 2, type: 'selection', ids: ['radio'] });
    canvas.receive(viewMessage(['radio']));
    const entries = [...document.querySelectorAll<HTMLElement>('.adp-menu [role="menuitem"]')];
    expect(entries.map((entry) => entry.textContent?.replace(/F2|Delete/, '').trim())).toEqual(['Rename…', 'Remove', 'Arrange diagram']);
    entries[1].click();
    expect(requests()).toEqual([{ kind: 'action', action: 'ghg.remove', id: 'radio' }]);
  });

  it('shows the filter by tags, the Compact switch and the legend of the phases in their colours', () => {
    expect(document.querySelector<HTMLInputElement>('.adp-filter-input')?.placeholder).toBe('Filter by tags');
    expect(document.querySelector<HTMLElement>('.adp-compact')?.hidden).toBe(false);
    const legend = [...document.querySelectorAll('.adp-legend li')];
    expect(legend.map((entry) => entry.textContent)).toEqual(['Peak', 'Trough', 'Slope', 'Plateau']);
    expect(new Set(legend.map((entry) => entry.querySelector('.adp-legend-swatch')?.getAttribute('style'))).size).toBe(4);
  });
});
