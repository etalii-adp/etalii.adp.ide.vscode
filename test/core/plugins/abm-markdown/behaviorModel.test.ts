import { describe, expect, it } from 'vitest';
import { produceTemplate } from '../../../../src/core/fbl';
import type { ModelChange } from '../../../../src/core/fbl';
import { abmMarkdown } from '../../../../src/core/plugins/abm-markdown';
import { filesUnder } from '../../files';
import { fileBytes, node, offsetOf, refusal, textOf, undoAll, utf8 } from '../support';
import { after, binding, edit, labels, lineStart, nodes, open, read } from './support';

// The persistence plugin `net.etalii.adp.etalii.abmMarkdown` (etalii.adp spec 027, T122 and T129,
// research R8 and R12): the behavior tree of a Markdown file read as elements, and every change
// planned as the lines it touches. These are the cases of the hand-coded diagram's
// `test/core/agent-behavior-modelling/behaviorModel.test.ts` that were about its parser and its
// writer, with the same documents, texts and refusals, driven through the library as a host drives
// a plugin. `edit` of ./support holds every planned change to FBL 11.4: only its splices change,
// and its inverse restores the bytes.

const examples = filesUnder('examples/agent-behavior-modelling', '.md').filter((path) => !path.endsWith('readme.md'));
const research = textOf(fileBytes('examples/agent-behavior-modelling/research-assistant/research-assistant.md'));

const types = ['Sequence', 'Fallback', 'Parallel', 'Retry', 'RepeatUntil', 'Guard', 'Approval', 'Check', 'Do', 'AskUser', 'Delegate'];

/** A small tree: a root with a leaf, a composite holding one node, and a leaf. */
const tree = [
  '# Agent', '', '## Behavior', '',
  '- **Do in order:** Root',
  '  - **Do:** one',
  '  - **Try in order:** two',
  '    - **Check:** deep',
  '  - **Do:** three',
  '',
].join('\n');
/** The same tree as an editor on Windows saves it. */
const crlf = tree.replaceAll('\n', '\r\n');
/** The same tree in a file that does not end with a line ending. */
const unterminated = tree.slice(0, -1);

const add = (type: string, label: string, more: Partial<Extract<ModelChange, { kind: 'add' }>> = {}): ModelChange => ({ kind: 'add', type, attributes: { label }, ...more });
const set = (id: string, attributes: Readonly<Record<string, unknown>>): ModelChange => ({ kind: 'set', id, attributes });
const move = (id: string, more: Partial<Extract<ModelChange, { kind: 'move' }>> = {}): ModelChange => ({ kind: 'move', id, ...more });
const retype = (id: string, type: string, attributes: Readonly<Record<string, unknown>> = {}): ModelChange => ({ kind: 'retype', id, type, attributes });
const refused = (text: string, made: ModelChange): string => refusal(open(text), made);

describe('the plugin and its binding', () => {
  it('the binding of the definition names this plugin as its reader', () => {
    expect(abmMarkdown.id).toBe('net.etalii.adp.etalii.abmMarkdown');
    expect(binding().plugin?.plugin).toBe(abmMarkdown.id);
  });

  it('reads a keyword whatever its capitals and spacing, and a Retry only with its count', () => {
    const text = '## Behavior\n- **do  IN order:** a\n  - **Retry up to 1 time:** b\n  - **RETRY UP TO 3 TIMES:** c\n  - **Retry:** d\n';
    expect(nodes(read(text)).map((element) => [element.type, element.attributes])).toEqual([
      ['Sequence', { label: 'a' }],
      ['Retry', { label: 'b', attempts: 1 }],
      ['Retry', { label: 'c', attempts: 3 }],
      ['Do', { label: '**Retry:** d', implicit: true }],
    ]);
  });
});

