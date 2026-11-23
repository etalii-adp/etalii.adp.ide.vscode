// The dependency curve (`net.etalii.adp.generic.dependencyCurve`; etalii.adp spec 088, task T017), the routing
// the companion's section 7 draws and DISL's routings cannot state: standalone's `dependencyRoute` of
// `dependencyGraphBindings.ts`, with `horizontalBezierPath` and `forwardBezierPath` of its `connectors.ts`.
// A dependency leaves the right side of its dependent and enters the left side of its dependency; while the
// dependency sits clear to the right the curve is a horizontal bezier, otherwise it loops forward.

import type { RouteRequest, RoutingPlugin } from '../../tool/pluginRegistry';

/** The least reach of a loop's control points, in canvas units, as standalone's `forwardBezierPath` keeps it. */
const leastReach = 40;

const route = ({ source, target }: RouteRequest): ReturnType<RoutingPlugin['route']> => {
  const from = { x: source.x + source.width, y: source.y + source.height / 2, side: 'right' as const };
  const to = { x: target.x, y: target.y + target.height / 2, side: 'left' as const };
  const loopsBack = target.x < source.x + source.width;
  const span = to.x - from.x;
  const reach = Math.max(span / 2, leastReach, -span * 0.6);
  const [c1x, c2x] = loopsBack ? [from.x + reach, to.x - reach] : [from.x + span / 2, from.x + span / 2];
  return { from, to, path: [{ op: 'M', x: from.x, y: from.y }, { op: 'C', c1x, c1y: from.y, c2x, c2y: to.y, x: to.x, y: to.y }] };
};

export const dependencyCurve: RoutingPlugin = { id: 'net.etalii.adp.generic.dependencyCurve', route };
