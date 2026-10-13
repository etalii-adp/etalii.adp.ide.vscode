import { mdiLinkVariant, mdiLockOutline } from '@mdi/js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Action, EditRequest } from '../../../src/core/frame/toolType';
import type { FromCanvas, ToCanvas } from '../../../src/core/frame/protocol';
import { boxOutline } from '../../../src/core/scene/geometry';
import type { Scene, SceneCompartment, SceneNode } from '../../../src/core/scene/scene';
import { Canvas } from '../../../src/webview/diagram/canvas';

// What DISL 0.4 added to a scene, drawn and asked for by the canvas in a simulated browser
// (etalii.adp spec 027, task T088): compartments with their items, the shapes `folder` and
// `hexagon`, icons and a pinned node, the switch of a kept filter, and the menu entries for
// pinning. The scene is the test's own, written out, so nothing here reads a definition: there is
// no layout in a simulated browser, the surface is at the origin at a zoom of one, and a pointer
// position in pixels is the same position in canvas units.

const style = { fill: '#ffffff', stroke: { color: '#64748b', width: 2 }, font: { size: 12 } };
const node = (id: string, type: string, box: SceneNode['box'], more: Partial<SceneNode> = {}): SceneNode => ({
  id, type, box, system: 'canvas', shape: { kind: 'rect', name: 'rect', box }, outline: boxOutline(box), style, params: {}, parts: [], handles: [], labels: [],
  compartments: [], badges: [], pinned: false,
  movable: { x: true, y: true }, resizable: { x: false, y: false }, connectable: true, selectable: true, deletable: true, dimmed: false, ...more,
});

// A specification at 100,100, 240 wide: its name, then its tasks under two headings, the second folded.
const tasks: SceneCompartment = {
  id: 'tasks', box: { x: 100, y: 148, width: 240, height: 84 }, separator: { color: '#94a3b8', width: 1 },
  rows: [
    { kind: 'heading', group: 'progressing', text: 'Progressing', count: 2, collapsed: false, box: { x: 100, y: 152, width: 240, height: 20 } },
    { kind: 'item', element: 't1', text: 'Write the plan', link: 'https://example.org/t1', box: { x: 100, y: 172, width: 240, height: 20 } },
    { kind: 'item', element: 't2', text: 'Try it', box: { x: 100, y: 192, width: 240, height: 20 } },
    { kind: 'heading', group: 'pending', text: 'Pending', count: 3, collapsed: true, box: { x: 100, y: 212, width: 240, height: 20 } },
  ],
};
const specification = node('s1', 'Specification', { x: 100, y: 100, width: 240, height: 136 }, {
  labels: [{
    id: 'name', text: 'Billing', editText: 'Billing', box: { x: 100, y: 100, width: 240, height: 136 }, position: 'top', align: 'center', fontSize: 12, style: {}, editable: 'inline', wrap: 'word', overflow: 'ellipsis',
    maxLines: 1, tooltip: 'Billing',
  }],
  compartments: [tasks],
  badges: [
    { id: 'link', icon: 'mdi-link-variant', box: { x: 322, y: 102, width: 16, height: 16 }, tooltip: 'specs/billing.md', operation: 'openLink' },
    { id: 'pinned', icon: 'mdi-lock-outline', box: { x: 102, y: 102, width: 16, height: 16 }, tooltip: 'Its position is locked.' },
  ],
  pinned: true,
});
// A location at 400,100: its folder, one row that is no element, with a link.
const location = node('l1', 'Location', { x: 400, y: 100, width: 240, height: 64 }, {
  compartments: [{ id: 'folder', box: { x: 400, y: 132, width: 240, height: 28 }, rows: [{ kind: 'item', text: 'worktrees/billing', link: 'C:/git/worktrees/billing', box: { x: 400, y: 136, width: 240, height: 20 } }] }],
});
// A project as a folder and an environment as a hexagon: closed paths, worked out by the scene.
const folderBox = { x: 100, y: 300, width: 180, height: 56 };
const project = node('p1', 'Project', folderBox, {
  shape: {
    kind: 'path', name: 'folder', box: folderBox,
    commands: [{ op: 'M', x: 100, y: 300 }, { op: 'L', x: 172, y: 300 }, { op: 'L', x: 180, y: 312 }, { op: 'L', x: 280, y: 312 }, { op: 'L', x: 280, y: 356 }, { op: 'L', x: 100, y: 356 }, { op: 'Z' }],
  },
});
const hexagonBox = { x: 400, y: 300, width: 160, height: 56 };
const environment = node('e1', 'Environment', hexagonBox, {
  shape: {
    kind: 'path', name: 'hexagon', box: hexagonBox,
    commands: [{ op: 'M', x: 440, y: 300 }, { op: 'L', x: 520, y: 300 }, { op: 'L', x: 560, y: 328 }, { op: 'L', x: 520, y: 356 }, { op: 'L', x: 440, y: 356 }, { op: 'L', x: 400, y: 328 }, { op: 'Z' }],
  },
});

