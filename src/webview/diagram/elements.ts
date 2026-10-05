import type { Box, ViewElement } from '../../core/frame/diagramType';
import { bannerOf, evenFractions, type Banner } from '../../core/diagram/shapes/segments';
import { outlineOf, type BuiltInShape } from '../../core/diagram/shapes/outline';
import type { ElementTypeDefinition, LabelDefinition } from './definition';
import { html, points, svg } from './dom';

// How the library draws one element from its type's definition: the shape, its segments when it
// has any, and its labels. Every outline carries `adp-node`, so every element is painted, selected
// and pointed at the same way; a diagram type's stylesheet only fills its own classes.

/** How far a label written before an element stands off from it. */
const labelGap = 8;

/** The segments of an element whose type has them, at the boundaries its data gives or spread evenly. */
export function bannerOfElement(type: ElementTypeDefinition, element: ViewElement): Banner | undefined {
  const segments = type.segments;
  if (!segments) return undefined;
  const count = Number(element.data[segments.count] ?? segments.names.length);
  const given = element.data[segments.boundaries] as number[] | undefined;
  return bannerOf(element, count, given && given.length === count - 1 ? given : evenFractions(count));
}

function outline(shape: BuiltInShape, box: Box): SVGElement {
  switch (shape) {
    case 'box': return svg('rect', { x: box.x, y: box.y, width: box.width, height: box.height, rx: 3 });
    case 'rounded-box': return svg('rect', { x: box.x, y: box.y, width: box.width, height: box.height, rx: Math.min(8, box.height / 2) });
    case 'pill': return svg('rect', { x: box.x, y: box.y, width: box.width, height: box.height, rx: box.height / 2 });
    case 'ellipse': return svg('ellipse', { cx: box.x + box.width / 2, cy: box.y + box.height / 2, rx: box.width / 2, ry: box.height / 2 });
    default: return svg('polygon', { points: points(outlineOf(shape, box)) });
  }
}

const textOf = (label: LabelDefinition, element: ViewElement): string => String((label.text === undefined ? undefined : element.data[label.text]) ?? element.label);

/** One element, as its type's definition draws it. */
export function drawElement(type: ElementTypeDefinition, element: ViewElement): SVGGElement {
  const classes = ['adp-element', type.className, ...(type.classWhen ?? []).filter((when) => element.data[when.data] === true).map((when) => when.className)];
  const group = svg('g', { class: classes.join(' '), 'data-id': element.id });

  const banner = bannerOfElement(type, element);
  if (banner && type.segments) {
    const segments = type.segments;
    const tooltips = (segments.tooltips ? (element.data[segments.tooltips] as string[] | undefined) : undefined) ?? [];
    for (const segment of banner.segments) {
      group.append(svg('polygon', { class: `adp-segment ${segments.classPrefix}${segments.names[segment.index] ?? ''}`, points: points(segment.polygon), 'data-segment': segment.index },
        tooltips[segment.index] === undefined ? undefined : svg('title', {}, tooltips[segment.index])));
    }
    for (const divider of banner.dividers) {
      group.append(svg('polyline', { class: 'adp-segment-divider', points: points(divider.points), 'data-boundary': divider.index }));
    }
  }

  // Segments are filled one by one, so the outline drawn over them is a line around the whole.
  const shape = outline(type.shape, element);
  shape.setAttribute('class', ['adp-node', banner ? 'adp-node-segmented' : undefined, type.shapeClassName].filter(Boolean).join(' '));
  if (element.tooltip) shape.append(svg('title', {}, element.tooltip));
  group.append(shape);

  const inside = (type.labels ?? []).filter((label) => label.placement === 'inside');
  if (inside.length > 0) {
    const text = svg('foreignObject', { x: element.x, y: element.y, width: element.width, height: element.height });
    text.append(html('div', { class: ['adp-text', type.textClassName].filter(Boolean).join(' ') },
      ...inside.map((label) => html('div', { class: label.className }, textOf(label, element)))));
    group.append(text);
  }
  for (const label of (type.labels ?? []).filter((candidate) => candidate.placement === 'before')) {
    group.append(svg('text', {
      class: ['adp-label', label.className].filter(Boolean).join(' '), x: element.x - labelGap, y: element.y + element.height / 2, 'text-anchor': 'end', 'dominant-baseline': 'central',
    }, textOf(label, element)));
  }
  return group;
}
