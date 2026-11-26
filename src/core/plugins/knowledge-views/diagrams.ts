// A relation to a diagram (etalii.adp spec 092, FR-025; `knowledge.md`, "A relation to a diagram"): a relation's target
// may be any document of the workspace whose tool type declares a linkable element type, not only another knowledge file.
// Its cells link to the diagram's elements by name, as the workspace's index of links holds them, and the picker lists
// those elements. The diagram has no column to show a relation's backlinks in, so a relation to one is one-way.

import type { Change } from '../../disl/behavior';
import type { IndexedDocument } from '../../fbl/links/workspace';
import type { RelatedRows, TableLinking, TableOption } from '../../tool/tableView';
import { isLink, relativeTo, SELF, targetLink, text } from './links';

/** What is known of the document a relation sits in: what tells a knowledge file from a diagram. */
export interface Around {
  readonly linking?: TableLinking;
  readonly related?: RelatedRows;
  readonly peers?: readonly string[];
}

/**
 * The diagram a relation's target names: a document of the workspace, with a document id, that is neither this file nor
 * a knowledge file the host knows of; undefined for anything else, a knowledge file or a target that does not resolve.
 */
export function diagramOf(target: string, around: Around): IndexedDocument | undefined {
  const { linking } = around;
  if (!linking || !isLink(target)) return undefined;
  const resolved = linking.links.resolve(target).resolved;
  if (resolved === undefined || resolved.path === linking.path) return undefined;
  const file = relativeTo(linking.path, resolved.path);
  if (around.peers?.includes(file) || around.related?.(file) !== undefined) return undefined;
  const document = linking.links.document(resolved.path);
  return document?.documentId === undefined ? undefined : document;
}

/** The name the diagram gives an element: the value of its linkable name property, or its first attribute. */
function nameOf(document: IndexedDocument, attributes: readonly (readonly [string, string])[]): string {
  return (attributes.find(([key]) => key === document.nameProperty) ?? attributes[0])?.[1] ?? '';
}

/**
 * The elements of a diagram a cell can link to, by their names: each linkable element but one that holds a link itself,
 * which shows another document's element and has no name of its own.
 */
export function elementsOf(document: IndexedDocument): TableOption[] {
  const holders = new Set(document.links.map((link) => link.holder));
  return document.elements.filter((element) => !holders.has(element.id)).map((element) => ({ id: element.id, name: nameOf(document, element.attributes) }));
}

/** The diagrams of the workspace a new relation can target, each as a link to its document, with its file as label. */
export function diagramChoices(around: Around): { value: string; label: string }[] {
  const { linking } = around;
  if (!linking) return [];
  return linking.links.documents.flatMap((document) => {
    if (document.documentId === undefined || document.path === linking.path) return [];
    const file = relativeTo(linking.path, document.path);
    if (file === SELF || around.peers?.includes(file) || around.related?.(file) !== undefined) return [];
    return [{ value: targetLink(document.documentId, file), label: file }];
  });
}

/** A new relation to a diagram is one-way, whatever backlink name it was asked for with: the name is taken off again. */
export function oneWay(created: readonly { readonly id: string; readonly attributes: Readonly<Record<string, unknown>> }[], around: Around): Change[] {
  return created.flatMap((property) => text(property.attributes.backlinkName as string | undefined) !== '' && diagramOf(text(property.attributes.targetFile as string | undefined), around) !== undefined
    ? [{ kind: 'set', id: property.id, attributes: { backlinkName: null } } as Change]
    : []);
}
