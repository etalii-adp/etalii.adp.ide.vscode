import { treeDragPreview } from '../../core/scene/tidyTree';
import type { Action, Box, EditRequest, ViewOptions } from '../../core/frame/toolType';
import type { FromCanvas, ToCanvas } from '../../core/frame/protocol';
import { centreOf, holds, pointOn, type Point } from '../../core/scene/geometry';
import type { Scene, SceneEdge, SceneNode, SceneRow } from '../../core/scene/scene';
import { toolboxMime } from '../toolbox/toolbox';
import { html, svg } from './dom';
import { InlineEditor } from './inlineEditor';
import { Menu } from './menu';
import { Panel } from './panel';
import { Ruler } from './ruler';
import { colourOf, drawEdge, drawHandles, drawScene, themeKind } from './scene';
import { Surface } from './surface';

/** How far, in pixels, a press must travel before it is a drag rather than a click. */
const dragThreshold = 3;
const minimumSize = 4;
/** How near, in canvas units, a press must be to where an end of an edge can sit to draw an edge rather than move the node. */
const connectBand = 6;

/**
 * The keys this plug-in binds to commands of its own, which ask for the action with that shortcut
 * (package.json, `src/extension/commands.ts`). The canvas leaves them alone, so an action is asked for once.
 */
const hostKeys: readonly string[] = ['f2', 'delete', 'alt+up', 'alt+down'];

type Side = 'left' | 'right' | 'top' | 'bottom' | 'corner';
/** A point in canvas units. */
type CanvasPoint = Point;

// A key press as a definition writes a shortcut, in lower case: `ctrl+up`, `space`, `enter`.
const pressed = (event: KeyboardEvent): string =>
  `${event.ctrlKey || event.metaKey ? 'ctrl+' : ''}${event.altKey ? 'alt+' : ''}${event.shiftKey ? 'shift+' : ''}${event.key === ' ' ? 'space' : event.key.replace(/^Arrow/, '').toLowerCase()}`;

// A distance on its step, a half rounding away from zero; without a step, on whole canvas units, so
// a drop made at any zoom is stored as a whole number.
const snapTo = (value: number, step: number): number => Math.sign(value) * Math.round(Math.abs(value) / (step > 0 ? step : 1)) * (step > 0 ? step : 1);

/**
 * Where on a node of a scene an end of an edge let go at a point sits: on the nearest part an end
 * may be anchored on, written `part/side/at` as a request takes it. Nothing for a node without one.
 */
function endAt(node: SceneNode, point: CanvasPoint): { readonly text: string; readonly point: CanvasPoint } | undefined {
  const away = (box: Box): number => Math.hypot(Math.max(box.x - point.x, 0, point.x - box.x - box.width), Math.max(box.y - point.y, 0, point.y - box.y - box.height));
  const parts = node.parts.filter((part) => part.anchor === true);
  if (parts.length === 0) return undefined;
  const { id, box } = parts.reduce((best, candidate) => (away(candidate.box) < away(best.box) ? candidate : best));
  // simplified: an end is put on the top or the bottom of its part, as this host's canvas always has; the left and the right once a scene says which sides of a part an end may be on.
  const side = point.y < box.y + box.height / 2 ? 'top' : 'bottom';
  const at = Math.round(Math.min(1, Math.max(0, (point.x - box.x) / box.width)) * 100) / 100;
  return { text: `${id}/${side}/${at}`, point: pointOn(box, side, at) };
}

/**
 * An edge with its two ends moved, each by the way its node is dragged: a line at right angles
 * turns where it did, between the two ends as they are now, and any other is drawn straight.
 */
function following(edge: SceneEdge, from: CanvasPoint, to: CanvasPoint): SceneEdge {
  if (!edge.from || !edge.to) return edge;
  const [a, b] = [{ ...edge.from, x: edge.from.x + from.x, y: edge.from.y + from.y }, { ...edge.to, x: edge.to.x + to.x, y: edge.to.y + to.y }];
  if (from.x === to.x && from.y === to.y) {
    const shifted = (x: number, y: number): { x: number; y: number } => ({ x: x + from.x, y: y + from.y });
    return { ...edge, from: a, to: b, path: edge.path.map((step) => (step.op === 'Z' ? step : step.op === 'Q' ? { ...step, ...shifted(step.x, step.y), cx: step.cx + from.x, cy: step.cy + from.y }
      : step.op === 'C' ? { ...step, ...shifted(step.x, step.y), c1x: step.c1x + from.x, c1y: step.c1y + from.y, c2x: step.c2x + from.x, c2y: step.c2y + from.y } : { ...step, ...shifted(step.x, step.y) })) };
  }
  const down = edge.from.normal.x === 0;
  const middle = down ? (a.y + b.y) / 2 : (a.x + b.x) / 2;
  const turns = edge.routing !== 'orthogonal' ? [] : down ? [{ op: 'L' as const, x: a.x, y: middle }, { op: 'L' as const, x: b.x, y: middle }] : [{ op: 'L' as const, x: middle, y: a.y }, { op: 'L' as const, x: middle, y: b.y }];
  return { ...edge, from: a, to: b, curve: undefined, path: [{ op: 'M', x: a.x, y: a.y }, ...turns, { op: 'L', x: b.x, y: b.y }] };
}

