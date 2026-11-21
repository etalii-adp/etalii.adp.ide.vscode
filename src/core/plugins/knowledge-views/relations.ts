// The relations of the Knowledge designer (etalii.adp `definitions/designers/knowledge.md`,
// "Relations and the steps that write two files"): a relation property names its target file by a
// path relative to its own (`.` for itself) and holds, per cell, row ids of that file, which the
// designer resolves and shows by their titles. DESL cannot say this, because the target is another
// file; the companion leaves it to each host, with the two findings that only a host can raise.

import type { Model, ModelElement, Value } from '../../disl/model';
import type { TableData, TableFound, TableRelation } from '../../tool/tableView';

const text = (value: Value | undefined): string => (value === undefined || value === null ? '' : String(value));
const SELF = '.';

/** The relation properties of a document, a computed counterpart among them. */
const relationsOf = (model: Model): ModelElement[] =>
  model.elements.filter((element) => element.type === 'Property' && element.attributes.valueType === 'relation' && text(element.attributes.targetFile) !== '');
/** Those that hold values: a computed counterpart shows the rows that point at it and holds none. */
const relationsIn = (model: Model): ModelElement[] => relationsOf(model).filter((property) => property.attributes.computed !== true);

/** The files other than itself that a document's relations name, each once: a counterpart's too, which its rows come from. */
export function targets(model: Model): string[] {
  return [...new Set(relationsOf(model).map((property) => text(property.attributes.targetFile)).filter((file) => file !== SELF))];
}

/** Each relation of the table, by its property's id: its file, whether it holds one row, and that file's rows by title. */
export function relations(table: TableData): Record<string, TableRelation> {
  const held: Record<string, TableRelation> = {};
  for (const property of relationsIn(table.model)) {
    const file = text(property.attributes.targetFile);
    const rows = file === SELF ? table.rows.map((row) => ({ id: row.id, name: row.title })) : table.related?.(file);
    held[property.id] = { file, single: property.attributes.limit === 'one', ...(rows ? { rows } : {}) };
  }
  return held;
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
