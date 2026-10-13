import * as mdi from '@mdi/js';
import { svg } from './dom';

// The Material Design icons the definitions name, by the names they give them. A definition is
// read when the plug-in starts, so which icons it names is not known when this is built: every
// icon of the set is here, found by its name, and a hand-coded diagram type may register one of
// its own. A name that is no icon is drawn as a generic shape rather than left out.
// simplified: the whole icon set is bundled, 2.6 MB in each webview that draws an icon; bundle only the icons the copied definitions name, at build time, when the size of the package matters.
const paths: Record<string, string> = {};
const set = mdi as unknown as Readonly<Record<string, string | undefined>>;

/** The path of the icon a name stands for, in a 24 by 24 box: `mdi-link-variant` is the set's `mdiLinkVariant`. */
export function iconPath(name: string | undefined): string {
  const key = (name ?? '').replace(/-([a-z0-9])/g, (_dash, letter: string) => letter.toUpperCase());
  return paths[name ?? ''] ?? (key.startsWith('mdi') ? set[key] : undefined) ?? mdi.mdiShapeOutline;
}

/** An icon as a small SVG that takes the colour of the text around it. */
export function icon(name: string | undefined): SVGSVGElement {
  return svg('svg', { class: 'adp-icon', viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true' },
    svg('path', { d: iconPath(name) }));
}

/** Registers more icons: a diagram type adds the ones its definition names. */
export function registerIcons(more: Record<string, string>): void {
  Object.assign(paths, more);
}
