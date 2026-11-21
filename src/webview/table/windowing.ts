// A long table draws only the lines in and near sight, between two spacers that keep the scroll bar
// spanning every line (etalii.adp spec 079, FR-028, R5). Every line is taken to be one height:
// a heading, a row and a `+ New` line alike.

/** From how many lines the body draws only those near sight. */
export const windowFrom = 300;
/** How tall a line is taken to be, in pixels. */
export const lineHeight = 30;
/** How many lines beyond sight are drawn on each side. */
const overscan = 40;

/** The lines to draw, from the first to before the last: all of a short table, and those in and near sight of a long one. */
export function windowOf(count: number, scrollTop: number, clientHeight: number): [number, number] {
  if (count <= windowFrom) return [0, count];
  const sight = clientHeight > 0 ? clientHeight : 1200;
  const first = Math.max(0, Math.floor(scrollTop / lineHeight) - overscan);
  return [Math.min(first, count), Math.min(count, first + Math.ceil(sight / lineHeight) + 2 * overscan)];
}
