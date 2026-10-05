import type { Action } from '../../core/frame/diagramType';
import { html } from './dom';
import { icon } from './icons';

/**
 * The context menu of the canvas: the actions the diagram type offers for what was pointed at. An
 * action that cannot run now is shown with the reason, not left out.
 */
export class Menu {
  private readonly element = html('ul', { class: 'adp-menu', role: 'menu' });
  private readonly dismiss = (event: Event): void => {
    if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
    if (event instanceof MouseEvent && this.element.contains(event.target as Node)) return;
    this.close();
  };

  constructor(private readonly host: HTMLElement, private readonly run: (action: string) => void) {
    this.element.hidden = true;
    host.append(this.element);
  }

  open(actions: readonly Action[], clientX: number, clientY: number): void {
    if (actions.length === 0) return;
    this.element.replaceChildren(...actions.map((action) => {
      const item = html('button', { class: 'adp-menu-item', type: 'button', role: 'menuitem', title: action.enabled ? '' : action.disabledReason ?? '' },
        icon(action.icon), html('span', { class: 'adp-menu-label' }, action.label), html('span', { class: 'adp-menu-shortcut' }, action.shortcut ?? ''));
      if (!action.enabled) item.setAttribute('aria-disabled', 'true');
      item.addEventListener('click', () => {
        if (!action.enabled) return;
        this.close();
        this.run(action.id);
      });
      return html('li', { role: 'none' }, item);
    }));
    const bounds = this.host.getBoundingClientRect();
    this.element.hidden = false;
    this.element.style.left = `${Math.max(0, Math.min(clientX - bounds.left, bounds.width - this.element.offsetWidth))}px`;
    this.element.style.top = `${Math.max(0, Math.min(clientY - bounds.top, bounds.height - this.element.offsetHeight))}px`;
    (this.element.querySelector('button:not([aria-disabled])') as HTMLElement | null)?.focus();
    window.addEventListener('pointerdown', this.dismiss, true);
    window.addEventListener('keydown', this.dismiss, true);
    window.addEventListener('blur', this.dismiss);
  }

  close(): void {
    this.element.hidden = true;
    window.removeEventListener('pointerdown', this.dismiss, true);
    window.removeEventListener('keydown', this.dismiss, true);
    window.removeEventListener('blur', this.dismiss);
  }
}
