import type { Box } from '../../frame/diagramType';
import type { Point } from '../geometry';

// One outline per built-in shape, stated once so the drawing and everything measured from it
// agree. The shapes and their geometry are the standalone host's library's
// (`canvas/library/shapes/outline.ts`), so a diagram is the same shape in every ADP host. A shape
// with no polygon outline (`box`, `rounded-box`, `pill`, `ellipse`) is drawn from its rectangle.

/** The shapes the library draws an element as. */
export type BuiltInShape = 'box' | 'rounded-box' | 'pill' | 'ellipse' | 'diamond' | 'hexagon' | 'parallelogram' | 'trapezoid' | 'superellipse' | 'diode' | 'arrow-banner';

/** The squircle: |x/a|^n + |y/b|^n = 1 with n = 4, which is what "superellipse" means here. */
const superellipseExponent = 4;
/** How finely the superellipse is sampled. Even, so the extremes land on samples. */
const superellipseSamples = 64;
/** How finely the diode's closing semicircle is sampled. */
const diodeArcSamples = 24;

/** The corners of the straight-sided shapes, as fractions of the bounds. */
const cornerFractions: Partial<Record<BuiltInShape, readonly (readonly [number, number])[]>> = {
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  hexagon: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
  parallelogram: [[0.2, 0], [1, 0], [0.8, 1], [0, 1]],
  trapezoid: [[0, 0], [1, 0], [0.85, 1], [0.15, 1]],
};

/** How far an arrow banner's point reaches back from its right edge: half its height, at most half its width. */
export function arrowBannerPointDepth(bounds: Box): number {
  return Math.max(0, Math.min(bounds.height / 2, bounds.width / 2));
}

/** The closed outline of a shape, walked in one direction; empty for a shape drawn from its rectangle. */
export function outlineOf(shape: BuiltInShape, bounds: Box): Point[] {
  const corners = cornerFractions[shape];
  if (corners) return corners.map(([fx, fy]) => ({ x: bounds.x + fx * bounds.width, y: bounds.y + fy * bounds.height }));

  if (shape === 'superellipse') {
    const a = bounds.width / 2;
    const b = bounds.height / 2;
    const power = 2 / superellipseExponent;
    return Array.from({ length: superellipseSamples }, (_, index) => {
      const angle = (2 * Math.PI * index) / superellipseSamples;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return { x: bounds.x + a + Math.sign(cos) * Math.abs(cos) ** power * a, y: bounds.y + b + Math.sign(sin) * Math.abs(sin) ** power * b };
    });
  }

  if (shape === 'arrow-banner') {
    const depth = arrowBannerPointDepth(bounds);
    return [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width - depth, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
      { x: bounds.x + bounds.width - depth, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height },
    ];
  }

  if (shape === 'diode') {
    // A box closed on the right by a semicircle, so it reads as pointing onward. A radius wider
    // than the box would turn it inside out, so it is clamped.
    const radius = Math.min(bounds.height / 2, bounds.width);
    const straightTo = bounds.x + bounds.width - radius;
    const centreY = bounds.y + bounds.height / 2;
    const arc = Array.from({ length: diodeArcSamples + 1 }, (_, index) => {
      const angle = -Math.PI / 2 + (Math.PI * index) / diodeArcSamples;
      return { x: straightTo + Math.cos(angle) * radius, y: centreY + Math.sin(angle) * radius };
    });
    return [{ x: bounds.x, y: bounds.y }, ...arc, { x: bounds.x, y: bounds.y + bounds.height }];
  }

  return [];
}
