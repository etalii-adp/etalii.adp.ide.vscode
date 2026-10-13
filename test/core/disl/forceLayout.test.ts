import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { forceLayout, ringRadii, startPositions, type ForceNode } from '../../../src/core/disl/forceLayout';
import { plugins as registry } from '../../../src/core/plugins/index';
import type { Scene } from '../../../src/core/scene/scene';
import { definitionOf, diagramOf } from '../tool/support';

// The `force` layout in tiers (DISL 10.4; etalii.adp spec 027, task T086). DISL states the
// properties its result must have, and the companion document of the first definition that uses
// it, `definitions/agent-activity-diagram/agent-activity-diagram.md` ("Layout"), the reference
// algorithm with its numbers: ring radii, start positions, 300 steps of three forces, 50 passes
// that part what overlaps, and 100 steps from the positions on screen for a live change. The
// algorithm is tested on models of the test's own; the three examples are drawn through the tool
// type of the definition, whose `view` mapping records where their locked elements are.

const gap = 24;
type Pair = readonly [string, string];
interface Point { readonly x: number; readonly y: number }

// A population shaped like the one the layout was written for, as standalone's own test of its
// layout generates it (5756a07, `tieredForceLayout.test.ts`): `projects` projects, three
// specifications each, two agents on each, a location for each agent, three environments, and one
// agent and one environment with no relation at all.
function generate(projects: number): { readonly nodes: ForceNode[]; readonly links: Pair[] } {
  const nodes: ForceNode[] = [];
  const links: Pair[] = [];
  const add = (id: string, tier: number, width: number, height: number): void => void nodes.push({ id, tier, width, height });
  const environments = ['e-local', 'e-cloud', 'e-container'];
  for (let p = 0; p < projects; p++) {
    add(`p${p}`, 0, 180, 56);
    for (let s = 0; s < 3; s++) {
      const specification = `p${p}s${s}`;
      // Specifications differ a great deal in height: one has its groups of tasks unfolded.
      add(specification, 1, 240, s === 0 ? 260 : 96);
      links.push([`p${p}`, specification]);
      for (let a = 0; a < 2; a++) {
        const agent = `${specification}a${a}`;
        add(agent, 2, 160, 44);
        links.push([specification, agent]);
        add(`${agent}l`, 3, 240, a === 0 ? 140 : 72);
        links.push([agent, `${agent}l`], [`${agent}l`, environments[(p + s + a) % environments.length]]);
      }
    }
  }
  for (const id of environments) add(id, 4, 170, 56);
  add('idle-agent', 2, 160, 44);
  add('spare-environment', 4, 170, 56);
  return { nodes, links };
}

const placed = (nodes: readonly ForceNode[], links: readonly Pair[]): Map<string, Point> => forceLayout(nodes, links, { gap });
const from = (centre: Point | undefined): number => Math.hypot(centre?.x ?? NaN, centre?.y ?? NaN);

/** The pairs whose bounds, each grown by half the gap, intersect; two pinned nodes are left as they are (DISL 10.4, properties 2 and 3). */
function overlapping(nodes: readonly ForceNode[], centres: ReadonlyMap<string, Point>): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const [a, b] = [nodes[i], nodes[j]];
      const [at, other] = [centres.get(a.id)!, centres.get(b.id)!];
      if (a.pinned && b.pinned) continue;
      const clear = Math.abs(other.x - at.x) >= (a.width + b.width) / 2 + gap - 1e-6 || Math.abs(other.y - at.y) >= (a.height + b.height) / 2 + gap - 1e-6;
      if (!clear) pairs.push(`${a.id}~${b.id}`);
    }
  }
  return pairs;
}

const meanByTier = (nodes: readonly ForceNode[], centres: ReadonlyMap<string, Point>): number[] =>
  [0, 1, 2, 3, 4].map((tier) => {
    const members = nodes.filter((node) => node.tier === tier);
    return members.reduce((sum, node) => sum + from(centres.get(node.id)), 0) / members.length;
  });

