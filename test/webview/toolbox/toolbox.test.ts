import { beforeEach, describe, expect, it } from 'vitest';
import { Toolbox, toolboxMime } from '../../../src/webview/toolbox/toolbox';
import { read } from '../../core/files';
import { diagram } from '../support';

// The ADP Toolbox view, in a simulated browser, with the entries the tool types read from their definitions give.

const graph = diagram('gartner-hype-cycle-graph').toolbox({ fileName: 'rules-clean.ghg', text: read('fixtures/gartner-hypecycle-graph/rules-clean.ghg') });
const model = diagram('agent-behavior-modelling').toolbox({ fileName: 'bug-fixer.md', text: read('examples/agent-behavior-modelling/bug-fixer/bug-fixer.md') });

let added: string[];
let toolbox: Toolbox;

beforeEach(() => {
  document.body.replaceChildren();
  added = [];
  toolbox = new Toolbox(document.body, (entry) => added.push(entry));
});

const entries = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.adp-toolbox-entry')];

describe('the ADP Toolbox view', () => {
  it('lists the active diagram type\'s entries with their descriptions, and adds the one activated', () => {
    toolbox.show(graph, undefined);
    expect(entries().map((entry) => entry.textContent)).toEqual(['Trend', 'Trigger', 'Note']);
    expect(entries()[0].getAttribute('title')).toBe('A trend through the hype cycle. Drop it where it starts; it is a year long with all four phases.');
    expect(entries()[0].getAttribute('draggable')).toBe('true');
    entries()[2].click();
    expect(added).toEqual(['ghg.add.note']);
  });

  it('draws each entry with its own icon, for every diagram type', () => {
    toolbox.show(model, undefined);
    expect(entries()).toHaveLength(11);
    // An icon the set does not have is drawn as the same generic shape; every kind has its own.
    const icons = new Set(entries().map((entry) => entry.querySelector('path')?.getAttribute('d')));
    expect(icons.size).toBe(11);
  });

  it('carries the entry in a drag, so the canvas knows the drop is one of its own', () => {
    toolbox.show(graph, undefined);
    const data = new Map<string, string>();
    const start = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.assign(start, { dataTransfer: { setData: (kind: string, value: string) => data.set(kind, value), effectAllowed: '' } });
    entries()[0].dispatchEvent(start);
    expect(data.get(toolboxMime)).toBe('ghg.add.trend');
  });

  it('says why there is nothing to add when no diagram is active', () => {
    toolbox.show(graph, undefined);
    toolbox.show([], 'Open a diagram to see what can be added to it.');
    expect(entries()).toHaveLength(0);
    const empty = document.querySelector<HTMLElement>('.adp-toolbox-empty')!;
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('Open a diagram to see what can be added to it.');
  });
});
