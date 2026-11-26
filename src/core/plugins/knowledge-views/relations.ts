// The relations of the Knowledge designer (etalii.adp `definitions/designers/knowledge.md`,
// "Relations and the steps that write two files"): a relation names its target file by a link to its
// document, or, in a file made before links, by a path relative to its own (`.` for itself), and holds,
// per cell, links to rows of that file, or their ids, which the designer resolves and shows by their
// titles. DESL cannot say this, because the target is another file; the companion leaves it to each host,
// with the findings that only a host can raise.

import type { Model, ModelElement } from '../../disl/model';
import type { Change } from '../../disl/behavior';
import { parseLink } from '../../fbl/links/link';
import type { TableAcross, TableConfirm, TableData, TableFound, TableLinking, TableRelation, TableStep } from '../../tool/tableView';
import { diagramChoices, diagramOf, elementsOf, oneWay } from './diagrams';
import { fileOfTarget, isLink, ownIdOf, relationsOf, rowIdOf, rowLink, SELF, targetLink, text } from './links';

/** The files other than itself that a document's relations name, each once, as it names them: a counterpart's too, which its rows come from. */
export function targets(model: Model, linking?: TableLinking): string[] {
  return [...new Set(relationsOf(model).flatMap((property) => fileOfTarget(text(property.attributes.targetFile), model, linking).file ?? []).filter((file) => file !== SELF))];
}

const COMPUTED = 'The other side of a two-way relation is duplicated from its own table.';

/**
 * Each relation of the table, by its property's id: its file, whether it holds one row, and that
 * file's rows by title. The other side of a two-way relation holds nothing and shows, for each row,
 * the rows of its file whose side names it (`knowledge.md`, two-way relations).
 */
export function relations(table: TableData): Record<string, TableRelation> {
  const held: Record<string, TableRelation> = {};
  for (const property of relationsOf(table.model)) {
    const written = text(property.attributes.targetFile);
    const file = fileOfTarget(written, table.model, table.linking).file;
    const other = file === SELF ? { rows: table.rows.map((row) => ({ id: row.id, name: row.title })), model: table.model } : file === undefined ? undefined : table.related?.(file);
    // A target that is no knowledge file may be a diagram, whose elements the cells link to (spec 092, FR-025).
    const diagram = other === undefined && file !== undefined && file !== SELF ? diagramOf(written, table) : undefined;
    const rows = other?.rows ?? (diagram === undefined ? undefined : elementsOf(diagram));
    // A link that does not resolve names its file by the name it caches.
    const named = file ?? (isLink(written) ? parseLink(written)?.documentName ?? written : written);
    if (property.attributes.computed !== true) {
      held[property.id] = { file: named, single: property.attributes.limit === 'one', idOf: rowIdOf, ...(rows ? { rows } : {}), ...(diagram === undefined ? {} : { elsewhere: named }) };
      continue;
    }
    held[property.id] = { file: named, single: false, readOnly: COMPUTED, idOf: rowIdOf, ...(rows ? { rows } : {}), ...(other ? { values: pointingAt(other.model, text(property.attributes.counterpart)) } : {}) };
  }
  return held;
}

/** The rows of a document whose cell of a relation names each row of another: by the row named. */
function pointingAt(model: Model, property: string): Record<string, string[]> {
  const cells = new Map(model.elements.filter((element) => element.type === 'Cell' && element.attributes.property === property).map((cell) => [cell.id, cell.parent ?? '']));
  const values: Record<string, string[]> = {};
  for (const item of model.elements) {
    const row = item.type === 'CellItem' && item.parent !== undefined ? cells.get(item.parent) : undefined;
    const named = rowIdOf(text(item.attributes.row));
    if (row === undefined || named === '') continue;
    const rows = (values[named] ??= []);
    if (!rows.includes(row)) rows.push(row);
  }
  return values;
}

/**
 * The host's findings of relations (`knowledge.md`, Findings): `knowledge.unresolved-target` on a relation whose
 * file is missing, unreadable or not a knowledge file, `knowledge.unresolved-row` on a value naming a row its file
 * does not hold, and, for a relation or a value that is a link, the link's own finding where it does not resolve
 * (FBL 17.6). None removes a value. Where the host gives no other file, nothing is said of one.
 */
