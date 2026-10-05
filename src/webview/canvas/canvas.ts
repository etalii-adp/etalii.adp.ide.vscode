import type { ViewElement, ViewModel } from '../../core/frame/diagramType';
import type { FromCanvas, ToCanvas } from '../../core/frame/protocol';
import { html, svg } from './dom';
import { notationFor, type DrawContext } from './notation';
import { Ruler, type Rung } from './ruler';
import { Surface } from './surface';

/**
 * The canvas of one diagram: it draws the view it is sent with that diagram type's notation, keeps
 * the selection, and tells the extension what is in view and what is selected. It never changes
 * the model itself.
 */
export class Canvas {
  readonly surface: Surface;
  private readonly stage: HTMLElement;
  private readonly notice = html('div', { class: 'adp-notice', role: 'status' });
  private readonly panel = html('div', { class: 'adp-panel' });
  private readonly ruler: Ruler;
  private view: ViewModel | undefined;
  private origin = '';
  private selection: string[] = [];
  private reportTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(host: HTMLElement, private readonly send: (message: FromCanvas) => void) {
    this.stage = html('div', { class: 'adp-stage' });
    host.append(html('div', { class: 'adp-canvas' }, this.stage));
    this.surface = new Surface(this.stage);
    this.surface.defs.append(svg('marker', { id: 'adp-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' },
      svg('path', { d: 'M 0 0 L 10 5 L 0 10 z' })));
    this.notice.hidden = true;
    this.panel.hidden = true;
    this.stage.append(this.notice, this.panel);
    this.ruler = new Ruler(this.stage);
    this.surface.onViewChanged(() => this.viewChanged());
    this.surface.root.addEventListener('click', (event) => this.click(event));
  }

  receive(message: ToCanvas): void {
    if (message.type === 'view') {
      this.origin = message.origin;
      this.view = message.view;
      this.draw();
    } else if (message.type === 'reveal') {
      this.select([message.id]);
      const element = this.view?.elements.find((candidate) => candidate.id === message.id);
      if (element) this.surface.reveal(element);
    }
  }

  private draw(): void {
    const view = this.view;
    const notation = notationFor(this.origin);
    if (!view || !notation) return;
    this.surface.root.setAttribute('role', 'application');
    this.surface.root.setAttribute('aria-label', notation.label);

    const context: DrawContext = { view, elements: new Map(view.elements.map((element) => [element.id, element])) };
    // Relations first, so an element's shape is drawn over the line that reaches it.
    const drawn: SVGGElement[] = [];
    for (const relation of view.relations) {
      const group = notation.relation(relation, context);
      if (group) drawn.push(group);
    }
    for (const element of view.elements) drawn.push(notation.element(element, context));
    this.surface.world.replaceChildren(...drawn);

    // A selection survives a redraw for as long as what it names is still drawn.
    const ids = new Set([...view.elements.map((element) => element.id), ...view.relations.map((relation) => relation.id)]);
    this.selection = this.selection.filter((id) => ids.has(id));
    this.markSelection();

    this.notice.hidden = view.notice === undefined;
    this.notice.textContent = view.notice ?? '';
    this.drawPanel(view);
    this.surface.placeOnce(boundsOf(view.elements));
    this.drawRuler();
  }

  private drawPanel(view: ViewModel): void {
    const legend = view.chrome.legend as { caption: string; phase: string }[] | undefined;
    this.panel.hidden = !legend || legend.length === 0;
    if (!legend) return;
    const list = html('ul', { class: 'adp-legend', 'aria-label': 'Legend' });
    for (const entry of legend) {
      list.append(html('li', {}, html('span', { class: `adp-legend-swatch ghg-${entry.phase}` }), entry.caption));
    }
    this.panel.replaceChildren(list);
  }

  private drawRuler(): void {
    const chrome = this.view?.chrome;
    const rungs = (chrome?.ruler as Rung[] | undefined) ?? [];
    this.ruler.draw(rungs, (chrome?.unitMonths as number | undefined) ?? 1, this.surface.viewport(), this.surface.zoom, (x) => this.surface.toScreenX(x));
  }

  // What is in view is reported a moment after it settles, so a pan does not ask for a view per pixel.
  private viewChanged(): void {
    this.drawRuler();
    if (this.reportTimer !== undefined) clearTimeout(this.reportTimer);
    this.reportTimer = setTimeout(() => this.reportView(), 120);
  }

  private reportView(): void {
    const view = this.surface.viewport();
    // Half a screen more on every side, so a short pan shows what was already drawn.
    const margin = { x: view.width / 2, y: view.height / 2 };
    this.send({ v: 1, type: 'viewOptions', options: { viewport: { x: view.x - margin.x, y: view.y - margin.y, width: view.width + 2 * margin.x, height: view.height + 2 * margin.y } } });
  }

  private click(event: MouseEvent): void {
    const target = (event.target as Element).closest('[data-id]');
    const id = target?.getAttribute('data-id');
    if (!id) {
      this.select([]);
    } else if (event.ctrlKey || event.metaKey || event.shiftKey) {
      this.select(this.selection.includes(id) ? this.selection.filter((other) => other !== id) : [...this.selection, id]);
    } else {
      this.select([id]);
    }
  }

  private select(ids: string[]): void {
    const same = ids.length === this.selection.length && ids.every((id, index) => id === this.selection[index]);
    this.selection = ids;
    this.markSelection();
    if (!same) this.send({ v: 1, type: 'selection', ids });
  }

  private markSelection(): void {
    const selected = new Set(this.selection);
    for (const group of this.surface.world.querySelectorAll('[data-id]')) {
      group.classList.toggle('adp-selected', selected.has(group.getAttribute('data-id') ?? ''));
    }
  }
}

/** The box around every element, or nothing for an empty diagram. */
export function boundsOf(elements: readonly ViewElement[]): { x: number; y: number; width: number; height: number } | undefined {
  if (elements.length === 0) return undefined;
  const left = Math.min(...elements.map((element) => element.x));
  const top = Math.min(...elements.map((element) => element.y));
  const right = Math.max(...elements.map((element) => element.x + element.width));
  const bottom = Math.max(...elements.map((element) => element.y + element.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
