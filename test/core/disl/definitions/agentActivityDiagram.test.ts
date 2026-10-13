import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { interpretBehavior, type Outcome, type Situation } from '../../../../src/core/disl/behavior';
import { interpretConstraints } from '../../../../src/core/disl/constraints';
import { interpretCoordinates } from '../../../../src/core/disl/coordinates';
import { createExpressions } from '../../../../src/core/disl/expressions';
import { interpretForms } from '../../../../src/core/disl/forms';
import { interpretLayout } from '../../../../src/core/disl/layout';
import { derivedRelations, interpretMetamodel, linkKind } from '../../../../src/core/disl/metamodel';
import type { Model, ModelElement, Value } from '../../../../src/core/disl/model';
import { builtInShapes, interpretNotation, nodeNotation } from '../../../../src/core/disl/notation';
import { interpretPersistence, type StoredView } from '../../../../src/core/disl/persistence';
import { loadSpecification } from '../../../../src/core/disl/specification';
import { supportedFeatures } from '../../../../src/core/disl/support';
import { interpretToolbox } from '../../../../src/core/disl/toolbox';
import { interpretViewpoints } from '../../../../src/core/disl/viewpoints';
import { createScene, type Scene, type SceneNode, type SceneOptions, type SceneRow, type SceneTool } from '../../../../src/core/scene/scene';

// The agent activity diagram's definition, read by the interpreter alone (etalii.adp spec 027, task
// T085): no binding and no document. It is the first definition in DISL 0.4, and each construct of
// 0.4 it uses is read as it is written: compartments with `groupBy`, `itemOrder` and `itemLink`, a
// kept filter, `pin`, `unpin` and `unpinAll`, the `open` action, `persistence.view.bind`, `paths`
// on a `uri` attribute, the shapes `folder` and `hexagon`, and icons. What a test expects is taken
// from the definition itself, so a name or a sentence is typed here only where it is the test's own model.

type Json = Readonly<Record<string, unknown>>;
const written = JSON.parse(readFileSync('definitions/agent-activity-diagram/agent-activity-diagram.dis', 'utf8')) as Json;
const at = (...path: string[]): unknown => path.reduce<unknown>((node, step) => (node as Json | undefined)?.[step], written);

const loaded = loadSpecification(written);
const specification = loaded.value;
const metamodel = interpretMetamodel(specification);
const persistence = interpretPersistence(specification, metamodel.value);
const expressions = createExpressions(specification, metamodel.value);
const coordinates = interpretCoordinates(specification, metamodel.value);
const notation = interpretNotation(specification, metamodel.value);
const layout = interpretLayout(specification);
const viewpoints = interpretViewpoints(specification, metamodel.value, { notation: notation.value, coordinates: coordinates.value, layout: layout.value });
const constraints = interpretConstraints(specification, metamodel.value, expressions);
const forms = interpretForms(specification, metamodel.value, expressions);
const toolbox = interpretToolbox(specification, metamodel.value);
let minted = 0;
const behavior = interpretBehavior(specification, metamodel.value, expressions, {
  constraints: constraints.value, layout: layout.value, coordinates: coordinates.value, persistence: persistence.value, toolbox: toolbox.value,
  notation: notation.value, viewpoints: viewpoints.value, newId: () => `new-${++minted}`,
});
const sceneTool: SceneTool = { metamodel: metamodel.value, expressions, coordinates: coordinates.value, viewpoints: viewpoints.value };

// A file of the test's own: one project with two specifications, an agent on the first, where
// that agent works, and what it runs on. The first specification has a task in each of three
// groups, two of them in one; the location has two pull requests.
const element = (id: string, type: string, attributes: Readonly<Record<string, Value>>, parent?: string): ModelElement =>
  ({ id, type, attributes, host: {}, ephemeral: false, line: 1, ...(parent === undefined ? {} : { parent }) });
const model: Model = {
  diagram: {},
  relations: [],
  elements: [
    element('p1', 'Project', { name: 'Platform', link: 'https://example.org/platform' }),
    element('s1', 'Specification', { name: 'Billing', status: 'progressing', project: 'p1', link: 'specs/billing.md' }),
    element('t1', 'Task', { title: 'Old and pending', status: 'pending', updated: '2026-10-01T09:00:00+02:00' }, 's1'),
    element('t2', 'Task', { title: 'Going, no moment', status: 'progressing' }, 's1'),
    element('t3', 'Task', { title: 'Going, early', status: 'progressing', updated: '2026-10-02T09:00:00+02:00' }, 's1'),
    element('t4', 'Task', { title: 'Going, late', status: 'progressing', updated: '2026-10-03T09:00:00+02:00', link: 'https://example.org/t4' }, 's1'),
    element('t5', 'Task', { title: 'Waits', status: 'inputRequired', updated: '2026-10-04T09:00:00+02:00' }, 's1'),
    element('s2', 'Specification', { name: 'Shelved', status: 'archived', project: 'p1' }),
    element('s3', 'Specification', { name: 'No tasks', status: 'pending' }),
    element('a1', 'Agent', { name: 'Developer', specification: 's1' }),
    element('a2', 'Agent', { name: 'Idle' }),
    element('l1', 'Location', { branch: 'features/billing', folder: 'worktrees/billing', agent: 'a1', environment: 'e1', folderLink: 'C:/git/worktrees/billing' }),
    element('r1', 'PullRequest', { title: 'First', updated: '2026-10-01T09:00:00+02:00', link: 'https://example.org/pull/1' }, 'l1'),
    element('r2', 'PullRequest', { title: 'Second', updated: '2026-10-05T09:00:00+02:00' }, 'l1'),
    element('e1', 'Environment', { name: 'Laptop', environmentKind: 'localMachine' }),
  ],
};
const nothingKept: StoredView = { pinned: {}, groups: {}, filters: {} };
const kept = (more: Partial<StoredView>): StoredView => ({ ...nothingKept, ...more });
const viewing = (view: StoredView): Situation => ({ view });

