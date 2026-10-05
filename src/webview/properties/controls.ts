import type { Field } from '../../core/frame/diagramType';
import { html } from '../diagram/dom';

/** The control of one field, wired to hand over its value when it is committed. */
export function controlFor(field: Field, commit: (value: string) => void): HTMLElement {
  const locked = field.readOnly !== undefined;
  const common = { id: field.id, 'aria-label': field.label, title: field.readOnly ?? '' };

  if (field.control === 'slider' && field.options) {
    const options = field.options;
    const slider = html('input', { ...common, type: 'range', min: 0, max: options.length - 1, step: 1, value: Math.max(0, options.indexOf(field.value)) });
    const caption = html('output', { class: 'adp-slider-caption', for: field.id }, field.value);
    slider.disabled = locked;
    // Every stop passed is its own edit, as each is its own state of the diagram.
    slider.addEventListener('input', () => {
      caption.textContent = options[Number(slider.value)] ?? '';
      commit(options[Number(slider.value)] ?? '');
    });
    return html('div', { class: 'adp-slider' }, slider, caption);
  }

  if (field.control === 'choice' && field.options) {
    const select = html('select', common, ...field.options.map((option) => html('option', { value: option }, option)));
    select.value = field.value;
    select.disabled = locked;
    select.addEventListener('change', () => commit(select.value));
    return select;
  }

  if (field.control === 'multiline') {
    const area = html('textarea', { ...common, rows: Math.min(8, Math.max(2, field.value.split('\n').length)) });
    area.value = field.value;
    area.readOnly = locked;
    area.addEventListener('change', () => commit(area.value));
    return area;
  }

  const input = html('input', { ...common, type: field.control === 'number' ? 'number' : 'text' });
  input.value = field.value;
  input.readOnly = locked;
  if (field.control === 'tags' && field.options) {
    // Tags are typed separated by commas; the tags already in use are offered.
    const list = html('datalist', { id: `${field.id}-suggestions` }, ...field.options.map((option) => html('option', { value: option })));
    input.setAttribute('list', list.id);
    input.placeholder = 'Tags, separated by commas';
    input.addEventListener('change', () => commit(input.value));
    return html('div', { class: 'adp-tags' }, input, list);
  }
  input.addEventListener('change', () => commit(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });
  return input;
}

/** The rows of a selection as groups of labelled controls, or the sentence that says why there are none. */
export function gridOf(fields: readonly Field[], empty: string | undefined, commit: (field: string, value: string) => void): HTMLElement[] {
  if (fields.length === 0) return [html('p', { class: 'adp-properties-empty' }, empty ?? '')];
  const groups = new Map<string, Field[]>();
  for (const field of fields) groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
  return [...groups].map(([group, members]) => html('fieldset', { class: 'adp-group' },
    html('legend', {}, group),
    ...members.map((field) => html('div', { class: 'adp-field', 'data-field': field.id },
      html('label', { for: field.id }, field.label),
      controlFor(field, (value) => commit(field.id, value)),
      html('p', { class: 'adp-field-refusal', role: 'alert', hidden: 'hidden' })))));
}
