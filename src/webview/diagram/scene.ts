import { pathData, type PathCommand, type Point } from '../../core/scene/geometry';
import type { Scene, SceneBadge, SceneCompartment, SceneEdge, SceneLabel, SceneNode, ScenePart, SceneShape } from '../../core/scene/scene';
import { html, svg } from './dom';
import { iconPath } from './icons';

// A scene as SVG (etalii.adp spec 027, research R3 and R13): what a tool type read from its
// definition sends. Everything is placed by the scene; what is left to this host is the colour of
// each paint, which follows the editor's theme.

/** The kind of colour theme Visual Studio Code is in. */
export type ThemeKind = 'light' | 'dark' | 'high-contrast' | 'high-contrast-light';

/** The theme kind, from the class Visual Studio Code puts on the body; high contrast light carries the class of high contrast too. */
export function themeKind(): ThemeKind {
  const classes = document.body.classList;
  if (classes.contains('vscode-high-contrast-light')) return 'high-contrast-light';
  if (classes.contains('vscode-high-contrast')) return 'high-contrast';
  return classes.contains('vscode-dark') ? 'dark' : 'light';
}

type Tokens = Scene['tokens'];
type Style = SceneNode['style'];
type Role = 'fill' | 'line' | 'text';

// The editor's own colour for each role, and what both high contrast kinds draw lines and text in.
const editor: Readonly<Record<Role, string>> = { fill: 'var(--vscode-editor-background)', line: 'var(--vscode-editor-foreground)', text: 'var(--vscode-editor-foreground)' };
const contrast: Readonly<Partial<Record<Role, string>>> = { line: 'var(--vscode-contrastBorder)', text: 'var(--vscode-foreground)' };
const high = (kind: ThemeKind): boolean => kind === 'high-contrast' || kind === 'high-contrast-light';

/**
 * A paint as a CSS colour (research R13). A token is read in `light` for the light kinds and in
 * `dark` for the dark ones; one without a value there, and a paint that is absent, is the editor's
 * colour for the role. In high contrast a line and a text are the editor's, whatever the paint says.
 * The colour may be a `var()`, so it is set through `style` and never as an attribute.
 */
export function colourOf(tokens: Tokens, kind: ThemeKind, paint: unknown, role: Role): string {
  if (paint === 'none') return 'none';
  const forced = high(kind) ? contrast[role] : undefined;
  if (forced !== undefined) return forced;
  if (typeof paint === 'string') return paint;
  const token = typeof paint === 'object' && paint !== null ? (paint as { token?: unknown }).token : undefined;
  const value = typeof token === 'string' ? tokens?.[token]?.[kind === 'light' || kind === 'high-contrast-light' ? 'light' : 'dark'] : undefined;
  return typeof value === 'string' ? value : editor[role];
}

const number = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** How one scene is painted: its tokens in one theme kind. */
interface Paints {
  readonly kind: ThemeKind;
  colour(paint: unknown, role: Role): string;
}

// One shape with its style; nothing for a shape of the kind `none` or a style that is not visible.
function drawShape(shape: SceneShape, style: Style, paints: Paints): SVGElement | undefined {
  if (shape.kind === 'none' || style.visible === false) return undefined;
  const fill = paints.colour(style.fill, 'fill');
  let width = number(style.stroke?.width) ?? 1;
  let stroke = width > 0 ? paints.colour(style.stroke?.color, 'line') : 'none';
  // In high contrast nothing is told apart by its fill alone: what is filled is outlined.
  if (high(paints.kind) && stroke === 'none' && fill !== 'none') {
    stroke = paints.colour(undefined, 'line');
    width = width > 0 ? width : 1;
  }
  const look = {
    class: 'adp-shape', style: `fill: ${fill}; stroke: ${stroke}`,
    'stroke-width': stroke === 'none' ? undefined : width,
    'stroke-dasharray': Array.isArray(style.stroke?.dash) ? style.stroke.dash.join(' ') : undefined,
    'fill-opacity': number(style.fillOpacity), opacity: number(style.opacity),
  };
  const { x, y, width: w, height: h } = shape.box;
  if (shape.kind === 'ellipse') return svg('ellipse', { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, ...look });
  if (shape.kind === 'path') return svg('path', { d: pathData(shape.commands), 'fill-rule': shape.fillRule, ...look });
  const stated = number([style.cornerRadius ?? []].flat()[0]);
  const corner = shape.name === 'pill' ? Math.min(w, h) / 2 : stated ?? (shape.name === 'roundedRect' ? Math.min(8, w / 2, h / 2) : undefined);
  return svg('rect', { x, y, width: w, height: h, rx: corner, ...look });
}

