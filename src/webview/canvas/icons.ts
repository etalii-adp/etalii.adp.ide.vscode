import {
  mdiArrowRightBoldBoxOutline, mdiArrowSplitVertical, mdiCircleSlice8, mdiDeleteOutline, mdiNoteTextOutline, mdiPencilOutline, mdiShapeOutline,
  mdiSitemapOutline, mdiVectorPolylineRemove,
} from '@mdi/js';
import { svg } from './dom';

// The Material Design icons the definitions name, by the names they give them. An icon a
// definition names that is not listed here is drawn as a generic shape rather than left out.
const paths: Record<string, string> = {
  'mdi-arrow-right-bold-box-outline': mdiArrowRightBoldBoxOutline,
  'mdi-arrow-split-vertical': mdiArrowSplitVertical,
  'mdi-circle-slice-8': mdiCircleSlice8,
  'mdi-delete-outline': mdiDeleteOutline,
  'mdi-note-text-outline': mdiNoteTextOutline,
  'mdi-pencil-outline': mdiPencilOutline,
  'mdi-sitemap-outline': mdiSitemapOutline,
  'mdi-vector-polyline-remove': mdiVectorPolylineRemove,
};

/** An icon as a small SVG that takes the colour of the text around it. */
export function icon(name: string | undefined): SVGSVGElement {
  return svg('svg', { class: 'adp-icon', viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true' },
    svg('path', { d: paths[name ?? ''] ?? mdiShapeOutline }));
}

/** Registers more icons: a diagram type adds the ones its definition names. */
export function registerIcons(more: Record<string, string>): void {
  Object.assign(paths, more);
}
