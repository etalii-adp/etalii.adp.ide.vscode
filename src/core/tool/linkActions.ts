// What the host offers on an element for links between documents (FBL 0.23 section 17.5; etalii.adp spec 089):
// Open linked element on an element that stands for the target of its link, and Linked from (N), the links of
// the workspace that resolve to an element, each opened in its own document.

import { linkableOf, linkedOf } from '../disl/links';
import type { Metamodel } from '../disl/metamodel';
import type { ModelElement } from '../disl/model';
import { linkText, linkToElement } from '../fbl/links/link';
import { attributeOf, fileNameOf, type LinkWorkspace } from '../fbl/links/workspace';
import { LINKED_FROM, OPEN_LINKED, type Action, type BacklinkEntry, type LookupPick } from '../frame/toolType';

/** The target of a linked element's link, where it resolves: its document's index path, and its element's id. */
export function linkTarget(metamodel: Metamodel, element: ModelElement, links: LinkWorkspace): { readonly path: string; readonly select?: string } | undefined {
  const linked = linkedOf(metamodel, element.type);
  const text = linked === undefined ? undefined : element.attributes[linked.attribute];
  if (typeof text !== 'string' || text === '') return undefined;
  const { resolved } = links.resolve(text);
  return resolved && { path: resolved.path, ...(resolved.element === undefined ? {} : { select: resolved.element.id }) };
}

/** The backlinks of an element of the document at `path` (FBL 17.5), each with its document's name and the name of the element that holds it. */
export function backlinksOf(links: LinkWorkspace, path: string, id: string): BacklinkEntry[] {
  return links.backlinks(path, id).map((backlink) => {
    const document = links.document(backlink.path);
    const holder = document?.elements.find((element) => element.id === backlink.holder);
    const named = holder === undefined ? undefined : (document?.nameProperty !== undefined ? attributeOf(holder, document.nameProperty) : holder.attributes[0]?.[1]);
    return { path: backlink.path, document: fileNameOf(backlink.path), holder: backlink.holder, name: named || backlink.holder };
  });
}

/** The host's entries for links of the menu of one element: Open linked element where its link resolves, and Linked from (N) where it has backlinks. */
export function linkEntries(metamodel: Metamodel, element: ModelElement, links: LinkWorkspace, path: string): Action[] {
  const entries: Action[] = [];
  if (linkTarget(metamodel, element, links)) entries.push({ id: OPEN_LINKED, label: 'Open linked element', icon: 'mdi-open-in-new', enabled: true });
  const count = linkableOf(metamodel, element.type) ? links.backlinks(path, element.id).length : 0;
  if (count > 0) entries.push({ id: LINKED_FROM, label: `Linked from (${count})`, icon: 'mdi-link-variant', enabled: true });
  return entries;
}

/** The sentence a delete's confirmation says of the links it breaks (FBL 17.5). */
export const breaksLinks = (count: number): string => (count === 1 ? 'This breaks 1 link in the workspace, which is then reported where it is held.' : `This breaks ${count} links in the workspace, which are then reported where they are held.`);

/** One element the host's lookup offers (DISL 9.4): what picking it gives, and how it is shown. */
export interface LookupItem {
  readonly pick: LookupPick;
  /** The document's file name, and the folder it is in, relative to the workspace's root. */
  readonly document: string;
  readonly folder: string;
}

/**
 * The elements the host's lookup offers (DISL 9.4): every element of every document of the workspace that has a
 * document id, the consuming document's own included, of the documents `admits` lets through, in path order; each
 * as a link with its name property and its cached name (FBL 17.1).
 */
export function lookupItems(links: LinkWorkspace, admits: (path: string) => boolean = () => true): LookupItem[] {
  return links.documents.flatMap((document) => {
    if (document.documentId === undefined || !admits(document.path)) return [];
    const shown = links.display(document.path);
    const folder = shown.includes('/') ? shown.slice(0, shown.lastIndexOf('/')) : '';
    return document.elements.map((element): LookupItem => {
      const name = (document.nameProperty !== undefined ? attributeOf(element, document.nameProperty) : element.attributes[0]?.[1]) ?? '';
      const link = linkText(linkToElement(document.documentId!, fileNameOf(document.path), element.id, document.nameProperty, name));
      return { pick: { link, name }, document: fileNameOf(document.path), folder };
    });
  });
}