function drawPart(part: ScenePart, paints: Paints): SVGElement | undefined {
  const drawn = drawShape(part.shape, part.style, paints);
  if (!drawn) return undefined;
  drawn.setAttribute('data-part', part.id);
  drawn.setAttribute('pointer-events', part.hit ? 'all' : 'none');
  if (part.tooltip) drawn.append(svg('title', {}, part.tooltip));
  return drawn;
}

/** How much of a node's width a text that is placed on it by a point, and must not run out of it, leaves free at each side. */
const textInset = 8;

// A label outside its node, or at a point of it, is its text, held where its alignment says; one
// inside is laid out in its box by the browser.
function drawLabel(label: SceneLabel, paints: Paints, node: SceneNode): SVGElement {
  const { box, style } = label;
  const colour = paints.colour(style.font?.color, 'text');
  const weight = style.font?.weight;
  // What a font says beside its size and weight: the space between its letters, in canvas units, and its case (DISL 6.6).
  const spacing = number(style.font?.letterSpacing);
  const lettering = [...(spacing === undefined ? [] : [`letter-spacing: ${spacing}px`]), ...(typeof style.font?.transform === 'string' ? [`text-transform: ${style.font.transform}`] : [])];
  const words = typeof label.position === 'string' ? label.position.split('-') : ['outside'];
  // A text at a point of its node that is one line and may not run on is kept within the node, cut off with an ellipsis where the label asks for one.
  const room = node.box.width - 2 * textInset;
  if (typeof label.position !== 'string' && label.wrap === 'none' && (label.overflow === 'ellipsis' || label.overflow === 'clip') && box.width > room && room > 0) {
    const look = ['text-align: center', `font-size: ${label.fontSize}px`, `color: ${colour}`, 'justify-content: center', ...(weight === undefined ? [] : [`font-weight: ${weight}`]), ...lettering];
    return svg('foreignObject', { class: label.tooltip === undefined ? 'adp-scene-label' : 'adp-scene-label adp-hover', 'data-label': label.id, x: node.box.x + textInset, y: box.y, width: room, height: box.height },
      label.tooltip === undefined ? undefined : svg('title', {}, label.tooltip),
      html('div', { class: label.overflow === 'ellipsis' ? 'adp-scene-text adp-ellipsis' : 'adp-scene-text', style: look.join('; ') }, html('span', {}, label.text)));
  }
  if (words[0] === 'outside') {
    const lines = label.text.split('\n');
    const x = label.align === 'start' ? box.x : label.align === 'end' ? box.x + box.width : box.x + box.width / 2;
    return svg('text', {
      class: 'adp-scene-label', 'data-label': label.id, 'text-anchor': label.align === 'center' ? 'middle' : label.align, 'font-size': label.fontSize, 'font-weight': weight, style: [`fill: ${colour}`, ...lettering].join('; '),
    }, ...lines.map((line, index) => svg('tspan', { x, y: box.y + ((index + 0.5) * box.height) / lines.length, 'dominant-baseline': 'central' }, line)));
  }
  const held = words.includes('top') ? 'flex-start' : words.includes('bottom') ? 'flex-end' : 'center';
  // simplified: a text too long for its box is cut off at the box's edge, but for a label of one line that asks for an ellipsis, which the browser gives it; any other `overflow`, and an ellipsis after several lines, needs the text measured here.
  const look = [
    `text-align: ${label.align}`, `font-size: ${label.fontSize}px`, `color: ${colour}`, `justify-content: ${held}`,
    ...(weight === undefined ? [] : [`font-weight: ${weight}`]),
    ...(label.wrap === 'none' ? ['white-space: pre'] : label.wrap === 'char' ? ['overflow-wrap: anywhere'] : []),
    ...(label.overflow === 'visible' ? ['overflow: visible'] : []), ...lettering,
  ];
  const oneLine = label.overflow === 'ellipsis' && label.maxLines === 1;
  // A label with a tooltip is what the pointer rests on to read it: the text in full.
  return svg('foreignObject', { class: label.tooltip === undefined ? 'adp-scene-label' : 'adp-scene-label adp-hover', 'data-label': label.id, x: box.x, y: box.y, width: box.width, height: box.height },
    label.tooltip === undefined ? undefined : svg('title', {}, label.tooltip),
    html('div', { class: oneLine ? 'adp-scene-text adp-ellipsis' : 'adp-scene-text', style: look.join('; ') }, oneLine ? html('span', {}, label.text) : label.text));
}

