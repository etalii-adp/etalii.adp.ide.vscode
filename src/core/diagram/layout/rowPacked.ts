/** One thing a row canvas draws: where it starts and ends across, and how many rows it is tall. */
export interface RowItem {
  readonly id: string;
  /** Its leftmost extent, label included. */
  readonly left: number;
  readonly right: number;
  /** How many rows it occupies from its top row; one for everything but a tall note. */
  readonly rows?: number;
}

const swapPasses = 64;

/**
 * The arrangement a row canvas offers as "Arrange diagram": every item on a row, in as few rows as
 * the items allow, with linked items on rows close together.
 *
 * Across is the data; only the row is ours. That makes the problem interval partitioning, which a
 * sweep from left to right solves exactly: an item goes on a row that is free where it starts, and
 * a new row is opened only when every row is busy there. Among the free rows an item takes the one
 * nearest the rows of the items it is linked to, and whole rows then swap places while that
 * shortens the links in total. Deterministic: ties fall to the lower row and the original order,
 * so arranging an arranged diagram changes nothing.
 */
export function packRows(items: readonly RowItem[], links: readonly (readonly [string, string])[], gap: number): Map<string, number> {
  const order = items
    .map((item, index) => ({ item: { ...item, rows: Math.max(1, item.rows ?? 1) }, index }))
    .sort((a, b) => a.item.left - b.item.left || a.item.right - b.item.right || a.index - b.index)
    .map((entry) => entry.item);
  const neighbours = new Map<string, string[]>(order.map((item) => [item.id, []]));
  for (const [from, to] of links) {
    if (from !== to && neighbours.has(from) && neighbours.has(to)) {
      neighbours.get(from)!.push(to);
      neighbours.get(to)!.push(from);
    }
  }

  // Where each row is next free, across.
  const freeFrom: number[] = [];
  const rows = new Map<string, number>();
  for (const item of order) {
    const fits = (top: number): boolean => {
      for (let row = top; row < top + item.rows; row++) {
        if (row < freeFrom.length && freeFrom[row] > item.left) return false;
      }
      return true;
    };
    const placed = neighbours.get(item.id)!.filter((id) => rows.has(id)).map((id) => rows.get(id)!);
    const existing: number[] = [];
    for (let top = 0; top < Math.max(0, freeFrom.length - item.rows + 1); top++) {
      if (fits(top)) existing.push(top);
    }

    let row: number;
    if (existing.length === 0) {
      row = 0;
      while (!fits(row)) row++;
    } else if (placed.length === 0) {
      row = existing[0];
    } else {
      const wanted = placed.reduce((sum, value) => sum + value, 0) / placed.length;
      row = [...existing].sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b)[0];
    }

    while (freeFrom.length < row + item.rows) freeFrom.push(Number.NEGATIVE_INFINITY);
    for (let r = row; r < row + item.rows; r++) freeFrom[r] = item.right + gap;
    rows.set(item.id, row);
  }

  return swapRows(order, rows, neighbours, freeFrom.length);
}

// Swaps neighbouring rows while that makes the links shorter in total. A row touched by an item
// taller than one row stays where it is, because swapping it would tear that item in two.
function swapRows(items: readonly Required<RowItem>[], rows: Map<string, number>, neighbours: Map<string, string[]>, rowCount: number): Map<string, number> {
  const pinned = new Set<number>();
  for (const item of items) {
    if (item.rows > 1) {
      for (let r = rows.get(item.id)!; r < rows.get(item.id)! + item.rows; r++) pinned.add(r);
    }
  }

  // Which row each original row is drawn at now.
  const at = Array.from({ length: rowCount }, (_, index) => index);
  const links: [string, string][] = [];
  for (const item of items) {
    for (const other of neighbours.get(item.id)!) {
      if (item.id < other) links.push([item.id, other]);
    }
  }
  const cost = (): number => links.reduce((sum, [from, to]) => sum + Math.abs(at[rows.get(from)!] - at[rows.get(to)!]), 0);

  let best = cost();
  for (let pass = 0; pass < swapPasses; pass++) {
    let improved = false;
    for (let position = 0; position + 1 < rowCount; position++) {
      const upper = at.indexOf(position);
      const lower = at.indexOf(position + 1);
      if (pinned.has(upper) || pinned.has(lower)) continue;
      [at[upper], at[lower]] = [at[lower], at[upper]];
      const swapped = cost();
      if (swapped < best - 1e-9) {
        best = swapped;
        improved = true;
      } else {
        [at[upper], at[lower]] = [at[lower], at[upper]];
      }
    }
    if (!improved) break;
  }

  return new Map([...rows].map(([id, row]) => [id, at[row]]));
}