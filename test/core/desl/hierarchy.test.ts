import { describe, expect, it } from 'vitest';
import { completionsAt, completionsOf, filtered, gesturesOf, hierarchyOf, labelValues, lowerAscii, notesOf, parseQuery, queryText, sortKeysOf, unhiding, withImplicitMembers, wordAt } from '../../../src/core/desl/hierarchy';
import { derivedIds } from '../../../src/core/desl/settings';
import { loadDesigner } from '../../../src/core/desl/specification';
import { interpretSurface } from '../../../src/core/desl/surface';
import { interpretMetamodel } from '../../../src/core/disl/metamodel';
import type { Model } from '../../../src/core/disl/model';
import { hierarchySpecification, object, openHierarchy, webShop, type Json } from './support';

// The hierarchy surface (DESL 7.7) read of the Hierarchical Requirement Designer's definition, and
// what it asks of the model beside its layout, worked out on the web-shop example opened as the
// designer opens it: the tree of items and requirements, the implicit members of a label's list,
// what a filter's words leave and in which order, the words a filter field offers, the open
// assessments of each entry, and which operation each gesture runs.

const specification = hierarchySpecification();
const declared = object(specification.surface);
const open = openHierarchy();
const { surface, model } = open;
const { metamodel } = open.parts;

const read = (change: (written: Json) => Json) => {
  const loaded = loadDesigner({ ...specification, surface: change(declared) });
  return interpretSurface(loaded.value.surface, interpretMetamodel(loaded.value.interpreted).value);
};

describe('the hierarchy surface', () => {
  it('names the types and attributes that play each part, as the definition writes them', () => {
    const labels = object(declared.labels);
    expect(surface.kind).toBe('hierarchy');
    expect(surface.levels).toEqual(declared.levels);
    expect(surface.entries).toEqual(declared.entries);
    expect(surface.notes).toEqual(declared.notes);
    expect(surface.filters).toEqual(declared.filters);
    expect(surface.widths).toEqual(declared.widths);
    expect(surface.collapsed).toBe(declared.collapsed);
    expect(surface.ids).toBe(declared.ids ?? 'shown');
    expect(Object.keys(surface.labels)).toEqual(Object.keys(labels));
    for (const [name, written] of Object.entries(labels)) {
      const label = object(written);
      expect(surface.labels[name]).toMatchObject({ attribute: name, on: label.on, options: label.options, prefix: label.prefix ?? `${name}:` });
    }
    // A label holds several values where its attribute does on the types it is on.
    expect(Object.values(surface.labels).map((label) => label.many)).toEqual(Object.values(surface.labels).map((label) => metamodel.types[label.on[0]].attributes[label.attribute].many === true));
  });

  it('gives a label without a prefix its name and a colon, and shows ids unless it says otherwise', () => {
    const labels = object(declared.labels);
    const [first] = Object.keys(labels);
    const plain = read((written) => ({ ...written, ids: undefined, labels: { ...labels, [first]: { ...object(labels[first]), prefix: undefined } } }));
    expect(plain.findings).toEqual([]);
    expect(plain.value?.kind === 'hierarchy' && plain.value.labels[first].prefix).toBe(`${first}:`);
    expect(plain.value?.kind === 'hierarchy' && plain.value.ids).toBe('shown');
  });

  it.each([
    ['a levels type the metamodel does not have', (written: Json) => ({ ...written, levels: { ...object(written.levels), type: 'Chapter' } }), 'Chapter'],
    ['a title that is not a string', (written: Json) => ({ ...written, entries: { ...object(written.entries), title: 'collapsed' } }), 'collapsed'],
    ['entries the levels do not contain', (written: Json) => ({ ...written, entries: { ...object(written.entries), type: object(written.notes).type, title: 'text', description: 'detail' } }), 'do not contain'],
    ['a label on a type that does not have it', (written: Json) => ({ ...written, labels: { ...object(written.labels), category: { ...object(object(written.labels).category), on: [object(written.levels).type] } } }), 'category'],
    ['a note whose subject is no string', (written: Json) => ({ ...written, notes: { ...object(written.notes), about: 'resolved' } }), 'resolved'],
    ['a note kind that is no enumeration', (written: Json) => ({ ...written, notes: { ...object(written.notes), kind: 'text' } }), 'enumeration'],
    ['a width that is no whole number', (written: Json) => ({ ...written, widths: { ...object(written.widths), width: 'level' } }), 'int'],
    ['ids shown in another way', (written: Json) => ({ ...written, ids: 'faded' }), 'faded'],
  ])('is not read when it names %s (DESL 10.1, step 4)', (_what, change, word) => {
    const found = read(change);
    expect(found.value).toBeUndefined();
    expect(found.findings.map((finding) => finding.code)).toContain('desl.surface');
    expect(found.findings.map((finding) => finding.message).join(' ')).toContain(word);
  });
});

