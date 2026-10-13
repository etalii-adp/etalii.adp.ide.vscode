import { html } from './dom';

/** The strip at the bottom of the canvas that a scene's ruler is drawn in: the ticks of the level that has room, each at its place. */
export class Ruler {
  readonly element = html('div', { class: 'adp-ruler', 'aria-hidden': 'true' });

  constructor(host: HTMLElement) {
    this.element.hidden = true;
    host.append(this.element);
  }
}
