// A model as a scene: every node placed with its shape, its parts and its labels, and every edge
// with its two ends and its line, through the interpreted notation, coordinates, layout and
// viewpoint of a specification. A scene is plain data in canvas units at zoom 1, ready to be drawn
// and to be hit; it holds nothing of the page it is drawn on.

import {
  boxOutline, centreOf, cubicBetween, cubicPath, distance, leaving, movedPath, normalAt, normalOf, pathOutline, pointIn, pointOn, sideAt, sides, union,
  type Box, type Cubic, type Outline, type PathCommand, type Point, type Side,
} from './geometry';
import { scalesOf, type Coordinates, type PlacementSource } from '../disl/coordinates';
import type { Expressions, Scope } from '../disl/expressions';
import { assignRows, packAlongRows, type LayoutConfig, type LayoutPlugin, type PackedItem, type RowItem } from '../disl/layout';
import { allowsEnd, attributesOf, defaultOf, isA, isRelation, valueKind, type Metamodel } from '../disl/metamodel';
import { finding, type Finding, type Model, type ModelElement, type ModelRelation, type Value } from '../disl/model';
import {
  builtInShapes, defaultFontSize, defaultSize, edgeNotation, lineHeight, merged, nodeNotation, styleOf, textWidth,
  type AnchorPoint, type CustomShape, type EdgeNotation, type EndAnchor, type GeomBox, type GeomExpr, type Label, type NodeNotation, type Paint, type PathDef,
  type Position, type ShapeRef, type Stroke, type Style,
} from '../disl/notation';
import { isCel, isObject, localized, type Expression } from '../disl/specification';
import type { Viewpoint, Viewpoints } from '../disl/viewpoints';

// ---- what a scene is made from ----

/** A specification, interpreted section by section. */
export interface SceneTool {
  readonly metamodel: Metamodel;
  readonly expressions: Expressions;
  readonly coordinates: Coordinates;
  /** Each viewpoint with the notation and the layout it draws with. */
  readonly viewpoints: Viewpoints;
  /** The layout plugin of an id, for a layout named `plugin:<id>` (DISL 13.1). */
  layouts?(id: string): LayoutPlugin | undefined;
}

export interface SceneOptions {
  /** The viewpoint to draw; the default one when absent. */
  readonly viewpoint?: string;
  /** The value of each filter that is not at its default, and whether an element must match any or all of it. */
  readonly filters?: Readonly<Record<string, { readonly value?: Value; readonly match?: 'any' | 'all' }>>;
  /** Members of `env` (DISL 12.2), such as `mode`, `zoom` and `readOnly`. */
  readonly env?: Scope;
  /** The nodes that are folded for this viewer, by id (DISL 11.6): the children of one are not drawn. */
  readonly collapsed?: Readonly<Record<string, boolean>>;
  /** The host's measure of a text, for a specification whose text metric is `host`. */
  textWidth?(text: string, fontSize: number): number;
}

// ---- what a scene is ----

/** A shape with its numbers worked out, in canvas units. */
export type SceneShape =
  | { readonly kind: 'rect' | 'ellipse' | 'none'; readonly name: string; readonly box: Box }
  | { readonly kind: 'path'; readonly name: string; readonly box: Box; readonly commands: readonly PathCommand[]; readonly fillRule?: 'nonzero' | 'evenodd' };

export interface ScenePart {
  readonly id: string;
  readonly box: Box;
  readonly shape: SceneShape;
  /** The part's style over the node's; a paint may still be a theme token. */
  readonly style: Style;
  readonly hit: boolean;
  /** An end of an edge may be anchored on this part (DISL 6.10). */
  readonly anchor?: boolean;
  readonly tooltip?: string;
}

export interface SceneHandle {
  readonly param: string;
  readonly x: number;
  readonly y: number;
  readonly axis: 'x' | 'y' | 'both' | 'radial';
  readonly visible: boolean;
}

export interface SceneLabel {
  readonly id: string;
  /** The text drawn, and the text an editor in place starts with (DISL 6.12). */
  readonly text: string;
  readonly editText: string;
  /** Where the text goes: the text itself outside the node, the area it is laid out in inside it. */
  readonly box: Box;
  readonly position: Position;
  /** Where in its box the text is held: at its start, its middle or its end. */
  readonly align: 'start' | 'center' | 'end';
  readonly fontSize: number;
  readonly style: Style;
  readonly editable: false | 'inline' | 'multiline' | 'form';
  readonly wrap: 'none' | 'word' | 'char';
  readonly overflow: 'visible' | 'clip' | 'ellipsis' | 'shrink';
}

export interface SceneNode {
  readonly id: string;
  readonly type: string;
  readonly box: Box;
  /** The coordinate system the node is placed in. */
  readonly system: string;
  readonly shape: SceneShape;
  /** What an edge attaches to and a pointer hits. */
  readonly outline: Outline;
  readonly style: Style;
  /** The values of the shape's parameters. */
  readonly params: Readonly<Record<string, Value>>;
  /** The drawn parts of a composite shape, the undermost first. */
  readonly parts: readonly ScenePart[];
  readonly handles: readonly SceneHandle[];
  readonly labels: readonly SceneLabel[];
  readonly tooltip?: string;
  readonly movable: { readonly x: boolean; readonly y: boolean };
  readonly resizable: { readonly x: boolean; readonly y: boolean };
  readonly connectable: boolean;
  readonly selectable: boolean;
  readonly deletable: boolean;
  /** A filter whose effect is `dim` filters the node out (DISL 6.13.1). */
  readonly dimmed: boolean;
  /** The node has children it can hide: `folded` when they are hidden, `unfolded` when they are drawn. Absent on a node that cannot be folded. */
  readonly fold?: 'folded' | 'unfolded';
}

export interface SceneEnd {
  readonly node: string;
  readonly x: number;
  readonly y: number;
  /** The side of the node, or of the part, the end sits on. */
  readonly side: Side;
  /** The unit vector the line leaves the element along. */
  readonly normal: Point;
  /** For an end on a part: the part and how far along its side. */
  readonly part?: string;
  readonly at?: number;
  /** The end names no place the node has, so it is drawn at the first place it could name. */
  readonly fallback?: boolean;
  /** For an end at a fixed anchor: the anchor. */
  readonly anchor?: string;
}

export interface SceneEdge {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly target: string;
  /** Not drawn: an end is on a part its node does not draw, or an end's node is filtered out. */
  readonly hidden?: 'part' | 'filter';
  readonly from?: SceneEnd;
  readonly to?: SceneEnd;
  readonly routing: string;
  /** The line: a curve for a `bezier` routing, and always its path. */
  readonly curve?: Cubic;
  readonly path: readonly PathCommand[];
  readonly stroke: Stroke;
  readonly sourceMarker: string;
  readonly targetMarker: string;
}

