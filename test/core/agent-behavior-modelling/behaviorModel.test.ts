import { describe, expect, it } from 'vitest';
import { viewTypeOf } from '../../../src/core/frame/toolType';
import { layoutOf } from '../../../src/core/tool/registrationLayout';
import { behaviorModel, behaviorModelNames } from '../tool/support';
import {
  after, bare, boxOf, change, childLabels, done, edit, horizontalGap, layoutAfter, markdown, minimumGap, nodeHeight, nodeWidth, research, sentenceOf, source, type, verticalGap,
} from './model';

// Agent Behavior Modelling through the tool type read from its definition. Reading and writing the
// Markdown is the persistence plugin's, and is tested in test/core/plugins/abm-markdown/: what is
// here is what the tool type shows, offers and answers for a document.

const kinds = ['Do in order', 'Try in order', 'Do together', 'Retry', 'Repeat until', 'Only while', 'Ask approval before', 'Check', 'Do', 'Ask the user', 'Delegate'];

describe('Agent Behavior Modelling as a diagram type', () => {
  it('carries the names every ADP host uses, and is a model only by choice', () => {
    expect(type.origin).toBe('etalii/agent-behavior-modelling');
    expect(type.displayName).toBe('Agent Behavior Modelling');
    expect(type.kind).toBe('diagram');
    expect(viewTypeOf(type)).toBe('etalii.adp.etalii.agent-behavior-modelling');
    // A Markdown file is a behavior model only when a registration beside it says so: the extension is shared, and claimed for the registration alone.
    expect(type.claims).toEqual([{ extensions: ['md'], shared: true, marker: false, registrationOnly: true }]);
    // The binding states no `claims.suggest` (etalii.adp issue 150), so no file is said to look like a behavior model, the example included.
    expect(type.suggests('research-assistant.md', research)).toBe(false);
    expect(type.suggests('notes.md', '# Notes\n\n- a list\n')).toBe(false);
    expect(type.suggests('quoted.md', '```\n## Behavior\n```\n')).toBe(false);
  });

  it('has eleven kinds, each with its keyword', () => {
    // A leaf can become any kind, so its Kind row lists all eleven.
    expect(type.fields(source, ['1.4'])[0].options).toEqual(kinds);
    const drawn = new Map(behaviorModelNames().flatMap((name) => type.view(behaviorModel(name), {}).nodes.map((node) => [node.type, node.labels[0].text] as const)));
    expect([...drawn].sort()).toEqual([
      ['Approval', 'Ask approval before'], ['AskUser', 'Ask the user'], ['Check', 'Check'], ['Delegate', 'Delegate'], ['Do', 'Do'], ['Fallback', 'Try in order'],
      ['Guard', 'Only while'], ['Parallel', 'Do together'], ['RepeatUntil', 'Repeat until'], ['Retry', 'Retry up to 2 times'], ['Sequence', 'Do in order'],
    ]);
  });
});

describe('each example', () => {
  it.each(behaviorModelNames())('%s opens editable, with one root, no finding, and nothing written', (name) => {
    const example = behaviorModel(name);
    const scene = type.view(example, {});
    expect(scene).toMatchObject({ readOnly: false, findings: [] });
    expect(scene.notice).toBeUndefined();
    expect(scene.nodes.length).toBeGreaterThan(3);
    expect(scene.nodes.filter((node) => !node.id.includes('.')).map((node) => node.id)).toEqual(['1']);
    expect(scene.edges).toHaveLength(scene.nodes.length - 1);
    expect(type.findings(example)).toEqual([]);
    // A label entered as it stands is no splice.
    for (const node of scene.nodes.slice(0, 3)) expect(done({ kind: 'rename', id: node.id, text: node.labels[1].editText }, example).splices).toEqual([]);
  });
});

