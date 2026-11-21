// The relations of the Knowledge designer (etalii.adp `definitions/designers/knowledge.md`,
// "Relations and the steps that write two files"): a relation property names its target file by a
// path relative to its own (`.` for itself) and holds, per cell, row ids of that file, which the
// designer resolves and shows by their titles. DESL cannot say this, because the target is another
// file; the companion leaves it to each host, with the two findings that only a host can raise.

import type { Model, ModelElement, Value } from '../../disl/model';
import type { Change } from '../../disl/behavior';
import type { TableAcross, TableData, TableFound, TableRelation, TableStep } from '../../tool/tableView';

const text = (value: Value | undefined): string => (value === undefined || value === null ? '' : String(value));
const SELF = '.';

/** The relation properties of a document, a computed counterpart among them. */
const relationsOf = (model: Model): ModelElement[] =>
  model.elements.filter((element) => element.type === 'Property' && element.attributes.valueType === 'relation' && text(element.attributes.targetFile) !== '');

/** The files other than itself that a document's relations name, each once: a counterpart's too, which its rows come from. */
export function targets(model: Model): string[] {
  return [...new Set(relationsOf(model).map((property) => text(property.attributes.targetFile)).filter((file) => file !== SELF))];
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
    const file = text(property.attributes.targetFile);
    const other = file === SELF ? { rows: table.rows.map((row) => ({ id: row.id, name: row.title })), model: table.model } : table.related?.(file);
    const rows = other?.rows;
    if (property.attributes.computed !== true) {
      held[property.id] = { file, single: property.attributes.limit === 'one', ...(rows ? { rows } : {}) };
      continue;
    }
    held[property.id] = { file, single: false, readOnly: COMPUTED, ...(rows ? { rows } : {}), ...(other ? { values: pointingAt(other.model, text(property.attributes.counterpart)) } : {}) };
  }
  return held;
}

/** The rows of a document whose cell of a relation names each row of another: by the row named. */
function pointingAt(model: Model, property: string): Record<string, string[]> {
  const cells = new Map(model.elements.filter((element) => element.type === 'Cell' && element.attributes.property === property).map((cell) => [cell.id, cell.parent ?? '']));
  const values: Record<string, string[]> = {};
  for (const item of model.elements) {
    const row = item.type === 'CellItem' && item.parent !== undefined ? cells.get(item.parent) : undefined;
    const named = text(item.attributes.row);
    if (row === undefined || named === '') continue;
    const rows = (values[named] ??= []);
    if (!rows.includes(row)) rows.push(row);
  }
  return values;
}

/**
 * The host's two findings of relations (`knowledge.md`, Findings): `knowledge.unresolved-target` on a
 * relation whose file is missing, unreadable or not a knowledge file, and `knowledge.unresolved-row`
 * on a value naming a row its file does not hold. Neither removes a value. Where the host gives no
 * other file, nothing is said of one.
 */
export function findings(table: TableData, held: Readonly<Record<string, TableRelation>>): TableFound[] {
  const found: TableFound[] = [];
  const names = new Map(table.properties.map((property) => [property.id, property.name]));
  for (const [id, relation] of Object.entries(held)) {
    if (relation.values !== undefined || relation.readOnly !== undefined) {
      if (!relation.rows && table.related) found.push({ code: 'knowledge.unresolved-target', severity: 'warning', element: id, message: `${names.get(id) ?? id} relates to ${relation.file}, which is missing, cannot be read or is not a knowledge file.` });
      continue;
    }
    const shown = relation.file === SELF ? 'this file' : relation.file;
    if (!relation.rows) {
      if (table.related) found.push({ code: 'knowledge.unresolved-target', severity: 'warning', element: id, message: `${names.get(id) ?? id} relates to ${relation.file}, which is missing, cannot be read or is not a knowledge file. Its values are kept.` });
      continue;
    }
    const known = new Set(relation.rows.map((row) => row.id));
    for (const row of table.rows) {
      for (const item of row.cells[id]?.items ?? []) {
        if (!known.has(item.value)) found.push({ code: 'knowledge.unresolved-row', severity: 'warning', element: item.id, message: `${item.value} is no row of ${shown}. The value is kept.` });
      }
    }
  }
  return found;
}

/** `name` when no other is called that, ignoring case, else with the smallest number from 2 that none has (DESL 9.4). */
function uniqueName(name: string, names: readonly string[]): string {
  const taken = new Set(names.map((other) => other.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  let count = 2;
  while (taken.has(`${name} ${count}`.toLowerCase())) count++;
  return `${name} ${count}`;
}

const propertyNames = (model: Model): string[] => model.elements.filter((element) => element.type === 'Property').map((element) => text(element.attributes.name));
const UNREAD = (file: string): string => `${file} is missing, cannot be read or is not a knowledge file, so neither file is changed.`;
export const CHOOSE_OTHER_SIDE = 'Choose whether the other side of the relation goes too or stays as a one-way relation.';

/**
 * The steps of `knowledge.md` that write two files, beyond what the operation itself does: a two-way
 * relation made, with its other side in the target, and one side of it deleted, with the other
 * deleted too or kept as a one-way relation, as the user chose (`otherSide`). Each is planned in
 * full before either file is written. Any other operation writes one file.
 */
export function across(step: TableStep): TableAcross | { readonly refused: string } | undefined {
  if (step.operation === 'createRelation') return twoWay(step);
  if (step.operation === 'deleteProperty') return oneSideDeleted(step);
  return undefined;
}

/** A relation asked for with the name of its other side: that side added to the target, computed, each side naming the other. */
function twoWay(step: TableStep): TableAcross | { readonly refused: string } | undefined {
  const name = text(step.args.counterpartName).trim();
  const property = step.after.elements.find((element) => element.type === 'Property' && step.created.includes(element.id));
  if (name === '' || !property) return undefined;
  const file = text(property.attributes.targetFile);
  const self = file === SELF;
  const target = self ? step.after : step.related?.(file)?.model;
  if (!target) return { refused: UNREAD(file) };
  const other = step.newId('Property');
  const here: Change[] = [{ kind: 'set', id: property.id, attributes: { counterpart: other } }];
  const side: Change = {
    kind: 'add', id: other, type: 'Property',
    attributes: { name: uniqueName(name, propertyNames(target)), valueType: 'relation', targetFile: self ? SELF : step.back(file), computed: true, counterpart: property.id },
  };
  return self ? { file, here: [...here, side], there: [] } : { file, here, there: [side] };
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

/** The target of a new relation: this file first, then each other knowledge file the host knows of (spec 080, FR-006). */
export function choices(table: TableData): Record<string, Record<string, { value: string; label: string }[]>> {
  return { createRelation: { targetFile: [{ value: SELF, label: 'This file' }, ...(table.peers ?? []).map((peer) => ({ value: peer, label: peer }))] } };
}
