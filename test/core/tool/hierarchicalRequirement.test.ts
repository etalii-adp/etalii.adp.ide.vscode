import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decode, encode } from '../../../src/core/fbl/text/utf8';
import type { Source, TextSplice } from '../../../src/core/frame/toolType';
import type { HierarchyNode, HierarchyRequest } from '../../../src/core/tool/hierarchyView';
import { applied, definitionOf, hierarchyDesignerOf, refusal, spliced } from './support';

// The Hierarchical Requirement Designer as a tool type made from its definition: its web-shop
// example and that example's registration opened as the frame opens them, shown as a page of boxes,
// and changed by every kind of request the page, ADP Toolbox and ADP Properties make. An edit is
// the FBL library's splices of the body and, for what the registration keeps, the registration's
// new text, both in one outcome; one that writes the body numbers first what the file holds
// without a number.

const type = hierarchyDesignerOf(definitionOf('hierarchical-requirement'));
const text = readFileSync('examples/hierarchical-requirement/web-shop.md', 'utf8');
const registration = readFileSync('examples/hierarchical-requirement/web-shop.adp', 'utf8');
const nl = text.includes('\r\n') ? '\r\n' : '\n';
const source: Source = { fileName: 'C:/work/web-shop.md', text, registration };
/** The example with its placeholder numbered, as the first edit that writes it leaves it. */
const numberedText = text.replace('<!-- last: ITEM-0007 REQ-0012 -->', '<!-- last: ITEM-0007 REQ-0013 -->').replace('+ REQ-NEW A guest', '+ REQ-0013 A guest');
const numbered: Source = { ...source, text: numberedText };

const operation = (name: string, on: readonly string[] = [], args: Readonly<Record<string, string | number | boolean>> = {}): HierarchyRequest => ({ kind: 'operation', operation: name, on, args });

/** The splices that undo an applied outcome: of the text after it, each putting back the bytes its splice took out. */
function inverseOf(before: string, splices: readonly TextSplice[]): TextSplice[] {
  const bytes = encode(before);
  let shift = 0;
  return splices.map((splice) => {
    const written = encode(splice.text).length;
    const back = { offset: splice.offset + shift, length: written, text: decode(bytes.subarray(splice.offset, splice.offset + splice.length)) };
    shift += written - splice.length;
    return back;
  });
}

/** The body after a request that is applied, which also undoes exactly. A question it would ask is answered yes. */
function after(on: Source, request: HierarchyRequest): string {
  const outcome = applied(type.edit(on, request, {}, true));
  const changed = spliced(on.text, outcome.splices);
  expect(spliced(changed, inverseOf(on.text, outcome.splices)), 'undo gives the bytes before').toBe(on.text);
  return changed;
}

const all = (nodes: readonly HierarchyNode[]): HierarchyNode[] => nodes.flatMap((node) => [node, ...all(node.entries), ...all(node.levels)]);
const nodeOf = (on: Source, id: string): HierarchyNode | undefined => {
  const view = type.view(on, {});
  return all([...view.roots, ...view.stray]).find((node) => node.id === id);
};