describe('the rules', () => {
  const found = (text: string) => type.findings(markdown(text));
  const rules = (text: string) => found(text).map((finding) => [finding.rule, finding.severity, finding.line]);

  it('report each of the seven with its severity and line', () => {
    // The first is the reader's own finding, which the definition words; the six after it are the definition's constraints.
    expect(rules('# Agent\n')).toEqual([['abm.no-behavior', 'information', 0]]);
    expect(rules('# Agent\n\n## Behavior\n\nNothing yet.\n')).toEqual([['abm.no-behavior', 'information', 2]]);
    expect(rules('## Behavior\n- **Do:** a\n  - **Do:** b\n')).toEqual([['abm.leaf-with-children', 'error', 1]]);
    expect(rules('## Behavior\n- **Only while:** a\n')).toEqual([['abm.decorator-children', 'error', 1]]);
    expect(rules('## Behavior\n- **Retry up to 0 times:** a\n  - **Do:** b\n')).toEqual([['abm.no-attempts', 'error', 1]]);
    expect(rules('## Behavior\n- **Do together:** a\n')).toEqual([['abm.empty-composite', 'warning', 1]]);
    expect(rules('## Behavior\n- **Do:** a\n- **Do:** b\n')).toEqual([['abm.several-roots', 'warning', 2]]);
  });

  it('report an item without a keyword, which is read as a Do and drawn dashed', () => {
    const text = '## Behavior\n\n- **Do in order:** Start\n\t- just do it\n  - **Retry:** no number\n';
    expect(rules(text)).toEqual([['abm.no-keyword', 'warning', 3], ['abm.no-keyword', 'warning', 4]]);
    const nodes = type.view(markdown(text), {}).nodes;
    expect(nodes.map((node) => [node.id, node.type, node.labels[1].editText, node.style.stroke?.dash !== undefined])).toEqual([
      ['1', 'Sequence', 'Start', false], ['1.1', 'Do', 'just do it', true], ['1.2', 'Do', '**Retry:** no number', true],
    ]);
  });

  it('say what to do about it', () => {
    const messageOf = (text: string): string => found(text)[0].message;
    expect(messageOf('## Behavior\n- **Only while:** a\n  - **Do:** b\n  - **Do:** c\n')).toBe('"Only while" wraps exactly one child, but has 2. Put them under a Do in order first.');
    expect(messageOf('## Behavior\n- **Only while:** a\n')).toBe('"Only while" wraps exactly one child, but has 0. Add the node it applies to beneath it.');
    expect(messageOf('## Behavior\n- **Do:** a\n  - **Do:** b\n')).toBe('"Do: a" holds no children, but has 1. Make it a Do in order, or move them out.');
    expect(messageOf('## Behavior\n- **Retry up to 0 times:** a\n  - **Do:** b\n')).toBe('A Retry that allows no attempt never runs its child.');
    expect(messageOf('## Behavior\n- **Do together:** a\n')).toBe('"Do together: a" has no children, so it has nothing to run.');
    expect(messageOf('## Behavior\n- **Do:** a\n- **Do:** b\n')).toBe('The tree has 2 roots, and an agent starts at one. Put them under a Do in order or a Try in order to say how they relate.');
    expect(messageOf('## Behavior\n- just do it\n')).toBe('"just do it" has no keyword, so it is read as a Do. Start it with one, such as **Do:** or **Check:**.');
    expect(messageOf('# Agent\n')).toBe('This file has no Behavior heading, so there is no behavior tree to draw. Add a node to start one.');
  });
});

describe('the layout', () => {
  it('is a tidy tree: children left to right in order, a parent centred over its first and last child, one row per depth', () => {
    const nodes = type.view(bare, {}).nodes;
    const at = (id: string) => nodes.find((node) => node.id === id)!.box;
    expect(at('1').y).toBe(0);
    expect(at('1.1').y).toBe(nodeHeight + verticalGap);
    expect(at('1.3.1.1').y).toBe(3 * (nodeHeight + verticalGap));
    for (const [first, second] of [['1.1', '1.2'], ['1.2', '1.3'], ['1.3', '1.4'], ['1.2.1', '1.2.2']]) {
      expect(at(second).x).toBeGreaterThanOrEqual(at(first).x + nodeWidth + horizontalGap);
    }
    expect(at('1').x).toBe((at('1.1').x + at('1.4').x) / 2);
    expect(Math.min(...nodes.map((node) => node.box.x))).toBe(0);
  });

  it('draws a row at the height the registration stores for it, and everything beneath follows', () => {
    const y = (id: string) => boxOf(id).y;
    // The example's registration lowers 1.2, and with it the whole second row.
    expect(layoutOf(source.registration)['1.2']).toEqual({ x: 360, y: 160 });
    expect([y('1.1'), y('1.2'), y('1.3'), y('1.4')]).toEqual([160, 160, 160, 160]);
    expect(y('1.2.1')).toBe(160 + nodeHeight + verticalGap);
    expect(boxOf('1.2', bare).y).toBe(nodeHeight + verticalGap);
    // Across, a node's place is its order among its siblings: the x the registration stores is not where it is drawn.
    expect(boxOf('1.2').x).toBe(boxOf('1.2', bare).x);
  });

  it('never draws a row closer to its parent than the minimum gap', () => {
    expect(boxOf('1.1', markdown(research, 'etalii/agent-behavior-modelling\nlayout:\n  1.1: 0 -500\n')).y).toBe(nodeHeight + minimumGap);
  });
});