const draw = (options: SceneOptions = {}, of: Model = model): Scene => createScene(sceneTool, of, { textWidth: (text, fontSize) => text.length * fontSize * 0.5, ...options });
const nodeOf = (scene: Scene, id: string): SceneNode => {
  const found = scene.nodes.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`The scene draws no node ${id}.`);
  return found;
};
const rowsOf = (scene: Scene, id: string, compartment: string): readonly SceneRow[] => nodeOf(scene, id).compartments.find((candidate) => candidate.id === compartment)?.rows ?? [];
/** A row as a line of text: a heading with its group, its count and whether it is folded, an item with its text and its link. */
const shown = (rows: readonly SceneRow[]): string[] =>
  rows.map((row) => (row.kind === 'heading' ? `[${row.group}] ${row.text} (${row.count}) ${row.collapsed ? 'folded' : 'open'}` : `${row.text}${row.link === undefined ? '' : ` -> ${row.link}`}`));
const done = (outcome: Outcome): Extract<Outcome, { refused?: undefined }> => {
  if (outcome.refused !== undefined) throw new Error(`refused: ${outcome.refused}`);
  return outcome;
};

describe('the agent activity diagram\'s definition', () => {
  it('is written in DISL 0.4', () => {
    expect(at('disl')).toBe('0.4');
  });

  it('reads with no finding: nothing of it is unsupported, skipped or read as something else', () => {
    const findings = [loaded, metamodel, persistence, coordinates, notation, layout, viewpoints, constraints, forms, toolbox, behavior].flatMap((part) => part.findings).concat(expressions.findings);
    expect(findings.filter((finding) => finding.code.startsWith('disl.unsupported-'))).toEqual([]);
    expect(findings.map((finding) => `${finding.code}: ${finding.message}`)).toEqual([]);
  });

  it('draws a document with no finding either', () => {
    expect(draw().findings.map((finding) => finding.message)).toEqual([]);
  });
});

describe('a compartment whose items are children', () => {
  it('lists them in the node and draws none of them as a node of its own', () => {
    const scene = draw();
    expect(scene.nodes.map((node) => node.type).filter((type) => type === 'Task' || type === 'PullRequest')).toEqual([]);
    expect(nodeOf(scene, 's1').compartments.map((compartment) => compartment.id)).toEqual(['tasks']);
    expect(nodeOf(scene, 'l1').compartments.map((compartment) => compartment.id)).toEqual(['folder', 'pullRequests']);
  });

  it('names each item that is a child by its id, so that it can be selected, and gives it the text `itemText` states', () => {
    const items = rowsOf(draw(), 's1', 'tasks').filter((row) => row.kind === 'item');
    expect(items.map((row) => [row.element, row.text])).toEqual([['t4', 'Going, late'], ['t3', 'Going, early'], ['t2', 'Going, no moment'], ['t5', 'Waits']]);
  });

  it('keeps every row inside the node, one under the other, and the node as high as its rows need (autoSize: "fitHeight")', () => {
    const scene = draw();
    const node = nodeOf(scene, 's1');
    const rows = rowsOf(scene, 's1', 'tasks');
    for (const [index, row] of rows.entries()) {
      expect(row.box.x).toBeGreaterThanOrEqual(node.box.x);
      expect(row.box.x + row.box.width).toBeLessThanOrEqual(node.box.x + node.box.width);
      expect(row.box.height).toBeGreaterThan(0);
      if (index > 0) expect(row.box.y).toBeGreaterThanOrEqual(rows[index - 1].box.y + rows[index - 1].box.height - 1e-6);
    }
    expect(rows.at(-1)!.box.y + rows.at(-1)!.box.height).toBeLessThanOrEqual(node.box.y + node.box.height + 1e-6);
    // A specification without a task is as high as the notation's least height; one with rows is higher by them.
    const [, least] = at('notation', 'nodes', 'Specification', 'size', 'min') as [number, number];
    expect(nodeOf(scene, 's3').box.height).toBe(least);
    expect(nodeOf(scene, 's3').compartments.flatMap((compartment) => compartment.rows)).toEqual([]);
    expect(node.box.height).toBeGreaterThan(least);
    expect(node.box.width).toBe((at('notation', 'nodes', 'Specification', 'size', 'default') as [number, number])[0]);
  });

  it('draws the separator the compartment states above its rows', () => {
    const compartment = nodeOf(draw(), 's1').compartments[0];
    expect(compartment.separator).toEqual(at('notation', 'nodes', 'Specification', 'compartments', '0', 'separator'));
    expect(compartment.box.y).toBeLessThanOrEqual(compartment.rows[0].box.y);
  });
});