describe('the Hierarchical Requirement Designer', () => {
  it('is a designer shown as a page of boxes', () => {
    expect(type.kind).toBe('designer');
    expect(type.page).toBe('hierarchy');
    expect(type.claimed(source.fileName, text)).toBe(true);
    expect(type.claimed('C:/work/notes.md', '# Notes\n')).toBe(false);
    expect(type.suggests(source.fileName, text)).toBe(true);
  });

  it('reads its example with one finding: the placeholder, which the next edit numbers', () => {
    expect(type.findings(source)).toEqual([{ rule: 'std.missingId', severity: 'warning', message: 'REQ-0013 is numbered when the document is next changed: the file holds REQ-NEW.', line: 43 }]);
  });

  it('shows the items as levels and the requirements as entries, in the file\'s order', () => {
    const view = type.view(source, {});
    expect(view).toMatchObject({ name: 'web-shop', ids: 'shown', readOnly: false, stray: [] });
    expect(view.roots.map((node) => node.id)).toEqual(['ITEM-0001', 'ITEM-0004', 'ITEM-0006']);
    const storefront = view.roots[0];
    expect(storefront.entries.map((node) => node.id)).toEqual(['REQ-0001', 'REQ-0002']);
    expect(storefront.levels.map((node) => node.id)).toEqual(['ITEM-0002']);
    expect(storefront.levels[0].levels[0]).toMatchObject({ id: 'ITEM-0003', depth: 3, parent: 'ITEM-0002', collapsed: true });
    expect(storefront.levels[0].levels[0].entries.map((node) => [node.id, node.ephemeral, node.renumber])).toEqual([['REQ-0005', false, false], ['REQ-0013', true, true]]);
    expect(storefront).toMatchObject({ role: 'level', type: 'Item', depth: 1, shownId: 'ITEM-0001', title: 'Storefront', notes: { open: 0, within: 1 } });
    expect(storefront.labels).toEqual([{ label: 'tags', name: 'customer', member: 'tag/customer', colourKey: 'blue', implied: false }]);
    expect(storefront.entries[1]).toMatchObject({ collapsed: true, descriptionText: 'Measured at the 95th percentile, on a 4G connection.' });
    expect(storefront.entries[0].labels.map((label) => [label.label, label.name, label.colourKey])).toEqual([['tags', 'search', 'default'], ['category', 'functional', 'blue'], ['state', 'accepted', 'green']]);
  });

  it('shows a mention as what it names, and one that names nothing as broken', () => {
    const checkout = nodeOf(source, 'REQ-0004')!;
    expect(checkout.description).toEqual([
      { text: 'Sent when ' },
      { text: '[REQ-0003]', mention: { id: 'REQ-0003', type: 'Requirement', title: 'A customer pays by card, iDEAL or PayPal.', broken: false } },
      { text: ' succeeds, through the service of ' },
      { text: '[ITEM-0005]', mention: { id: 'ITEM-0005', type: 'Item', title: 'Mail', broken: false } },
      { text: '.' },
    ]);
    const broken = { ...numbered, text: numberedText.replace('See [REQ-0007] for', 'See [REQ-0099] for') };
    expect(nodeOf(broken, 'REQ-0006')!.description.find((part) => 'mention' in part)).toEqual({ text: '[REQ-0099]', mention: { id: 'REQ-0099', broken: true } });
    expect(nodeOf(broken, 'REQ-0006')!.findings).toEqual([{ severity: 'warning', count: 1 }]);
    expect(type.findings(broken).map((found) => found.rule)).toEqual(['std.mentions']);
  });

  it('shows the lists of the labels, the assessments, the stored filters and what the page itself offers', () => {
    const view = type.view(source, {});
    expect(view.lists.map((list) => [list.label, list.prefix, list.many, list.members.length])).toEqual([['tags', '#', true, 9], ['category', 'category:', false, 3], ['state', '@', false, 4]]);
    expect(view.lists[0].gestures).toMatchObject({ add: { operation: 'addTag' }, remove: { operation: 'removeTag' } });
    expect(view.lists[1]).toMatchObject({ add: { operation: 'addCategory' }, gestures: { set: { operation: 'setCategory', params: { member: 'category' } }, clear: { operation: 'clearCategory' } } });
    expect(view.lists[0].colours.map((colour) => colour.key)).toContain('purple');
    expect(view.notes.map((note) => [note.id, note.kind, note.aboutId, note.resolved])).toEqual([
      ['assessment/0', 'question', 'REQ-0006', false], ['assessment/1', 'warning', 'ITEM-0002', true], ['assessment/2', 'remark', 'REQ-0003', false], ['assessment/3', 'idea', 'ITEM-0006', false],
    ]);
    expect(view.noteKinds.map((kind) => kind.key)).toEqual(['question', 'remark', 'warning', 'idea']);
    expect(view.filters.map((filter) => [filter.id, filter.query])).toEqual([['filter/Open security', '#security @proposed sort:state'], ['filter/Backend', 'item:back* sort:number']]);
    expect(view.widthRange).toEqual({ min: 120, max: 2000 });
    expect(view.pageGestures).toMatchObject({ addLevel: { operation: 'addTopItem' }, addFilter: { operation: 'storeFilter' }, addWidth: { operation: 'addColumnWidth' } });
    expect(Object.keys(view.operations)).toContain('moveRequirement');
  });

  it('shows what a filter a viewer applied leaves, ordered as it says, and folds of its own', () => {
    const view = type.view(source, { query: '#security sort:number', collapsed: { 'ITEM-0004': true } });
    expect(view.applied).toEqual({ query: '#security sort:number', shown: 3, total: 17 });
    expect(view.roots.map((node) => [node.id, node.collapsed, node.entries.map((entry) => entry.id), node.levels.map((level) => level.id)])).toEqual([['ITEM-0004', true, ['REQ-0006', 'REQ-0007'], []]]);
    expect(type.view(source, { query: 'category:te' }).completions).toEqual(['category:technical']);
  });

  it('offers an item and a requirement in ADP Toolbox', () => {
    expect(type.toolbox(source).map((entry) => [entry.id, entry.label, entry.icon])).toEqual([['Item', 'Item', 'mdi-folder-outline'], ['Requirement', 'Requirement', 'mdi-checkbox-blank-outline']]);
  });
});

