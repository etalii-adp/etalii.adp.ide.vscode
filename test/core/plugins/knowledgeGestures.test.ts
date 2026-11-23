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

  it('changes the value of a condition where the file has its filter, as the standalone host does', () => {
    const value = gestures.settings!.filter.conditions[0].value.request!;
    const written = textOf(source, JSON.parse(JSON.stringify(value).replace('"$typed"', '"o2"')) as TableRequest);
    expect(written).toBe(source.text.replace(/( {4}filter:\r?\n {6}- property: p2\r?\n {8}operator: is\r?\n {8}option: )o1/, '$1o2'));
  });

  it('starts a condition on text with the first comparison `knowledge.md` gives text, is', () => {
    const add = gestures.settings!.filter.add.find((entry) => entry.id === 'p1')!.request!;
    expect(add).toMatchObject({ operation: 'addCondition', args: { property: 'p1', operator: 'is' } });
    expect(gestures.settings!.filter.conditions[0].properties.find((entry) => entry.id === 'p1')!.request).toMatchObject({ steps: [{ operation: 'addCondition', args: { property: 'p1', operator: 'is' } }, { operation: 'removeCondition' }] });
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

describe('the settings control, the options panel and the calculation line of a Knowledge table', () => {
  const source = example('cities.yaml');
  const typed = (request: TableRequest, value: string | number): TableRequest => JSON.parse(JSON.stringify(request), (key, given: unknown) => (given === '$typed' ? value : given)) as TableRequest;
  const viewOf = (text: string) => type.view({ ...source, text }, {});
  const settings = type.view(source, {}).gestures!.settings!;

  it('lists every property with a tick, the title\'s kept set', () => {
    expect(settings.visibility.map((entry) => [entry.id, entry.checked])).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'].map((id) => [id, true]));
    expect(settings.visibility[0].disabled).toBe('The column that names a row is always there.');
    const hidden = viewOf(textOf(source, settings.visibility[3].request!));
    expect(hidden.properties.find((property) => property.id === 'p4')?.visible).toBe(false);
  });

  it('edits a condition\'s value, comparison and property in one step each', () => {
    const [condition] = settings.filter.conditions;
    expect([condition.value.control, condition.value.value, condition.operators.find((entry) => entry.checked)?.id]).toEqual(['choice', 'o1', 'is']);
    const belgium = textOf(source, typed(condition.value.request!, 'o2'));
    expect(viewOf(belgium).gestures?.items?.map((item) => item.text)).toContain('Country is Belgium');
    const not = textOf(source, condition.operators.find((entry) => entry.id === 'is-not')!.request!);
    expect(viewOf(not).gestures?.items?.map((item) => item.text)).toContain('Country is not Netherlands');
    const byName = textOf(source, condition.properties.find((entry) => entry.id === 'p1')!.request!);
    expect(viewOf(byName).gestures?.settings?.filter.conditions[0].operators.find((entry) => entry.checked)?.id).toBe('is');
  });

  it('nests filter groups as deep as the definition allows, and says so past it', () => {
    let text = textOf(source, settings.filter.addGroup!.request!);
    text = textOf({ ...source, text }, viewOf(text).gestures!.settings!.filter.groups[0].addGroup!.request!);
    const inner = viewOf(text).gestures!.settings!.filter.groups[0].groups[0];
    expect(inner.addGroup?.disabled).toBe('Filter groups nest to three levels.');
  });

  it('turns a sort round and removes it', () => {
    const [sort] = settings.sortLines;
    expect([sort.label, sort.direction.find((entry) => entry.checked)?.id]).toEqual(['Population', 'descending']);
    const up = textOf(source, sort.direction[0].request!);
    expect(viewOf(up).gestures?.items?.find((item) => item.kind === 'sort')?.descending).toBe(false);
    expect(settings.addSort.map((entry) => entry.id)).not.toContain('p3');
  });

  it('hides a group, shows every group again, and orders them by name', () => {
    const { groups, showAll, order } = settings.group;
    expect(showAll?.disabled).toBe('No group is hidden.');
    const belgium = groups!.find((entry) => entry.label === 'Belgium')!;
    const hidden = textOf(source, belgium.request!);
    const after = viewOf(hidden).gestures!.settings!.group;
    expect(after.groups!.find((entry) => entry.label === 'Belgium')?.checked).toBe(false);
    expect(viewOf(hidden).groups?.map((group) => group.label)).not.toContain('Belgium');
    expect(viewOf(textOf({ ...source, text: hidden }, after.showAll!.request!)).groups?.map((group) => group.label)).toContain('Belgium');
    const descending = viewOf(textOf(source, order![1].request!)).groups!.map((group) => group.label).filter((label) => label !== '');
    expect(descending).toEqual([...descending].sort().reverse());
  });

  it('renames, recolours and deletes an option in its panel, and adds one', () => {
    const panel = type.view(source, {}).gestures!.options!.p2;
    expect(panel.options.map((option) => option.name)).toEqual(['Netherlands', 'Belgium', 'Germany', 'France', 'Finland', 'Italy']);
    const renamed = textOf(source, typed(panel.options[1].rename, 'België'));
    expect(viewOf(renamed).properties.find((property) => property.id === 'p2')?.options[1].name).toBe('België');
    const added = textOf(source, typed(panel.add, 'Spain'));
    expect(viewOf(added).properties.find((property) => property.id === 'p2')?.options.map((option) => option.name)).toContain('Spain');
    expect(panel.options[0].colours.find((entry) => entry.checked)).toBeDefined();
  });

  it('offers the calculations a column\'s type has, and shows the one chosen', () => {
    const calculations = type.view(source, {}).gestures!.calculations!;
    const ids = (id: string): string[] => calculations[id].flat().map((entry) => entry.id);
    expect(ids('p3')).toContain('sum');
    expect(ids('p1')).not.toContain('sum');
    expect(ids('p7')).toContain('earliest');
    const summed = viewOf(textOf(source, calculations.p3.flat().find((entry) => entry.id === 'sum')!.request!));
    expect(summed.properties.find((property) => property.id === 'p3')?.summary?.label).toBe('Sum');
  });
});

describe('the rows and groups of a Knowledge table', () => {
  const source = example('cities.yaml');
  const viewOf = (text: string) => type.view({ ...source, text }, {});
  /** The view without a filter, where every row is in sight. */
  const everyRow = (text: string) => type.view({ ...source, text: text.replace('activeView: v1', 'activeView: v2') }, {});
  const put = (request: TableRequest, row: string, value: string | number | boolean): TableRequest => JSON.parse(JSON.stringify(request), (_key, given: unknown) => (given === '$row' ? row : given === '$typed' ? value : given)) as TableRequest;
  const gestures = type.view(source, {}).gestures!;

  it('folds a group, moves it up and down, and hides it, each as one edit', () => {
    const order = (text: string): string[] => viewOf(text).groups!.map((group) => group.label);
    const before = order(source.text);
    const belgium = viewOf(source.text).groups!.find((group) => group.label === 'Belgium')!.key;
    const head = gestures.groupHeads![belgium];
    expect(viewOf(textOf(source, head.fold)).groups!.find((group) => group.key === belgium)?.collapsed).toBe(true);
    const up = order(textOf(source, head.up!));
    expect(up.indexOf('Belgium')).toBe(before.indexOf('Belgium') - 1);
    expect(order(textOf(source, head.down!)).indexOf('Belgium')).toBe(before.indexOf('Belgium') + 1);
    expect(order(textOf(source, head.hide))).not.toContain('Belgium');
    expect(gestures.groupHeads![viewOf(source.text).groups![0].key].up).toBeUndefined();
  });

  it('sets one property of every selected row in one edit', () => {
    const set = gestures.bulk!.set.p3;
    const request: TableRequest = { kind: 'steps', steps: ['r1', 'r2'].map((row) => put(set.request!, row, 7)) };
    const after = everyRow(textOf(source, request));
    expect(['r1', 'r2'].map((row) => after.rows.find((candidate) => candidate.id === row)?.cells.p3?.value)).toEqual([7, 7]);
    expect(gestures.bulk!.remove).toMatchObject({ label: 'Delete row', plural: 'Delete {count} rows' });
  });

  it('makes an option from a cell\'s list and chooses it, in one edit', () => {
    const after = everyRow(textOf(source, put(gestures.createOption!.p2, 'r2', 'Luxembourg')));
    const option = after.properties.find((property) => property.id === 'p2')!.options.find((candidate) => candidate.name === 'Luxembourg');
    expect(option).toBeDefined();
    expect(after.rows.find((row) => row.id === 'r2')?.cells.p2?.value).toBe(option!.id);
  });

  it('adds a row directly under another in a view without a sort', () => {
    const map = { ...source, text: source.text.replace('activeView: v1', 'activeView: v2') };
    const request = type.view(map, {}).gestures!.newRowAfter!;
    const rows = type.view({ ...map, text: textOf(map, put(request, 'r1', '')) }, {}).rows.map((row) => row.id);
    expect(rows[0]).toBe('r1');
    expect(['r1', 'r2', 'r3', 'r4']).not.toContain(rows[1]);
    expect(gestures.newRowAfter).toEqual({ kind: 'operation', operation: 'addRow', on: [], args: {} });
  });
});

describe('what dragging moves in a Knowledge table', () => {
  const source = example('cities.yaml');
  const map = { ...source, text: source.text.replace('activeView: v1', 'activeView: v2') };
  const put = (request: TableRequest, row: string, value: string | number): TableRequest => JSON.parse(JSON.stringify(request), (_key, given: unknown) => (given === '$row' ? row : given === '$typed' ? value : given)) as TableRequest;
  const moves = type.view(source, {}).gestures!.moves!;
  const order = (text: string, file = source): string[] => type.view({ ...file, text }, {}).properties.map((property) => property.id);

  it('moves a view\'s tab first and after another, as one edit each', () => {
    expect(type.view({ ...source, text: textOf(source, moves.views!.v1.v2) }, {}).views.map((tab) => tab.id)).toEqual(['v2', 'v1']);
    expect(type.view({ ...source, text: textOf(source, moves.views!.v2['']) }, {}).views.map((tab) => tab.id)).toEqual(['v2', 'v1']);
  });

  it('moves a column in the view\'s own order, giving a setting to each it passes that has none', () => {
    const before = order(source.text);
    expect(before.slice(0, 3)).toEqual(['p3', 'p1', 'p2']);
    expect(order(textOf(source, moves.columns!.p2['']))).toEqual(['p2', ...before.filter((id) => id !== 'p2')]);
    const after = order(textOf(source, moves.columns!.p4.p1));
    expect(after.slice(0, 4)).toEqual(['p3', 'p1', 'p4', 'p2']);
    expect(after).toHaveLength(before.length);
    // The other view keeps its order: a column's place is the view's.
    expect(order(textOf(source, moves.columns!.p4.p1).replace('activeView: v1', 'activeView: v2'))).toEqual(order(map.text, map));
  });

  it('moves a row where the view has no sort, and offers no row move where it has one', () => {
    expect(moves.rows).toBeUndefined();
    const rows = type.view(map, {}).gestures!.moves!.rows!;
    const ids = (text: string): string[] => type.view({ ...map, text }, {}).rows.map((row) => row.id);
    const before = ids(map.text);
    expect(ids(textOf(map, put(rows.first, before[2], ''))).slice(0, 3)).toEqual([before[2], before[0], before[1]]);
    expect(ids(textOf(map, put(rows.after, before[0], before[2]))).slice(0, 3)).toEqual([before[1], before[2], before[0]]);
  });

  it('writes a column\'s width, keeping it shown', () => {
    const widths = type.view(source, {}).gestures!.widths!;
    const after = type.view({ ...source, text: textOf(source, put(widths.p1, '', 240)) }, {}).properties.find((property) => property.id === 'p1');
    expect(after).toMatchObject({ width: 240, visible: true });
  });

  it('keeps a column where it is shown when it is given a width or wrapped in a view with no setting for those before it', () => {
    // The view "Map" has no column settings: the first setting would otherwise list its column first.
    const map = { ...source, text: textOf(source, { kind: 'show', view: 'v2' }) };
    const order = (text: string): string[] => type.view({ ...map, text }, {}).properties.map((property) => property.id);
    const before = order(map.text);
    const shown = type.view(map, {}).gestures!;
    const widened = textOf(map, put(shown.widths!.p4, '', 240));
    expect(order(widened)).toEqual(before);
    expect(type.view({ ...map, text: widened }, {}).properties.find((property) => property.id === 'p4')).toMatchObject({ width: 240, visible: true });
    expect(order(textOf(map, find(shown.columnMenus?.p5, 'wrap').request!))).toEqual(before);
  });

  it('renames a view and a column with the name typed in place', () => {
    const gestures = type.view(source, {}).gestures!;
    const view = find(gestures.viewMenus?.v1, 'rename');
    const column = find(gestures.columnMenus?.p3, 'rename');
    expect([view.inPlace, column.inPlace]).toEqual([true, true]);
    expect(type.view({ ...source, text: textOf(source, put(view.request!, '', 'Every city')) }, {}).views[0].name).toBe('Every city');
    expect(order(source.text)).toContain('p3');
    expect(type.view({ ...source, text: textOf(source, put(column.request!, '', 'Inhabitants')) }, {}).properties.find((property) => property.id === 'p3')?.name).toBe('Inhabitants');
  });

  it('moves a group in the group editor, the order written again', () => {
    const keys = (text: string): string[] => type.view({ ...source, text }, {}).groups!.map((group) => group.key);
    const group = type.view(source, {}).gestures!.settings!.group;
    const every = group.groups!.map((entry) => entry.id);
    const last = every[every.length - 1];
    expect(keys(source.text)[0]).not.toBe(last);
    expect(keys(textOf(source, group.moves![last]['']))[0]).toBe(last);
  });
});

describe('a Knowledge view grouped by the parent relation', () => {
  const tasks = (collapsed = ''): Source => ({
    fileName: 'tasks.yaml',
    text: [
      'ded: "0.1"', 'designer: etalii/knowledge', 'name: Tasks', 'activeView: v1',
      'properties:', '  - id: t', '    name: Name', '    type: text', '    title: true',
      '  - id: up', '    name: Parent', '    type: relation', '    target: .', '    limit: one', '    parent: true',
      'views:', '  - id: v1', '    name: All', '    groupBy: up', ...(collapsed ? ['    collapsed:', `      - key: ${collapsed}`] : []),
      'rows:',
      '  - id: a', '    cells:', '      - property: t', '        text: Plan',
      '  - id: c', '    cells:', '      - property: t', '        text: Deep', '      - property: up', '        rows:', '          - row: b',
      '  - id: b', '    cells:', '      - property: t', '        text: Step', '      - property: up', '        rows:', '          - row: a',
      '  - id: d', '    cells:', '      - property: t', '        text: Other',
      '',
    ].join('\n'),
  });

  it('nests rows under their parents to any depth, each parent with its fold', () => {
    const shown = type.view(tasks(), {});
    expect(type.findings(tasks())).toEqual([]);
    expect(shown.groups).toBeUndefined();
    expect(shown.rows.map((row) => [row.id, shown.tree?.[row.id]?.depth])).toEqual([['a', 0], ['b', 1], ['c', 2], ['d', 0]]);
    expect(Object.keys(shown.gestures?.folds ?? {}).sort()).toEqual(['a', 'b']);
  });

  it('folds a parent, stored with the view, and its rows are out of sight', () => {
    const source = tasks();
    const folded = textOf(source, type.view(source, {}).gestures!.folds!.b);
    expect(folded).toContain('collapsed');
    const shown = type.view({ ...source, text: folded }, {});
    expect(shown.rows.map((row) => row.id)).toEqual(['a', 'b', 'd']);
    expect(shown.tree?.b).toEqual({ depth: 1, parent: true, collapsed: true });
    expect(type.view({ ...source, text: textOf({ ...source, text: folded }, shown.gestures!.folds!.b) }, {}).rows).toHaveLength(4);
  });
});

describe('the findings of a Knowledge table, on what they are about', () => {
  const source = example('cities.yaml');
  const broken = { ...source, text: source.text.replace('activeView: v1', 'activeView: v2').replace('        number: 931298', '        text: many') };

  it('marks a cell with the findings about it, and no other', () => {
    const found = type.findings(broken);
    expect(found.length).toBeGreaterThan(0);
    const shown = type.view(broken, {});
    const marked = shown.rows.flatMap((row) => Object.entries(row.cells).filter(([, cell]) => cell.findings).map(([property]) => `${row.id}.${property}`));
    expect(marked).toEqual(['r1.p3']);
    expect(shown.rows.find((row) => row.id === 'r1')!.cells.p3.findings!.map((finding) => finding.message)).toEqual(found.map((finding) => finding.message));
    expect(type.view(source, {}).rows.some((row) => Object.values(row.cells).some((cell) => cell.findings))).toBe(false);
  });
});

describe('a Knowledge table of 10,000 rows', () => {
  it('is made into its view in a few seconds at most, not in a time that grows with the square of its rows', () => {
    const text = example('cities.yaml').text.replace(/\r\n/g, '\n');
    const rows = Array.from({ length: 10_000 }, (_, at) => `  - id: g${at}\n    cells:\n      - property: p1\n        text: City ${at}\n      - property: p2\n        option: ${at % 2 ? 'o1' : 'o2'}\n      - property: p3\n        number: ${(at * 7919) % 1_000_000}\n`);
    const source: Source = { fileName: 'big.yaml', text: text.slice(0, text.indexOf('\nrows:\n') + 7).replace('activeView: v1', 'activeView: v2') + rows.join('') };
    // Read once first, so the time below is the view's alone (it was 13 seconds before each row's cells were found by an index).
    type.findings(source);
    const started = performance.now();
    const shown = type.view(source, {});
    expect(shown.rows).toHaveLength(10_000);
    expect(performance.now() - started).toBeLessThan(3_000);
  }, 120_000);
});

describe('each column gesture of the standalone host (etalii.adp spec 079, T004)', () => {
  const source = example('cities.yaml');
  const gestures = type.view(source, {}).gestures!;
  const after = (request: TableRequest): Source => ({ ...source, text: textOf(source, request) });
  const column = (text: Source, id: string) => type.view(text, {}).properties.find((property) => property.id === id)!;

  it('wraps a column, keeping it shown and its width, and unwraps it', () => {
    const wrapped = after(find(gestures.columnMenus?.p3, 'wrap').request!);
    expect(column(wrapped, 'p3')).toMatchObject({ wrap: true, visible: true, width: 120 });
    const again = type.view(wrapped, {}).gestures!;
    expect(find(again.columnMenus?.p3, 'wrap').label).toBe('Do not wrap');
    expect(column({ ...wrapped, text: textOf(wrapped, find(again.columnMenus?.p3, 'wrap').request!) }, 'p3')).toMatchObject({ wrap: false, width: 120 });
  });

  it('freezes the columns up to one, and unfreezes them', () => {
    const frozen = after(find(gestures.columnMenus?.p2, 'freeze').request!);
    expect(column(frozen, 'p2').frozen).toBe(true);
    const unfreeze = find(type.view(frozen, {}).gestures!.columnMenus?.p2, 'freeze');
    expect([unfreeze.label, unfreeze.request]).toEqual(['Unfreeze columns', { kind: 'operation', operation: 'unfreeze', on: ['v1'], args: {} }]);
    expect(column({ ...frozen, text: textOf(frozen, unfreeze.request!) }, 'p2').frozen).toBe(false);
  });

  it('sorts ascending and descending, filters and groups by the column it was opened on, without asking which', () => {
    expect(['sortAscending', 'sortDescending', 'filter', 'group'].map((id) => find(gestures.columnMenus?.p6, id).request)).toEqual([
      { kind: 'operation', operation: 'addSort', on: ['v1'], args: { property: 'p6', direction: 'ascending' } },
      { kind: 'operation', operation: 'addSort', on: ['v1'], args: { property: 'p6', direction: 'descending' } },
      { kind: 'operation', operation: 'addCondition', on: ['v1'], args: { property: 'p6' } },
      { kind: 'operation', operation: 'groupBy', on: ['v1'], args: { property: 'p6' } },
    ]);
    expect(after(find(gestures.columnMenus?.p6, 'group').request!).text).toContain('    groupBy: p6\r\n');
  });

  it('inserts a property left and right of the column, of the type chosen', () => {
    const left = find(gestures.columnMenus?.p3, 'insertLeft').entries!.find((entry) => entry.id === 'number')!.request!;
    const right = find(gestures.columnMenus?.p3, 'insertRight').entries!.find((entry) => entry.id === 'number')!.request!;
    expect(right).toMatchObject({ operation: 'addProperty', args: { valueType: 'number', after: 'p3' } });
    expect(left).toMatchObject({ operation: 'addProperty', args: { valueType: 'number', after: 'p2' } });
  });

  it('offers nesting only on a relation to the table itself', () => {
    expect(['p2', 'p3', 'p5'].map((id) => (gestures.columnMenus?.[id] ?? []).flat().some((entry) => entry.id === 'nest'))).toEqual([false, false, false]);
  });
});
