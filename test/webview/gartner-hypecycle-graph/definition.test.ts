import { describe, expect, it } from 'vitest';
import type { Scene } from '../../../src/core/scene/scene';
import { drawScene } from '../../../src/webview/diagram/scene';
import { read } from '../../core/files';
import { diagram } from '../support';

// The hype cycle graph on the canvas, in a simulated browser (etalii.adp spec 027, task T124):
// what spec 006 tested of its hand-written notation, named through the tool type its definition
// gives. The scene is the tool type's, drawn as the canvas draws any scene.

const type = diagram('gartner-hype-cycle-graph');
const sceneOf = (fixture: string): Scene => type.view({ fileName: `${fixture}.ghg`, text: read(`fixtures/gartner-hypecycle-graph/${fixture}.ghg`) }, {});
const scene = sceneOf('triggers-and-notes');
const drawn = drawScene(scene, 'light');
const draw = (id: string, from: readonly SVGGElement[] = drawn): SVGGElement | undefined => from.find((candidate) => candidate.getAttribute('data-id') === id);
const fillOf = (element: Element): string => /fill: ([^;]+)/.exec(element.getAttribute('style') ?? '')?.[1] ?? '';
const token = (name: string): string => String(scene.tokens![name].light);

describe('a trend', () => {
  it('is a banner of one filled part per visible phase, in the phase colours', () => {
    const four = draw('transistors')!;
    const fills = (banner: Element): string[] => ['peak', 'trough', 'slope', 'plateau'].flatMap((phase) => {
      const part = banner.querySelector(`[data-part="${phase}Fill"]`);
      return part ? [fillOf(part)] : [];
    });
    expect(fills(four)).toEqual(['ghg.peak', 'ghg.trough', 'ghg.slope', 'ghg.plateau'].map(token));
    expect(fills(draw('radio')!)).toEqual(['ghg.peak', 'ghg.trough', 'ghg.slope'].map(token));
  });

  it('names each phase in full as its tooltip, and carries its id', () => {
    const banner = draw('transistors')!;
    expect(banner.getAttribute('data-id')).toBe('transistors');
    expect([...banner.querySelectorAll('[data-part] title')].map((title) => title.textContent)).toEqual([
      'Peak of Inflated Expectations', 'Trough of Disillusionment', 'Slope of Enlightenment', 'Plateau of Productivity',
    ]);
  });

  it('ends in a point at its full width, and writes its name before it', () => {
    const banner = draw('transistors')!;
    // The trend runs to its full width, where it comes to a point at half its height.
    expect(scene.nodes.find((candidate) => candidate.id === 'transistors')!.box).toEqual({ x: 200, y: 56, width: 160, height: 32 });
    const node = scene.nodes.find((candidate) => candidate.id === 'transistors')!;
    expect(node.outline.kind === 'polygon' && node.outline.points.some((point) => Math.abs(point.x - 360) < 1e-6 && Math.abs(point.y - 72) < 1e-6)).toBe(true);
    const label = banner.querySelector('.adp-scene-label')!;
    expect(label.textContent).toBe('Transistors');
    expect(label.getAttribute('text-anchor')).toBe('end');
    expect(Number(label.querySelector('tspan')!.getAttribute('x'))).toBeLessThan(200);
  });
});

describe('a trigger', () => {
  it('is a circle half a trend high with its name and date before it', () => {
    const trigger = draw('transistor-invented')!;
    expect(trigger.querySelector('ellipse.adp-shape')?.getAttribute('rx')).toBe('8');
    expect(trigger.querySelector('.adp-scene-label')?.textContent).toBe('Transistor invented · 1947');
  });
});

describe('a note', () => {
  it('is a box with its text, line breaks kept', () => {
    const note = draw('note-1')!;
    expect(note.querySelector('rect.adp-shape')?.getAttribute('width')).toBe('160');
    expect(note.querySelector('.adp-scene-text')?.textContent).toBe('Dates are illustrative.\n\nSee the readme.');
  });
});

describe('an influence', () => {
  it('leaves a phase and arrives at one at right angles to their edges, with an arrow at its target', () => {
    const influence = draw('i-13')!;
    const path = influence.querySelector('.adp-line')!;
    expect(influence.querySelector('[data-marker]')?.getAttribute('data-end')).toBe('target');
    // From the middle of the stretch the Slope has of the bottom edge, straight down first.
    const numbers = path.getAttribute('d')!.match(/-?[\d.]+/g)!.map(Number);
    expect(numbers.slice(0, 2)).toEqual([284, 88]);
    expect(numbers[2]).toBe(284);
    expect(numbers[3]).toBeGreaterThan(88);
  });

  it('is not drawn when a phase it attaches to is hidden', () => {
    const hidden = sceneOf('rule-duplicate-hidden');
    const groups = drawScene(hidden, 'light');
    expect(hidden.edges.map((edge) => edge.hidden)).toEqual(['part', undefined]);
    expect(draw(hidden.edges[0].id, groups)).toBeUndefined();
    expect(draw(hidden.edges[1].id, groups)).toBeDefined();
  });
});
