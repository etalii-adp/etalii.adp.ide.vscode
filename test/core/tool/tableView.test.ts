import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import type { TableRequest, TableView } from '../../../src/core/tool/tableView';
import { applied, definitionOf, designerOf, object, specificationOf, spliced } from './support';

// What a designer shows (etalii.adp spec 027, task T103; DESL 7): the table view a tool type made
// from a `.des` definition gives of a document. The columns, the rows, the cells and the views are
// read from the surface; the view that is shown is applied by what this host carries for the tool
// type, because DESL names the types of a view's settings and not what they mean. What a test
// expects is the Cities example's own content, and the operations are counted from the definition.

const folder = 'knowledge';
const specification = specificationOf(folder);
const type = designerOf(definitionOf(folder), registry);
const cities: Source = { fileName: 'cities.yaml', text: readFileSync('examples/knowledge/cities.yaml', 'utf8') };
const view = (source: Source = cities): TableView => type.view(source, {});
const after = (source: Source, request: TableRequest): Source => ({ ...source, text: spliced(source.text, applied(type.edit(source, request, {}, true)).splices) });
const rowsOf = (shown: TableView): string[] => shown.rows.map((row) => row.cells.p1?.text ?? '');

describe('the table a designer shows', () => {
  const shown = view();

  it('is named as the document is', () => {
    expect(shown.name).toBe('Cities');
    expect(shown.readOnly).toBe(false);
    expect(shown.notice).toBeUndefined();
  });

  it('has a column for each element of the columns\' type, with its name, its value type and how a cell of it is edited', () => {
    expect([...shown.properties].sort((a, b) => a.id.localeCompare(b.id)).map((property) => [property.id, property.name, property.valueType, property.editor, property.many])).toEqual([
      ['p1', 'Name', 'text', 'text', false],
      ['p2', 'Country', 'selection', 'choice', false],
      ['p3', 'Population', 'number', 'number', false],
      ['p4', 'Tags', 'multipleSelection', 'choices', true],
      ['p5', 'Province', 'relation', 'rows', true],
      ['p6', 'Visited', 'checkbox', 'checkbox', false],
      ['p7', 'Founded', 'date', 'date', false],
      ['p8', 'Updated', 'dateTime', 'dateTime', false],
      ['p9', 'Opens', 'time', 'time', false],
    ]);
    expect(shown.properties.filter((property) => property.title).map((property) => property.id)).toEqual(['p1']);
  });

  it('gives a column of options its options, in their order, each with its colour for a light and a dark theme', () => {
    const country = shown.properties.find((property) => property.id === 'p2')!;
    expect(country.options.map((option) => option.name)).toEqual(['Netherlands', 'Belgium', 'Germany', 'France', 'Finland', 'Italy']);
    expect(country.options[0]).toMatchObject({ id: 'o1', colour: { light: expect.stringMatching(/^#[0-9a-f]{6}$/) as string, dark: expect.stringMatching(/^#[0-9a-f]{6}$/) as string } });
    // An option without a colour of its own has none here either: the surface draws it as it draws any text.
    expect(country.options[2].colour).toBeUndefined();
    expect(shown.properties.find((property) => property.id === 'p1')!.options).toEqual([]);
  });

  it('gives each row a cell for each column it has a value for, under the key of the column\'s value type', () => {
    const amsterdam = view({ ...cities, text: cities.text.replace('activeView: v1', 'activeView: v2') }).rows[0];
    expect(amsterdam.id).toBe('r1');
    expect(amsterdam.title).toBe('Amsterdam');
    expect(amsterdam.cells.p1).toMatchObject({ id: 'r1/p1', value: 'Amsterdam', text: 'Amsterdam', items: [] });
    expect(amsterdam.cells.p3).toMatchObject({ value: 931298, text: '931298' });
    expect(amsterdam.cells.p6).toMatchObject({ value: true, text: 'true' });
    expect(amsterdam.cells.p7).toMatchObject({ value: '1275-10-27' });
    expect(amsterdam.cells.p9).toMatchObject({ value: '09:00' });
    // A value that names an option is shown by the option's name.
    expect(amsterdam.cells.p2).toMatchObject({ value: 'o1', text: 'Netherlands' });
    expect(amsterdam.cells.p4.items.map((item) => [item.id, item.value, item.label])).toEqual([['r1/p4/o3', 'o3', 'Port'], ['r1/p4/o4', 'o4', 'Capital']]);
    expect(amsterdam.cells.p4.text).toBe('Port, Capital');
    // A row of another file is the id the file holds: this host reads one file.
    expect(amsterdam.cells.p5.items.map((item) => [item.value, item.label])).toEqual([['nh', 'nh']]);
  });

  it('leaves out the cell of a column a row has no value for', () => {
    const antwerp = view({ ...cities, text: cities.text.replace('activeView: v1', 'activeView: v2') }).rows[1];
    expect(Object.keys(antwerp.cells).sort()).toEqual(['p1', 'p2', 'p4']);
  });

  it('lists the views in their order, and shows the one the document was last left in', () => {
    expect(shown.views).toEqual([{ id: 'v1', name: 'All cities', active: true }, { id: 'v2', name: 'Map', active: false }]);
    const other = view(after(cities, { kind: 'show', view: 'v2' }));
    expect(other.views.map((tab) => tab.active)).toEqual([false, true]);
  });

  it('shows the first view when the document names none, or one it does not have', () => {
    expect(view({ ...cities, text: cities.text.replace('activeView: v1\r\n', '') }).views.map((tab) => tab.active)).toEqual([true, false]);
    expect(view({ ...cities, text: cities.text.replace('activeView: v1', 'activeView: v9') }).views.map((tab) => tab.active)).toEqual([true, false]);
  });
});

describe('the view that is shown', () => {
  const all = view(after(cities, { kind: 'show', view: 'v2' }));
  const first = view();

  it('without settings shows every column in the columns\' order and every row in the rows\' order', () => {
    expect(all.properties.map((property) => property.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
    expect(all.properties.every((property) => property.visible && !property.wrap && !property.frozen && property.width === undefined)).toBe(true);
    expect(rowsOf(all)).toEqual(['Amsterdam', 'Antwerp', 'Sevenum', 'Venlo', 'Berlin', 'Paris', 'Helsinki', 'Venice', 'Ahlen']);
    expect(all.total).toBe(9);
    expect(all.groups).toBeUndefined();
  });

  it('puts the columns it has settings for first, in their order, with their width', () => {
    expect(first.properties.map((property) => property.id)).toEqual(['p3', 'p1', 'p2', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
    expect(first.properties[0]).toMatchObject({ id: 'p3', width: 120, visible: true });
  });

  it('shows the rows its filter keeps, in the order its sorts give, a row without a value last', () => {
    // Country is Netherlands, by population from the largest: Venlo has none.
    expect(rowsOf(first)).toEqual(['Amsterdam', 'Sevenum', 'Venlo']);
    expect(first.total).toBe(9);
  });

  it('sorts the other way, and still puts a row without a value last', () => {
    const ascending = view(after(cities, { kind: 'operation', operation: 'setSortDirection', on: ['v1/sorts/p3'], args: { direction: 'ascending' } }));
    expect(rowsOf(ascending)).toEqual(['Sevenum', 'Amsterdam', 'Venlo']);
  });

  it('keeps a row when any condition holds, where the view says any', () => {
    const more = after(cities, { kind: 'operation', operation: 'addCondition', on: ['v1'], args: { property: 'p1', operator: 'starts-with', text: 'Ber' } });
    expect(rowsOf(view(more))).toEqual([]);
    expect(rowsOf(view(after(more, { kind: 'operation', operation: 'setMatch', on: ['v1'], args: { match: 'any' } })))).toEqual(['Amsterdam', 'Sevenum', 'Venlo', 'Berlin']);
  });

  it.each([
    ['p1', 'contains', { text: 'en' }, ['Sevenum', 'Venlo', 'Venice', 'Ahlen']],
    ['p1', 'is', { text: 'paris' }, ['Paris']],
    ['p1', 'ends-with', { text: 'm' }, ['Amsterdam', 'Sevenum']],
    ['p3', 'greater-than', { number: 345345 }, ['Amsterdam']],
    ['p3', 'at-least', { number: 345345 }, ['Amsterdam', 'Sevenum']],
    ['p3', 'is-empty', {}, ['Antwerp', 'Venlo', 'Berlin', 'Paris', 'Helsinki', 'Venice', 'Ahlen']],
    ['p6', 'is-checked', {}, ['Amsterdam']],
    ['p7', 'is-before', { date: '1300-01-01' }, ['Amsterdam']],
    ['p2', 'is-not', { option: 'o1' }, ['Antwerp', 'Berlin', 'Paris', 'Helsinki', 'Venice', 'Ahlen']],
    ['p4', 'contains', { option: 'o4' }, ['Amsterdam']],
    ['p4', 'is-not-empty', {}, ['Amsterdam', 'Antwerp', 'Sevenum']],
  ])('filters %s by %s', (property, operator, value, expected) => {
    const map = after(cities, { kind: 'show', view: 'v2' });
    const filtered = after(map, { kind: 'operation', operation: 'addCondition', on: ['v2'], args: { property, operator, ...value } });
    expect(rowsOf(view(filtered))).toEqual(expected);
  });

  it('groups the rows by the values of a column, in the order of its options, with the rows without a value last', () => {
    expect(first.groups?.map((group) => [group.key, group.label, group.rows.length])).toEqual([
      ['o1', 'Netherlands', 3], ['o2', 'Belgium', 0], ['b4ff5lo4rezgty4ge7siqndey', 'Germany', 0], ['dn1qx45l0fu88pip2l9ua7joz', 'France', 0],
      ['7h1eyx85f462uj3sb6jlxdxvu', 'Finland', 0], ['2xc52nefzictwc49wy8ldxh7t', 'Italy', 0], ['none', '', 0],
    ]);
    expect(first.groups?.[0].rows).toEqual(first.rows.map((row) => row.id));
  });

  it('hides the groups without rows, hides a group, collapses one and puts them in order, as the view\'s settings say', () => {
    const map = after(cities, { kind: 'show', view: 'v2' });
    const grouped = after(map, { kind: 'operation', operation: 'groupBy', on: ['v2'], args: { property: 'p2' } });
    const keys = (source: Source): unknown => view(source).groups?.map((group) => [group.key, group.rows.length, group.collapsed]);
    expect(keys(grouped)).toEqual([
      ['o1', 3, false], ['o2', 1, false], ['b4ff5lo4rezgty4ge7siqndey', 2, false], ['dn1qx45l0fu88pip2l9ua7joz', 1, false],
      ['7h1eyx85f462uj3sb6jlxdxvu', 1, false], ['2xc52nefzictwc49wy8ldxh7t', 1, false], ['none', 0, false],
    ]);
    const tidy = after(grouped, { kind: 'operation', operation: 'hideEmptyGroups', on: ['v2'], args: { hide: true } });
    expect(view(tidy).groups?.map((group) => group.key)).not.toContain('none');
    const set = (source: Source, slot: string, key: string): Source => after(source, { kind: 'operation', operation: 'setGroup', on: ['v2'], args: { slot, key } });
    const arranged = set(set(set(tidy, 'groupOrder', 'o2'), 'hiddenGroups', 'o1'), 'collapsed', 'o2');
    expect(keys(arranged)).toEqual([
      ['o2', 1, true], ['b4ff5lo4rezgty4ge7siqndey', 2, false], ['dn1qx45l0fu88pip2l9ua7joz', 1, false], ['7h1eyx85f462uj3sb6jlxdxvu', 1, false], ['2xc52nefzictwc49wy8ldxh7t', 1, false],
    ]);
    // The rows of a hidden group are not in sight.
    expect(rowsOf(view(arranged))).not.toContain('Amsterdam');
  });

  it('puts a row with several values under each of them', () => {
    const map = after(cities, { kind: 'show', view: 'v2' });
    const tagged = view(after(map, { kind: 'operation', operation: 'groupBy', on: ['v2'], args: { property: 'p4' } }));
    expect(tagged.groups?.map((group) => [group.label, group.rows.length])).toEqual([['Port', 3], ['Capital', 1], ['', 6]]);
  });

  it('hides a column, wraps one, freezes the columns up to one and says what the line under a column shows', () => {
    const map = after(cities, { kind: 'show', view: 'v2' });
    const hidden = view(after(map, { kind: 'operation', operation: 'setColumn', on: ['v2'], args: { property: 'p5', visible: false, wrap: true } }));
    expect(hidden.properties.find((property) => property.id === 'p5')).toMatchObject({ visible: false, wrap: true });
    const frozen = view(after(map, { kind: 'operation', operation: 'freeze', on: ['v2'], args: { property: 'p2' } }));
    expect(frozen.properties.filter((property) => property.frozen).map((property) => property.id)).toEqual(['p1', 'p2']);
    const summed = view(after(map, { kind: 'operation', operation: 'calculate', on: ['v2'], args: { property: 'p3', calculation: 'sum' } }));
    expect(summed.properties.find((property) => property.id === 'p3')?.calculation).toEqual({ label: 'Sum', text: '1276643' });
    const counted = view(after(map, { kind: 'operation', operation: 'calculate', on: ['v2'], args: { property: 'p3', calculation: 'percentEmpty' } }));
    expect(counted.properties.find((property) => property.id === 'p3')?.calculation).toEqual({ label: 'Percent empty', text: '78%' });
  });

  it('lists the settings of the view that is shown, each as what its operations are for', () => {
    expect(first.settings.map((setting) => [setting.id, setting.role, setting.label])).toEqual([
      ['v1/columns/p3', 'columns', 'Population, 120'],
      ['v1/sorts/p3', 'sorts', 'Population, Descending'],
      ['v1/filter/0', 'conditions', 'Country, is, Netherlands'],
    ]);
  });
});

describe('the operations of a table', () => {
  const declared = object(specification.operations);
  const shown = view();

  it('are those the definition lists, each with its label and its parameters as controls', () => {
    expect(Object.keys(shown.operations)).toEqual(Object.keys(declared));
    for (const [id, operation] of Object.entries(shown.operations)) {
      expect(operation.label, id).toBe(object(declared[id]).label);
      expect(operation.params.map((param) => param.name), id).toEqual(Object.keys(object(object(declared[id]).params)));
    }
  });

  it('give a parameter the control of its type, with the values an enumeration or a type of the document has', () => {
    const params = Object.fromEntries(shown.operations.addProperty.params.map((param) => [param.name, param]));
    expect(params.name).toEqual({ name: 'name', label: 'Name', control: 'text', required: true });
    expect(params.valueType).toMatchObject({ control: 'choice', required: true, value: 'text' });
    expect(params.valueType.options?.map((option) => [option.value, option.label])).toEqual(Object.entries(object(object(object(object(specification.metamodel).enums).ValueType).values)).map(([key, value]) => [key, object(value).label]));
    expect(params.after).toMatchObject({ control: 'choice', required: false });
    expect(params.after.options?.map((option) => option.label)).toEqual(['Name', 'Country', 'Population', 'Tags', 'Province', 'Visited', 'Founded', 'Updated', 'Opens']);
    expect(Object.fromEntries(shown.operations.setColumn.params.map((param) => [param.name, param.control]))).toEqual({ property: 'choice', visible: 'checkbox', width: 'number', wrap: 'checkbox' });
    expect(shown.operations.setDate.params.find((param) => param.name === 'value')?.control).toBe('date');
  });

  it('are offered for the document when nothing is selected, each enabled', () => {
    const offered = type.actions(cities, []);
    const forDocument = Object.entries(declared).filter(([, operation]) => object(operation).for === 'document').map(([id]) => id);
    expect(offered.map((action) => action.id)).toEqual(forDocument);
    expect(offered.every((action) => action.enabled)).toBe(true);
    expect(offered.map((action) => action.label)).toEqual(['New property', 'New relation', 'New row', 'New view']);
  });

  it('are offered for an element of the type each is for, and disabled with the definition\'s reason', () => {
    const forType = (name: string): string[] => Object.entries(declared).filter(([, operation]) => (object(operation).for as unknown[]).includes?.(name)).map(([id]) => id);
    const title = type.actions(cities, ['p1']);
    expect(title.map((action) => action.id)).toEqual(forType('Property'));
    expect(title.find((action) => action.id === 'deleteProperty')).toMatchObject({ label: 'Delete', enabled: false, disabledReason: 'The title property cannot be deleted.' });
    expect(title.find((action) => action.id === 'renameProperty')).toMatchObject({ enabled: true });
    expect(type.actions(cities, ['v1']).map((action) => action.id)).toEqual(forType('View'));
    expect(type.actions(cities, ['v1/sorts/p3']).map((action) => action.id)).toEqual(forType('Sort'));
    expect(type.actions(cities, ['r1/p3']).map((action) => action.id)).toEqual(forType('Cell'));
  });

  it('are offered for several rows where the definition says for the selection', () => {
    expect(type.actions(cities, ['r1', 'r2']).map((action) => [action.id, action.label])).toEqual([['deleteRows', 'Delete']]);
    // One row has what is for a row, and what is for the selection.
    expect(type.actions(cities, ['r1']).map((action) => action.id)).toContain('deleteRows');
    expect(type.actions(cities, ['r1']).map((action) => action.id)).toContain('moveRow');
  });
});

describe('a document that cannot be shown as it is', () => {
  it('is empty and read-only when its text cannot be read, with the reader\'s finding as the notice', () => {
    const broken = view({ fileName: 'cities.yaml', text: 'ded: "0.1"\r\ndesigner: etalii/knowledge\r\nproperties: [\r\n' });
    expect(broken).toMatchObject({ readOnly: true, rows: [], properties: [], views: [] });
    expect(broken.notice).toBeTruthy();
    expect(type.actions({ fileName: 'cities.yaml', text: 'ded: "0.1"\r\ndesigner: etalii/knowledge\r\nproperties: [\r\n' }, [])).toEqual([]);
  });

  it('shows a column of a value type the definition does not have as text that is not edited', () => {
    const odd = view({ ...cities, text: cities.text.replace('type: time', 'type: duration') });
    const column = odd.properties.find((property) => property.id === 'p9')!;
    expect(column).toMatchObject({ valueType: 'duration', readOnly: expect.any(String) as string });
    expect(column.editor).toBeUndefined();
  });

  it('is shown as one view without settings when the document has none', () => {
    const none = view({ fileName: 'small.yaml', text: 'ded: "0.1"\r\ndesigner: etalii/knowledge\r\nname: Small\r\nproperties:\r\n  - id: p1\r\n    name: Name\r\n    type: text\r\n    title: true\r\nrows:\r\n  - id: r1\r\n    cells:\r\n      - property: p1\r\n        text: One\r\n' });
    expect(none.views).toEqual([]);
    expect(rowsOf(none)).toEqual(['One']);
  });
});
