import { clamp, roundAwayFromZero } from '../text/rounding';
import { hasSpan, monthsOf, phaseCount, visiblePhases, type Trend } from './model';

// The four phases, and the one place their boundaries are computed. Months are what is stored and
// computed: every boundary returned is snapped to a month, because a drawn boundary is a date a
// reader reads off the axis.

type Stored = readonly (number | undefined)[];

/**
 * The drawn inner boundaries of a span, as month indices: one fewer than the visible phases.
 * A stored boundary is drawn at its date; the others are spread evenly between their nearest stored
 * neighbours or the trend's ends. A stored boundary at or beyond the last visible phase is kept in
 * the document and is neither drawn nor a neighbour. One outside the span is clamped for drawing only.
 */
export function boundariesOfSpan(start: number, stop: number, phases: number, dragged: Stored): number[] {
  const inner = clamp(phases, 1, phaseCount) - 1;
  const result = new Array<number>(inner).fill(0);
  let anchorIndex = -1;
  let anchorValue = start;
  for (let index = 0; index <= inner; index++) {
    const stored = index < inner && index < dragged.length ? dragged[index] : undefined;
    if (index < inner && stored === undefined) continue;
    const value = index === inner ? stop : clamp(stored as number, anchorValue, stop);
    for (let between = anchorIndex + 1; between < index; between++) {
      result[between] = roundAwayFromZero(anchorValue + ((value - anchorValue) * (between - anchorIndex)) / (index - anchorIndex));
    }
    if (index < inner) result[index] = value;
    anchorIndex = index;
    anchorValue = value;
  }
  return result;
}

/** The drawn inner boundaries of a trend; empty for a trend that cannot be drawn. */
export function boundariesOf(trend: Trend): number[] {
  return hasSpan(trend) ? boundariesOfSpan(trend.start, trend.stop, visiblePhases(trend), trend.draggedEnds) : [];
}

/** The drawn boundaries as fractions of the trend's width. */
export function fractionsOf(trend: Trend): number[] {
  if (!hasSpan(trend)) return [];
  const months = monthsOf(trend);
  return boundariesOf(trend).map((boundary) => (boundary - trend.start) / months);
}

/** The stored boundaries after a move: shifted exactly, as start and stop are. */
export function moved(dragged: Stored, months: number): (number | undefined)[] {
  return dragged.map((boundary) => (boundary === undefined ? undefined : boundary + months));
}

/**
 * The stored boundaries after a resize: each offset from the start scaled by the new span over the
 * old, rounded to a month, and every phase kept at least a month long.
 */
export function rescaled(dragged: Stored, oldStart: number, oldStop: number, newStart: number, newStop: number, phases: number): (number | undefined)[] {
  const oldSpan = Math.max(1, oldStop - oldStart);
  const newSpan = newStop - newStart;
  const scaled = dragged.map((boundary) => (boundary === undefined ? undefined : newStart + roundAwayFromZero(((boundary - oldStart) * newSpan) / oldSpan)));
  return keptAMonthApart(scaled, newStart, newStop, phases);
}

/** The stored boundaries with one set to a month, clamped so no phase becomes shorter than a month. */
export function withBoundary(dragged: Stored, index: number, month: number, start: number, stop: number, phases: number): (number | undefined)[] {
  const slots = slotsOf(dragged);
  slots[index] = month;
  return keptAMonthApart(slots, start, stop, phases, index);
}

function keptAMonthApart(stored: Stored, start: number, stop: number, phases: number, pinned = -1): (number | undefined)[] {
  const slots = slotsOf(stored);
  const inner = clamp(phases, 1, phaseCount) - 1;

  // The pinned boundary first, against the anchors either side of it, so the others make room for it.
  const movedTo = pinned >= 0 && pinned < inner ? slots[pinned] : undefined;
  if (movedTo !== undefined) {
    let lowIndex = -1;
    let low = start;
    for (let index = pinned - 1; index >= 0; index--) {
      const value = slots[index];
      if (value !== undefined) {
        lowIndex = index;
        low = value;
        break;
      }
    }
    let highIndex = inner;
    let high = stop;
    for (let index = pinned + 1; index < inner; index++) {
      const value = slots[index];
      if (value !== undefined) {
        highIndex = index;
        high = value;
        break;
      }
    }
    const lowest = low + (pinned - lowIndex);
    slots[pinned] = clamp(movedTo, lowest, high - (highIndex - pinned));
  }

  let previousIndex = -1;
  let previous = start;
  for (let index = 0; index < slots.length; index++) {
    const value = slots[index];
    if (value === undefined) continue;
    let kept: number;
    if (index < inner) {
      kept = clamp(value, previous + (index - previousIndex), stop - (inner - index));
    } else {
      // Not drawn: kept inside the span and after the boundaries before it.
      const highest = Math.max(start, stop - 1);
      kept = clamp(value, Math.min(previous + 1, highest), highest);
    }
    slots[index] = kept;
    previousIndex = index;
    previous = kept;
  }
  return slots;
}

function slotsOf(stored: Stored): (number | undefined)[] {
  const slots: (number | undefined)[] = new Array<number | undefined>(phaseCount - 1).fill(undefined);
  for (let index = 0; index < slots.length && index < stored.length; index++) slots[index] = stored[index];
  return slots;
}