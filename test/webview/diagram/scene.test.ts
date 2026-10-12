import { beforeEach, describe, expect, it } from 'vitest';
import { tokensOf } from '../../../src/core/disl/notation';
import { pathData, pointOn } from '../../../src/core/scene/geometry';
import { createScene, type Scene, type SceneEdge, type SceneNode, type SceneToken } from '../../../src/core/scene/scene';
import { drawHandles, drawScene, themeKind, type ThemeKind } from '../../../src/webview/diagram/scene';
import { canvasTool } from '../../core/scene/tool';

// The scene renderer in a simulated browser (etalii.adp spec 027, research R3 and R13). The scene
// is a real one: the hype cycle graph's definition over a fixture, computed as the tool type
// computes it, with the members a tool type adds set by hand.

const made = canvasTool();
const theme = made.notation.theme;
const tokens: Record<string, SceneToken> = Object.fromEntries(Object.keys(theme.tokens).map((name) => [name, {
  light: tokensOf(theme, 'light')[name] as string, dark: tokensOf(theme, 'dark')[name] as string,
}]));
const scene: Scene = {
  ...createScene(made.sceneTool, made.fixture('triggers-and-notes').value),
  readOnly: false, tokens, chrome: { rulers: [], filters: [], toggles: [], legend: [] },
};

// The editor's own colour for each role, and what both high contrast kinds draw with.
const editorBackground = 'var(--vscode-editor-background)';
const editorForeground = 'var(--vscode-editor-foreground)';
const contrastBorder = 'var(--vscode-contrastBorder)';
const contrastForeground = 'var(--vscode-foreground)';

const kinds: readonly ThemeKind[] = ['light', 'high-contrast-light', 'dark', 'high-contrast'];
const node = (id: string): SceneNode => scene.nodes.find((candidate) => candidate.id === id)!;
const edge = (id: string): SceneEdge => scene.edges.find((candidate) => candidate.id === id)!;
const withNode = (changed: SceneNode): Scene => ({ ...scene, nodes: scene.nodes.map((other) => (other.id === changed.id ? changed : other)) });
const withEdge = (changed: SceneEdge): Scene => ({ ...scene, edges: scene.edges.map((other) => (other.id === changed.id ? changed : other)) });

/** A scene drawn into an SVG, as the canvas puts it into its content group. */
function drawn(of: Scene = scene, kind: ThemeKind = 'light'): SVGSVGElement {
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  root.append(...drawScene(of, kind));
  return root;
}
const group = (root: Element, id: string): Element => root.querySelector(`[data-id="${id}"]`)!;
const attributes = (element: Element | null | undefined, ...names: string[]): (string | null)[] => names.map((name) => element?.getAttribute(name) ?? null);
// A colour may be a CSS variable, which an SVG attribute does not resolve, so every colour is in `style`.
const paint = (element: Element | null | undefined, property: 'fill' | 'stroke' | 'color'): string | undefined =>
  new RegExp(`(?:^|; )${property}: ([^;]+)`).exec(element?.getAttribute('style') ?? '')?.[1];
const paints = (element: Element | null | undefined): (string | undefined)[] => [paint(element, 'fill'), paint(element, 'stroke')];
/** The text of a label drawn inside its node, which is HTML in the SVG. */
const textIn = (root: Element, id: string): Element => group(root, id).querySelector('[data-label]')!.firstElementChild!;

describe('the theme kind', () => {
  beforeEach(() => document.body.removeAttribute('class'));

  it('is read from the class Visual Studio Code puts on the body', () => {
    const of = (classes: string): ThemeKind => {
      document.body.className = classes;
      return themeKind();
    };
    expect(of('vscode-light')).toBe('light');
    expect(of('vscode-dark')).toBe('dark');
    expect(of('vscode-high-contrast')).toBe('high-contrast');
    // High contrast light carries the class of high contrast as well.
    expect(of('vscode-high-contrast vscode-high-contrast-light')).toBe('high-contrast-light');
    expect(of('')).toBe('light');
  });
});

describe('a scene', () => {
  it('is one group for each drawn edge and each node, the edges beneath the nodes', () => {
    const groups = drawScene(scene, 'light');
    expect(groups.map((one) => one.getAttribute('data-id'))).toEqual(['i-12', 'i-13', 'transistors', 'radio', 'transistor-invented', 'note-1', 'note-2']);
    expect(groups.map((one) => one.getAttribute('class'))).toEqual(['adp-relation', 'adp-relation', 'adp-element', 'adp-element', 'adp-element', 'adp-element', 'adp-element']);
    expect(groups.map((one) => one.getAttribute('data-type'))).toEqual(['Influence', 'Influence', 'Trend', 'Trend', 'Trigger', 'Note', 'Note']);
  });

  it('marks a node a filter dims', () => {
    const root = drawn(withNode({ ...node('radio'), dimmed: true }));
    expect(group(root, 'radio').classList.contains('adp-dimmed')).toBe(true);
    expect(group(root, 'transistors').classList.contains('adp-dimmed')).toBe(false);
  });
});