describe('groupBy', () => {
  const declared = at('notation', 'nodes', 'Specification', 'compartments', '0', 'groupBy') as { attribute: string; collapsed: Record<string, boolean> };

  it('is read as written', () => {
    expect(nodeNotation(notation.value, metamodel.value, 'Specification').compartments[0].groupBy).toMatchObject({ attribute: 'status', collapsed: declared.collapsed });
  });

  it('lists the items under one heading for each value of the enum, in the enum\'s order, with its count, and none for a group without an item', () => {
    expect(shown(rowsOf(draw(), 's1', 'tasks'))).toEqual([
      '[progressing] Progressing (3) open',
      'Going, late -> https://example.org/t4', 'Going, early', 'Going, no moment',
      '[pending] Pending (1) folded',
      '[input-required] Input Required (1) open',
      'Waits',
    ]);
  });

  it('names a group by the stored form of its value: the group key', () => {
    const headings = rowsOf(draw(), 's1', 'tasks').filter((row) => row.kind === 'heading').map((row) => row.group);
    expect(headings).toEqual(['progressing', 'pending', 'input-required']);
  });

  it('starts each group as `collapsed` says, and shows the stored state of a group before its default', () => {
    const view = kept({ groups: { s1: { pending: false, progressing: true } } });
    expect(shown(rowsOf(draw({ view }), 's1', 'tasks'))).toEqual([
      '[progressing] Progressing (3) folded',
      '[pending] Pending (1) open',
      'Old and pending',
      '[input-required] Input Required (1) open',
      'Waits',
    ]);
  });

  it('makes the node lower when a group is folded and higher when one is opened', () => {
    const height = (view: StoredView): number => nodeOf(draw({ view }), 's1').box.height;
    expect(height(kept({ groups: { s1: { progressing: true } } }))).toBeLessThan(height(nothingKept));
    expect(height(kept({ groups: { s1: { pending: false } } }))).toBeGreaterThan(height(nothingKept));
  });

  it('gives a compartment that is collapsible without `groupBy` one group, by the compartment\'s id and under its title, folded by default as it states', () => {
    expect(shown(rowsOf(draw(), 'l1', 'pullRequests'))).toEqual(['[pullRequests] Pull requests (2) folded']);
    expect(shown(rowsOf(draw({ view: kept({ groups: { l1: { pullRequests: false } } }) }), 'l1', 'pullRequests'))).toEqual([
      '[pullRequests] Pull requests (2) open', 'Second', 'First -> https://example.org/pull/1',
    ]);
  });

  it('stores the state of a group only while it differs from its default', () => {
    const fold = (group: string, collapsed: boolean, view = nothingKept) => done(behavior.value.fold(model, 's1', group, collapsed, viewing(view)));
    // Pending is folded by default: opened, its state is kept; folded again, the kept state goes.
    expect(fold('pending', false).view).toEqual([{ kind: 'group', element: 's1', group: 'pending', collapsed: false }]);
    expect(fold('pending', true, kept({ groups: { s1: { pending: false } } })).view).toEqual([{ kind: 'group', element: 's1', group: 'pending', collapsed: null }]);
    // Progressing is open by default.
    expect(fold('progressing', true).view).toEqual([{ kind: 'group', element: 's1', group: 'progressing', collapsed: true }]);
    expect(fold('progressing', false, kept({ groups: { s1: { progressing: true } } })).view).toEqual([{ kind: 'group', element: 's1', group: 'progressing', collapsed: null }]);
    // A group that is as it is asked to be changes nothing.
    expect(fold('pending', true).view).toEqual([]);
    expect(fold('pending', false).changes).toEqual([]);
    expect(done(behavior.value.fold(model, 'l1', 'pullRequests', false, viewing(nothingKept))).view).toEqual([{ kind: 'group', element: 'l1', group: 'pullRequests', collapsed: false }]);
  });

  it('is an edit: it is refused in a document that cannot be changed', () => {
    expect(behavior.value.fold(model, 's1', 'pending', false, { view: nothingKept, env: { readOnly: true } }).refused).toEqual(expect.any(String));
  });
});