describe('reading the Markdown', () => {
  it.each(examples)('%s is read, has one root and no finding, and is given back byte for byte', (path) => {
    const bytes = fileBytes(path);
    const reading = read(bytes);
    expect(reading.unreadable).toBe(false);
    expect(reading.findings).toEqual([]);
    expect(reading.elements.length).toBeGreaterThan(3);
    expect(reading.elements.filter((element) => element.parentId === undefined)).toHaveLength(1);

    const body = open(bytes);
    expect(body.isReadOnly).toBe(false);
    expect(body.model.elements).toEqual(reading.elements);
    expect(body.plan({ kind: 'save' })).toEqual({ planned: { splices: [] } });
    expect(abmMarkdown.plan({ files: [{ relativePath: '', bytes }], last: reading, change: { kind: 'save' } })).toEqual({ planned: [] });
    expect(body.bytes).toEqual(bytes);

    // An edit and its undo leave the file as it was, to the byte.
    edit(body, set('1', { label: 'Something else' }));
    undoAll(body);
    expect(body.bytes).toEqual(bytes);
  });

  it('uses all eleven types across the four examples', () => {
    const used = new Set(examples.flatMap((path) => read(fileBytes(path)).elements.map((element) => element.type)));
    expect([...used].sort()).toEqual([...types].sort());
  });

  it('gives each node its place in the tree as its id, its parent and its notes', () => {
    const reading = read(research);
    expect(reading.elements.map((element) => element.id)).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.2', '1.2.1', '1.2.2', '1.2.3', '1.3', '1.3.1', '1.3.1.1', '1.3.1.2', '1.4']);
    expect(labels(reading, '1')).toEqual(['Settle the question', 'Search', 'Every claim in the draft has a source', 'Answer with the draft, its sources and what remains uncertain']);
    // The root: the whole list, from its own line to the end of the last line beneath it.
    expect(node(reading, '1')).toEqual({
      id: '1', idIsStored: false, type: 'Sequence', rule: 'node', isRelation: false,
      attributes: { label: 'Answer the research question' },
      ownSpan: { start: lineStart(research, 24), end: utf8(research).length }, line: 25,
    });
    expect(node(reading, '1.4')).toEqual({
      id: '1.4', idIsStored: false, type: 'Do', rule: 'node', isRelation: false,
      attributes: { label: 'Answer with the draft, its sources and what remains uncertain', notes: 'Put the answer first, in one paragraph, before the detail.' },
      parentId: '1', parentSlot: 'children',
      ownSpan: { start: lineStart(research, 36), end: lineStart(research, 38) }, line: 37,
    });
    expect(node(reading, '1.3.1')).toMatchObject({ type: 'Sequence', parentId: '1.3', parentSlot: 'children', line: 34, ownSpan: { start: lineStart(research, 33), end: lineStart(research, 36) } });
  });

  it('reads only the first list under the first Behavior heading, never one quoted in a code block', () => {
    const text = '# Agent\n\n```\n## Behavior\n- **Do:** quoted\n```\n\n### behaviour\n\nSome prose.\n\n* **Check:** real\n\n## Behavior\n\n- **Do:** second\n';
    expect(nodes(read(text)).map((element) => [element.type, element.attributes.label, element.line])).toEqual([['Check', 'real', 12]]);
    // A new item is written with the marker the list already uses.
    expect(after(text, add('Do', 'next'))).toBe(text.replace('* **Check:** real\n', '* **Check:** real\n* **Do:** next\n'));
  });

  it('reads an item without a keyword as a Do and marks it implicit, without reporting it', () => {
    const text = '## Behavior\n\n- **Do in order:** Start\n\t- just do it\n  - **Retry:** no number\n';
    const reading = read(text);
    expect(reading.elements.map((element) => [element.id, element.type, element.attributes.implicit, element.attributes.label])).toEqual([
      ['1', 'Sequence', undefined, 'Start'], ['1.1', 'Do', true, 'just do it'], ['1.2', 'Do', true, '**Retry:** no number'],
    ]);
    // `abm.no-keyword` is a constraint of the definition now, which the interpreter evaluates.
    expect(reading.findings).toEqual([]);
  });

  it('reads the lines under an item that are no items as its notes, blank lines between them included', () => {
    const text = '## Behavior\n- **Retry up to 0 times:** a\n  first\n\n  second\n  - **Do:** b\n\n---\n\n- **Do:** after the break\n';
    const reading = read(text);
    // The thematic break ends the list: it is no item, and what follows it is not read.
    expect(reading.elements.map((element) => element.id)).toEqual(['1', '1.1']);
    expect(node(reading, '1')).toMatchObject({ type: 'Retry', attributes: { label: 'a', notes: 'first\n\nsecond', attempts: 0 }, line: 2, ownSpan: { start: lineStart(text, 1), end: lineStart(text, 6) } });
    expect(node(reading, '1.1').attributes).toEqual({ label: 'b' });
  });

  it('counts a span in UTF-8 bytes, after a byte-order mark and text outside ASCII', () => {
    const text = '﻿# Agént ✓\n\n## Behavior\n\n- **Do in order:** Zoë\n  - **Do:** één\n';
    const reading = read(text);
    expect(node(reading, '1')).toMatchObject({ attributes: { label: 'Zoë' }, line: 5, ownSpan: { start: offsetOf(text, '- **Do in order:**'), end: utf8(text).length } });
    expect(node(reading, '1.1').ownSpan.start).toBeGreaterThan(text.indexOf('  - **Do:** één'));
  });
});

describe('the findings', () => {
  const noBehavior = (message: string, line: number) => [{ code: 'abm.no-behavior', severity: 'info', message, location: { file: '', line, column: 1, length: 0 } }];

  it('report a file without a Behavior heading on its first line, and a section without a list on its heading', () => {
    expect(read('# Agent\n')).toEqual({
      elements: [], unreadable: false,
      findings: noBehavior('This file has no Behavior heading, so there is no behavior tree to draw. Add a node to start one.', 1),
    });
    expect(read('')).toMatchObject({ elements: [], unreadable: false, findings: [{ code: 'abm.no-behavior', location: { line: 1 } }] });
    expect(read('# Agent\n\n## Behavior\n\nNothing yet.\n')).toEqual({
      elements: [], unreadable: false,
      findings: noBehavior('The Behavior section holds no list yet. Add a node to start the tree.', 3),
    });
  });

  it('leave every rule about the tree to the constraints of the definition', () => {
    for (const text of [
      '## Behavior\n- **Do:** a\n  - **Do:** b\n',
      '## Behavior\n- **Only while:** a\n',
      '## Behavior\n- **Only while:** a\n  - **Do:** b\n  - **Do:** c\n',
      '## Behavior\n- **Retry up to 0 times:** a\n  - **Do:** b\n',
      '## Behavior\n- **Do together:** a\n',
      '## Behavior\n- **Do:** a\n- **Do:** b\n',
    ]) expect(read(text).findings).toEqual([]);
  });
});

