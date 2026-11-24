/**
 * Where the labels of a time strip stand: each level over the axis, so that no two labels on one
 * level overlap. A label reads from its mark to the right, or to the left near the strip's end; its
 * width is estimated from its length, since a label is placed before it is laid out.
 */
export interface PlacedLabel {
  /** The level over the axis, 0 the nearest. */
  readonly lane: number;
  /** Whether the label reads to the left of its mark. */
  readonly leftward: boolean;
}

const characterWidth = 6.5;
const padding = 8;
const gap = 6;

export function placeLabels(marks: readonly { readonly offset: number; readonly label?: string }[], axisWidth: number): (PlacedLabel | undefined)[] {
  const ends: number[] = [];
  const order = marks.map((mark, index) => ({ mark, index })).sort((one, other) => one.mark.offset - other.mark.offset);
  const placed: (PlacedLabel | undefined)[] = marks.map(() => undefined);
  for (const { mark, index } of order) {
    if (mark.label === undefined || mark.label === '') continue;
    const width = mark.label.length * characterWidth + padding;
    const at = mark.offset * axisWidth;
    const leftward = at + width > axisWidth && at - width >= 0;
    const start = leftward ? at - width : at;
    let lane = ends.findIndex((end) => end + gap <= start);
    if (lane === -1) lane = ends.length;
    ends[lane] = start + width;
    placed[index] = { lane, leftward };
  }
  return placed;
}
