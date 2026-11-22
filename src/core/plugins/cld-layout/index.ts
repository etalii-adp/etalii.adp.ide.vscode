// The layout plugin the causal loop diagram's definition names (`plugin:net.etalii.adp.systems.cld`;
// etalii.adp spec 081, research R6): the standalone module's `SelfOrganizingLayout`, Meyer's
// self-organizing graphs with every source of randomness replaced by a function of the document and
// the iteration index. The arithmetic is the module's, step for step, so that the same document is
// arranged where standalone arranges it: a phyllotaxis spiral in document order, a Halton sequence
// of stimuli, ties broken by document order, a neighbourhood in graph hops, and a bounded pass that
// pushes overlapping boxes apart.

import type { LayoutPlugin } from '../../disl/layout';
import type { Model } from '../../disl/model';

const VARIABLE = 'Variable';
const LINK = 'CausalLink';

/** The module's `CausalLoopMetrics.Default` and `TextMetric`: how wide and tall a variable is drawn there. */
const FONT_SIZE = 14;
const HORIZONTAL_PADDING = 14;
const VERTICAL_PADDING = 10;
const MINIMUM_WIDTH = 90;
const SEPARATION = 40;
const AVERAGE_ADVANCE = 0.55;
const HEIGHT = FONT_SIZE * 1.4 + VERTICAL_PADDING * 2;

const INITIAL_RATE = 0.9;
const FINAL_RATE = 0.01;
const INITIAL_RADIUS = 3.0;
const FINAL_RADIUS = 0.35;
const NUDGE = 0.5;
const GOLDEN_ANGLE = 2.39996322972865332;

/** The options the definition states, with the module's constants where it states none. */
export interface Options {
  readonly iterations: number;
  readonly separationRounds: number;
  readonly budget: number;
}

const defaults: Options = { iterations: 2000, separationRounds: 200, budget: 1000 };

/** What arranging comes to: each variable's centre by its id, or why nothing was arranged. */
export type Arrangement = { readonly centres: ReadonlyMap<string, { readonly x: number; readonly y: number; readonly width: number }> } | { readonly refused: string };

type Point = [number, number];

/** A variable's width as the module measures its text: the label, else its name. */
export function widthOf(text: string): number {
  return Math.max(MINIMUM_WIDTH, text.length * FONT_SIZE * AVERAGE_ADVANCE + HORIZONTAL_PADDING * 2);
}

/** The `index`th value of the radical-inverse sequence in `radix`, in [0, 1). */
export function halton(index: number, radix: number): number {
  let result = 0;
  let fraction = 1 / radix;
  for (let rest = index; rest > 0; rest = Math.trunc(rest / radix)) {
    result += fraction * (rest % radix);
    fraction /= radix;
  }
  return result;
}

/** Where each variable starts: a phyllotaxis spiral in the document's own order, scaled by the widest box. */
function initialPositions(widths: readonly number[]): Point[] {
  const spacing = ((widths.length === 0 ? 0 : Math.max(...widths)) + HEIGHT + SEPARATION * 2) / 2;
  return widths.map((_, index) => {
    const radius = spacing * Math.sqrt(index);
    const angle = index * GOLDEN_ANGLE;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
}

/** Hop counts between every pair of variables over the links read as undirected; -1 where one cannot be reached. */
function graphDistances(ids: readonly string[], links: readonly [string, string][]): number[][] {
  const index = new Map(ids.map((id, at) => [id, at]));
  const adjacency: number[][] = ids.map(() => []);
  for (const [cause, effect] of links) {
    const from = index.get(cause);
    const to = index.get(effect);
    if (from === undefined || to === undefined || from === to) continue;
    adjacency[from].push(to);
    adjacency[to].push(from);
  }
  return ids.map((_, source) => {
    const distances = ids.map(() => -1);
    distances[source] = 0;
    const queue = [source];
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      for (const neighbour of adjacency[current]) {
        if (distances[neighbour] >= 0) continue;
        distances[neighbour] = distances[current] + 1;
        queue.push(neighbour);
      }
    }
    return distances;
  });
}

/** The variable nearest a point, the earlier in the document on a tie. */
function bestMatchingUnit(positions: readonly Point[], x: number, y: number): number {
  let winner = 0;
  let best = Number.MAX_VALUE;
  positions.forEach(([px, py], index) => {
    const distance = (px - x) * (px - x) + (py - y) * (py - y);
    if (distance < best) {
      best = distance;
      winner = index;
    }
  });
  return winner;
}

/** Presents the stimuli and moves the variables toward each, the winner's graph neighbourhood with it. */
function organize(positions: Point[], widths: readonly number[], hops: readonly number[][], iterations: number): void {
  const xs = positions.map(([x]) => x);
  const ys = positions.map(([, y]) => y);
  const padding = (Math.max(...widths) + HEIGHT) / 2 + SEPARATION;
  const minimumX = Math.min(...xs) - padding;
  const minimumY = Math.min(...ys) - padding;
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs) + padding * 2, 1);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys) + padding * 2, 1);
  for (let iteration = 0; iteration < iterations; iteration++) {
    const progress = iteration / iterations;
    const rate = INITIAL_RATE * Math.pow(FINAL_RATE / INITIAL_RATE, progress);
    const radius = INITIAL_RADIUS * Math.pow(FINAL_RADIUS / INITIAL_RADIUS, progress);
    const falloff = 2 * radius * radius;
    const stimulusX = minimumX + halton(iteration + 1, 2) * spanX;
    const stimulusY = minimumY + halton(iteration + 1, 3) * spanY;
    const winner = bestMatchingUnit(positions, stimulusX, stimulusY);
    for (let index = 0; index < positions.length; index++) {
      const distance = hops[winner][index];
      if (distance < 0) continue;
      const influence = rate * Math.exp(-(distance * distance) / falloff);
      positions[index] = [positions[index][0] + influence * (stimulusX - positions[index][0]), positions[index][1] + influence * (stimulusY - positions[index][1])];
    }
  }
}

