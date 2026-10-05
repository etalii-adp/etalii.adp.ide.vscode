import type { ToolboxEntry } from '../../core/frame/diagramType';
import { html } from '../diagram/dom';
import { icon } from '../diagram/icons';

/** The data a dragged toolbox entry carries, so the canvas knows a drop is one of its own. */
export const toolboxMime = 'application/x-adp-toolbox';

/**
 * The ADP Toolbox: the entries of the active diagram's type with their icons and descriptions, in a
 * view of its own. An entry is dragged onto the canvas, or added at the centre of what the canvas
 * shows with a click, Enter or Space.
 */
export class Toolbox {
  readonly element = html('div', { class: 'adp-toolbox', role: 'list', 'aria-label': 'ADP Toolbox' });
  private readonly empty = html('p', { class: 'adp-toolbox-empty' });
  private shown = '';

  constructor(host: HTMLElement, private readonly add: (entry: string) => void) {
    this.empty.hidden = true;
    host.append(this.element, this.empty);
  }

  /** Shows the entries; with none, the sentence that says why. */
  show(entries: readonly ToolboxEntry[], empty: string | undefined): void {
    this.empty.hidden = entries.length > 0;
    this.empty.textContent = entries.length > 0 ? '' : (empty ?? '');
    const key = JSON.stringify(entries);
    if (key === this.shown) return;
    this.shown = key;
    this.element.replaceChildren(...entries.map((entry) => this.entry(entry)));
  }

  private entry(entry: ToolboxEntry): HTMLElement {
    const button = html('button', { class: 'adp-toolbox-entry', type: 'button', role: 'listitem', draggable: 'true', title: entry.description, 'data-entry': entry.id },
      icon(entry.icon), html('span', {}, entry.label));
    button.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData(toolboxMime, entry.id);
      event.dataTransfer?.setData('text/plain', entry.label);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    });
    // A click is how Enter and Space arrive too.
    button.addEventListener('click', () => this.add(entry.id));
    return button;
  }
}
