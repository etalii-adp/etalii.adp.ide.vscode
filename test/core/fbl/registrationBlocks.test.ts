import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDocument, resolveReference } from '../../../src/core/fbl/documents/documentLoader';
import { nodeFiles } from '../../../src/core/fbl/files/nodeFiles';
import { findingCodes } from '../../../src/core/fbl/finding';
import { OpenRegistration } from '../../../src/core/fbl/registration/openRegistration';
import { createRegistration } from '../../../src/core/fbl/registration/registrationCreation';
import { bindingOf } from './support/bindings';
import { conformance, textOf, utf8 } from './support/repository';

// The blocks of a registration a binding declares, and those it does not (FBL 0.7 8.1, 8.4, 8.5,
// 7.1). Counterparts of standalone's Registration/DeclaredBlocks.Tests.cs (PR #600), with what FBL
// adds where standalone does not check it.

/** The binding of the `registration-blocks` fixture: `tags` kept, `collapsed` ordinal by ids outside the history, `filters` kept. */
const tasks = resolveReference('#tasks', join(conformance, 'fixtures', 'registration-blocks', 'tasks.fbl'), nodeFiles);

const open = (text: string): OpenRegistration => OpenRegistration.open(utf8(text), tasks);

describe('the declared blocks of a registration', () => {
  it("the binding's blocks are read", () => {
    expect(tasks.registration.blocks).toEqual([
      { name: 'tags', kept: true, keyedByIds: false, inHistory: true },
      { name: 'collapsed', kept: false, keyedByIds: true, inHistory: false },
      { name: 'filters', kept: true, keyedByIds: false, inHistory: true },
    ]);
  });

  it('reading goes on past an undeclared block, keeps its bytes, and reports it once at information', () => {
    // notes is declared by no one, tags after it is the binding's.
    const registration = open('example/tasks\r\nnotes:\r\n  first: keep me\r\ntags:\r\n  security: red\r\n');
    const findings = registration.findings('plan.adp');

    // The declared block after it is read.
    expect(registration.document.block('tags')?.entries.map((entry) => entry.value)).toEqual(['red']);
    expect(registration.document.block('notes')).toBeUndefined();
    const unknown = findings.filter((finding) => finding.code === findingCodes.unknownBlock);
    expect(unknown).toHaveLength(1);
    expect(unknown[0].severity).toBe('info');
    expect(unknown[0].location).toEqual({ file: 'plan.adp', line: 2, column: 1, length: 6 });

    // A setting written after it keeps the undeclared block's bytes.
    const result = registration.change({ kind: 'setting', block: 'tags', key: 'core', value: 'default' });
    expect('planned' in result).toBe(true);
    expect(textOf(registration.bytes)).toBe('example/tasks\r\nnotes:\r\n  first: keep me\r\ntags:\r\n  security: red\r\n  core: default\r\n');
  });

  it("a value holding a colon and a space is refused", () => {
    const bytes = utf8('example/tasks\r\ntags:\r\n  security: red\r\n');
    const registration = OpenRegistration.open(bytes, tasks);
    const result = registration.change({ kind: 'setting', block: 'tags', key: 'legal', value: 'see: policy' });
    expect(result).toEqual({ refused: "A setting's value cannot hold ': '." });
    expect(registration.bytes).toEqual(bytes);
  });

  it('an empty value, a value of two lines and an empty key are refused (FBL 0.7 8.4)', () => {
    const bytes = utf8('example/tasks\r\ntags:\r\n  security: red\r\n');
    const registration = OpenRegistration.open(bytes, tasks);
    expect(registration.change({ kind: 'setting', block: 'tags', key: 'legal', value: '' })).toEqual({ refused: "A setting's value cannot be empty." });
    expect(registration.change({ kind: 'setting', block: 'tags', key: 'legal', value: 'a\r\nb' })).toEqual({ refused: "A setting's value is one line." });
    expect(registration.change({ kind: 'setting', block: 'tags', key: '', value: 'red' })).toEqual({ refused: "A setting's key cannot be empty." });
    expect(registration.bytes).toEqual(bytes);
  });

  it('a rename to a key the block has is refused', () => {
    const bytes = utf8('example/tasks\r\ntags:\r\n  security: red\r\n  core: default\r\n');
    const registration = OpenRegistration.open(bytes, tasks);
    const result = registration.change({ kind: 'setting', block: 'tags', key: 'core', rename: 'security' });
    expect('refused' in result && result.refused).toContain("'security'");
    expect(registration.bytes).toEqual(bytes);
  });

  it('a rename is a replace-value of the key', () => {
    const registration = open('example/tasks\r\ntags:\r\n  security: red\r\n');
    const result = registration.change({ kind: 'setting', block: 'tags', key: 'security', rename: 'safety' });
    expect(result).toEqual({ planned: { splices: [{ operation: 'replace-value', start: 24, end: 32, text: 'safety' }] } });
    expect(textOf(registration.bytes)).toBe('example/tasks\r\ntags:\r\n  safety: red\r\n');
  });

  it("removing the last entry removes the block's line with it", () => {
    const registration = open('example/tasks\r\ntags:\r\n  security: red\r\n');
    const result = registration.change({ kind: 'setting', block: 'tags', key: 'security', remove: true });
    expect('planned' in result).toBe(true);
    expect(textOf(registration.bytes)).toBe('example/tasks\r\n');
  });

  it('a setting of a block the binding does not declare is refused', () => {
    const registration = open('example/tasks\r\n');
    const result = registration.change({ kind: 'setting', block: 'notes', key: 'first', value: 'keep me' });
    expect(result).toEqual({ refused: "The binding declares no block 'notes'." });
    expect(textOf(registration.bytes)).toBe('example/tasks\r\n');
  });

  it('an ordinal block moves no entry', () => {
    const bytes = utf8('example/tasks\r\ncollapsed:\r\n  t1: yes\r\n  t2: yes\r\n');
    const registration = OpenRegistration.open(bytes, tasks);
    const result = registration.change({ kind: 'setting', block: 'collapsed', key: 't2', position: { index: 0 } });
    expect(result).toEqual({ refused: "The entries of 'collapsed' stand in the order of their keys, so none is moved." });
    expect(registration.bytes).toEqual(bytes);
  });

  it('an ephemeral id is never stored as a key of a block keyed by ids (FBL 0.7 8.5)', () => {
    const registration = open('example/tasks\r\n');
    registration.isEphemeral = (id) => id === 'line/3';
    const result = registration.change({ kind: 'setting', block: 'collapsed', key: 'line/3', value: 'yes' });
    expect('refused' in result).toBe(true);
    expect(textOf(registration.bytes)).toBe('example/tasks\r\n');
  });

  it('an entry keyed by an id the body does not have is stale, reported, and pruned outside the history', () => {
    const registration = open('example/tasks\r\ntags:\r\n  core: red\r\ncollapsed:\r\n  t9: yes\r\n');
    registration.knownIds = new Set(['t1']);
    const stale = registration.findings('plan.adp').filter((finding) => finding.code === findingCodes.staleViewData);
    expect(stale.map((finding) => finding.location.line)).toEqual([5]);

    registration.change({ kind: 'setting', block: 'tags', key: 'ux', value: 'blue' });
    registration.change({ kind: 'setting', block: 'collapsed', key: 't1', value: 'yes' });
    expect(textOf(registration.bytes)).toBe('example/tasks\r\ntags:\r\n  core: red\r\n  ux: blue\r\ncollapsed:\r\n  t1: yes\r\n');

    // The undo takes back the tags entry, and neither the fold nor the pruning.
    const undone = registration.undo();
    expect(undone).toEqual({ done: [{ operation: 'insert-entry', start: 35, end: 47, text: '' }] });
    expect(textOf(registration.bytes)).toBe('example/tasks\r\ntags:\r\n  core: red\r\ncollapsed:\r\n  t1: yes\r\n');
    expect(registration.canUndo).toBe(false);
  });

  it('a write outside the history leaves the redo stack, carried over its bytes (FBL 0.7 7.1)', () => {
    const registration = open('example/tasks\r\ntags:\r\n  core: red\r\n');
    registration.change({ kind: 'setting', block: 'filters', key: 'Open', value: '#core' });
    registration.undo();
    registration.change({ kind: 'setting', block: 'collapsed', key: 't1', value: 'yes' });
    expect(registration.canRedo).toBe(true);
    const redone = registration.redo();
    expect('done' in redone).toBe(true);
    expect(textOf(registration.bytes)).toBe('example/tasks\r\ntags:\r\n  core: red\r\ncollapsed:\r\n  t1: yes\r\nfilters:\r\n  Open: #core\r\n');
  });

  it('an undo after a write outside the history that removed the block after its place puts back only its own entry', () => {
    const registration = open('example/tasks\r\ncollapsed:\r\n  t1: yes\r\n');
    registration.change({ kind: 'setting', block: 'tags', key: 'core', value: 'red' });
    registration.change({ kind: 'setting', block: 'tags', key: 'core', remove: true });
    registration.change({ kind: 'setting', block: 'collapsed', key: 't1', remove: true });
    expect(textOf(registration.bytes)).toBe('example/tasks\r\n');
    expect('done' in registration.undo()).toBe(true);
    expect(textOf(registration.bytes)).toBe('example/tasks\r\ntags:\r\n  core: red\r\n');
    expect('done' in registration.undo()).toBe(true);
    expect(textOf(registration.bytes)).toBe('example/tasks\r\n');
  });

  it('a write outside the history over the splices of an entry clears the history', () => {
    // A step of the history wrote the very value the fold's removal takes out, so that step cannot
    // be carried over it.
    const registration = open('example/tasks\r\ncollapsed:\r\n  t1: yes\r\n');
    registration.apply({ splices: [{ operation: 'replace-value', start: 33, end: 36, text: 'no' }] });
    expect(registration.canUndo).toBe(true);
    registration.change({ kind: 'setting', block: 'collapsed', key: 't1', remove: true });
    expect(textOf(registration.bytes)).toBe('example/tasks\r\n');
    expect(registration.canUndo).toBe(false);
  });

  it('a registration whose last line has no line ending gets the block on a line of its own, with no ending after it', () => {
    // A registration without a line ending has none of its own to give, so it is LF, as in standalone (FBL 6.3).
    const registration = open('example/tasks');
    registration.change({ kind: 'setting', block: 'tags', key: 'core', value: 'red' });
    expect(textOf(registration.bytes)).toBe('example/tasks\ntags:\n  core: red');
  });
});