describe('itemOrder', () => {
  it('lists the items by `by` in its direction, those without a value after all others, in the order of the file', () => {
    const progressing = rowsOf(draw(), 's1', 'tasks').slice(1, 4).map((row) => row.element);
    // t4 is the latest, t3 earlier, and t2 has no moment at all.
    expect(progressing).toEqual(['t4', 't3', 't2']);
  });

  it('changes nothing of the model: the order of the file stays', () => {
    draw();
    expect(model.elements.filter((candidate) => candidate.parent === 's1').map((candidate) => candidate.id)).toEqual(['t1', 't2', 't3', 't4', 't5']);
  });
});

describe('itemLink', () => {
  it('gives an item with a link that link, and one without none', () => {
    const rows = rowsOf(draw(), 's1', 'tasks');
    expect(rows.find((row) => row.element === 't4')?.link).toBe('https://example.org/t4');
    expect(rows.find((row) => row.element === 't3')?.link).toBeUndefined();
  });

  it('is read for an item that is no element too: a location\'s folder, with the folder\'s link', () => {
    expect(shown(rowsOf(draw(), 'l1', 'folder'))).toEqual(['worktrees/billing -> C:/git/worktrees/billing']);
    expect(rowsOf(draw(), 'l1', 'folder')[0].element).toBeUndefined();
  });
});

describe('a kept filter', () => {
  const filter = notation.value.canvas.filters.archived;

  it('is read as written: a switch that is kept with the diagram', () => {
    expect(filter).toMatchObject({ id: 'archived', control: 'switch', persist: true, default: false, appliesTo: ['Specification'], effect: 'hide' });
    expect(persistence.value.view.store).toContain('filters');
  });

  it('hides what `keep` is false for while nothing is kept, with the relations that reach it', () => {
    const scene = draw();
    expect(scene.filtered).toEqual(['s2']);
    expect(scene.nodes.some((node) => node.id === 's2')).toBe(false);
    expect(scene.edges.filter((edge) => edge.target === 's2').map((edge) => edge.hidden)).toEqual(['filter']);
  });

  it('takes the value that is kept, which is the same for every viewer', () => {
    const scene = draw({ view: kept({ filters: { archived: true } }) });
    expect(scene.filtered).toEqual([]);
    expect(scene.nodes.some((node) => node.id === 's2')).toBe(true);
  });

  it('is changed by an edit, and kept only while it differs from its default', () => {
    expect(done(behavior.value.filter(model, 'archived', true, viewing(nothingKept))).view).toEqual([{ kind: 'filter', id: 'archived', value: true }]);
    expect(done(behavior.value.filter(model, 'archived', false, viewing(kept({ filters: { archived: true } })))).view).toEqual([{ kind: 'filter', id: 'archived', value: null }]);
    expect(done(behavior.value.filter(model, 'archived', false, viewing(nothingKept))).view).toEqual([]);
    expect(behavior.value.filter(model, 'archived', true, { view: nothingKept, env: { readOnly: true } }).refused).toEqual(expect.any(String));
  });
});

describe('pin, unpin and unpinAll', () => {
  const pinned = kept({ pinned: { s1: { x: 240, y: -80 } } });
  const entries = (target: string | undefined, view: StoredView) =>
    behavior.value.menu(model, target, viewing(view)).groups.flat().filter((entry) => ['pin', 'unpin', 'unpinAll'].includes(entry.kind));

  it('offer `pin` on a node that is not pinned and `unpin` on one that is, with the labels the definition gives', () => {
    expect(entries('s1', nothingKept).map((entry) => [entry.kind, entry.label, entry.icon, entry.enabled])).toEqual([['pin', 'Lock position', 'mdi-lock-outline', true]]);
    expect(entries('s1', pinned).map((entry) => [entry.kind, entry.label, entry.icon, entry.enabled])).toEqual([['unpin', 'Unlock position', 'mdi-lock-open-variant-outline', true]]);
    expect(entries('a1', pinned).map((entry) => entry.kind)).toEqual(['pin']);
  });

  it('offer `unpinAll` on the canvas, unavailable with a reason while nothing is pinned', () => {
    expect(entries(undefined, pinned).map((entry) => [entry.kind, entry.label, entry.enabled])).toEqual([['unpinAll', 'Unlock all positions', true]]);
    const none = entries(undefined, nothingKept);
    expect(none.map((entry) => [entry.kind, entry.enabled])).toEqual([['unpinAll', false]]);
    expect(none[0].reason).toEqual(expect.any(String));
  });

  it('pin a node at a position, as view data that is kept and no change of the model', () => {
    const outcome = done(behavior.value.pin(model, 'a1', { x: 12.5, y: -40 }, viewing(nothingKept)));
    expect(outcome.changes).toEqual([]);
    expect(outcome.view).toEqual([{ kind: 'pin', element: 'a1', x: 12.5, y: -40 }]);
  });

  it('unpin one node, or every pinned node as one edit', () => {
    const both = kept({ pinned: { s1: { x: 240, y: -80 }, a1: { x: 1, y: 2 } } });
    expect(done(behavior.value.unpin(model, ['s1'], viewing(both))).view).toEqual([{ kind: 'unpin', element: 's1' }]);
    expect(done(behavior.value.unpin(model, undefined, viewing(both))).view).toEqual([{ kind: 'unpin', element: 's1' }, { kind: 'unpin', element: 'a1' }]);
  });

  it('refuse to unpin what is not pinned, to pin what is not there, and anything in a document that cannot be changed', () => {
    expect(behavior.value.unpin(model, ['a1'], viewing(pinned)).refused).toEqual(expect.any(String));
    expect(behavior.value.unpin(model, undefined, viewing(nothingKept)).refused).toEqual(expect.any(String));
    expect(behavior.value.pin(model, 'gone', { x: 0, y: 0 }, viewing(nothingKept)).refused).toEqual(expect.any(String));
    expect(behavior.value.pin(model, 'a1', { x: 0, y: 0 }, { view: nothingKept, env: { readOnly: true } }).refused).toEqual(expect.any(String));
  });

  it('refuse an element whose id is not kept in the document', () => {
    const ephemeral: Model = { ...model, elements: model.elements.map((candidate) => (candidate.id === 'a2' ? { ...candidate, ephemeral: true } : candidate)) };
    expect(behavior.value.pin(ephemeral, 'a2', { x: 0, y: 0 }, viewing(nothingKept)).refused).toEqual(expect.any(String));
  });

  it('are read by an expression as `self.view.pinned`, which the lock badge is drawn from', () => {
    const badges = (view: StoredView, id: string) => nodeOf(draw({ view }), id).badges.map((badge) => badge.id);
    expect(badges(nothingKept, 'a1')).toEqual([]);
    expect(badges(pinned, 's1')).toEqual(['link', 'pinned']);
    expect(nodeOf(draw({ view: pinned }), 's1').pinned).toBe(true);
    expect(nodeOf(draw({ view: pinned }), 'a1').pinned).toBe(false);
  });
});

