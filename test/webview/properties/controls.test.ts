import { describe, expect, it } from 'vitest';
import { gridOf } from '../../../src/webview/properties/controls';
import { read } from '../../core/files';
import { diagram } from '../support';

const type = diagram('gartner-hype-cycle-graph');
const source = { fileName: 'triggers-and-notes.ghg', text: read('fixtures/gartner-hypecycle-graph/triggers-and-notes.ghg') };

function grid(id: string): { root: HTMLElement; commits: [string, string][] } {
  const commits: [string, string][] = [];
  const root = document.createElement('div');
  root.append(...gridOf(type.fields(source, [id]), undefined, (field, value) => commits.push([field, value])));
  return { root, commits };
}

describe('ADP Properties', () => {
  it('groups the rows of a selection, each with a label and its control', () => {
    const { root } = grid('transistors');
    expect([...root.querySelectorAll('legend')].map((legend) => legend.textContent)).toEqual(['Identity', 'Time', 'Phases', 'Peak', 'Trough', 'Slope', 'Plateau']);
    expect(root.querySelector('label[for="ghg.name"]')?.textContent).toBe('Name');
    expect((root.querySelector('[id="ghg.name"]') as HTMLInputElement).value).toBe('Transistors');
    expect(root.querySelector('[id="ghg.description"]')?.tagName).toBe('TEXTAREA');
  });

  it('shows Phases as a slider over its four stops with the stop it is on named beneath it', () => {
    const { root, commits } = grid('transistors');
    const slider = root.querySelector('[id="ghg.phases"]') as HTMLInputElement;
    expect([slider.type, slider.min, slider.max, slider.value]).toEqual(['range', '0', '3', '3']);
    expect(root.querySelector('.adp-slider-caption')?.textContent).toBe('All four');
    slider.value = '1';
    slider.dispatchEvent(new Event('input'));
    expect(root.querySelector('.adp-slider-caption')?.textContent).toBe('Peak and Trough');
    expect(commits).toEqual([['ghg.phases', 'Peak and Trough']]);
  });

  it('offers the tags in use to a tags field, and commits what is typed', () => {
    const { root, commits } = grid('transistor-invented');
    const input = root.querySelector('[id="ghg.tags"]') as HTMLInputElement;
    expect(input.value).toBe('electronics, invention');
    expect([...root.querySelectorAll('datalist option')].map((option) => option.getAttribute('value'))).toEqual(['electronics', 'invention']);
    input.value = 'electronics, physics';
    input.dispatchEvent(new Event('change'));
    expect(commits).toEqual([['ghg.tags', 'electronics, physics']]);
  });

  it('shows a row that is not edited as read-only, with why as its tooltip', () => {
    const { root } = grid('i-13');
    const from = root.querySelector('[id="ghg.from"]') as HTMLInputElement;
    expect(from.readOnly).toBe(true);
    expect(from.title).toBe('Where it is attached; drag the end on the canvas to move it.');
    expect((root.querySelector('[id="ghg.to-attachment"]') as HTMLInputElement).readOnly).toBe(false);
  });

  it('says why there is nothing to show', () => {
    const [line] = gridOf([], 'Select an element or a relation in the diagram to see its properties.', () => undefined);
    expect(line.textContent).toBe('Select an element or a relation in the diagram to see its properties.');
  });

  it('shows a switch as a toggle that commits true or false', () => {
    const loops = diagram('causal-loop-diagram');
    const cld = { fileName: 'on-call.cld', text: read('examples/causal-loop-diagram/on-call/on-call.cld') };
    const commits: [string, string][] = [];
    const root = document.createElement('div');
    root.append(...gridOf(loops.fields(cld, ['link:fatigue|attrition']), undefined, (field, value) => commits.push([field, value])));
    const toggle = root.querySelector('[id="causal-loop.link-delayed"]') as HTMLInputElement;
    expect([toggle.tagName, toggle.type, toggle.getAttribute('role'), toggle.checked]).toEqual(['INPUT', 'checkbox', 'switch', true]);
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(commits).toEqual([['causal-loop.link-delayed', 'false']]);
  });

  it('shows a number as the text it is written in, and selects it on entering, so typing replaces it', () => {
    // Found by the host test (spec 090, T029): a number box showed 0.98 as 0,98 in a Dutch region,
    // and a click put the caret in it, so what was typed was added to the old value.
    const commits: [string, string][] = [];
    const root = document.createElement('div');
    root.append(...gridOf([{ id: 'target', label: 'Target', group: '', control: 'number', value: '0.98' }], undefined, (field, value) => commits.push([field, value])));
    const input = root.querySelector('[id="target"]') as HTMLInputElement;
    expect([input.type, input.inputMode, input.value]).toEqual(['text', 'decimal', '0.98']);
    document.body.append(root);
    input.dispatchEvent(new FocusEvent('focus'));
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4]);
    root.remove();
  });

  it('shows the form a value is written in where its type has one', () => {
    const root = document.createElement('div');
    root.append(...gridOf([{ id: 'wait', label: 'Wait time', group: '', control: 'text', value: '', placeholder: 'PT15M, PT2H or P1D' }], undefined, () => undefined));
    expect((root.querySelector('[id="wait"]') as HTMLInputElement).placeholder).toBe('PT15M, PT2H or P1D');
  });
});