describe('set', () => {
  it('renames by rewriting the one line, keeping the keyword as written', () => {
    const body = open(research);
    const renamed = edit(body, set('1.2', { label: ' Search\nwidely ' }));
    expect(renamed).toMatchObject({ removed: ['  - **Do together:** Search'], added: ['  - **Do together:** Search widely'] });
    expect(renamed.splices).toEqual([{ operation: 're-emit-line', start: lineStart(research, 28), end: lineStart(research, 29) - 1, text: '  - **Do together:** Search widely' }]);
    expect(node(body, '1.2').attributes.label).toBe('Search widely');
    expect(edit(open('## Behavior\n- **do TOGETHER :** a\n- plain\n'), set('1', { label: 'b' })).added).toEqual(['- **do TOGETHER:** b']);
    expect(edit(open('## Behavior\n- **Do:** a\n*   plain\n'), set('2', { label: 'still plain' })).added).toEqual(['*   still plain']);
    // A label that is the one it has plans nothing.
    expect(open(research).plan(set('1.2', { label: 'Search' }))).toEqual({ planned: { splices: [] } });
  });

  it('writes notes under the node at its text column, and removes them when emptied', () => {
    const written = edit(open(research), set('1.2.1', { notes: 'Prefer reviews.\n\nAfter 2015.' }));
    expect(written).toMatchObject({ removed: [], added: ['      Prefer reviews.', '', '      After 2015.'] });
    expect(written.splices).toEqual([{ operation: 'insert-key', start: lineStart(research, 30), end: lineStart(research, 30), text: '      Prefer reviews.\n\n      After 2015.\n' }]);
    expect(node(open(written.text), '1.2.1').attributes.notes).toBe('Prefer reviews.\n\nAfter 2015.');

    const emptied = edit(open(research), set('1.4', { notes: '' }));
    expect(emptied).toMatchObject({ removed: ['    Put the answer first, in one paragraph, before the detail.'], added: [] });
    expect(emptied.splices.map((splice) => splice.operation)).toEqual(['remove-key']);
    expect(edit(open(research), set('1.4', { notes: null })).text).toBe(emptied.text);

    const replaced = edit(open(written.text), set('1.2.1', { notes: 'Since 2015 only.' }));
    expect(replaced).toMatchObject({ removed: ['      Prefer reviews.', '', '      After 2015.'], added: ['      Since 2015 only.'] });
    expect(replaced.splices.map((splice) => splice.operation)).toEqual(['replace-value']);
    // Notes that are the ones it has, and no notes for a node without, plan nothing.
    expect(open(research).plan(set('1.4', { notes: 'Put the answer first, in one paragraph, before the detail.' }))).toEqual({ planned: { splices: [] } });
    expect(open(research).plan(set('1.2', { notes: '' }))).toEqual({ planned: { splices: [] } });
  });

  it('rewrites the count of a Retry, and refuses a count below one or a count for another kind', () => {
    const text = '## Behavior\n- **Retry up to 3 times:** Fetch the page\n  - **Do:** fetch\n';
    const body = open(text);
    expect(edit(body, set('1', { attempts: 1 }))).toMatchObject({ removed: ['- **Retry up to 3 times:** Fetch the page'], added: ['- **Retry up to 1 time:** Fetch the page'] });
    expect(node(body, '1').attributes).toEqual({ label: 'Fetch the page', attempts: 1 });
    // An integer of a model change may be a bigint.
    expect(edit(body, set('1', { attempts: 12n })).added).toEqual(['- **Retry up to 12 times:** Fetch the page']);
    expect(refused(text, set('1', { attempts: 0 }))).toBe('A Retry allows at least one attempt.');
    expect(refused(text, set('1', { attempts: 1.5 }))).toBe('A Retry allows at least one attempt.');
    expect(refused(text, set('1.1', { attempts: 2 }))).toBe('"Do" has no number of attempts. Only a Retry has one.');
  });

  it('applies several attributes in one plan, each as its own lines', () => {
    const text = '## Behavior\n- **Retry up to 3 times:** Fetch the page\n  - **Do:** fetch\n';
    const body = open(text);
    const edited = edit(body, set('1', { label: 'Fetch it', attempts: 2, notes: 'Wait a second between attempts.' }));
    expect(edited.splices).toEqual([
      { operation: 're-emit-line', start: lineStart(text, 1), end: lineStart(text, 2) - 1, text: '- **Retry up to 2 times:** Fetch it' },
      { operation: 'insert-key', start: lineStart(text, 2), end: lineStart(text, 2), text: '  Wait a second between attempts.\n' },
    ]);
    expect(node(body, '1').attributes).toEqual({ label: 'Fetch it', attempts: 2, notes: 'Wait a second between attempts.' });
    undoAll(body);
    expect(textOf(body.bytes)).toBe(text);
  });

  it('refuses an attribute the Markdown does not hold, and a node that is gone', () => {
    expect(refused(tree, set('1.1', { implicit: true }))).toBe('Whether a node has a keyword follows from how its line is written. Change its kind to give it one.');
    expect(refused(tree, set('1.1', { label: 'x', colour: 'red' }))).toBe('A node of a behavior model has no `colour` to change.');
    expect(refused(tree, set('1.9', { label: 'x' }))).toBe('That node is no longer in this behavior model.');
  });
});

