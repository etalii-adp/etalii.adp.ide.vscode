import {
  mdiAccountArrowRightOutline, mdiAccountCheckOutline, mdiAccountQuestionOutline, mdiArrowLeft, mdiArrowRight, mdiArrowRightBoldOutline, mdiCallSplit,
  mdiHelpCircleOutline, mdiHelpRhombusOutline, mdiPlayOutline, mdiPlus, mdiRepeat, mdiReplay, mdiShieldOutline,
} from '@mdi/js';
import type { BuiltInShape } from '../../core/diagram/shapes/outline';
import { spacing } from '../../core/agent-behavior-modelling/layout';
import { kindIds, kinds } from '../../core/agent-behavior-modelling/model';
import type { DiagramDefinition, ElementTypeDefinition } from '../diagram/definition';
import './abm.css';

// Agent Behavior Modelling, as the diagram library draws it: the library's built-in shapes and
// nothing of this tool's own, as in the standalone host. A composite is a squircle and a wrapper a
// hexagon, as behavior tree editors in games set the two families apart; among the leaves, a Check
// is a pill, a Do a box, an Ask the user the parallelogram flowcharts give input, and a Delegate the
// diode that points onward. Each node shows its keyword in small capitals above its label, and a
// line with an arrow runs from every parent to each child.

const shapes: Readonly<Record<string, BuiltInShape>> = {
  [kindIds.sequence]: 'superellipse', [kindIds.fallback]: 'superellipse', [kindIds.parallel]: 'superellipse',
  [kindIds.retry]: 'hexagon', [kindIds.repeat]: 'hexagon', [kindIds.guard]: 'hexagon', [kindIds.approval]: 'hexagon',
  [kindIds.check]: 'pill', [kindIds.action]: 'box', [kindIds.ask]: 'parallelogram', [kindIds.delegate]: 'diode',
};

/** The fill family a kind takes its colour from; `abm.css` gives each its theme colour. */
function familyOf(kind: (typeof kinds)[number]): string {
  if (kind.id === kindIds.check || kind.id === kindIds.action) return kind.id;
  return kind.category === 'leaf' ? 'other' : kind.category;
}

const nodeType = (kind: (typeof kinds)[number]): ElementTypeDefinition => ({
  id: kind.id,
  shape: shapes[kind.id],
  className: 'abm-node',
  shapeClassName: `abm-${familyOf(kind)}`,
  // An item the Markdown gave no keyword is read as a Do, and drawn dashed so the author sees it.
  classWhen: [{ data: 'implicit', className: 'abm-implicit' }],
  labels: [{ text: 'keyword', placement: 'inside', className: 'abm-keyword' }, { placement: 'inside', className: 'abm-label' }],
  textClassName: 'abm-text',
  // A parent line leaves the middle of the parent's bottom and arrives at the middle of the child's
  // top, as a tree drawn top-down reads; it is drawn with a right-button drag from the parent.
  anchors: { kind: 'edge' },
});

export const agentBehaviorModellingDefinition: DiagramDefinition = {
  origin: 'etalii/agent-behavior-modelling',
  label: 'Agent Behavior Modelling',
  elementTypes: kinds.map(nodeType),
  // A parent line cannot be pointed at: it is the child's place in the tree, not a thing of its own.
  relationTypes: [{ id: 'child', route: 'orthogonal', className: 'abm-child', selectable: false }],
  dragging: { kind: 'tree-rows', spacing },
  icons: {
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
  },
};
