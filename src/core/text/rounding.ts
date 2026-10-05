/** Rounds a half away from zero, on both sides of it, as every ADP host's snapping does. */
export function roundAwayFromZero(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? 0 : rounded;
}

/** Rounds a half to the even neighbour: how a value is rounded before it is written to a file. */
export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const difference = value - floor;
  if (difference < 0.5) return floor;
  if (difference > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** The row whose top is nearest `y` when rows are `rowHeight` apart; a half rounds away from zero. */
export function toNearestRow(y: number, rowHeight: number): number {
  if (!(rowHeight > 0) || !Number.isFinite(rowHeight)) {
    throw new RangeError('A row height must be a positive, finite number.');
  }
  return roundAwayFromZero(y / rowHeight);
}

/** Keeps a value between two bounds; the lower bound wins when they cross. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}