describe('retype', () => {
  it('rewrites only the keyword, and refuses a kind that cannot hold the children the node has', () => {
    expect(edit(open(research), retype('1.2', 'Fallback'))).toMatchObject({ removed: ['  - **Do together:** Search'], added: ['  - **Try in order:** Search'] });
    expect(refused(research, retype('1.2', 'Check'))).toBe('"Check" holds no children, and this node has 3 children.');
    expect(refused(research, retype('1.2', 'Retry'))).toBe('"Retry up to 3 times" holds exactly one child, and this node has 3.');
    expect(refused(research, retype('1.3', 'Do'))).toBe('"Do" holds no children, and this node has 1 child.');
    expect(refused(research, retype('1.2', 'Loop'))).toBe('A behavior model has no `Loop` node.');
    expect(refused(research, retype('7', 'Do'))).toBe('That node is no longer in this behavior model.');
  });

  it('gives a new Retry three attempts or the attempts it is given, and keeps the label and the notes on the way back', () => {
    const body = open(research);
    const retry = edit(body, retype('1.3', 'Retry'));
    expect(retry.added).toEqual(['  - **Retry up to 3 times:** Every claim in the draft has a source']);
    expect(retry.splices.map((splice) => splice.operation)).toEqual(['re-emit-line']);
    expect(node(body, '1.3')).toMatchObject({ type: 'Retry', attributes: { label: 'Every claim in the draft has a source', attempts: 3 } });
    expect(edit(body, set('1.3', { attempts: 1 })).added).toEqual(['  - **Retry up to 1 time:** Every claim in the draft has a source']);
    expect(refusal(body, set('1.3', { attempts: 0 }))).toBe('A Retry allows at least one attempt.');
    // A Retry made a Retry again keeps a count of three or more, and takes at least three.
    expect(edit(body, retype('1.3', 'Retry')).added).toEqual(['  - **Retry up to 3 times:** Every claim in the draft has a source']);
    expect(edit(body, retype('1.3', 'Retry', { attempts: 5 })).added).toEqual(['  - **Retry up to 5 times:** Every claim in the draft has a source']);
    expect(open(textOf(body.bytes)).plan(retype('1.3', 'Retry'))).toEqual({ planned: { splices: [] } });
    expect(refusal(body, retype('1.3', 'Retry', { attempts: 0 }))).toBe('A Retry allows at least one attempt.');
    expect(edit(body, retype('1.3', 'RepeatUntil')).text).toBe(research);
    undoAll(body);
    expect(textOf(body.bytes)).toBe(research);

    const noted = edit(open(research), retype('1.4', 'AskUser'));
    expect(noted).toMatchObject({ removed: ['  - **Do:** Answer with the draft, its sources and what remains uncertain'], added: ['  - **Ask the user:** Answer with the draft, its sources and what remains uncertain'] });
    expect(node(open(noted.text), '1.4').attributes.notes).toBe('Put the answer first, in one paragraph, before the detail.');
  });

  it('gives an item without a keyword its keyword when it is retyped to the Do it is read as', () => {
    const text = '## Behavior\n- **Do in order:** Start\n  - just do it\n';
    const body = open(text);
    expect(node(body, '1.1').attributes).toEqual({ label: 'just do it', implicit: true });
    expect(edit(body, retype('1.1', 'Do'))).toMatchObject({ removed: ['  - just do it'], added: ['  - **Do:** just do it'] });
    expect(node(body, '1.1').attributes).toEqual({ label: 'just do it' });
    // A node written in the canonical form already has nothing to rewrite.
    expect(body.plan(retype('1.1', 'Do'))).toEqual({ planned: { splices: [] } });
  });
});

describe('remove', () => {
  it('removes a node with its notes and everything beneath it as one splice', () => {
    const body = open(research);
    expect(edit(body, { kind: 'remove', id: '1.3' }).splices).toEqual([{ operation: 'remove-entry', start: lineStart(research, 32), end: lineStart(research, 36), text: '' }]);
    expect(nodes(body).map((element) => element.id)).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.2', '1.2.1', '1.2.2', '1.2.3', '1.3']);
    expect(edit(body, { kind: 'remove', id: '1.3' }).removed).toEqual([
      '  - **Do:** Answer with the draft, its sources and what remains uncertain', '    Put the answer first, in one paragraph, before the detail.',
    ]);
    expect(edit(body, { kind: 'remove', id: '1.2.1' }).removed).toEqual(['    - **Delegate:** Search the academic literature']);
    undoAll(body);
    expect(textOf(body.bytes)).toBe(research);
    expect(refused(research, { kind: 'remove', id: '2' })).toBe('That node is no longer in this behavior model.');
  });

  it('leaves a Behavior section without a list when the root goes', () => {
    const body = open(tree);
    expect(edit(body, { kind: 'remove', id: '1' }).text).toBe('# Agent\n\n## Behavior\n\n');
    expect(body.model.findings.map((finding) => [finding.code, finding.location.line])).toEqual([['abm.no-behavior', 3]]);
  });
});