describe('an edit of a requirement document', () => {
  it('numbers what the file holds without a number with the first edit that writes it', () => {
    const written = after(source, operation('setTitle', ['REQ-0001'], { title: 'A customer finds a product.' }));
    expect(written).toBe(numberedText.replace('REQ-0001 A customer finds a product by its name or its description.', 'REQ-0001 A customer finds a product.'));
  });

  it('adds a requirement after the item\'s last one, with the mark, in one edit, and selects it for typing', () => {
    const outcome = applied(type.edit(numbered, operation('addRequirement', ['ITEM-0001']), {}, false));
    expect(outcome).toMatchObject({ select: 'REQ-0014', editLabel: true });
    expect(outcome.registration).toBeUndefined();
    const anchor = `    Measured at the 95th percentile, on a 4G connection.${nl}`;
    expect(spliced(numberedText, outcome.splices)).toBe(numberedText.replace('REQ-0013 -->', 'REQ-0014 -->').replace(anchor, `${anchor}  * REQ-0014 New requirement${nl}`));
  });

  it('numbers a placeholder and gives a new requirement the number after it in the same edit', () => {
    const outcome = applied(type.edit(source, operation('addRequirementBelow', ['REQ-0009']), {}, false));
    expect(outcome.select).toBe('REQ-0014');
    expect(spliced(text, outcome.splices)).toBe(numberedText.replace('REQ-0013 -->', 'REQ-0014 -->')
      .replace(`as tax law requires. #legal category:non-functional state:accepted${nl}`, `as tax law requires. #legal category:non-functional state:accepted${nl}  - REQ-0014 New requirement${nl}`));
  });

  it('moves a requirement into another item at the indentation there', () => {
    const line = '* REQ-0001 A customer finds a product by its name or its description. #search category:functional state:accepted';
    const written = after(numbered, operation('moveRequirement', ['REQ-0001'], { item: 'ITEM-0005' }));
    expect(written).toBe(numberedText.replace(`  ${line}${nl}`, '').replace(`state:proposed${nl}- ITEM-0006`, `state:proposed${nl}    ${line}${nl}- ITEM-0006`));
  });

  it('folds a requirement in the registration alone, outside the history', () => {
    const outcome = applied(type.edit(source, operation('toggleCollapsed', ['REQ-0001']), {}, false));
    expect(outcome).toMatchObject({ splices: [], history: false });
    expect(outcome.registration).toBe(registration.replace(`  ITEM-0003: yes${nl}`, `  ITEM-0003: yes${nl}  REQ-0001: yes${nl}`));
    const back = applied(type.edit(source, operation('toggleCollapsed', ['REQ-0002']), {}, false));
    expect(back.registration).toBe(registration.replace(`  REQ-0002: yes${nl}`, ''));
  });

  it('folds a requirement without a number for the session only', () => {
    expect(type.edit(source, operation('toggleCollapsed', ['REQ-0013']), { collapsed: { 'ITEM-0001': true } }, false)).toEqual({ kind: 'applied', splices: [], viewOptions: { collapsed: { 'ITEM-0001': true, 'REQ-0013': true } } });
  });

  it('writes a list whole when its block lacks a member, creating the registration', () => {
    const outcome = applied(type.edit({ ...numbered, registration: undefined }, operation('recolourTag', ['tag/search'], { colour: 'red' }), {}, false));
    expect(outcome.splices).toEqual([]);
    expect(outcome.history).toBeUndefined();
    const tags = ['customer', 'search', 'performance', 'payment', 'mail', 'core', 'security', 'legal', 'privacy'];
    expect(outcome.registration).toBe(`etalii/hierarchical-requirement${nl}tags:${nl}${tags.map((tag) => `  ${tag}: ${tag === 'search' ? 'red' : 'default'}${nl}`).join('')}`);
  });

  it('renames a tag in the body and in the registration, in one outcome', () => {
    const outcome = applied(type.edit(numbered, operation('renameTag', ['tag/security'], { name: 'safety' }), {}, false));
    expect(spliced(numberedText, outcome.splices)).toBe(numberedText.replaceAll('#security', '#safety'));
    expect(outcome.registration).toBe(registration.replace('  security: red', '  safety: red'));
    expect(outcome.history).toBeUndefined();
  });

  it('resolves an assessment by one character', () => {
    const outcome = applied(type.edit(numbered, operation('resolveAssessment', ['assessment/0']), {}, false));
    expect(outcome.splices).toEqual([{ offset: encode(numberedText.slice(0, numberedText.lastIndexOf('- [ ] Question') + 3)).length, length: 1, text: 'x' }]);
  });

  it('asks before deleting an item that holds anything', () => {
    expect(type.edit(numbered, operation('deleteEntry', ['ITEM-0003']), {}, false)).toMatchObject({ kind: 'confirm' });
    expect(after(numbered, operation('deleteEntry', ['ITEM-0003']))).not.toContain('ITEM-0003 Guest checkout');
  });
});

