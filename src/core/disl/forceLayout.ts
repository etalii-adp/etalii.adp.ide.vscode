// The `force` layout in tiers (DISL 10.4): related nodes pull together, all nodes push apart, and
// each tier of node types has a ring of its own, from the centre outwards. DISL states what the
// result must be and leaves the algorithm to a reference a definition's companion document gives.
// This is that reference, with its numbers: ring radii, start positions, a fixed number of steps of
// three forces, then passes that part what still overlaps. Nothing in it is random and every loop
// runs in the order of the document, so the same document gives the same picture.

export interface Centre {
  readonly x: number;
  readonly y: number;
}

/** One node the layout places, by its centre. */
export interface ForceNode {
  readonly id: string;
  /** The index of its tier, from the centre outwards; absent for a type no tier names, which the forces alone place. */
  readonly tier?: number;
  readonly width: number;
  readonly height: number;
  /** Where its centre is kept: the node is pinned, never moves, and the others arrange themselves around it. */
  readonly pinned?: Centre;
  /** Where its centre is on screen: the layout starts from there (a live change). */
  readonly placed?: Centre;
}

/** The distance from one ring to the next, where the outer one needs no more. */
const ringStep = 220;
/** The steps of the forces when a document is opened, and after a live change. */
const openSteps = 300;
const liveSteps = 100;
/** A relation is a spring of this stiffness and this length at rest. */
const springStiffness = 0.05;
const springLength = 200;
const repulsion = 20000;
const ringPull = 0.1;
/** The furthest a node moves in the first step; less in each later one. */
const furthestMove = 30;
/**
 * The most passes that part what overlaps. The reference gives 50, which leaves overlaps in a dense
 * picture; DISL requires that none is left (10.4, property 2), so the passes go on until one parts nothing.
 */
const overlapPasses = 2000;
/** What two nodes are parted by beyond their overlap, so that a pass ends with them clear of each other. */
const hair = 0.01;

const tierCount = (nodes: readonly ForceNode[]): number => nodes.reduce((count, node) => Math.max(count, (node.tier ?? -1) + 1), 0);

/**
 * The radius of each tier's ring, by the tier's index; a tier without a node has none. The first
 * ring that holds nodes is the centre itself for one node and wide enough for its nodes side by
 * side otherwise; each further one is a step beyond the ring inside it, or as wide as its nodes need.
 */
export function ringRadii(nodes: readonly ForceNode[], gap: number): (number | undefined)[] {
  const radii: (number | undefined)[] = [];
  let inner: number | undefined;
  for (let tier = 0; tier < tierCount(nodes); tier++) {
    const members = nodes.filter((node) => node.tier === tier);
    if (members.length === 0) {
      radii.push(undefined);
      continue;
    }
    const needed = (members.length * (Math.max(...members.map((node) => node.width)) + gap)) / (2 * Math.PI);
    inner = inner === undefined ? (members.length === 1 ? 0 : needed) : Math.max(inner + ringStep, needed);
    radii.push(inner);
  }
  return radii;
}

// The angle the i-th node of a tier starts at: evenly round its ring, each tier turned half a radian further.
function startAngles(nodes: readonly ForceNode[]): Map<string, number> {
  const tiers = tierCount(nodes);
  const angles = new Map<string, number>();
  for (const tier of [...Array.from({ length: tiers }, (_, index) => index), undefined]) {
    const members = nodes.filter((node) => node.tier === tier);
    members.forEach((node, index) => angles.set(node.id, (2 * Math.PI * index) / members.length + 0.5 * (tier ?? tiers)));
  }
  return angles;
}

/**
 * Where each node's centre starts: a pinned node where it is kept, a node on screen where it is,
 * and any other on its tier's ring, at its angle. A node of no tier starts a step beyond the last ring.
 */
export function startPositions(nodes: readonly ForceNode[], gap: number): Map<string, Centre> {
  const radii = ringRadii(nodes, gap);
  const beyond = (radii.filter((radius) => radius !== undefined).at(-1) ?? 0) + ringStep;
  const angles = startAngles(nodes);
  return new Map(nodes.map((node) => {
    const radius = node.tier === undefined ? beyond : radii[node.tier] ?? 0;
    const angle = angles.get(node.id)!;
    return [node.id, node.pinned ?? node.placed ?? { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }];
  }));
}

