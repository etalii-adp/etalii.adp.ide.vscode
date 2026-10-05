import type { Point } from './geometry';

// The routes a relation is drawn along, between two ends the anchors have placed. The same routes,
// by the same names, as the standalone host's library (`canvas/connectors.ts`).

/** One end of a relation: where it is, and the direction it leaves or enters in. */
export interface End {
  readonly point: Point;
  /** A unit vector pointing away from the element, perpendicular to the edge the end sits on. */
  readonly normal: Point;
}

/** How a relation runs from one end to the other. */
export type Route = 'straight' | 'orthogonal' | 'cubic-bezier';

/** A straight line. */
export function straightPath(from: Point, to: Point): string {
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

/**
 * A line of right angles. Vertical, as a tree drawn top-down reads: down from the first end to
 * halfway, across, and down into the second. Horizontal is the same turned on its side.
 */
export function orthogonalPath(from: Point, to: Point, axis: 'horizontal' | 'vertical' = 'vertical'): string {
  if (axis === 'vertical') {
    const middle = from.y + (to.y - from.y) / 2;
    return `M ${from.x} ${from.y} V ${middle} H ${to.x} V ${to.y}`;
  }
  const middle = from.x + (to.x - from.x) / 2;
  return `M ${from.x} ${from.y} H ${middle} V ${to.y} H ${to.x}`;
}

/** A cubic Bézier that leaves and enters perpendicular to the edges its ends sit on. */
export function cubicBezierPath(from: End, to: End): string {
  const reach = Math.min(120, Math.max(24, Math.hypot(to.point.x - from.point.x, to.point.y - from.point.y) / 2));
  const c1 = { x: from.point.x + from.normal.x * reach, y: from.point.y + from.normal.y * reach };
  const c2 = { x: to.point.x + to.normal.x * reach, y: to.point.y + to.normal.y * reach };
  return `M ${from.point.x} ${from.point.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.point.x} ${to.point.y}`;
}

/** The path of a route between two ends. */
export function pathOf(route: Route, from: End, to: End): string {
  switch (route) {
    case 'straight': return straightPath(from.point, to.point);
    case 'cubic-bezier': return cubicBezierPath(from, to);
    default: return orthogonalPath(from.point, to.point, from.normal.x !== 0 && from.normal.y === 0 ? 'horizontal' : 'vertical');
  }
}
