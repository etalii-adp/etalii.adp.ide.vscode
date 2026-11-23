import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawScene, type ThemeKind } from '../../../src/webview/diagram/scene';
import { diagram } from '../support';

// The dependency graph's look in both themes (etalii.adp spec 088, task T019): standalone's colours, which the
// definition states as tokens and their `modes.dark` (`index.css` of the standalone client), the arrowhead a
// filled triangle in its line's colour, and the label in the lines' colour.

const type = diagram('dependency-graph');
const scene = type.view({ fileName: 'services.dgr', text: readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8') }, {});

const paint = (element: Element | null | undefined, property: 'fill' | 'stroke' | 'color'): string | undefined =>
  new RegExp(`(?:^|; )${property}: ([^;]+)`).exec(element?.getAttribute('style') ?? '')?.[1];

const colours = (kind: ThemeKind): Record<string, string | undefined> => {
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  root.append(...drawScene(scene, kind));
  const node = root.querySelector('[data-id="checkout-web"]');
  const dependency = root.querySelector('[data-id="r-web-gateway"]');
  const marker = dependency?.querySelector('[data-marker][data-end="target"]');
  const text = node?.querySelector('[data-label]');
  return {
    fill: paint(node?.querySelector('.adp-shape'), 'fill'), border: paint(node?.querySelector('.adp-shape'), 'stroke'),
    text: paint(text?.firstElementChild, 'color') ?? paint(text, 'fill'),
    line: paint(dependency?.querySelector('.adp-line'), 'stroke'), arrowhead: `${marker?.getAttribute('data-marker')} ${paint(marker, 'fill')} ${paint(marker, 'stroke')}`,
    label: paint(dependency?.querySelector('[data-label]'), 'fill'),
  };
};

describe('the dependency graph drawn', () => {
  it('takes standalone\'s light colours in a light theme', () => {
    expect(colours('light')).toEqual({ fill: '#FFFFFF', border: '#E2E8F0', text: '#0F172A', line: '#64748B', arrowhead: 'arrowFilled #64748B #64748B', label: '#64748B' });
  });

  it('takes standalone\'s dark colours in a dark theme', () => {
    expect(colours('dark')).toEqual({ fill: '#1E293B', border: '#334155', text: '#F1F5F9', line: '#94A3B8', arrowhead: 'arrowFilled #94A3B8 #94A3B8', label: '#94A3B8' });
  });
});