describe('the open action', () => {
  it('asks the host to open the link, and changes nothing of the model', () => {
    const outcome = done(behavior.value.operate(model, 'openLink', ['p1'], {}));
    expect(outcome.changes).toEqual([]);
    expect(outcome.effects).toEqual([{ kind: 'open', elements: ['p1'], message: 'https://example.org/platform' }]);
  });

  it('opens a path as well as an address, and is run on an item that is a child', () => {
    expect(done(behavior.value.operate(model, 'openLink', ['s1'], {})).effects[0].message).toBe('specs/billing.md');
    expect(done(behavior.value.operate(model, 'openFolderLink', ['l1'], {})).effects[0].message).toBe('C:/git/worktrees/billing');
    expect(done(behavior.value.operate(model, 'openLink', ['t4'], {})).effects[0].message).toBe('https://example.org/t4');
  });

  it('is allowed in a document that cannot be changed', () => {
    expect(done(behavior.value.operate(model, 'openLink', ['p1'], { env: { readOnly: true } })).effects).toHaveLength(1);
    expect(behavior.value.operations.find((operation) => operation.id === 'openLink')).toMatchObject({ opens: true, viewOnly: true });
  });

  it('is unavailable without a link, with the sentence the definition gives', () => {
    const state = behavior.value.availability(model, 'openLink', ['a1'], {});
    expect(state).toMatchObject({ offered: true, available: false, reason: at('behavior', 'operations', 'openLink', 'unavailable', '0', 'message') });
    expect(behavior.value.operate(model, 'openLink', ['a1'], {}).refused).toBe('It has no link. Add one in the property grid.');
  });

  it('refuses a link that is neither an http or https address nor a path, with a reason that names it', () => {
    const odd: Model = { ...model, elements: model.elements.map((candidate) => (candidate.id === 'p1' ? { ...candidate, attributes: { ...candidate.attributes, link: 'ftp://example.org/platform' } } : candidate)) };
    const outcome = behavior.value.operate(odd, 'openLink', ['p1'], {});
    expect(outcome.refused).toContain('ftp://example.org/platform');
  });
});

describe('persistence.view.bind', () => {
  it('is read as written: each kept kind onto the entries of a type of the binding', () => {
    expect(persistence.findings).toEqual([]);
    expect(persistence.value.view.store).toEqual(at('persistence', 'view', 'store'));
    expect(persistence.value.view.viewer).toEqual(at('persistence', 'view', 'viewer'));
    expect(persistence.value.view.bind).toEqual({
      pinned: { type: 'Placement', element: 'element', x: 'x', y: 'y' },
      groups: { type: 'GroupState', element: 'element', group: 'group', collapsed: 'collapsed' },
      filters: { type: 'Diagram', values: { archived: 'showArchived' } },
    });
  });

  it('is reported when it binds a kind that is not stored, or onto a type of the metamodel', () => {
    const broken = (view: Json) => interpretPersistence(loadSpecification({ ...written, persistence: { ...(written.persistence as Json), view } }).value, metamodel.value).findings.map((finding) => finding.code);
    expect(broken({ store: ['groups'], bind: { pinned: { type: 'Placement', element: 'element', x: 'x', y: 'y' } } })).toEqual(['disl.persistence']);
    expect(broken({ store: ['pinned'], bind: { pinned: { type: 'Project', element: 'element', x: 'x', y: 'y' } } })).toEqual(['disl.persistence']);
  });
});