describe('a gesture of the frame', () => {
  it('drops an item at the top level, after the last one', () => {
    const outcome = applied(type.edit(numbered, { kind: 'drop', entry: 'Item' }, {}, false));
    expect(outcome).toMatchObject({ select: 'ITEM-0008', editLabel: true });
    const written = spliced(numberedText, outcome.splices);
    expect(written).toContain('<!-- last: ITEM-0008 REQ-0013 -->');
    expect(written).toContain(`- ITEM-0008 New item${nl}${nl}## Assessments`);
  });

  it('drops a requirement into an item after a sibling there, as one edit', () => {
    const written = after(numbered, { kind: 'drop', entry: 'Requirement', parent: 'ITEM-0004', after: 'REQ-0006' });
    expect(written).toContain(`Activity is any request the customer makes. See [REQ-0007] for signing in.${nl}  - REQ-0014 New requirement${nl}  - REQ-0007`);
    expect(written).toContain('<!-- last: ITEM-0007 REQ-0014 -->');
  });

  it('refuses a requirement dropped outside an item, and what it does not offer', () => {
    expect(refusal(type.edit(numbered, { kind: 'drop', entry: 'Requirement' }, {}, false))).toBe('This is added inside a level: drop it onto one.');
    expect(refusal(type.edit(numbered, { kind: 'drop', entry: 'Assessment', parent: 'ITEM-0001' }, {}, false))).toBe('This is not possible here.');
    expect(refusal(type.edit(numbered, { kind: 'drop', entry: 'Item', parent: 'ITEM-0099' }, {}, false))).toBe('That entry is no longer in this file.');
  });

  it('shows a requirement in ADP Properties, each row an operation changes edited', () => {
    expect(type.fields(numbered, ['REQ-0001'])).toEqual([
      { id: 'id', label: 'Id', group: '', control: 'text', value: 'REQ-0001', readOnly: 'An id is given by the document, and is not changed here.' },
      { id: 'title', label: 'Title', group: '', control: 'text', value: 'A customer finds a product by its name or its description.' },
      { id: 'description', label: 'Description', group: '', control: 'multiline', value: '' },
      { id: 'tags', label: 'Tags', group: '', control: 'tags', value: 'search', options: ['customer', 'search', 'performance', 'payment', 'mail', 'core', 'security', 'legal', 'privacy'] },
      { id: 'category', label: 'Category', group: '', control: 'choice', value: 'functional', options: ['', 'functional', 'non-functional', 'technical'] },
      { id: 'state', label: 'State', group: '', control: 'choice', value: 'accepted', options: ['', 'proposed', 'accepted', 'rejected', 'done'] },
    ]);
    expect(type.fields(numbered, ['ITEM-0001']).map((field) => field.id)).toEqual(['id', 'title', 'description', 'tags']);
    expect(type.fields(numbered, ['tag/mail'])).toEqual([]);
  });

  it('sets a row of ADP Properties through the operation that changes it', () => {
    const line = 'REQ-0001 A customer finds a product by its name or its description. #search category:functional state:accepted';
    expect(after(numbered, { kind: 'setField', id: 'REQ-0001', field: 'state', value: 'Done' })).toBe(numberedText.replace(line, line.replace('state:accepted', 'state:done')));
    expect(after(numbered, { kind: 'setField', id: 'REQ-0001', field: 'category', value: '' })).toBe(numberedText.replace(line, line.replace(' category:functional', '')));
    expect(after(numbered, { kind: 'setField', id: 'REQ-0001', field: 'title', value: 'Search works.' })).toBe(numberedText.replace(line, line.replace('A customer finds a product by its name or its description.', 'Search works.')));
    // Several values: what is gone removed and what is new added, as one step; a new tag goes to the list too.
    const outcome = applied(type.edit(numbered, { kind: 'setField', id: 'REQ-0001', field: 'tags', value: 'mail, brand-new' }, {}, false));
    expect(spliced(numberedText, outcome.splices)).toBe(numberedText.replace(line, line.replace('#search', '#mail #brand-new')));
    expect(outcome.registration).toBe(registration.replace(`  privacy: pink${nl}`, `  privacy: pink${nl}  brand-new: default${nl}`));
    expect(refusal(type.edit(numbered, { kind: 'setField', id: 'REQ-0001', field: 'state', value: 'parked' }, {}, false))).toBe("'parked' is not one of proposed, accepted, rejected, done.");
    expect(refusal(type.edit(numbered, { kind: 'setField', id: 'REQ-0001', field: 'id', value: 'REQ-0100' }, {}, false))).toBe('An id is given by the document, and is not changed here.');
    expect(type.edit(numbered, { kind: 'setField', id: 'REQ-0001', field: 'tags', value: 'SEARCH' }, {}, false)).toEqual({ kind: 'applied', splices: [] });
  });

  it('renumbers a later holder of a number, with the mark, and numbers a placeholder', () => {
    const doubled = { ...numbered, text: numberedText.replace('REQ-0007 Customers', 'REQ-0006 Customers') };
    const later = type.view(doubled, {}).roots[1].entries[1];
    expect(later).toMatchObject({ id: 'requirement@49', renumber: true, ephemeral: true });
    const outcome = applied(type.edit(doubled, { kind: 'renumber', id: later.id }, {}, false));
    expect(outcome.select).toBe('REQ-0014');
    expect(spliced(doubled.text, outcome.splices)).toBe(doubled.text.replace('REQ-0013 -->', 'REQ-0014 -->').replace('REQ-0006 Customers', 'REQ-0014 Customers'));
    expect(spliced(text, applied(type.edit(source, { kind: 'renumber', id: 'REQ-0013' }, {}, false)).splices)).toBe(numberedText);
    expect(refusal(type.edit(numbered, { kind: 'renumber', id: 'REQ-0001' }, {}, false))).toBe('Only an entry whose id another holds before it, or that has none yet, is given a new one.');
  });
});