describe('loading declared blocks', () => {
  const load = (blocks: string) => loadDocument(utf8(`{ "fbl": "0.7", "bindings": { "t": { "claims": { "extensions": [".t"] }, "body": { "kind": "file", "family": "lines" }, "reader": "declared",
    "elements": [{ "name": "task", "type": "Task", "line": "^(?<id>.*)$", "id": { "from": { "group": "id" } } }], "registration": { "blocks": ${blocks} } } } }`)).problems
    .filter((problem) => problem.severity === 'error').map((problem) => `${problem.pointer}: ${problem.message}`);

  it('a block is an object, named by a Name that is neither layout nor identities, with a known order and keys', () => {
    expect(load('{ "layout": {}, "two words": {}, "notes": 1, "tags": { "order": "sorted", "keys": "numbers" } }')).toEqual([
      "/bindings/t/registration/blocks/layout: 'layout' cannot name a declared block: it is a Name, and neither layout nor identities (FBL 8.1).",
      "/bindings/t/registration/blocks/two words: 'two words' cannot name a declared block: it is a Name, and neither layout nor identities (FBL 8.1).",
      '/bindings/t/registration/blocks/notes: A declared block is an object.',
      '/bindings/t/registration/blocks/tags/order: A block\'s order is "ordinal" or "kept".',
      '/bindings/t/registration/blocks/tags/keys: A block\'s keys are "names" or "ids".',
    ]);
  });

  it('a block without properties is ordinal, keyed by names and in the history', () => {
    expect(load('{ "notes": {} }')).toEqual([]);
  });
});

