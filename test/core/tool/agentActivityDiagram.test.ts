import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decode, encode } from '../../../src/core/fbl/text/utf8';
import { viewTypeOf, type EditOutcome, type EditRequest, type Finding, type Source, type TextSplice, type ViewOptions } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import type { Scene, SceneNode } from '../../../src/core/scene/scene';
import { applied, array, at, definitionOf, diagramOf, linesChanged, object, refusal, specificationOf, spliced } from './support';

// The agent activity diagram as a tool type made from its definition (etalii.adp spec 027, task
// T087), against what its definition and its binding say of the same files: the three examples of
// standalone's module, the fixtures of its tests (`fixtures/tools/agent-activity-diagram/`,
// standalone 5756a07) and the bytes of etalii.adp's FBL fixture `agent-activity-edits`, which
// states every kind of edit the diagram makes on the file the fixtures share. A step of that
// fixture is one model change; here each is the gesture of this host that comes to it. What a
// test expects is the fixture's or the definition's, and is typed here only where it is the bytes
// of a document.

const folder = 'agent-activity-diagram';
const specification = specificationOf(folder);
const type = diagramOf(definitionOf(folder), registry);

const examples = ['adp-one-day', 'every-state', 'two-projects'];
const example = (name: string): Source => ({
  fileName: `${name}.aad`,
  text: readFileSync(`examples/agent-activity-diagram/${name}/${name}.aad`, 'utf8'),
  registration: readFileSync(`examples/agent-activity-diagram/${name}/${name}.adp`, 'utf8'),
});
const fixture = (name: string): Source => ({ fileName: `${name}.aad`, text: readFileSync(`fixtures/tools/agent-activity-diagram/${name}.aad`, 'utf8') });
const oneDay = fixture('one-day');
const sourceOf = (text: string): Source => ({ fileName: 'one-day.aad', text });

// ---- the fixture of etalii.adp ----

interface Step { readonly doc: string; readonly edit?: unknown; readonly expect: string; readonly undo?: boolean; readonly redo?: boolean; readonly refused?: string }
const edits = JSON.parse(readFileSync('fixtures/fbl/conformance/fixtures/agent-activity-edits/fixture.json', 'utf8')) as { readonly steps: readonly Step[] };
/** The step of the fixture that makes a model change, by what its change names, with the bytes before and after it. */
function step(about: string): { readonly before: Source; readonly after: string; readonly doc: string } {
  const index = edits.steps.findIndex((candidate) => candidate.undo !== true && candidate.redo !== true && JSON.stringify(candidate.edit).includes(about));
  if (index < 1) throw new Error(`The fixture has no step about ${about}.`);
  return { before: sourceOf(edits.steps[index - 1].expect), after: edits.steps[index].expect, doc: edits.steps[index].doc };
}

// ---- requests and what they come to ----

const send = (source: Source, request: EditRequest, options: ViewOptions = {}): EditOutcome => type.edit(source, request, options, false);
/** The text after a request that is applied, which also undoes exactly: the inverse of its splices gives the bytes before back. */
function after(source: Source, request: EditRequest, options: ViewOptions = {}): string {
  const outcome = applied(send(source, request, options));
  expect(outcome.registration, 'nothing of an agent activity diagram is kept in a registration').toBeUndefined();
  const text = spliced(source.text, outcome.splices);
  expect(spliced(text, inverseOf(source.text, outcome.splices))).toBe(source.text);
  return text;
}
/** The splices that undo an applied outcome: of the text after it, each putting back the bytes its splice took out. This is what undo in the editor does. */
function inverseOf(before: string, splices: readonly TextSplice[]): TextSplice[] {
  const bytes = encode(before);
  let shift = 0;
  return splices.map((splice) => {
    const written = encode(splice.text).length;
    const back = { offset: splice.offset + shift, length: written, text: decode(bytes.subarray(splice.offset, splice.offset + splice.length)) };
    shift += written - splice.length;
    return back;
  });
}
const nodeOf = (scene: Scene, id: string): SceneNode => {
  const found = scene.nodes.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`The scene draws no node ${id}.`);
  return found;
};
const said = (findings: readonly Finding[]): string[] => findings.map((finding) => `${finding.rule} ${finding.severity} ${finding.line}`);
const without = (text: string, lines: string): string => {
  expect(text).toContain(lines);
  return text.replace(lines, '');
};