// An icon at a place of the canvas: a small group that takes the colour it is given, with a box the pointer reaches.
function drawIcon(name: string, x: number, y: number, size: number, colour: string, attributes: Record<string, string | number | undefined>, tooltip: string | undefined): SVGGElement {
  return svg('g', { ...attributes, transform: `translate(${x} ${y})` },
    tooltip === undefined ? undefined : svg('title', {}, tooltip),
    svg('rect', { class: 'adp-hit', width: size, height: size }),
    svg('path', { d: iconPath(name), transform: `scale(${size / 24})`, style: `fill: ${colour}` }));
}

// A badge at its corner of the node; one that runs an operation is a button (DISL 6.9).
function drawBadge(badge: SceneBadge, colour: string): SVGGElement {
  const button = badge.operation === undefined ? {} : { 'data-operation': badge.operation, role: 'button', tabindex: 0 };
  return drawIcon(badge.icon, badge.box.x, badge.box.y, badge.box.width, colour, { class: 'adp-badge', 'data-badge': badge.id, ...button }, badge.tooltip);
}

// A compartment: the line above it, then a row for each heading and each item. A heading is a
// button that folds its group; an item that is an element is selected under its own id; an item
// with a link ends in a link symbol that opens it (DISL 6.9).
function drawCompartment(compartment: SceneCompartment, node: SceneNode, paints: Paints): SVGGElement {
  const colour = paints.colour(node.style.font?.color, 'text');
  const fontSize = number(node.style.font?.size) ?? 14;
  const { box, separator } = compartment;
  const line = separator === undefined ? undefined : svg('line', {
    class: 'adp-separator', x1: box.x, y1: box.y, x2: box.x + box.width, y2: box.y, style: `stroke: ${paints.colour(separator.color, 'line')}`, 'stroke-width': number(separator.width) ?? 1,
  });
  let item = -1;
  const rows = compartment.rows.map((row) => {
    const { x, y, width, height } = row.box;
    const heading = row.kind === 'heading';
    if (!heading) item += 1;
    const inset = heading ? 20 : 12;
    const room = width - inset - (row.link === undefined ? 8 : 28);
    const text = heading && row.count !== undefined ? `${row.text} (${row.count})` : row.text;
    const attributes = heading
      ? { class: 'adp-row adp-heading', 'data-group': row.group, role: 'button', tabindex: 0, 'aria-expanded': String(row.collapsed !== true) }
      : { class: 'adp-row adp-item', 'data-id': row.element, 'data-item': item };
    return svg('g', attributes,
      svg('rect', { class: 'adp-hit', x, y, width, height }),
      // A heading carries a mark that points down while its group is open and to the side while it is folded.
      heading ? svg('path', { class: 'adp-chevron', d: row.collapsed === true ? `M ${x + 9} ${y + height / 2 - 4} l 4 4 l -4 4` : `M ${x + 7} ${y + height / 2 - 2} l 4 4 l 4 -4`, style: `stroke: ${colour}` }) : undefined,
      svg('foreignObject', { x: x + inset, y, width: Math.max(0, room), height },
        html('div', { class: 'adp-row-text', title: text, style: `font-size: ${heading ? fontSize - 1 : fontSize}px; color: ${colour}; line-height: ${height}px` }, text)),
      row.link === undefined ? undefined : drawIcon('mdi-link-variant', x + width - 22, y + (height - 14) / 2, 14, colour, { class: 'adp-link', 'data-link': '', role: 'link', tabindex: 0 }, row.link));
  });
  return svg('g', { class: 'adp-compartment', 'data-compartment': compartment.id }, line, ...rows);
}