/**
 * The canvas of one diagram. It draws the scene it is sent as it is, keeps the selection, and turns
 * every gesture into a request to the extension: it never changes the model itself, and it draws
 * the view that follows.
 */
export class Canvas {
  readonly surface: Surface;
  private readonly stage: HTMLElement;
  private readonly notice = html('div', { class: 'adp-notice', role: 'status' });
  private readonly status = html('div', { class: 'adp-status', role: 'alert' });
  private readonly panel: Panel;
  private readonly ruler: Ruler;
  private readonly menu: Menu;
  private readonly editor: InlineEditor;
  /** What is shown: the scene of a tool type read from its definition. */
  private scene: Scene | undefined;
  private actions: readonly Action[] = [];
  private version = 0;
  private selection: string[] = [];
  private options: ViewOptions = {};
  private seq = 0;
  private reportTimer: ReturnType<typeof setTimeout> | undefined;
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  /** Ends the gesture in progress without asking for anything. */
  private abandon: (() => void) | undefined;
  private pendingMenu: { x: number; y: number } | undefined;
  /** Where the menu of the empty canvas of a scene was asked for, in canvas units. */
  private menuAt: CanvasPoint | undefined;
  private suppressMenu = false;
  /** Puts a dropped drawing back where the view has it, once the extension has answered the drop. */
  private settleOnOutcome: (() => void) | undefined;

  constructor(host: HTMLElement, private readonly send: (message: FromCanvas) => void) {
    const frame = html('div', { class: 'adp-canvas' });
    this.stage = html('div', { class: 'adp-stage' });
    frame.append(this.stage);
    host.append(frame);

    this.surface = new Surface(this.stage);
    // The arrowhead, and the same arrowhead in the highlight a selected relation takes.
    for (const id of ['adp-arrow', 'adp-arrow-selected']) {
      this.surface.defs.append(svg('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' },
        svg('path', { d: 'M 0 0 L 10 5 L 0 10 z' })));
    }
    this.notice.hidden = true;
    this.status.hidden = true;
    this.stage.append(this.notice, this.status);
    this.panel = new Panel(this.stage, (options) => {
      // A scene's filter is asked for by its id, and its toggle by the viewpoint it turns on.
      const chrome = this.scene?.chrome;
      const filter = chrome?.filters.find((candidate) => candidate.control === 'chips');
      const toggle = chrome?.toggles[0];
      this.options = {
        ...(filter ? { filters: { [filter.id]: { value: options.filterTags, match: options.filterMode } } } : {}),
        ...(toggle && options.compact === true ? { viewpoint: toggle.viewpoint } : {}),
      };
      this.reportView();
    });
    this.ruler = new Ruler(this.stage);
    this.menu = new Menu(this.stage, (action) => this.request({
      kind: 'action', action, ...(this.selection[0] !== undefined ? { id: this.selection[0] } : this.menuAt ?? {}),
    }));
    this.editor = new InlineEditor(this.stage, (active) => this.send({ v: 2, type: 'editing', active }));

