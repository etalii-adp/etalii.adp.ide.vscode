import type { ToolboxEntry } from '../../core/frame/diagramType';
import { html } from '../canvas/dom';
import { icon } from '../canvas/icons';

/** The data a dragged toolbox entry carries, so the canvas knows a drop is one of its own. */
export const toolboxMime = 'application/x-adp-toolbox';

/**
 * The ADP Toolbox, docked in the diagram's editor: the entries of the diagram's type with their
 * icons and descriptions. An entry is dragged onto the canvas, or added at the centre of the view
 * with Enter. It sits in the editor rather than in a view of its own because Visual Studio Code
 * does not carry a drag from one webview to another.
 */
export class Toolbox {
  readonly element = html('aside', { class: 'adp-toolbox', 'aria-label': 'ADP Toolbox' });
  private readonly list = html('div', { class: 'adp-toolbox-entries', role: 'list' });
  private shown = '';

  constructor(host: HTMLElement, private readonly add: (entry: string) => void) {
    const toggle = html('button', { class: 'adp-toolbox-title', type: 'button', title: 'Collapse or expand the ADP Toolbox', 'aria-expanded': 'true' }, 'ADP Toolbox');
    toggle.addEventListener('click', () => {
      const collapsed = this.element.classList.toggle('adp-collapsed');
      toggle.setAttribute('aria-expanded', String(!collapsed));
    });
    this.element.append(toggle, this.list);
    this.element.hidden = true;
    host.append(this.element);
  }

  /** Shows the entries; with none, as for a read-only diagram, the toolbox is not shown at all. */
  show(entries: readonly ToolboxEntry[]): void {
    this.element.hidden = entries.length === 0;
    const key = JSON.stringify(entries);
    if (key === this.shown) return;
    this.shown = key;
    this.list.replaceChildren(...entries.map((entry) => this.entry(entry)));
  }

  private entry(entry: ToolboxEntry): HTMLElement {
    const button = html('button', { class: 'adp-toolbox-entry', type: 'button', role: 'listitem', draggable: 'true', title: entry.description, 'data-entry': entry.id },
      icon(entry.icon), html('span', {}, entry.label));
    button.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData(toolboxMime, entry.id);
      event.dataTransfer?.setData('text/plain', entry.label);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    });
    // A click is how Enter and Space arrive too: the entry is added at the centre of the view.
    button.addEventListener('click', () => this.add(entry.id));
    return button;
  }
}