describe('paths on a uri attribute', () => {
  it('is read as written, beside the schemes a URI may have', () => {
    expect(metamodel.value.types.Project.attributes.link).toMatchObject({ type: 'uri', schemes: ['http', 'https'], paths: true });
  });

  it('reads a value with a scheme as a URI, and one without, or with a drive letter, as a path', () => {
    expect(linkKind('https://example.org/x')).toEqual({ kind: 'uri', scheme: 'https' });
    expect(linkKind('ftp://example.org/x')).toEqual({ kind: 'uri', scheme: 'ftp' });
    expect(linkKind('mailto:someone@example.org')).toEqual({ kind: 'uri', scheme: 'mailto' });
    expect(linkKind('C:/git/repo')).toEqual({ kind: 'path' });
    expect(linkKind('c:\\git\\repo')).toEqual({ kind: 'path' });
    expect(linkKind('/home/user/repo')).toEqual({ kind: 'path' });
    expect(linkKind('.spec-workflow/specs/x/requirements.md')).toEqual({ kind: 'path' });
  });
});

describe('the shapes folder and hexagon', () => {
  it('are shapes this interpreter draws', () => {
    expect(builtInShapes).toEqual(expect.arrayContaining(['folder', 'hexagon']));
  });

  it('are drawn as closed paths inside the node\'s bounds, by the defaults of DISL B.2', () => {
    const scene = draw();
    for (const [id, name, corners] of [['p1', 'folder', 6], ['e1', 'hexagon', 6]] as const) {
      const { shape, box } = nodeOf(scene, id);
      expect(shape.name).toBe(name);
      expect(shape.kind).toBe('path');
      const commands = shape.kind === 'path' ? shape.commands : [];
      expect(commands.at(-1)?.op).toBe('Z');
      const points = commands.flatMap((command) => (command.op === 'Z' ? [] : [command]));
      expect(points.length).toBeGreaterThanOrEqual(corners);
      for (const point of points) {
        expect(point.x).toBeGreaterThanOrEqual(box.x - 1e-9);
        expect(point.x).toBeLessThanOrEqual(box.x + box.width + 1e-9);
        expect(point.y).toBeGreaterThanOrEqual(box.y - 1e-9);
        expect(point.y).toBeLessThanOrEqual(box.y + box.height + 1e-9);
      }
    }
  });

  it('a flat hexagon has its points at the middle of its left and its right side, a quarter of its width in', () => {
    const { shape, box } = nodeOf(draw(), 'e1');
    const xs = (shape.kind === 'path' ? shape.commands : []).flatMap((command) => (command.op === 'Z' ? [] : [command.x - box.x]));
    expect([...new Set(xs.map((x) => Math.round(x * 1000) / 1000))].sort((a, b) => a - b)).toEqual([0, box.width * 0.25, box.width * 0.75, box.width]);
  });

  it('a folder has its tab on the left, 12 high and four tenths of its width', () => {
    const { shape, box } = nodeOf(draw(), 'p1');
    const points = (shape.kind === 'path' ? shape.commands : []).flatMap((command) => (command.op === 'Z' ? [] : [{ x: command.x - box.x, y: command.y - box.y }]));
    expect(points).toContainEqual({ x: 0, y: 0 });
    expect(points).toContainEqual({ x: box.width * 0.4, y: 0 });
    expect(points.some((point) => point.y === 12 && point.x === box.width)).toBe(true);
  });
});

describe('icons', () => {
  it('are read by the names the definition gives them: on a tool, on an entry of a menu and on a badge', () => {
    const tools = toolbox.value.groups.flatMap((group) => group.tools).map((tool) => [tool.id, tool.icon]);
    expect(tools).toEqual((at('toolbox', 'groups', '0', 'tools') as { id: string; icon: string }[]).map((tool) => [tool.id, tool.icon]));
    const menu = behavior.value.menu(model, 's1', viewing(nothingKept)).groups.flat();
    expect(menu.find((entry) => entry.kind === 'create-child')?.icon).toBe('mdi-checkbox-blank-outline');
  });

  it('a badge is drawn where its `visible` holds, in a corner of the node, with its icon and its tooltip', () => {
    const scene = draw({ view: kept({ pinned: { p1: { x: 0, y: 0 } } }) });
    const node = nodeOf(scene, 'p1');
    expect(node.badges.map((badge) => [badge.id, badge.icon, badge.tooltip, badge.operation])).toEqual([
      ['link', 'mdi-link-variant', 'https://example.org/platform', 'openLink'],
      ['pinned', 'mdi-lock-outline', 'Its position is locked. Unlock it from its menu to let the layout place it.', undefined],
    ]);
    const [link, lock] = node.badges;
    // top-right and top-left.
    expect(link.box.x + link.box.width / 2).toBeGreaterThan(node.box.x + node.box.width / 2);
    expect(lock.box.x + lock.box.width / 2).toBeLessThan(node.box.x + node.box.width / 2);
    expect(link.box.y).toBeLessThan(node.box.y + node.box.height / 2);
  });

  it('a badge whose `visible` does not hold is not drawn', () => {
    expect(nodeOf(draw(), 'a2').badges).toEqual([]);
    // A location's link badge is its branch's.
    expect(nodeOf(draw(), 'l1').badges).toEqual([]);
  });
});