export interface Scene {
  readonly viewpoint: string;
  readonly system: string;
  /** The drawn nodes and the edges between them, in model order. */
  readonly nodes: readonly SceneNode[];
  readonly edges: readonly SceneEdge[];
  /** The nodes a filter hides. */
  readonly filtered: readonly string[];
  /** The box around every node, when there is one. */
  readonly bounds?: Box;
  /** What could not be drawn as the specification says. */
  readonly findings: readonly Finding[];
  // What follows is set by the tool type that shows the scene; `createScene` leaves it out.
  /** True when nothing that edits may be offered. */
  readonly readOnly?: boolean;
  /** Why the diagram is read-only or empty, when there is something to say. */
  readonly notice?: string;
  /**
   * Every token of the theme, with its value in each of the two modes (DISL 6.2). A paint
   * `{ token }` in a style is looked up here, in the mode of the page that draws. A mode that is
   * absent has no value for the token: the page's own colour for the role is used.
   */
  readonly tokens?: Readonly<Record<string, SceneToken>>;
  /** What the notation shows around the drawing. */
  readonly chrome?: SceneChrome;
}

export interface SceneToken {
  readonly light?: string | number;
  readonly dark?: string | number;
}

/** What is drawn outside the drawing and is no element (DISL 5.13, 6.13): it names nothing but ids. */
export interface SceneChrome {
  readonly rulers: readonly SceneRuler[];
  readonly filters: readonly SceneFilter[];
  /** One for each variant of the default viewpoint (DISL 3.5). */
  readonly toggles: readonly SceneToggle[];
  readonly legend: readonly SceneLegendEntry[];
  /** The background of the canvas, only where the specification states one. */
  readonly background?: Paint;
}

export interface SceneRuler {
  /** The axis of the scene the ruler runs along. */
  readonly axis: 'x' | 'y';
  readonly position: 'top' | 'bottom' | 'left' | 'right';
  /** The breadth of one row, in pixels. */
  readonly size: number;
  /** `view`: it stays at its edge of what is shown. `canvas`: it scrolls with the drawing. */
  readonly attach: 'view' | 'canvas';
  /** The levels, the finest first. The one drawn is the first whose `spacing` times the zoom is at least `minSpacing`, within `minZoom` and `maxZoom`. */
  readonly levels: readonly SceneRulerLevel[];
}

export interface SceneRulerLevel {
  /** Canvas units between two ticks. */
  readonly spacing: number;
  /** The fewest pixels of the screen between two ticks at which the level is drawn. */
  readonly minSpacing: number;
  readonly minZoom?: number;
  readonly maxZoom?: number;
  /** The ticks in the part in view, or within the scene's bounds when no part is named; 2000 at most. `at` is in canvas units along the axis. */
  readonly ticks: readonly { readonly at: number; readonly label: string }[];
}

export interface SceneFilter {
  readonly id: string;
  readonly label: string;
  readonly control: 'chips' | 'switch' | 'select' | 'search';
  /** What there is to choose from. */
  readonly options: readonly string[];
  /** The value in use: the one the view keeps, else the specification's default. */
  readonly value: Value;
  readonly match: 'any' | 'all';
  /** Whether the user may change `match`. */
  readonly matchToggle: boolean;
}

export interface SceneToggle {
  /** The viewpoint the toggle turns on: what the view is asked for by. */
  readonly viewpoint: string;
  readonly label: string;
  readonly on: boolean;
}

export interface SceneLegendEntry {
  /** `<enum>.<value>` for a value of an enum, or the name of a type. */
  readonly id: string;
  readonly label: string;
  readonly fill?: Paint;
}

// ---- the scene ----

interface Placed {
  readonly element: ModelElement;
  readonly notation: NodeNotation;
  readonly system: string;
  box: Box;
  /** The axes a layout places. */
  readonly layout: { readonly x: boolean; readonly y: boolean };
  /** The element's own row: its top in the units of the y axis. */
  readonly row: number;
}

const number = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const fractions: Readonly<Record<string, number>> = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };

/** A padding as its four sides: top, right, bottom, left. */
function sidesOf(padding: Style['padding']): readonly [number, number, number, number] {
  const given = [padding ?? 0].flat() as number[];
  return given.length === 1 ? [given[0], given[0], given[0], given[0]] : given.length === 2 ? [given[0], given[1], given[0], given[1]] : [given[0], given[1], given[2] ?? given[0], given[3] ?? given[1]];
}

/**
 * An elliptical arc from a point to a point, as SVG's `A` states it, as cubic curves: one for each
 * quarter turn or part of one. Radii too small to reach are scaled up, as SVG does.
 */
function arcCommands(from: Point, rx: number, ry: number, rotation: number, large: boolean, sweep: boolean, to: Point): PathCommand[] {
  if (!(rx > 0) || !(ry > 0) || (from.x === to.x && from.y === to.y)) return [{ op: 'L', x: to.x, y: to.y }];
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const reach = Math.sqrt(Math.max(1, (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)));
  const a = rx * reach;
  const b = ry * reach;
  const over = a * a * y1 * y1 + b * b * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (a * a * b * b - over) / over));
  const cx1 = (k * a * y1) / b;
  const cy1 = (-k * b * x1) / a;
  const centre = { x: cos * cx1 - sin * cy1 + (from.x + to.x) / 2, y: sin * cx1 + cos * cy1 + (from.y + to.y) / 2 };
  const angle = (ux: number, uy: number, vx: number, vy: number): number => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angle(1, 0, (x1 - cx1) / a, (y1 - cy1) / b);
  let turn = angle((x1 - cx1) / a, (y1 - cy1) / b, (-x1 - cx1) / a, (-y1 - cy1) / b);
  if (!sweep && turn > 0) turn -= 2 * Math.PI;
  else if (sweep && turn < 0) turn += 2 * Math.PI;
  const pieces = Math.max(1, Math.ceil(Math.abs(turn) / (Math.PI / 2) - 1e-9));
  const step = turn / pieces;
  const handle = (4 / 3) * Math.tan(step / 4);
  const at = (t: number): Point => ({ x: centre.x + a * Math.cos(t) * cos - b * Math.sin(t) * sin, y: centre.y + a * Math.cos(t) * sin + b * Math.sin(t) * cos });
  const along = (t: number): Point => ({ x: -a * Math.sin(t) * cos - b * Math.cos(t) * sin, y: -a * Math.sin(t) * sin + b * Math.cos(t) * cos });
  return Array.from({ length: pieces }, (_, index): PathCommand => {
    const t0 = start + index * step;
    const t1 = t0 + step;
    const end = index === pieces - 1 ? to : at(t1);
    return { op: 'C', c1x: at(t0).x + handle * along(t0).x, c1y: at(t0).y + handle * along(t0).y, c2x: at(t1).x - handle * along(t1).x, c2y: at(t1).y - handle * along(t1).y, x: end.x, y: end.y };
  });
}