describe('what is drawn', () => {
  const scene = type.view(source, {});
  const nodeOf = (id: string) => scene.nodes.find((node) => node.id === id)!;

  it('is one element per node with its keyword, family and size, and one line from every parent to each child', () => {
    expect(scene.nodes).toHaveLength(13);
    const root = nodeOf('1');
    expect(root).toMatchObject({ id: '1', type: 'Sequence', box: { width: 200, height: 60 }, connectable: true, movable: { x: true, y: true } });
    expect(root.labels.map((label) => [label.id, label.text, label.editable])).toEqual([['keyword', 'Do in order', false], ['label', 'Answer the research question', 'inline']]);
    expect(root.labels[1].editText).toBe('Answer the research question');
    // The family of a kind is its shape and its fill: a composite, a decorator, and a leaf of each sort.
    const drawnAs = (id: string) => [nodeOf(id).labels[0].text, nodeOf(id).shape.name, nodeOf(id).style.fill];
    expect(drawnAs('1')).toEqual(['Do in order', 'superellipse', { token: 'color.abm.composite' }]);
    expect(drawnAs('1.3')).toEqual(['Repeat until', 'hexagon', { token: 'color.abm.decorator' }]);
    expect(drawnAs('1.4')).toEqual(['Do', 'rect', { token: 'color.abm.action' }]);
    expect(drawnAs('1.1.1')).toEqual(['Check', 'pill', { token: 'color.abm.check' }]);
    expect(drawnAs('1.1.2')).toEqual(['Ask the user', 'parallelogram', { token: 'color.abm.other' }]);
    expect(drawnAs('1.2.1')).toEqual(['Delegate', 'diode', { token: 'color.abm.other' }]);
    expect(root.style.stroke?.dash).toBeUndefined();
    expect(scene.edges).toHaveLength(12);
    expect(scene.edges[0]).toMatchObject({ id: 'child:1.1', type: 'Child', source: '1', target: '1.1', from: { node: '1', side: 'bottom' }, to: { node: '1.1', side: 'top' } });
    expect(scene.edges.map((edge) => edge.id)).toEqual(scene.nodes.slice(1).map((node) => `child:${node.id}`));
  });

  it('draws the whole tree whatever is in view, each line with both its ends', () => {
    // The hand-coded diagram drew only what was in view; a scene holds every node.
    const root = nodeOf('1').box;
    const inView = type.view(source, { viewport: { x: root.x, y: root.y, width: 10, height: 10 } });
    expect(inView.nodes).toEqual(scene.nodes);
    expect(inView.edges).toEqual(scene.edges);
    expect(inView.edges.filter((edge) => edge.from === undefined || edge.to === undefined)).toEqual([]);
  });

  it('offers the eleven kinds in the toolbox, each saying what the node does', () => {
    const toolbox = type.toolbox(source);
    expect(toolbox.map((entry) => entry.label)).toEqual(kinds);
    expect(toolbox.map((entry) => entry.id)).toEqual([
      'abm.add.sequence', 'abm.add.fallback', 'abm.add.parallel', 'abm.add.retry', 'abm.add.repeat', 'abm.add.guard', 'abm.add.approval', 'abm.add.check', 'abm.add.action', 'abm.add.ask', 'abm.add.delegate',
    ]);
    expect(toolbox[8]).toEqual({ id: 'abm.add.action', label: 'Do', icon: 'mdi-play-outline', description: 'Carries out one piece of work: a tool call, an answer, an edit. Drop it below the node it belongs under.' });
    expect(toolbox[3]).toEqual({ id: 'abm.add.retry', label: 'Retry', icon: 'mdi-replay', description: 'Runs its child again when it fails, at most N times in all. Drop it below the node it belongs under.' });
    expect(toolbox.filter((entry) => !entry.description.endsWith(' Drop it below the node it belongs under.'))).toEqual([]);
  });
});