const scene: Scene = {
  viewpoint: 'main', system: 'canvas', nodes: [specification, location, project, environment], edges: [], filtered: [], findings: [], readOnly: false, tokens: {},
  chrome: { rulers: [], toggles: [], legend: [], filters: [{ id: 'archived', label: 'Show archived', control: 'switch', options: [], value: false, match: 'any', matchToggle: false, kept: true }] },
};
const pinning: Action[] = [
  { id: 'editLabel', label: 'Rename', icon: 'mdi-rename-outline', shortcut: 'F2', enabled: true },
  { id: 'unpin', label: 'Unlock position', icon: 'mdi-lock-open-variant-outline', enabled: true },
  { id: 'delete', label: 'Delete', enabled: true },
];

let canvas: Canvas;
let sent: FromCanvas[];

const viewMessage = (view: Scene = scene, offered: readonly Action[] = []): ToCanvas => ({ v: 2, type: 'view', origin: 'test/board', kind: 'diagram', view, actions: offered, version: 3 });
const requests = (): EditRequest[] => sent.filter((message) => message.type === 'edit').map((message) => (message as Extract<FromCanvas, { type: 'edit' }>).request as EditRequest);
const selections = (): (readonly string[])[] => sent.filter((message) => message.type === 'selection').map((message) => (message as Extract<FromCanvas, { type: 'selection' }>).ids);
const group = (id: string): Element => document.querySelector(`.adp-content > [data-id="${id}"]`)!;
const pointer = (target: EventTarget, kind: string, x: number, y: number, button = 0): void => {
  target.dispatchEvent(new MouseEvent(kind, { bubbles: true, cancelable: true, clientX: x, clientY: y, button }));
};
const key = (target: EventTarget, name: string): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: name }));
};

beforeEach(() => {
  document.body.replaceChildren();
  document.body.removeAttribute('class');
  sent = [];
  canvas = new Canvas(document.body, (message) => sent.push(message));
  canvas.receive(viewMessage());
});

describe('a compartment of a node', () => {
  it('is drawn inside its node, with its separator and a row for each heading and item, in their order', () => {
    const drawn = group('s1').querySelector('[data-compartment="tasks"]')!;
    expect(drawn).not.toBeNull();
    const separator = drawn.querySelector('.adp-separator')!;
    expect([separator.getAttribute('x1'), separator.getAttribute('x2'), separator.getAttribute('y1'), separator.getAttribute('y2')]).toEqual(['100', '340', '148', '148']);
    expect(separator.getAttribute('style')).toContain('stroke: #94a3b8');
    expect([...drawn.querySelectorAll('.adp-row')].map((row) => row.querySelector('text')?.textContent)).toEqual(['Progressing (2)', 'Write the plan', 'Try it', 'Pending (3)']);
  });

  it('draws a heading as a button that says whether its group is open', () => {
    const headings = [...group('s1').querySelectorAll('[data-group]')];
    expect(headings.map((heading) => [heading.getAttribute('data-group'), heading.getAttribute('role'), heading.getAttribute('aria-expanded'), heading.getAttribute('tabindex')])).toEqual([
      ['progressing', 'button', 'true', '0'], ['pending', 'button', 'false', '0'],
    ]);
  });

  it('asks to fold an open group and to open a folded one, when its heading is clicked or activated from the keyboard', () => {
    const [open, folded] = [...group('s1').querySelectorAll('[data-group]')];
    pointer(open, 'click', 120, 160);
    pointer(folded, 'click', 120, 220);
    key(folded, 'Enter');
    key(open, ' ');
    expect(requests()).toEqual([
      { kind: 'fold', id: 's1', group: 'progressing', folded: true }, { kind: 'fold', id: 's1', group: 'pending', folded: false },
      { kind: 'fold', id: 's1', group: 'pending', folded: false }, { kind: 'fold', id: 's1', group: 'progressing', folded: true },
    ]);
    // A heading is no element: clicking it selects nothing.
    expect(selections()).toEqual([]);
  });

  it('selects an item that is an element under its own id, and marks it', () => {
    const item = group('s1').querySelector('[data-id="t2"]')!;
    pointer(item, 'click', 150, 200);
    expect(selections()).toEqual([['t2']]);
    expect(item.classList.contains('adp-selected')).toBe(true);
    expect(group('s1').classList.contains('adp-selected')).toBe(false);
  });

  it('gives an item that is no element no id of its own: a click on it selects its node', () => {
    const row = group('l1').querySelector('[data-compartment="folder"] .adp-row')!;
    expect(row.hasAttribute('data-id')).toBe(false);
    pointer(row, 'click', 450, 146);
    expect(selections()).toEqual([['l1']]);
  });

  it('opens the menu of an item that is an element for that item', () => {
    pointer(group('s1').querySelector('[data-id="t1"]')!, 'contextmenu', 150, 180);
    expect(selections()).toEqual([['t1']]);
  });

  it('opens the text of an item that is an element for editing in place, and asks to rename it', () => {
    pointer(group('s1').querySelector('[data-id="t2"]')!, 'dblclick', 150, 200);
    const box = document.querySelector('.adp-inline-editor') as HTMLInputElement | HTMLTextAreaElement;
    expect(box.value).toBe('Try it');
    box.value = 'Try it twice';
    box.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect(requests()).toEqual([{ kind: 'rename', id: 't2', text: 'Try it twice' }]);
  });

  it('opens the text of a new item when the extension reveals it for editing', () => {
    canvas.receive({ v: 2, type: 'reveal', id: 't1', editLabel: true, multiline: false });
    expect((document.querySelector('.adp-inline-editor') as HTMLInputElement).value).toBe('Write the plan');
    expect(group('s1').querySelector('[data-id="t1"]')!.classList.contains('adp-selected')).toBe(true);
  });

  it('moves the node when it is dragged by a row', () => {
    pointer(group('s1').querySelector('[data-id="t2"]')!, 'pointerdown', 150, 200);
    pointer(window, 'pointermove', 170, 230);
    pointer(window, 'pointerup', 170, 230);
    expect(requests()).toEqual([{ kind: 'move', id: 's1', x: 120, y: 130 }]);
  });
});