export function findings(table: TableData, held: Readonly<Record<string, TableRelation>>): TableFound[] {
  const found: TableFound[] = [];
  const names = new Map(table.properties.map((property) => [property.id, property.name]));
  const linkFound = (element: string, link: string): boolean => {
    const finding = table.linking?.links.resolve(link).finding;
    if (finding) found.push({ code: finding.code, severity: finding.code === 'link.malformed' ? 'error' : 'warning', element, message: finding.message });
    return finding !== undefined;
  };
  for (const [id, relation] of Object.entries(held)) {
    const property = table.model.elements.find((element) => element.id === id);
    const target = text(property?.attributes.targetFile);
    if (relation.values !== undefined || relation.readOnly !== undefined) {
      if (!relation.rows && table.related && property !== undefined) found.push({ code: 'knowledge.unresolved-target', severity: 'warning', element: id, message: `${names.get(id) ?? id} relates to ${relation.file}, which is missing, cannot be read or is not a knowledge file.` });
      continue;
    }
    if (isLink(target) && linkFound(id, target)) continue;
    const shown = relation.file === SELF ? 'this file' : relation.file;
    if (!relation.rows) {
      if (table.related && !isLink(target)) found.push({ code: 'knowledge.unresolved-target', severity: 'warning', element: id, message: `${names.get(id) ?? id} relates to ${relation.file}, which is missing, cannot be read or is not a knowledge file. Its values are kept.` });
      continue;
    }
    const known = new Set(relation.rows.map((row) => row.id));
    for (const row of table.rows) {
      for (const item of row.cells[id]?.items ?? []) {
        if (isLink(item.value) && table.linking) {
          linkFound(item.id, item.value);
          continue;
        }
        const named = rowIdOf(item.value);
        if (!known.has(named)) found.push({ code: 'knowledge.unresolved-row', severity: 'warning', element: item.id, message: `${named} is no row of ${shown}. The value is kept.` });
      }
    }
  }
  return found;
}

const UNREAD = (file: string): string => `${file} is missing, cannot be read or is not a knowledge file, so neither file is changed.`;
export const CHOOSE_OTHER_SIDE = 'Choose whether the other side of the relation goes too or stays as a one-way relation.';

/**
 * The steps of `knowledge.md` that write two files, beyond what the operation itself does: one side of a
 * two-way relation made before links deleted, with the other deleted too or kept as a one-way relation,
 * as the user chose (`otherSide`). Each is planned in full before either file is written. Any other
 * operation writes one file: a relation's other side is now its backlink column, computed in the target.
 */
export function across(step: TableStep): TableAcross | { readonly refused: string } | { readonly confirm: TableConfirm } | undefined {
  if (step.operation === 'deleteProperty') return oneSideDeleted(step);
  if (step.operation === 'deleteRows' && !step.confirmed) return relating(step);
  if (step.operation === SET_LIMIT) return limited(step);
  if (step.operation === SET_OTHER_SIDE) return otherSide(step);
  if (step.operation === 'createRelation') {
    const here = oneWay(step.after.elements.filter((element) => step.created.includes(element.id)), step);
    return here.length === 0 ? undefined : { file: SELF, here, there: [] };
  }
  return undefined;
}

/**
 * The steps of "Edit relation" (spec 079, FR-011; spec 080, FR-011), which the definition has no
 * operation for: a relation's limit, and whether it has another side. Raised in etalii.adp as a
 * difference; until it is settled, the tool type makes them itself, as the standalone host does.
 */
export const SET_LIMIT = 'setRelationLimit';
export const SET_OTHER_SIDE = 'setRelationOtherSide';
export const ownSteps = [SET_LIMIT, SET_OTHER_SIDE];

export const TO_A_DIAGRAM = 'A diagram has no column to show a relation\'s backlinks in, so a relation to one is one-way.';
const GONE = 'That property is no longer in this table.';
const NOT_OWN = 'That property is not a relation of this table\'s own.';
const PARENT_HOLDS_ONE = 'The parent relation holds one row.';

/** The relation a step is on: one that holds its own values, not the shown side of another table's. */
function ownRelation(step: TableStep): ModelElement | { readonly refused: string } {
  const property = step.before.elements.find((element) => element.id === step.on[0] && element.type === 'Property');
  if (!property) return { refused: GONE };
  return property.attributes.valueType === 'relation' && property.attributes.computed !== true && text(property.attributes.targetFile) !== '' ? property : { refused: NOT_OWN };
}

/** How many rows a relation's cell may hold: one, or any number. A cell that holds more than a new limit of one keeps them. */
function limited(step: TableStep): TableAcross | { readonly refused: string } {
  const property = ownRelation(step);
  if ('refused' in property) return property;
  const one = text(step.args.limit) === 'one';
  if (one === (property.attributes.limit === 'one')) return { file: SELF, here: [], there: [] };
  if (property.attributes.isParent === true) return { refused: PARENT_HOLDS_ONE };
  return { file: SELF, here: [{ kind: 'set', id: property.id, attributes: { limit: one ? 'one' : null } }], there: [] };
}