// A registration created beside a body on the first placement or setting (FBL 8.4, 0.7 8.4).
// Counterparts of standalone's Registration/RegistrationCreation.Tests.cs.
describe('a registration created on the first placement or setting', () => {
  it("a registration whose base name differs names its body, in the body's line ending", () => {
    const result = createRegistration(tasks, 'example/tasks', 'plan.adp', 'week.tasks', utf8('task t1\r\ntask t2\r\n'), undefined);
    expect('bytes' in result && textOf(result.bytes)).toBe('example/tasks\r\nbody: week.tasks\r\n');
  });

  it("a registration with the body's base name is the origin line alone", () => {
    // LF, the body's dominant line ending.
    const result = createRegistration(tasks, 'example/tasks', 'week.adp', 'week.tasks', utf8('task t1\ntask t2\r\ntask t3\n'), undefined);
    expect('bytes' in result && textOf(result.bytes)).toBe('example/tasks\n');
  });

  it('the created registration is no step of the history', () => {
    const created = createRegistration(tasks, 'example/tasks', 'plan.adp', 'week.tasks', utf8('task t1\r\n'), undefined);
    if (!('bytes' in created)) throw new Error(created.refused);
    const registration = OpenRegistration.open(created.bytes, tasks);
    expect('planned' in registration.change({ kind: 'setting', block: 'tags', key: 'security', value: 'red' })).toBe(true);

    // The undo takes the setting back and leaves the file as it was created.
    expect('done' in registration.undo()).toBe(true);
    expect(registration.bytes).toEqual(created.bytes);
    expect(registration.canUndo).toBe(false);
  });

  it('a different file of that name is refused with a reason', () => {
    const result = createRegistration(tasks, 'example/tasks', 'plan.adp', 'week.tasks', utf8('task t1\r\n'), utf8('my own notes\r\n'));
    expect('refused' in result && result.refused).toContain('plan.adp');
  });

  it('a binding that does not create on first placement is refused with a reason', () => {
    const result = createRegistration(bindingOf('timeline.fbl', 'timeline'), 'generic/timeline', 'plan.adp', 'plan.tml', utf8('elements: []\n'), undefined);
    expect('refused' in result && result.refused.trim().length > 0).toBe(true);
  });
});
