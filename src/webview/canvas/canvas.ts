import type { Action, Box, EditRequest, ViewElement, ViewModel, ViewOptions, ViewRelation } from '../../core/frame/diagramType';
import type { FromCanvas, ToCanvas } from '../../core/frame/protocol';
import { Toolbox, toolboxMime } from '../toolbox/toolbox';
import { html, svg } from './dom';
import { InlineEditor } from './inlineEditor';
import { Menu } from './menu';
import { notationFor, type CanvasPoint, type DrawContext, type Notation } from './notation';
import { Panel } from './panel';
import { Ruler, type Rung } from './ruler';
import { Surface } from './surface';

/** How far, in pixels, a press must travel before it is a drag rather than a click. */
const dragThreshold = 3;
const minimumSize = 4;

type Side = 'left' | 'right' | 'top' | 'bottom' | 'corner';

// A distance on its step, a half rounding away from zero; without a step, on whole canvas units, so
// a drop made at any zoom is stored as a whole number.
const snapTo = (value: number, step: number): number => Math.sign(value) * Math.round(Math.abs(value) / (step > 0 ? step : 1)) * (step > 0 ? step : 1);

/**
 * The canvas of one diagram. It draws the view it is sent with that diagram type's notation, keeps
 * the selection, and turns every gesture into a request to the extension: it never changes the
 * model itself, and it draws the view that follows.
 */
export class Canvas {
  readonly surface: Surface;
  private readonly stage: HTMLElement;
  private readonly notice = html('div', { class: 'adp-notice', role: 'status' });
  private readonly status = html('div', { class: 'adp-status', role: 'alert' });
  private readonly panel: Panel;
  private readonly ruler: Ruler;
  private readonly toolbox: Toolbox;
  private readonly menu: Menu;
  private readonly editor: InlineEditor;
  private view: ViewModel | undefined;
  private context: DrawContext | undefined;
  private notation: Notation | undefined;
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
  private suppressMenu = false;
  /** Puts a dropped drawing back where the view has it, once the extension has answered the drop. */
  private settleOnOutcome: (() => void) | undefined;