function drawNode(node: SceneNode, paints: Paints): SVGGElement {
  const group = svg('g', { class: ['adp-element', ...(node.dimmed ? ['adp-dimmed'] : []), ...(node.pinned ? ['adp-pinned'] : [])].join(' '), 'data-id': node.id, 'data-type': node.type },
    node.tooltip ? svg('title', {}, node.tooltip) : undefined);
  const own = drawShape(node.shape, node.style, paints);
  own?.setAttribute('pointer-events', 'all');
  const text = paints.colour(node.style.font?.color, 'text');
  group.append(...[
    own, ...node.parts.map((part) => drawPart(part, paints)), ...node.labels.map((label) => drawLabel(label, paints, node)),
    ...node.compartments.map((compartment) => drawCompartment(compartment, node, paints)), ...node.badges.map((badge) => drawBadge(badge, text)),
  ].filter((drawn) => drawn !== undefined));
  // What a selection shows: a composite shape has no outline of its own to take the highlight.
  group.append(svg('rect', { class: 'adp-mark', x: node.box.x - 3, y: node.box.y - 3, width: node.box.width + 6, height: node.box.height + 6, rx: 3 }));
  // A node with children it can hide carries a marker at the middle of its lower edge: a plus when they are hidden, a minus when they are drawn.
  if (node.fold) {
    const cx = node.box.x + node.box.width / 2;
    const cy = node.box.y + node.box.height;
    const folded = node.fold === 'folded';
    group.append(svg('g', { class: 'adp-fold', 'data-fold': node.fold },
      svg('title', {}, folded ? 'Expand' : 'Collapse'),
      svg('circle', { cx, cy, r: 6 }),
      svg('path', { d: `M ${cx - 3} ${cy} L ${cx + 3} ${cy}${folded ? ` M ${cx} ${cy - 3} L ${cx} ${cy + 3}` : ''}` })));
  }
  return group;
}

// Every point a path names in its order, the control points among them.
function pointsAlong(path: readonly PathCommand[]): Point[] {
  return path.flatMap((step): Point[] => {
    if (step.op === 'Z') return [];
    const end = { x: step.x, y: step.y };
    return step.op === 'Q' ? [{ x: step.cx, y: step.cy }, end] : step.op === 'C' ? [{ x: step.c1x, y: step.c1y }, { x: step.c2x, y: step.c2y }, end] : [end];
  });
}