/**
 * The centre of every node. `links` are the relations, each as the ids of its two ends; `gap` is
 * the least distance between the bounds of two nodes. A pinned node is where it is kept. With a
 * node on screen the run is a live change: it starts from the screen and takes fewer steps, so
 * what did not change moves little.
 */
export function forceLayout(nodes: readonly ForceNode[], links: readonly (readonly [string, string])[], options: { readonly gap: number }): Map<string, Centre> {
  const { gap } = options;
  const radii = ringRadii(nodes, gap);
  const angles = startAngles(nodes);
  const start = startPositions(nodes, gap);
  const x = nodes.map((node) => start.get(node.id)!.x);
  const y = nodes.map((node) => start.get(node.id)!.y);
  const index = new Map(nodes.map((node, position) => [node.id, position]));
  const related: number[][] = nodes.map(() => []);
  for (const [from, to] of links) {
    const [a, b] = [index.get(from), index.get(to)];
    if (a === undefined || b === undefined || a === b) continue;
    related[a].push(b);
    related[b].push(a);
  }

  const steps = nodes.some((node) => node.placed !== undefined) ? liveSteps : openSteps;
  for (let step = 0; step < steps; step++) {
    const furthest = furthestMove * (1 - step / openSteps);
    for (const [i, node] of nodes.entries()) {
      if (node.pinned) continue;
      let moveX = 0;
      let moveY = 0;
      // A spring along each relation, towards the other end.
      for (const j of related[i]) {
        const distance = Math.hypot(x[j] - x[i], y[j] - y[i]);
        if (distance === 0) continue;
        const pull = springStiffness * (distance - springLength);
        moveX += ((x[j] - x[i]) / distance) * pull;
        moveY += ((y[j] - y[i]) / distance) * pull;
      }
      // A push away from every other node. Two on one point part along the angle the earlier one starts at.
      for (let j = 0; j < nodes.length; j++) {
        if (j === i) continue;
        const distance = Math.hypot(x[i] - x[j], y[i] - y[j]);
        const push = repulsion / Math.max(distance, 1) ** 2;
        if (distance === 0) {
          const angle = angles.get(nodes[Math.min(i, j)].id)!;
          const away = i < j ? 1 : -1;
          moveX += away * Math.cos(angle) * push;
          moveY += away * Math.sin(angle) * push;
        } else {
          moveX += ((x[i] - x[j]) / distance) * push;
          moveY += ((y[i] - y[j]) / distance) * push;
        }
      }
      // A pull towards its ring, along the line from the origin; from the origin itself, along its own angle.
      const ring = node.tier === undefined ? undefined : radii[node.tier];
      if (ring !== undefined) {
        const out = Math.hypot(x[i], y[i]);
        const pull = ringPull * (ring - out);
        moveX += (out === 0 ? Math.cos(angles.get(node.id)!) : x[i] / out) * pull;
        moveY += (out === 0 ? Math.sin(angles.get(node.id)!) : y[i] / out) * pull;
      }
      const length = Math.hypot(moveX, moveY);
      const cut = length > furthest ? furthest / length : 1;
      x[i] += moveX * cut;
      y[i] += moveY * cut;
    }
  }

  // What still overlaps is parted along the axis that needs the least, half each; a pinned node stays, and the other takes the whole of it.
  for (let pass = 0; pass < overlapPasses; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const [a, b] = [nodes[i], nodes[j]];
        if (a.pinned && b.pinned) continue;
        const overlapX = (a.width + b.width) / 2 + gap - Math.abs(x[j] - x[i]);
        const overlapY = (a.height + b.height) / 2 + gap - Math.abs(y[j] - y[i]);
        if (overlapX <= 0 || overlapY <= 0) continue;
        moved = true;
        const along = overlapX <= overlapY ? x : y;
        const overlap = Math.min(overlapX, overlapY) + hair;
        const sign = along[j] >= along[i] ? 1 : -1;
        along[i] -= sign * overlap * (a.pinned ? 0 : b.pinned ? 1 : 0.5);
        along[j] += sign * overlap * (b.pinned ? 0 : a.pinned ? 1 : 0.5);
      }
    }
    if (!moved) break;
  }

  // To a hundredth, so that two machines that differ in the last bits of a cosine still draw one picture.
  const rounded = (value: number): number => Math.round(value * 100) / 100;
  return new Map(nodes.map((node, i) => [node.id, node.pinned ?? { x: rounded(x[i]), y: rounded(y[i]) }]));
}
