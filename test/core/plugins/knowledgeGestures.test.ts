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
    expect(viewOf(byName).gestures?.settings?.filter.conditions[0].operators.find((entry) => entry.checked)?.id).toBe('contains');
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
