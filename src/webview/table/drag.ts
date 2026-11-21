// Dragging on the table surface: a view's tab, a column's header or its right border, a row's
// handle, and a line of the sort, group or options editor (etalii.adp spec 079, FR-003, FR-008,
// FR-012, FR-013, FR-016, FR-019). One helper follows the pointer for all of them: what is dragged
// is shown where it is while it moves, and one gesture is made when it is let go, none when it is
// let go where it started. The keyboard moves the same things one place at a time.

/** How far the pointer goes before a press becomes a drag, in pixels. */
const threshold = 4;

export type Axis = 'x' | 'y';

/**
 * Follows the pointer from a press until it is let go: `moved` with how far it went while it is
 * dragged, `ended` once, with how far and whether it was dragged at all. The click a drag ends
 * with is not a press.
 */
export function follow(start: MouseEvent, moved: (dx: number, dy: number) => void, ended: (dx: number, dy: number, dragged: boolean) => void): void {
  let dragged = false;
  const move = (event: MouseEvent): void => {
    const dx = event.clientX - start.clientX;
    const dy = event.clientY - start.clientY;
    if (!dragged && Math.hypot(dx, dy) < threshold) return;
    dragged = true;
    moved(dx, dy);
  };
  const up = (event: MouseEvent): void => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    if (dragged) swallowClick();
    ended(event.clientX - start.clientX, event.clientY - start.clientY, dragged);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

/** The click that follows a drag is the end of the drag, not a press on what was dragged. */
function swallowClick(): void {
  const swallow = (event: Event): void => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
}

/** Where among the others a pointer at `at` lands: how many of them it is past the middle of. */
export function landing(at: number, others: readonly DOMRect[], axis: Axis): number {
  return others.filter((box) => (axis === 'x' ? box.left + box.width / 2 : box.top + box.height / 2) < at).length;
}

/**
 * What the one at `index` lands after when it goes to place `to` among the others: their id, `''`
 * for the first place, and undefined when it lands where it was.
 */
export function afterOf(ids: readonly string[], index: number, to: number): string | undefined {
  if (to === index || index < 0) return undefined;
  const others = ids.filter((_id, at) => at !== index);
  return to === 0 ? '' : others[to - 1];
}

/** The keyboard's move: one place earlier or later, as `afterOf` says it. */
export function stepped(ids: readonly string[], index: number, step: number): string | undefined {
  const to = index + step;
  return to < 0 || to >= ids.length ? undefined : afterOf(ids, index, to);
}

/**
 * Drags one of several among the others, showing where it would land, and gives the place it was
 * let go at; nothing when it is let go where it started.
 */
export function reorder(start: MouseEvent, items: readonly HTMLElement[], index: number, axis: Axis, land: (to: number) => void): void {
  const source = items[index];
  if (!source) return;
  const others = items.filter((_item, at) => at !== index);
  const boxes = others.map((item) => item.getBoundingClientRect());
  const origin = source.getBoundingClientRect();
  const from = axis === 'x' ? origin.left + origin.width / 2 : origin.top + origin.height / 2;
  const clear = (): void => {
    source.classList.remove('adp-table-dragging');
    for (const item of others) item.classList.remove('adp-table-drop-before', 'adp-table-drop-after');
  };
  const to = (dx: number, dy: number): number => landing(from + (axis === 'x' ? dx : dy), boxes, axis);
  follow(start, (dx, dy) => {
    clear();
    source.classList.add('adp-table-dragging');
    const place = to(dx, dy);
    if (place === index) return;
    // The line is drawn before the one it lands before, or after the last.
    if (place < others.length) others[place].classList.add('adp-table-drop-before');
    else others[others.length - 1]?.classList.add('adp-table-drop-after');
  }, (dx, dy, dragged) => {
    clear();
    if (!dragged) return;
    const place = to(dx, dy);
    if (place !== index) land(place);
  });
}
