import { describe, expect, it } from 'vitest';
import { boundariesOfSpan, moved, rescaled, withBoundary } from '../../../src/core/gartner-hypecycle-graph/phases';

const none = [undefined, undefined, undefined];

describe('phase boundaries', () => {
  it('are spread evenly when none is stored', () => {
    expect(boundariesOfSpan(0, 120, 4, none)).toEqual([30, 60, 90]);
    expect(boundariesOfSpan(0, 120, 3, none)).toEqual([40, 80]);
    expect(boundariesOfSpan(0, 120, 1, none)).toEqual([]);
  });

  it('snap to a month, a half rounding away from zero', () => {
    expect(boundariesOfSpan(0, 10, 4, none)).toEqual([3, 5, 8]);
    expect(boundariesOfSpan(-10, 0, 4, none)).toEqual([-8, -5, -3]);
  });

  it('keep a stored boundary and spread the others between it and the ends', () => {
    expect(boundariesOfSpan(0, 120, 4, [20, undefined, undefined])).toEqual([20, 53, 87]);
    expect(boundariesOfSpan(0, 120, 4, [undefined, 100, undefined])).toEqual([50, 100, 110]);
  });

  it('neither draw nor spread around a stored boundary beyond the last visible phase', () => {
    expect(boundariesOfSpan(0, 120, 2, [undefined, 100, undefined])).toEqual([60]);
  });

  it('clamp a stored boundary outside the span for drawing only', () => {
    expect(boundariesOfSpan(0, 120, 2, [500, undefined, undefined])).toEqual([120]);
  });
});

describe('stored boundaries when a trend changes', () => {
  it('shift exactly with a move', () => {
    expect(moved([10, undefined, 30], 5)).toEqual([15, undefined, 35]);
  });

  it('scale with a resize, rounded to a month', () => {
    expect(rescaled([30, undefined, undefined], 0, 120, 0, 60, 4)).toEqual([15, undefined, undefined]);
    expect(rescaled([30, undefined, undefined], 0, 120, 100, 340, 4)).toEqual([160, undefined, undefined]);
  });

  it('leave every visible phase at least a month long after a resize', () => {
    expect(rescaled([118, 119, undefined], 0, 120, 0, 4, 4)).toEqual([1, 2, undefined]);
  });

  it('clamp a dragged boundary so its neighbours keep a month each, spread ones included', () => {
    expect(withBoundary(none, 0, 0, 0, 120, 4)).toEqual([1, undefined, undefined]);
    expect(withBoundary(none, 0, 500, 0, 120, 4)).toEqual([117, undefined, undefined]);
    expect(withBoundary([undefined, 60, undefined], 0, 80, 0, 120, 4)).toEqual([59, 60, undefined]);
  });
});