describe('the agent activity diagram, made from its definition', () => {
  it('is a diagram with the origin, the display name and the claim its definition and its binding state', () => {
    expect(type.origin).toBe(at(specification, 'language', 'origin'));
    expect(type.origin).toBe('etalii/agent-activity-diagram');
    expect(viewTypeOf(type)).toBe('etalii.adp.etalii.agent-activity-diagram');
    expect(type.kind).toBe('diagram');
    expect(type.displayName).toBe(at(specification, 'language', 'label'));
    expect(type.claims).toEqual([{ extensions: ['aad'], shared: false, marker: false, registrationOnly: false }]);
    expect(type.claimed('work.aad', oneDay.text)).toBe(true);
    expect(type.claimed('work.yaml', oneDay.text)).toBe(false);
  });

  it('starts a new document as the binding\'s template: the header alone', () => {
    expect(type.newDocument('work')).toBe('agent-activity-diagram: 1\r\n');
    expect(type.findings(sourceOf(type.newDocument('work')))).toEqual([]);
  });

  it('reads its own definition with no finding', () => {
    expect(type.findings(sourceOf('agent-activity-diagram: 1\r\n')).filter((finding) => finding.rule.startsWith('disl.'))).toEqual([]);
  });
});

describe.each(examples)('the example %s', (name) => {
  const source = example(name);

  it('opens with nothing worse to say than information', () => {
    const findings = type.findings(source);
    expect(findings.filter((finding) => finding.severity === 'error' || finding.severity === 'warning').map((finding) => `${finding.rule}: ${finding.message}`)).toEqual([]);
    const scene = type.view(source, {});
    expect(scene.readOnly).toBe(false);
    expect(scene.notice).toBeUndefined();
    expect(scene.nodes.length).toBeGreaterThan(5);
    expect(scene.edges.length).toBeGreaterThan(3);
  });

  it('draws only the five element types as nodes, each with what its file says, and lists tasks and pull requests inside them', () => {
    const scene = type.view(source, {});
    expect([...new Set(scene.nodes.map((node) => node.type))].sort()).toEqual(['Agent', 'Environment', 'Location', 'Project', 'Specification']);
    const items = scene.nodes.flatMap((node) => node.compartments.flatMap((compartment) => compartment.rows));
    expect(items.some((row) => row.kind === 'heading')).toBe(true);
    for (const node of scene.nodes) expect(source.text, node.id).toContain(`- id: ${node.id}\r\n`);
  });

  it('is saved as it was read: nothing it is asked changes its text or its registration', () => {
    type.view(source, {});
    type.findings(source);
    type.toolbox(source);
    const scene = type.view(source, {});
    for (const node of scene.nodes) {
      type.fields(source, [node.id]);
      type.actions(source, [node.id], {});
    }
    // A rename to the name an element has is no edit at all.
    const [first] = scene.nodes;
    const outcome = applied(send(source, { kind: 'rename', id: first.id, text: first.labels[0].editText }));
    expect(outcome.splices).toEqual([]);
    expect(outcome.registration).toBeUndefined();
    expect(spliced(source.text, outcome.splices)).toBe(source.text);
    // The registration says which tool the file is for, and holds nothing of what is drawn.
    expect(source.registration!.split(/\r?\n/).filter((line) => line !== '')).toEqual(['etalii/agent-activity-diagram', `body: ${name}.aad`]);
  });
});