// A marker of DISL 6.11 with its tip on the last of the points a line runs through: an arrow, a
// triangle, a diamond or a circle, filled when its name says so. A name that is none of them is an arrow.
function drawMarker(name: string, end: 'source' | 'target', points: readonly Point[], colour: string, width: number): SVGElement | undefined {
  const tip = points.at(-1);
  // A control point that lies on the end says nothing of the way the line arrives: the one before it does.
  const before = points.slice(0, -1).reverse().find((point) => point.x !== tip?.x || point.y !== tip?.y);
  if (name === 'none' || name === '' || !tip || !before) return undefined;
  const length = Math.hypot(tip.x - before.x, tip.y - before.y);
  const along = { x: (tip.x - before.x) / length, y: (tip.y - before.y) / length };
  const size = 6 + 2 * width;
  // A point `back` behind the tip and `aside` of the line.
  const at = (back: number, aside: number): string => `${tip.x - along.x * back - along.y * aside},${tip.y - along.y * back + along.x * aside}`;
  const kind = name.toLowerCase();
  const filled = kind.includes('filled');
  const look = { 'data-marker': name, 'data-end': end, style: `fill: ${filled ? colour : 'none'}; stroke: ${colour}`, 'stroke-width': width, 'stroke-linejoin': 'round' };
  if (kind.includes('circle')) return svg('circle', { cx: tip.x - (along.x * size) / 2, cy: tip.y - (along.y * size) / 2, r: size / 2, ...look });
  if (kind.includes('diamond')) return svg('polygon', { points: [at(0, 0), at(size / 2, size / 3), at(size, 0), at(size / 2, -size / 3)].join(' '), ...look });
  if (filled || kind.includes('triangle')) return svg('polygon', { points: [at(0, 0), at(size, size / 2.5), at(size, -size / 2.5)].join(' '), ...look });
  return svg('polyline', { points: [at(size, size / 2.5), at(0, 0), at(size, -size / 2.5)].join(' '), ...look });
}

/** One edge of a scene as its group, in the colours of a theme kind: what the canvas draws again while an end of it is dragged along. */
export function drawEdge(edge: SceneEdge, scene: Scene, kind: ThemeKind): SVGGElement | undefined {
  return edgeGroup(edge, { kind, colour: (paint, role) => colourOf(scene.tokens, kind, paint, role) });
}

// An edge: a wide line the pointer reaches, its line, and the marker at each end. Nothing for an edge the scene hides.
function edgeGroup(edge: SceneEdge, paints: Paints): SVGGElement | undefined {
  if (edge.hidden !== undefined || edge.path.length === 0) return undefined;
  const d = pathData(edge.path);
  const width = number(edge.stroke.width) ?? 1;
  const colour = paints.colour(edge.stroke.color, 'line');
  const points = pointsAlong(edge.path);
  return svg('g', { class: 'adp-relation', 'data-id': edge.id, 'data-type': edge.type },
    svg('path', { class: 'adp-relation-hit', d }),
    svg('path', { class: 'adp-line', d, fill: 'none', style: `stroke: ${colour}`, 'stroke-width': width, 'stroke-dasharray': Array.isArray(edge.stroke.dash) ? edge.stroke.dash.join(' ') : undefined }),
    drawMarker(edge.sourceMarker, 'source', [...points].reverse(), colour, width),
    drawMarker(edge.targetMarker, 'target', points, colour, width));
}

/** A scene as the groups of the canvas's content: one for each drawn edge, then one for each node, so a node lies over the lines that reach it. */
export function drawScene(scene: Scene, kind: ThemeKind): SVGGElement[] {
  const paints: Paints = { kind, colour: (paint, role) => colourOf(scene.tokens, kind, paint, role) };
  return [...scene.edges.map((edge) => edgeGroup(edge, paints)).filter((group) => group !== undefined), ...scene.nodes.map((node) => drawNode(node, paints))];
}

/** The handles of a node that are visible, each named by its index among all of them, at a size that stays the same on the screen. */
export function drawHandles(node: SceneNode, zoom: number): SVGElement[] {
  return node.handles.flatMap((handle, index) => (handle.visible
    ? [svg('circle', { class: 'adp-handle', 'data-handle': index, cx: handle.x, cy: handle.y, r: 4 / zoom, style: `cursor: ${handle.axis === 'y' ? 'ns-resize' : handle.axis === 'x' ? 'ew-resize' : 'move'}` })]
    : []));
}