/** Pushes overlapping boxes apart along the axis that needs least, for at most `rounds` rounds; the pairs still overlapping. */
export function separate(centres: Point[], widths: readonly number[], rounds: number): number {
  let overlaps = 0;
  for (let round = 0; round < rounds; round++) {
    overlaps = 0;
    for (let first = 0; first < centres.length; first++) {
      for (let second = first + 1; second < centres.length; second++) {
        const neededX = (widths[first] + widths[second]) / 2 + SEPARATION;
        const neededY = HEIGHT + SEPARATION;
        const dx = centres[second][0] - centres[first][0];
        const dy = centres[second][1] - centres[first][1];
        const overlapX = neededX - Math.abs(dx);
        const overlapY = neededY - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        overlaps++;
        if (overlapX / neededX < overlapY / neededY) {
          const push = overlapX / 2 + NUDGE;
          const direction = dx < 0 ? -1 : 1;
          centres[first] = [centres[first][0] - push * direction, centres[first][1]];
          centres[second] = [centres[second][0] + push * direction, centres[second][1]];
        } else {
          const push = overlapY / 2 + NUDGE;
          const direction = dy < 0 ? -1 : 1;
          centres[first] = [centres[first][0], centres[first][1] - push * direction];
          centres[second] = [centres[second][0], centres[second][1] + push * direction];
        }
      }
    }
    if (overlaps === 0) return 0;
  }
  return overlaps;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Arranges a model's variables as the standalone module does, or says why it did not. */
export function arrange(model: Model, given: Partial<Options> = {}): Arrangement {
  const options = { ...defaults, ...given };
  const variables = model.elements.filter((element) => element.type === VARIABLE);
  if (variables.length > options.budget) return { refused: `This diagram has ${variables.length} variables, which is more than the ${options.budget} this layout arranges. It has been left as it is.` };
  const names = variables.map((variable) => text(variable.attributes.name));
  const widths = variables.map((variable) => widthOf(text(variable.attributes.label) || text(variable.attributes.name)));
  const positions = initialPositions(widths);
  if (variables.length > 1) {
    const links = model.relations.filter((relation) => relation.type === LINK).map((link): [string, string] => [text(link.attributes.causeName), text(link.attributes.effectName)]);
    organize(positions, widths, graphDistances(names, links), options.iterations);
  }
  const remaining = separate(positions, widths, options.separationRounds);
  if (remaining > 0) return { refused: `This layout could not arrange ${variables.length} variables without ${remaining} of them overlapping, so the diagram has been left as it is.` };
  return { centres: new Map(variables.map((variable, index) => [variable.id, { x: positions[index][0], y: positions[index][1], width: widths[index] }])) };
}

const number = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

export const cldLayout: LayoutPlugin = {
  id: 'net.etalii.adp.systems.cld',
  place: ({ model, sizes, options }) => {
    const arranged = arrange(model, { iterations: number(options.iterations, defaults.iterations), separationRounds: number(options.separationRounds, defaults.separationRounds), budget: number(options.budget, defaults.budget) });
    if ('refused' in arranged) return {};
    // Each centre as the top-left of the box the notation draws, so that the variable's anchor, its centre, lands on it.
    return Object.fromEntries([...arranged.centres].map(([id, centre]) => {
      const size = sizes[id] ?? { width: centre.width, height: HEIGHT };
      return [id, { x: centre.x - size.width / 2, y: centre.y - size.height / 2 }];
    }));
  },
};