    const root = this.surface.root;
    this.surface.onViewChanged(() => this.viewChanged());
    root.addEventListener('pointerdown', (event) => this.press(event));
    root.addEventListener('click', (event) => this.click(event));
    root.addEventListener('dblclick', (event) => this.activate(event));
    root.addEventListener('contextmenu', (event) => this.contextMenu(event));
    root.addEventListener('dragover', (event) => {
      if (event.dataTransfer?.types.includes(toolboxMime)) event.preventDefault();
    });
    root.addEventListener('drop', (event) => this.dropped(event));
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.abandon?.();
      // Enter and Space activate what has the focus in the drawing, as a click does: a heading, a link symbol, a badge.
      else if ((event.key === 'Enter' || event.key === ' ') && this.activateControl(event.target)) event.preventDefault();
      else this.key(event);
    });
    // A scene's colours are worked out for the theme kind, so a change of theme draws it again.
    new MutationObserver(() => {
      if (this.scene) this.draw();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  receive(message: ToCanvas): void {
    switch (message.type) {
      case 'view': {
        // A gesture begun on an older view is given up rather than applied to what it was not computed from.
        this.abandon?.();
        this.scene = message.view as Scene;
        this.actions = message.actions;
        this.version = message.version;
        this.draw();
        if (this.pendingMenu) {
          const at = this.pendingMenu;
          this.pendingMenu = undefined;
          this.menu.open(this.actions, at.x, at.y);
        }
        return;
      }
      case 'outcome':
        this.settleOnOutcome?.();
        this.settleOnOutcome = undefined;
        if (message.result === 'refused' && message.sentence) this.say(message.sentence);
        return;
      case 'reveal': {
        this.select([message.id]);
        const node = this.node(message.id);
        if (node) {
          this.surface.reveal(node.box);
          if (message.editLabel) this.editLabel(node, message.multiline === true);
          return;
        }
        // An item of a compartment that is an element: its node is brought into view, and its own text is what is edited.
        const row = this.row(message.id);
        if (row) {
          this.surface.reveal(row.node.box);
          if (message.editLabel) this.edit(message.id, row.row.text, row.row.box, false);
        }
        return;
      }
      case 'command':
        if (message.command === 'toggleCompact') this.panel.toggleCompact();
        return;
      case 'addAtCentre':
        if (this.scene && !this.readOnly) this.addAtCentre(message.entry);
        return;
    }
  }

  /** True when what is shown may not be edited. */
  private get readOnly(): boolean {
    return this.scene?.readOnly === true;
  }

  private node(id: string | undefined): SceneNode | undefined {
    return this.scene?.nodes.find((node) => node.id === id);
  }

  // The item of a compartment that is the element of an id, with the node that lists it.
  private row(id: string | undefined): { readonly node: SceneNode; readonly row: SceneRow } | undefined {
    for (const node of this.scene?.nodes ?? []) {
      const row = node.compartments.flatMap((compartment) => compartment.rows).find((candidate) => candidate.element !== undefined && candidate.element === id);
      if (row) return { node, row };
    }
    return undefined;
  }

  // The node something of the drawing belongs to: an item with an id of its own is still drawn in its node.
  private nodeAt(target: EventTarget | null): SceneNode | undefined {
    return this.node((target as Element | null)?.closest?.('.adp-element')?.getAttribute('data-id') ?? undefined);
  }

  /**
   * Activates the control of a scene something is in, when it is in one: the heading of a group
   * folds or opens it, a link symbol opens the link of its item, and a badge that runs an
   * operation runs it on its node. Each asks the extension, also in a scene that cannot be edited:
   * which of them writes is the tool type's to say.
   */
  private activateControl(target: EventTarget | null): boolean {
    const element = target as Element | null;
    const node = this.nodeAt(target);
    if (!node || !element?.closest || !this.surface.root.contains(element)) return false;
    const heading = element.closest('[data-group]');
    const link = element.closest('[data-link]');
    const badge = element.closest('[data-operation]');
    if (link) {
      const item = link.closest('[data-item]');
      const compartment = link.closest('[data-compartment]')?.getAttribute('data-compartment');
      if (item && compartment) this.request({ kind: 'openLink', id: node.id, compartment, item: Number(item.getAttribute('data-item')) });
    } else if (heading) {
      this.request({ kind: 'fold', id: node.id, group: heading.getAttribute('data-group') ?? '', folded: heading.getAttribute('aria-expanded') === 'true' });
    } else if (badge) {
      this.request({ kind: 'action', action: badge.getAttribute('data-operation') ?? '', id: node.id });
    }
    return link !== null || heading !== null || badge !== null;
  }

  // ---- drawing ----

  private draw(): void {
    const scene = this.scene;
    if (!scene) return;
    const root = this.surface.root;
    root.setAttribute('aria-label', 'Diagram');
    root.setAttribute('role', 'application');
    this.surface.content.replaceChildren(...drawScene(scene, themeKind()));
    this.showChrome(scene);

    // A selection survives a redraw for as long as what it names is still drawn.
    const ids = [...scene.nodes, ...scene.edges].map((drawn) => drawn.id);
    this.selection = this.selection.filter((id) => ids.includes(id));
    this.markSelection();

    this.notice.hidden = scene.notice === undefined;
    this.notice.textContent = scene.notice ?? '';
    this.surface.placeOnce(scene.bounds);
    this.drawRuler();
  }

  // What a scene shows around the drawing, in this host's panel.
  private showChrome(scene: Scene): void {
    const chrome = scene.chrome;
    const kind = themeKind();
    const legend = chrome?.legend ?? [];
    // simplified: the panel shows one filter, the first with chips, and one toggle, the first; another filter or toggle needs a panel that lists its controls from the scene.
    const filter = chrome?.filters.find((candidate) => candidate.control === 'chips');
    const toggle = chrome?.toggles[0];
    this.panel.show({
      ...(filter ? { filter: { label: filter.label, tags: Array.isArray(filter.value) ? filter.value.map(String) : [], mode: filter.match }, tags: filter.options } : {}),
      legend: legend.map((entry) => ({ caption: entry.label, swatchClass: '' })),
      ...(toggle ? { compact: toggle.on } : {}),
    });
    // A filter that is a switch: one the diagram keeps is changed by an edit, and any other is this viewer's option.
    const switches = (chrome?.filters ?? []).filter((candidate) => candidate.control === 'switch');
    this.panel.showSwitches(switches.map((entry) => ({ id: entry.id, label: entry.label, on: entry.value === true, locked: entry.kept && scene.readOnly === true })), (id, on) => {
      if (switches.find((entry) => entry.id === id)?.kept) {
        this.request({ kind: 'filter', id, value: on });
      } else {
        this.options = { ...this.options, filters: { ...this.options.filters, [id]: { value: on } } };
        this.reportView();
      }
    });
    this.panel.element.querySelectorAll('.adp-legend-swatch').forEach((swatch, index) => swatch.setAttribute('style', `background: ${colourOf(scene.tokens, kind, legend[index].fill, 'fill')}`));
    const named = this.panel.element.querySelector('.adp-compact')?.lastChild;
    if (toggle && named) named.textContent = toggle.label;
    if (chrome?.background === undefined) this.stage.removeAttribute('style');
    else this.stage.setAttribute('style', `background: ${colourOf(scene.tokens, kind, chrome.background, 'fill')}`);
  }

  private drawRuler(): void {
    const viewport = this.surface.viewport();
    // simplified: one ruler is drawn, the first along x, in this host's strip at the bottom of the view; a ruler along y, at the top or fixed to the canvas needs a strip of its own.
    const ruler = this.scene?.chrome?.rulers.find((candidate) => candidate.axis === 'x');
    const zoom = this.surface.zoom;
    // The finest level whose ticks have room; the coarsest when none has.
    const level = ruler?.levels.find((candidate) => candidate.spacing * zoom >= candidate.minSpacing && zoom >= (candidate.minZoom ?? 0) && zoom <= (candidate.maxZoom ?? Infinity)) ?? ruler?.levels.at(-1);
    this.ruler.element.hidden = !level;
    this.ruler.element.replaceChildren(...(level?.ticks ?? [])
      .filter((tick) => tick.at >= viewport.x && tick.at <= viewport.x + viewport.width)
      .map((tick) => html('span', { class: 'adp-ruler-tick', style: `left: ${this.surface.toScreen(tick.at, 0).x}px` }, tick.label)));
  }

  private markSelection(): void {
    const selected = new Set(this.selection);
    for (const group of this.surface.content.querySelectorAll('[data-id]')) {
      const on = selected.has(group.getAttribute('data-id') ?? '');
      group.classList.toggle('adp-selected', on);
      for (const line of group.querySelectorAll('.adp-relation-line[marker-end]')) line.setAttribute('marker-end', on ? 'url(#adp-arrow-selected)' : 'url(#adp-arrow)');
    }
    this.drawHandles();
  }

  // A handle on each side a box can be resized by: across, up and down, and both at its corner.
  private resizeHandles(box: Box, across: boolean, upDown: boolean): SVGElement[] {
    const size = 6 / this.surface.zoom;
    const sides: [Side, number, number, string][] = [];
    if (across) sides.push(['left', box.x, box.y + box.height / 2, 'ew-resize'], ['right', box.x + box.width, box.y + box.height / 2, 'ew-resize']);
    if (upDown) sides.push(['top', box.x + box.width / 2, box.y, 'ns-resize'], ['bottom', box.x + box.width / 2, box.y + box.height, 'ns-resize']);
    if (across && upDown) sides.push(['corner', box.x + box.width, box.y + box.height, 'nwse-resize']);
    return sides.map(([side, x, y, cursor]) => svg('rect', { class: 'adp-handle adp-resize', 'data-resize': side, x: x - size / 2, y: y - size / 2, width: size, height: size, style: `cursor: ${cursor}` }));
  }

  // The handles of a single selection: the sides it can be resized by, and its notation's own.
  private drawHandles(): void {
    const handles: SVGElement[] = [];
    if (this.scene && !this.readOnly && this.selection.length === 1) {
      const node = this.node(this.selection[0]);
      if (node) handles.push(...this.resizeHandles(node.box, node.resizable.x, node.resizable.y), ...drawHandles(node, this.surface.zoom));
      // An end of an edge that is on a part can be moved along it.
      const edge = this.scene.edges.find((candidate) => candidate.id === this.selection[0]);
      for (const end of ['from', 'to'] as const) {
        const at = edge?.[end];
        if (at?.part !== undefined) handles.push(svg('circle', { class: 'adp-handle', 'data-end': end, cx: at.x, cy: at.y, r: 4 / this.surface.zoom, style: 'cursor: move' }));
      }
    }
    this.surface.overlay.replaceChildren(...handles);
  }

  // ---- selection, clicks and menus ----

  private idAt(target: EventTarget | null): string | undefined {
    return (target as Element | null)?.closest?.('[data-id]')?.getAttribute('data-id') ?? undefined;
  }

  // A key that an action of the view is offered under asks for that action, on what is selected.
  private key(event: KeyboardEvent): void {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
    const name = pressed(event);
    if (!this.scene || !this.surface.root.isConnected || typing || hostKeys.includes(name)) return;
    const action = this.actions.find((candidate) => candidate.enabled && candidate.shortcut?.toLowerCase() === name);
    if (!action) return;
    event.preventDefault();
    this.request({ kind: 'action', action: action.id, ...(this.selection[0] !== undefined ? { id: this.selection[0] } : {}) });
  }

  private click(event: MouseEvent): void {
    if ((event.target as Element).closest('.adp-handle')) return;
    if (this.activateControl(event.target)) return;
    const id = this.idAt(event.target);
    // A fold is what this viewer sees and writes nothing, so it is asked for in a read-only scene too.
    const fold = (event.target as Element).closest('[data-fold]')?.getAttribute('data-fold');
    if (id && fold) {
      this.request({ kind: 'fold', id, folded: fold !== 'folded' });
      return;
    }
    if (!id || this.node(id)?.selectable === false) {
      this.select([]);
    } else if (event.ctrlKey || event.metaKey || event.shiftKey) {
      this.select(this.selection.includes(id) ? this.selection.filter((other) => other !== id) : [...this.selection, id]);
    } else {
      this.select([id]);
    }
  }

  private select(ids: string[], always = false): void {
    const same = ids.length === this.selection.length && ids.every((id, index) => id === this.selection[index]);
    this.selection = ids;
    this.markSelection();
    if (!same || always) this.send({ v: 2, type: 'selection', ids });
  }

  // Activating an element edits its text in place.
  private activate(event: MouseEvent): void {
    if (this.readOnly || (event.target as Element).closest('[data-fold], [data-group], [data-link], [data-operation]')) return;
    const id = this.idAt(event.target);
    const node = this.node(id);
    const row = node ? undefined : this.row(id);
    if (row && id) this.edit(id, row.row.text, row.row.box, false);
    else if (node) this.editLabel(node);
  }

  // The menu shows the actions for what was pointed at, which the extension sends with the view
  // that follows the selection; so the menu opens when that view arrives.
  private contextMenu(event: MouseEvent): void {
    event.preventDefault();
    if (this.suppressMenu) {
      this.suppressMenu = false;
      return;
    }
    if (this.readOnly) return;
    const id = this.idAt(event.target);
    this.pendingMenu = { x: event.clientX, y: event.clientY };
    this.menuAt = this.surface.toCanvas(event.clientX, event.clientY);
    this.select(id ? [id] : [], true);
  }

  // The first label of a node of a scene that can be edited, as the label says it is edited. The
  // extension asks for it with `asked`, and then a label edited in a form is not asked about again.
  private editLabel(node: SceneNode, asked?: boolean): void {
    const label = node.labels.find((candidate) => candidate.editable !== false);
    if (!label) return;
    if (label.editable !== 'form') this.edit(node.id, label.editText, label.box, asked ?? label.editable === 'multiline');
    // A form is ADP Properties: the tool type answers with the field to go on in.
    else if (asked === undefined) this.request({ kind: 'action', action: 'editLabel', id: node.id });
  }

  private edit(id: string, text: string, box: Box, multiline: boolean): void {
    const corner = this.surface.toScreen(box.x, box.y);
    const zoom = this.surface.zoom;
    this.editor.open(text, multiline, { left: corner.x, top: corner.y, width: box.width * zoom, height: multiline ? box.height * zoom : 22 }, (changed) => {
      this.request({ kind: 'rename', id, text: changed });
    });
  }

  private say(sentence: string): void {
    this.status.textContent = sentence;
    this.status.hidden = false;
    if (this.statusTimer !== undefined) clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      this.status.hidden = true;
    }, 8000);
  }

  private request(request: EditRequest): void {
    this.seq += 1;
    this.send({ v: 2, type: 'edit', seq: this.seq, request, version: this.version });
  }

  // ---- the ADP Toolbox: an entry dragged from its view and dropped, or activated there ----

  private dropped(event: DragEvent): void {
    const entry = event.dataTransfer?.getData(toolboxMime);
    if (!entry) return;
    event.preventDefault();
    const point = this.surface.toCanvas(event.clientX, event.clientY);
    this.request({ kind: 'drop', entry, x: point.x, y: point.y });
  }

  private addAtCentre(entry: string): void {
    const view = this.surface.viewport();
    this.request({ kind: 'drop', entry, x: view.x + view.width / 2, y: view.y + view.height / 2 });
  }

  // ---- gestures ----

  private press(event: PointerEvent): void {
    if (this.readOnly || this.editor.active || !this.scene) return;
    this.pressScene(event, this.scene);
  }

  // A press on a scene: on a handle of the selection, or on a node, which it moves or draws an edge from.
  private pressScene(event: PointerEvent, scene: Scene): void {
    const target = event.target as Element;
    if (target.closest('[data-fold]')) return;
    const point = this.surface.toCanvas(event.clientX, event.clientY);

    if (event.button === 0 && this.selection.length === 1) {
      const selected = this.node(this.selection[0]);
      const handle = target.closest('[data-handle]')?.getAttribute('data-handle');
      const side = target.closest('[data-resize]')?.getAttribute('data-resize') as Side | null | undefined;
      const end = target.closest('.adp-handle[data-end]')?.getAttribute('data-end');
      if (handle && selected) {
        this.dragSceneHandle(event, selected, Number(handle));
        return;
      }
      if (side && selected) {
        // simplified: a resize is shown as the outline of the new bounds, since a shape and its parts are worked out with the scene; the scene is drawn again when the edit is applied.
        this.resize(event, selected.id, selected.box, side, (bounds) => svg('rect', { class: 'adp-outline', ...bounds }));
        return;
      }
      if (end === 'from' || end === 'to') {
        this.moveEnd(event, scene, this.selection[0], end);
        return;
      }
    }

    const node = this.nodeAt(target);
    if (!node) return;
    const from = { id: node.id, movable: node.movable.x || node.movable.y };
    const edge = (start: ReturnType<typeof endAt>): void => {
      const { x, y } = start?.point ?? centreOf(node.box);
      this.connect(event, from, start?.text ?? '', event.button === 2,
        (to) => svg('line', { class: 'adp-relation-line adp-connecting', x1: x, y1: y, x2: to.x, y2: to.y, 'marker-end': 'url(#adp-arrow)' }),
        (targetId, at) => {
          const arrived = this.node(targetId);
          return arrived ? endAt(arrived, at)?.text : null;
        });
    };
    const near = node.connectable ? endAt(node, point) : undefined;
    if (event.button === 2) {
      // A right-button drag from a node draws an edge from it; a right click is the menu.
      if (node.connectable) edge(near);
      return;
    }
    if (event.button !== 0) return;
    // A press where an end can sit draws an edge from there; anywhere else on the node moves it. A
    // node that is placed for it and cannot be moved is dragged to another node, to go under that one.
    if (near && Math.hypot(near.point.x - point.x, near.point.y - point.y) <= connectBand) edge(near);
    else if (from.movable) this.moveNode(event, scene, node);
    else this.reparent(event, scene, node);
  }

  // Follows the pointer from a press until it is let go, telling a drag from a click.
  private track(event: PointerEvent, gesture: { move(point: CanvasPoint, delta: CanvasPoint): void; end(point: CanvasPoint, last: PointerEvent): void; cancel(): void }): void {
    const start = { x: event.clientX, y: event.clientY };
    const origin = this.surface.toCanvas(event.clientX, event.clientY);
    let dragging = false;
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      this.abandon = undefined;
    };
    const move = (moved: PointerEvent): void => {
      if (!dragging && Math.hypot(moved.clientX - start.x, moved.clientY - start.y) < dragThreshold) return;
      dragging = true;
      const point = this.surface.toCanvas(moved.clientX, moved.clientY);
      gesture.move(point, { x: point.x - origin.x, y: point.y - origin.y });
    };
    const up = (last: PointerEvent): void => {
      stop();
      if (dragging) gesture.end(this.surface.toCanvas(last.clientX, last.clientY), last);
      else gesture.cancel();
    };
    const cancel = (): void => {
      stop();
      gesture.cancel();
    };
    this.abandon = cancel;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }

  private group(id: string): Element | null {
    return [...this.surface.content.querySelectorAll('[data-id]')].find((candidate) => candidate.getAttribute('data-id') === id) ?? null;
  }

  // Draws a stand-in for something being changed, and dims the thing itself until the gesture ends.
  private preview(id: string, drawing: SVGElement | undefined): void {
    this.group(id)?.classList.add('adp-ghost');
    this.surface.overlay.replaceChildren(...(drawing ? [drawing] : []));
    drawing?.classList.add('adp-preview');
  }

  private endPreview(id: string): void {
    this.group(id)?.classList.remove('adp-ghost');
    this.drawHandles();
  }

  // A node of a scene dragged along the axes it may be moved on, to whole canvas units. In a tidy
  // tree the drag is the tree's (DISL 10.3): the node carries what is beneath it, the rest of its
  // row follows it up and down, and the siblings it has passed step aside to show where it will land.
  private moveNode(event: PointerEvent, scene: Scene, node: SceneNode): void {
    const groups = new Map<string, Element>();
    for (const group of this.surface.content.querySelectorAll('.adp-element[data-id]')) groups.set(group.getAttribute('data-id') ?? '', group);
    const lines = new Map<string, { readonly group: Element; readonly drawn: Node[] }>();
    for (const group of this.surface.content.querySelectorAll('.adp-relation[data-id]')) lines.set(group.getAttribute('data-id') ?? '', { group, drawn: [...group.childNodes] });
    const tree = scene.tree?.nodes.some((entry) => entry.id === node.id) ? scene.tree : undefined;
    const places = new Map((tree?.nodes ?? []).map((entry) => [entry.id, { x: entry.x, y: entry.y }]));
    let moved: Element[] = [];
    let redrawn: { readonly group: Element; readonly drawn: Node[] }[] = [];
    const settle = (): void => {
      for (const group of moved) group.removeAttribute('transform');
      for (const line of redrawn) line.group.replaceChildren(...line.drawn);
      moved = [];
      redrawn = [];
    };

    // How far each node is drawn from its place while this one is dragged to `at`.
    const offsetsAt = (at: CanvasPoint): Map<string, CanvasPoint> => {
      if (!tree) return new Map([[node.id, { x: at.x - node.box.x, y: at.y - node.box.y }]]);
      const preview = treeDragPreview(tree.nodes, places, node.id, at.x, at.y, tree);
      return new Map([...preview].map(([id, point]) => [id, { x: point.x - places.get(id)!.x, y: point.y - places.get(id)!.y }]));
    };

    let at = { x: node.box.x, y: node.box.y };
    this.track(event, {
      move: (_point, delta) => {
        at = { x: node.box.x + (node.movable.x ? snapTo(delta.x, 0) : 0), y: node.box.y + (node.movable.y ? snapTo(delta.y, 0) : 0) };
        const offsets = offsetsAt(at);
        settle();
        for (const [id, offset] of offsets) {
          const group = groups.get(id);
          if (!group || (offset.x === 0 && offset.y === 0)) continue;
          group.setAttribute('transform', `translate(${offset.x} ${offset.y})`);
          moved.push(group);
        }
        // A line to something that moves is drawn again from where that is drawn now, so it follows
        // the drag; the scene that answers the drop draws it for good.
        const still = { x: 0, y: 0 };
        for (const edge of scene.edges) {
          const [from, to] = [offsets.get(edge.source) ?? still, offsets.get(edge.target) ?? still];
          const line = lines.get(edge.id);
          if (!line || (from.x === 0 && from.y === 0 && to.x === 0 && to.y === 0)) continue;
          const drawn = drawEdge(following(edge, from, to), scene, themeKind());
          line.group.replaceChildren(...(drawn ? [...drawn.childNodes] : []));
          redrawn.push(line);
        }
        this.surface.overlay.replaceChildren();
      },
      end: () => {
        this.select([node.id]);
        if (at.x === node.box.x && at.y === node.box.y) {
          settle();
          return;
        }
        // The drawing stays where it was dropped until the view that follows replaces it.
        this.request({ kind: 'move', id: node.id, x: at.x, y: at.y });
        this.settleOnOutcome = settle;
      },
      cancel: settle,
    });
  }

  // A node of a scene dragged onto another, to become its last child. Let go over nothing, it stays.
  private reparent(event: PointerEvent, scene: Scene, node: SceneNode): void {
    const group = this.group(node.id);
    let parent: SceneNode | undefined;
    // The node that would become the parent is marked: the topmost one under the pointer.
    const mark = (next: SceneNode | undefined): void => {
      if (parent) this.group(parent.id)?.classList.remove('adp-drop-target');
      if (next) this.group(next.id)?.classList.add('adp-drop-target');
      parent = next;
    };
    const settle = (): void => {
      mark(undefined);
      group?.removeAttribute('transform');
      group?.classList.remove('adp-ghost');
    };
    this.track(event, {
      move: (point, delta) => {
        // simplified: the node alone follows the pointer, without the nodes under it and the lines to it, and any other node is marked as one it could go under; the tool type refuses the ones the definition forbids, and the scene is drawn again when the edit is applied.
        group?.setAttribute('transform', `translate(${snapTo(delta.x, 0)} ${snapTo(delta.y, 0)})`);
        group?.classList.add('adp-ghost');
        mark([...scene.nodes].reverse().find((candidate) => candidate.id !== node.id && holds(candidate.box, point)));
        this.surface.overlay.replaceChildren();
      },
      end: () => {
        const onto = parent;
        settle();
        this.select([node.id]);
        if (onto) this.request({ kind: 'reparent', id: node.id, parent: onto.id });
      },
      cancel: settle,
    });
  }

  private resize(event: PointerEvent, id: string, box: Box, side: Side, drawing: (bounds: Box) => SVGElement | undefined): void {
    const snap = { x: 0, y: 0 };
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    let bounds = box;
    this.track(event, {
      move: (point) => {
        let { x, y, width, height } = box;
        if (side === 'left') {
          x = Math.min(snapTo(point.x, snap.x), right - Math.max(minimumSize, snap.x));
          width = right - x;
        }
        if (side === 'right' || side === 'corner') width = Math.max(Math.max(minimumSize, snap.x), snapTo(point.x, snap.x) - box.x);
        if (side === 'top') {
          y = Math.min(snapTo(point.y, snap.y), bottom - minimumSize);
          height = bottom - y;
        }
        if (side === 'bottom' || side === 'corner') height = Math.max(minimumSize, Math.round(point.y - box.y));
        bounds = { x, y, width, height };
        this.preview(id, drawing(bounds));
      },
      end: () => {
        this.endPreview(id);
        if (bounds !== box) this.request({ kind: 'resize', id, side, bounds });
      },
      cancel: () => this.endPreview(id),
    });
  }

  // A handle of a node of a scene dragged across the node: the request names it by its index.
  private dragSceneHandle(event: PointerEvent, node: SceneNode, index: number): void {
    const handle = node.handles[index];
    if (!handle) return;
    let x = handle.x;
    this.track(event, {
      move: (point) => {
        x = Math.min(node.box.x + node.box.width, Math.max(node.box.x, Math.round(point.x)));
        // simplified: the handle alone follows the pointer, since the shape it changes is worked out with the scene; the scene is drawn again when the edit is applied.
        this.preview(node.id, svg('circle', { class: 'adp-handle', cx: x, cy: handle.y, r: 4 / this.surface.zoom }));
      },
      end: () => {
        this.endPreview(node.id);
        if (x !== handle.x) this.request({ kind: 'handle', id: node.id, handle: index, x });
      },
      cancel: () => this.endPreview(node.id),
    });
  }

  // An end of an edge of a scene dragged along its node, to the nearest place an end may sit.
  private moveEnd(event: PointerEvent, scene: Scene, id: string, end: 'from' | 'to'): void {
    const node = this.node(scene.edges.find((edge) => edge.id === id)?.[end]?.node);
    if (!node) return;
    let value: string | undefined;
    this.track(event, {
      move: (point) => {
        const at = endAt(node, point);
        value = at?.text;
        this.preview(id, at ? svg('circle', { class: 'adp-handle', cx: at.point.x, cy: at.point.y, r: 4 / this.surface.zoom }) : undefined);
      },
      end: () => {
        this.endPreview(id);
        if (value !== undefined) this.request({ kind: 'moveEnd', id, end, value });
      },
      cancel: () => this.endPreview(id),
    });
  }

  /**
   * A relation drawn from something to whatever the pointer is let go over. `line` draws it while
   * it is drawn; `arrive` says where on the target it arrives, when that is stored, and is null
   * for a target that is nothing a relation can reach.
   */
  private connect(event: PointerEvent, from: { readonly id: string; readonly movable: boolean }, fromEnd: string, rightButton: boolean,
    line: (to: CanvasPoint) => SVGElement, arrive: (target: string, at: CanvasPoint) => string | undefined | null): void {
    this.track(event, {
      move: (point) => {
        const drawn = line(point);
        drawn.classList.add('adp-preview');
        this.surface.overlay.replaceChildren(drawn);
      },
      end: (point, last) => {
        // A right-button drag ends in a context menu event, which this gesture has already answered.
        if (rightButton) this.suppressMenu = true;
        this.drawHandles();
        const target = this.idAt(document.elementFromPoint(last.clientX, last.clientY));
        const toEnd = target ? arrive(target, point) : null;
        if (!target || toEnd === null) return;
        this.request({ kind: 'connect', from: from.id, to: target, ...(fromEnd.length > 0 ? { fromEnd } : {}), ...(toEnd ? { toEnd } : {}) });
      },
      cancel: () => {
        this.drawHandles();
        if (!rightButton && !from.movable) this.select([from.id]);
      },
    });
  }

  // ---- what is in view ----

  // What is in view is reported a moment after it settles, so a pan does not ask for a view per pixel.
  private viewChanged(): void {
    this.drawRuler();
    this.drawHandles();
    this.editor.close();
    if (this.reportTimer !== undefined) clearTimeout(this.reportTimer);
    this.reportTimer = setTimeout(() => this.reportView(), 120);
  }

  private reportView(): void {
    const { viewport: _previous, ...kept } = this.options;
    void _previous;
    const view = this.surface.viewport();
    // Half a screen more on every side, so a short pan shows what was already drawn.
    const margin = { x: view.width / 2, y: view.height / 2 };
    this.options = { ...kept, viewport: { x: view.x - margin.x, y: view.y - margin.y, width: view.width + 2 * margin.x, height: view.height + 2 * margin.y } };
    this.send({ v: 2, type: 'viewOptions', options: this.options });
  }
}