describe('the tree of a hierarchy', () => {
  const tree = hierarchyOf(model, surface);

  it('has the top levels, and of each level its entries and its levels, in document order', () => {
    expect(tree.roots.map((level) => level.id)).toEqual(['ITEM-0001', 'ITEM-0004', 'ITEM-0006']);
    expect(tree.entriesOf('ITEM-0001').map((entry) => entry.id)).toEqual(['REQ-0001', 'REQ-0002']);
    expect(tree.levelsOf('ITEM-0001').map((level) => level.id)).toEqual(['ITEM-0002']);
    expect(tree.entriesOf('ITEM-0003').map((entry) => entry.id)).toEqual(['REQ-0005', open.unnumbered[0].newId]);
    expect(tree.stray).toEqual([]);
    expect(tree.ancestorsOf('REQ-0005').map((level) => level.id)).toEqual(['ITEM-0003', 'ITEM-0002', 'ITEM-0001']);
    expect(tree.depthOf('ITEM-0003')).toBe(3);
  });

  it('holds an entry outside every level as stray', () => {
    const text = webShop().replace('- ITEM-0006 Data', '- REQ-0011 A stray requirement.\n- ITEM-0006 Data');
    expect(hierarchyOf(openHierarchy(text).model, surface).stray.map((entry) => entry.id)).toEqual(['REQ-0011']);
  });
});

describe('the implicit members of a list (DESL 7.7.2)', () => {
  const derive = derivedIds(open.parts.expressions, open.parts.designer.persistence);
  const tags = Object.values(surface.labels).find((label) => label.many)!;
  const memberNames = (on: Model): string[] => on.elements.filter((element) => element.type === tags.options.type).map((element) => String(element.attributes[tags.options.name]));

  it('are none where every value names a member', () => {
    expect([...open.implied]).toEqual([]);
  });

  it('are the values that name no member, ignoring case, after the members in the order they first appear, spelt as they first appear', () => {
    const text = webShop().replace('#search category:functional', '#Search #B2B category:functional').replace('#legal #privacy', '#legal #b2b #Gdpr');
    const opened = openHierarchy(text);
    expect(memberNames(opened.model)).toEqual(['customer', 'search', 'performance', 'payment', 'mail', 'core', 'security', 'legal', 'privacy', 'B2B', 'Gdpr']);
    expect([...opened.implied]).toEqual(['tag/b2b', 'tag/gdpr']);
    const made = opened.model.elements.find((element) => element.id === 'tag/b2b')!;
    // No colour is stored: it has the colour attribute's default.
    expect(made.attributes).toEqual({ [tags.options.name]: 'B2B' });
  });

  it('are all the values without a registration, after no stored member', () => {
    const bare = openHierarchy(webShop(), null);
    expect(memberNames(bare.model)).toEqual(['customer', 'search', 'performance', 'payment', 'mail', 'core', 'security', 'legal', 'privacy']);
    expect(bare.implied.size).toBe(9);
    // The model given back is the same when there is nothing to add.
    expect(withImplicitMembers(bare.model, surface, derive).model).toBe(bare.model);
  });
});