describe('editing', () => {
  it('renames by rewriting the one line, keeping the keyword as written', () => {
    expect(change({ kind: 'rename', id: '1.2', text: ' Search\nwidely ' })).toEqual({ removed: ['  - **Do together:** Search'], added: ['  - **Do together:** Search widely'] });
    expect(edit({ kind: 'action', action: 'abm.rename', id: '1.4' })).toEqual({ kind: 'editInPlace', id: '1.4', multiline: false });
  });

  it('changes kind through the property grid, offering only kinds that can hold the children', () => {
    const fields = type.fields(source, ['1.2']);
    expect(fields.map((field) => [field.id, field.label, field.group])).toEqual([['abm.kind', 'Kind', 'Node'], ['abm.label', 'Label', 'Node'], ['abm.notes', 'Notes', 'Node'], ['abm.place', 'Place', 'Node']]);
    expect(fields[0]).toMatchObject({ control: 'choice', value: 'Do together', options: ['Do in order', 'Try in order', 'Do together'] });
    expect(fields[1]).toMatchObject({ control: 'text', value: 'Search' });
    expect(fields[3]).toMatchObject({ value: '1.2', readOnly: "A node's place follows from where it sits in the tree." });
    expect(sentenceOf({ kind: 'setField', id: '1.2', field: 'abm.place', value: '1.1' })).toBe("A node's place follows from where it sits in the tree.");
    expect(change({ kind: 'setField', id: '1.2', field: 'abm.kind', value: 'Try in order' }).added).toEqual(['  - **Try in order:** Search']);
    expect(sentenceOf({ kind: 'setField', id: '1.2', field: 'abm.kind', value: 'Check' })).toBe('"Check" holds no children, and this node has 3 children.');
    expect(sentenceOf({ kind: 'setField', id: '1.2', field: 'abm.kind', value: 'Retry' })).toBe('"Retry up to 3 times" holds exactly one child, and this node has 3.');
    // A node with one child may become a decorator too, and a node with none anything.
    expect(type.fields(source, ['1.3'])[0].options).toEqual(kinds.slice(0, 7));
    expect(type.fields(source, []).concat(type.fields(source, ['1.1', '1.2']), type.fields(source, ['nobody']))).toEqual([]);
  });

  it('gives a new Retry three attempts, and shows Attempts only for a Retry', () => {
    const request = { kind: 'setField', id: '1.3', field: 'abm.kind', value: 'Retry' } as const;
    expect(change(request).added).toEqual(['  - **Retry up to 3 times:** Every claim in the draft has a source']);
    const from = after(request);
    expect(type.fields(from, ['1.3']).map((field) => field.label)).toEqual(['Kind', 'Label', 'Attempts', 'Notes', 'Place']);
    expect(type.fields(from, ['1.3'])[2]).toMatchObject({ id: 'abm.attempts', control: 'text', value: '3' });
    expect(type.view(from, {}).nodes.find((node) => node.id === '1.3')!.labels[0].text).toBe('Retry up to 3 times');
    expect(change({ kind: 'setField', id: '1.3', field: 'abm.attempts', value: '1' }, from).added).toEqual(['  - **Retry up to 1 time:** Every claim in the draft has a source']);
    expect(sentenceOf({ kind: 'setField', id: '1.3', field: 'abm.attempts', value: '0' }, from)).toBe("'0' is not a number of attempts; a Retry allows at least 1.");
    // The row is a Retry's alone: on another kind there is none to set.
    expect(edit({ kind: 'setField', id: '1.2', field: 'abm.attempts', value: '2' }).kind).toBe('refused');
  });

  it('writes notes under the node at its text column, and removes them when emptied', () => {
    expect(type.fields(source, ['1.4'])[2]).toMatchObject({ id: 'abm.notes', control: 'multiline', value: 'Put the answer first, in one paragraph, before the detail.' });
    expect(change({ kind: 'setField', id: '1.2.1', field: 'abm.notes', value: 'Prefer reviews.\n\nAfter 2015.' })).toEqual({ removed: [], added: ['      Prefer reviews.', '', '      After 2015.'] });
    expect(change({ kind: 'setField', id: '1.4', field: 'abm.notes', value: '' })).toEqual({ removed: ['    Put the answer first, in one paragraph, before the detail.'], added: [] });
  });

  it('moves a node earlier or later among its siblings with everything beneath it', () => {
    const later = after({ kind: 'action', action: 'abm.move-later', id: '1.1' });
    expect(childLabels(later, '1')).toEqual(['Search', 'Settle the question', 'Every claim in the draft has a source', 'Answer with the draft, its sources and what remains uncertain']);
    expect(childLabels(later, '1.2')).toHaveLength(2);
    // What the registration stores follows the node to its new place.
    expect(layoutOf(later.registration)).toEqual({ '1.1': { x: 360, y: 160 } });
    const back = after({ kind: 'action', action: 'abm.move-earlier', id: '1.2' }, later);
    expect(back.text).toBe(research);
    expect(back.registration).toBe(source.registration);
    expect(type.actions(source, ['1.1']).find((action) => action.id === 'abm.move-earlier')).toMatchObject({ enabled: false, disabledReason: 'It is already the first of its siblings.' });
    expect(type.actions(source, ['1.4']).find((action) => action.id === 'abm.move-later')).toMatchObject({ enabled: false, disabledReason: 'It is already the last of its siblings.' });
    expect(sentenceOf({ kind: 'action', action: 'abm.move-earlier', id: '1.1' })).toBe('It is already the first of its siblings.');
    expect(sentenceOf({ kind: 'action', action: 'abm.move-later', id: '1.4' })).toBe('It is already the last of its siblings.');
  });

  it('re-parents by a line drawn from the new parent, re-indenting the subtree, and refuses a leaf, itself and its own descendants', () => {
    const moved = after({ kind: 'connect', from: '1.2', to: '1.3' });
    expect(moved.text.split('\n').slice(28, 37)).toEqual([
      '  - **Do together:** Search',
      '    - **Delegate:** Search the academic literature',
      '    - **Delegate:** Search news and official publications',
      "    - **Delegate:** Search the user's own documents",
      '    - **Repeat until:** Every claim in the draft has a source',
      '      - **Do in order:** Draft and check',
      '        - **Do:** Write or revise the draft',
      '        - **Do:** Mark every claim that has no source yet',
      '  - **Do:** Answer with the draft, its sources and what remains uncertain',
    ]);
    expect(sentenceOf({ kind: 'connect', from: '1.4', to: '1.1' })).toBe('"Do" holds no children.');
    expect(sentenceOf({ kind: 'connect', from: '1.3.1', to: '1.3' })).toBe('A node cannot move beneath itself.');
    expect(sentenceOf({ kind: 'connect', from: '1.3', to: '1.1' })).toBe('"Repeat until" holds exactly one child, and already has it.');
    expect(edit({ kind: 'connect', from: '1.2', to: '1.2' }).kind).toBe('refused');
  });

  it('removes a node with everything beneath it as one splice, asking first with their number', () => {
    const request = { kind: 'action', action: 'abm.remove', id: '1.3' } as const;
    expect(edit(request)).toEqual({ kind: 'confirm', title: 'Remove', confirmLabel: 'Remove', danger: true, message: 'Removing this node also removes the 3 nodes beneath it.' });
    expect(done(request, source, true).splices).toHaveLength(1);
    expect(change(request, source, true)).toEqual({ removed: research.split('\n').slice(32, 36), added: [] });
    expect(research.split('\n')[32]).toBe('  - **Repeat until:** Every claim in the draft has a source');
    expect(edit({ kind: 'action', action: 'abm.remove', id: '1.2.1' }).kind).toBe('applied');
  });

  it('adds a dropped node under the nearest node above with room, among its children by where it landed', () => {
    const request = { kind: 'drop', entry: 'abm.add.check', x: boxOf('1.2.1').x + 90, y: boxOf('1.2').y + 100 } as const;
    expect(change(request)).toEqual({ removed: [], added: ['    - **Check:** New question'] });
    // The new node is the first child of 1.2: it is written before the child that was first.
    expect(after(request).text.split('\n').slice(29, 31)).toEqual(['    - **Check:** New question', '    - **Delegate:** Search the academic literature']);
    // The definition says nothing follows a drop from the toolbox (`after: "none"`): nothing is selected and no label is opened,
    // where the hand-coded diagram selected the new node and edited its label at once.
    const dropped = done(request);
    expect(dropped.select).toBeUndefined();
    expect(dropped.editLabel).toBeUndefined();
    // "Add Check here" on the canvas does the same at the point it was invoked at, and then edits the label of the new node.
    expect(done({ kind: 'action', action: 'abm.add.check', x: request.x, y: request.y })).toMatchObject({ select: '1.2.1', editLabel: true });
    expect(sentenceOf({ kind: 'drop', entry: 'abm.add.check', x: 0, y: -500 })).toMatch(/^Drop the node below the node it belongs under/);
  });

  it('adds the first node to a file without a tree, opening a Behavior section at the end', () => {
    const drop = { kind: 'drop', entry: 'abm.add.sequence', x: 0, y: 0 } as const;
    expect(after(drop, markdown('# Agent\n\nSome prose.')).text).toBe('# Agent\n\nSome prose.\n\n## Behavior\n\n- **Do in order:** New steps');
    expect(after(drop, markdown('# Agent\r\n\r\n## Behavior\r\n')).text).toBe('# Agent\r\n\r\n## Behavior\r\n\r\n- **Do in order:** New steps\r\n');
  });

  it('adds a child from the menu to a node that takes another, and says where notes are edited', () => {
    const labels = (id?: string): string[] => type.actions(source, id === undefined ? [] : [id]).map((action) => action.label);
    expect(labels('1.2')).toEqual(['Rename…', 'Edit notes…', 'Move earlier', 'Move later', 'Remove', ...kinds.map((kind) => `Add child: ${kind}`), 'Arrange diagram']);
    expect(labels('1.4')).toEqual(['Rename…', 'Edit notes…', 'Move earlier', 'Move later', 'Remove', 'Arrange diagram']);
    expect(type.actions(source, ['1.2']).map((action) => action.id)).toEqual([
      'abm.rename', 'abm.edit-notes', 'abm.move-earlier', 'abm.move-later', 'abm.remove',
      'abm.add.sequence', 'abm.add.fallback', 'abm.add.parallel', 'abm.add.retry', 'abm.add.repeat', 'abm.add.guard', 'abm.add.approval', 'abm.add.check', 'abm.add.action', 'abm.add.ask', 'abm.add.delegate',
      'abm.arrange',
    ]);
    expect(type.actions(source, ['1.2']).slice(0, 5).map((action) => action.shortcut)).toEqual(['F2', undefined, 'Alt+Up', 'Alt+Down', 'Delete']);
    // `disabledReason` is there only while an action is disabled.
    expect(type.actions(source, ['1.2']).filter((action) => !action.enabled || 'disabledReason' in action)).toEqual([]);
    // The empty canvas offers each kind at the point, before "Arrange diagram": the hand-coded diagram offered "Arrange diagram" alone.
    expect(labels()).toEqual([...kinds.map((kind) => `Add ${kind} here`), 'Arrange diagram']);
    const added = { kind: 'action', action: 'abm.add.retry', id: '1.2' } as const;
    expect(edit(added)).toMatchObject({ kind: 'applied', select: '1.2.4', editLabel: true });
    expect(change(added)).toEqual({ removed: [], added: ['    - **Retry up to 3 times:**'] });
    expect(sentenceOf({ kind: 'action', action: 'abm.add.check', id: '1.4' })).toBe('"Do" holds no children. Add the node under a Do in order, Try in order or Do together.');
    expect(edit({ kind: 'action', action: 'abm.edit-notes', id: '1.4' })).toEqual({ kind: 'showField', field: 'abm.notes' });
    expect(edit({ kind: 'action', action: 'abm.rename', id: '1.4' })).toEqual({ kind: 'editInPlace', id: '1.4', multiline: false });
  });
});

