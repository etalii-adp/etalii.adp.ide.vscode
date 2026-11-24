// The links between knowledge files (etalii.adp spec 089; `knowledge.md`, "Relations and the steps that write two
// files"; FBL section 17): a relation names its target by a link to the target's document, `$<document-id>@<file>`,
// and holds a link to each related row, `$<document-id>@<file>#<row id>.<title property's name>=<title>`. A file
// made before links names its target by a path, `.` for itself, and holds bare row ids; it is read as it is, and
// converted when it is loaded for editing in a workspace (`conversion`).

import type { Change } from '../../disl/behavior';
import type { Model, ModelElement, Value } from '../../disl/model';
import { linkText, linkToDocument, linkToElement, parseLink } from '../../fbl/links/link';
import { fileNameOf, type IndexedDocument, type LinkFinding } from '../../fbl/links/workspace';
import type { RelatedTable, TableData, TableLinking } from '../../tool/tableView';

export const SELF = '.';
/** The DED version of a knowledge file that holds links (DED 0.3). */
const LINKED_VERSION = '0.3';
/** What separates a backlink column's id from the id of the relation it shows: no id the designer makes holds it. */
export const BACKLINK_MARK = '~';

export const text = (value: Value | undefined): string => (value === undefined || value === null ? '' : String(value));

/** Whether a relation's target, or a related row, is written as a link rather than as a path or an id. */
export const isLink = (written: string): boolean => written.startsWith('$');

/** The id of the row a related row's value names: the element id of its link, or the bare id a file made before links holds. */
export const rowIdOf = (value: string): string => (isLink(value) ? parseLink(value)?.element?.id ?? value : value);

/** A document's own id, where it has one. */
export const ownIdOf = (model: Model): string => text(model.diagram.documentId);

/** The relation properties of a document, the computed side of a two-way relation made before links among them. */
export const relationsOf = (model: Model): ModelElement[] =>
  model.elements.filter((element) => element.type === 'Property' && element.attributes.valueType === 'relation' && text(element.attributes.targetFile) !== '');

/** The title property of a document: what names its rows. */
const titleOf = (model: Model): ModelElement | undefined => model.elements.find((element) => element.type === 'Property' && element.attributes.title === true);

/** The path of `to` from the folder of `from`, both paths of the workspace's index; `.` for the file itself. */
export function relativeTo(from: string, to: string): string {
  const parts = (path: string): string[] => path.split('/').filter((part) => part !== '' && part !== '.');
  const [a, b] = [parts(from), parts(to)];
  if (a.join('/') === b.join('/')) return SELF;
  const folder = a.slice(0, -1);
  let shared = 0;
  while (shared < folder.length && shared < b.length - 1 && folder[shared] === b[shared]) shared += 1;
  return [...folder.slice(shared).map(() => '..'), ...b.slice(shared)].join('/');
}

/**
 * The file a relation's target names, as the document names its other files (`.` for itself): a path as it is written,
 * a link as it resolves in the workspace, or the finding of a link that does not resolve. Nothing for a link while
 * the document is in no workspace, unless it is a link to the document's own id.
 */
export function fileOfTarget(target: string, model: Model, linking: TableLinking | undefined): { readonly file?: string; readonly finding?: LinkFinding } {
  if (target === '') return {};
  if (target === SELF || !isLink(target)) return { file: target };
  const own = ownIdOf(model);
  const link = parseLink(target);
  if (link && own !== '' && link.documentId === own) return { file: SELF };
  if (!linking) return {};
  const { resolved, finding } = linking.links.resolve(target);
  if (finding) return { finding };
  return { file: resolved.path === linking.path ? SELF : relativeTo(linking.path, resolved.path) };
}

/** The file name a document of the workspace is linked to by: its own, without its folder. */
const nameOf = (file: string): string => fileNameOf(file.replace(/\\/g, '/'));

/** How a relation names a target file that has a document id: a link to its document. */
export const targetLink = (documentId: string, file: string): string => linkText(linkToDocument(documentId, nameOf(file)));