describe('add', () => {
  it('adds a node among its parent\'s children at an index, as one inserted line', () => {
    const body = open(research);
    expect(edit(body, add('Check', 'New question', { parent: '1.2', position: { index: 0 }, id: 'temporary' })).splices)
      .toEqual([{ operation: 'insert-entry', start: lineStart(research, 29), end: lineStart(research, 29), text: '    - **Check:** New question\n' }]);
    expect(node(body, '1.2.1')).toMatchObject({ type: 'Check', attributes: { label: 'New question' }, parentId: '1.2' });
    expect(body.undo()).toHaveProperty('done');
    expect(textOf(body.bytes)).toBe(research);
  });

  it('adds after the last child without a position, and a new Retry gets three attempts', () => {
    const body = open(research);
    expect(edit(body, add('Retry', '', { parent: '1.2' }))).toMatchObject({ removed: [], added: ['    - **Retry up to 3 times:**'] });
    expect(node(body, '1.2.4')).toMatchObject({ type: 'Retry', attributes: { label: '', attempts: 3 }, line: 33 });
    expect(edit(open(research), { kind: 'add', type: 'Retry', attributes: { label: 'Fetch', attempts: 2 }, parent: '1.2' }).added).toEqual(['    - **Retry up to 2 times:** Fetch']);
    expect(edit(open(research), { kind: 'add', type: 'Retry', attributes: { label: 'Fetch', attempts: 0 }, parent: '1.2' }).added).toEqual(['    - **Retry up to 3 times:** Fetch']);
    expect(edit(open(research), add('Do', 'Write it down', { parent: '1.3.1' })).added).toEqual(['      - **Do:** Write it down']);
    // The first child of a node takes the column the parent's text starts at, and its marker.
    expect(edit(open('## Behavior\n*   **Do in order:** a\n'), add('Do', 'b', { parent: '1' })).added).toEqual(['    * **Do:** b']);
  });

  it('adds beside a node named by `after` or `before`, under a parent or among the roots', () => {
    expect(labels(open(after(tree, add('Do', 'new', { parent: '1', position: { after: '1.1' } }))), '1')).toEqual(['one', 'new', 'two', 'three']);
    expect(labels(open(after(tree, add('Do', 'new', { parent: '1', position: { after: '1.2' } }))), '1')).toEqual(['one', 'two', 'new', 'three']);
    expect(labels(open(after(tree, add('Do', 'new', { parent: '1', position: { before: '1.1' } }))), '1')).toEqual(['new', 'one', 'two', 'three']);
    expect(labels(open(after(tree, add('Do', 'new', { parent: '1', position: { index: 2 } }))), '1')).toEqual(['one', 'two', 'new', 'three']);
    expect(labels(open(after(tree, add('Do', 'new', { parent: '1', position: { index: 9 } }))), '1')).toEqual(['one', 'two', 'three', 'new']);
    expect(after(tree, add('Do', 'new', { position: { before: '1' } }))).toBe(tree.replace('- **Do in order:** Root\n', '- **Do:** new\n- **Do in order:** Root\n'));
    expect(after(tree, add('Do', 'new'))).toBe(`${tree}- **Do:** new\n`);
    expect(refused(tree, add('Do', 'new', { parent: '1', position: { after: '1.2.1' } }))).toBe('The node to place it beside is not under that node.');
  });

  it('writes the notes a new node is given under it', () => {
    const edited = edit(open(tree), { kind: 'add', type: 'Do', attributes: { label: 'new', notes: 'first\n\nsecond' }, parent: '1.2' });
    expect(edited.splices).toEqual([{ operation: 'insert-entry', start: lineStart(tree, 8), end: lineStart(tree, 8), text: '    - **Do:** new\n      first\n\n      second\n' }]);
    expect(node(open(edited.text), '1.2.2').attributes).toEqual({ label: 'new', notes: 'first\n\nsecond' });
  });

  it('adds the first node to a file without a tree, opening a Behavior section at the end', () => {
    expect(after('# Agent\n\nSome prose.', add('Sequence', 'New steps'))).toBe('# Agent\n\nSome prose.\n\n## Behavior\n\n- **Do in order:** New steps');
    expect(after('# Agent\r\n\r\n## Behavior\r\n', add('Sequence', 'New steps'))).toBe('# Agent\r\n\r\n## Behavior\r\n\r\n- **Do in order:** New steps\r\n');
    expect(after('# Agent\n\n## Behavior\n\nNothing yet.\n', add('Do', 'first'))).toBe('# Agent\n\n## Behavior\n\n- **Do:** first\n\nNothing yet.\n');
    expect(after('', add('Do', 'first'))).toBe('## Behavior\r\n\r\n- **Do:** first\r\n');
    const body = open('# Agent\n\nSome prose.');
    edit(body, add('Sequence', 'New steps'));
    expect(body.model.findings).toEqual([]);
    undoAll(body);
    expect(textOf(body.bytes)).toBe('# Agent\n\nSome prose.');
  });

  it('refuses a parent that takes no child, a kind the notation has not, and a parent that is gone', () => {
    expect(refused(research, add('Do', 'x', { parent: '1.4' }))).toBe('"Do" holds no children. Add the node under a Do in order, Try in order or Do together.');
    expect(refused(research, add('Do', 'x', { parent: '1.3' }))).toBe('"Repeat until" holds exactly one child, and already has it.');
    expect(refused(research, add('action', 'x', { parent: '1' }))).toBe('A behavior model has no `action` node.');
    expect(refused(research, add('Do', 'x', { parent: '1.9' }))).toBe('The node it was added under is no longer in this behavior model.');
  });
});