describe('dragging a node', () => {
  it('lowers its whole row and everything beneath it, in the registration alone', () => {
    const outcome = done({ kind: 'move', id: '1.1', x: boxOf('1.1').x, y: boxOf('1.1').y + 40 });
    expect(outcome.splices).toEqual([]);
    expect(outcome.select).toBe('1.1');
    const layout = layoutAfter(outcome);
    expect(layout['1.1']?.y).toBe(200);
    expect(layout['1.4']?.y).toBe(200);
    expect(layout['1.3.1.2']?.y).toBe(200 + 2 * (nodeHeight + verticalGap));
    expect(Object.hasOwn(layout, '1')).toBe(false);
    expect(boxOf('1.2', { ...source, registration: outcome.registration as string }).y).toBe(200);
  });

  it('reorders the Markdown when it is dropped past a sibling\'s middle, and the stored positions follow their nodes', () => {
    const request = { kind: 'move', id: '1.1', x: boxOf('1.2').x + 10, y: boxOf('1.1').y } as const;
    const outcome = done(request);
    expect(childLabels(after(request), '1').slice(0, 2)).toEqual(['Search', 'Settle the question']);
    expect(outcome.select).toBe('1.2');
    // The example stored a height under 1.2, which is now 1.1.
    const layout = layoutAfter(outcome);
    expect(layout['1.1']?.y).toBe(160);
    expect(layout['1.2.1']?.y).toBe(160 + nodeHeight + verticalGap);
  });

  it('creates the registration with its origin when the first row is dragged, and refuses a drop that changes nothing', () => {
    const plain = boxOf('1.1', bare);
    const outcome = done({ kind: 'move', id: '1.1', x: plain.x, y: plain.y + 30 }, bare);
    expect((outcome.registration as string).startsWith('etalii/agent-behavior-modelling\nlayout:\n  1.1: ')).toBe(true);
    expect(layoutAfter(outcome)['1.1']).toEqual({ x: plain.x, y: plain.y + 30 });
    // The definition's sentence, for every tool type alike: the hand-coded diagram said "That node is already there."
    expect(sentenceOf({ kind: 'move', id: '1.1', x: boxOf('1.1').x, y: boxOf('1.1').y })).toBe('That is already there.');
  });

  it('keeps a row at least the minimum gap below its parent', () => {
    const outcome = done({ kind: 'move', id: '1.1', x: boxOf('1.1').x, y: -1000 });
    expect(layoutAfter(outcome)['1.1']?.y).toBe(nodeHeight + minimumGap);
  });
});

