import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { encode } from '../../../src/core/fbl/text/utf8';
import type { Source } from '../../../src/core/frame/toolType';
import { pluginRegistry } from '../../../src/core/tool/pluginRegistry';
import { toolTypesFrom } from '../../../src/core/tool/toolTypeFrom';
import { allFolders, applied, noPlugins, spliced, type TableDesigner } from './support';

// Adding a tool type needs no code (etalii.adp spec 027, task T105; FR-005, SC-005): DESL's own
// smallest example, `minimal-table.des` with its binding, put into a folder of definitions that
// exists only here, is a tool type that opens a document, with nothing written for it and no plugin.

const files = new Map<string, Uint8Array>([
  ['minimal-table.des', new Uint8Array(readFileSync('fixtures/tools/desl/minimal-table.des'))],
  ['minimal-table.fbl', new Uint8Array(readFileSync('fixtures/tools/desl/minimal-table.fbl'))],
  ['minimal-table.md', encode('# Reading list\n\nDESL\'s smallest example.\n')],
  ['PROVENANCE.md', encode('| File | Repository | Path | Commit | SHA-256 |\n|---|---|---|---|---|\n')],
]);
const folders = (): Map<string, ReadonlyMap<string, Uint8Array>> => new Map<string, ReadonlyMap<string, Uint8Array>>([...allFolders(), ['minimal-table', files]]);
const registry = pluginRegistry(noPlugins);

describe('a tool type that is added by its definition alone', () => {
  const read = toolTypesFrom(folders(), registry);
  const type = read.types.find((candidate) => candidate.origin === 'example/reading-list') as TableDesigner | undefined;

  it('is a tool type beside those of definitions/, and none of them is skipped for it', () => {
    expect(read.skipped.filter((skipped) => skipped.folder === 'minimal-table')).toEqual([]);
    expect(type).toBeDefined();
    expect([type!.kind, type!.displayName]).toEqual(['designer', 'Reading list']);
    expect(type!.claims).toEqual([{ extensions: ['yaml', 'yml'], shared: true, marker: true, registrationOnly: false }]);
    expect(toolTypesFrom(allFolders(), registry).types.some((candidate) => candidate.origin === 'example/reading-list')).toBe(false);
  });

  it('gives a new document, which opens with what the binding\'s template holds', () => {
    const source: Source = { fileName: 'books.yaml', text: type!.newDocument('books.yaml') };
    expect(type!.claimed(source.fileName, source.text)).toBe(true);
    expect(type!.findings(source)).toEqual([]);
    const shown = type!.view(source, {});
    expect(shown.properties.map((property) => [property.name, property.valueType, property.editor])).toEqual([['Title', 'text', 'text']]);
    expect(shown.views.map((tab) => [tab.name, tab.active])).toEqual([['All books', true]]);
    expect(shown.rows).toEqual([]);
  });

  it('runs the definition\'s operation and edits a cell, each as splices of the document', () => {
    const source: Source = { fileName: 'books.yaml', text: type!.newDocument('books.yaml') };
    expect(type!.actions(source, []).map((action) => action.label)).toEqual(['New book']);
    const added = { ...source, text: spliced(source.text, applied(type!.edit(source, { kind: 'operation', operation: 'addBook' }, {}, false)).splices) };
    const [book] = type!.view(added, {}).rows;
    const [field] = type!.view(added, {}).properties;
    const titled = { ...added, text: spliced(added.text, applied(type!.edit(added, { kind: 'cell', row: book.id, property: field.id, value: 'Dune' }, {}, false)).splices) };
    expect(type!.view(titled, {}).rows.map((row) => row.cells[field.id].text)).toEqual(['Dune']);
    expect(titled.text.endsWith(`books:\n  - id: ${book.id}\n    values:\n      - field: ${field.id}\n        text: Dune\n`)).toBe(true);
    expect(type!.findings(titled)).toEqual([]);
  });

  it('is not claimed by a file of another designer, and claims none of another\'s', () => {
    expect(type!.claimed('cities.yaml', readFileSync('examples/knowledge/cities.yaml', 'utf8'))).toBe(false);
  });
});
