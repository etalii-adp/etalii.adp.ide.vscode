import type { ViewModel, ViewOptions } from '../../core/frame/diagramType';
import { html } from './dom';

interface FilterChrome {
  readonly label: string;
  readonly tags: readonly string[];
  readonly mode: 'any' | 'all';
}

/**
 * What a notation shows beside its canvas: a filter by tags with chips, a lookup of the tags in
 * use and an Any/All switch; under it the legend; under that the Compact switch. All of it is view
 * state: none is saved, and none is remembered when the diagram is opened again.
 */
export class Panel {
  readonly element = html('div', { class: 'adp-panel' });
  private readonly chips = html('span', { class: 'adp-chips' });
  private readonly input = html('input', { class: 'adp-filter-input', type: 'text', list: 'adp-filter-tags', 'aria-label': 'Filter by tags' });
  private readonly suggestions = html('datalist', { id: 'adp-filter-tags' });
  private readonly mode = html('select', { class: 'adp-filter-mode', 'aria-label': 'Match any or all tags' },
    html('option', { value: 'any' }, 'Any'), html('option', { value: 'all' }, 'All'));
  private readonly filter = html('div', { class: 'adp-filter' });
  private readonly legend = html('ul', { class: 'adp-legend', 'aria-label': 'Legend' });
  private readonly compact = html('input', { type: 'checkbox', id: 'adp-compact' });
  private readonly compactRow = html('label', { class: 'adp-compact', for: 'adp-compact' });
  private tags: string[] = [];

  constructor(host: HTMLElement, private readonly changed: (options: Pick<ViewOptions, 'filterTags' | 'filterMode' | 'compact'>) => void) {
    this.filter.append(this.chips, this.input, this.suggestions, this.mode);
    this.compactRow.append(this.compact, 'Compact');
    this.element.append(this.filter, this.legend, this.compactRow);
    this.element.hidden = true;
    host.append(this.element);

    // Enter or a comma turns what was typed into a chip; Backspace in the empty box takes the last one off.
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        this.addTag(this.input.value);
      } else if (event.key === 'Backspace' && this.input.value.length === 0 && this.tags.length > 0) {
        this.setTags(this.tags.slice(0, -1));
      }
    });
    // Choosing a suggestion, or pasting, fills the box without a key press.
    this.input.addEventListener('change', () => this.addTag(this.input.value));
    this.mode.addEventListener('change', () => this.emit());
    this.compact.addEventListener('change', () => this.emit());
  }

  /** Shows what the view declares, keeping whatever is being typed. */
  show(view: ViewModel): void {
    const chrome = view.chrome;
    const filter = chrome.filter as FilterChrome | undefined;
    const legend = (chrome.legend as { caption: string; phase: string }[] | undefined) ?? [];
    const hasCompact = typeof chrome.compact === 'boolean';
    this.element.hidden = !filter && legend.length === 0 && !hasCompact;

    this.filter.hidden = !filter;
    if (filter) {
      this.input.placeholder = filter.label;
      this.tags = [...filter.tags];
      this.mode.value = filter.mode;
      this.drawChips();
      const inUse = (chrome.tags as string[] | undefined) ?? [];
      this.suggestions.replaceChildren(...inUse.map((tag) => html('option', { value: tag })));
    }

    this.legend.hidden = legend.length === 0;
    this.legend.replaceChildren(...legend.map((entry) => html('li', {}, html('span', { class: `adp-legend-swatch ghg-${entry.phase}` }), entry.caption)));

    this.compactRow.hidden = !hasCompact;
    this.compact.checked = chrome.compact === true;
  }

  /** Turns Compact on or off, as its switch does. */
  toggleCompact(): void {
    if (this.compactRow.hidden) return;
    this.compact.checked = !this.compact.checked;
    this.emit();
  }

  private addTag(typed: string): void {
    const added = typed.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0);
    this.input.value = '';
    if (added.length === 0) return;
    const known = new Set(this.tags.map((tag) => tag.toLowerCase()));
    this.setTags([...this.tags, ...added.filter((tag) => !known.has(tag.toLowerCase()))]);
  }

  private setTags(tags: string[]): void {
    this.tags = tags;
    this.drawChips();
    this.emit();
  }

  private drawChips(): void {
    this.chips.replaceChildren(...this.tags.map((tag) => {
      const remove = html('button', { class: 'adp-chip-remove', type: 'button', title: `Remove ${tag} from the filter`, 'aria-label': `Remove ${tag}` }, '×');
      remove.addEventListener('click', () => this.setTags(this.tags.filter((other) => other !== tag)));
      return html('span', { class: 'adp-chip' }, tag, remove);
    }));
  }

  private emit(): void {
    this.changed({ filterTags: this.tags, filterMode: this.mode.value === 'all' ? 'all' : 'any', compact: this.compact.checked });
  }
}