describe('the force layout in tiers', () => {
  it('is read as written: its tiers from the centre outwards and its gap', () => {
    expect(layout.findings).toEqual([]);
    expect(layout.value).toMatchObject({ default: 'rings', trigger: 'onChange', respect: 'pinned' });
    expect(layout.value.algorithms.rings).toMatchObject({ name: 'rings', algorithm: 'force', force: { tiers: [['Project'], ['Specification'], ['Agent'], ['Location'], ['Environment']], gap: 24 } });
  });

  it('is the layout of the one viewpoint, since it runs by itself whenever the model changes', () => {
    expect(viewpoints.value.all[viewpoints.value.default].layout?.force?.gap).toBe(24);
  });

  it('places a node that is not pinned, and leaves a pinned one at its kept position', () => {
    const scene = draw({ view: kept({ pinned: { s1: { x: 240, y: -80 } } }) });
    expect([nodeOf(scene, 's1').box.x, nodeOf(scene, 's1').box.y]).toEqual([240, -80]);
    const places = new Set(scene.nodes.map((node) => `${node.box.x},${node.box.y}`));
    expect(places.size).toBe(scene.nodes.length);
  });

  it('lets every node be moved: a drag is what pins it', () => {
    expect(draw().nodes.filter((node) => !node.movable.x || !node.movable.y).map((node) => node.id)).toEqual([]);
  });
});

