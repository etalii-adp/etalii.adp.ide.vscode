import { mdiDeleteOutline, mdiNoteTextOutline, mdiPencilOutline, mdiShapeOutline, mdiSitemapOutline } from '@mdi/js';
import { svg } from './dom';

// The Material Design icons the definitions name, by the names they give them: the ones every
// diagram type's menus share here, and each type's own from its definition. An icon a definition
// names that is not registered is drawn as a generic shape rather than left out.
const paths: Record<string, string> = {
  'mdi-delete-outline': mdiDeleteOutline,
  'mdi-note-text-outline': mdiNoteTextOutline,
  'mdi-pencil-outline': mdiPencilOutline,
  'mdi-sitemap-outline': mdiSitemapOutline,
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