/**
 * How a relation holds a related row of a target with a document id: a link to it, named by the target's title
 * property and the row's title as load-time validation would write them, or by its id alone when the target holds
 * no such row. While the target has no document id, the row's id.
 */
export function rowLink(target: RelatedTable, file: string, row: string): string {
  const documentId = ownIdOf(target.model);
  if (documentId === '') return row;
  const title = titleOf(target.model);
  const found = target.rows.find((candidate) => candidate.id === row);
  return linkText(found === undefined || title === undefined
    ? linkToElement(documentId, nameOf(file), row)
    : linkToElement(documentId, nameOf(file), row, text(title.attributes.name), found.name));
}

/**
 * A knowledge file as the index of links holds it (FBL 17.3): its rows can be linked to, each named by the title
 * property's value under its name; the links it holds are the related rows of its cells, each held by its row.
 */
export function indexed(table: TableData, path: string): IndexedDocument {
  const title = titleOf(table.model);
  const documentId = ownIdOf(table.model);
  const rowOfCell = new Map(table.model.elements.filter((element) => element.type === 'Cell').map((cell) => [cell.id, cell.parent ?? '']));
  const links = table.model.elements.flatMap((element) => {
    const written = element.type === 'CellItem' ? text(element.attributes.row) : '';
    const row = element.parent === undefined ? undefined : rowOfCell.get(element.parent);
    return isLink(written) && row !== undefined ? [{ holder: row, text: written }] : [];
  });
  return {
    path, ...(documentId === '' ? {} : { documentId }), ...(title === undefined ? {} : { nameProperty: text(title.attributes.name) }),
    elements: table.rows.map((row) => ({ id: row.id, attributes: title === undefined ? [] : [[text(title.attributes.name), row.title] as const] })),
    links,
  };
}

/**
 * The backlink columns of a document (`knowledge.md`, "Backlinks"; FBL 17.5): for each relation of the workspace's
 * knowledge files, this one among them, whose target is this document and which names a `backlinkName`, a column of
 * that name that shows, per row, the rows of that relation's file that link to it. Each is a property of the model
 * as it is shown, computed and read-only, stored in neither file.
 */
export function backlinkColumns(table: TableData): ModelElement[] {
  const own = ownIdOf(table.model);
  if (own === '') return [];
  const sources: { readonly file: string; readonly model: Model }[] = [
    { file: SELF, model: table.model },
    ...(table.peers ?? []).flatMap((peer) => {
      const read = table.related?.(peer);
      return read ? [{ file: peer, model: read.model }] : [];
    }),
  ];
  const columns: ModelElement[] = [];
  for (const source of sources) {
    for (const property of relationsOf(source.model)) {
      const name = text(property.attributes.backlinkName).trim();
      const target = text(property.attributes.targetFile);
      if (property.attributes.computed === true || name === '' || !isLink(target) || parseLink(target)?.documentId !== own) continue;
      columns.push({
        id: `${property.id}${BACKLINK_MARK}${source.file === SELF ? own : ownIdOf(source.model) || source.file}`, type: 'Property',
        attributes: { name, valueType: 'relation', targetFile: source.file, computed: true, counterpart: property.id },
        host: {}, ephemeral: true, line: 0,
      });
    }
  }
  return columns;
}

/** Whether a property is a backlink column, which is shown and never written. */
export const isBacklinkColumn = (id: string): boolean => id.includes(BACKLINK_MARK);

/** What loading a file for editing writes of it, as one step: the root's attributes past their `readOnly`, and the changes of the model. */
export interface Conversion {
  readonly migrate: Readonly<Record<string, Value>>;
  readonly changes: readonly Change[];
}

/**
 * What loading a knowledge file for editing in a workspace changes in it (FBL 17.4; `knowledge.md`, the conversion of
 * a file made before links): its document id when it has none, each relation whose target has a document id
 * converted to links, a counterpart that no relation made before links names any more removed, and each link that
 * resolves to something other than it says refreshed. Nothing is written to another file. `version` is the DED
 * version the file says it is of; `fileName` its own name.
 */