describe('the rings of a force layout in tiers', () => {
  it('give one node of the first tier the centre, and several a ring that holds them side by side', () => {
    expect(ringRadii([{ id: 'p', tier: 0, width: 180, height: 56 }], gap)).toEqual([0]);
    const two: ForceNode[] = [{ id: 'p', tier: 0, width: 180, height: 56 }, { id: 'q', tier: 0, width: 120, height: 56 }];
    // n × (w + gap) / 2π, with w the widest of the tier.
    expect(ringRadii(two, gap)[0]).toBeCloseTo((2 * (180 + gap)) / (2 * Math.PI), 9);
  });

  it('put each further ring 220 beyond the one inside it, or as far out as its nodes need', () => {
    const few: ForceNode[] = [{ id: 'p', tier: 0, width: 180, height: 56 }, ...[0, 1, 2].map((index): ForceNode => ({ id: `s${index}`, tier: 1, width: 240, height: 64 }))];
    expect(ringRadii(few, gap)).toEqual([0, 220]);
    const many: ForceNode[] = [{ id: 'p', tier: 0, width: 180, height: 56 }, ...Array.from({ length: 12 }, (_, index): ForceNode => ({ id: `s${index}`, tier: 1, width: 240, height: 64 }))];
    expect(ringRadii(many, gap)[1]).toBeCloseTo((12 * (240 + gap)) / (2 * Math.PI), 9);
  });

  it('give an empty tier no ring: the next tier that holds a node is one step beyond the last that does', () => {
    const radii = ringRadii([{ id: 'p', tier: 0, width: 180, height: 56 }, { id: 'l', tier: 3, width: 240, height: 64 }], gap);
    expect(radii[0]).toBe(0);
    expect(radii[1]).toBeUndefined();
    expect(radii[2]).toBeUndefined();
    expect(radii[3]).toBe(220);
  });

  it('start the i-th node of tier k at the angle 2π × i / n + 0.5 × k on its ring, y downwards', () => {
    const nodes: ForceNode[] = [{ id: 'p', tier: 0, width: 180, height: 56 }, ...[0, 1, 2, 3].map((index): ForceNode => ({ id: `s${index}`, tier: 1, width: 240, height: 64 }))];
    const start = startPositions(nodes, gap);
    expect(start.get('p')).toEqual({ x: 0, y: 0 });
    for (const index of [0, 1, 2, 3]) {
      const angle = (2 * Math.PI * index) / 4 + 0.5;
      expect(start.get(`s${index}`)!.x).toBeCloseTo(220 * Math.cos(angle), 9);
      expect(start.get(`s${index}`)!.y).toBeCloseTo(220 * Math.sin(angle), 9);
    }
  });

  it('start a pinned node where it is kept, and a node that is on screen where it is', () => {
    const start = startPositions([
      { id: 'p', tier: 0, width: 180, height: 56, pinned: { x: 900, y: -700 } },
      { id: 's', tier: 1, width: 240, height: 64, placed: { x: 12, y: 34 } },
    ], gap);
    expect(start.get('p')).toEqual({ x: 900, y: -700 });
    expect(start.get('s')).toEqual({ x: 12, y: 34 });
  });
});

describe('a force layout in tiers', () => {
  it('places every node, and the tiers outwards from the centre in the order they are declared', () => {
    const { nodes, links } = generate(2);
    const centres = placed(nodes, links);
    expect([...centres.keys()].sort()).toEqual(nodes.map((node) => node.id).sort());
    const means = meanByTier(nodes, centres);
    expect(means).toEqual([...means].sort((a, b) => a - b));
    expect(means[0]).toBeLessThan(means[1]);
  });

  it('leaves no two nodes nearer than the gap, tall and short alike', () => {
    for (const projects of [1, 2, 4]) {
      const { nodes, links } = generate(projects);
      expect(overlapping(nodes, placed(nodes, links)), `${projects} project(s)`).toEqual([]);
    }
  });

  it('gives the same picture twice: nothing of it is random', () => {
    const first = placed(generate(3).nodes, generate(3).links);
    const second = placed(generate(3).nodes, generate(3).links);
    expect([...second]).toEqual([...first]);
  });

  it('puts a single node of the first tier in the middle', () => {
    const { nodes, links } = generate(1);
    expect(from(placed(nodes, links).get('p0'))).toBeLessThan(120);
  });

  it('places a node with no relation on its own tier\'s ring, not in the middle and not adrift', () => {
    const { nodes, links } = generate(2);
    const centres = placed(nodes, links);
    const means = meanByTier(nodes, centres);
    expect(from(centres.get('idle-agent'))).toBeGreaterThan(means[1] * 0.8);
    expect(from(centres.get('idle-agent'))).toBeLessThan(means[3] * 1.2);
    expect(from(centres.get('spare-environment'))).toBeGreaterThan(means[3] * 0.8);
  });

  it('parts two nodes that start on one point', () => {
    const centres = placed([{ id: 'a', width: 100, height: 40, placed: { x: 5, y: 5 } }, { id: 'b', width: 100, height: 40, placed: { x: 5, y: 5 } }], []);
    expect(overlapping([{ id: 'a', width: 100, height: 40 }, { id: 'b', width: 100, height: 40 }], centres)).toEqual([]);
  });

  it('keeps the node of an inner tier no further from the centre than one of an outer tier (DISL 10.4, property 1)', () => {
    // One project, its three specifications and an agent on each.
    const nodes: ForceNode[] = [
      { id: 'p', tier: 0, width: 180, height: 56 },
      ...[0, 1, 2].flatMap((index): ForceNode[] => [{ id: `s${index}`, tier: 1, width: 240, height: 64 }, { id: `a${index}`, tier: 2, width: 160, height: 44 }]),
    ];
    const centres = placed(nodes, [0, 1, 2].flatMap((index): Pair[] => [['p', `s${index}`], [`s${index}`, `a${index}`]]));
    const middle = centres.get('p')!;
    const far = (id: string): number => Math.hypot(centres.get(id)!.x - middle.x, centres.get(id)!.y - middle.y);
    for (const inner of nodes) {
      for (const outer of nodes) {
        if (inner.tier! < outer.tier!) expect(far(inner.id), `${inner.id} and ${outer.id}`).toBeLessThanOrEqual(far(outer.id));
      }
    }
  });
});