describe('a requirement document this host does not change', () => {
  it('is one of a later DED, opened read-only with standalone\'s reason', () => {
    const later = { ...numbered, text: numberedText.replace('<!-- ded: 0.2 ', '<!-- ded: 0.3 ') };
    const reason = 'This document is written in DED 0.3, and this application reads DED 0.2 and earlier. It is left exactly as it is and cannot be changed here.';
    const view = type.view(later, {});
    expect(view).toMatchObject({ readOnly: true, notice: reason });
    expect(view.roots).toHaveLength(3);
    expect(view.roots[0].gestures.rename).toMatchObject({ enabled: false, reason });
    expect(refusal(type.edit(later, operation('setTitle', ['REQ-0001'], { title: 'x' }), {}, false))).toBe(reason);
    expect(type.toolbox(later)).toEqual([]);
    expect(type.fields(later, ['REQ-0001']).every((field) => field.readOnly === reason || field.id === 'id')).toBe(true);
  });

  it('has a registration of another designer type, which is reported, not read and not written', () => {
    const foreign = { ...numbered, registration: registration.replace('etalii/hierarchical-requirement', 'etalii/knowledge') };
    expect(type.findings(foreign)).toEqual([{
      rule: 'ded.designer', severity: 'warning', line: 0,
      message: 'The registration beside this document is of `etalii/knowledge`, and its envelope names `etalii/hierarchical-requirement`: the envelope decides, and nothing is read from or kept in the registration.',
    }]);
    expect(nodeOf(foreign, 'ITEM-0003')!.collapsed).toBe(false);
    expect(refusal(type.edit(foreign, operation('toggleCollapsed', ['REQ-0001']), {}, false))).toBe('The registration beside this document is of another designer type, so nothing is kept in it.');
  });
});
