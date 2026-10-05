import { describe, expect, it } from 'vitest';
import type { EditOutcome, EditRequest, Source } from '../../../src/core/frame/diagramType';
import { viewTypeOf } from '../../../src/core/frame/diagramType';
import { actionIds, agentBehaviorModelling as type, fieldIds } from '../../../src/core/agent-behavior-modelling/index';
import { compute, minimumGap, nodeHeight, nodeWidth, horizontalGap, verticalGap } from '../../../src/core/agent-behavior-modelling/layout';
import { kinds, kindFromKeyword, keywordOf, rootsOf } from '../../../src/core/agent-behavior-modelling/model';
import { parse } from '../../../src/core/agent-behavior-modelling/parser';
import { readLayout, writeLayout } from '../../../src/core/registration/registration';
import { LineDocument } from '../../../src/core/text/lineDocument';
import { spliceBetween } from '../../../src/core/text/splice';
import { filesUnder, read } from '../files';

const examples = filesUnder('examples/agent-behavior-modelling', '.md').filter((path) => !path.endsWith('readme.md'));
const research = read('examples/agent-behavior-modelling/research-assistant/research-assistant.md');
const researchRegistration = read('examples/agent-behavior-modelling/research-assistant/research-assistant.adp');
const source: Source = { text: research, registration: researchRegistration };
const model = (text: string) => parse(LineDocument.parse(text));

function applied(outcome: EditOutcome): Extract<EditOutcome, { kind: 'applied' }> {
  if (outcome.kind !== 'applied') throw new Error(`not applied: ${JSON.stringify(outcome)}`);
  return outcome;
}
const edit = (request: EditRequest, from = source, confirmed = false): EditOutcome => type.edit(from, request, {}, confirmed);
const refusal = (request: EditRequest, from = source): string | undefined => {
  const outcome = edit(request, from);
  return outcome.kind === 'refused' ? outcome.sentence : undefined;
};
/** The lines an edit took out and put in; every other line is proven untouched. */
function change(request: EditRequest, from = source): { removed: string[]; added: string[]; text: string } {
  const text = applied(edit(request, from)).text;
  const splice = spliceBetween(from.text, text);
  if (!splice) return { removed: [], added: [], text };
  const lines = LineDocument.parse(from.text).lines.map((line) => line.text);
  return { removed: lines.slice(splice.startLine, splice.endLine), added: splice.text.length === 0 ? [] : splice.text.replace(/\r?\n$/, '').split(/\r?\n/), text };
}

describe('Agent Behavior Modelling as a diagram type', () => {
  it('carries the names every ADP host uses, and is a model only by choice', () => {
    expect(type.origin).toBe('etalii/agent-behavior-modelling');
    expect(type.displayName).toBe('Agent Behavior Modelling');
    expect(viewTypeOf(type)).toBe('etalii.adp.etalii.agent-behavior-modelling');
    expect(type.shared).toBe(true);
    expect(type.suggests(research)).toBe(true);
    expect(type.suggests('# Notes\n\n- a list\n')).toBe(false);
    expect(type.suggests('```\n## Behavior\n```\n')).toBe(false);
  });

  it('has eleven kinds, each with its keyword, and reads a keyword whatever its capitals', () => {
    expect(kinds.map((kind) => kind.keyword)).toEqual([
      'Do in order', 'Try in order', 'Do together', 'Retry up to N times', 'Repeat until', 'Only while', 'Ask approval before', 'Check', 'Do', 'Ask the user', 'Delegate',
    ]);
    expect(kindFromKeyword('do  IN order')?.kind.id).toBe('sequence');
    expect(kindFromKeyword('Retry up to 1 time')).toMatchObject({ retryCount: 1 });
    expect(kindFromKeyword('Retry up to 3 times')).toMatchObject({ retryCount: 3 });
    expect(kindFromKeyword('Retry')).toBeUndefined();
    expect(keywordOf('retry', 1)).toBe('Retry up to 1 time');
  });
});

