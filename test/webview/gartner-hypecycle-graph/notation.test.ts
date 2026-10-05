import { describe, expect, it } from 'vitest';
import { gartnerHypecycleGraph as type } from '../../../src/core/gartner-hypecycle-graph/index';
import type { DrawContext } from '../../../src/webview/canvas/notation';
import { gartnerHypecycleGraphNotation as notation } from '../../../src/webview/gartner-hypecycle-graph/notation';
import { read } from '../../core/files';

const view = type.view({ text: read('fixtures/gartner-hypecycle-graph/triggers-and-notes.ghg') }, {});
const context: DrawContext = { view, elements: new Map(view.elements.map((element) => [element.id, element])) };
const draw = (id: string): SVGGElement => notation.element(context.elements.get(id)!, context);

describe('a trend', () => {
  it('is a banner of one polygon per visible phase, in the phase colours, with a chevron between each two', () => {
    const four = draw('transistors');
    expect([...four.querySelectorAll('.ghg-phase')].map((phase) => phase.getAttribute('class'))).toEqual([
      'ghg-phase ghg-peak', 'ghg-phase ghg-trough', 'ghg-phase ghg-slope', 'ghg-phase ghg-plateau',
    ]);
    expect(four.querySelectorAll('.ghg-chevron')).toHaveLength(3);
    const three = draw('radio');
    expect(three.querySelectorAll('.ghg-phase')).toHaveLength(3);
    expect(three.querySelectorAll('.ghg-chevron')).toHaveLength(2);
  });

  it('names each phase in full as its tooltip, and carries its id', () => {
    const banner = draw('transistors');
    expect(banner.getAttribute('data-id')).toBe('transistors');
    expect([...banner.querySelectorAll('.ghg-phase title')].map((title) => title.textContent)).toEqual([
      'Peak of Inflated Expectations', 'Trough of Disillusionment', 'Slope of Enlightenment', 'Plateau of Productivity',
    ]);
  });

  it('ends in a point at its full width, and writes its name before it', () => {
    const banner = draw('transistors');
    expect(banner.querySelector('.adp-outline')?.getAttribute('points')).toBe('200,56 344,56 360,72 344,88 200,88');
    const label = banner.querySelector('.adp-label')!;
    expect(label.textContent).toBe('Transistors');
    expect(label.getAttribute('x')).toBe('192');
    expect(label.getAttribute('text-anchor')).toBe('end');
  });
});

describe('a trigger', () => {
  it('is a circle half a trend high with its name and date before it', () => {
    const trigger = draw('transistor-invented');
    expect(trigger.querySelector('circle')?.getAttribute('r')).toBe('8');
    expect(trigger.querySelector('.adp-label')?.textContent).toBe('Transistor invented · 1947');
    expect(trigger.querySelector('title')?.textContent).toBe('Trigger: Transistor invented, 1947');
  });
});

describe('a note', () => {
  it('is a box with its text, line breaks kept', () => {
    const note = draw('note-1');
    expect(note.querySelector('rect')?.getAttribute('width')).toBe('160');
    expect(note.querySelector('.ghg-note-text')?.textContent).toBe('Dates are illustrative.\n\nSee the readme.');
  });
});

describe('an influence', () => {
  it('leaves a phase and arrives at one perpendicular to their edges, with an arrow at its target', () => {
    const influence = notation.relation(view.relations[1], context)!;
    const path = influence.querySelector('.adp-relation-line')!;
    expect(path.getAttribute('marker-end')).toBe('url(#adp-arrow)');
    // From the middle of the Slope's stretch of the bottom edge, straight down first.
    const d = path.getAttribute('d')!;
    const [start, control] = /^M (\S+) (\S+) C (\S+) (\S+),/.exec(d)!.slice(1).reduce<number[][]>((pairs, value, index) => {
      if (index % 2 === 0) pairs.push([Number(value)]);
      else pairs[pairs.length - 1].push(Number(value));
      return pairs;
    }, []);
    expect(start).toEqual([284, 88]);
    expect(control[0]).toBe(284);
    expect(control[1]).toBeGreaterThan(88);
  });

  it('leaves a trigger from the side facing its target', () => {
    const d = notation.relation(view.relations[0], context)!.querySelector('.adp-relation-line')!.getAttribute('d')!;
    const start = /^M (\S+) (\S+) /.exec(d)!.slice(1).map(Number);
    const trigger = context.elements.get('transistor-invented')!;
    // The target's attachment is above and just to the right, so of top, right and bottom the top is nearest.
    expect(start[0]).toBeCloseTo(trigger.x + 8, 9);
    expect(start[1]).toBeCloseTo(trigger.y, 9);
  });

  it('is not drawn when a phase it attaches to is hidden, or an end is not on the canvas', () => {
    const hidden = type.view({ text: read('fixtures/gartner-hypecycle-graph/rule-duplicate-hidden.ghg') }, {});
    const hiddenContext: DrawContext = { view: hidden, elements: new Map(hidden.elements.map((element) => [element.id, element])) };
    expect(notation.relation(hidden.relations[0], hiddenContext)).toBeUndefined();
    expect(notation.relation(hidden.relations[1], hiddenContext)).toBeDefined();
    expect(notation.relation(view.relations[1], { view, elements: new Map() })).toBeUndefined();
  });
});