/** Computes the scene of a model in a viewpoint. It never throws: what cannot be drawn is left out or drawn by a default, and found. */
export function createScene(tool: SceneTool, model: Model, options: SceneOptions = {}): Scene {
  const { metamodel, expressions } = tool;
  const viewpoint = tool.viewpoints.all[options.viewpoint ?? ''] ?? tool.viewpoints.all[tool.viewpoints.default];
  const notation = viewpoint.notation;
  const views = new Map<string, Scope>();
  // `self.view` (DISL 12.2): where the element is drawn, once that is known, and whether this viewer folded it.
  const world = expressions.over(model, { env: { viewpoint: viewpoint.name, ...options.env }, view: (id) => ({ ...views.get(id), collapsed: options.collapsed?.[id] === true }) });
  const locale = typeof options.env?.locale === 'string' ? options.env.locale : undefined;
  const elements = new Map<string, ModelElement | ModelRelation>([...model.relations, ...model.elements].map((element) => [element.id, element]));

  // One finding for each expression that fails, however many elements it fails for (DISL 2.5).
  const found = new Map<string, Finding>();
  const report = (key: string, message: string, element?: string): void => {
    if (!found.has(key)) found.set(key, finding('disl.scene', 'warning', message, element === undefined ? {} : { element }));
  };

  // ---- values ----

  const run = (expression: Expression, self: string | undefined, more?: Scope): Value | undefined => {
    const result = expressions.evaluate(expression, world.scope(self, more));
    if (result.ok) return result.value;
    const cel = typeof expression === 'string' ? expression : expression.cel;
    const type = self === undefined ? undefined : elements.get(self)?.type;
    report(`${type ?? ''}:${cel}`, `\`${cel}\` could not be evaluated${type === undefined ? '' : ` for an element of the type \`${type}\``}, so a default is used: ${result.error}`, self);
    return undefined;
  };

  // The value an attribute reads as: the stored one, else its default, else nothing.
  const stored = (element: ModelElement, path: string): Value | undefined => {
    const [name, ...rest] = path.split('.');
    const attributes = name === undefined ? {} : attributesOf(metamodel, element.type);
    let value: Value | undefined = Object.hasOwn(element.attributes, name) ? element.attributes[name] : Object.hasOwn(attributes, name) ? defaultOf(attributes[name]) : undefined;
    for (const step of rest) value = isObject(value) ? (value as Record<string, Value>)[step] : undefined;
    return value;
  };

  // A Bindable (DISL 2.5b). A theme token stays a token: the mode it is looked up in is the drawing's.
  const bound = (value: unknown, self: string, more?: Scope): Value | undefined => {
    if (isCel(value)) return run(value, self, more);
    if (!isObject(value)) return value as Value | undefined;
    if (typeof value.attribute === 'string') return stored(elements.get(self)!, value.attribute);
    if (typeof value.param === 'string') return isObject(more?.params) ? (more.params as Record<string, Value>)[value.param] : undefined;
    return value as Value;
  };

  // A style with every computed value worked out.
  const settled = <T>(value: T, self: string): T => {
    if (Array.isArray(value)) return value.map((item) => settled(item as unknown, self)) as T;
    if (!isObject(value)) return value;
    if (isCel(value) || typeof value.attribute === 'string') return bound(value, self) as T;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, settled(item, self)])) as T;
  };

  const message = (value: unknown, self: string, more?: Scope): string | undefined => {
    if (value === undefined) return undefined;
    if (isCel(value)) return String(run(value, self, more) ?? '');
    return typeof value === 'string' ? value : isObject(value) ? localized(value as Record<string, string>, locale) : undefined;
  };

  const flag = (value: unknown, self: string, fallback: boolean): boolean => {
    const result = bound(value, self);
    return typeof result === 'boolean' ? result : fallback;
  };

  // A notation with the variants that hold laid over it, in their order (DISL 6.9).
  const varied = <T extends { readonly variants: readonly { readonly when: Expression }[] }>(base: T, self: string): T =>
    base.variants.reduce<T>((under, { when, ...own }) => (run(when, self) === true ? merged(under, own) : under), base);

  // ---- nodes: where each one is ----

  const diagram = { ...Object.fromEntries(Object.entries(metamodel.diagram).flatMap(([name, attribute]) => (defaultOf(attribute) === undefined ? [] : [[name, defaultOf(attribute)!]]))), ...model.diagram };

  // The size of what a node holds (DISL 6.9, `autoSize`): its first label that stands inside it, by the text metric, and its padding around that.
  const content = (own: NodeNotation, self: string): readonly [number, number] => {
    const style = settled(styleOf(notation, own.style), self);
    const label = own.labels.find((candidate) => typeof (candidate.position ?? 'center') === 'string' && !String(candidate.position ?? 'center').startsWith('outside'));
    const within = label ? settled(styleOf(notation, { font: style.font }, label.style), self) : style;
    const fontSize = number(within.font?.size) ?? defaultFontSize;
    const lines = String((label && bound(label.text, self)) ?? '').split('\n');
    const [top, right, bottom, left] = sidesOf(style.padding);
    return [
      Math.max(...lines.map((line) => textWidth(notation.textMetric, line, fontSize, options.textWidth))) + left + right,
      lines.length * lineHeight(notation.textMetric, fontSize, within.font) + top + bottom,
    ];
  };

  const placed = (element: ModelElement, own: NodeNotation, defaultSystem: string): Placed | undefined => {
    const placement = own.placement;
    const system = tool.coordinates.systems[placement.system ?? defaultSystem] ?? tool.coordinates.systems[tool.coordinates.default];
    if (placement.system !== undefined && system.name !== placement.system) report(`system:${placement.system}`, `A node of the type \`${element.type}\` is placed in the coordinate system \`${placement.system}\`, which is not declared; \`${system.name}\` is used.`);
    const scales = scalesOf(system, diagram);

    // A coordinate in the units of its axis: nothing when its attribute holds none, so the node cannot be placed.
    const source = (from: PlacementSource | undefined): number | undefined | 'layout' => {
      if (from === undefined || from === 'free') return 0;
      if (isCel(from)) return number(run(from, element.id));
      if ('layout' in from) return 'layout';
      const value = number(stored(element, from.attribute));
      return value === undefined ? undefined : value + (typeof from.offset === 'number' ? from.offset : 0);
    };
    const along = (axis: 'x' | 'y'): { at: number; extent: number; layout: boolean } | undefined => {
      const index = axis === 'x' ? 0 : 1;
      const scale = scales[axis];
      const start = source(placement[axis]);
      if (start === undefined) return undefined;
      const at = start === 'layout' ? 0 : scale.toCanvas(start);
      const end = placement[axis === 'x' ? 'x2' : 'y2'];
      const span = placement[axis === 'x' ? 'width' : 'height'];
      let extent: number | undefined;
      if (end !== undefined && start !== 'layout') {
        const value = source(end);
        if (typeof value !== 'number') return undefined;
        extent = scale.toCanvas(value) - at;
      } else if (span !== undefined) {
        const value = source(span);
        if (typeof value !== 'number') return undefined;
        extent = Math.abs(value * scale.perUnit);
      } else {
        const size = own.size;
        const custom = customOf(own.shape);
        const stated = number(bound(axis === 'x' ? size.width : size.height, element.id));
        const limit = (value: number): number => Math.min(Math.max(value, size.min?.[index] ?? -Infinity), size.max?.[index] ?? Infinity);
        const fitted = size.autoSize === 'fitContent' || size.autoSize === (axis === 'x' ? 'fitWidth' : 'fitHeight') ? content(own, element.id)[index] : undefined;
        extent = size.fixed?.[index] ?? limit(fitted ?? stated ?? size.default?.[index] ?? custom?.defaultSize?.[index] ?? defaultSize[index]);
      }
      return { at, extent, layout: start === 'layout' };
    };
    const x = along('x');
    const y = along('y');
    // A node without a width or a height has nothing to draw.
    if (!x || !y || !(x.extent > 0) || !(y.extent > 0)) return undefined;
    const anchor = placement.anchor ?? 'top-left';
    const [fx, fy] = typeof anchor === 'string'
      ? [fractions[anchor.split('-').find((word) => word === 'left' || word === 'right') ?? 'center'], fractions[anchor.split('-').find((word) => word === 'top' || word === 'bottom') ?? 'center']]
      : anchor;
    const box = { x: x.at - fx * x.extent, y: y.at - fy * y.extent, width: x.extent, height: y.extent };
    return { element, notation: own, system: system.name, box, layout: { x: x.layout, y: y.layout }, row: Math.floor(scales.y.toValue(box.y) + 1e-9) };
  };

  const customOf = (ref: ShapeRef): CustomShape | undefined => {
    const name = typeof ref === 'string' ? ref : 'type' in ref ? ref.type : undefined;
    return name !== undefined && Object.hasOwn(notation.shapes, name) ? notation.shapes[name] : undefined;
  };

  // Viewpoint membership (DISL 6.1, step 1), then the placement of each member.
  const member = (element: ModelElement, of: Viewpoint): boolean => {
    const type = metamodel.types[element.type];
    if (!type || isRelation(type)) return false;
    if (of.include && !of.include.some((name) => isA(metamodel, element.type, name))) return false;
    if (of.exclude.some((name) => isA(metamodel, element.type, name))) return false;
    return of.members === undefined || run(of.members, element.id) !== false;
  };
  const placedIn = (of: Viewpoint): Map<string, Placed> => {
    const result = new Map<string, Placed>();
    for (const element of model.elements) {
      if (!member(element, of)) continue;
      const place = placed(element, varied(nodeNotation(of.notation, metamodel, element.type), element.id), of.coordinateSystem);
      if (place) result.set(element.id, place);
    }
    return result;
  };
  const places = placedIn(viewpoint);

  // ---- filters (DISL 6.13.1) ----

  const filtered = new Set<string>();
  const dimmed = new Set<string>();
  for (const filter of Object.values(notation.canvas.filters)) {
    const state = options.filters?.[filter.id];
    const value = state?.value ?? (isCel(filter.default) ? run(filter.default, undefined) : filter.default) ?? null;
    const scope = { value, match: state?.match ?? filter.match.default };
    for (const { element } of places.values()) {
      if (filter.appliesTo && !filter.appliesTo.some((type) => isA(metamodel, element.type, type))) continue;
      if (run(filter.keep, element.id, scope) !== false) continue;
      (filter.effect === 'dim' ? dimmed : filtered).add(element.id);
    }
  }
  for (const id of filtered) places.delete(id);

  // ---- folds (DISL 6.9, 11.6) ----

  // A node whose container can be collapsed and that holds something can be folded; what is under a folded one is not drawn.
  const folds = new Map<string, 'folded' | 'unfolded'>();
  for (const [id, place] of places) {
    if (place.notation.container?.collapsible === true && model.elements.some((child) => child.parent === id && places.has(child.id))) folds.set(id, options.collapsed?.[id] === true ? 'folded' : 'unfolded');
  }
  for (const { element } of [...places.values()]) {
    for (let parent = element.parent, seen = 0; parent !== undefined && seen < model.elements.length; parent = elements.get(parent)?.parent, seen++) {
      if (folds.get(parent) === 'folded') places.delete(element.id);
    }
  }

  // ---- layout (DISL 10) ----

  const config = viewpoint.layout;
  const laid = [...places.values()].filter((place) => place.layout.x || place.layout.y);
  const plugin = config?.plugin === undefined ? undefined : tool.layouts?.(config.plugin);
  if (plugin && config) {
    // The plugin is given what is drawn and nothing of a fold: it places, and may size, the nodes it names.
    const drawn = (id: string | undefined): boolean => id !== undefined && places.has(id);
    try {
      const at = plugin.place({
        model: { diagram: model.diagram, elements: model.elements.filter((element) => drawn(element.id)), relations: model.relations.filter((relation) => drawn(relation.source) && drawn(relation.target)) },
        sizes: Object.fromEntries([...places].map(([id, place]) => [id, { width: place.box.width, height: place.box.height }])),
        spacing: config.spacing, options: config.options,
      });
      for (const [id, place] of places) {
        if (Object.hasOwn(at, id)) place.box = { x: at[id].x, y: at[id].y, width: at[id].width ?? place.box.width, height: at[id].height ?? place.box.height };
      }
    } catch (failure) {
      report('layout', `The layout \`${config.name}\` failed, so the nodes stay where they are: ${failure instanceof Error ? failure.message : String(failure)}`);
    }
  } else if (laid.length > 0 && !(config?.rowPacked && config.direction === 'right')) {
    report('layout', `The viewpoint \`${viewpoint.name}\` leaves places to a layout, and ${config ? `its layout \`${config.name}\` is one this add-on does not run` : 'it names none'}; those nodes are placed at the origin.`);
  } else if (config?.rowPacked && laid.length > 0) {
    const options = config.rowPacked;
    // `order: "start"` is by the placement of the viewpoint this one varies (DISL 10.1).
    const base = viewpoint.variantOf === undefined ? undefined : placedIn(tool.viewpoints.all[viewpoint.variantOf]);
    const packed = laid.filter((place) => place.layout.x);
    const items = packed.map((place): PackedItem => ({
      id: place.element.id,
      row: place.row,
      rows: options.rowsCovered === undefined ? 1 : Math.max(1, number(run(options.rowsCovered, place.element.id)) ?? 1),
      size: place.box.width,
      start: base?.get(place.element.id)?.box.x,
    }));
    const follows = options.followConnections;
    const connections = follows === undefined ? [] : model.relations
      .filter((relation) => isA(metamodel, relation.type, follows) && relation.source !== undefined && relation.target !== undefined)
      .map((relation) => [relation.source!, relation.target!] as const);
    const positions = packAlongRows(items, connections, options);
    for (const place of packed) place.box = { ...place.box, x: positions.get(place.element.id) ?? 0 };
  }

  for (const place of places.values()) {
    const { x, y, width, height } = place.box;
    views.set(place.element.id, { bounds: { x, y, width, height, x2: x + width, y2: y + height }, selected: false });
  }

  // ---- nodes: what each one draws ----

  const measure = (text: string, fontSize: number): number => textWidth(notation.textMetric, text, fontSize, options.textWidth);

  // The parts an end of an edge may name (DISL 6.10): the values of the enum its `part` is bound to, or any part where it is bound to none.
  const anchorParts = new Set<string>();
  let anchorsAny = false;
  for (const type of Object.values(metamodel.types)) {
    if (!isRelation(type)) continue;
    const own = edgeNotation(notation, metamodel, type.name);
    for (const anchor of [own.anchoring, ...own.variants.map((variant) => variant.anchoring)].flatMap((anchoring) => [anchoring?.source, anchoring?.target])) {
      if (anchor?.mode !== 'part') continue;
      const attribute = isObject(anchor.part) && 'attribute' in anchor.part ? attributesOf(metamodel, type.name)[anchor.part.attribute] : undefined;
      const kind = attribute && valueKind(metamodel, attribute.type);
      if (kind?.kind === 'enum') for (const value of kind.enum.values) anchorParts.add(value.key);
      else anchorsAny = true;
    }
  }

  interface Drawn {
    readonly node: SceneNode;
    /** Every part the shape declares, drawn or not, and the node's notation. */
    readonly declared: readonly string[];
    readonly notation: NodeNotation;
  }

  const draw = (place: Placed): Drawn => {
    const { element, notation: own, box } = place;
    const self = element.id;
    const style = settled(styleOf(notation, own.style), self);
    const ref = own.shape;
    const custom = customOf(ref) ?? (typeof ref === 'object' && 'path' in ref ? { name: 'path', params: {}, path: ref.path, handles: [] } : undefined);

    // The parameters, as plain values for the scene and as CEL holds them for the geometry (DISL 6.8).
    const params: Record<string, Value> = {};
    const p: Record<string, unknown> = {};
    const size = { w: box.width, h: box.height };
    const given = typeof ref === 'object' && 'type' in ref ? ref.params ?? {} : {};
    for (const [param, declared] of Object.entries(custom?.params ?? {})) {
      let value = Object.hasOwn(given, param) ? bound(given[param], self, { ...size, params }) : undefined;
      if (value === undefined || value === null) value = isCel(declared.default) ? run(declared.default, self, size) : declared.default;
      if (declared.type === 'int' || declared.type === 'number') {
        const low = declared.min === undefined ? -Infinity : geometry(declared.min, 1, self, size) ?? -Infinity;
        const high = declared.max === undefined ? Infinity : geometry(declared.max, 1, self, size) ?? Infinity;
        const limited = Math.min(Math.max(number(value) ?? 0, low), high);
        value = declared.type === 'int' ? Math.round(limited) : limited;
        p[param] = declared.type === 'int' ? BigInt(value) : value;
      } else {
        p[param] = value;
      }
      params[param] = value ?? null;
    }

    const scope = (within: Box): Scope => ({ w: within.width, h: within.height, p });
    const shapeOf = (shape: ShapeRef | undefined, within: Box, definition?: CustomShape): SceneShape => {
      const path = definition?.path ?? (typeof shape === 'object' && 'path' in shape ? shape.path : undefined);
      const called = definition?.name ?? (typeof shape === 'string' ? shape : shape && 'type' in shape ? shape.type : 'rect');
      if (path) return { kind: 'path', name: called, box: within, commands: commandsOf(path, within, self, scope(within)), fillRule: path.fillRule };
      if (called === 'ellipse') return { kind: 'ellipse', name: called, box: within };
      if (called === 'circle') {
        const across = Math.min(within.width, within.height);
        return { kind: 'ellipse', name: called, box: { x: within.x + (within.width - across) / 2, y: within.y + (within.height - across) / 2, width: across, height: across } };
      }
      return { kind: called === 'none' || called === 'text' || definition?.parts ? 'none' : 'rect', name: builtInShapes.includes(called) || definition ? called : 'rect', box: within };
    };
    const shape = shapeOf(ref, box, custom);

    const parts: ScenePart[] = [];
    for (const [index, part] of (custom?.parts ?? []).entries()) {
      const id = part.id ?? String(index);
      if (part.when !== undefined && run(part.when, self, scope(box)) !== true) continue;
      const within = boxOf(part.box, box, self, scope(box));
      parts.push({
        id, box: within,
        shape: shapeOf(part.shape, within, part.shape === undefined ? undefined : customOf(part.shape)),
        style: settled(styleOf(notation, style, part.style, own.partStyles[id]), self),
        hit: part.hit !== false,
        ...(anchorsAny || anchorParts.has(id) ? { anchor: true } : {}),
        tooltip: message(part.tooltip, self, { p }),
      });
    }

    let outline: Outline = shape.kind === 'ellipse' ? { kind: 'ellipse', box: shape.box } : shape.kind === 'path' ? pathOutline(shape.commands) : boxOutline(box);
    if (custom?.outline === 'ellipse') outline = { kind: 'ellipse', box };
    else if (custom?.outline === 'bounds') outline = boxOutline(box);
    else if (isObject(custom?.outline)) outline = pathOutline(commandsOf(custom.outline as PathDef, box, self, scope(box)));
    if (outline.kind === 'polygon' && outline.points.length < 3) outline = boxOutline(box);

    const handles = (custom?.handles ?? []).map((handle): SceneHandle => ({
      param: handle.param,
      x: box.x + (geometry(handle.x ?? 0, box.width, self, scope(box)) ?? 0),
      y: box.y + (geometry(handle.y ?? 0, box.height, self, scope(box)) ?? 0),
      axis: handle.axis ?? 'x',
      visible: handle.visible === undefined || run(handle.visible, self, scope(box)) === true,
    }));

    const labels = own.labels.flatMap((label, index) => {
      const made = labelOf(label, index, box, style, self);
      return made ? [made] : [];
    });

    const movable = own.placement.movable ?? true;
    const resizable = own.placement.resizable ?? true;
    const sizable = own.size.fixed ? false : own.size.resizable ?? true;
    const free = (axis: 'x' | 'y', allowed: boolean | { readonly x?: boolean; readonly y?: boolean }): boolean => {
      const from = own.placement[axis];
      const fixed = isObject(from) && ('layout' in from || (isCel(from) && !('write' in from)));
      return !fixed && (typeof allowed === 'boolean' ? allowed : allowed[axis] !== false);
    };
    return {
      declared: (custom?.parts ?? []).map((part, index) => part.id ?? String(index)),
      notation: own,
      node: {
        id: self, type: element.type, box, system: place.system, shape, outline, style, params, parts, handles, labels,
        tooltip: message(own.tooltip, self),
        movable: { x: free('x', movable), y: free('y', movable) },
        resizable: { x: free('x', resizable) && sizable !== false && sizable !== 'vertical', y: free('y', resizable) && sizable !== false && sizable !== 'horizontal' },
        connectable: flag(own.connectable, self, true),
        selectable: flag(own.selectable, self, true),
        deletable: flag(own.deletable, self, true),
        dimmed: dimmed.has(self),
        ...(folds.has(self) ? { fold: folds.get(self) } : {}),
      },
    };
  };

  // A number of canvas units, a percentage of the dimension it runs along, or CEL (DISL 2.5c).
  function geometry(value: GeomExpr, of: number, self: string, scope: Scope): number | undefined {
    if (typeof value === 'number') return value;
    const percent = /^\s*(-?\d+(?:\.\d+)?)\s*%\s*$/.exec(value);
    return percent ? (Number(percent[1]) / 100) * of : number(run(value, self, scope));
  }

  function boxOf(declared: GeomBox | undefined, within: Box, self: string, scope: Scope): Box {
    const one = (value: GeomExpr | undefined, of: number, fallback: number): number => (value === undefined ? fallback : geometry(value, of, self, scope) ?? fallback);
    return {
      x: within.x + one(declared?.x, within.width, 0), y: within.y + one(declared?.y, within.height, 0),
      width: one(declared?.w, within.width, within.width), height: one(declared?.h, within.height, within.height),
    };
  }

  // A declared path with its numbers worked out, at its place on the canvas (DISL 6.8).
  function commandsOf(path: PathDef, within: Box, self: string, scope: Scope): PathCommand[] {
    if (!path.segments) {
      report('path:d', 'A shape is drawn from an SVG path string, which this add-on does not read; its bounds are drawn.');
      return movedPath([{ op: 'M', x: 0, y: 0 }, { op: 'L', x: within.width, y: 0 }, { op: 'L', x: within.width, y: within.height }, { op: 'L', x: 0, y: within.height }, { op: 'Z' }], within.x, within.y);
    }
    const commands: PathCommand[] = [];
    let last = { x: 0, y: 0 };
    for (const step of path.segments) {
      if (step.when !== undefined && run(step.when, self, scope) !== true) continue;
      const x = (value: GeomExpr | undefined): number => (value === undefined ? last.x : geometry(value, within.width, self, scope) ?? last.x);
      const y = (value: GeomExpr | undefined): number => (value === undefined ? last.y : geometry(value, within.height, self, scope) ?? last.y);
      switch (step.op) {
        case 'Z': commands.push({ op: 'Z' }); continue;
        case 'M': case 'L': commands.push({ op: step.op, x: x(step.x), y: y(step.y) }); break;
        case 'H': commands.push({ op: 'L', x: x(step.x), y: last.y }); break;
        case 'V': commands.push({ op: 'L', x: last.x, y: y(step.y) }); break;
        case 'Q': commands.push({ op: 'Q', cx: x(step.cx), cy: y(step.cy), x: x(step.x), y: y(step.y) }); break;
        case 'C': commands.push({ op: 'C', c1x: x(step.c1x), c1y: y(step.c1y), c2x: x(step.c2x), c2y: y(step.c2y), x: x(step.x), y: y(step.y) }); break;
        case 'A': {
          const radius = (value: unknown, of: number): number => (typeof value === 'number' || typeof value === 'string' ? geometry(value, of, self, scope) ?? 0 : 0);
          commands.push(...arcCommands(last, radius(step.rx, within.width), radius(step.ry, within.height), typeof step.rotation === 'number' ? step.rotation : 0, step.largeArc === true, step.sweep === true, { x: x(step.x), y: y(step.y) }));
          break;
        }
        default:
          report(`path:${step.op}`, `A shape's path has a \`${step.op}\` step, which this add-on draws as a straight line.`);
          commands.push({ op: 'L', x: x(step.x), y: y(step.y) });
      }
      const made = commands[commands.length - 1];
      if (made.op !== 'Z') last = { x: made.x, y: made.y };
    }
    return movedPath(commands, within.x, within.y);
  }

  function labelOf(label: Label, index: number, box: Box, nodeStyle: Style, self: string): SceneLabel | undefined {
    if (bound(label.visible, self) === false) return undefined;
    const text = String(bound(label.text, self) ?? '');
    const edit = label.editText ?? (isObject(label.text) && 'attribute' in label.text ? label.text : undefined);
    const editText = isObject(edit) && 'attribute' in edit ? String(bound(edit, self) ?? '') : message(edit, self) ?? text;
    const style = settled(styleOf(notation, { font: nodeStyle.font, padding: nodeStyle.padding }, label.style), self);
    const fontSize = number(style.font?.size) ?? defaultFontSize;
    const lines = text.split('\n');
    const width = Math.max(...lines.map((line) => measure(line, fontSize)));
    const height = lines.length * lineHeight(notation.textMetric, fontSize, style.font);
    const position = label.position ?? 'center';
    const common = {
      id: label.id ?? String(index), text, editText, position, fontSize, style,
      editable: label.editable ?? (isObject(label.text) && 'attribute' in label.text ? 'inline' as const : false as const),
      wrap: label.wrap ?? 'word', overflow: label.overflow ?? 'visible',
    };

    if (typeof position !== 'string') {
      const at = pointIn(box, position.anchor?.[0] ?? 0.5, position.anchor?.[1] ?? 0.5);
      const offset = settled(position.offset, self);
      const [dx, dy] = Array.isArray(offset) ? [number(offset[0]) ?? 0, number(offset[1]) ?? 0] : [0, 0];
      const align = position.align === 'start' || position.align === 'end' ? position.align : 'center';
      const left = at.x + dx - (align === 'start' ? 0 : align === 'end' ? width : width / 2);
      return { ...common, align, box: { x: left, y: at.y + dy - height / 2, width, height } };
    }
    const words = position.split('-');
    if (words[0] !== 'outside') {
      // Inside the node the text is laid out in the node less its padding, and held where the position says.
      const [top, right, bottom, left] = sidesOf(nodeStyle.padding);
      const align = words.includes('left') ? 'start' : words.includes('right') ? 'end' : 'center';
      return { ...common, align, box: { x: box.x + left, y: box.y + top, width: Math.max(0, box.width - left - right), height: Math.max(0, box.height - top - bottom) } };
    }
    // Outside it the text stands clear of the node by the label's distance; plain `outside` is below.
    const gap = label.distance ?? 4;
    const across = words.includes('left') ? 'left' : words.includes('right') ? 'right' : 'center';
    const down = words.includes('top') ? 'top' : words.includes('bottom') || words.length === 1 ? 'bottom' : 'center';
    return {
      ...common,
      align: across === 'left' ? 'end' : across === 'right' ? 'start' : 'center',
      box: {
        x: across === 'left' ? box.x - gap - width : across === 'right' ? box.x + box.width + gap : box.x + (box.width - width) / 2,
        y: down === 'top' ? box.y - gap - height : down === 'bottom' ? box.y + box.height + gap : box.y + (box.height - height) / 2,
        width, height,
      },
    };
  }

  const drawn = new Map<string, Drawn>();
  for (const place of places.values()) drawn.set(place.element.id, draw(place));

  // ---- edges ----

  // An end on a part of its node's shape (DISL 6.10). `false` is an end on a part the node does not draw.
  const onPart = (anchor: EndAnchor, relation: ModelRelation, at: Drawn): SceneEnd | false => {
    const { node } = at;
    // What an end may name: a value of the enum its attribute is typed with, when it is bound to one.
    const allowed = (binding: unknown): readonly string[] | undefined => {
      const attribute = isObject(binding) && typeof binding.attribute === 'string' ? attributesOf(metamodel, relation.type)[binding.attribute] : undefined;
      const kind = attribute && valueKind(metamodel, attribute.type);
      return kind?.kind === 'enum' ? kind.enum.values.map((value) => value.key) : undefined;
    };
    const names = allowed(anchor.part);
    const edges = allowed(anchor.side);
    const part = bound(anchor.part, relation.id);
    const side = bound(anchor.side, relation.id);
    const along = number(bound(anchor.at, relation.id));
    const readable = typeof part === 'string' && at.declared.includes(part) && (names?.includes(part) ?? true)
      && typeof side === 'string' && sides.includes(side as Side) && (edges?.includes(side) ?? true)
      && along !== undefined && along >= 0 && along <= 1;
    if (readable) {
      const on = node.parts.find((candidate) => candidate.id === part);
      if (!on) return false;
      return { node: node.id, ...pointOn(on.box, side as Side, along), side: side as Side, normal: normalOf(side as Side), part: on.id, at: along };
    }
    // An end that names no place of the node is drawn at the first place it could name: the first
    // part and the first side its attributes allow, halfway along, as the Visual Studio Code host does.
    const on = (names === undefined ? node.parts : names.flatMap((name) => node.parts.filter((candidate) => candidate.id === name)))[0] ?? node.parts[0];
    const facing = (edges?.find((edge) => sides.includes(edge as Side)) as Side | undefined) ?? 'top';
    return { node: node.id, ...pointOn(on?.box ?? node.box, facing, 0.5), side: facing, normal: normalOf(facing), part: on?.id, at: 0.5, fallback: true };
  };

  // An end the anchors of its node place, towards a point at the other end (DISL 6.9).
  const towards = (anchor: EndAnchor & { readonly drawnFrom?: string }, at: Drawn, other: Point): SceneEnd => {
    const { node } = at;
    const centre = centreOf(node.box);
    const out = (point: Point, normal: Point): Point => ({ x: point.x + normal.x * (anchor.gap ?? 0), y: point.y + normal.y * (anchor.gap ?? 0) });
    const onOutline = (): { point: Point; normal: Point } => {
      const point = leaving(node.outline, centre, other) ?? centre;
      return { point, normal: normalAt(node.outline, point) };
    };
    const mode = anchor.mode === 'port' ? 'outline' : anchor.mode ?? 'outline';
    const points: readonly AnchorPoint[] = mode === 'sides'
      ? (anchor.sides ?? sides).map((side) => ({ id: side, x: side === 'left' ? 0 : side === 'right' ? 1 : 0.5, y: side === 'top' ? 0 : side === 'bottom' ? 1 : 0.5 }))
      : mode === 'fixed' ? anchor.points ?? [] : [];
    if (points.length > 0) {
      const nearest = points.map((point) => ({ point, at: pointIn(node.box, point.x, point.y) })).reduce((best, candidate) => (distance(candidate.at, other) < distance(best.at, other) ? candidate : best));
      const side = sideAt(nearest.point.x, nearest.point.y);
      // Drawn from the outline, the anchor says only which side the edge belongs to (DISL 6.9).
      const place = anchor.drawnFrom === 'outline' ? onOutline() : { point: nearest.at, normal: normalOf(side) };
      return { node: node.id, ...out(place.point, place.normal), side, normal: place.normal, anchor: nearest.point.id };
    }
    // On the outline where it faces the other end; an end at the centre still leaves that way.
    const met = onOutline();
    const side = sideAt((met.point.x - node.box.x) / node.box.width, (met.point.y - node.box.y) / node.box.height);
    return { node: node.id, ...(mode === 'center' ? centre : out(met.point, met.normal)), side, normal: met.normal };
  };

  const directions: Readonly<Record<string, Point>> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

  // The relations a type derives from the model (DISL 4.11.3): drawn, and no part of the model that is edited.
  // simplified: a derived relation has its ends and the default id; its `id`, `attributes`, `key` and `owner` are not read, and an expression of its notation sees no `self`. Read them when a definition draws a derived relation from more than its two ends.
  const derived: ModelRelation[] = [];
  for (const type of Object.values(metamodel.types)) {
    const rule = isRelation(type) && isObject(type.declared.derived) ? type.declared.derived : undefined;
    if (!rule || (typeof rule.from !== 'string' && !isCel(rule.from))) continue;
    const items = expressions.evaluate(rule.from, world.scope());
    if (!items.ok || !Array.isArray(items.raw)) {
      report(`derived:${type.name}`, `The relations of the type \`${type.name}\` could not be derived, so none is drawn: ${items.ok ? '`from` did not give a list' : items.error}`);
      continue;
    }
    const repeats = new Map<string, number>();
    for (const item of items.raw as unknown[]) {
      const end = (expression: unknown): string | undefined => {
        const result = typeof expression === 'string' || isCel(expression) ? expressions.evaluate(expression, world.scope(undefined, { item })) : undefined;
        return result?.ok && typeof result.value === 'string' ? result.value : undefined;
      };
      const source = end(rule.source);
      const target = end(rule.target);
      if (source === undefined || target === undefined) continue;
      const id = `${type.name}:${source}->${target}`;
      const count = (repeats.get(id) ?? 0) + 1;
      repeats.set(id, count);
      derived.push({ id: count === 1 ? id : `${id}#${count}`, type: type.name, attributes: {}, host: {}, ephemeral: true, line: 0, source, target });
    }
  }

  const edges: SceneEdge[] = [];
  for (const relation of [...model.relations, ...derived]) {
    const type = metamodel.types[relation.type];
    if (!isRelation(type) || relation.source === undefined || relation.target === undefined) continue;
    const ends = [elements.get(relation.source), elements.get(relation.target)];
    // An end that names nothing, or an element its relation type does not allow there, is not drawn; the findings say so.
    if (!ends[0] || !ends[1] || !allowsEnd(metamodel, relation.type, 'source', ends[0].type) || !allowsEnd(metamodel, relation.type, 'target', ends[1].type)) continue;
    const hiddenByFilter = filtered.has(relation.source) || filtered.has(relation.target);
    const source = drawn.get(relation.source);
    const target = drawn.get(relation.target);
    if (!hiddenByFilter && (!source || !target)) continue;

    const own: EdgeNotation = varied(edgeNotation(notation, metamodel, relation.type), relation.id);
    const routing = typeof own.line.routing === 'string' ? own.line.routing : 'straight';
    const marker = (value: unknown, fallback: string): string => {
      const name = bound(value, relation.id);
      return typeof name === 'string' ? name : fallback;
    };
    const common = {
      id: relation.id, type: relation.type, source: relation.source, target: relation.target, routing,
      stroke: settled(merged(styleOf(notation, own.style).stroke ?? {}, own.line.stroke), relation.id),
      sourceMarker: marker(own.sourceMarker, 'none'), targetMarker: marker(own.targetMarker, 'none'),
    };
    if (hiddenByFilter || !source || !target) {
      edges.push({ ...common, hidden: 'filter', path: [] });
      continue;
    }

    // The edge's own anchoring over the node's anchors; an end stored on a part is placed first,
    // and an end worked out from the other is placed towards it.
    const anchorOf = (at: Drawn, end: EndAnchor | undefined): EndAnchor => merged(at.notation.anchors as EndAnchor, end);
    const fromAnchor = anchorOf(source, own.anchoring.source);
    const toAnchor = anchorOf(target, own.anchoring.target);
    let to = toAnchor.mode === 'part' ? onPart(toAnchor, relation, target) : towards(toAnchor, target, centreOf(source.node.box));
    const from = to === false ? false : fromAnchor.mode === 'part' ? onPart(fromAnchor, relation, source) : towards(fromAnchor, source, to);
    if (to === false || from === false) {
      edges.push({ ...common, hidden: 'part', path: [] });
      continue;
    }
    if (toAnchor.mode !== 'part') to = towards(toAnchor, target, from);

    if (routing !== 'bezier') {
      if (routing !== 'straight') report(`routing:${routing}`, `An edge of the type \`${relation.type}\` is routed as \`${routing}\`, which this add-on draws as a straight line.`);
      edges.push({ ...common, from, to, path: [{ op: 'M', x: from.x, y: from.y }, { op: 'L', x: to.x, y: to.y }] });
      continue;
    }
    // A named direction is the way the line runs: out of its source, and into its target.
    const leave = directions[own.line.startDirection ?? ''] ?? from.normal;
    const enter = directions[own.line.endDirection ?? ''];
    const back = enter ? { x: -enter.x || 0, y: -enter.y || 0 } : to.normal;
    const reach = own.line.bezier?.reach;
    const auto = Math.max(30, Math.abs((to.x - from.x) * leave.x + (to.y - from.y) * leave.y) / 2);
    const curve = cubicBetween({ point: from, normal: leave }, { point: to, normal: back }, reach === 'auto' ? Math.min(auto, own.line.bezier?.maxReach ?? Infinity) : reach);
    edges.push({ ...common, from, to, curve, path: cubicPath(curve) });
  }

  const nodes = [...drawn.values()].map((entry) => entry.node);
  return {
    viewpoint: viewpoint.name,
    system: viewpoint.coordinateSystem,
    nodes, edges,
    filtered: [...filtered],
    bounds: nodes.length === 0 ? undefined : nodes.map((node) => node.box).reduce(union),
    findings: [...found.values()],
  };
}

