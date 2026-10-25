import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveReference } from '../../../src/core/fbl/documents/documentLoader';
import { nodeFiles } from '../../../src/core/fbl/files/nodeFiles';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import { driftEdit, driftUndo } from '../../../src/core/fbl/history/splicedFile';
import type { ModelChange } from '../../../src/core/fbl/planning/modelChange';
import { OpenRegistration } from '../../../src/core/fbl/registration/openRegistration';
import { bindingOf } from './support/bindings';
import { conformance, textOf, utf8 } from './support/repository';

// Drift before an edit (FBL 0.7 7.2): an edit planned against bytes that are no longer the body's
// is refused with the library's one sentence, nothing is written, and the body is read again.
// Counterparts of standalone's History/OpenBodyDrift.Tests.cs (PR #596), and the same of a registration.
const timeline = 'elements:\n  - id: a\n    label: Alpha\n    start: 2026-01-01\n';

const open = (text: string): OpenBody => OpenBody.open(utf8(text), bindingOf('timeline.fbl', 'timeline'), { fileName: 'plan.tml' });

const rename: ModelChange = { kind: 'set', id: 'a', attributes: { label: 'Beta' } };

describe('drift before an edit', () => {
  it('an edit planned after the body changed on disk is refused and writes nothing', () => {
    // The body as read, and the same file after another writer changed it.
    const body = open(timeline);
    const read = body.bytes;
    body.change({ kind: 'set', id: 'a', attributes: { label: 'Alpha 2' } });
    expect(body.canUndo).toBe(true);
    const onDisk = utf8(timeline.replace('Alpha', 'Gamma'));

    const result = body.change(rename, onDisk);

    // Refused, nothing of the edit applied, and the body read again as it is on disk (FBL 0.7 7.2, 7.3).
    expect(result).toEqual({ refused: driftEdit });
    expect(body.bytes).not.toEqual(read);
    expect(body.bytes).toEqual(onDisk);
    expect(textOf(body.bytes)).not.toContain('Beta');
    expect(body.model.find('a')?.attributes.label).toBe('Gamma');
    expect(body.canUndo).toBe(false);
  });

  it('an edit planned against the bytes on disk is written', () => {
    const body = open(timeline);
    const result = body.change(rename, body.bytes.slice());
    expect('planned' in result).toBe(true);
    expect(textOf(body.bytes)).toContain('Beta');
    expect(body.canUndo).toBe(true);
  });

  it('the sentence is the one FBL 7.2 gives', () => {
    expect(driftEdit).toBe('The file has changed since this edit was made, so it was not written.');
  });

  it('a registration refuses an edit on drift as a body does', () => {
    const registration = OpenRegistration.open(utf8('generic/timeline\r\nlayout:\r\n  a: 1 2\r\n'));
    const onDisk = utf8('generic/timeline\r\nlayout:\r\n  a: 5 6\r\n');
    const result = registration.change({ kind: 'place', id: 'a', x: 3, y: 4 }, onDisk);
    expect(result).toEqual({ refused: driftEdit });
    expect(registration.bytes).toEqual(onDisk);
    expect(registration.document.positions().get('a')).toEqual({ x: 5, y: 6 });
    expect(registration.canUndo).toBe(false);
  });
});

describe('drift of a registration with blocks outside the history (FBL 0.7 7.1)', () => {
  // The binding of the `registration-blocks` fixture: `collapsed` is declared `history: false`.
  const tasks = resolveReference('#tasks', join(conformance, 'fixtures', 'registration-blocks', 'tasks.fbl'), nodeFiles);
  const crlf = (lines: readonly string[]): string => lines.map((line) => `${line}\r\n`).join('');
  const read = crlf(['example/tasks', 'tags:', '  core: red', 'filters:', '  Open: #core']);
  const open = (): OpenRegistration => OpenRegistration.open(utf8(read), tasks);

  it('an edit is written when the file differs only in the lines of such a block, against the file as it is', () => {
    const registration = open();
    registration.change({ kind: 'setting', block: 'tags', key: 'ux', value: 'blue' });
    // Another writer folded an element: a collapsed block now stands between tags and filters.
    const onDisk = utf8(crlf(['example/tasks', 'tags:', '  core: red', '  ux: blue', 'collapsed:', '  t1: yes', 'filters:', '  Open: #core']));

    const result = registration.change({ kind: 'setting', block: 'filters', key: 'Mine', value: '#ux' }, onDisk);

    expect('planned' in result).toBe(true);
    expect(textOf(registration.bytes)).toBe(crlf(['example/tasks', 'tags:', '  core: red', '  ux: blue', 'collapsed:', '  t1: yes', 'filters:', '  Open: #core', '  Mine: #ux']));
    // Both edits are still steps of the history, and their undo leaves the fold where it is.
    expect('done' in registration.undo()).toBe(true);
    expect('done' in registration.undo()).toBe(true);
    expect(textOf(registration.bytes)).toBe(crlf(['example/tasks', 'tags:', '  core: red', 'collapsed:', '  t1: yes', 'filters:', '  Open: #core']));
  });

  it('an undo is done when the file differs only in the lines of such a block, its splices moved by them', () => {
    const registration = open();
    registration.change({ kind: 'setting', block: 'filters', key: 'Mine', value: '#ux' });
    const onDisk = utf8(crlf(['example/tasks', 'tags:', '  core: red', 'collapsed:', '  t1: yes', 'filters:', '  Open: #core', '  Mine: #ux']));

    const undone = registration.undo(onDisk);

    // The entry the edit wrote is taken out where it stands in the file as it is, past the fold's 23 bytes.
    const at = textOf(onDisk).indexOf('  Mine');
    expect(undone).toEqual({ done: [{ operation: 'insert-entry', start: at, end: at + 13, text: '' }] });
    expect(textOf(registration.bytes)).toBe(crlf(['example/tasks', 'tags:', '  core: red', 'collapsed:', '  t1: yes', 'filters:', '  Open: #core']));
  });

  it('an undo is refused when the file differs in any other line', () => {
    const registration = open();
    registration.change({ kind: 'setting', block: 'filters', key: 'Mine', value: '#ux' });
    const onDisk = utf8(crlf(['example/tasks', 'tags:', '  core: green', 'filters:', '  Open: #core', '  Mine: #ux']));
    expect(registration.undo(onDisk)).toEqual({ refused: driftUndo });
    expect(textOf(registration.bytes)).toBe(crlf(['example/tasks', 'tags:', '  core: red', 'filters:', '  Open: #core', '  Mine: #ux']));
  });

  it('an edit is refused when the file differs in a line of a block in the history', () => {
    const registration = open();
    const onDisk = utf8(read.replace('red', 'green'));
    expect(registration.change({ kind: 'setting', block: 'filters', key: 'Mine', value: '#ux' }, onDisk)).toEqual({ refused: driftEdit });
    expect(registration.bytes).toEqual(onDisk);
  });
});
