import type { TableParam, TableValue, ThemedColour } from '../../core/tool/tableView';
import { html } from '../diagram/dom';

// The small parts of the table surface that hold no state: a tag, and the control of a parameter.

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const kind = (name: string): boolean => document.body.classList.contains(name);

/**
 * A value drawn as a tag, filled with its colour for the kind of theme. In high contrast it has
 * the contrast border and the text colour of the editor, so nothing depends on the fill alone.
 */
export function tag(label: string, colour?: ThemedColour, attributes: Record<string, string | undefined> = {}, ...children: (Node | undefined)[]): HTMLSpanElement {
  const element = html('span', { class: 'adp-table-tag', ...attributes }, label, ...children);
  if (colour) {
    element.classList.add('adp-table-coloured');
    element.style.backgroundColor = kind('vscode-light') || kind('vscode-high-contrast-light') ? colour.light : colour.dark;
  }
  if (kind('vscode-high-contrast') || kind('vscode-high-contrast-light')) {
    element.style.outline = '1px solid var(--vscode-contrastBorder)';
    element.style.color = 'var(--vscode-editor-foreground)';
  }
  return element;
}

/** The control that asks one parameter of an operation, holding the value it starts with. */
export function controlOf(param: TableParam): Control {
  const start = param.value === undefined || param.value === null ? '' : String(param.value);
  if (param.control === 'choice') {
    const select = html('select', { name: param.name },
      param.required ? undefined : html('option', { value: '' }),
      ...(param.options ?? []).map((option) => html('option', { value: option.value }, option.label)));
    select.required = param.required;
    select.value = start;
    return select;
  }
  if (param.control === 'multiline') {
    const area = html('textarea', { name: param.name, rows: 3 });
    area.required = param.required;
    area.value = start;
    return area;
  }
  const input = html('input', {
    name: param.name, type: param.control === 'dateTime' ? 'text' : param.control,
    // A `datetime-local` drops the offset, so a date and time is typed as ISO 8601.
    placeholder: param.control === 'dateTime' ? 'YYYY-MM-DDThh:mm:ss+hh:mm' : undefined,
  });
  if (param.control === 'checkbox') {
    input.checked = param.value === true;
  } else {
    input.required = param.required;
    input.value = start;
  }
  return input;
}

/** What a control was given, as its parameter's kind of value; undefined for one left empty. */
export function given(param: TableParam, control: Control): TableValue | undefined {
  if (param.control === 'checkbox') return control instanceof HTMLInputElement && control.checked;
  if (control.value === '') return undefined;
  return param.control === 'number' ? Number(control.value) : control.value;
}