// What the definition uses beside the constructs task T085 names, and the interpreter must read to show a diagram at all.
describe('what else the definition is drawn and edited from', () => {
  it('a derived relation with an id of its own: one line for each key that names an element', () => {
    expect(derivedRelations(metamodel.value, expressions, model).value.map((relation) => [relation.id, relation.type, relation.source, relation.target])).toEqual([
      ['project:s1', 'ProjectSpecification', 'p1', 's1'],
      ['project:s2', 'ProjectSpecification', 'p1', 's2'],
      ['specification:a1', 'SpecificationAgent', 's1', 'a1'],
      ['agent:l1', 'AgentLocation', 'a1', 'l1'],
      ['environment:l1', 'LocationEnvironment', 'l1', 'e1'],
    ]);
    expect(draw({ view: kept({ filters: { archived: true } }) }).edges.map((edge) => edge.id)).toEqual(['project:s1', 'project:s2', 'specification:a1', 'agent:l1', 'environment:l1']);
  });

  it('a derived relation whose end is of a type its relation does not allow is dropped, and said once for its type', () => {
    const wrong: Model = { ...model, elements: model.elements.map((candidate) => (candidate.id === 'a2' ? { ...candidate, attributes: { ...candidate.attributes, specification: 'p1' } } : candidate)) };
    const derived = derivedRelations(metamodel.value, expressions, wrong);
    expect(derived.value.map((relation) => relation.id)).not.toContain('specification:a2');
    expect(derived.findings.map((finding) => [finding.code, finding.severity, finding.element])).toEqual([['std.derivedEnds', 'warning', 'a2']]);
  });

  it('drawing a derived relation runs the operation its `edits.connect` names: the key is set', () => {
    const outcome = done(behavior.value.connect(model, 'SpecificationAgent', 's3', 'a2'));
    expect(outcome.changes).toEqual([{ kind: 'set', id: 'a2', attributes: { specification: 's3' } }]);
    expect(done(behavior.value.connect(model, 'LocationEnvironment', 'l1', 'e1')).changes).toEqual([]);
  });

  it('a second specification for an agent is refused, with the sentence the definition gives', () => {
    expect(behavior.value.connect(model, 'SpecificationAgent', 's3', 'a1').refused)
      .toBe('"Developer" already works on "Billing". Remove that line first: an agent works on one specification at a time.');
  });

  it('removing a derived relation runs the operation its `edits.delete` names: the key is cleared', () => {
    expect(done(behavior.value.remove(model, ['specification:a1'])).changes).toEqual([{ kind: 'set', id: 'a1', attributes: { specification: null } }]);
    expect(done(behavior.value.remove(model, ['environment:l1'])).changes).toEqual([{ kind: 'set', id: 'l1', attributes: { environment: null } }]);
  });

  it('removing an element clears every key that names it, and takes its children with it', () => {
    const changes = done(behavior.value.remove(model, ['s1'])).changes;
    expect(changes).toContainEqual({ kind: 'set', id: 'a1', attributes: { specification: null } });
    expect(changes.filter((change) => change.kind === 'remove').map((change) => change.id).sort()).toEqual(['s1', 't1', 't2', 't3', 't4', 't5']);
  });

  it('a `create-child` entry adds a child in its slot, with the defaults of its type and the moment it was made', () => {
    const outcome = done(behavior.value.addChild(model, 's1', { env: { now: new Date('2026-10-09T09:15:00+02:00') } }));
    expect(outcome.changes).toHaveLength(1);
    const [added] = outcome.changes;
    expect(added).toMatchObject({ kind: 'add', type: 'Task', parent: 's1', attributes: { status: 'pending' } });
    const attributes = added.kind === 'add' ? added.attributes : {};
    // The moment is written with its offset, to the second (`newPrecision`).
    expect(attributes.updated).toMatch(/^2026-10-09T\d\d:\d\d:00[+-]\d\d:\d\d$/);
    expect(new Date(String(attributes.updated)).getTime()).toBe(new Date('2026-10-09T09:15:00+02:00').getTime());
    expect(typeof attributes.title === 'string' && attributes.title.length > 0).toBe(true);
    expect(outcome.effects).toContainEqual({ kind: 'editLabel', elements: [added.id] });
    expect(done(behavior.value.addChild(model, 'l1', {})).changes[0]).toMatchObject({ kind: 'add', type: 'PullRequest', parent: 'l1' });
    expect(behavior.value.addChild(model, 'a1', {}).refused).toEqual(expect.any(String));
  });

  it('`conditions`: a specification is outlined in the colour of its status, dashed when it is archived', () => {
    const scene = draw({ view: kept({ filters: { archived: true } }) });
    expect(nodeOf(scene, 's1').style.stroke).toMatchObject({ color: { token: 'aad.progressing' }, width: 2 });
    expect(nodeOf(scene, 's3').style.stroke).toMatchObject({ color: { token: 'aad.pending' }, width: 2 });
    expect(nodeOf(scene, 's2').style.stroke).toMatchObject({ color: { token: 'aad.archived' }, dash: [4, 3] });
    expect(nodeOf(scene, 's1').labels.find((label) => label.id === 'status')).toMatchObject({ text: 'Progressing', style: { font: { color: { token: 'aad.progressing' } } } });
  });

  it('a label\'s tooltip and its one line: a long name is cut and shown in full on hover', () => {
    const label = nodeOf(draw(), 's1').labels.find((candidate) => candidate.id === 'name');
    expect(label).toMatchObject({ text: 'Billing', tooltip: 'Billing', overflow: 'ellipsis', maxLines: 1 });
  });

  it('a toolbox drop gives the element the values its tool states', () => {
    const outcome = done(behavior.value.create(model, 'specification', { x: 10, y: 20 }, viewing(nothingKept)));
    expect(outcome.changes).toEqual([{ kind: 'add', id: outcome.created[0], type: 'Specification', attributes: { name: 'New specification', status: 'pending' } }]);
  });

  it('`view` in an operation changes what is kept: `pinned` and `groups`', () => {
    const own = loadSpecification({
      ...written,
      behavior: { operations: {
        lock: { for: ['Agent'], actions: [{ view: { pinned: true } }] },
        unlock: { for: ['Agent'], actions: [{ view: { pinned: false } }] },
        open: { for: ['Specification'], actions: [{ view: { groups: { pending: 'false' } } }] },
      } },
    }).value;
    const intents = interpretBehavior(own, metamodel.value, expressions, {
      constraints: constraints.value, layout: layout.value, coordinates: coordinates.value, persistence: persistence.value, toolbox: toolbox.value, notation: notation.value, viewpoints: viewpoints.value,
    }).value;
    const where: Situation = { view: nothingKept, at: (id) => (id === 'a1' ? { x: 7, y: 9 } : undefined) };
    expect(done(intents.operate(model, 'lock', ['a1'], where)).view).toEqual([{ kind: 'pin', element: 'a1', x: 7, y: 9 }]);
    expect(done(intents.operate(model, 'unlock', ['a1'], { view: kept({ pinned: { a1: { x: 7, y: 9 } } }) })).view).toEqual([{ kind: 'unpin', element: 'a1' }]);
    expect(done(intents.operate(model, 'open', ['s1'], where)).view).toEqual([{ kind: 'group', element: 's1', group: 'pending', collapsed: false }]);
  });
});

describe('the support record of the interpreter', () => {
  it('states no feature the definition requires as unsupported', () => {
    const required = (at('language', 'requires', 'features') as string[] | undefined) ?? [];
    expect(required.filter((feature) => !supportedFeatures.includes(feature))).toEqual([]);
  });
});
