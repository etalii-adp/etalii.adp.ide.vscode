import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import type { SectionsRequest, SectionsView } from '../../../src/core/tool/sectionsView';
import { applied, definitionOf, designerOf, linesChanged, refusal, spliced } from './support';

// The gestures of the post-incident review's page (etalii.adp spec 090, task T019): accept, reject,
// add an entry, a factor, an action or an action for a factor, complete, and edit a field, each one
// edit of the text and so one undo step, held to the bytes of etalii.adp's FBL fixture
// `post-incident-review-edits`, which states what each comes to on the agent-drafted review.

interface Step {
  readonly doc: string;
  readonly edit?: unknown;
  readonly undo?: boolean;
  readonly redo?: boolean;
  readonly expect?: string;
}

const type = designerOf(definitionOf('post-incident-review'), registry);
const edits = JSON.parse(readFileSync('fixtures/tools/post-incident-review/edits/fixture.json', 'utf8')) as { readonly steps: readonly Step[] };
const input = readFileSync('fixtures/tools/post-incident-review/edits/checkout-latency.md', 'utf8');
const sourceOf = (text: string): Source => ({ fileName: 'checkout-latency.md', text });
/** The text a step of the fixture leaves, by the words of its doc. */
const after = (about: string): string => edits.steps.find((step) => step.edit !== undefined && step.doc.includes(about))!.expect!;
/** The text a gesture leaves, which must be one edit. */
const gesture = (text: string, request: SectionsRequest): { readonly text: string; readonly select?: string } => {
  const outcome = applied(type.edit(sourceOf(text), request as never, {}, false));
  return { text: spliced(text, outcome.splices), ...(outcome.select === undefined ? {} : { select: outcome.select }) };
};

describe('the gestures of a post-incident review, as the bytes of the fixture post-incident-review-edits', () => {
  it('starts from the file the fixture edits, which a save alone leaves as it is', () => {
    expect(edits.steps[0].expect).toBe(input);
  });

  it('accepts a factor, numbering the entries written E-NEW in the same edit', () => {
    expect(gesture(input, { kind: 'operation', operation: 'acceptFactor', on: ['F-0001'] }).text).toBe(after('A person accepts F-0001'));
  });

  it('rejects a factor, and keeps the reason given in its detail', () => {
    const accepted = after('A person accepts F-0001');
    const rejected = gesture(accepted, { kind: 'operation', operation: 'rejectFactor', on: ['F-0003'] }).text;
    const reasoned = gesture(rejected, { kind: 'setField', id: 'F-0003', field: 'detail', value: 'Rejected: the pool size was valid for the schema; the change itself is F-0001.' }).text;
    expect(reasoned).toBe(after('A person rejects F-0003'));
  });

  it('rewords a factor by its text field', () => {
    expect(gesture(after('A person rejects F-0003'), { kind: 'setField', id: 'F-0002', field: 'text', value: 'The latency alert fires 7 minutes after customers are affected.' }).text).toBe(after('A person rewords F-0002'));
  });

  it('adds an action for a factor, numbered by the counter, and selects it', () => {
    const made = gesture(after('A person rewords F-0002'), { kind: 'operation', operation: 'addActionFor', on: ['F-0001'] });
    expect(made.text).toBe(after('An action is added for F-0001'));
    expect(made.select).toBe('A-0001');
  });

  it('names the entries written E-NEW by their lines until they are numbered, and numbers one a gesture names (DESL 0.3)', () => {
    const timeline = (type.view(sourceOf(input), {}) as unknown as SectionsView).parts.find((shown) => shown.id === 'timeline')!;
    const ids = (timeline.groups ?? []).flatMap((group) => group.rows.map((row) => row.id));
    expect(ids.filter((id) => id.startsWith('line/'))).toEqual(['line/46', 'line/47', 'line/48']);
    const made = gesture(input, { kind: 'setField', id: 'line/47', field: 'text', value: 'Error rate of checkout back to its usual level.' }).text;
    expect(made).not.toContain('E-NEW 2026-11-03T10:50');
    expect(made).toMatch(/^- E-\d{4} 2026-11-03T10:50\+01:00 Error rate of checkout back to its usual level\. by:agent$/m);
  });

  it('completes an action, and gives it an owner by its field', () => {
    const done = gesture(after('An action is added for F-0001'), { kind: 'operation', operation: 'completeAction', on: ['A-0001'] }).text;
    expect(done).toBe(after('A-0001 is marked done'));
    expect(gesture(done, { kind: 'setField', id: 'A-0001', field: 'owner', value: '@platform' }).text).toBe(after('An owner is given'));
  });
});