describe('a shape', () => {
  it('is an ellipse or a rectangle in its box', () => {
    const root = drawn();
    const { box } = node('transistor-invented');
    const ellipse = group(root, 'transistor-invented').querySelector('.adp-shape')!;
    expect(ellipse.tagName).toBe('ellipse');
    expect(attributes(ellipse, 'cx', 'cy', 'rx', 'ry').map(Number)).toEqual([box.x + 8, 72, 8, 8]);
    const rect = group(root, 'note-2').querySelector('.adp-shape')!;
    expect(rect.tagName).toBe('rect');
    expect(attributes(rect, 'x', 'y', 'width', 'height', 'rx')).toEqual(['240', '280', '120', '40', null]);
  });

  it('rounds a pill by half its smaller side', () => {
    const pill: SceneNode = { ...node('note-2'), shape: { kind: 'rect', name: 'pill', box: node('note-2').box } };
    expect(group(drawn(withNode(pill)), 'note-2').querySelector('.adp-shape')?.getAttribute('rx')).toBe('20');
  });

  it('is nothing of its own for a composite shape, which is its parts in order, the undermost first', () => {
    const banner = group(drawn(), 'transistors');
    const shapes = [...banner.querySelectorAll('.adp-shape')];
    expect(shapes.map((shape) => shape.getAttribute('data-part'))).toEqual(node('transistors').parts.map((part) => part.id));
    expect(shapes.map((shape) => shape.getAttribute('data-part'))).toEqual([
      'peakFill', 'troughFill', 'slopeFill', 'plateauFill', 'chevron1', 'chevron2', 'chevron3', 'peak', 'trough', 'slope', 'plateau',
    ]);
    expect(shapes.map((shape) => shape.tagName)).toEqual(['path', 'path', 'path', 'path', 'path', 'path', 'path', 'rect', 'rect', 'rect', 'rect']);
    const [first] = node('transistors').parts;
    expect(shapes[0].getAttribute('d')).toBe(pathData(first.shape.kind === 'path' ? first.shape.commands : []));
    expect(attributes(banner.querySelector('[data-part="trough"]'), 'x', 'y', 'width', 'height')).toEqual(['224', '56', '40', '32']);
  });

  it('paints a part with its own fill and line, and draws no line of no width', () => {
    const banner = group(drawn(), 'transistors');
    expect(paints(banner.querySelector('[data-part="peakFill"]'))).toEqual(['#f7e7a1', 'none']);
    expect(paints(banner.querySelector('[data-part="chevron1"]'))).toEqual(['none', '#475569']);
    expect(banner.querySelector('[data-part="chevron1"]')?.getAttribute('stroke-width')).toBe('1.5');
    expect(paints(banner.querySelector('[data-part="peak"]'))).toEqual(['none', 'none']);
  });

  it('lets the pointer reach a part that is hit, and pass through one that is not', () => {
    const banner = group(drawn(), 'transistors');
    for (const part of node('transistors').parts) {
      expect([part.id, banner.querySelector(`[data-part="${part.id}"]`)?.getAttribute('pointer-events')]).toEqual([part.id, part.hit ? 'all' : 'none']);
    }
    // What is pointed at says which node and which part of it.
    const hit = banner.querySelector('[data-part="slopeFill"]')!;
    expect(hit.closest('[data-id]')?.getAttribute('data-id')).toBe('transistors');
  });

  it('carries the tooltip of its node and of its part', () => {
    const root = drawn();
    expect(group(root, 'transistor-invented').querySelector(':scope > title')?.textContent).toBe('Trigger: Transistor invented, 1947');
    expect(group(root, 'transistors').querySelector('[data-part="troughFill"] > title')?.textContent).toBe('Trough of Disillusionment');
  });
});