describe('reading the Markdown', () => {
  it.each(examples)('%s is read, breaks no rule, and is given back byte for byte', (path) => {
    const text = read(path);
    const document = LineDocument.parse(text);
    const read1 = parse(document);
    expect(document.text).toBe(text);
    expect(read1.nodes.length).toBeGreaterThan(3);
    expect(rootsOf(read1)).toHaveLength(1);
    expect(type.findings({ text })).toEqual([]);
  });

  it('uses all eleven kinds across the four examples', () => {
    const used = new Set(examples.flatMap((path) => model(read(path)).nodes.map((node) => node.kind)));
    expect([...used].sort()).toEqual(kinds.map((kind) => kind.id).sort());
  });

  it('gives each node its place in the tree as its id, its children and its notes', () => {
    const nodes = model(research).nodes;
    expect(nodes.map((node) => node.id)).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.2', '1.2.1', '1.2.2', '1.2.3', '1.3', '1.3.1', '1.3.1.1', '1.3.1.2', '1.4']);
    expect(nodes[0]).toMatchObject({ kind: 'sequence', label: 'Answer the research question', line: 24, subtreeEnd: 37, childIds: ['1.1', '1.2', '1.3', '1.4'] });
    expect(nodes[12]).toMatchObject({ kind: 'action', notes: 'Put the answer first, in one paragraph, before the detail.', notesRange: { start: 37, end: 37 } });
  });

  it('reads only the first list under the first Behavior heading, never one quoted in a code block', () => {
    const text = '# Agent\n\n```\n## Behavior\n- **Do:** quoted\n```\n\n### behaviour\n\nSome prose.\n\n* **Check:** real\n\n## Behavior\n\n- **Do:** second\n';
    const read1 = model(text);
    expect(read1.nodes.map((node) => [node.kind, node.label, node.marker])).toEqual([['check', 'real', '*']]);
    expect(read1.sectionLine).toBe(7);
  });

  it('reads an item without a keyword as a Do, and says so', () => {
    const text = '## Behavior\n\n- **Do in order:** Start\n\t- just do it\n  - **Retry:** no number\n';
    const read1 = model(text);
    expect(read1.nodes.map((node) => [node.id, node.kind, node.hasKeyword, node.label])).toEqual([
      ['1', 'sequence', true, 'Start'], ['1.1', 'action', false, 'just do it'], ['1.2', 'action', false, '**Retry:** no number'],
    ]);
    expect(type.findings({ text }).map((finding) => [finding.rule, finding.severity, finding.line])).toEqual([['abm.no-keyword', 'warning', 3], ['abm.no-keyword', 'warning', 4]]);
  });
});

describe('the rules', () => {
  const rules = (text: string) => type.findings({ text }).map((finding) => [finding.rule, finding.severity, finding.line]);

  it('report each of the seven with its severity and line', () => {
    expect(rules('# Agent\n')).toEqual([['abm.no-behavior', 'information', 0]]);
    expect(rules('# Agent\n\n## Behavior\n\nNothing yet.\n')).toEqual([['abm.no-behavior', 'information', 2]]);
    expect(rules('## Behavior\n- **Do:** a\n  - **Do:** b\n')).toEqual([['abm.leaf-with-children', 'error', 1]]);
    expect(rules('## Behavior\n- **Only while:** a\n')).toEqual([['abm.decorator-children', 'error', 1]]);
    expect(rules('## Behavior\n- **Retry up to 0 times:** a\n  - **Do:** b\n')).toEqual([['abm.no-attempts', 'error', 1]]);
    expect(rules('## Behavior\n- **Do together:** a\n')).toEqual([['abm.empty-composite', 'warning', 1]]);
    expect(rules('## Behavior\n- **Do:** a\n- **Do:** b\n')).toEqual([['abm.several-roots', 'warning', 2]]);
  });

  it('say what to do about it', () => {
    expect(type.findings({ text: '## Behavior\n- **Only while:** a\n  - **Do:** b\n  - **Do:** c\n' })[0].message)
      .toBe('"Only while" wraps exactly one child, but has 2. Put them under a Do in order first.');
  });
});

