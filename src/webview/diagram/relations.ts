import { pathOf, type End } from '../../core/diagram/connectors';
import { centreOf, type Point } from '../../core/diagram/geometry';
import { attachmentPoint, nearestAttachment, type Attachment } from '../../core/diagram/shapes/segments';
import type { ViewElement, ViewRelation } from '../../core/frame/diagramType';
import type { DiagramDefinition, ElementTypeDefinition, RelationTypeDefinition } from './definition';
import { svg } from './dom';
import { bannerOfElement } from './elements';

// Where a relation's ends sit and the line between them, from the definitions of the two element
// types it joins and of its own type. An end that sits `along` an element is stored with the
// relation as an attachment, written `segment/edge/at` (such as `plateau/bottom/0.3`); the other
// kinds of anchor are worked out from where the other end is, so nothing is stored for them.

const compass: Record<'n' | 'e' | 's' | 'w', (box: ViewElement) => End> = {
  n: (box) => ({ point: { x: box.x + box.width / 2, y: box.y }, normal: { x: 0, y: -1 } }),
  e: (box) => ({ point: { x: box.x + box.width, y: box.y + box.height / 2 }, normal: { x: 1, y: 0 } }),
  s: (box) => ({ point: { x: box.x + box.width / 2, y: box.y + box.height }, normal: { x: 0, y: 1 } }),
  w: (box) => ({ point: { x: box.x, y: box.y + box.height / 2 }, normal: { x: -1, y: 0 } }),
};

/** The definition of an element's type; an unknown type is drawn as a plain box. */
export function elementTypeOf(definition: DiagramDefinition, element: ViewElement): ElementTypeDefinition {
  return definition.elementTypes.find((type) => type.id === element.type) ?? { id: element.type, shape: 'box', className: '' };
}

export function relationTypeOf(definition: DiagramDefinition, relation: ViewRelation): RelationTypeDefinition {
  return definition.relationTypes.find((type) => type.id === relation.type) ?? { id: relation.type, route: 'straight', selectable: true };
}

/** An attachment as a relation stores it: `segment/edge/at`. */
export function attachmentText(type: ElementTypeDefinition, attachment: Attachment): string {
  const names = type.segments?.names ?? [];
  return `${names[attachment.region] ?? names[0] ?? attachment.region}/${attachment.edge}/${Math.round(attachment.at * 100) / 100}`;
}

/** The attachment a stored text names, or nothing when it names none. */
export function attachmentOf(type: ElementTypeDefinition, text: string): Attachment | undefined {
  const [segment, edge, at] = text.split('/');
  if (at === undefined) return undefined;
  return { edge: edge === 'top' ? 'top' : 'bottom', region: Math.max(0, (type.segments?.names ?? []).indexOf(segment)), at: Number(at) };
}

/** Where on an element an end sits, toward a point at the other end. */
export function endOn(type: ElementTypeDefinition, element: ViewElement, attachment: Attachment | undefined, toward: Point): End {
  const anchors = type.anchors;
  if (anchors?.kind === 'along') {
    const at = attachment ?? { edge: 'top', region: 0, at: 0.5 };
    const banner = bannerOfElement(type, element);
    const point = banner ? attachmentPoint(at, element, banner) : { x: element.x + at.at * element.width, y: at.edge === 'top' ? element.y : element.y + element.height };
    return { point, normal: { x: 0, y: at.edge === 'top' ? -1 : 1 } };
  }
  if (anchors?.kind === 'compass') {
    const candidates = anchors.positions.map((position) => compass[position](element));
    const distance = (end: End): number => Math.hypot(end.point.x - toward.x, end.point.y - toward.y);
    return candidates.reduce((best, candidate) => (distance(candidate) < distance(best) ? candidate : best));
  }
  // The middle of the top or the bottom, whichever faces the other end.
  return toward.y >= centreOf(element).y ? compass.s(element) : compass.n(element);
}

