import { describe, expect, it } from 'vitest';
import { halton, separate, widthOf } from '../../../src/core/plugins/cld-layout/index';

// The parts of the standalone module's self-organizing layout, held to the module's own tests
// (`SelfOrganizingLayout.Tests`, `OverlapResolver.Tests`); the arrangement as a whole is held to
// standalone's transcript in test/core/tool/causalLoopDiagram.test.ts.
describe('the causal loop diagram\'s self-organizing layout', () => {
  it('draws its stimuli from the radical-inverse sequence', () => {
    expect([1, 2, 3, 4].map((index) => halton(index, 2))).toEqual([0.5, 0.25, 0.75, 0.125]);
    expect([1, 2, 3].map((index) => halton(index, 3))).toEqual([1 / 3, 2 / 3, 1 / 9]);
  });

  it('measures a variable as the module does, never narrower than its minimum', () => {
    expect(widthOf('A')).toBe(90);
    expect(widthOf('Tired hands make more work')).toBeCloseTo(26 * 14 * 0.55 + 28, 9);
  });

  it('leaves boxes that are clear where they are, and pushes a pair apart along the axis that needs least', () => {
    const clear: [number, number][] = [[0, 0], [200, 0]];
    expect(separate(clear, [90, 90], 10)).toBe(0);
    expect(clear).toEqual([[0, 0], [200, 0]]);
    const close: [number, number][] = [[0, 0], [100, 0]];
    expect(separate(close, [90, 90], 10)).toBe(0);
    expect(close).toEqual([[-15.5, 0], [115.5, 0]]);
  });

  it('reports the pairs still overlapping when its rounds run out', () => {
    expect(separate([[0, 0], [0, 0], [0, 0]], [90, 90, 90], 1)).toBeGreaterThan(0);
  });
});