describe('what the diagram offers for a file', () => {
  it('a toolbox entry for each of the five element types, as the definition\'s toolbox states them, and none for a task or a pull request', () => {
    const declared = array(at(specification, 'toolbox', 'groups')).flatMap((group) => array(object(group).tools)).map(object);
    expect(type.toolbox(oneDay)).toEqual(declared.map((tool) => ({ id: tool.id, label: tool.label, icon: tool.icon, description: tool.doc })));
    expect(type.toolbox(oneDay).map((entry) => entry.id)).toEqual(['project', 'specification', 'agent', 'location', 'environment']);
  });

  it('the properties of an element, a task and a pull request, in the groups and the order the definition gives', () => {
    expect(type.fields(oneDay, ['s-knowledge']).map((field) => [field.group, field.id, field.value])).toEqual([
      ['Identity', 'name', 'Knowledge designer'], ['Identity', 'status', 'Progressing'], ['Relations', 'project', 'p-standalone'],
      ['Link', 'link', '.spec-workflow/specs/knowledge-designer/requirements.md'],
    ]);
    expect(type.fields(oneDay, ['s-knowledge']).find((field) => field.id === 'status')?.options).toEqual(['Pending', 'Progressing', 'Input Required', 'Finished', 'Archived']);
    expect(type.fields(oneDay, ['t-k6']).map((field) => [field.id, field.value])).toEqual([
      ['title', 'Table component'], ['status', 'Input Required'], ['updated', '2026-10-08T21:10:00+02:00'], ['link', 'https://github.com/etalii-adp/etalii.adp.ide.standalone/pull/150'],
    ]);
    expect(type.fields(oneDay, ['pr-150']).map((field) => field.id)).toEqual(['title', 'updated', 'link']);
    expect(type.fields(oneDay, ['e-fractal']).find((field) => field.id === 'environmentKind')?.value).toBe('Local machine');
  });

  it('the menu of an element, with the entries for locking its position, and of the canvas', () => {
    const menu = (id: string | undefined) => type.actions(oneDay, id === undefined ? [] : [id], {}).map((action) => `${action.id}: ${action.label}${action.enabled ? '' : ' (off)'}`);
    // s-knowledge is locked in the file, a-dev2 is not.
    expect(menu('s-knowledge')).toEqual(['editLabel: Rename', 'create-child: Add task', 'openLink: Open link', 'unpin: Unlock position', 'delete: Delete']);
    expect(menu('a-dev2')).toEqual(['editLabel: Rename', 'openLink: Open link', 'pin: Lock position', 'delete: Delete']);
    expect(menu('l-kd')).toEqual([
      'editLabel: Rename', 'create-child: Add pull request', 'openBranchLink: Open the branch\'s link', 'openFolderLink: Open the folder\'s link', 'pin: Lock position', 'delete: Delete',
    ]);
    expect(menu('p-adp')).toEqual(['editLabel: Rename', 'openLink: Open link (off)', 'pin: Lock position', 'delete: Delete']);
    expect(menu('t-k6')).toEqual(['editLabel: Rename', 'setTaskStatus: Set status', 'openLink: Open link', 'delete: Delete']);
    expect(menu(undefined)).toEqual(['unpinAll: Unlock all positions']);
    expect(type.actions(fixture('findings/duplicate-id'), [], {}).map((action) => [action.id, action.enabled])).toEqual([['unpinAll', false]]);
  });

  it('the switch of the canvas, with the value the file keeps for it', () => {
    const filters = (source: Source) => type.view(source, {}).chrome?.filters.map((filter) => [filter.id, filter.label, filter.control, filter.value, filter.kept]);
    expect(filters(oneDay)).toEqual([['archived', 'Show archived', 'switch', false, true]]);
    expect(filters(example('every-state'))).toEqual([['archived', 'Show archived', 'switch', true, true]]);
    expect(type.view(oneDay, {}).nodes.some((node) => node.id === 's-rider')).toBe(false);
    expect(type.view(sourceOf(oneDay.text.replace('showArchived: false', 'showArchived: true')), {}).nodes.some((node) => node.id === 's-rider')).toBe(true);
  });

  it('the state of each group, the kept one before the default', () => {
    const rows = nodeOf(type.view(oneDay, {}), 's-knowledge').compartments[0].rows;
    // The file keeps nothing for Progressing and Input Required, which are open by default, and no task is pending.
    expect(rows.map((row) => (row.kind === 'heading' ? `[${row.group} ${row.count} ${row.collapsed ? 'folded' : 'open'}]` : row.element))).toEqual(['[progressing 1 open]', 't-k2', '[input-required 1 open]', 't-k6']);
    const rested = nodeOf(type.view(example('every-state'), {}), 's-progressing').compartments[0].rows.filter((row) => row.kind === 'heading');
    expect(rested.map((row) => [row.group, row.collapsed])).toEqual([['progressing', true], ['pending', true], ['input-required', false], ['finished', false]]);
  });
});

