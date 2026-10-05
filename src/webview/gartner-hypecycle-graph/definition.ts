import { mdiArrowRightBoldBoxOutline, mdiArrowSplitVertical, mdiCircleSlice8, mdiVectorPolylineRemove } from '@mdi/js';
import { phaseNames } from '../../core/gartner-hypecycle-graph/model';
import { unitsPerStep } from '../../core/gartner-hypecycle-graph/scale';
import { elementTypes, relationTypes } from '../../core/gartner-hypecycle-graph/view';
import type { DiagramDefinition } from '../diagram/definition';
import './ghg.css';

// The Gartner hype cycle graph, as the diagram library draws it: a trend as an arrow banner cut
// into the phases it has reached, a trigger as a circle with its name and date before it, a note as
// a box of wrapped text, and an influence as a curve that meets a trend's edge at a right angle.
// Every piece is a library declaration, as in the standalone host.

export const gartnerHypecycleGraphDefinition: DiagramDefinition = {
  origin: 'gartner/hypecycle-graph',
  label: 'Gartner hype cycle graph',
  elementTypes: [
    {
      id: elementTypes.trend,
      shape: 'arrow-banner',
      className: 'ghg-trend',
      segments: {
        count: 'phases', boundaries: 'boundaries', names: phaseNames, classPrefix: 'ghg-', tooltips: 'phaseTooltips',
        // A boundary lands on a step of the ruler, at least one step from its neighbours.
        draggableBoundaries: { step: unitsPerStep },
      },
      labels: [{ text: 'labelText', placement: 'before' }],
      // An influence attaches anywhere along a phase's top or bottom edge, and a press near either starts one.
      anchors: { kind: 'along', band: 6 },
    },
    {
      id: elementTypes.trigger,
      shape: 'ellipse',
      className: 'ghg-trigger',
      shapeClassName: 'ghg-trigger-circle',
      labels: [{ text: 'labelText', placement: 'before' }],
      // An influence leaves whichever of its top, right and bottom faces its target.
      anchors: { kind: 'compass', positions: ['n', 'e', 's'] },
    },
    {
      id: elementTypes.note,
      shape: 'box',
      className: 'ghg-note',
      shapeClassName: 'ghg-note-box',
      labels: [{ placement: 'inside' }],
      textClassName: 'ghg-note-text',
    },
  ],
  relationTypes: [
    // Hidden, not removed: an influence attached to a phase its trend does not show stays in the document.
    { id: relationTypes.influence, route: 'cubic-bezier', className: 'ghg-influence', selectable: true, hiddenWhen: 'hidden', movableEnds: true },
  ],
  icons: {
    'mdi-arrow-right-bold-box-outline': mdiArrowRightBoldBoxOutline,
    'mdi-arrow-split-vertical': mdiArrowSplitVertical,
    'mdi-circle-slice-8': mdiCircleSlice8,
    'mdi-vector-polyline-remove': mdiVectorPolylineRemove,
  },
};