describe('a label', () => {
  it('outside its node is text held at the end of its box that the alignment names, in its font size', () => {
    const label = group(drawn(), 'transistors').querySelector('[data-label="name"]')!;
    const { box } = node('transistors').labels[0];
    expect(label.tagName).toBe('text');
    expect(label.textContent).toBe('Transistors');
    expect(attributes(label, 'text-anchor', 'font-size')).toEqual(['end', '14']);
    const line = label.querySelector('tspan')!;
    expect(Number(line.getAttribute('x'))).toBeCloseTo(box.x + box.width, 6);
    expect(Number(line.getAttribute('y'))).toBeCloseTo(box.y + box.height / 2, 6);
  });

  it('holds its text at the start or the middle of its box as well', () => {
    const [name] = node('transistors').labels;
    const anchored = (align: 'start' | 'center'): (string | null)[] => {
      const label = group(drawn(withNode({ ...node('transistors'), labels: [{ ...name, align }] })), 'transistors').querySelector('[data-label="name"]')!;
      return [label.getAttribute('text-anchor'), label.querySelector('tspan')!.getAttribute('x')];
    };
    expect(anchored('start')).toEqual(['start', String(name.box.x)]);
    expect(anchored('center')).toEqual(['middle', String(name.box.x + name.box.width / 2)]);
  });

  it('inside its node is laid out in its box, with its line breaks, its alignment and its font size', () => {
    const root = drawn();
    const area = group(root, 'note-1').querySelector('[data-label="text"]')!;
    expect(area.tagName).toBe('foreignObject');
    expect(attributes(area, 'x', 'y', 'width', 'height')).toEqual(['206', '174', '148', '52']);
    const text = textIn(root, 'note-1');
    expect(text.textContent).toBe('Dates are illustrative.\n\nSee the readme.');
    expect(text.getAttribute('style')).toContain('text-align: center');
    expect(text.getAttribute('style')).toContain('font-size: 12px');
  });
});

describe('an edge', () => {
  it('is its line, from the part its source end is on to the part its target end is on', () => {
    const line = group(drawn(), 'i-13').querySelector('.adp-line')!;
    expect(line.tagName).toBe('path');
    expect(line.getAttribute('d')).toBe(pathData(edge('i-13').path));
    expect([line.getAttribute('fill'), paint(line, 'stroke'), line.getAttribute('stroke-width')]).toEqual(['none', '#64748b', '1.5']);
    // Halfway along the bottom of the one part, a tenth along the top of the other.
    const from = pointOn(node('transistors').parts.find((part) => part.id === 'slope')!.box, 'bottom', 0.5);
    const to = pointOn(node('radio').parts.find((part) => part.id === 'peak')!.box, 'top', 0.1);
    expect(line.getAttribute('d')?.startsWith(`M ${from.x} ${from.y} `)).toBe(true);
    expect(line.getAttribute('d')?.endsWith(` ${to.x} ${to.y}`)).toBe(true);
  });

  it('has a wide line under it that the pointer reaches', () => {
    const hit = group(drawn(), 'i-13').querySelector('.adp-relation-hit')!;
    expect(hit.getAttribute('d')).toBe(pathData(edge('i-13').path));
  });

  it('has the marker of its target at the end of its line, filled in the colour of the line when its name says so', () => {
    const markers = [...group(drawn(), 'i-13').querySelectorAll('[data-marker]')];
    expect(markers.map((marker) => [...attributes(marker, 'data-marker', 'data-end'), ...paints(marker)])).toEqual([['arrowFilled', 'target', '#64748b', '#64748b']]);
    const { to } = edge('i-13');
    expect(markers[0].getAttribute('points')?.startsWith(`${to!.x},${to!.y} `)).toBe(true);
  });

  it('has the marker of its source at the start of its line, open when its name says no more', () => {
    const markers = [...group(drawn(withEdge({ ...edge('i-13'), sourceMarker: 'arrow', targetMarker: 'none' })), 'i-13').querySelectorAll('[data-marker]')];
    expect(markers.map((marker) => [...attributes(marker, 'data-marker', 'data-end'), ...paints(marker)])).toEqual([['arrow', 'source', 'none', '#64748b']]);
    const { from } = edge('i-13');
    expect(markers[0].getAttribute('points')).toContain(`${from!.x},${from!.y}`);
  });

  it('is not drawn when the scene hides it', () => {
    const groups = drawScene(withEdge({ ...edge('i-13'), hidden: 'part', from: undefined, to: undefined, curve: undefined, path: [] }), 'light');
    expect(groups.map((one) => one.getAttribute('data-id'))).toEqual(['i-12', 'transistors', 'radio', 'transistor-invented', 'note-1', 'note-2']);
  });
});

describe('the handles of a node', () => {
  it('are one for each visible handle, at its place, named by its index among all of them', () => {
    const handles = drawHandles(node('transistors'), 1);
    expect(handles.map((handle) => [handle.tagName, handle.getAttribute('class')])).toEqual([['circle', 'adp-handle'], ['circle', 'adp-handle'], ['circle', 'adp-handle']]);
    expect(handles.map((handle) => attributes(handle, 'data-handle', 'cx', 'cy', 'r'))).toEqual([['0', '240', '72', '4'], ['1', '280', '72', '4'], ['2', '320', '72', '4']]);
    // The radio draws three phases, so its last boundary has no handle.
    expect(drawHandles(node('radio'), 1).map((handle) => handle.getAttribute('data-handle'))).toEqual(['0', '1']);
    const [first, ...others] = node('transistors').handles;
    expect(drawHandles({ ...node('transistors'), handles: [{ ...first, visible: false }, ...others] }, 1).map((handle) => handle.getAttribute('data-handle'))).toEqual(['1', '2']);
  });

  it('keep their size on the screen at any zoom', () => {
    expect(drawHandles(node('transistors'), 2)[0].getAttribute('r')).toBe('2');
  });

  it('are none for a node without one', () => expect(drawHandles(node('note-1'), 1)).toEqual([]));
});