describe('the gestures of a post-incident review that the fixture does not state', () => {
  const review = readFileSync('examples/post-incident-review/certificate-expiry.md', 'utf8');
  const rowIds = (text: string, part: string): string[] => ((type.view(sourceOf(text), {}) as unknown as SectionsView).parts.find((shown) => shown.id === part)?.groups ?? []).flatMap((group) => group.rows.map((row) => row.id));

  it.each([
    ['an entry', 'addEntry', 'timeline', 'E-0010', '- E-0010 New entry by:person'],
    // A factor's state is not written while it is the default, proposed (DESL 4.3, a value that is not stored).
    ['a factor', 'addFactor', 'factors', 'F-0006', '- F-0006 by:person New factor'],
    ['an action', 'addAction', 'actions', 'A-0005', '- [ ] A-0005 New action'],
  ])('adds %s at the end of its part, numbered and selected, as one edit', (_, operation, part, id, line) => {
    const made = gesture(review, { kind: 'operation', operation });
    expect(made.select).toBe(id);
    expect(linesChanged(review, made.text).added).toEqual(expect.arrayContaining([line]));
    expect(rowIds(made.text, part)).toContain(id);
  });

  it('adds a category by the name it is given', () => {
    const made = gesture(review, { kind: 'operation', operation: 'addCategory', args: { name: 'tooling' } });
    expect(linesChanged(review, made.text).added).toEqual(['- tooling']);
    expect(made.select).toBe('category/tooling');
  });

  it('sets a field of the document, and clears one with the empty text', () => {
    const zoned = gesture(review, { kind: 'setField', id: '', field: 'timeZone', value: 'Europe/Amsterdam' }).text;
    expect(linesChanged(review, zoned)).toEqual({ removed: ['- Time zone: UTC'], added: ['- Time zone: Europe/Amsterdam'] });
    const cleared = gesture(review, { kind: 'setField', id: 'A-0002', field: 'owner', value: '' }).text;
    expect(linesChanged(review, cleared).added).toEqual(['- [ ] A-0002 Alert 30 days and 7 days before a certificate expires. due:2026-11-15 addresses:[F-0002]']);
  });

  it('gives a field that holds several values each value between its commas', () => {
    const both = gesture(review, { kind: 'setField', id: 'A-0002', field: 'addresses', value: 'F-0002, F-0003' }).text;
    expect(linesChanged(review, both).added).toEqual(['- [ ] A-0002 Alert 30 days and 7 days before a certificate expires. owner:@observability due:2026-11-15 addresses:[F-0002] addresses:[F-0003]']);
  });

  it('refuses a value its field does not take, and says what it takes', () => {
    expect(refusal(type.edit(sourceOf(review), { kind: 'setField', id: 'E-0003', field: 'time', value: 'yesterday' } as never, {}, false))).toContain('2026-11-03T10:12+01:00');
    expect(refusal(type.edit(sourceOf(review), { kind: 'setField', id: 'E-0003', field: 'kind', value: 'noticed' } as never, {}, false))).toContain('detection');
    expect(refusal(type.edit(sourceOf(review), { kind: 'operation', operation: 'rejectFactor', on: ['F-0005'] } as never, {}, false))).toBe('This factor is rejected.');
  });
});