describe('a filter (DESL 7.7.3)', () => {
  const shown = (query: string): string[] => [...filtered(model, surface, query).shown].sort();
  const ordered = (query: string, level: string): string[] => filtered(model, surface, query).entriesOf(level).map((entry) => entry.id);

  it('reads its words by the longest prefix that fits', () => {
    expect(parseQuery('  #security  category:functional @Proposed item:back* sort:state other # ', surface)).toEqual([
      { text: '#security', kind: 'label', label: 'tags', value: 'security' },
      { text: 'category:functional', kind: 'label', label: 'category', value: 'functional' },
      { text: '@Proposed', kind: 'label', label: 'state', value: 'Proposed' },
      { text: 'item:back*', kind: 'level', label: '', value: 'back*' },
      { text: 'sort:state', kind: 'sort', label: '', value: 'state' },
      { text: 'other', kind: 'unknown', label: '', value: 'other' },
      { text: '#', kind: 'unknown', label: '', value: '#' },
    ]);
    expect(sortKeysOf(surface)).toEqual(['number', 'title', ...Object.keys(surface.labels)]);
  });

  it('shows everything without a word that narrows', () => {
    const all = filtered(model, surface, 'sort:title');
    expect(all.narrows).toBe(false);
    expect(all.count).toBe(all.total);
  });

  it('keeps an entry that holds a member each label names, ignoring case, with the levels above it', () => {
    expect(shown('#SECURITY')).toEqual(['ITEM-0004', 'REQ-0006', 'REQ-0007']);
    expect(shown('#security #legal')).toEqual(['ITEM-0004', 'ITEM-0006', 'REQ-0006', 'REQ-0007', 'REQ-0009', 'REQ-0010']);
    // Kinds combine: a security requirement that is proposed, of which the example has none.
    expect(shown('#security @proposed')).toEqual([]);
    expect(shown('category:technical')).toEqual(['ITEM-0004', 'ITEM-0005', 'REQ-0008']);
  });

  it('keeps the levels whose title matches an item word, with what is in them and above them', () => {
    expect(shown('item:back*')).toEqual(['ITEM-0004', 'ITEM-0005', 'REQ-0006', 'REQ-0007', 'REQ-0008']);
    expect(shown('item:GUEST?CHECKOUT')).toEqual(['ITEM-0001', 'ITEM-0002', 'ITEM-0003', 'REQ-0005', open.unnumbered[0].newId].sort());
    expect(shown('item:back* #security')).toEqual(['ITEM-0004', 'REQ-0006', 'REQ-0007']);
    expect(shown('item:nothing')).toEqual([]);
  });

  it('orders the entries of a level by the first sort word: by number, by title, by a member\'s place in its list, those without one last', () => {
    const renamed: Model = { ...model, elements: model.elements.map((element) => (element.id === 'REQ-0006' ? { ...element, attributes: { ...element.attributes, title: 'zebra crossing' } } : element)) };
    expect(filtered(renamed, surface, 'sort:TITLE').entriesOf('ITEM-0004').map((entry) => entry.id)).toEqual(['REQ-0007', 'REQ-0006']);
    expect(filtered(renamed, surface, 'sort:number sort:title').entriesOf('ITEM-0004').map((entry) => entry.id)).toEqual(['REQ-0006', 'REQ-0007']);
    expect(ordered('sort:state', 'ITEM-0002')).toEqual(['REQ-0003', 'REQ-0004']);
    expect(ordered('sort:state', 'ITEM-0003')).toEqual(['REQ-0005', open.unnumbered[0].newId]);
    expect(ordered('sort:category', 'ITEM-0003')).toEqual([open.unnumbered[0].newId, 'REQ-0005']);
    expect(ordered('', 'ITEM-0001')).toEqual(['REQ-0001', 'REQ-0002']);
  });

  it('applies each stored filter of the example', () => {
    for (const element of model.elements.filter((candidate) => candidate.type === surface.filters!.type)) {
      expect(filtered(model, surface, String(element.attributes[surface.filters!.query])).narrows).toBe(true);
    }
  });
});

