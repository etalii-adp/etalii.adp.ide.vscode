// A relation to a diagram (etalii.adp spec 092, FR-025; `knowledge.md`, "A relation to a diagram"): a relation's target
// may be any document of the workspace whose tool type declares a linkable element type, not only another knowledge file.
// Its cells link to the diagram's elements by name, as the workspace's index of links holds them, and the picker lists
// those elements. The diagram has no column to show a relation's backlinks in, so a relation to one is one-way.

import type { Change } from '../../disl/behavior';
import { linkText, linkToElement } from '../../fbl/links/link';
import { fileNameOf, type IndexedDocument } from '../../fbl/links/workspace';
import type { ElementMaker, TextSplice } from '../../frame/toolType';
import type { RelatedRows, TableData, TableLinking, TableOption, TableRequest } from '../../tool/tableView';
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

export const CANNOT_CREATE = 'This diagram cannot be given an element from here.';
export const CHOOSE_A_KIND = 'Choose which kind of element to create in this diagram.';
const NOT_A_RELATION = 'That property is not a relation of this table\'s own.';

/**
 * "Create" in a relation's cell, for a relation to a diagram: the element is made in the diagram by its own tool type, of
 * the kind asked for or the only one it offers, named as typed, where that tool places one added without a position; the
 * cell relates it by a link to it, replacing what a relation that holds one row held. Both files are written, as one step.
 */
export function createRelated(table: TableData, request: Extract<TableRequest, { kind: 'createRelated' }>, makes: ElementMaker | undefined): { readonly request: TableRequest; readonly others: readonly { readonly file: string; readonly splices: readonly TextSplice[] }[] } | { readonly refused: string } {
  const property = table.model.elements.find((element) => element.id === request.property && element.type === 'Property');
  if (!property || property.attributes.valueType !== 'relation' || property.attributes.computed === true) return { refused: NOT_A_RELATION };
  const diagram = diagramOf(text(property.attributes.targetFile), table);
  const name = request.name.trim();
  if (diagram === undefined || makes === undefined || table.linking === undefined || name === '') return { refused: CANNOT_CREATE };
  const file = relativeTo(table.linking.path, diagram.path);
  const kinds = makes.offered(file);
  const kind = request.elementKind === undefined ? (kinds.length === 1 ? kinds[0] : undefined) : kinds.find((candidate) => candidate.id === request.elementKind);
  if (kind === undefined) return { refused: kinds.length === 0 ? CANNOT_CREATE : CHOOSE_A_KIND };
  const made = makes.make(file, kind.id, name);
  if (made === undefined) return { refused: CANNOT_CREATE };
  const documentName = fileNameOf(diagram.path);
  const link = linkText(diagram.nameProperty === undefined ? linkToElement(diagram.documentId!, documentName, made.id) : linkToElement(diagram.documentId!, documentName, made.id, diagram.nameProperty, name));
  const added: TableRequest = { kind: 'item', row: request.row, property: property.id, value: link, present: true };
  const held = property.attributes.limit === 'one' ? table.rows.find((row) => row.id === request.row)?.cells[property.id]?.items ?? [] : [];
  const relating: TableRequest = held.length === 0 ? added : { kind: 'steps', steps: [...held.map((item): TableRequest => ({ kind: 'item', row: request.row, property: property.id, value: item.value, present: false })), added] };
  return { request: relating, others: [{ file, splices: made.splices }] };
}
