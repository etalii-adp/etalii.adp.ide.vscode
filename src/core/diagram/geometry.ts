import type { Box } from '../frame/diagramType';

// The points and boxes every part of the diagram library measures with, in canvas units.

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A box's centre. */
export function centreOf(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A box moved by an offset. */
export function moved<T extends Box>(box: T, by: Point): T {
  return by.x === 0 && by.y === 0 ? box : { ...box, x: box.x + by.x, y: box.y + by.y };
}

/** The box around every box given, or nothing for none. */
export function boundsOf(boxes: readonly Box[]): Box | undefined {
  if (boxes.length === 0) return undefined;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
