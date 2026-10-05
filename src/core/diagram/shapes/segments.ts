import type { Box } from '../../frame/diagramType';
import { roundAwayFromZero } from '../../text/rounding';
import type { Point } from '../geometry';
import { arrowBannerPointDepth } from './outline';

// A shape cut into segments, such as the arrow banner of a hype cycle trend cut into its phases by
// chevrons, and where a relation attaches along its top or bottom edge. Pure geometry, shared by
// the view models that place things and the canvas that draws them, and the same as the
// standalone host's library (`canvas/library/shapes/segments.ts`).

export interface Segment {
  readonly index: number;
  readonly polygon: readonly Point[];
  /** The stretch of the top and bottom edge that belongs to this segment. */
  readonly from: number;
  readonly to: number;
}

export interface Divider {
  readonly index: number;
  readonly x: number;
  readonly points: readonly Point[];
}

export interface Banner {
  readonly segments: readonly Segment[];
  readonly dividers: readonly Divider[];
  /** The banner's outline: the body, and the point that ends it at the full width. */
  readonly outline: readonly Point[];
}

/** Where one end of a relation attaches: an edge, the segment it is on and a fraction along it. */
export interface Attachment {
  readonly edge: 'top' | 'bottom';
  readonly region: number;
  readonly at: number;
}

/** An arrow banner of `count` segments whose inner boundaries lie at `fractions` of its width. */
export function bannerOf(bounds: Box, count: number, fractions: readonly number[]): Banner {
  const depth = arrowBannerPointDepth(bounds);
  const left = bounds.x;
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;
  const middle = bounds.y + bounds.height / 2;
  const shoulder = bounds.x + bounds.width - depth;
  const tip = bounds.x + bounds.width;

  // Each inner boundary as its tip, on the middle line, and its tail, where it meets the edges.
  const boundaries = fractions.map((fraction) => left + fraction * bounds.width);
  const tails = boundaries.map((at, index) => {
    const previous = index === 0 ? left : boundaries[index - 1];
    return Math.min(at - Math.min(depth, at - previous), shoulder);
  });

  const segments: Segment[] = [];
  for (let index = 0; index < count; index++) {
    const first = index === 0;
    const last = index === count - 1;
    const leftTail = first ? left : tails[index - 1];
    const leftTip = first ? left : boundaries[index - 1];
    const rightTail = last ? shoulder : tails[index];
    const rightTip = last ? tip : boundaries[index];
    const polygon: Point[] = [
      { x: leftTail, y: top }, { x: rightTail, y: top }, { x: rightTip, y: middle }, { x: rightTail, y: bottom }, { x: leftTail, y: bottom },
    ];
    // The notch the previous chevron's tip cuts into this segment's left side.
    if (!first && leftTip !== leftTail) polygon.push({ x: leftTip, y: middle });
    segments.push({ index, polygon, from: leftTail, to: rightTail });
  }

  const dividers = boundaries.map((at, index): Divider => ({
    index,
    x: at,
    points: tails[index] === at ? [{ x: at, y: top }, { x: at, y: bottom }] : [{ x: tails[index], y: top }, { x: at, y: middle }, { x: tails[index], y: bottom }],
  }));

  const outline: Point[] = [{ x: left, y: top }, { x: shoulder, y: top }, { x: tip, y: middle }, { x: shoulder, y: bottom }, { x: left, y: bottom }];
  return { segments, dividers, outline };
}

/** Evenly spread boundaries for `count` segments. */
export function evenFractions(count: number): number[] {
  return Array.from({ length: Math.max(0, count - 1) }, (_, index) => (index + 1) / count);
}

/** The point on the banner's edge an attachment names. */
export function attachmentPoint(attachment: Attachment, bounds: Box, banner: Banner): Point {
  const at = Math.min(1, Math.max(0, attachment.at));
  const segment = banner.segments[attachment.region];
  const from = segment ? segment.from : bounds.x;
  const to = segment ? segment.to : bounds.x + bounds.width;
  return { x: from + at * (to - from), y: attachment.edge === 'top' ? bounds.y : bounds.y + bounds.height };
}

const fraction = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;

/** The attachment nearest a point: the segment and edge it is closest to, and how far along. */
export function nearestAttachment(point: Point, bounds: Box, banner: Banner): Attachment {
  let best: { attachment: Attachment; distance: number } | undefined;
  for (const edge of ['top', 'bottom'] as const) {
    for (const segment of banner.segments) {
      const length = segment.to - segment.from;
      const attachment: Attachment = { edge, region: segment.index, at: fraction(length > 0 ? (point.x - segment.from) / length : 0) };
      const on = attachmentPoint(attachment, bounds, banner);
      const distance = Math.hypot(on.x - point.x, on.y - point.y);
      if (!best || distance < best.distance) best = { attachment, distance };
    }
  }
  return best!.attachment;
}

/**
 * Where a dragged boundary lands: on the nearest step, a half rounding away from zero, and at
 * least one step from its neighbouring boundaries or the shape's ends.
 */
export function boundaryLanding(banner: Banner, bounds: Box, index: number, x: number, step: number): number {
  const unit = step > 0 ? step : 1;
  const previous = index === 0 ? bounds.x : banner.dividers[index - 1].x;
  const next = index === banner.dividers.length - 1 ? bounds.x + bounds.width : banner.dividers[index + 1].x;
  const snapped = roundAwayFromZero(x / unit) * unit;
  const low = previous + unit;
  const high = next - unit;
  return low > high ? (previous + next) / 2 : Math.min(high, Math.max(low, snapped));
}