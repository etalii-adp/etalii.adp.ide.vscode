import { describe, expect, it } from 'vitest';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import { driftRedo } from '../../../src/core/fbl/history/splicedFile';
import type { ModelChange } from '../../../src/core/fbl/planning/modelChange';
import { OpenRegistration } from '../../../src/core/fbl/registration/openRegistration';
import type { Edit } from '../../../src/core/fbl/splice';
import { bindingOf } from './support/bindings';
import { utf8 } from './support/repository';

// Undo, redo, snapshots, drift (FBL 7.1, 7.2) and the save (FBL 6.6). Counterparts of standalone's
// History/History.Tests.cs.
const timeline = 'elements:\n  - id: a\n    label: Alpha\n    start: 2026-01-01\n';

const open = (text: string): OpenBody => OpenBody.open(utf8(text), bindingOf('timeline.fbl', 'timeline'), { fileName: 'plan.tml' });

const rename: ModelChange = { kind: 'set', id: 'a', attributes: { label: 'Beta' } };

describe('the history of a body', () => {
  it('a snapshot undo equals an inverse splice undo', () => {
    const bytes = utf8(timeline);
    const edit: Edit = { splices: [{ operation: 'replace-value', start: 31, end: 36, text: '"Al: pha"' }] };
    const inverse = OpenRegistration.open(bytes);
    const snapshot = OpenRegistration.open(bytes);
    inverse.apply(edit);
    snapshot.apply({ ...edit, snapshot: true });
    inverse.undo();
    snapshot.undo();
    expect(inverse.bytes).toEqual(bytes);
    expect(snapshot.bytes).toEqual(inverse.bytes);
  });

  it('redo repeats the edit and is refused on drift', () => {
    const body = open(timeline);
    body.change(rename);
    const edited = body.bytes;
    body.undo();
    const drifted = body.redo(utf8('other'));
    const redone = body.redo();
    expect(drifted).toEqual({ refused: driftRedo });
    expect(redone).toHaveProperty('done');
    expect(body.bytes).toEqual(edited);
  });

  it('a reload clears the history', () => {
    const body = open(timeline);
    body.change(rename);
    body.reload(utf8(timeline));
    expect(body.canUndo).toBe(false);
    expect(body.model.find('a')!.attributes.label).toBe('Alpha');
  });

  it('a save hands the hosts writer the edited bytes', () => {
    const body = open(timeline);
    body.change(rename);
    const written: Uint8Array[] = [];
    body.save((bytes) => written.push(bytes));
    // The atomic write itself is the host's, not the library's.
    expect(written).toEqual([body.bytes]);
  });

  it('an unreadable body is never saved', () => {
    const body = open('elements: [unclosed\n');
    const written: Uint8Array[] = [];
    expect(() => body.save((bytes) => written.push(bytes))).toThrow();
    expect(body.isReadOnly).toBe(true);
    expect(written).toEqual([]);
  });
});
