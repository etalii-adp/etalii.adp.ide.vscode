import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { plugins } from '../../../src/core/plugins/index';
import { definitionOf, diagramOf } from './support';

// What the causal loop diagram looks like where it was drawn otherwise than in the standalone host (etalii.adp spec 081, T050).
const type = diagramOf(definitionOf('causal-loop-diagram'), plugins);
const source = { fileName: 'on-call.cld', text: readFileSync('examples/causal-loop-diagram/on-call/on-call.cld', 'utf8') };
const scene = type.view(source, {});
const delayed = scene.edges.find((edge) => edge.id === 'link:fatigue|attrition')!;

describe('a causal loop diagram\'s look', () => {
  it('places a delay\'s strokes at the bowed line\'s own fractions, turned as the line is at its middle', () => {
    const [start, curve] = delayed.path;
    if (start.op !== 'M' || curve.op !== 'Q') throw new Error('a link is one quadratic curve');
    const at = (t: number): { x: number; y: number } => ({
      x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * curve.cx + t ** 2 * curve.x, y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * curve.cy + t ** 2 * curve.y,
    });
    const marks = delayed.midMarkers!;
    expect(marks.map((mark) => ({ x: mark.x, y: mark.y }))).toEqual([at(0.44), at(0.56)]);
    expect(marks[0].angle).toBeCloseTo((Math.atan2(curve.y - start.y, curve.x - start.x) * 180) / Math.PI, 9);
    expect(marks[1].angle).toBe(marks[0].angle);
  });

  it('strokes a selected link in the colour its `states.selected` states', () => {
    expect(delayed.selected).toEqual({ token: 'color.selected' });
  });
});
