import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Source } from '../../../src/core/frame/toolType';
import type { HierarchyNode, HierarchyView } from '../../../src/core/tool/hierarchyView';
import { applied, definitionOf, hierarchyDesignerOf, spliced } from './support';

// The Hierarchical Requirement Designer on large documents, as the extension serves them: opening a
// document is reading its findings and making its view, its actions and the message that carries
// them to the page; showing another program's change is the same again on the changed text.
//
// The standalone host's two guards are held here: NistControlsTests, the controls of NIST SP 800-53
// (2,616 entries) within four seconds, and LargeDocumentTests, spec 036's SC-005 (spec 029's SC-003),
// a generated document of 100 items and 500 requirements within two seconds.

const type = hierarchyDesignerOf(definitionOf('hierarchical-requirement'));
const all = (nodes: readonly HierarchyNode[]): HierarchyNode[] => nodes.flatMap((node) => [node, ...all(node.entries), ...all(node.levels)]);

/** What the extension does for a document it shows: its findings, its view and actions, and the message to the page. How long it took, in milliseconds. */
function served(source: Source): { readonly view: HierarchyView; readonly took: number } {
  const started = performance.now();
  type.findings(source);
  const view = type.view(source, {});
  const actions = type.actions(source, [], {});
  JSON.stringify({ view, actions });
  return { view, took: performance.now() - started };
}

describe('the controls of NIST SP 800-53', () => {
  /**
   * standalone NistControlsTests' limit: SC-005's two seconds are set for 600 entries, and at 2,616
   * the guard holds twice that, which still fails a reading that grows faster than the document.
   */
  const limit = 4000;
  const folder = 'examples/hierarchical-requirement/nist-sp-800-53';
  const source: Source = {
    fileName: 'C:/work/nist-sp-800-53.md',
    text: readFileSync(`${folder}/nist-sp-800-53.md`, 'utf8'),
    registration: readFileSync(`${folder}/nist-sp-800-53.adp`, 'utf8'),
  };

  it('read without a finding, as their readme says', () => {
    expect(type.findings(source)).toEqual([]);
    const view = type.view(source, {});
    const nodes = all([...view.roots, ...view.stray]);
    expect(nodes.filter((node) => node.role === 'level')).toHaveLength(1034);
    expect(nodes.filter((node) => node.role === 'entry')).toHaveLength(1582);
    expect(view.roots).toHaveLength(20);
    expect(view.stray).toEqual([]);
    expect(Math.max(...nodes.filter((node) => node.role === 'level').map((node) => node.depth))).toBe(3);
    expect(nodes.find((node) => node.id === 'ITEM-0004')!.title).toBe('AC-2(1) Automated System Account Management');
    expect(view.lists.find((list) => list.label === 'tags')!.members.map((member) => member.name)).toEqual(['low', 'moderate', 'high', 'privacy']);
    expect(nodes.filter((node) => node.collapsed)).toHaveLength(20);
    expect(view.filters.map((filter) => filter.name)).toEqual(['High baseline', 'Privacy baseline', 'Access control']);
  });

  it('open on the page, and show another program\'s change, each within four seconds', () => {
    const opened = served(source);
    expect(all(opened.view.roots).filter((node) => node.role === 'entry')).toHaveLength(1582);
    expect(opened.took, `Opening took ${opened.took.toFixed(0)} ms.`).toBeLessThan(limit);

    const changed = served({ ...source, text: source.text.replaceAll('REQ-1582 ', 'REQ-1582 Changed by an agent: ') });
    expect(all(changed.view.roots).find((node) => node.id === 'REQ-1582')!.title.startsWith('Changed by an agent: ')).toBe(true);
    expect(changed.took, `Showing the change took ${changed.took.toFixed(0)} ms.`).toBeLessThan(limit);
  });

  it('write one edit of a title on that line alone', () => {
    const outcome = applied(type.edit(source, { kind: 'operation', operation: 'setTitle', on: ['ITEM-0004'], args: { title: 'AC-2(1) Automated account management' } }, {}, false));
    const before = source.text.split('\n');
    const after = spliced(source.text, outcome.splices).split('\n');
    expect(after).toHaveLength(before.length);
    const changed = before.flatMap((line, at) => (line === after[at] ? [] : [at]));
    expect(changed).toHaveLength(1);
    expect(after[changed[0]].trimEnd()).toBe('    - ITEM-0004 AC-2(1) Automated account management');
  });
});

describe('a document of 100 items and 500 requirements', () => {
  const limit = 2000;

  /** standalone LargeDocumentTests' document: ten top items of ten levels each, every item holding five requirements with a description, tags, a category and a state. */
  function generated(): string {
    const lines = ['<!-- ded: 0.2 designer: etalii/hierarchical-requirement -->', '<!-- last: ITEM-0100 REQ-0500 -->', '# A large subject', '', '## Requirements', ''];
    const number = (value: number): string => String(value).padStart(4, '0');
    let requirement = 0;
    for (let item = 1; item <= 100; item++) {
      const indent = ' '.repeat(((item - 1) % 10) * 2);
      lines.push(`${indent}- ITEM-${number(item)} Part ${item} of the subject #part${item % 7}`, `${indent}  What part ${item} covers, in a sentence.`);
      for (let inItem = 0; inItem < 5; inItem++) {
        requirement++;
        lines.push(`${indent}  - REQ-${number(requirement)} Requirement ${requirement} holds. #topic${requirement % 11} category:functional state:proposed`, `${indent}    Measured as [REQ-${number(Math.max(1, requirement - 1))}] is.`);
      }
    }
    lines.push('', '## Assessments', '', '- [ ] Question REQ-0250: Is this one needed?', '');
    return lines.join('\r\n');
  }

  it('opens, and shows another program\'s change, each within two seconds (spec 036, SC-005)', () => {
    const source: Source = { fileName: 'C:/work/large.md', text: generated() };
    const opened = served(source);
    const nodes = all(opened.view.roots);
    expect(nodes.filter((node) => node.role === 'level')).toHaveLength(100);
    expect(nodes.filter((node) => node.role === 'entry')).toHaveLength(500);
    expect(opened.took, `Opening took ${opened.took.toFixed(0)} ms.`).toBeLessThan(limit);

    const changed = served({ ...source, text: source.text.replaceAll('Requirement 437 holds.', 'Requirement 437 holds twice.') });
    expect(all(changed.view.roots).some((node) => node.title === 'Requirement 437 holds twice.')).toBe(true);
    expect(changed.took, `Showing the change took ${changed.took.toFixed(0)} ms.`).toBeLessThan(limit);
  });
});