describe('a link on an item', () => {
  it('is a link symbol at the end of the item\'s line, which says the link when it is hovered or focused', () => {
    const links = [...document.querySelectorAll('.adp-content [data-link]')];
    expect(links.map((link) => [link.closest('.adp-element')?.getAttribute('data-id'), link.getAttribute('role'), link.getAttribute('tabindex'), link.querySelector('title')?.textContent])).toEqual([
      ['s1', 'link', '0', 'https://example.org/t1'], ['l1', 'link', '0', 'C:/git/worktrees/billing'],
    ]);
    expect(links[0].querySelector('path')?.getAttribute('d')).toBe(mdiLinkVariant);
    // At the end of the line: in the right half of the row.
    expect(Number(/^translate\(([\d.]+) /.exec(links[0].getAttribute('transform') ?? '')?.[1])).toBeGreaterThan(220);
    expect(group('s1').querySelector('[data-id="t2"] [data-link]')).toBeNull();
  });

  it('asks to open the link of its item when it is activated, and selects nothing', () => {
    const [ofTask, ofFolder] = [...document.querySelectorAll('.adp-content [data-link]')];
    pointer(ofTask, 'click', 330, 182);
    key(ofFolder, 'Enter');
    expect(requests()).toEqual([{ kind: 'openLink', id: 's1', compartment: 'tasks', item: 0 }, { kind: 'openLink', id: 'l1', compartment: 'folder', item: 0 }]);
    expect(selections()).toEqual([]);
  });

  it('is activated in a scene that cannot be edited too: opening a link writes nothing', () => {
    canvas.receive(viewMessage({ ...scene, readOnly: true }));
    pointer(document.querySelector('.adp-content [data-link]')!, 'click', 330, 182);
    expect(requests()).toEqual([{ kind: 'openLink', id: 's1', compartment: 'tasks', item: 0 }]);
  });
});

describe('the shapes folder and hexagon', () => {
  it('are drawn as the paths the scene worked out, filled and outlined as the node\'s style says', () => {
    const folder = group('p1').querySelector('path.adp-shape')!;
    expect(folder.getAttribute('d')).toBe('M 100 300 L 172 300 L 180 312 L 280 312 L 280 356 L 100 356 Z');
    expect(folder.getAttribute('style')).toContain('fill: #ffffff');
    expect(group('e1').querySelector('path.adp-shape')!.getAttribute('d')).toBe('M 440 300 L 520 300 L 560 328 L 520 356 L 440 356 L 400 328 Z');
  });
});

describe('icons', () => {
  it('a badge is drawn at its place with the icon its name stands for, and says its tooltip', () => {
    const badges = [...group('s1').querySelectorAll('[data-badge]')];
    expect(badges.map((badge) => [badge.getAttribute('data-badge'), badge.querySelector('title')?.textContent])).toEqual([['link', 'specs/billing.md'], ['pinned', 'Its position is locked.']]);
    expect(badges.map((badge) => badge.querySelector('path')?.getAttribute('d'))).toEqual([mdiLinkVariant, mdiLockOutline]);
    expect(badges[0].getAttribute('transform')).toBe('translate(322 102)');
  });

  it('a badge that runs an operation is a button, and asks for the operation on its node when it is activated', () => {
    const [link, lock] = [...group('s1').querySelectorAll('[data-badge]')];
    expect([link.getAttribute('role'), link.getAttribute('tabindex')]).toEqual(['button', '0']);
    expect([lock.getAttribute('role'), lock.getAttribute('tabindex')]).toEqual([null, null]);
    pointer(link, 'click', 330, 110);
    key(link, 'Enter');
    pointer(lock, 'click', 110, 110);
    expect(requests()).toEqual([{ kind: 'action', action: 'openLink', id: 's1' }, { kind: 'action', action: 'openLink', id: 's1' }]);
  });

  it('an entry of a menu is drawn with the icon the definition names, whatever icon that is', () => {
    canvas.receive(viewMessage(scene, pinning));
    pointer(group('s1').querySelector('.adp-shape')!, 'contextmenu', 200, 110);
    canvas.receive(viewMessage(scene, pinning));
    const paths = [...document.querySelectorAll('.adp-menu .adp-icon path')].map((path) => path.getAttribute('d'));
    expect(paths).toHaveLength(3);
    // Two icons no code of this host names: each is its own, and none the generic shape an unknown name gets.
    expect(new Set(paths).size).toBe(3);
  });
});

describe('a pinned node', () => {
  it('is marked as one, and a node the layout places is not', () => {
    expect(group('s1').classList.contains('adp-pinned')).toBe(true);
    expect(group('l1').classList.contains('adp-pinned')).toBe(false);
  });

  it('is unpinned from its menu: the entry asks for the action on the node', () => {
    pointer(group('s1').querySelector('.adp-shape')!, 'contextmenu', 200, 110);
    canvas.receive(viewMessage(scene, pinning));
    const entries = [...document.querySelectorAll('.adp-menu [role="menuitem"]')] as HTMLElement[];
    expect(entries.map((entry) => entry.querySelector('.adp-menu-label')?.textContent)).toEqual(['Rename', 'Unlock position', 'Delete']);
    entries[1].click();
    expect(requests()).toEqual([{ kind: 'action', action: 'unpin', id: 's1' }]);
  });

  it('every pin is taken off from the menu of the empty canvas', () => {
    const all: Action[] = [{ id: 'unpinAll', label: 'Unlock all positions', enabled: true }];
    pointer(document.querySelector('.adp-surface')!, 'contextmenu', 700, 500);
    canvas.receive(viewMessage(scene, all));
    (document.querySelector('.adp-menu [role="menuitem"]') as HTMLElement).click();
    expect(requests()).toEqual([{ kind: 'action', action: 'unpinAll', x: 700, y: 500 }]);
  });
});

describe('the switch of a filter', () => {
  const box = (): HTMLInputElement => document.querySelector('.adp-panel [data-filter="archived"] input[type="checkbox"]') as HTMLInputElement;

  it('is shown with its label and its value', () => {
    expect(document.querySelector('.adp-panel [data-filter="archived"]')?.textContent).toBe('Show archived');
    expect(box().checked).toBe(false);
    canvas.receive(viewMessage({ ...scene, chrome: { ...scene.chrome!, filters: [{ ...scene.chrome!.filters[0], value: true }] } }));
    expect(box().checked).toBe(true);
  });

  it('asks for an edit when the filter is kept with the diagram, and changes no view option', () => {
    box().click();
    expect(requests()).toEqual([{ kind: 'filter', id: 'archived', value: true }]);
    expect(sent.filter((message) => message.type === 'viewOptions')).toEqual([]);
  });

  it('changes the view options when the filter is each viewer\'s own', () => {
    canvas.receive(viewMessage({ ...scene, chrome: { ...scene.chrome!, filters: [{ ...scene.chrome!.filters[0], kept: false }] } }));
    box().click();
    expect(requests()).toEqual([]);
    expect(sent.filter((message) => message.type === 'viewOptions').map((message) => (message as Extract<FromCanvas, { type: 'viewOptions' }>).options.filters)).toEqual([{ archived: { value: true } }]);
  });

  it('cannot be changed in a scene that cannot be edited, when it is kept', () => {
    canvas.receive(viewMessage({ ...scene, readOnly: true }));
    expect(box().disabled).toBe(true);
  });
});

describe('a label of one line', () => {
  it('is cut with an ellipsis where it does not fit, and says its text in full when it is hovered', () => {
    const label = group('s1').querySelector('[data-label="name"]')!;
    expect(label.querySelector('title')?.textContent).toBe('Billing');
    expect(label.querySelector('.adp-scene-text')?.getAttribute('style')).toContain('text-overflow: ellipsis');
  });
});