/**
 * Whether a relation is shown in the file it relates to as well: made two-way, its target shows its backlinks in a
 * column of the name given, or this table's (`backlinkName`); made one-way, it shows none. Neither file holds that
 * column, so only this one is written. A relation made before links with a counterpart in its target keeps the steps
 * it had: made one-way, that counterpart is removed there.
 */
function otherSide(step: TableStep): TableAcross | { readonly refused: string } {
  const property = ownRelation(step);
  if ('refused' in property) return property;
  const twoWay = step.args.twoWay === true || step.args.twoWay === 'true';
  const counterpart = text(property.attributes.counterpart);
  if (counterpart !== '' && !twoWay) {
    const file = text(property.attributes.targetFile);
    const self = file === SELF;
    const target = self ? step.before : step.related?.(file)?.model;
    if (!target) return { refused: UNREAD(file) };
    const other = target.elements.find((element) => element.id === counterpart && element.type === 'Property');
    const mine: Change = { kind: 'set', id: property.id, attributes: { counterpart: null } };
    if (!other) return { file: SELF, here: [mine], there: [] };
    const theirs: Change = { kind: 'remove', id: other.id };
    return self ? { file, here: [mine, theirs], there: [] } : { file, here: [mine], there: [theirs] };
  }
  const named = text(property.attributes.backlinkName);
  if (twoWay === (named !== '' || counterpart !== '')) return { file: SELF, here: [], there: [] };
  if (!twoWay) return { file: SELF, here: [{ kind: 'set', id: property.id, attributes: { backlinkName: null } }], there: [] };
  if (diagramOf(text(property.attributes.targetFile), step) !== undefined) return { refused: TO_A_DIAGRAM };
  const asked = text(step.args.backlinkName ?? step.args.counterpartName).trim();
  const own = text(step.before.diagram.name).trim();
  return { file: SELF, here: [{ kind: 'set', id: property.id, attributes: { backlinkName: asked !== '' ? asked : own !== '' ? own : 'Relation' } }], there: [] };
}

/** A file's name without a leading `./`, so that two spellings of one name compare equal. */
const plain = (file: string): string => file.replace(/^(\.\/)+/, '');

/**
 * Rows deleted that rows of other knowledge files relate to: how many relate, asked before the step
 * is made (`knowledge.md`, Requirement 5.8; spec 080, FR-009). Their values stay, naming nothing.
 */
function relating(step: TableStep): { readonly confirm: TableConfirm } | undefined {
  const kept = new Set(step.after.elements.filter((element) => element.type === 'Row').map((element) => element.id));
  const gone = new Set(step.before.elements.filter((element) => element.type === 'Row' && !kept.has(element.id)).map((element) => element.id));
  if (gone.size === 0) return undefined;
  let count = 0;
  for (const peer of step.peers) {
    const model = step.related?.(peer)?.model;
    if (!model) continue;
    // The side of a two-way relation that holds no values of its own names nothing.
    const own = ownIdOf(step.before);
    const toThis = (target: string): boolean => (isLink(target) ? own !== '' && parseLink(target)?.documentId === own : plain(target) === plain(step.back(peer)));
    const naming = new Set(relationsOf(model).filter((property) => property.attributes.computed !== true && toThis(text(property.attributes.targetFile))).map((property) => property.id));
    if (naming.size === 0) continue;
    const cells = new Map(model.elements.filter((element) => element.type === 'Cell' && naming.has(text(element.attributes.property))).map((cell) => [cell.id, cell.parent ?? '']));
    const rows = new Set(model.elements.filter((item) => item.type === 'CellItem' && item.parent !== undefined && cells.has(item.parent) && gone.has(rowIdOf(text(item.attributes.row)))).map((item) => cells.get(item.parent!)!));
    count += rows.size;
  }
  if (count === 0) return undefined;
  const one = gone.size === 1;
  return {
    confirm: {
      title: one ? 'Delete row' : `Delete ${gone.size} rows`,
      message: `${count === 1 ? '1 row in another table relates' : `${count} rows in other tables relate`} to ${one ? 'this row' : 'these rows'}. Deleting ${one ? 'it' : 'them'} leaves ${count === 1 ? 'that relation' : 'those relations'} pointing at nothing.`,
      confirmLabel: 'Delete', danger: true,
    },
  };
}

