import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import type { TableEntry, TableMenu, TableRequest } from '../../../src/core/tool/tableView';
import { applied, definitionOf, designerOf, spliced } from '../tool/support';

// The gestures of the Knowledge designer's table surface (etalii.adp spec 079, FR-001 to FR-012):
// each an operation of `knowledge.des`, in the standalone host's order and words.

const type = designerOf(definitionOf('knowledge'), registry);
const example = (name: string): Source => ({ fileName: name, text: readFileSync(`examples/knowledge/${name}`, 'utf8') });
const ids = (menu: TableMenu | undefined): string[][] => (menu ?? []).map((group) => group.map((entry) => entry.id));
const find = (menu: TableMenu | undefined, id: string): TableEntry => (menu ?? []).flat().find((entry) => entry.id === id)!;
const textOf = (source: Source, request: TableRequest): string => spliced(source.text, applied(type.edit(source, request, {}, true)).splices);

describe('the gestures of a Knowledge table', () => {
  const source = example('cities.yaml');
  const gestures = type.view(source, {}).gestures!;

  it('gives every column the standalone menu, in its groups and order', () => {
    expect(ids(gestures.columnMenus?.p2)).toEqual([
      ['rename', 'changeType', 'options'],
      ['filter', 'sortAscending', 'sortDescending', 'group'],
      ['hide', 'wrap', 'freeze'],
      ['insertLeft', 'insertRight', 'duplicate', 'delete'],
    ]);
    // Only a selection has options to edit.
    expect(ids(gestures.columnMenus?.p3)[0]).toEqual(['rename', 'changeType']);
  });

  it('marks what the title column cannot do with the reason, and what the definition refuses with its sentence', () => {
    expect(find(gestures.columnMenus?.p1, 'hide').disabled).toBe('The column that names a row is always there.');
    expect(find(gestures.columnMenus?.p1, 'delete').disabled).toBe('The title property cannot be deleted.');
    expect(find(gestures.columnMenus?.p3, 'delete').disabled).toBeUndefined();
    const single = example('provinces.yaml');
    expect(find(type.view(single, {}).gestures?.viewMenus?.w1, 'delete').disabled).toBe('A table keeps at least one view.');
    expect(find(gestures.viewMenus?.v1, 'delete').disabled).toBeUndefined();
  });

  it('hides a column and keeps its width', () => {
    const hide = find(gestures.columnMenus?.p3, 'hide').request!;
    expect(hide).toMatchObject({ operation: 'setColumn', on: ['v1'], args: { property: 'p3', visible: false, width: 120 } });
    expect(type.view({ ...source, text: textOf(source, hide) }, {}).properties.find((property) => property.id === 'p3')).toMatchObject({ visible: false, width: 120 });
  });

  it('offers a new property of every type, after the last', () => {
    expect(gestures.newProperty?.map((entry) => entry.id)).toEqual(['text', 'number', 'checkbox', 'date', 'dateTime', 'time', 'selection', 'multipleSelection', 'relation']);
    expect(gestures.newProperty?.[1].request).toMatchObject({ operation: 'addProperty', args: { valueType: 'number', after: 'p9' } });
  });

  it('says the sorts and filters in words, each with what removes it', () => {
    expect(gestures.items?.map((item) => [item.kind, item.text, item.descending ?? false])).toEqual([['sort', 'Population', true], ['filter', 'Country is Netherlands', false]]);
    const removed = textOf(source, gestures.items![0].remove!);
    expect(type.view({ ...source, text: removed }, {}).gestures?.items?.map((item) => item.kind)).toEqual(['filter']);
  });

  it('makes a row under a group with the group\'s value, as one edit', () => {
    const request = gestures.newRowIn!.o1;
    expect(request.kind).toBe('steps');
    const after = type.view({ ...source, text: textOf(source, request) }, {});
    const made = after.rows.find((row) => !type.view(source, {}).rows.some((known) => known.id === row.id));
    expect(made?.cells.p2?.value).toBe('o1');
  });

  it('gives a read-only table no gestures', () => {
    const broken = type.view({ ...source, text: `${source.text}\u0000` }, {});
    expect(broken.readOnly).toBe(true);
    expect(broken.gestures).toBeUndefined();
  });
});