/** Where a relation's two ends are drawn, or nothing when an end is not on the canvas. */
export function relationEnds(definition: DiagramDefinition, relation: ViewRelation, elements: ReadonlyMap<string, ViewElement>): { from: End; to: End } | undefined {
  const source = elements.get(relation.from);
  const target = elements.get(relation.to);
  if (!source || !target) return undefined;
  const sourceType = elementTypeOf(definition, source);
  const targetType = elementTypeOf(definition, target);
  // An end stored on its element is placed first; an end worked out from the other is placed toward it.
  let to = endOn(targetType, target, relation.data.target as Attachment | undefined, centreOf(source));
  const from = endOn(sourceType, source, relation.data.source as Attachment | undefined, to.point);
  if (targetType.anchors?.kind !== 'along') to = endOn(targetType, target, undefined, from.point);
  return { from, to };
}

/** One relation, as its type's definition draws it; nothing when it is hidden or an end is not on the canvas. */
export function drawRelation(definition: DiagramDefinition, relation: ViewRelation, elements: ReadonlyMap<string, ViewElement>): SVGGElement | undefined {
  const type = relationTypeOf(definition, relation);
  if (type.hiddenWhen !== undefined && relation.data[type.hiddenWhen] === true) return undefined;
  const ends = relationEnds(definition, relation, elements);
  if (!ends) return undefined;
  const d = pathOf(type.route, ends.from, ends.to);
  return svg('g', { class: ['adp-relation', type.selectable ? undefined : 'adp-unselectable', type.className].filter(Boolean).join(' '), 'data-id': relation.id },
    type.selectable ? svg('path', { class: 'adp-relation-hit', d }) : undefined,
    svg('path', { class: 'adp-relation-line', d, 'marker-end': 'url(#adp-arrow)' }));
}

/**
 * Whether a press at a point of an element starts a relation: the attachment it would leave from
 * for an `along` anchor, empty for a `compass` one, and nothing when the press moves the element.
 */
export function connectFrom(type: ElementTypeDefinition, element: ViewElement, point: Point): string | undefined {
  const anchors = type.anchors;
  if (anchors?.kind === 'along') {
    const nearEdge = Math.min(Math.abs(point.y - element.y), Math.abs(point.y - (element.y + element.height))) <= anchors.band;
    const banner = bannerOfElement(type, element);
    return nearEdge && banner ? attachmentText(type, nearestAttachment(point, element, banner)) : undefined;
  }
  if (anchors?.kind === 'compass') {
    const reach = Math.min(element.width, element.height) / 4;
    return anchors.positions.some((position) => {
      const end = compass[position](element).point;
      return Math.hypot(end.x - point.x, end.y - point.y) <= reach;
    }) ? '' : undefined;
  }
  return undefined;
}

/** Where on an element a relation let go at a point arrives, when its anchor stores that. */
export function connectTo(type: ElementTypeDefinition, element: ViewElement, point: Point): string | undefined {
  const banner = type.anchors?.kind === 'along' ? bannerOfElement(type, element) : undefined;
  return banner ? attachmentText(type, nearestAttachment(point, element, banner)) : undefined;
}

/** The line shown while a relation is drawn from an element to the pointer. */
export function drawConnecting(definition: DiagramDefinition, from: ViewElement, fromEnd: string, to: Point): SVGElement {
  const type = elementTypeOf(definition, from);
  const start = endOn(type, from, fromEnd.length > 0 ? attachmentOf(type, fromEnd) : undefined, to);
  // The loose end has no edge yet, so it arrives along the line from where it left.
  const end: End = { point: to, normal: { x: 0, y: to.y >= start.point.y ? -1 : 1 } };
  const route = definition.relationTypes[0]?.route ?? 'straight';
  return svg('path', { class: 'adp-relation-line adp-connecting', d: pathOf(route, start, end), 'marker-end': 'url(#adp-arrow)' });
}
