import { originMonth, unitsPerStep } from '../../core/gartner-hypecycle-graph/scale';
import { html } from './dom';

export interface Rung {
  readonly months: number;
  readonly every: string;
  readonly label: string;
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A month index as a rung labels it: `MMM yyyy`, or the year alone. */
export function rungLabel(monthIndex: number, format: string): string {
  const year = Math.floor(monthIndex / 12);
  return format === 'yyyy' ? String(year) : `${monthNames[monthIndex - year * 12]} ${year}`;
}

/** The finest rung whose labels are at least `minSpacing` pixels apart; the coarsest when none is. */
export function rungFor(rungs: readonly Rung[], pixelsPerMonth: number, minSpacing: number): Rung | undefined {
  return rungs.find((rung) => rung.months * pixelsPerMonth >= minSpacing) ?? rungs[rungs.length - 1];
}

/** The ticks of a rung between two canvas x: each a month index and its canvas x. */
export function ticksOf(rung: Rung, unitMonths: number, fromX: number, toX: number): { month: number; x: number }[] {
  const monthAt = (x: number): number => originMonth + (x * unitMonths) / unitsPerStep;
  const xOf = (month: number): number => ((month - originMonth) * unitsPerStep) / unitMonths;
  const ticks: { month: number; x: number }[] = [];
  for (let month = Math.ceil(monthAt(fromX) / rung.months) * rung.months; month <= monthAt(toX); month += rung.months) {
    ticks.push({ month, x: xOf(month) });
  }
  return ticks;
}

/**
 * A horizontal time ruler pinned to the bottom of the screen, not to the canvas. It shows the
 * finest of its rungs whose labels have room, so zooming out moves from months to years to
 * centuries; a diagram drawn in a coarser unit never labels a step it cannot snap to.
 */
export class Ruler {
  readonly element = html('div', { class: 'adp-ruler', 'aria-hidden': 'true' });

  constructor(host: HTMLElement, private readonly minSpacing = 64) {
    host.append(this.element);
  }

  draw(rungs: readonly Rung[], unitMonths: number, viewport: { x: number; width: number }, zoom: number, toScreenX: (x: number) => number): void {
    this.element.replaceChildren();
    this.element.hidden = rungs.length === 0;
    if (rungs.length === 0) return;
    const rung = rungFor(rungs, (unitsPerStep / unitMonths) * zoom, this.minSpacing);
    if (!rung) return;
    for (const tick of ticksOf(rung, unitMonths, viewport.x, viewport.x + viewport.width)) {
      this.element.append(html('span', { class: 'adp-ruler-tick', style: `left: ${toScreenX(tick.x)}px` }, rungLabel(tick.month, rung.label)));
    }
  }
}
