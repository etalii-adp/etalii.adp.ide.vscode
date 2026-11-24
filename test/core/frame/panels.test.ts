import { describe, expect, it } from 'vitest';
import { noEntries, nothingSelected, readOnlyEntries } from '../../../src/core/frame/panels';

// Found by the host test (spec 090, T029): the post-incident review designer showed an empty ADP
// Toolbox with no sentence, and ADP Properties asked for "an element or a relation in the diagram"
// on a page that has neither.
describe('the panels\' sentences', () => {
  it('speak of a page for a designer and of a diagram for a diagram', () => {
    expect(nothingSelected({ kind: 'designer', page: 'sections' })).toBe('Select an item on the page to see its properties.');
    expect(nothingSelected({ kind: 'diagram', page: 'canvas' })).toBe('Select an element or a relation in the diagram to see its properties.');
    expect(noEntries({ kind: 'designer', page: 'sections' })).toContain('buttons on its page');
    expect(readOnlyEntries({ kind: 'diagram', page: 'canvas' })).toBe('This diagram is read-only, so nothing can be added to it.');
    expect(readOnlyEntries({ kind: 'designer', page: 'table' })).toBe('This designer is read-only, so nothing can be added to it.');
  });
});