describe('a force layout and a pinned node', () => {
  it('never moves it, and keeps the others clear of where it is', () => {
    const { nodes, links } = generate(2);
    const pinned = nodes.map((node) => (node.id === 'p0s0' ? { ...node, pinned: { x: 900, y: -700 } } : node));
    const centres = placed(pinned, links);
    expect(centres.get('p0s0')).toEqual({ x: 900, y: -700 });
    expect(overlapping(pinned, centres)).toEqual([]);
  });

  it('draws what is related to it towards it', () => {
    const { nodes, links } = generate(1);
    const free = placed(nodes, links);
    const moved = placed(nodes.map((node) => (node.id === 'p0s1' ? { ...node, pinned: { x: 1500, y: 0 } } : node)), links);
    for (const agent of ['p0s1a0', 'p0s1a1']) {
      const before = Math.hypot(free.get(agent)!.x - 1500, free.get(agent)!.y);
      const after = Math.hypot(moved.get(agent)!.x - 1500, moved.get(agent)!.y);
      expect(after, agent).toBeLessThan(before);
    }
  });

  it('leaves two pinned nodes where they are, also where they overlap', () => {
    const centres = placed([
      { id: 'a', tier: 0, width: 180, height: 56, pinned: { x: 0, y: 0 } },
      { id: 'b', tier: 1, width: 240, height: 64, pinned: { x: 10, y: 10 } },
      { id: 'c', tier: 1, width: 240, height: 64 },
    ], [['a', 'b'], ['a', 'c']]);
    expect([centres.get('a'), centres.get('b')]).toEqual([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
  });
});

describe('a force layout after a live change', () => {
  it('starts from the positions on screen and not from the computed start, so the picture moves less than one drawn anew', () => {
    const { nodes, links } = generate(1);
    const settled = placed(nodes, links);
    const onScreen = nodes.map((node): ForceNode => ({ ...node, placed: settled.get(node.id)! }));
    // An agent added to a specification, as an agent that starts work adds itself.
    const added: ForceNode = { id: 'new-agent', tier: 2, width: 160, height: 44 };
    const grown: Pair[] = [...links, ['p0s2', 'new-agent']];
    const live = placed([...onScreen, added], grown);
    const anew = placed([...nodes, added], grown);
    const moves = (to: ReadonlyMap<string, Point>): number[] => nodes.map((node) => Math.hypot(to.get(node.id)!.x - settled.get(node.id)!.x, to.get(node.id)!.y - settled.get(node.id)!.y)).sort((a, b) => a - b);
    const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
    // Half of the picture hardly moves, and all of it moves less than when it is laid out from nothing.
    expect(moves(live)[Math.floor(nodes.length / 2)]).toBeLessThan(10);
    expect(mean(moves(live))).toBeLessThan(mean(moves(anew)) / 2);
    expect(overlapping([...onScreen, added], live)).toEqual([]);
  });

  it('moves a settled picture that did not change hardly at all', () => {
    const { nodes, links } = generate(2);
    const settled = placed(nodes, links);
    const again = placed(nodes.map((node): ForceNode => ({ ...node, placed: settled.get(node.id)! })), links);
    for (const node of nodes) expect(Math.hypot(again.get(node.id)!.x - settled.get(node.id)!.x, again.get(node.id)!.y - settled.get(node.id)!.y), node.id).toBeLessThan(30);
  });
});

// ---- the three examples ----

const type = diagramOf(definitionOf('agent-activity-diagram'), registry);
const examples = ['adp-one-day', 'every-state', 'two-projects'];
const textOf = (name: string): string => readFileSync(`examples/agent-activity-diagram/${name}/${name}.aad`, 'utf8');
const sceneOf = (name: string): Scene => type.view({ fileName: `${name}.aad`, text: textOf(name) }, {});
/** The places an example records for its locked elements: the entries of `view.placements` of its file. */
const recorded = (name: string): { readonly element: string; readonly x: number; readonly y: number }[] =>
  ((parse(textOf(name)) as { view?: { placements?: { element: string; x: number; y: number }[] } }).view?.placements ?? []);
const tiers = ['Project', 'Specification', 'Agent', 'Location', 'Environment'];

describe.each(examples)('the example %s, laid out by the definition\'s force layout', (name) => {
  const scene = sceneOf(name);

  it('draws every element of the five types as a node, each at a place', () => {
    expect(scene.nodes.length).toBeGreaterThan(5);
    expect(scene.nodes.filter((node) => !tiers.includes(node.type)).map((node) => node.id)).toEqual([]);
    expect(scene.nodes.filter((node) => ![node.box.x, node.box.y, node.box.width, node.box.height].every(Number.isFinite)).map((node) => node.id)).toEqual([]);
    expect(scene.findings.map((finding) => finding.message)).toEqual([]);
  });

  it('draws each locked element at the place the file records for it, and marks it as pinned', () => {
    const places = recorded(name);
    // A stored position is the point of the node its placement names: the definition states no anchor, so DISL's default, the top-left corner (5.8, 11.6).
    for (const place of places) {
      const node = scene.nodes.find((candidate) => candidate.id === place.element)!;
      expect([node.box.x, node.box.y], place.element).toEqual([place.x, place.y]);
      expect(node.pinned, place.element).toBe(true);
    }
    expect(scene.nodes.filter((node) => node.pinned).map((node) => node.id).sort()).toEqual(places.map((place) => place.element).sort());
  });

  it('is the same picture every time the file is opened', () => {
    const again = sceneOf(name);
    expect(again.nodes.map((node) => [node.id, node.box])).toEqual(scene.nodes.map((node) => [node.id, node.box]));
  });

  it('leaves no two elements nearer than the gap, unless both are locked', () => {
    const near: string[] = [];
    for (const [index, a] of scene.nodes.entries()) {
      for (const b of scene.nodes.slice(index + 1)) {
        if (a.pinned && b.pinned) continue;
        const clear = b.box.x - (a.box.x + a.box.width) >= gap - 1e-6 || a.box.x - (b.box.x + b.box.width) >= gap - 1e-6
          || b.box.y - (a.box.y + a.box.height) >= gap - 1e-6 || a.box.y - (b.box.y + b.box.height) >= gap - 1e-6;
        if (!clear) near.push(`${a.id}~${b.id}`);
      }
    }
    expect(near).toEqual([]);
  });

  it('keeps a locked element where it is when another one is added to the file', () => {
    const more = `${textOf(name).replace(/(\r\nenvironments:\r\n)/, '$1  - id: e-added\r\n    name: Added\r\n    kind: other\r\n')}`;
    expect(more).not.toBe(textOf(name));
    const changed = type.view({ fileName: `${name}.aad`, text: more }, { placed: Object.fromEntries(scene.nodes.map((node) => [node.id, { x: node.box.x + node.box.width / 2, y: node.box.y + node.box.height / 2 }])) });
    expect(changed.nodes.some((node) => node.id === 'e-added')).toBe(true);
    for (const place of recorded(name)) {
      const node = changed.nodes.find((candidate) => candidate.id === place.element)!;
      expect([node.box.x, node.box.y], place.element).toEqual([place.x, place.y]);
    }
  });
});

describe('the places of an example that is not locked anywhere', () => {
  it('are on rings by type: projects innermost, environments outermost', () => {
    const scene = sceneOf('two-projects');
    expect(recorded('two-projects')).toEqual([]);
    const far = (kind: string): number => {
      const nodes = scene.nodes.filter((node) => node.type === kind);
      return nodes.reduce((sum, node) => sum + Math.hypot(node.box.x + node.box.width / 2, node.box.y + node.box.height / 2), 0) / nodes.length;
    };
    const means = tiers.map(far);
    expect(means).toEqual([...means].sort((a, b) => a - b));
  });
});