  constructor(host: HTMLElement, private readonly send: (message: FromCanvas) => void) {
    const frame = html('div', { class: 'adp-canvas' });
    this.toolbox = new Toolbox(frame, (entry) => this.addAtCentre(entry));
    this.stage = html('div', { class: 'adp-stage' });
    frame.append(this.stage);
    host.append(frame);

    this.surface = new Surface(this.stage);
    this.surface.defs.append(svg('marker', { id: 'adp-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' },
      svg('path', { d: 'M 0 0 L 10 5 L 0 10 z' })));
    this.notice.hidden = true;
    this.status.hidden = true;
    this.stage.append(this.notice, this.status);
    this.panel = new Panel(this.stage, (options) => {
      this.options = { ...this.options, ...options };
      this.reportView();
    });
    this.ruler = new Ruler(this.stage);
    this.menu = new Menu(this.stage, (action) => this.request({ kind: 'action', action, ...(this.selection[0] !== undefined ? { id: this.selection[0] } : {}) }));
    this.editor = new InlineEditor(this.stage, (active) => this.send({ v: 1, type: 'editing', active }));

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
    });
  }

  receive(message: ToCanvas): void {
    switch (message.type) {
      case 'view':
        // A gesture begun on an older view is given up rather than applied to what it was not computed from.
        this.abandon?.();
        this.view = message.view;
        this.notation = notationFor(message.origin);
        this.actions = message.actions;
        this.version = message.version;
        this.toolbox.show(message.toolbox);
        this.draw();
        if (this.pendingMenu) {
          const at = this.pendingMenu;
          this.pendingMenu = undefined;
          this.menu.open(this.actions, at.x, at.y);
        }
        return;
      case 'outcome':
        this.settleOnOutcome?.();
        this.settleOnOutcome = undefined;
        if (message.result === 'refused' && message.sentence) this.say(message.sentence);
        return;
      case 'reveal': {
        this.select([message.id]);
        const element = this.context?.elements.get(message.id);
        if (element) {
          this.surface.reveal(element);
          if (message.editLabel) this.edit(element, message.multiline === true);
        }
        return;
      }
      case 'command':
        if (message.command === 'toggleCompact') this.panel.toggleCompact();
        return;
    }
  }

  // ---- drawing ----

  private draw(): void {
    const view = this.view;
    const notation = this.notation;
    if (!view || !notation) return;
    const root = this.surface.root;
    root.setAttribute('role', 'application');
    root.setAttribute('aria-label', notation.label);

    const context: DrawContext = { view, elements: new Map(view.elements.map((element) => [element.id, element])) };
    this.context = context;
    // Relations first, so an element's shape is drawn over the line that reaches it.
    const drawn: SVGGElement[] = [];
    for (const relation of view.relations) {
      const group = notation.relation(relation, context);
      if (group) drawn.push(group);
    }
    for (const element of view.elements) drawn.push(notation.element(element, context));
    this.surface.content.replaceChildren(...drawn);

    // A selection survives a redraw for as long as what it names is still drawn.
    const ids = new Set([...view.elements.map((element) => element.id), ...view.relations.map((relation) => relation.id)]);
    this.selection = this.selection.filter((id) => ids.has(id));
    this.markSelection();

    this.notice.hidden = view.notice === undefined;
    this.notice.textContent = view.notice ?? '';
    this.panel.show(view);
    this.surface.placeOnce(boundsOf(view.elements));
    this.drawRuler();
  }

  private drawRuler(): void {
    const chrome = this.view?.chrome;
    const rungs = (chrome?.ruler as Rung[] | undefined) ?? [];
    const viewport = this.surface.viewport();
    this.ruler.draw(rungs, (chrome?.unitMonths as number | undefined) ?? 1, viewport, this.surface.zoom, (x) => this.surface.toScreen(x, 0).x);
  }

  private selected(): ViewElement | ViewRelation | undefined {
    if (this.selection.length !== 1 || !this.view) return undefined;
    const id = this.selection[0];
    return this.context?.elements.get(id) ?? this.view.relations.find((relation) => relation.id === id);
  }

  private markSelection(): void {
    const selected = new Set(this.selection);
    for (const group of this.surface.content.querySelectorAll('[data-id]')) {
      group.classList.toggle('adp-selected', selected.has(group.getAttribute('data-id') ?? ''));
    }
    this.drawHandles();
  }

  // The handles of a single selection: the sides it can be resized by, and its notation's own.
  private drawHandles(): void {
    const handles: SVGElement[] = [];
    const selected = this.selected();
    if (selected && this.view && !this.view.readOnly && this.context) {
      if (!('from' in selected)) {
        const resize = selected.data.resize;
        const size = 6 / this.surface.zoom;
        const sides: [Side, number, number, string][] = [];
        if (resize === 'horizontal' || resize === 'both') {
          sides.push(['left', selected.x, selected.y + selected.height / 2, 'ew-resize'], ['right', selected.x + selected.width, selected.y + selected.height / 2, 'ew-resize']);
        }
        if (resize === 'both') {
          sides.push(['top', selected.x + selected.width / 2, selected.y, 'ns-resize'], ['bottom', selected.x + selected.width / 2, selected.y + selected.height, 'ns-resize'],
            ['corner', selected.x + selected.width, selected.y + selected.height, 'nwse-resize']);
        }
        for (const [side, x, y, cursor] of sides) {
          handles.push(svg('rect', { class: 'adp-handle adp-resize', 'data-resize': side, x: x - size / 2, y: y - size / 2, width: size, height: size, style: `cursor: ${cursor}` }));
        }
      }
      for (const handle of this.notation?.handles?.(selected, this.context) ?? []) {
        handles.push(svg('circle', { class: 'adp-handle', 'data-handle': handle.id, cx: handle.x, cy: handle.y, r: 4 / this.surface.zoom, style: `cursor: ${handle.cursor}` },
          svg('title', {}, handle.title)));
      }
    }
    this.surface.overlay.replaceChildren(...handles);
  }

  // ---- selection, clicks and menus ----

  private idAt(target: EventTarget | null): string | undefined {
    return (target as Element | null)?.closest?.('[data-id]')?.getAttribute('data-id') ?? undefined;
  }

  private click(event: MouseEvent): void {
    if ((event.target as Element).closest('.adp-handle')) return;
    const id = this.idAt(event.target);
    if (!id) {
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
    if (!same || always) this.send({ v: 1, type: 'selection', ids });
  }

  // Activating an element edits its text in place.
  private activate(event: MouseEvent): void {
    const id = this.idAt(event.target);
    const element = id ? this.context?.elements.get(id) : undefined;
    if (element && this.view && !this.view.readOnly) this.edit(element, element.data.multiline === true);
  }

  // The menu shows the actions for what was pointed at, which the extension sends with the view
  // that follows the selection; so the menu opens when that view arrives.
  private contextMenu(event: MouseEvent): void {
    event.preventDefault();
    if (this.suppressMenu) {
      this.suppressMenu = false;
      return;
    }
    if (this.view?.readOnly) return;
    const id = this.idAt(event.target);
    this.pendingMenu = { x: event.clientX, y: event.clientY };
    this.select(id ? [id] : [], true);
  }

  private edit(element: ViewElement, multiline: boolean): void {
    const corner = this.surface.toScreen(element.x, element.y);
    const zoom = this.surface.zoom;
    this.editor.open(element.label, multiline, { left: corner.x, top: corner.y, width: element.width * zoom, height: multiline ? element.height * zoom : 22 }, (text) => {
      this.request({ kind: 'rename', id: element.id, text });
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
    this.send({ v: 1, type: 'edit', seq: this.seq, request, version: this.version });
  }

  // ---- the toolbox ----

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
    const view = this.view;
    const context = this.context;
    if (!view || !context || view.readOnly || this.editor.active) return;
    const target = event.target as Element;
    const point = this.surface.toCanvas(event.clientX, event.clientY);

    if (event.button === 0) {
      const handle = target.closest('[data-handle]')?.getAttribute('data-handle');
      const side = target.closest('[data-resize]')?.getAttribute('data-resize') as Side | null | undefined;
      const selected = this.selected();
      if (handle && selected) {
        this.dragHandle(event, selected, handle);
        return;
      }
      if (side && selected && !('from' in selected)) {
        this.resize(event, selected, side);
        return;
      }
    }

    const id = this.idAt(target);
    const element = id ? context.elements.get(id) : undefined;
    if (!element) return;
    if (event.button === 2) {
      // A right-button drag from an element draws a relation from it; a right click is the menu.
      if (element.data.connectable === true) this.connect(event, element, this.notation?.connectFrom?.(element, point) ?? '', true);
      return;
    }
    if (event.button !== 0) return;
    const fromEnd = element.data.connectable === true ? this.notation?.connectFrom?.(element, point) : undefined;
    if (fromEnd !== undefined) this.connect(event, element, fromEnd, false);
    else if (element.data.movable === true) this.move(event, element);
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

  private snap(): { x: number; y: number } {
    return (this.view?.chrome.snap as { x: number; y: number } | undefined) ?? { x: 0, y: 0 };
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

  private move(event: PointerEvent, element: ViewElement): void {
    const snap = this.snap();
    const context = this.context;
    const groups = new Map<string, Element>();
    for (const group of this.surface.content.querySelectorAll('.adp-element[data-id]')) groups.set(group.getAttribute('data-id') ?? '', group);
    const relations = this.view?.relations ?? [];
    let moved: Element[] = [];
    let dimmed: Element[] = [];
    const settle = (): void => {
      for (const group of moved) group.removeAttribute('transform');
      for (const group of dimmed) group.classList.remove('adp-ghost');
      moved = [];
      dimmed = [];
    };

    // How far each element is drawn from its place while this one is dragged to `at`. A notation
    // may say it for the whole drawing, such as a tree whose siblings step aside; otherwise the
    // element moves, with whatever its view says goes with it and whatever follows it up and down.
    const offsetsAt = (at: CanvasPoint): Map<string, CanvasPoint> => {
      const given = context ? this.notation?.dragging?.(element, at, context) : undefined;
      if (given) return given;
      const offsets = new Map<string, CanvasPoint>();
      const subtree = (element.data.subtree as string[] | undefined) ?? [element.id];
      for (const id of (element.data.row as string[] | undefined) ?? []) offsets.set(id, { x: 0, y: at.y - element.y });
      for (const id of subtree) offsets.set(id, { x: at.x - element.x, y: at.y - element.y });
      return offsets;
    };

    let at = { x: element.x, y: element.y };
    this.track(event, {
      move: (_point, delta) => {
        at = { x: element.x + snapTo(delta.x, snap.x), y: element.y + snapTo(delta.y, snap.y) };
        const offsets = offsetsAt(at);
        settle();
        for (const [id, offset] of offsets) {
          const group = groups.get(id);
          if (!group || (offset.x === 0 && offset.y === 0)) continue;
          group.setAttribute('transform', `translate(${offset.x} ${offset.y})`);
          moved.push(group);
        }
        // A line to something that moves is not redrawn while it moves; it is dimmed until the drop.
        const moving = new Set(moved.map((group) => group.getAttribute('data-id')));
        for (const relation of relations) {
          if (!moving.has(relation.from) && !moving.has(relation.to)) continue;
          const line = this.group(relation.id);
          if (!line) continue;
          line.classList.add('adp-ghost');
          dimmed.push(line);
        }
        this.surface.overlay.replaceChildren();
      },
      end: () => {
        this.select([element.id]);
        if (at.x === element.x && at.y === element.y) {
          settle();
          return;
        }
        // The drawing stays where it was dropped until the view that follows replaces it.
        this.request({ kind: 'move', id: element.id, x: at.x, y: at.y });
        this.settleOnOutcome = settle;
      },
      cancel: settle,
    });
  }

  private resize(event: PointerEvent, element: ViewElement, side: Side): void {
    const snap = this.snap();
    const right = element.x + element.width;
    const bottom = element.y + element.height;
    let bounds: Box = element;
    this.track(event, {
      move: (point) => {
        let { x, y } = element;
        let width = element.width;
        let height = element.height;
        if (side === 'left') {
          x = Math.min(snapTo(point.x, snap.x), right - Math.max(minimumSize, snap.x));
          width = right - x;
        }
        if (side === 'right' || side === 'corner') width = Math.max(Math.max(minimumSize, snap.x), snapTo(point.x, snap.x) - element.x);
        if (side === 'top') {
          y = Math.min(snapTo(point.y, snap.y), bottom - minimumSize);
          height = bottom - y;
        }
        if (side === 'bottom' || side === 'corner') height = Math.max(minimumSize, Math.round(point.y - element.y));
        bounds = { x, y, width, height };
        if (this.notation && this.context) this.preview(element.id, this.notation.element({ ...element, ...bounds }, this.context));
      },
      end: () => {
        this.endPreview(element.id);
        if (bounds !== element) this.request({ kind: 'resize', id: element.id, side, bounds });
      },
      cancel: () => this.endPreview(element.id),
    });
  }

  private dragHandle(event: PointerEvent, selected: ViewElement | ViewRelation, handle: string): void {
    let request: EditRequest | undefined;
    this.track(event, {
      move: (point) => {
        if (!this.notation?.dragHandle || !this.context) return;
        const drag = this.notation.dragHandle(selected, handle, point, this.context);
        request = drag.request;
        const drawing = drag.element ? this.notation.element(drag.element, this.context) : drag.relation ? this.notation.relation(drag.relation, this.context) : undefined;
        this.preview(selected.id, drawing);
      },
      end: () => {
        this.endPreview(selected.id);
        if (request) this.request(request);
      },
      cancel: () => this.endPreview(selected.id),
    });
  }

  private connect(event: PointerEvent, from: ViewElement, fromEnd: string, rightButton: boolean): void {
    this.track(event, {
      move: (point) => {
        const line = this.notation?.connecting && this.context
          ? this.notation.connecting(from, fromEnd, point, this.context)
          : svg('line', { class: 'adp-relation-line adp-connecting', x1: from.x + from.width / 2, y1: from.y + from.height / 2, x2: point.x, y2: point.y });
        line.classList.add('adp-preview');
        this.surface.overlay.replaceChildren(line);
      },
      end: (point, last) => {
        // A right-button drag ends in a context menu event, which this gesture has already answered.
        if (rightButton) this.suppressMenu = true;
        this.drawHandles();
        const targetId = this.idAt(document.elementFromPoint(last.clientX, last.clientY));
        const target = targetId ? this.context?.elements.get(targetId) : undefined;
        if (!target) return;
        const toEnd = this.notation?.connectTo?.(target, point);
        this.request({ kind: 'connect', from: from.id, to: target.id, ...(fromEnd.length > 0 ? { fromEnd } : {}), ...(toEnd ? { toEnd } : {}) });
      },
      cancel: () => {
        this.drawHandles();
        if (!rightButton && from.data.movable !== true) this.select([from.id]);
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
    if (this.options.compact === true) {
      // Compact places every element by where all the others start, so it needs the whole document.
      this.options = kept;
    } else {
      const view = this.surface.viewport();
      // Half a screen more on every side, so a short pan shows what was already drawn.
      const margin = { x: view.width / 2, y: view.height / 2 };
      this.options = { ...kept, viewport: { x: view.x - margin.x, y: view.y - margin.y, width: view.width + 2 * margin.x, height: view.height + 2 * margin.y } };
    }
    this.send({ v: 1, type: 'viewOptions', options: this.options });
  }
}

/** The box around every element, or nothing for an empty diagram. */
export function boundsOf(elements: readonly ViewElement[]): Box | undefined {
  if (elements.length === 0) return undefined;
  const left = Math.min(...elements.map((element) => element.x));
  const top = Math.min(...elements.map((element) => element.y));
  const right = Math.max(...elements.map((element) => element.x + element.width));
  const bottom = Math.max(...elements.map((element) => element.y + element.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
