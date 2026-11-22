// The elementary cycles of a directed graph, by Johnson's algorithm: for each start in the given
// order, the cycles whose earliest member is that start, over the vertices at or after it. Each
// vertex's successors are walked in the order given, so the caller decides the order the cycles
// come in: DISL 12.4's `diagram.cycles` walks them in model order, which gives its lexicographic
// order, and a plugin may walk them in the order of the links that join them.

export interface Cycles {
  /** At most `max` cycles, each in loop order and starting at its earliest member. */
  readonly cycles: readonly (readonly string[])[];
  /** Whether there are more than `max`. */
  readonly truncated: boolean;
}

/**
 * The elementary cycles among `order`, following `successors`. A successor that is not in `order`
 * is not walked, a successor listed twice is one step, and a vertex that is its own successor is a
 * cycle of one. The search stops as soon as it meets a cycle beyond `max`.
 */
export function elementaryCycles(order: readonly string[], successors: ReadonlyMap<string, readonly string[]>, max: number): Cycles {
  const position = new Map(order.map((vertex, index) => [vertex, index]));
  const next = new Map(order.map((vertex) => [vertex, [...new Set(successors.get(vertex) ?? [])].filter((to) => position.has(to))]));
  const cycles: string[][] = [];
  const search = { truncated: false };
  for (let start = 0; start < order.length && !search.truncated; start++) {
    new Circuit(order[start], start, position, next, cycles, Math.max(0, max), search).from(order[start]);
  }
  return { cycles, truncated: search.truncated };
}

/** Johnson's CIRCUIT procedure for one start, with its blocked set and the vertices waiting on each. */
class Circuit {
  private readonly blocked = new Set<string>();
  private readonly waiting = new Map<string, Set<string>>();
  private readonly stack: string[] = [];

  constructor(
    private readonly root: string,
    private readonly least: number,
    private readonly position: ReadonlyMap<string, number>,
    private readonly next: ReadonlyMap<string, readonly string[]>,
    private readonly cycles: string[][],
    private readonly max: number,
    private readonly search: { truncated: boolean },
  ) {}

  /** Whether a cycle closes through `vertex`. */
  from(vertex: string): boolean {
    let found = false;
    this.stack.push(vertex);
    this.blocked.add(vertex);
    const allowed = (this.next.get(vertex) ?? []).filter((to) => this.position.get(to)! >= this.least);
    for (const to of allowed) {
      if (to === this.root) {
        if (this.cycles.length >= this.max) {
          this.search.truncated = true;
          break;
        }
        this.cycles.push([...this.stack]);
        found = true;
      } else if (!this.blocked.has(to)) {
        if (this.from(to)) found = true;
        if (this.search.truncated) break;
      }
    }
    if (found) this.unblock(vertex);
    else for (const to of allowed) (this.waiting.get(to) ?? this.waiting.set(to, new Set()).get(to)!).add(vertex);
    this.stack.pop();
    return found;
  }

  private unblock(vertex: string): void {
    this.blocked.delete(vertex);
    const pending = [...(this.waiting.get(vertex) ?? [])];
    this.waiting.get(vertex)?.clear();
    for (const dependant of pending) if (this.blocked.has(dependant)) this.unblock(dependant);
  }
}