describe('move', () => {
  it('moves a node earlier or later among its siblings with everything beneath it', () => {
    const body = open(research);
    edit(body, move('1.1', { parent: '1', position: { index: 1 } }));
    expect(labels(body, '1')).toEqual(['Search', 'Settle the question', 'Every claim in the draft has a source', 'Answer with the draft, its sources and what remains uncertain']);
    expect(labels(body, '1.2')).toHaveLength(2);
    expect(edit(body, move('1.2', { parent: '1', position: { index: 0 } })).text).toBe(research);
    undoAll(body);
    expect(textOf(body.bytes)).toBe(research);
  });

  it('counts an index among the new parent\'s children once the node is taken out', () => {
    const order = (made: ModelChange): unknown[] => labels(open(after(tree, made)), '1');
    expect(order(move('1.2', { parent: '1', position: { index: 0 } }))).toEqual(['two', 'one', 'three']);
    expect(order(move('1.2', { parent: '1', position: { index: 2 } }))).toEqual(['one', 'three', 'two']);
    expect(order(move('1.1', { parent: '1', position: { index: 1 } }))).toEqual(['two', 'one', 'three']);
    expect(order(move('1.1', { parent: '1', position: { index: 2 } }))).toEqual(['two', 'three', 'one']);
    expect(order(move('1.3', { parent: '1', position: { index: 1 } }))).toEqual(['one', 'three', 'two']);
    expect(order(move('1.1', { parent: '1' }))).toEqual(['two', 'three', 'one']);
    // Its own index, counted that way, is where it is.
    for (const [id, index] of [['1.1', 0], ['1.2', 1], ['1.3', 2], ['1.3', 7]] as const) {
      expect(refused(tree, move(id, { parent: '1', position: { index } }))).toBe('That node is already there.');
    }
    expect(refused(tree, move('1.3', { parent: '1' }))).toBe('That node is already there.');
    expect(refused(tree, move('1'))).toBe('That node is already there.');
    // Across parents the index needs no conversion.
    expect(labels(open(after(tree, move('1.3', { parent: '1.2', position: { index: 0 } }))), '1.2')).toEqual(['three', 'deep']);
    expect(labels(open(after(tree, move('1.3', { parent: '1.2', position: { index: 1 } }))), '1.2')).toEqual(['deep', 'three']);
  });

  it('moves beside a sibling named by `after` or `before`', () => {
    const order = (made: ModelChange): unknown[] => labels(open(after(tree, made)), '1');
    expect(order(move('1.3', { parent: '1', position: { before: '1.1' } }))).toEqual(['three', 'one', 'two']);
    expect(order(move('1.1', { parent: '1', position: { after: '1.3' } }))).toEqual(['two', 'three', 'one']);
    expect(order(move('1.1', { parent: '1', position: { after: '1.2' } }))).toEqual(['two', 'one', 'three']);
    expect(order(move('1.2.1', { parent: '1', position: { before: '1.2' } }))).toEqual(['one', 'deep', 'two', 'three']);
    expect(refused(tree, move('1.1', { parent: '1', position: { before: '1.2' } }))).toBe('That node is already there.');
    expect(refused(tree, move('1.2', { parent: '1', position: { after: '1.1' } }))).toBe('That node is already there.');
    expect(refused(tree, move('1.2', { parent: '1', position: { after: '1.2' } }))).toBe('That node is already there.');
    expect(refused(tree, move('1.1', { parent: '1', position: { after: '1.2.1' } }))).toBe('The node to place it beside is not under that node.');
  });

  it('is two splices, the lines taken out and the lines put in, and the lines between them are in neither', () => {
    const body = open(tree);
    const moved = edit(body, move('1.1', { parent: '1.2', position: { index: 0 } }));
    expect(moved.splices).toEqual([
      { operation: 'remove-entry', start: lineStart(tree, 5), end: lineStart(tree, 6), text: '' },
      { operation: 'insert-entry', start: lineStart(tree, 7), end: lineStart(tree, 7), text: '    - **Do:** one\n' },
    ]);
    expect(labels(body, '1.1')).toEqual(['one', 'deep']);

    const later = edit(open(research), move('1.1', { parent: '1', position: { index: 1 } }));
    expect(later.splices).toEqual([
      { operation: 'remove-entry', start: lineStart(research, 25), end: lineStart(research, 28), text: '' },
      { operation: 'insert-entry', start: lineStart(research, 32), end: lineStart(research, 32), text: research.slice(lineStart(research, 25), lineStart(research, 28)) },
    ]);
  });

  it('re-parents a node to the end of the new parent\'s children, re-indenting its subtree, and refuses a leaf, itself and its own descendants', () => {
    const moved = edit(open(research), move('1.3', { parent: '1.2' }));
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
    // It lands where it was taken out, so its lines are rewritten in place as one splice.
    expect(moved.splices).toHaveLength(1);
    expect(moved.splices[0]).toMatchObject({ operation: 're-emit-line', start: lineStart(research, 32), end: lineStart(research, 36) });
    expect(refused(research, move('1.1', { parent: '1.4' }))).toBe('"Do" holds no children.');
    expect(refused(research, move('1.3', { parent: '1.3.1' }))).toBe('A node cannot move beneath itself.');
    expect(refused(research, move('1.3', { parent: '1.3' }))).toBe('A node cannot move beneath itself.');
    expect(refused(research, move('1.1', { parent: '1.3' }))).toBe('"Repeat until" holds exactly one child, and already has it.');
    expect(refused(research, move('1.3.1', { parent: '1.3' }))).toBe('That node is already there.');
    expect(refused(research, move('1.1', { parent: '3' }))).toBe('The node it was moved under is no longer in this behavior model.');
    expect(refused(research, move('3', { parent: '1' }))).toBe('That node is no longer in this behavior model.');
  });

  it('moves a node out to the roots without a parent, outdenting its subtree and its notes', () => {
    const text = tree.replace('    - **Check:** deep\n', '    - **Check:** deep\n      Look twice.\n');
    const body = open(text);
    expect(edit(body, move('1.2')).text).toBe([
      '# Agent', '', '## Behavior', '',
      '- **Do in order:** Root',
      '  - **Do:** one',
      '  - **Do:** three',
      '- **Try in order:** two',
      '  - **Check:** deep',
      '    Look twice.',
      '',
    ].join('\n'));
    expect(node(body, '2.1')).toMatchObject({ type: 'Check', attributes: { label: 'deep', notes: 'Look twice.' }, parentId: '2' });
    expect(edit(body, move('2', { position: { index: 0 } })).added).toEqual(['- **Try in order:** two', '  - **Check:** deep', '    Look twice.']);
    undoAll(body);
    expect(textOf(body.bytes)).toBe(text);
  });
});