describe('the words of a filter that hide a level or an entry', () => {
  const unhidden = (query: string, id: string): string => queryText(unhiding(model, surface, query, id));

  it('are the words of each label whose members an entry holds none of, the sort kept', () => {
    // REQ-0003 is functional and carries no tag: `#mail` hides it, `category:functional` does not.
    expect(unhidden('category:functional #mail sort:title', 'REQ-0003')).toBe('category:functional sort:title');
    // Of one label's words, one the entry holds keeps them all.
    expect(unhidden('#security #search @done', 'REQ-0001')).toBe('#security #search');
    expect(filtered(model, surface, unhidden('category:functional #mail sort:title', 'REQ-0003')).shown.has('REQ-0003')).toBe(true);
  });

  it('are the item words when it stands outside every level they select, and every label\'s words for a level', () => {
    expect(unhidden('item:storefront #security', 'REQ-0001')).toBe('item:storefront');
    expect(unhidden('item:back* #security sort:number', 'ITEM-0001')).toBe('sort:number');
    expect(unhidden('item:back* #security', 'ITEM-0005')).toBe('item:back*');
    expect(filtered(model, surface, 'item:back*').shown.has('ITEM-0005')).toBe(true);
  });

  it('are none when the query does not hide it, or the id names no level or entry', () => {
    expect(unhidden('#security  sort:title', 'REQ-0006')).toBe('#security sort:title');
    expect(unhidden('#security', 'nothing')).toBe('#security');
  });
});

describe('the completion of a filter word', () => {
  const words = (typed: string): string[] => completionsOf(typed, model, surface).map((completion) => completion.word);

  it('offers the prefixes for nothing typed', () => {
    expect(words('')).toEqual([...Object.values(surface.labels).map((label) => label.prefix), 'item:', 'sort:']);
  });

  it('offers the members of the list whose prefix the word starts with, ignoring case, and not the word typed in full', () => {
    expect(words('@')).toEqual(['@proposed', '@accepted', '@rejected', '@done']);
    expect(words('#P')).toEqual(['#performance', '#payment', '#privacy']);
    expect(words('#mail')).toEqual([]);
    expect(words('sort:')).toEqual(sortKeysOf(surface).map((key) => `sort:${key}`));
    expect(words('cat')).toEqual(['category:', 'category:functional', 'category:non-functional', 'category:technical']);
  });

  it('offers at every caret in a filter for what of its word stands before the caret, anywhere in the filter', () => {
    expect(wordAt('#a @pr x', 6)).toEqual({ start: 3, end: 6, typed: '@pr' });
    expect(wordAt('#a @pr x', 3)).toEqual({ start: 3, end: 6, typed: '' });
    const at = (text: string): Record<string, string[]> => Object.fromEntries(Object.entries(completionsAt(text, model, surface)).map(([typed, found]) => [typed, found.map((completion) => completion.word)]));
    const offered = at('@pr #se');
    expect(Object.keys(offered)).toEqual(['', '@', '@p', '@pr', '#', '#s', '#se']);
    expect(offered['@pr']).toEqual(['@proposed']);
    expect(offered['#se']).toEqual(words('#se'));
    expect(offered['']).toEqual(words(''));
    // A part nothing completes, here a word typed in full, is left out.
    expect(Object.keys(at('#mail'))).toEqual(['', '#', '#m', '#ma', '#mai']);
  });
});

describe('the notes of a level or an entry (DESL 7.7.1)', () => {
  const notes = notesOf(model, surface, metamodel, open.mentions);

  it('count the open notes about each, with the icon of the one kind, and the open ones inside a level', () => {
    expect(notes.get('REQ-0006')).toEqual({ open: 1, noteKinds: ['question'], within: 0, icon: 'mdi-help-circle-outline' });
    expect(notes.get('ITEM-0006')).toEqual({ open: 1, noteKinds: ['idea'], within: 0, icon: 'mdi-lightbulb-outline' });
    // The warning about the checkout is resolved; the remark about a requirement inside it is not.
    expect(notes.get('ITEM-0002')).toEqual({ open: 0, noteKinds: [], within: 1 });
    expect(notes.get('ITEM-0001')).toEqual({ open: 0, noteKinds: [], within: 1 });
    expect(notes.has('REQ-0001')).toBe(false);
  });

  it('give no icon of their own for several', () => {
    const text = webShop().replace('- Idea ITEM-0006: Move', '- Question ITEM-0006: Why?\n- Idea ITEM-0006: Move');
    const opened = openHierarchy(text);
    expect(notesOf(opened.model, surface, opened.parts.metamodel, opened.mentions).get('ITEM-0006')).toEqual({ open: 2, noteKinds: ['question', 'idea'], within: 0 });
  });
});

