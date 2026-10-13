// The two-sided mind map layout (the mind map's companion document, section 4), ported from
// standalone's `MindmapLayout` and `MindmapMetrics`: the central topic centred on the origin, its
// branches to either side, each node's children stacked beside it. A pure function of the tree it
// is given. A folded node comes without its descendants, so nothing here knows of folds.

import { widthOfText } from '../../text/textMetric';

/** A node that is drawn, with the nodes drawn under it. */
export interface Topic {
  readonly id: string;
  readonly text: string;
  /** Freeplane's `POSITION` of a first-level node, as the file writes it. */
  readonly position?: string;
  readonly children: readonly Topic[];
}

/** The numbers the layout sizes and spaces nodes with, in canvas units. */
export interface Metrics {
  readonly fontSize: number;
  /** As a fraction of the font size. */
  readonly lineHeight: number;
  readonly horizontalPadding: number;
  readonly verticalPadding: number;
  /** Between a node's edge and its children's, at least. */
  readonly horizontalGap: number;
  /** Between two stacked branches, at least. */
  readonly verticalGap: number;
  readonly minimumWidth: number;
  /** A gap is never less than this share of the node's width, so wide nodes get more air. */
  readonly minimumGapRatio: number;
}

export const defaultMetrics: Metrics = { fontSize: 14, lineHeight: 1.4, horizontalPadding: 10, verticalPadding: 6, horizontalGap: 48, verticalGap: 10, minimumWidth: 32, minimumGapRatio: 0.1 };

/** A node's place: its top-left corner and its size. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** To two decimals, a half to the even digit: what standalone's platform rounds to, so both give the same number. */
function round(value: number): number {
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  return (Math.abs(scaled % 1) === 0.5 && rounded % 2 !== 0 ? rounded - 1 : rounded) / 100;
}

/** The box a node with `text` takes: the shared estimate of the text's width, with the padding around it. */
export function measure(text: string, metrics: Metrics): { readonly width: number; readonly height: number } {
  return {
    width: round(Math.max(metrics.minimumWidth, widthOfText(text, metrics.fontSize) + 2 * metrics.horizontalPadding)),
    height: round(metrics.fontSize * metrics.lineHeight + 2 * metrics.verticalPadding),
  };
}

/** The box of every topic of the tree, by its id, in the order of the tree. */
export function layoutOf(root: Topic, metrics: Metrics): ReadonlyMap<string, Box> {
  const gapBeside = (width: number): number => Math.max(metrics.horizontalGap, width * metrics.minimumGapRatio);
  const gapBetween = (a: Topic, b: Topic): number => Math.max(metrics.verticalGap, Math.max(measure(a.text, metrics).width, measure(b.text, metrics).width) * metrics.minimumGapRatio);
  /** The heights of stacked branches with the gaps between them, added in the order standalone adds them. */
  const stacked = (heights: readonly number[], siblings: readonly Topic[]): number => {
    let total = heights.reduce((sum, height) => sum + height, 0);
    for (let i = 0; i < siblings.length - 1; i++) total += gapBetween(siblings[i], siblings[i + 1]);
    return total;
  };
  /** The room a branch needs: its children stacked, or its own height when that is more. */
  const heightOf = (topic: Topic): number => {
    const own = measure(topic.text, metrics).height;
    return topic.children.length === 0 ? own : Math.max(own, stacked(topic.children.map(heightOf), topic.children));
  };

  const boxes = new Map<string, Box>();
  /** A column of branches centred on `centerY`, their near edges on `edgeX`. */
  function column(siblings: readonly Topic[], edgeX: number, centerY: number, towardsRight: boolean): void {
    if (siblings.length === 0) return;
    const heights = siblings.map(heightOf);
    let y = centerY - stacked(heights, siblings) / 2;
    siblings.forEach((topic, i) => {
      const slotCenter = y + heights[i] / 2;
      const size = measure(topic.text, metrics);
      const box = { x: round(towardsRight ? edgeX : edgeX - size.width), y: round(slotCenter - size.height / 2), ...size };
      boxes.set(topic.id, box);
      column(topic.children, towardsRight ? box.x + box.width + gapBeside(box.width) : box.x - gapBeside(box.width), slotCenter, towardsRight);
      y += heights[i];
      if (i < siblings.length - 1) y += gapBetween(topic, siblings[i + 1]);
    });
  }

  const size = measure(root.text, metrics);
  const central = { x: -size.width / 2, y: -size.height / 2, ...size };
  boxes.set(root.id, central);
  // A branch goes to the side its POSITION names, in either of Freeplane's vocabularies; one
  // without a side alternates, starting right, as Freeplane lays out an unpositioned map.
  const sides: { right: Topic[]; left: Topic[] } = { right: [], left: [] };
  let alternate = 0;
  for (const child of root.children) {
    const side = child.position?.toLowerCase();
    const left = side === 'left' || side === 'top_or_left' || (side !== 'right' && side !== 'bottom_or_right' && alternate++ % 2 === 1);
    (left ? sides.left : sides.right).push(child);
  }
  const middle = central.y + central.height / 2;
  column(sides.right, central.x + central.width + gapBeside(central.width), middle, true);
  column(sides.left, central.x - gapBeside(central.width), middle, false);
  return boxes;
}