describe('every kind of edit, as the bytes of etalii.adp\'s fixture agent-activity-edits', () => {
  it('opening and saving without an edit writes the bytes that were read', () => {
    // The file the fixture edits is the one standalone's tests read.
    expect(edits.steps[0].expect).toBe(oneDay.text);
    expect(applied(send(oneDay, { kind: 'rename', id: 'p-adp', text: 'etalii.adp' })).splices).toEqual([]);
  });

  it('renaming a specification replaces its name in place', () => {
    const { before, after: expected } = step('Knowledge base designer');
    expect(after(before, { kind: 'rename', id: 's-knowledge', text: 'Knowledge base designer' })).toBe(expected);
  });

  it('a name cannot be emptied: the rename is refused and nothing is written', () => {
    expect(refusal(send(oneDay, { kind: 'rename', id: 's-knowledge', text: '' }))).toEqual(expect.any(String));
  });

  it('a task\'s status is written in its stored form, by the operation the definition sets it with, which also says when', () => {
    const { before, after: expected } = step('"status":"finished"');
    const text = after(before, { kind: 'setField', id: 't-k6', field: 'status', value: 'Finished' });
    // `setTaskStatus` sets the status and the moment it was set; the fixture's step is the status alone.
    const { removed, added } = linesChanged(expected, text);
    expect(removed).toEqual(['        updated: 2026-10-08T21:10:00+02:00']);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/^ {8}updated: \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    expect(linesChanged(before.text, expected)).toEqual({ removed: ['        status: input-required'], added: ['        status: finished'] });
  });

  it('clearing a task\'s moment removes its key', () => {
    const { before, after: expected } = step('"updated":null');
    expect(after(before, { kind: 'setField', id: 't-k2', field: 'updated', value: '' })).toBe(expected);
  });

  it('a new task goes after the specification\'s last task, its keys in the binding\'s order and its moment written plain', () => {
    const { before, after: expected } = step('t-k7');
    const outcome = applied(send(before, { kind: 'action', action: 'create-child', id: 's-knowledge' }));
    const text = spliced(before.text, outcome.splices);
    const { removed, added } = linesChanged(before.text, text);
    expect(removed).toEqual([]);
    expect(added).toHaveLength(4);
    expect(added[0]).toMatch(/^ {6}- id: [0-9a-z]{25}$/);
    expect(added[1]).toMatch(/^ {8}title: \S.*$/);
    expect(added[2]).toBe('        status: pending');
    expect(added[3]).toMatch(/^ {8}updated: \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    // With the fixture's id, title and moment in their place, the bytes are the fixture's.
    const id = added[0].slice(12);
    expect(text.replace(id, 't-k7').replace(added[1], '        title: Property grid').replace(added[3], '        updated: 2026-10-09T09:15:00+02:00')).toBe(expected);
    // The new task is selected and its title is edited in place.
    expect(outcome).toMatchObject({ select: id, editLabel: true });
  });

  it('removing a task removes its entry with the comment directly above it', () => {
    const { before, after: expected } = step('"remove":{"element":"t-k6"}');
    expect(after(before, { kind: 'action', action: 'delete', id: 't-k6' })).toBe(expected);
  });

  it('naming another specification in an agent\'s properties replaces the reference', () => {
    const { before, after: expected } = step('"specification":"s-rider"');
    expect(after(before, { kind: 'setField', id: 'a-dev2', field: 'specification', value: 's-rider' })).toBe(expected);
  });

  it('removing the line from a specification to an agent clears the key, which is removed', () => {
    const { before, after: expected } = step('"specification":null');
    // The line is there, and not drawn while the archived specification it comes from is hidden.
    expect(type.view(before, {}).edges.find((edge) => edge.target === 'a-dev2')).toMatchObject({ id: 'specification:a-dev2', source: 's-rider', hidden: 'filter' });
    expect(after(before, { kind: 'action', action: 'delete', id: 'specification:a-dev2' })).toBe(expected);
  });

  it('drawing the line again inserts the key where the binding\'s key order puts it', () => {
    const { before, after: expected } = step('"specification":"s-knowledge"');
    expect(type.view(before, {}).edges.some((edge) => edge.target === 'a-dev2')).toBe(false);
    expect(after(before, { kind: 'connect', from: 's-knowledge', to: 'a-dev2' })).toBe(expected);
  });

  it('dragging a locked specification replaces its stored position under view', () => {
    const { before, after: expected } = step('pinned:s-knowledge');
    const { box } = nodeOf(type.view(before, {}), 's-knowledge');
    // The file keeps it at 240, -80; it is dragged 60 to the right and 40.5 up.
    expect(after(before, { kind: 'move', id: 's-knowledge', x: box.x + 60, y: box.y - 40.5 })).toBe(expected);
  });

  it('dragging a location the layout placed locks it where it is dropped: a placement after the last one', () => {
    const { before, after: expected } = step('pinned:l-kd');
    expect(nodeOf(type.view(before, {}), 'l-kd').pinned).toBe(false);
    const text = after(before, { kind: 'move', id: 'l-kd', x: 520, y: 40 });
    expect(text).toBe(expected);
    expect(nodeOf(type.view(sourceOf(text), {}), 'l-kd')).toMatchObject({ pinned: true, box: { x: 520, y: 40 } });
  });

  it('unlocking the location removes its placement, and the list keeps the other one', () => {
    const { before, after: expected } = step('"remove":{"element":"pinned:l-kd"}');
    expect(after(before, { kind: 'pin', id: 'l-kd', pinned: false })).toBe(expected);
    expect(after(before, { kind: 'action', action: 'unpin', id: 'l-kd' })).toBe(expected);
  });

  it('folding a group back to its default removes its stored state, and the list it leaves empty', () => {
    // The fixture's step sets `collapsed: true` in place, which is a model change FBL plans. A
    // gesture never makes it: Pending is folded by default, and a state is kept only while it
    // differs from its default (DISL 6.9), so folding it removes the entry.
    const { before } = step('groups:s-knowledge#pending');
    expect(after(before, { kind: 'fold', id: 's-knowledge', group: 'pending', folded: true }))
      .toBe(without(before.text, '  groups:\r\n    - element: s-knowledge\r\n      group: pending\r\n      collapsed: false\r\n'));
  });

  it('folding a group that is open by default adds a group state after the last one', () => {
    // The fixture's step folds Finished, which is folded by default; the gesture that adds a state is on a group that is open by default.
    const { before, after: expected } = step('groups:s-knowledge#finished');
    expect(after(before, { kind: 'fold', id: 's-knowledge', group: 'progressing', folded: true })).toBe(expected.replace('      group: finished\r\n', '      group: progressing\r\n'));
  });

  it('turning on the switch of the canvas writes showArchived under view', () => {
    const { before, after: expected } = step('"showArchived":true');
    const text = after(before, { kind: 'filter', id: 'archived', value: true });
    expect(text).toBe(expected);
    // Turned off again it is at its default. The binding has no way to leave the key out, so the default is written, as the fixture's own undo writes it.
    expect(after(sourceOf(text), { kind: 'filter', id: 'archived', value: false })).toBe(before.text);
  });

  it('removing a specification removes its group states, its placement, the agent\'s reference to it and its own entry with its tasks', () => {
    const { before, after: expected } = step('"remove":{"element":"s-knowledge"}');
    expect(after(before, { kind: 'action', action: 'delete', id: 's-knowledge' })).toBe(expected);
  });
});

describe('what the toolbox and the menus add', () => {
  it('an element dropped from the toolbox is added to its list and locked where it was dropped, as one edit', () => {
    const outcome = applied(send(oneDay, { kind: 'drop', entry: 'agent', x: 310, y: -45.25 }));
    const text = spliced(oneDay.text, outcome.splices);
    const id = outcome.select!;
    expect(id).toMatch(/^[0-9a-z]{25}$/);
    // Two places of the file change and nothing else: the agents' list gains the agent, and the placements its lock.
    expect(outcome.splices).toHaveLength(2);
    expect(text).toBe(oneDay.text
      .replace('    link: https://claude.ai/code\r\n', `    link: https://claude.ai/code\r\n  - id: ${id}\r\n    name: New agent\r\n`)
      .replace('      y: -80\r\n', `      y: -80\r\n    - element: ${id}\r\n      x: 310\r\n      y: -45.25\r\n`));
    expect(outcome).toMatchObject({ editLabel: true, multiline: false });
    expect(nodeOf(type.view(sourceOf(text), {}), id)).toMatchObject({ type: 'Agent', pinned: true, box: { x: 310, y: -45.25 } });
  });

  it('the first element of a new file creates its list and the view mapping with its placement', () => {
    const empty = sourceOf(type.newDocument('work'));
    const outcome = applied(send(empty, { kind: 'drop', entry: 'project', x: 0, y: 0 }));
    const id = outcome.select!;
    expect(spliced(empty.text, outcome.splices)).toBe(`agent-activity-diagram: 1\r\nprojects:\r\n  - id: ${id}\r\n    name: New project\r\nview:\r\n  placements:\r\n    - element: ${id}\r\n      x: 0\r\n      y: 0\r\n`);
  });

  it('a new pull request goes into its location, with a title and the moment it was made', () => {
    const outcome = applied(send(oneDay, { kind: 'action', action: 'create-child', id: 'l-kd' }));
    const { added } = linesChanged(oneDay.text, spliced(oneDay.text, outcome.splices));
    expect(added).toHaveLength(3);
    expect(added[0]).toMatch(/^ {6}- id: [0-9a-z]{25}$/);
    expect(added[1]).toMatch(/^ {8}title: \S.*$/);
    expect(added[2]).toMatch(/^ {8}updated: \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
  });

  it('"Lock position" keeps an element where the layout put it, and "Unlock all positions" lets every one go', () => {
    const { box } = nodeOf(type.view(oneDay, {}), 'a-dev2');
    const locked = after(oneDay, { kind: 'action', action: 'pin', id: 'a-dev2' });
    const round = (value: number): number => Math.round(value * 100) / 100;
    expect(locked).toContain(`      y: -80\r\n    - element: a-dev2\r\n      x: ${round(box.x)}\r\n      y: ${round(box.y)}\r\n  groups:\r\n`);
    expect(after(sourceOf(locked), { kind: 'action', action: 'unpinAll' }))
      .toBe(without(oneDay.text, '  placements:\r\n    - element: s-knowledge\r\n      x: 240\r\n      y: -80\r\n'));
  });

  it('a dragged position is a splice of the file\'s view mapping, and never anything of the registration', () => {
    const source = example('two-projects');
    expect(source.text).not.toContain('\r\nview:');
    const [first] = type.view(source, {}).nodes;
    const outcome = applied(send(source, { kind: 'move', id: first.id, x: 12, y: 34 }));
    expect(outcome.registration).toBeUndefined();
    expect(spliced(source.text, outcome.splices)).toBe(`${source.text}view:\r\n  placements:\r\n    - element: ${first.id}\r\n      x: 12\r\n      y: 34\r\n`);
  });

  it('opening a link asks the host for it and writes nothing: of an element, of a task and of a location\'s folder', () => {
    expect(send(oneDay, { kind: 'action', action: 'openLink', id: 'p-standalone' })).toEqual({ kind: 'open', path: 'https://github.com/etalii-adp/etalii.adp.ide.standalone' });
    expect(send(oneDay, { kind: 'openLink', id: 't-k6' })).toEqual({ kind: 'open', path: 'https://github.com/etalii-adp/etalii.adp.ide.standalone/pull/150' });
    expect(send(oneDay, { kind: 'action', action: 'openFolderLink', id: 'l-kd' })).toEqual({ kind: 'open', path: 'C:/git/etalii.adp.ide.standalone/.claude/worktrees/kd' });
    // The link symbol of the one row of a location's folder, which is no element.
    expect(send(oneDay, { kind: 'openLink', id: 'l-kd', compartment: 'folder', item: 0 })).toEqual({ kind: 'open', path: 'C:/git/etalii.adp.ide.standalone/.claude/worktrees/kd' });
  });
});

describe('an edit the definition refuses', () => {
  it('a second specification for an agent: nothing is written, and the sentence is the definition\'s', () => {
    const outcome = send(oneDay, { kind: 'connect', from: 's-rider', to: 'a-dev2' });
    expect(outcome).toEqual({ kind: 'refused', sentence: '"Developer 2" already works on "Knowledge designer". Remove that line first: an agent works on one specification at a time.' });
    const rule = array(at(specification, 'constraints', 'rules')).map(object).find((candidate) => candidate.id === 'secondSpecification');
    expect(String(object(rule?.message).cel)).toContain('already works on');
  });

  it('a line between two elements no relation joins', () => {
    expect(refusal(send(oneDay, { kind: 'connect', from: 'p-standalone', to: 'e-fractal' }))).toEqual(expect.any(String));
    expect(refusal(send(oneDay, { kind: 'connect', from: 'a-dev2', to: 's-knowledge' }))).toEqual(expect.any(String));
  });

  it('opening a link an element does not have, with the sentence of the operation', () => {
    const [unavailable] = array(at(specification, 'behavior', 'operations', 'openLink', 'unavailable')).map(object);
    expect(send(oneDay, { kind: 'action', action: 'openLink', id: 'p-adp' })).toEqual({ kind: 'refused', sentence: unavailable.message });
    expect(unavailable.message).toBe('It has no link. Add one in the property grid.');
  });

  it('an entry that is not a mapping: it is kept as it is, with the binding\'s sentence', () => {
    const odd = sourceOf(oneDay.text.replace('  - id: p-adp\r\n    name: etalii.adp\r\n', '  - id: p-adp\r\n    name: etalii.adp\r\n  - just a line\r\n'));
    const findings = type.findings(odd).filter((finding) => finding.rule === 'std.unreadableEntry');
    expect(findings.map((finding) => [finding.message, finding.line])).toEqual([['This entry is not a mapping, so it is kept as it is.', 8]]);
    expect(after(odd, { kind: 'rename', id: 'p-adp', text: 'ADP' })).toBe(odd.text.replace('name: etalii.adp\r\n', 'name: ADP\r\n'));
  });

  it('anything in a file that cannot be read: it opens empty and read-only, and is never written', () => {
    const broken = sourceOf('agent-activity-diagram: 1\r\nprojects: [\r\n');
    const scene = type.view(broken, {});
    expect(scene.nodes).toEqual([]);
    expect(scene.readOnly).toBe(true);
    expect(type.findings(broken).map((finding) => finding.rule)).toEqual(['std.unparseable']);
    expect(scene.notice).toBe(type.findings(broken)[0].message);
    expect(type.toolbox(broken)).toEqual([]);
    expect(refusal(send(broken, { kind: 'drop', entry: 'project', x: 0, y: 0 }))).toEqual(expect.any(String));
  });
});

describe('the fixtures of standalone\'s tests, each with its finding on its line', () => {
  const findingsOf = (name: string): Finding[] => type.findings(fixture(`findings/${name}`));
  const lineOf = (name: string, text: string): number => fixture(`findings/${name}`).text.split(/\r?\n/).findIndex((line) => line.includes(text));

  it('has a test for every fixture', () => {
    expect(readdirSync('fixtures/tools/agent-activity-diagram/findings').sort()).toEqual([
      'dangling-reference.aad', 'duplicate-id.aad', 'link-not-openable.aad', 'missing-id.aad', 'newer-version.aad', 'orphaned-lock.aad', 'unknown-key.aad', 'wrong-type-reference.aad',
    ]);
  });

  it('a key that names no element: an error on the key\'s line, and the element is drawn', () => {
    const found = findingsOf('dangling-reference').filter((finding) => finding.severity === 'error');
    // DISL's built-in for a reference to a missing element, which takes the place of FBL's own finding (DISL 8.7, 11.2).
    expect(said(found)).toEqual([`std.references error ${lineOf('dangling-reference', 'specification: s-gone')}`]);
    expect(found[0].message).toContain('s-gone');
    expect(type.view(fixture('findings/dangling-reference'), {}).nodes.map((node) => node.id)).toEqual(['a']);
  });

  it('an id used twice: on the line of the second holder, and both are drawn', () => {
    const found = findingsOf('duplicate-id').filter((finding) => finding.rule === 'std.duplicateId');
    expect(said(found)).toEqual(['std.duplicateId warning 5']);
    expect(type.view(fixture('findings/duplicate-id'), {}).nodes).toHaveLength(2);
  });

  it('a link that is neither an address nor a path: a warning with the definition\'s sentence, on the element\'s line', () => {
    const found = findingsOf('link-not-openable').filter((finding) => finding.rule === 'aad.link-not-openable');
    expect(said(found)).toEqual([`aad.link-not-openable warning ${lineOf('link-not-openable', '- id: p')}`]);
    expect(found[0].message).toBe('The link "ftp://example.org/project" is neither an http or https address nor a path, so it is kept and not opened.');
    // The link is kept, and following it is refused with a reason that names it.
    expect(refusal(send(fixture('findings/link-not-openable'), { kind: 'action', action: 'openLink', id: 'p' }))).toContain('ftp://example.org/project');
  });

  it('an entry without an id: on its line, and it is drawn', () => {
    const found = findingsOf('missing-id').filter((finding) => finding.rule === 'std.missingId');
    expect(said(found)).toEqual([`std.missingId warning ${lineOf('missing-id', '- name: Project')}`]);
    expect(type.view(fixture('findings/missing-id'), {}).nodes).toHaveLength(1);
  });

  it('a file of another version: said on its first line', () => {
    const found = findingsOf('newer-version').filter((finding) => finding.rule === 'fbl.header-mismatch');
    expect(said(found)).toEqual(['fbl.header-mismatch warning 0']);
    expect(type.view(fixture('findings/newer-version'), {}).nodes).toHaveLength(1);
  });

  it('a lock and a group state left behind by an element that is gone: nothing is said of them, and they go with the next write', () => {
    const source = fixture('findings/orphaned-lock');
    expect(findingsOf('orphaned-lock').filter((finding) => finding.severity !== 'information')).toEqual([]);
    expect(type.view(source, {}).nodes.map((node) => [node.id, node.pinned])).toEqual([['p', true]]);
    // Any edit made here: the edit, and the two entries about nothing gone with it; the lock that names an element stays.
    expect(after(source, { kind: 'rename', id: 'p', text: 'Renamed' }))
      .toBe('agent-activity-diagram: 1\r\n# A lock and a group state left behind by an element an agent removed.\r\nprojects:\r\n  - id: p\r\n    name: Renamed\r\nview:\r\n  placements:\r\n    - element: p\r\n      x: 10\r\n      y: 20\r\n');
  });

  it('a key the diagram does not read: it is kept, and nothing of it is an error or a warning', () => {
    const source = fixture('findings/unknown-key');
    expect(findingsOf('unknown-key').filter((finding) => finding.severity === 'error' || finding.severity === 'warning')).toEqual([]);
    expect(after(source, { kind: 'rename', id: 'p', text: 'Renamed' })).toBe(source.text.replace('name: Project', 'name: Renamed'));
  });

  it('a key that names an element of the wrong type: said once, on the line of the element that holds it, and no line is drawn for it', () => {
    const found = findingsOf('wrong-type-reference').filter((finding) => finding.severity === 'error' || finding.severity === 'warning');
    // A derived relation whose end its type does not allow is dropped and reported once for its type (DISL 4.11.3).
    expect(said(found)).toEqual([`std.derivedEnds warning ${lineOf('wrong-type-reference', '- id: a')}`]);
    const scene = type.view(fixture('findings/wrong-type-reference'), {});
    expect(scene.nodes.map((node) => node.id)).toEqual(['p', 'a']);
    expect(scene.edges).toEqual([]);
  });
});

describe('the rules of the definition, each as a finding of the file that breaks it', () => {
  it('are information where the picture is incomplete, on the line of the element', () => {
    const found = type.findings(oneDay).filter((finding) => finding.rule.startsWith('aad.'));
    expect(found.map((finding) => [finding.rule, finding.severity, finding.message, oneDay.text.split('\r\n')[finding.line]])).toEqual([
      ['aad.project-without-specification', 'information', '"etalii.adp" has no specification.', '  - id: p-adp'],
    ]);
  });

  it('are all there for a file that breaks each', () => {
    const lonely = sourceOf('agent-activity-diagram: 1\r\nprojects:\r\n  - id: p\r\n    name: P\r\nspecifications:\r\n  - id: s\r\n    name: S\r\n    status: pending\r\nagents:\r\n  - id: a\r\n    name: A\r\nlocations:\r\n  - id: l\r\n    branch: main\r\n    branchLink: gopher://x\r\n');
    expect(type.findings(lonely).map((finding) => finding.rule).sort()).toEqual([
      'aad.agent-without-location', 'aad.agent-without-specification', 'aad.link-not-openable', 'aad.location-without-agent', 'aad.location-without-environment',
      'aad.project-without-specification', 'aad.specification-without-project',
    ]);
  });
});
