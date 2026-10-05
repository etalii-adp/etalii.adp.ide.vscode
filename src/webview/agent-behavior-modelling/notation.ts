import {
  mdiAccountArrowRightOutline, mdiAccountCheckOutline, mdiAccountQuestionOutline, mdiArrowLeft, mdiArrowRight, mdiArrowRightBoldOutline, mdiCallSplit,
  mdiHelpCircleOutline, mdiHelpRhombusOutline, mdiPlayOutline, mdiPlus, mdiRepeat, mdiReplay, mdiShieldOutline,
} from '@mdi/js';
import { dragPreview } from '../../core/agent-behavior-modelling/layout';
import type { Model, Node } from '../../core/agent-behavior-modelling/model';
import type { Box, ViewElement, ViewRelation } from '../../core/frame/diagramType';
import { html, points, svg } from '../canvas/dom';
import { registerIcons } from '../canvas/icons';
import type { CanvasPoint, DrawContext, Notation } from '../canvas/notation';

// Agent Behavior Modelling's notation: the three composites as superellipses and the four wrappers
// as hexagons, as behavior tree tools in games set the two families apart; a Check is a pill, a Do
// a box, an Ask the user a parallelogram and a Delegate a diode. Each node shows its keyword in
// small capitals above its label, and a line with an arrow runs from every parent to each child.

registerIcons({
  'mdi-arrow-right-bold-outline': mdiArrowRightBoldOutline,
  'mdi-help-rhombus-outline': mdiHelpRhombusOutline,
  'mdi-call-split': mdiCallSplit,
  'mdi-replay': mdiReplay,
  'mdi-repeat': mdiRepeat,
  'mdi-shield-outline': mdiShieldOutline,
  'mdi-account-check-outline': mdiAccountCheckOutline,
  'mdi-help-circle-outline': mdiHelpCircleOutline,
  'mdi-play-outline': mdiPlayOutline,
  'mdi-account-question-outline': mdiAccountQuestionOutline,
  'mdi-account-arrow-right-outline': mdiAccountArrowRightOutline,
  'mdi-arrow-left': mdiArrowLeft,
  'mdi-arrow-right': mdiArrowRight,
  'mdi-plus': mdiPlus,
});

type Point = { x: number; y: number };

const fractions = (box: Box, list: readonly (readonly [number, number])[]): Point[] => list.map(([fx, fy]) => ({ x: box.x + fx * box.width, y: box.y + fy * box.height }));

/** The squircle: |x/a|^4 + |y/b|^4 = 1, sampled finely enough to read as a curve. */
export function superellipse(box: Box, samples = 64): Point[] {
  const a = box.width / 2;
  const b = box.height / 2;
  return Array.from({ length: samples }, (_, index) => {
    const angle = (2 * Math.PI * index) / samples;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: box.x + a + a * Math.sign(cos) * Math.sqrt(Math.abs(cos)), y: box.y + b + b * Math.sign(sin) * Math.sqrt(Math.abs(sin)) };
  });
}

/** A box whose right side is closed by a semicircle. */
export function diode(box: Box, samples = 24): Point[] {
  const radius = box.height / 2;
  const centre = { x: box.x + box.width - radius, y: box.y + radius };
  const arc = Array.from({ length: samples + 1 }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * index) / samples;
    return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
  });
  return [{ x: box.x, y: box.y }, ...arc, { x: box.x, y: box.y + box.height }];
}

/** The outline a kind of node is drawn with, and the class that colours its family. */
export function shapeOf(element: ViewElement): { outline: SVGElement; family: string } {
  const shape = (list: Point[]): SVGElement => svg('polygon', { points: points(list) });
  switch (element.type) {
    case 'sequence':
    case 'fallback':
    case 'parallel':
      return { outline: shape(superellipse(element)), family: 'abm-composite' };
    case 'retry':
    case 'repeat':
    case 'guard':
    case 'approval':
      return { outline: shape(fractions(element, [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]])), family: 'abm-decorator' };
    case 'check':
      return { outline: svg('rect', { x: element.x, y: element.y, width: element.width, height: element.height, rx: element.height / 2 }), family: 'abm-check' };
    case 'ask':
      return { outline: shape(fractions(element, [[0.2, 0], [1, 0], [0.8, 1], [0, 1]])), family: 'abm-other' };
    case 'delegate':
      return { outline: shape(diode(element)), family: 'abm-other' };
    default:
      return { outline: svg('rect', { x: element.x, y: element.y, width: element.width, height: element.height, rx: 3 }), family: 'abm-action' };
  }
}