describe('Arrange diagram', () => {
  it('forgets every dragged position and leaves the Markdown alone', () => {
    const outcome = done({ kind: 'action', action: 'abm.arrange' });
    expect(outcome.splices).toEqual([]);
    expect(outcome.registration).toBe('etalii/agent-behavior-modelling\n');
  });

  it('refuses when there is nothing to forget, or no registration', () => {
    expect(sentenceOf({ kind: 'action', action: 'abm.arrange' }, markdown(research, 'etalii/agent-behavior-modelling\n'))).toBe('This behavior model is already arranged.');
    expect(sentenceOf({ kind: 'action', action: 'abm.arrange' }, bare)).toBe('This behavior model was opened without a registration, so it has no dragged positions to forget.');
    expect(type.actions(markdown('# Agent\n'), []).filter((action) => !action.enabled)).toEqual([
      { id: 'abm.arrange', label: 'Arrange diagram', icon: 'mdi-sitemap-outline', enabled: false, disabledReason: 'There is nothing to arrange until this behavior model has a node.' },
    ]);
  });
});

describe('a new behavior model', () => {
  it('explains itself to the agent and starts the tree', () => {
    const text = type.newDocument('Support agent.md');
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('# Support agent');
    expect(lines).toContain('## How to follow the behavior');
    expect(lines).toContain('- **Retry up to N times** runs its child again when it fails, at most N times in all.');
    expect(lines.slice(-4)).toEqual(['## Behavior', '', '- **Do in order:** Handle the request', '']);
    // The legend is prose to the diagram: only the tree under Behavior is read.
    expect(type.view(markdown(text), {}).nodes.map((node) => node.labels[1].editText)).toEqual(['Handle the request']);
    expect(type.findings(markdown(text)).map((finding) => finding.rule)).toEqual(['abm.empty-composite']);
  });
});
