import type { Box, ViewElement, ViewRelation } from '../../core/frame/diagramType';
import { attachmentPoint, bannerOf, evenFractions, type Attachment, type Point } from '../../core/gartner-hypecycle-graph/geometry';
import { phaseNames } from '../../core/gartner-hypecycle-graph/model';
import { html, points, svg } from '../canvas/dom';
import type { DrawContext, Notation } from '../canvas/notation';

// The Gartner hype cycle graph's notation: a trend as a right-pointing banner cut into the phases
// it has reached, a trigger as a circle with its name and date before it, a note as a box of
// wrapped text, and an influence as a curve that meets a trend's edge at a right angle.

const labelGap = 8;

/** The banner of a trend element: its phases at the boundaries the view gives, or spread evenly. */
export function bannerOfElement(element: ViewElement): ReturnType<typeof bannerOf> {
  const phases = element.data.phases as number;
  const given = element.data.boundaries as number[] | undefined;
  return bannerOf(element, phases, given && given.length === phases - 1 ? given : evenFractions(phases));
}

function labelBefore(element: Box, text: string): SVGTextElement {
  return svg('text', { class: 'adp-label', x: element.x - labelGap, y: element.y + element.height / 2, 'text-anchor': 'end', 'dominant-baseline': 'central' }, text);
}

function trend(element: ViewElement): SVGGElement {
  const banner = bannerOfElement(element);
  const tooltips = (element.data.phaseTooltips as string[] | undefined) ?? [];
  const group = svg('g', { class: 'adp-element ghg-trend', 'data-id': element.id });
  for (const segment of banner.segments) {
    group.append(svg('polygon', { class: `ghg-phase ghg-${phaseNames[segment.index]}`, points: points(segment.polygon), 'data-phase': segment.index },
      svg('title', {}, tooltips[segment.index] ?? '')));
  }
  for (const divider of banner.dividers) {
    group.append(svg('polyline', { class: 'ghg-chevron', points: points(divider.points), 'data-boundary': divider.index }));
  }
  group.append(svg('polygon', { class: 'adp-outline', points: points(banner.outline) }));
  group.append(labelBefore(element, String(element.data.labelText ?? element.label)));
  return group;
}

function trigger(element: ViewElement): SVGGElement {
  const radius = element.width / 2;
  return svg('g', { class: 'adp-element ghg-trigger', 'data-id': element.id },
    svg('circle', { class: 'ghg-trigger-circle adp-outline', cx: element.x + radius, cy: element.y + radius, r: radius }, svg('title', {}, element.tooltip ?? '')),
    labelBefore(element, String(element.data.labelText ?? element.label)));
}

function note(element: ViewElement): SVGGElement {
  const text = html('div', { class: 'ghg-note-text' }, element.label);
  const body = svg('foreignObject', { x: element.x, y: element.y, width: element.width, height: element.height });
  body.append(text);
  return svg('g', { class: 'adp-element ghg-note', 'data-id': element.id },
    svg('rect', { class: 'ghg-note-box adp-outline', x: element.x, y: element.y, width: element.width, height: element.height, rx: 2 }, svg('title', {}, element.tooltip ?? '')),
    body);
}

interface EndPoint {
  readonly point: Point;
  /** The direction the line leaves or enters in, perpendicular to the edge it attaches to. */
  readonly normal: Point;
}

function trendEnd(element: ViewElement, attachment: Attachment): EndPoint {
  return { point: attachmentPoint(attachment, element, bannerOfElement(element)), normal: { x: 0, y: attachment.edge === 'top' ? -1 : 1 } };
}

// A trigger offers three places to leave from: top, right and bottom. The line takes the one
// facing its target, so the document stores nothing for that end.
function triggerEnd(element: ViewElement, toward: Point): EndPoint {
  const radius = element.width / 2;
  const centre = { x: element.x + radius, y: element.y + radius };
  const candidates: EndPoint[] = [
    { point: { x: centre.x, y: centre.y - radius }, normal: { x: 0, y: -1 } },
    { point: { x: centre.x + radius, y: centre.y }, normal: { x: 1, y: 0 } },
    { point: { x: centre.x, y: centre.y + radius }, normal: { x: 0, y: 1 } },
  ];
  const distance = (end: EndPoint): number => Math.hypot(end.point.x - toward.x, end.point.y - toward.y);
  return candidates.reduce((best, candidate) => (distance(candidate) < distance(best) ? candidate : best));
}

/** The curve of an influence: a cubic Bézier leaving and entering perpendicular to its edges. */
export function influencePath(from: EndPoint, to: EndPoint): string {
  const reach = Math.min(120, Math.max(24, Math.hypot(to.point.x - from.point.x, to.point.y - from.point.y) / 2));
  const c1 = { x: from.point.x + from.normal.x * reach, y: from.point.y + from.normal.y * reach };
  const c2 = { x: to.point.x + to.normal.x * reach, y: to.point.y + to.normal.y * reach };
  return `M ${from.point.x} ${from.point.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.point.x} ${to.point.y}`;
}

/** Where an influence's two ends are drawn, or nothing when an end is not on the canvas. */
export function influenceEnds(relation: ViewRelation, context: DrawContext): { from: EndPoint; to: EndPoint } | undefined {
  const source = context.elements.get(relation.from);
  const target = context.elements.get(relation.to);
  if (!source || !target) return undefined;
  const targetAttachment = (relation.data.target as Attachment | undefined) ?? { edge: 'top', region: 0, at: 0.5 };
  const to = trendEnd(target, targetAttachment);
  const sourceAttachment = relation.data.source as Attachment | undefined;
  const from = source.type === 'trigger' || !sourceAttachment ? triggerEnd(source, to.point) : trendEnd(source, sourceAttachment);
  return { from, to };
}

function influence(relation: ViewRelation, context: DrawContext): SVGGElement | undefined {
  // Hidden, not removed: an influence attached to a phase its trend does not show stays in the document.
  if (relation.data.hidden === true) return undefined;
  const ends = influenceEnds(relation, context);
  if (!ends) return undefined;
  const d = influencePath(ends.from, ends.to);
  return svg('g', { class: 'adp-relation ghg-influence', 'data-id': relation.id },
    svg('path', { class: 'adp-relation-hit', d }),
    svg('path', { class: 'adp-relation-line', d, 'marker-end': 'url(#adp-arrow)' }));
}

export const gartnerHypecycleGraphNotation: Notation = {
  origin: 'gartner/hypecycle-graph',
  label: 'Gartner hype cycle graph',
  element(element) {
    switch (element.type) {
      case 'trigger': return trigger(element);
      case 'note': return note(element);
      default: return trend(element);
    }
  },
  relation: influence,
};