describe('the colours (research R13)', () => {
  // What each role is drawn in: the fill, the outline and the text of a note, and an edge's line.
  const colours = (of: Scene, kind: ThemeKind): Record<string, string | undefined> => {
    const root = drawn(of, kind);
    const note = group(root, 'note-1').querySelector('.adp-shape');
    const line = group(root, 'i-13').querySelector('.adp-line');
    const marker = group(root, 'i-13').querySelector('[data-marker]');
    return {
      fill: paint(note, 'fill'), outline: paint(note, 'stroke'), text: paint(textIn(root, 'note-1'), 'color'),
      line: paint(line, 'stroke'), marker: paint(marker, 'stroke'), markerFill: paint(marker, 'fill'),
    };
  };

  it('are a token\'s `light` value in a light theme and its `dark` value in a dark one', () => {
    expect(colours(scene, 'light')).toEqual({ fill: '#fef9c3', outline: '#e2e8f0', text: '#0f172a', line: '#64748b', marker: '#64748b', markerFill: '#64748b' });
    expect(colours(scene, 'dark')).toEqual({ fill: '#423a10', outline: '#334155', text: '#f1f5f9', line: '#94a3b8', marker: '#94a3b8', markerFill: '#94a3b8' });
  });

  it('keep a token\'s fill in high contrast, light and dark each, with every outline in the contrast border and every text in the foreground', () => {
    const contrast = { outline: contrastBorder, text: contrastForeground, line: contrastBorder, marker: contrastBorder, markerFill: contrastBorder };
    expect(colours(scene, 'high-contrast-light')).toEqual({ fill: '#fef9c3', ...contrast });
    expect(colours(scene, 'high-contrast')).toEqual({ fill: '#423a10', ...contrast });
  });

  it('draw a text that states no colour in the editor\'s, and in the foreground in high contrast', () => {
    const fill = (kind: ThemeKind): string | undefined => paint(group(drawn(scene, kind), 'transistors').querySelector('[data-label="name"]'), 'fill');
    expect(kinds.map(fill)).toEqual([editorForeground, contrastForeground, editorForeground, contrastForeground]);
  });

  it('outline in high contrast what is told apart by its fill alone, and still draw nothing for what has neither', () => {
    for (const kind of kinds) {
      const banner = group(drawn(scene, kind), 'transistors');
      const high = kind.startsWith('high-contrast');
      expect([kind, paint(banner.querySelector('[data-part="peakFill"]'), 'stroke')]).toEqual([kind, high ? contrastBorder : 'none']);
      expect([kind, paint(banner.querySelector('[data-part="chevron1"]'), 'stroke')]).toEqual([kind, high ? contrastBorder : kind === 'dark' ? '#e2e8f0' : '#475569']);
      expect([kind, ...paints(banner.querySelector('[data-part="peak"]'))]).toEqual([kind, 'none', 'none']);
    }
  });

  it('are the editor\'s own for a token without a value in the mode in use: its background for a fill, its foreground for a line and a text', () => {
    const lightOnly = { ...scene, tokens: Object.fromEntries(Object.entries(tokens).map(([name, token]) => [name, { light: token.light }])) };
    expect(colours(lightOnly, 'light')).toEqual(colours(scene, 'light'));
    const editor = { fill: editorBackground, outline: editorForeground, text: editorForeground, line: editorForeground, marker: editorForeground, markerFill: editorForeground };
    expect(colours(lightOnly, 'dark')).toEqual(editor);
    // High contrast reads `dark`, and high contrast light reads `light`.
    expect(colours(lightOnly, 'high-contrast').fill).toBe(editorBackground);
    expect(colours(lightOnly, 'high-contrast-light').fill).toBe('#fef9c3');
    const darkOnly = { ...scene, tokens: Object.fromEntries(Object.entries(tokens).map(([name, token]) => [name, { dark: token.dark }])) };
    expect(colours(darkOnly, 'light')).toEqual(editor);
    expect(colours(darkOnly, 'dark')).toEqual(colours(scene, 'dark'));
  });

  it('are the editor\'s own for a token the scene does not hold', () => {
    expect(colours({ ...scene, tokens: {} }, 'light')).toEqual({
      fill: editorBackground, outline: editorForeground, text: editorForeground, line: editorForeground, marker: editorForeground, markerFill: editorForeground,
    });
  });
});