/** One side of a two-way relation deleted: the other goes too, or stays as a one-way relation that holds the values it showed. */
function oneSideDeleted(step: TableStep): TableAcross | { readonly refused: string } | undefined {
  const property = step.before.elements.find((element) => element.id === step.on[0] && element.type === 'Property');
  const counterpart = text(property?.attributes.counterpart);
  if (!property || property.attributes.valueType !== 'relation' || counterpart === '') return undefined;
  const file = text(property.attributes.targetFile);
  const self = file === SELF;
  const target = self ? step.before : step.related?.(file)?.model;
  const other = target?.elements.find((element) => element.id === counterpart && element.type === 'Property');
  if (!other) return undefined;
  const choice = text(step.args.otherSide);
  const theirs: Change[] = [];
  if (choice === 'delete') {
    theirs.push({ kind: 'remove', id: other.id });
  } else if (choice === 'keep' && other.attributes.computed !== true) {
    // It holds the values already: it only stops naming the side that goes.
    theirs.push({ kind: 'set', id: other.id, attributes: { counterpart: null } });
  } else if (choice === 'keep') {
    // It showed the values of the side that goes: they become its own, row by row.
    theirs.push({ kind: 'set', id: other.id, attributes: { counterpart: null, computed: null } });
    for (const [row, naming] of Object.entries(pointingAt(step.before, property.id))) {
      if (!target!.elements.some((element) => element.id === row && element.type === 'Row')) continue;
      const cell = `${row}/${other.id}`;
      theirs.push({ kind: 'add', id: cell, type: 'Cell', attributes: { property: other.id }, parent: row, slot: 'cells' });
      for (const value of naming) theirs.push({ kind: 'add', id: `${cell}/${value}`, type: 'CellItem', attributes: { row: value }, parent: cell, slot: 'items' });
    }
  } else {
    return { refused: CHOOSE_OTHER_SIDE };
  }
  return self ? { file, here: theirs, there: [] } : { file, here: [], there: theirs };
}

/**
 * The target of a new relation: this file first, then each other knowledge file the host knows of (spec 080, FR-006),
 * each as a link to its document where it has a document id (spec 089), else by its path, as a file made before links
 * names it.
 */
export function choices(table: TableData): Record<string, Record<string, { value: string; label: string }[]>> {
  const own = ownIdOf(table.model);
  const self = own !== '' && table.linking ? targetLink(own, table.linking.path) : SELF;
  return {
    createRelation: {
      targetFile: [{ value: self, label: 'This file' }, ...(table.peers ?? []).map((peer) => {
        const other = table.related?.(peer);
        const id = other === undefined ? '' : ownIdOf(other.model);
        return { value: id === '' ? peer : targetLink(id, peer), label: peer };
      }), ...diagramChoices(table)],
    },
  };
}

/**
 * What a related row picked in a relation's cell is written as (`knowledge.md`, the relation picker): a link to it
 * where the relation's target is a link, else its id, as a file made before links holds it. A value taken away is
 * the one the cell holds for that row, as it is written.
 */
export function itemValue(table: TableData, property: string, row: string, value: string, present: boolean): string {
  const element = table.model.elements.find((candidate) => candidate.id === property && candidate.type === 'Property');
  if (!element || element.attributes.valueType !== 'relation') return value;
  if (!present) {
    const held = table.rows.find((candidate) => candidate.id === row)?.cells[property]?.items ?? [];
    return held.find((item) => rowIdOf(item.value) === value)?.value ?? value;
  }
  const target = text(element.attributes.targetFile);
  if (!isLink(target)) return value;
  const file = fileOfTarget(target, table.model, table.linking).file;
  const other = file === SELF ? { rows: table.rows.map((candidate) => ({ id: candidate.id, name: candidate.title })), model: table.model } : file === undefined ? undefined : table.related?.(file);
  if (other === undefined || file === undefined) return value;
  return rowLink(other, file === SELF ? table.linking?.path ?? parseLink(target)?.documentName ?? '' : file, value);
}

/**
 * The relations' files named anew when files move (`knowledge.md`, "Rename or move a target file";
 * spec 080, FR-010): each `targetFile` whose file moved, or that the document's own move changes.
 */
export function retarget(model: Model, moved: (file: string) => string | undefined): Change[] {
  const changes: Change[] = [];
  for (const property of relationsOf(model)) {
    const file = text(property.attributes.targetFile);
    if (file === SELF) continue;
    const now = moved(file);
    if (now !== undefined && now !== file) changes.push({ kind: 'set', id: property.id, attributes: { targetFile: now } });
  }
  return changes;
}