function node(element: ViewElement): SVGGElement {
  const { outline, family } = shapeOf(element);
  outline.setAttribute('class', `abm-shape adp-outline ${family}`);
  if (element.tooltip) outline.append(svg('title', {}, element.tooltip));
  const text = svg('foreignObject', { x: element.x, y: element.y, width: element.width, height: element.height });
  text.append(html('div', { class: 'abm-text' },
    html('div', { class: 'abm-keyword' }, String(element.data.keyword ?? '')),
    html('div', { class: 'abm-label' }, element.label)));
  return svg('g', { class: `adp-element abm-node${element.data.implicit === true ? ' abm-implicit' : ''}`, 'data-id': element.id }, outline, text);
}

/** The orthogonal line from a parent's bottom to a child's top: down, across, down. */
export function parentLine(parent: Box, child: Box): string {
  const from = { x: parent.x + parent.width / 2, y: parent.y + parent.height };
  const to = { x: child.x + child.width / 2, y: child.y };
  const middle = from.y + (to.y - from.y) / 2;
  return `M ${from.x} ${from.y} V ${middle} H ${to.x} V ${to.y}`;
}

function line(relation: ViewRelation, context: DrawContext): SVGGElement | undefined {
  const parent = context.elements.get(relation.from);
  const child = context.elements.get(relation.to);
  if (!parent || !child) return undefined;
  const d = parentLine(parent, child);
  return svg('g', { class: 'adp-relation abm-child', 'data-id': relation.id },
    svg('path', { class: 'adp-relation-line', d, 'marker-end': 'url(#adp-arrow)' }));
}

interface TreeEntry {
  readonly id: string;
  readonly parent: string | null;
  readonly x: number;
  readonly y: number;
}

// While a node is dragged it carries everything beneath it, its row follows it up and down, and
// the siblings it has passed are drawn where the new order would put them: they step aside to show
// where it will land. The tree and where each node is drawn come with the view, whole, so the
// preview is right whatever part of the tree is in view.
function dragging(element: ViewElement, at: CanvasPoint, context: DrawContext): Map<string, CanvasPoint> | undefined {
  const tree = context.view.chrome.tree as TreeEntry[] | undefined;
  if (!tree) return undefined;
  const nodes = tree.map((entry) => ({ id: entry.id, parentId: entry.parent ?? undefined, childIds: tree.filter((other) => other.parent === entry.id).map((other) => other.id) })) as unknown as Node[];
  const node = nodes.find((candidate) => candidate.id === element.id);
  if (!node) return undefined;
  const now = new Map(tree.map((entry) => [entry.id, { x: entry.x, y: entry.y }]));
  const preview = dragPreview({ nodes } as unknown as Model, now, node, at.x, at.y);
  const offsets = new Map<string, CanvasPoint>();
  for (const [id, position] of preview) {
    const was = now.get(id);
    if (was) offsets.set(id, { x: position.x - was.x, y: position.y - was.y });
  }
  return offsets;
}

export const agentBehaviorModellingNotation: Notation = {
  origin: 'etalii/agent-behavior-modelling',
  label: 'Agent Behavior Modelling',
  element: node,
  relation: line,
  dragging: (element, at, context) => dragging(element, at, context) ?? new Map([[element.id, { x: at.x - element.x, y: at.y - element.y }]]),
  // The line shown while a node is being put under another: from the new parent's bottom to the pointer.
  connecting(from, _fromEnd, to) {
    const start = { x: from.x + from.width / 2, y: from.y + from.height };
    return svg('path', { class: 'adp-relation-line adp-connecting', d: `M ${start.x} ${start.y} L ${to.x} ${to.y}`, 'marker-end': 'url(#adp-arrow)' });
  },
};