describe('line endings', () => {
  it('gives a new line the ending most lines of the file have, and CRLF on a tie', () => {
    expect(edit(open(crlf), add('Do', 'new', { parent: '1.2' })).splices).toEqual([{ operation: 'insert-entry', start: lineStart(crlf, 8), end: lineStart(crlf, 8), text: '    - **Do:** new\r\n' }]);
    expect(edit(open(tree), add('Do', 'new', { parent: '1.2' })).splices[0].text).toBe('    - **Do:** new\n');
    expect(after('## Behavior\r\n- **Do in order:** a\n', add('Do', 'b', { parent: '1' }))).toBe('## Behavior\r\n- **Do in order:** a\n  - **Do:** b\r\n');
    expect(after('# A\n## Behavior\r\n- **Do in order:** a\n', add('Do', 'b', { parent: '1' }))).toBe('# A\n## Behavior\r\n- **Do in order:** a\n  - **Do:** b\n');
  });

  it('keeps every line of a CRLF file as it ends through a rename, notes, a move and a removal', () => {
    const body = open(crlf);
    expect(edit(body, set('1.2', { label: 'second', notes: 'a\nb' })).text).toBe(crlf.replace('two\r\n', 'second\r\n    a\r\n    b\r\n'));
    edit(body, move('1.3', { parent: '1', position: { index: 0 } }));
    edit(body, { kind: 'remove', id: '1.2' });
    expect(textOf(body.bytes)).toBe('# Agent\r\n\r\n## Behavior\r\n\r\n- **Do in order:** Root\r\n  - **Do:** three\r\n  - **Try in order:** second\r\n    a\r\n    b\r\n    - **Check:** deep\r\n');
    undoAll(body);
    expect(textOf(body.bytes)).toBe(crlf);
  });

  it('appends to a last line without a line ending by ending that line, and leaves the new last line without one', () => {
    const body = open(unterminated);
    expect(edit(body, add('Do', 'four', { parent: '1' })).splices).toEqual([{ operation: 'insert-entry', start: utf8(unterminated).length, end: utf8(unterminated).length, text: '\n  - **Do:** four' }]);
    expect(edit(body, set('1.4', { label: 'last' })).text).toBe(`${unterminated}\n  - **Do:** last`);
    expect(edit(body, set('1.4', { notes: 'a note' })).text).toBe(`${unterminated}\n  - **Do:** last\n    a note`);
    undoAll(body);
    expect(textOf(body.bytes)).toBe(unterminated);
  });

  it('passes the way the file ends to the line that becomes last when the last lines go', () => {
    expect(edit(open(unterminated), { kind: 'remove', id: '1.3' })).toMatchObject({ removed: ['  - **Do:** three'], text: unterminated.replace('\n  - **Do:** three', '') });
    expect(after(tree, { kind: 'remove', id: '1.3' })).toBe(tree.replace('  - **Do:** three\n', ''));
    // A move of the last lines, and a move to the end, keep the file ending as it did.
    expect(after(unterminated, move('1.3', { parent: '1', position: { index: 0 } }))).toBe(unterminated.replace('\n  - **Do:** three', '').replace('  - **Do:** one', '  - **Do:** three\n  - **Do:** one'));
    expect(after(unterminated, move('1.1', { parent: '1' }))).toBe(`${unterminated.replace('  - **Do:** one\n', '')}\n  - **Do:** one`);
    expect(after(unterminated, move('1.3', { parent: '1.2' }))).toBe(unterminated.replace('  - **Do:** three', '    - **Do:** three'));
  });
});

