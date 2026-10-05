import { html } from './dom';

/**
 * Text edited in place, over the element it belongs to: one line for a name, several for a note.
 * Enter commits a single line, Ctrl+Enter several; leaving the box commits too; Escape gives up.
 */
export class InlineEditor {
  private box: HTMLInputElement | HTMLTextAreaElement | undefined;

  constructor(private readonly host: HTMLElement, private readonly editing: (active: boolean) => void) {}

  get active(): boolean {
    return this.box !== undefined;
  }

  /** Opens the editor over a rectangle of the host, with the text selected. */
  open(text: string, multiline: boolean, place: { left: number; top: number; width: number; height: number }, commit: (text: string) => void): void {
    this.close();
    const box = multiline
      ? html('textarea', { class: 'adp-inline-editor', 'aria-label': 'Text' })
      : html('input', { class: 'adp-inline-editor', type: 'text', 'aria-label': 'Name' });
    box.value = text;
    box.style.left = `${place.left}px`;
    box.style.top = `${place.top}px`;
    box.style.width = `${Math.max(120, place.width)}px`;
    box.style.height = `${Math.max(multiline ? 48 : 22, place.height)}px`;

    let done = false;
    const finish = (save: boolean): void => {
      if (done) return;
      done = true;
      const value = box.value;
      this.close();
      if (save && value !== text) commit(value);
    };
    (box as HTMLElement).addEventListener('keydown', (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') finish(false);
      else if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        finish(true);
      }
    });
    box.addEventListener('blur', () => finish(true));
    box.addEventListener('pointerdown', (event) => event.stopPropagation());

    this.box = box;
    this.host.append(box);
    this.editing(true);
    box.focus();
    box.select();
  }

  close(): void {
    if (!this.box) return;
    const box = this.box;
    this.box = undefined;
    box.remove();
    this.editing(false);
  }
}