describe('the layout', () => {
  it('is a tidy tree: children left to right in order, a parent centred over its first and last child, one row per depth', () => {
    const positions = compute(model(research));
    const at = (id: string) => positions.get(id)!;
    expect(at('1').y).toBe(0);
    expect(at('1.1').y).toBe(nodeHeight + verticalGap);
    expect(at('1.3.1.1').y).toBe(3 * (nodeHeight + verticalGap));
    for (const [first, second] of [['1.1', '1.2'], ['1.2', '1.3'], ['1.3', '1.4'], ['1.2.1', '1.2.2']]) {
      expect(at(second).x).toBeGreaterThanOrEqual(at(first).x + nodeWidth + horizontalGap);
    }
    expect(at('1').x).toBe((at('1.1').x + at('1.4').x) / 2);
    expect(Math.min(...[...positions.values()].map((position) => position.x))).toBe(0);
  });

  it('draws a row at the height the registration stores for it, and everything beneath follows', () => {
    const view = type.view(source, {});
    const y = (id: string) => view.elements.find((element) => element.id === id)!.y;
    // The example's registration lowers 1.2, and with it the whole second row.
    expect(readLayout(researchRegistration).get('1.2')).toEqual({ x: 360, y: 160 });
    expect([y('1.1'), y('1.2'), y('1.3'), y('1.4')]).toEqual([160, 160, 160, 160]);
    expect(y('1.2.1')).toBe(160 + nodeHeight + verticalGap);
    expect(type.view({ text: research }, {}).elements.find((element) => element.id === '1.2')!.y).toBe(nodeHeight + verticalGap);
  });

  it('never draws a row closer to its parent than the minimum gap', () => {
    const view = type.view({ text: research, registration: 'etalii/agent-behavior-modelling\nlayout:\n  1.1: 0 -500\n' }, {});
    expect(view.elements.find((element) => element.id === '1.1')!.y).toBe(nodeHeight + minimumGap);
  });
});

describe('what is drawn', () => {
  const view = type.view(source, {});

  it('is one element per node with its keyword, family and size, and one line from every parent to each child', () => {
    expect(view.elements).toHaveLength(13);
    expect(view.elements[0]).toMatchObject({ id: '1', type: 'sequence', width: 200, height: 60, label: 'Answer the research question' });
    expect(view.elements[0].data).toMatchObject({ keyword: 'Do in order', family: 'composite', implicit: false, connectable: true, movable: true });
    expect(view.elements.find((element) => element.id === '1.3')!.data).toMatchObject({ keyword: 'Repeat until', family: 'decorator' });
    expect(view.elements.find((element) => element.id === '1.4')!.data).toMatchObject({ keyword: 'Do', family: 'leaf', hasNotes: true, connectable: false });
    expect(view.relations).toHaveLength(12);
    expect(view.relations[0]).toEqual({ id: 'child:1.1', type: 'child', from: '1', to: '1.1', data: { index: 1 } });
  });

  it('keeps a parent line whose either end is in view, with both its ends', () => {
    const root = view.elements[0];
    const culled = type.view(source, { viewport: { x: root.x, y: root.y, width: 10, height: 10 } });
    expect(culled.elements.map((element) => element.id)).toEqual(['1', '1.1', '1.2', '1.3', '1.4']);
    expect(culled.relations).toHaveLength(4);
  });

  it('offers the eleven kinds in the toolbox, each saying what the node does', () => {
    const toolbox = type.toolbox(source);
    expect(toolbox.map((entry) => entry.label)).toEqual(['Do in order', 'Try in order', 'Do together', 'Retry', 'Repeat until', 'Only while', 'Ask approval before', 'Check', 'Do', 'Ask the user', 'Delegate']);
    expect(toolbox[8]).toEqual({ id: 'abm.add.action', label: 'Do', icon: 'mdi-play-outline', description: 'Carries out one piece of work: a tool call, an answer, an edit. Drop it below the node it belongs under.' });
  });
});

