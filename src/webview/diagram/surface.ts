import type { Box } from '../../core/frame/diagramType';
import { svg } from './dom';

const minScale = 0.05;
const maxScale = 8;
/** The smallest zoom a document is first shown at: below it, names and phases cannot be read. */
const readableScale = 0.6;

/**
 * The drawing surface: one SVG whose world group is panned and zoomed. Everything a notation draws
 * goes into the world in canvas units; the surface turns pointer positions into canvas units and
 * reports the part of the canvas in view.
 */
export class Surface {
  readonly root: SVGSVGElement;
  readonly world: SVGGElement;
  /** What the notation draws. */
  readonly content: SVGGElement;
  /** What the canvas draws over it: handles and the preview of a gesture. */
  readonly overlay: SVGGElement;
  readonly defs: SVGDefsElement;
  private tx = 0;
  private ty = 0;
  private scale = 1;
  private placed = false;
  private readonly listeners: (() => void)[] = [];

  constructor(host: HTMLElement) {
    this.defs = svg('defs');
    this.content = svg('g', { class: 'adp-content' });
    this.overlay = svg('g', { class: 'adp-overlay' });
    this.world = svg('g', { class: 'adp-world' }, this.content, this.overlay);
    this.root = svg('svg', { class: 'adp-surface', tabindex: 0 }, this.defs, this.world);
    host.append(this.root);
    this.root.addEventListener('wheel', (event) => this.wheel(event), { passive: false });
    this.root.addEventListener('pointerdown', (event) => this.startPan(event));
  }

  /** Calls back whenever the part of the canvas in view changes. */
  onViewChanged(listener: () => void): void {
    this.listeners.push(listener);
  }

  get zoom(): number {
    return this.scale;
  }

  /** The part of the canvas in view, in canvas units. */
  viewport(): Box {
    const { width, height } = this.size();
    return { x: -this.tx / this.scale, y: -this.ty / this.scale, width: width / this.scale, height: height / this.scale };
  }

  /** A pointer position as canvas units. */
  toCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const bounds = this.root.getBoundingClientRect();
    return { x: (clientX - bounds.left - this.tx) / this.scale, y: (clientY - bounds.top - this.ty) / this.scale };
  }

  /** A canvas point as pixels from the surface's top-left corner. */
  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: x * this.scale + this.tx, y: y * this.scale + this.ty };
  }

  /**
   * Shows a document's content when it is first drawn: all of it when that leaves it readable, and
   * otherwise its top-left corner at a readable size, since a graph of three centuries fitted into
   * one screen shows nothing that can be read or pointed at.
   */
  placeOnce(content: Box | undefined): void {
    if (this.placed || !content) return;
    const { width, height } = this.size();
    if (width === 0 || height === 0) return;
    this.placed = true;
    const margin = 48;
    const fit = Math.min(1, (width - 2 * margin) / Math.max(1, content.width), (height - 2 * margin) / Math.max(1, content.height));
    if (fit >= readableScale) {
      this.reveal(content, true);
      return;
    }
    this.scale = readableScale;
    // Room on the left for the names written before the first elements.
    this.tx = Math.min(width / 3, 240) - content.x * this.scale;
    this.ty = margin - content.y * this.scale;
    this.apply();
  }
  /** Scrolls so a box is in view; `fit` also zooms out until it fits. */
  reveal(box: Box, fit = false): void {
    const { width, height } = this.size();
    if (width === 0 || height === 0) return;
    const margin = 48;
    if (fit) {
      const scale = Math.min(1, (width - 2 * margin) / Math.max(1, box.width), (height - 2 * margin) / Math.max(1, box.height));
      this.scale = Math.min(maxScale, Math.max(minScale, scale));
    }
    const view = this.viewport();
    const inside = box.x >= view.x && box.y >= view.y && box.x + box.width <= view.x + view.width && box.y + box.height <= view.y + view.height;
    if (!fit && inside) return;
    this.tx = width / 2 - (box.x + box.width / 2) * this.scale;
    this.ty = height / 2 - (box.y + box.height / 2) * this.scale;
    this.apply();
  }

  private size(): { width: number; height: number } {
    return { width: this.root.clientWidth, height: this.root.clientHeight };
  }

  private apply(): void {
    this.world.setAttribute('transform', `translate(${this.tx} ${this.ty}) scale(${this.scale})`);
    for (const listener of this.listeners) listener();
  }

  // Ctrl or a pinch zooms about the pointer; a plain wheel scrolls, sideways with Shift.
  private wheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const bounds = this.root.getBoundingClientRect();
      const px = event.clientX - bounds.left;
      const py = event.clientY - bounds.top;
      const next = Math.min(maxScale, Math.max(minScale, this.scale * Math.exp(-event.deltaY * 0.0015)));
      this.tx = px - ((px - this.tx) / this.scale) * next;
      this.ty = py - ((py - this.ty) / this.scale) * next;
      this.scale = next;
    } else if (event.shiftKey) {
      this.tx -= event.deltaY + event.deltaX;
    } else {
      this.tx -= event.deltaX;
      this.ty -= event.deltaY;
    }
    this.apply();
  }

  // A drag that starts on empty canvas, or with the middle button anywhere, pans.
  private startPan(event: PointerEvent): void {
    const onBackground = event.target === this.root;
    if (!(event.button === 1 || (event.button === 0 && onBackground))) return;
    const start = { x: event.clientX, y: event.clientY, tx: this.tx, ty: this.ty };
    const move = (moved: PointerEvent): void => {
      this.tx = start.tx + moved.clientX - start.x;
      this.ty = start.ty + moved.clientY - start.y;
      this.apply();
    };
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }
}
