// The standard algorithm `circular` (DISL 10): the nodes evenly around one ring. DISL names it
// without an order or a radius; the `adp.ring.*` options of a configuration say them, and with
// none the ring is the one the standalone host draws for a causal loop diagram: seated by a
// depth-first walk of the links, starting at the top and running clockwise, its radius grown from
// the widest node and the count so that no two neighbours touch.

/** `adp.ring.*` of a `circular` configuration, with their defaults. */
export interface CircularLayout {
  /** `link-walk`: a depth-first walk of the links, read undirected; `document`: the order of the model. */
  readonly order: 'link-walk' | 'document';
  readonly start: 'top' | 'right' | 'bottom' | 'left';
  readonly direction: 'clockwise' | 'counterclockwise';
  /** The room kept between two neighbours on the rim, beyond the widest node. */
  readonly separation: number;
}

/** One node the ring places, in the order of the model. */
export interface RingNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

/** Reads `adp.ring.*` from a configuration's options. */
export function readCircular(options: Readonly<Record<string, unknown>>): CircularLayout {
  const option = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => (allowed.includes(options[`adp.ring.${name}`] as T) ? (options[`adp.ring.${name}`] as T) : fallback);
  const separation = options['adp.ring.separation'];
  return {
    order: option('order', ['link-walk', 'document'], 'link-walk'),
    start: option('start', ['top', 'right', 'bottom', 'left'], 'top'),
    direction: option('direction', ['clockwise', 'counterclockwise'], 'clockwise'),
    separation: typeof separation === 'number' && Number.isFinite(separation) ? separation : 40,
  };
}

/**
 * The top-left corner of each node on the ring. One node sits with its corner at the origin.
 * A link is read undirected and once per link, and one whose ends are not both nodes, or are the
 * same node, is ignored. Every coordinate is rounded to a millionth, so that the ring is the same
 * on every platform, and is never a negative zero.
 */
export function ringPlaces(nodes: readonly RingNode[], links: readonly (readonly [string, string])[], options: CircularLayout): Map<string, { readonly x: number; readonly y: number }> {
  const places = new Map<string, { x: number; y: number }>();
  // A node listed twice is one node, the first.
  const unique = nodes.filter((node, index) => nodes.findIndex((other) => other.id === node.id) === index);
  if (unique.length === 0) return places;
  if (unique.length === 1) {
    places.set(unique[0].id, { x: 0, y: 0 });
    return places;
  }
  const slot = Math.max(...unique.map((node) => node.width)) + options.separation;
  const radius = Math.max(slot, (unique.length * slot) / (2 * Math.PI));
  const order = options.order === 'link-walk' ? linkWalk(unique, links) : unique;
  const start = { top: -Math.PI / 2, right: 0, bottom: Math.PI / 2, left: Math.PI }[options.start];
  const turn = options.direction === 'clockwise' ? 1 : -1;
  order.forEach((node, index) => {
    const angle = turn * ((2 * Math.PI * index) / order.length) + start;
    places.set(node.id, { x: settled(radius * Math.cos(angle) - node.width / 2), y: settled(radius * Math.sin(angle) - node.height / 2) });
  });
  return places;
}

/** A coordinate rounded to a millionth, never a negative zero. */
const settled = (value: number): number => Math.round(value * 1e6) / 1e6 + 0;

/**
 * The nodes in the order a depth-first walk of the links meets them: from the first node, at each
 * step the earliest neighbour not yet seated, and on from the earliest node left when a component
 * is done. A cycle so stays contiguous on the rim.
 */
function linkWalk(nodes: readonly RingNode[], links: readonly (readonly [string, string])[]): RingNode[] {
  const position = new Map(nodes.map((node, index) => [node.id, index]));
  const neighbours: number[][] = nodes.map(() => []);
  for (const [a, b] of links) {
    const [from, to] = [position.get(a), position.get(b)];
    if (from === undefined || to === undefined || from === to) continue;
    neighbours[from].push(to);
    neighbours[to].push(from);
  }
  for (const list of neighbours) list.sort((a, b) => a - b);
  const placed = nodes.map(() => false);
  const order: RingNode[] = [];
  for (let seed = 0; seed < nodes.length; seed++) {
    if (placed[seed]) continue;
    const stack = [seed];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (placed[current]) continue;
      placed[current] = true;
      order.push(nodes[current]);
      // Pushed in reverse, so the earliest neighbour is taken first.
      for (let index = neighbours[current].length - 1; index >= 0; index--) {
        if (!placed[neighbours[current][index]]) stack.push(neighbours[current][index]);
      }
    }
  }
  return order;
}