describe('editing', () => {
  it('renames by rewriting the one line, keeping the keyword as written', () => {
    expect(change({ kind: 'rename', id: '1.2', text: ' Search\nwidely ' })).toMatchObject({ removed: ['  - **Do together:** Search'], added: ['  - **Do together:** Search widely'] });
  });

  it('changes kind through the property grid, offering only kinds that can hold the children', () => {
    const fields = type.fields(source, ['1.2']);
    expect(fields.map((field) => field.label)).toEqual(['Kind', 'Label', 'Notes', 'Place']);
    expect(fields[0]).toMatchObject({ control: 'choice', value: 'Do together', options: ['Do in order', 'Try in order', 'Do together'] });
    expect(fields[3]).toMatchObject({ value: '1.2', readOnly: "A node's place follows from where it sits in the tree." });
    expect(change({ kind: 'setField', id: '1.2', field: fieldIds.kind, value: 'Try in order' }).added).toEqual(['  - **Try in order:** Search']);
    expect(refusal({ kind: 'setField', id: '1.2', field: fieldIds.kind, value: 'Check' })).toBe('"Check" holds no children, and this node has 3 children.');
    expect(refusal({ kind: 'setField', id: '1.2', field: fieldIds.kind, value: 'Retry' })).toBe('"Retry up to 3 times" holds exactly one child, and this node has 3.');
  });

  it('gives a new Retry three attempts, and shows Attempts only for a Retry', () => {
    const retry = change({ kind: 'setField', id: '1.3', field: fieldIds.kind, value: 'Retry' });
    expect(retry.added).toEqual(['  - **Retry up to 3 times:** Every claim in the draft has a source']);
    const from = { text: retry.text };
    expect(type.fields(from, ['1.3']).map((field) => field.label)).toEqual(['Kind', 'Label', 'Attempts', 'Notes', 'Place']);
    expect(change({ kind: 'setField', id: '1.3', field: fieldIds.attempts, value: '1' }, from).added).toEqual(['  - **Retry up to 1 time:** Every claim in the draft has a source']);
    expect(refusal({ kind: 'setField', id: '1.3', field: fieldIds.attempts, value: '0' }, from)).toBe("'0' is not a number of attempts; a Retry allows at least 1.");
  });

  it('writes notes under the node at its text column, and removes them when emptied', () => {
    expect(change({ kind: 'setField', id: '1.2.1', field: fieldIds.notes, value: 'Prefer reviews.\n\nAfter 2015.' }))
      .toMatchObject({ removed: [], added: ['      Prefer reviews.', '', '      After 2015.'] });
    expect(change({ kind: 'setField', id: '1.4', field: fieldIds.notes, value: '' })).toMatchObject({ removed: ['    Put the answer first, in one paragraph, before the detail.'], added: [] });
  });

  it('moves a node earlier or later among its siblings with everything beneath it', () => {
    const later = applied(edit({ kind: 'action', action: actionIds.moveLater, id: '1.1' })).text;
    expect(model(later).nodes.filter((node) => node.parentId === '1').map((node) => node.label)).toEqual([
      'Search', 'Settle the question', 'Every claim in the draft has a source', 'Answer with the draft, its sources and what remains uncertain',
    ]);
    expect(model(later).nodes.find((node) => node.label === 'Settle the question')!.childIds).toHaveLength(2);
    expect(applied(edit({ kind: 'action', action: actionIds.moveEarlier, id: '1.2' }, { text: later })).text).toBe(research);
    expect(type.actions(source, ['1.1']).find((action) => action.id === actionIds.moveEarlier)).toMatchObject({ enabled: false, disabledReason: 'It is already the first of its siblings.' });
  });

  it('re-parents by a line drawn from the new parent, re-indenting the subtree, and refuses a leaf, itself and its own descendants', () => {
    const moved = applied(edit({ kind: 'connect', from: '1.2', to: '1.3' })).text;
    const lines = moved.split('\n');
    expect(lines.slice(28, 37)).toEqual([
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
    expect(refusal({ kind: 'connect', from: '1.4', to: '1.1' })).toBe('"Do" holds no children.');
    expect(refusal({ kind: 'connect', from: '1.3.1', to: '1.3' })).toBe('A node cannot move beneath itself.');
    expect(refusal({ kind: 'connect', from: '1.3', to: '1.1' })).toBe('"Repeat until" holds exactly one child, and already has it.');
  });

  it('removes a node with everything beneath it as one splice, asking first with their number', () => {
    expect(edit({ kind: 'action', action: actionIds.remove, id: '1.3' })).toEqual({
      kind: 'confirm', title: 'Remove', confirmLabel: 'Remove', danger: true, message: 'Removing this node also removes the 3 nodes beneath it.',
    });
    const confirmed = applied(edit({ kind: 'action', action: actionIds.remove, id: '1.3' }, source, true)).text;
    expect(spliceBetween(research, confirmed)).toMatchObject({ startLine: 32, endLine: 36, text: '' });
    expect(edit({ kind: 'action', action: actionIds.remove, id: '1.2.1' }).kind).toBe('applied');
  });

  it('adds a dropped node under the nearest node above with room, among its children by where it landed, and edits its label at once', () => {
    const view = type.view(source, {});
    const search = view.elements.find((element) => element.id === '1.2')!;
    const first = view.elements.find((element) => element.id === '1.2.1')!;
    const dropped = edit({ kind: 'drop', entry: 'abm.add.check', x: first.x + 90, y: search.y + 100 });
    expect(dropped).toMatchObject({ kind: 'applied', select: '1.2.1', editLabel: true });
    expect(spliceBetween(research, applied(dropped).text)).toEqual({ startLine: 29, endLine: 29, text: '    - **Check:** New question\n' });
    expect(refusal({ kind: 'drop', entry: 'abm.add.check', x: 0, y: -500 })).toMatch(/^Drop the node below the node it belongs under/);
  });

  it('adds the first node to a file without a tree, opening a Behavior section at the end', () => {
    const bare = { text: '# Agent\n\nSome prose.' };
    expect(applied(edit({ kind: 'drop', entry: 'abm.add.sequence', x: 0, y: 0 }, bare)).text).toBe('# Agent\n\nSome prose.\n\n## Behavior\n\n- **Do in order:** New steps');
    const headed = { text: '# Agent\r\n\r\n## Behavior\r\n' };
    expect(applied(edit({ kind: 'drop', entry: 'abm.add.sequence', x: 0, y: 0 }, headed)).text).toBe('# Agent\r\n\r\n## Behavior\r\n\r\n- **Do in order:** New steps\r\n');
  });

  it('adds a child from the menu to a node that takes another, and says where notes are edited', () => {
    expect(type.actions(source, ['1.2']).map((action) => action.label)).toContain('Add child: Retry');
    expect(type.actions(source, ['1.4']).map((action) => action.label)).toEqual(['Rename…', 'Edit notes…', 'Move earlier', 'Move later', 'Remove', 'Arrange diagram']);
    expect(edit({ kind: 'action', action: actionIds.add('retry'), id: '1.2' })).toMatchObject({ kind: 'applied', select: '1.2.4', editLabel: true });
    expect(edit({ kind: 'action', action: actionIds.editNotes, id: '1.4' })).toEqual({ kind: 'showField', field: 'abm.notes' });
    expect(edit({ kind: 'action', action: actionIds.rename, id: '1.4' })).toEqual({ kind: 'editInPlace', id: '1.4', multiline: false });
  });
});

describe('dragging a node', () => {
  const view = type.view(source, {});
  const at = (id: string) => view.elements.find((element) => element.id === id)!;

  it('lowers its whole row and everything beneath it, in the registration alone', () => {
    const outcome = applied(edit({ kind: 'move', id: '1.1', x: at('1.1').x, y: at('1.1').y + 40 }));
    expect(outcome.text).toBe(research);
    const layout = readLayout(outcome.registration as string);
    expect(layout.get('1.1')?.y).toBe(200);
    expect(layout.get('1.4')?.y).toBe(200);
    expect(layout.get('1.3.1.2')?.y).toBe(200 + 2 * (nodeHeight + verticalGap));
    expect(layout.has('1')).toBe(false);
    const after = type.view({ text: research, registration: outcome.registration as string }, {});
    expect(after.elements.find((element) => element.id === '1.2')!.y).toBe(200);
  });

  it('reorders the Markdown when it is dropped past a sibling\'s middle, and the stored positions follow their nodes', () => {
    const outcome = applied(edit({ kind: 'move', id: '1.1', x: at('1.2').x + 10, y: at('1.1').y }));
    expect(model(outcome.text).nodes.filter((node) => node.parentId === '1').map((node) => node.label).slice(0, 2)).toEqual(['Search', 'Settle the question']);
    expect(outcome.select).toBe('1.2');
    // The example stored a height under 1.2, which is now 1.1.
    const layout = readLayout(outcome.registration as string);
    expect(layout.get('1.1')?.y).toBe(160);
    expect(layout.get('1.2.1')?.y).toBe(160 + nodeHeight + verticalGap);
  });

  it('creates the registration with its origin when the first row is dragged, and refuses a drop that changes nothing', () => {
    const bare = { text: research };
    const plain = type.view(bare, {}).elements.find((element) => element.id === '1.1')!;
    const outcome = applied(edit({ kind: 'move', id: '1.1', x: plain.x, y: plain.y + 30 }, bare));
    expect((outcome.registration as string).startsWith('etalii/agent-behavior-modelling\nlayout:\n  1.1: ')).toBe(true);
    expect(refusal({ kind: 'move', id: '1.1', x: at('1.1').x, y: at('1.1').y })).toBe('That node is already there.');
  });

  it('keeps a row at least the minimum gap below its parent', () => {
    const outcome = applied(edit({ kind: 'move', id: '1.1', x: at('1.1').x, y: -1000 }));
    expect(readLayout(outcome.registration as string).get('1.1')?.y).toBe(nodeHeight + minimumGap);
  });
});

describe('Arrange diagram', () => {
  it('forgets every dragged position and leaves the Markdown alone', () => {
    const outcome = applied(edit({ kind: 'action', action: actionIds.arrange }));
    expect(outcome.text).toBe(research);
    expect(outcome.registration).toBe('etalii/agent-behavior-modelling\n');
  });

  it('refuses when there is nothing to forget, or no registration', () => {
    expect(refusal({ kind: 'action', action: actionIds.arrange }, { text: research, registration: 'etalii/agent-behavior-modelling\n' })).toBe('This behavior model is already arranged.');
    expect(refusal({ kind: 'action', action: actionIds.arrange }, { text: research }))
      .toBe('This behavior model was opened without a registration, so it has no dragged positions to forget.');
    expect(type.actions({ text: '# Agent\n' }, [])).toEqual([{ id: 'abm.arrange', label: 'Arrange diagram', icon: 'mdi-sitemap-outline', enabled: false, disabledReason: 'There is nothing to arrange until this behavior model has a node.' }]);
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
    expect(model(text).nodes.map((node) => node.label)).toEqual(['Handle the request']);
    expect(type.findings({ text }).map((finding) => finding.rule)).toEqual(['abm.empty-composite']);
  });
});

describe('the registration', () => {
  it('is read with its layout, and every example\'s is given back byte for byte when its layout is written unchanged', () => {
    for (const path of filesUnder('examples', '.adp')) {
      const text = read(path);
      expect(writeLayout(text, readLayout(text))).toBe(text);
    }
  });

  it('keeps everything above and below the block, writes entries in order, and removes an empty block', () => {
    const text = 'etalii/agent-behavior-modelling\r\nbody: agent.md\r\n\r\nlayout:\r\n  1.2: 360 160\r\n  mangled\r\nnotes: kept\r\n';
    expect([...readLayout(text)]).toEqual([['1.2', { x: 360, y: 160 }]]);
    const written = writeLayout(text, new Map([['2', { x: 1.23456, y: 7 }], ['1.10', { x: 0, y: 0 }]]));
    expect(written).toBe('etalii/agent-behavior-modelling\r\nbody: agent.md\r\n\r\nlayout:\r\n  1.10: 0 0\r\n  2: 1.235 7\r\n  mangled\r\nnotes: kept\r\n');
    expect(writeLayout('gartner/hypecycle-graph\nbody: a.ghg\n', new Map([['x', { x: 1, y: 2 }]]))).toBe('gartner/hypecycle-graph\nbody: a.ghg\nlayout:\n  x: 1 2\n');
    expect(writeLayout('etalii/agent-behavior-modelling\nlayout:\n  1: 0 0\n', new Map())).toBe('etalii/agent-behavior-modelling\n');
  });
});