// ---- the rows-only arrangement (DISL 10.2) ----

/**
 * The row a `rows` layout gives each node of a scene: the extents come from the configuration's
 * expressions over the nodes' boxes, and the links from its `affinity`. It reads no row, so the
 * scene is best one of the whole model: the default viewpoint without a filter. A node whose
 * extent cannot be worked out takes no part, and has no row here.
 */
export function arrangedRows(tool: SceneTool, model: Model, scene: Scene, config: LayoutConfig): Map<string, number> {
  const options = config.rows;
  if (!options) return new Map();
  const world = tool.expressions.over(model, { env: { viewpoint: scene.viewpoint } });
  const items: RowItem[] = [];
  for (const node of scene.nodes) {
    const extent = Object.entries(options.extent).find(([type]) => isA(tool.metamodel, node.type, type))?.[1];
    if (!extent) continue;
    const { x, y, width, height } = node.box;
    const scope = world.scope(node.id, { x, y, width, height, x2: x + width, y2: y + height });
    const one = (value: GeomExpr | undefined): number | undefined => {
      if (typeof value === 'number' || value === undefined) return value;
      const result = tool.expressions.evaluate(value, scope);
      return result.ok ? number(result.value) : undefined;
    };
    const from = one(extent.from);
    const to = one(extent.to);
    if (from === undefined || to === undefined) continue;
    items.push({ id: node.id, from, to, rows: one(extent.rows) ?? 1 });
  }
  const affinity = options.affinity;
  const links = affinity === undefined ? [] : model.relations
    .filter((relation) => isA(tool.metamodel, relation.type, affinity) && relation.source !== undefined && relation.target !== undefined)
    .map((relation) => [relation.source!, relation.target!] as const);
  return assignRows(items, links, options);
}