export function conversion(table: TableData, version: string, fileName: string, newDocumentId: () => string): Conversion {
  const { model, linking } = table;
  const migrate: Record<string, Value> = {};
  let own = ownIdOf(model);
  if (own === '') {
    own = newDocumentId();
    migrate.documentId = own;
  }
  const changes: Change[] = [];
  const itself: RelatedTable = { rows: table.rows.map((row) => ({ id: row.id, name: row.title })), model: { ...model, diagram: { ...model.diagram, documentId: own } } };
  // The relations made before links whose target now has an id, converted: by the property's id, the target and its file.
  const converted = new Map<string, { readonly target: RelatedTable; readonly file: string }>();
  const stillOld: ModelElement[] = [];
  for (const property of relationsOf(model).filter((candidate) => candidate.attributes.computed !== true)) {
    const written = text(property.attributes.targetFile);
    if (isLink(written)) {
      const refreshed = linking?.links.resolve(written).resolved?.refreshed;
      const now = refreshed === undefined ? written : linkText(refreshed);
      if (now !== written) changes.push({ kind: 'set', id: property.id, attributes: { targetFile: now } });
      continue;
    }
    const file = written === SELF ? fileName : written;
    const target = written === SELF ? itself : table.related?.(written);
    if (!target || ownIdOf(target.model) === '') {
      stillOld.push(property);
      continue;
    }
    const attributes: Record<string, Value | null> = { targetFile: targetLink(ownIdOf(target.model), file) };
    const counterpart = text(property.attributes.counterpart);
    if (counterpart !== '') {
      attributes.counterpart = null;
      const named = target.model.elements.find((element) => element.id === counterpart && element.type === 'Property');
      if (named !== undefined && text(named.attributes.name) !== '') attributes.backlinkName = text(named.attributes.name);
    }
    changes.push({ kind: 'set', id: property.id, attributes });
    converted.set(property.id, { target, file });
  }
  // Every related row: converted to a link where its relation is, else refreshed where it is a link.
  const propertyOfCell = new Map(model.elements.filter((element) => element.type === 'Cell').map((cell) => [cell.id, text(cell.attributes.property)]));
  for (const item of model.elements.filter((element) => element.type === 'CellItem' && text(element.attributes.row) !== '')) {
    const written = text(item.attributes.row);
    const into = converted.get(item.parent === undefined ? '' : propertyOfCell.get(item.parent) ?? '');
    let now = written;
    if (into !== undefined && !isLink(written)) now = rowLink(into.target, into.file, written);
    else if (into === undefined && isLink(written)) {
      const refreshed = linking?.links.resolve(written).resolved?.refreshed;
      if (refreshed !== undefined) now = linkText(refreshed);
    }
    if (now !== written) changes.push({ kind: 'set', id: item.id, attributes: { row: now } });
  }
  // A counterpart that no relation made before links names any more is the backlink column it already was: it goes.
  for (const property of relationsOf(model).filter((candidate) => candidate.attributes.computed === true && text(candidate.attributes.counterpart) !== '')) {
    const counterpart = text(property.attributes.counterpart);
    const namedHere = stillOld.some((old) => text(old.attributes.counterpart) === property.id);
    const target = text(property.attributes.targetFile);
    const other = target === SELF ? undefined : isLink(target) ? undefined : table.related?.(target)?.model;
    const namedThere = other?.elements.some((element) => element.id === counterpart && element.type === 'Property' && !isLink(text(element.attributes.targetFile)) && text(element.attributes.counterpart) === property.id) === true;
    if (!namedHere && !namedThere) changes.push({ kind: 'remove', id: property.id });
  }
  if ((changes.length > 0 || Object.keys(migrate).length > 0) && version !== LINKED_VERSION) migrate.version = LINKED_VERSION;
  return { migrate, changes };
}
