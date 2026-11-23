import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import type { SectionsPartView, SectionsView } from '../../../src/core/tool/sectionsView';
import { definitionOf, designerOf } from './support';

// The page of sections (DESL 7.8) the post-incident review is shown on (etalii.adp spec 090, task
// T017): its parts in order, a record's fields and figures, a list's rows in their order and
// groups with their marks, the time strip, what selecting a row highlights, and the operations a
// part and a row offer, all as plain data that crosses to the webview.

const type = designerOf(definitionOf('post-incident-review'), registry);
const source = (name = 'certificate-expiry'): Source => ({ fileName: `${name}.md`, text: readFileSync(`examples/post-incident-review/${name}.md`, 'utf8') });
const viewOf = (from: Source = source()): SectionsView => type.view(from, {}) as unknown as SectionsView;
const part = (view: SectionsView, id: string): SectionsPartView => view.parts.find((candidate) => candidate.id === id)!;
const rowsOf = (shown: SectionsPartView) => (shown.groups ?? []).flatMap((group) => group.rows);

describe('the page of sections of a post-incident review', () => {
  const view = viewOf();

  it('is shown on a page of sections, as plain data', () => {
    expect(type.page).toBe('sections');
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    expect(view.readOnly).toBe(false);
    expect(view.name).toBe('certificate-expiry');
  });

  it('has its six parts in the order of the specification, each with its title', () => {
    expect(view.parts.map((shown) => `${shown.kind} ${shown.title}`)).toEqual(['record Summary', 'record Impact', 'list Timeline', 'list Contributing factors', 'list Actions', 'list Categories']);
  });

  it('shows a record of the document with its fields, and its figures in their written form', () => {
    const summary = part(view, 'summary');
    expect(summary.record?.id).toBe('');
    expect(summary.record?.values.timeZone).toBe('UTC');
    expect(summary.record?.values.summary).toContain('The TLS certificate of the public API expired');
    expect(summary.figures.map((figure) => `${figure.label}: ${figure.text}`)).toEqual(['Time to detect: 47m', 'Time to engage: 8m', 'Time to mitigate: 51m', 'Time to resolve: 3h']);
    expect(part(view, 'impact').record?.values.affected).toBe('users of the mobile app');
  });

  it('gives a figure that has no value the text the specification has for that', () => {
    const text = source().text.replace(/- E-0003 2026-10-14T00:47Z detection: /, '- E-0003 2026-10-14T00:47Z ');
    const figures = part(viewOf({ ...source(), text }), 'summary').figures;
    expect(figures.map((figure) => `${figure.absent ? 'absent' : 'given'}: ${figure.text}`)).toEqual([
      'absent: No start or detection entry yet', 'absent: No detection or engagement entry yet', 'absent: No detection or mitigated entry yet', 'given: 3h',
    ]);
  });

  it('orders the timeline by time, rows of one time in the order of the file, and leaves the file as it is', () => {
    expect(rowsOf(part(view, 'timeline')).map((row) => row.id)).toEqual(['E-0001', 'E-0002', 'E-0009', 'E-0003', 'E-0004', 'E-0005', 'E-0006', 'E-0007', 'E-0008']);
    expect(rowsOf(part(view, 'timeline'))[0].values).toMatchObject({ time: '2026-10-14T00:00Z', kind: 'trigger', author: 'agent', evidence: 'https://example.org/certificates/api' });
  });

  it('stands each entry with a time on the time strip, the milestones emphasised and labelled', () => {
    const strip = part(view, 'timeline').timeStrip!;
    expect([strip.from, strip.to]).toEqual(['2026-10-14T00:00Z', '2026-10-14T03:00Z']);
    const mark = (row: string) => strip.marks.find((candidate) => candidate.row === row)!;
    expect(mark('E-0001').offset).toBe(0);
    expect(mark('E-0008').offset).toBe(1);
    expect(mark('E-0004').offset).toBeCloseTo(55 / 180);
    expect([mark('E-0003').emphasised, mark('E-0003').label]).toEqual([true, 'Detection']);
    expect([mark('E-0005').emphasised, mark('E-0005').label]).toEqual([false, undefined]);
    expect(strip.untimed).toEqual([]);
  });

  it('groups the factors by category, in the order of each group\'s first row, with its count', () => {
    expect(part(view, 'factors').groups!.map((group) => `${group.key} ${group.count}`)).toEqual(['change 1', 'detection 2', 'people 2']);
  });

  it('marks the rows the specification\'s marks hold for, and no others', () => {
    const marked = (id: string) => rowsOf(part(view, id)).filter((row) => row.marks.length > 0).map((row) => `${row.id} ${row.marks.map((mark) => `${mark.label} (${mark.style})`).join(', ')}`);
    expect(marked('factors')).toEqual(['F-0004 Unaddressed (warning)', 'F-0005 Rejected (info)']);
    expect(marked('timeline')).toEqual([]);
    expect(marked('actions')).toEqual([]);
  });

  it('relates a row to the rows it mentions and to the rows that mention it', () => {
    const factor = rowsOf(part(view, 'factors')).find((row) => row.id === 'F-0002')!;
    expect([...factor.related].sort()).toEqual(['A-0002', 'E-0001', 'E-0003']);
  });

  it('offers each list\'s add gesture, and on each row the operations for it, with why one cannot run', () => {
    expect(part(view, 'timeline').add).toEqual({ operation: 'addEntry', label: 'New entry', enabled: true });
    expect(part(view, 'categories').add?.params).toEqual([{ name: 'name', label: 'Name', required: true }]);
    expect(part(view, 'summary').add).toBeUndefined();
    const rejected = rowsOf(part(view, 'factors')).find((row) => row.id === 'F-0005')!;
    expect(rejected.operations.map((operation) => `${operation.label} ${operation.enabled ? 'enabled' : `disabled: ${operation.reason}`}`)).toEqual([
      'Accept enabled', 'Reject disabled: This factor is rejected.', 'New action for this factor enabled',
    ]);
    const done = rowsOf(part(view, 'actions')).find((row) => row.id === 'A-0001')!;
    expect(done.operations.map((operation) => operation.label)).toEqual(['Reopen']);
  });

  it('shows a document it cannot read as read-only, with the reason', () => {
    const shown = viewOf({ fileName: 'other.md', text: '# Not a review\n' });
    expect(shown.readOnly).toBe(true);
    expect(shown.notice).toBeTruthy();
  });
});
