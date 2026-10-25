import { describe, expect, it } from 'vitest';
import { gesturesOf } from '../../../src/core/desl/hierarchy';
import type { HierarchySurface } from '../../../src/core/desl/surface';
import type { Model } from '../../../src/core/disl/model';
import { hierarchyReader, type HierarchyNode, type HierarchyState } from '../../../src/core/tool/hierarchyView';
import { openHierarchy, webShop } from '../desl/support';

// The view of a page of boxes (DESL 7.7) made of a model, apart from any tool type: the web-shop
// example opened as the designer opens it, and read by the reader of the Hierarchical Requirement
// Designer's surface, with what the reader is given about the document beside its model.

const open = openHierarchy();
const { parts, surface, model } = open;
const gestures = gesturesOf(surface, parts.metamodel, parts.operations.all, parts.designer.operations);
const readerOf = (on: HierarchySurface = surface, colour?: (key: string) => { readonly light: string; readonly dark: string } | undefined) =>
  hierarchyReader({ surface: on, metamodel: parts.metamodel, operations: parts.operations.all, gestures, mentions: open.mentions, ...(colour ? { logic: { id: 'test/page', shown: () => ({}), colour } } : {}) });
const reader = readerOf();

const state = (more: Partial<HierarchyState> = {}): HierarchyState => ({
  name: 'web-shop', readOnly: false, findings: [], implied: open.implied, renumbered: new Set(open.unnumbered.map((element) => element.newId)),
  availability: (operation, on) => parts.operations.availability(model, operation, on),
  ...more,
});
const all = (nodes: readonly HierarchyNode[]): HierarchyNode[] => nodes.flatMap((node) => [node, ...all(node.entries), ...all(node.levels)]);

describe('the view of a page of boxes', () => {
  it('is plain data, as JSON carries it', () => {
    const view = reader.view(model, state());
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it('holds every level and entry once, each level with its entries before its levels', () => {
    const view = reader.view(model, state());
    const shown = all(view.roots).map((node) => node.id);
    const tree = model.elements.filter((element) => element.type === surface.levels.type || element.type === surface.entries.type).map((element) => element.id);
    expect([...shown].sort()).toEqual([...tree].sort());
    expect(all(view.roots).every((node) => node.levels.every((level) => level.depth === node.depth + 1) && node.entries.every((entry) => entry.depth === node.depth))).toBe(true);
  });

  it('runs each gesture by the operation the definition gives it, offered as the operation is', () => {
    const view = reader.view(model, state());
    const entry = all(view.roots).find((node) => node.role === 'entry')!;
    expect(entry.gestures.rename).toEqual({ operation: gestures.on[entry.type]!.rename!.operation, enabled: true, params: gestures.on[entry.type]!.rename!.params });
    // An operation that is not offered for what the gesture is made on is no gesture of it.
    const none = reader.view(model, state({ availability: () => ({ offered: false, available: false }) }));
    expect(none.roots[0].gestures).toEqual({});
    expect(none.pageGestures).toEqual({});
    // One that cannot run now is shown switched off, with the reason.
    const off = reader.view(model, state({ availability: () => ({ offered: true, available: false, reason: 'Not now.' }) }));
    expect(off.roots[0].gestures.rename).toMatchObject({ enabled: false, reason: 'Not now.' });
  });

  it('switches every gesture off in a read-only document, with the notice', () => {
    const view = reader.view(model, state({ readOnly: true, notice: 'Read only.' }));
    expect(view).toMatchObject({ readOnly: true, notice: 'Read only.' });
    const states = [...all(view.roots).flatMap((node) => Object.values(node.gestures)), ...view.lists.flatMap((list) => Object.values(list.gestures)), ...Object.values(view.pageGestures)];
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((gesture) => gesture?.enabled === false && gesture.reason === 'Read only.')).toBe(true);
  });

  it('marks the members no list held, and colours a member where a view logic gives its key a colour', () => {
    const bare = openHierarchy(webShop(), null);
    const view = readerOf(surface, (key) => (key === 'default' ? { light: '#fff', dark: '#000' } : undefined)).view(bare.model, state({ implied: bare.implied }));
    const [tags] = view.lists;
    expect(tags.members.every((member) => member.implied)).toBe(true);
    expect(tags.members[0]).toMatchObject({ colourKey: 'default', colour: { light: '#fff', dark: '#000' } });
    expect(view.lists[1].members.some((member) => member.implied)).toBe(false);
  });

  it('hides the ids where the surface says so', () => {
    const view = readerOf({ ...surface, ids: 'hidden' }).view(model, state());
    expect(view.ids).toBe('hidden');
    expect(all(view.roots).some((node) => node.shownId !== undefined)).toBe(false);
  });

  it('counts the findings at each level and entry, and keeps every finding with what it is about', () => {
    const view = reader.view(model, state({ findings: [
      { rule: 'std.mentions', severity: 'warning', message: 'One.', line: 3, element: 'REQ-0001' },
      { rule: 'std.mentions', severity: 'warning', message: 'Two.', line: 3, element: 'REQ-0001' },
      { rule: 'other', severity: 'error', message: 'Three.', line: 0 },
    ] }));
    expect(all(view.roots).find((node) => node.id === 'REQ-0001')!.findings).toEqual([{ severity: 'warning', count: 2 }]);
    expect(view.findings.map((found) => found.node)).toEqual(['REQ-0001', 'REQ-0001', undefined]);
  });

  it('shows an entry that stands in no level apart', () => {
    const entry = model.elements.find((element) => element.type === surface.entries.type)!;
    const loose: Model = { ...model, elements: model.elements.map((element) => (element.id === entry.id ? { ...element, parent: undefined } : element)) };
    const view = reader.view(loose, state());
    expect(view.stray.map((node) => node.id)).toEqual([entry.id]);
  });
});

describe('the rows of ADP Properties of a page of boxes', () => {
  it('are none for what is no level and no entry', () => {
    expect(reader.fields(model, 'tag/mail', undefined)).toEqual([]);
    expect(reader.fields(model, 'nothing', undefined)).toEqual([]);
  });

  it('are read-only, with the reason, where no operation changes them', () => {
    const bare = { ...gestures, on: {}, labels: {} };
    const plain = hierarchyReader({ surface, metamodel: parts.metamodel, operations: parts.operations.all, gestures: bare, mentions: open.mentions });
    expect(plain.fields(model, 'REQ-0001', undefined).filter((field) => field.id !== 'id').map((field) => field.readOnly)).toEqual(Array(5).fill('No operation of this tool changes it.'));
    expect(plain.fieldSteps(model, 'REQ-0001', surface.entries.title, 'x')).toEqual({ refused: 'No operation of this tool changes it.' });
  });

  it('are changed by the operations of the gestures, a label of several values by what differs', () => {
    const tags = gestures.labels.tags!;
    expect(reader.fieldSteps(model, 'REQ-0010', 'tags', 'privacy new')).toEqual([
      { operation: tags.remove!.operation, on: ['REQ-0010'], args: { [tags.remove!.params.value]: 'legal' } },
      { operation: tags.add!.operation, on: ['REQ-0010'], args: { [tags.add!.params.value]: 'new' } },
    ]);
    expect(reader.fieldSteps(model, 'gone', 'tags', '')).toEqual({ refused: 'That entry is no longer in this file.' });
    expect(reader.fieldSteps(model, 'REQ-0010', 'colour', '')).toEqual({ refused: 'This value cannot be changed here.' });
  });
});
