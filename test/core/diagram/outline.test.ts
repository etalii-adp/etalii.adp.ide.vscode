import { describe, expect, it } from 'vitest';
import { orthogonalPath } from '../../../src/core/diagram/connectors';
import { outlineOf } from '../../../src/core/diagram/shapes/outline';

describe('the built-in shapes', () => {
  const box = { x: 0, y: 0, width: 200, height: 60 };

  it('has a superellipse that touches the middle of each side', () => {
    const squircle = outlineOf('superellipse', box);
    expect(squircle).toHaveLength(64);
    expect(squircle[0]).toEqual({ x: 200, y: 30 });
    expect(Math.max(...squircle.map((point) => point.y))).toBeCloseTo(60, 9);
  });

  it('has a diode closed by a semicircle on its right', () => {
    const shape = outlineOf('diode', box);
    expect(shape[0]).toEqual({ x: 0, y: 0 });
    expect(Math.max(...shape.map((point) => point.x))).toBeCloseTo(200, 9);
    expect(shape[shape.length - 1]).toEqual({ x: 0, y: 60 });
  });

  it('has a hexagon of six corners and an arrow banner that ends in a point', () => {
    expect(outlineOf('hexagon', box)).toHaveLength(6);
    expect(outlineOf('arrow-banner', box)[2]).toEqual({ x: 200, y: 30 });
  });

  it('draws a box, a pill and an ellipse from their rectangle', () => {
    expect(outlineOf('box', box)).toEqual([]);
    expect(outlineOf('pill', box)).toEqual([]);
    expect(outlineOf('ellipse', box)).toEqual([]);
  });
});

describe('the orthogonal route', () => {
  it('runs down from the first end to halfway, across, and down into the second', () => {
    expect(orthogonalPath({ x: 200, y: 60 }, { x: 100, y: 116 })).toBe('M 200 60 V 88 H 100 V 116');
  });
});