describe('offsets', () => {
  it('are UTF-8 byte offsets of the body as given, whatever is written before the edited line', () => {
    const text = '﻿# Agént ✓\n\n## Behavior\n\n- **Do in order:** Zoë\n  - **Do:** één\n  - **Do:** twee\n';
    const body = open(text);
    const start = offsetOf(text, '  - **Do:** twee');
    expect(start).toBeGreaterThan(text.indexOf('  - **Do:** twee'));
    expect(edit(body, set('1.2', { label: 'drieënhalf' })).splices).toEqual([{ operation: 're-emit-line', start, end: start + '  - **Do:** twee'.length, text: '  - **Do:** drieënhalf' }]);
    expect(edit(body, move('1.2', { parent: '1', position: { index: 0 } })).text).toBe('﻿# Agént ✓\n\n## Behavior\n\n- **Do in order:** Zoë\n  - **Do:** drieënhalf\n  - **Do:** één\n');
    expect(edit(body, add('Check', 'ça va ?', { parent: '1' })).splices[0].start).toBe(body.bytes.length - utf8('  - **Check:** ça va ?\n').length);
    undoAll(body);
    expect(textOf(body.bytes)).toBe(text);
  });
});

describe('changes the Markdown does not hold', () => {
  it('are refused with one sentence', () => {
    const sentence = 'The Markdown of a behavior model cannot hold that change.';
    expect(refused(research, { kind: 'place', id: '1', x: 10, y: 20 })).toBe(sentence);
    expect(refused(research, { kind: 'identify', key: 'a', id: 'b' })).toBe(sentence);
    expect(refused(research, { kind: 'storeId', id: '1', newId: 'x' })).toBe(sentence);
  });

  it('a series of edits is undone to the bytes the file had', () => {
    const body = open(research);
    edit(body, add('Guard', 'The user is still here', { parent: '1', position: { after: '1.1' } }));
    edit(body, add('Do', 'Keep them posted', { parent: '1.2', attributes: { label: 'Keep them posted', notes: 'Once a minute.' } }));
    edit(body, move('1.3', { parent: '1', position: { index: 0 } }));
    edit(body, retype('1.4', 'Retry', { attempts: 2 }));
    edit(body, set('1.5', { label: 'Answer', notes: '' }));
    edit(body, { kind: 'remove', id: '1.2' });
    expect(nodes(body).filter((element) => element.parentId === '1').map((element) => element.type)).toEqual(['Parallel', 'Guard', 'Retry', 'Do']);
    undoAll(body);
    expect(textOf(body.bytes)).toBe(research);
  });
});

describe('a new behavior model', () => {
  const template = (name: string, placeholders: Record<string, string> = {}): string => textOf(abmMarkdown.template({ name, placeholders: new Map(Object.entries(placeholders)) }));

  it('explains itself to the agent and starts the tree', () => {
    const text = template('Support agent.md');
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('# Support agent');
    expect(lines[2]).toBe('Describe the agent here: who it works for, and what it is for.');
    expect(lines).toContain('## How to follow the behavior');
    expect(lines).toContain('- **Retry up to N times** runs its child again when it fails, at most N times in all.');
    expect(lines.filter((line) => line.startsWith('- **') && !line.includes(':**')).map((line) => /^- \*\*(.*?)\*\*/.exec(line)![1])).toEqual([
      'Do in order', 'Try in order', 'Do together', 'Retry up to N times', 'Repeat until', 'Only while', 'Ask approval before', 'Check', 'Do', 'Ask the user', 'Delegate',
    ]);
    expect(lines.slice(-4)).toEqual(['## Behavior', '', '- **Do in order:** Handle the request', '']);
    // Every line ends with CRLF, the last one too.
    expect(text.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    expect(text.endsWith('\r\n')).toBe(true);
    // The legend is prose to the diagram: only the tree under Behavior is read.
    const reading = read(text);
    expect(reading.elements.map((element) => [element.id, element.type, element.attributes.label])).toEqual([['1', 'Sequence', 'Handle the request']]);
    expect(reading.findings).toEqual([]);
  });

  it('is titled with the file\'s base name, on one line, and Agent when there is none', () => {
    expect(template('ignored.md', { base: 'Billing agent', name: 'ignored.md' }).split('\r\n')[0]).toBe('# Billing agent');
    expect(template('Notes.MD').split('\r\n')[0]).toBe('# Notes');
    expect(template(' two\nlines .md').split('\r\n')[0]).toBe('# two lines');
    expect(template('.md').split('\r\n')[0]).toBe('# Agent');
    expect(template('x.md', { base: '' }).split('\r\n')[0]).toBe('# Agent');
  });

  it('is what the library writes for the binding, which has no template text of its own', () => {
    const bytes = produceTemplate(binding(), undefined, 'folder/Support agent.md', () => '', abmMarkdown);
    expect(bytes).toEqual(abmMarkdown.template({ name: 'Support agent.md', placeholders: new Map() }));
  });
});