describe('the gestures of a hierarchy (DESL 8.1)', () => {
  const gestures = gesturesOf(surface, metamodel, open.parts.operations.all, open.parts.designer.operations);
  const operationOf = (type: string, gesture: string): string | undefined => (gestures.on[type] as Readonly<Record<string, { readonly operation: string }>> | undefined)?.[gesture]?.operation;

  it('find the operation that adds each kind of element, by what its actions make', () => {
    expect(Object.fromEntries(Object.entries(gestures.adds).map(([type, found]) => [type, found.operation]))).toEqual({
      Item: 'addTopItem', Category: 'addCategory', State: 'addState', Filter: 'storeFilter', Column: 'addColumnWidth',
    });
    expect(gestures.adds.Column.params).toEqual({ level: 'level', width: 'width' });
  });

  it('find what each gesture on a level and an entry runs', () => {
    expect(operationOf('Item', 'addLevel')).toBe('addItem');
    expect(operationOf('Item', 'addLevelBelow')).toBe('addItemBelow');
    expect(operationOf('Item', 'addEntry')).toBe('addRequirement');
    expect(operationOf('Requirement', 'addEntryBelow')).toBe('addRequirementBelow');
    for (const type of ['Item', 'Requirement']) {
      expect(operationOf(type, 'rename')).toBe('setTitle');
      expect(operationOf(type, 'describe')).toBe('setDescription');
      expect(operationOf(type, 'fold')).toBe('toggleCollapsed');
      expect(operationOf(type, 'remove')).toBe('deleteEntry');
      expect(operationOf(type, 'addNote')).toBe('addAssessment');
    }
    expect(gestures.on.Item.move).toEqual({ operation: 'moveItem', params: { into: 'item', after: 'after' } });
    expect(gestures.on.Requirement.move).toEqual({ operation: 'moveRequirement', params: { into: 'item', after: 'after' } });
    expect(gestures.on.Item.rename?.params).toEqual({ title: 'title' });
  });

  it('find what each gesture on a member of a list, a note, a filter and a width runs', () => {
    for (const [type, word] of [['Tag', 'Tag'], ['Category', 'Category'], ['State', 'State']]) {
      expect([operationOf(type, 'rename'), operationOf(type, 'recolour'), operationOf(type, 'move'), operationOf(type, 'remove')]).toEqual([`rename${word}`, `recolour${word}`, `move${word}`, `delete${word}`]);
    }
    expect([operationOf('Assessment', 'change'), operationOf('Assessment', 'resolve'), operationOf('Assessment', 'remove')]).toEqual(['changeAssessment', 'resolveAssessment', 'removeAssessment']);
    expect([operationOf('Filter', 'rename'), operationOf('Filter', 'remove')]).toEqual(['renameFilter', 'removeFilter']);
    expect([operationOf('Column', 'resize'), operationOf('Column', 'remove')]).toEqual(['setColumnWidth', 'resetColumnWidth']);
  });

  it('find what adds, removes, sets and clears each label', () => {
    expect(gestures.labels).toEqual({
      tags: { add: { operation: 'addTag', params: { value: 'name' } }, remove: { operation: 'removeTag', params: { value: 'name' } } },
      category: { set: { operation: 'setCategory', params: { member: 'category' } }, clear: { operation: 'clearCategory', params: {} } },
      state: { set: { operation: 'setState', params: { member: 'state' } }, clear: { operation: 'clearState', params: {} } },
    });
  });

  it('leave an operation that fits no gesture to the menu', () => {
    const found = new Set([...Object.values(gestures.adds), ...Object.values(gestures.on).flatMap((byGesture) => Object.values(byGesture)), ...Object.values(gestures.labels).flatMap((byGesture) => Object.values(byGesture))].map((gesture) => gesture.operation));
    expect(open.parts.operations.all.map((operation) => operation.id).filter((id) => !found.has(id))).toEqual([]);
  });
});

describe('the values of a label', () => {
  it('are one, several or none, and named ignoring the case of ASCII letters', () => {
    const element = model.elements.find((candidate) => candidate.id === 'REQ-0010')!;
    expect(labelValues(element, 'tags')).toEqual(['legal', 'privacy']);
    expect(labelValues(element, 'state')).toEqual([]);
    expect(labelValues(element, 'category')).toEqual(['non-functional']);
    expect(lowerAscii('Ärger ABC')).toBe('Ärger abc');
  });
});
