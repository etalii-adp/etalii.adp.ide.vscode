import { describe, expect, it } from 'vitest';
import { derivedIds, interpretSettings, readSetting, settingSteps, withSettings, writtenSetting, type Settings } from '../../../src/core/desl/settings';
import { expressionsOf, loadDesigner } from '../../../src/core/desl/specification';
import { applyChanges, type Change } from '../../../src/core/disl/behavior';
import { interpretMetamodel } from '../../../src/core/disl/metamodel';
import type { Model } from '../../../src/core/disl/model';
import { OpenRegistration } from '../../../src/core/fbl/registration/openRegistration';
import { encode } from '../../../src/core/fbl/text/utf8';
import { hierarchyMarkdown, hierarchySpecification, object, readHierarchy, webShop, webShopRegistration, type Json } from './support';

// Settings in the registration (DESL 5.5), read of the Hierarchical Requirement Designer's
// definition: lists of tags, categories, states, filters and column widths, and the collapsed state
// of items and requirements, from the web-shop example's registration or, without it, from the
// lists' initial members; and the changes of a transaction parted into the body's and the
// registration's, as the FBL library's `setting` changes.

const specification = hierarchySpecification();
const designer = loadDesigner(specification).value;
const metamodel = interpretMetamodel(designer.interpreted).value;
const binding = hierarchyMarkdown();
const declared = object(object(specification.persistence).settings);
const settings = interpretSettings(declared, metamodel, designer.persistence, [binding]);
const derive = derivedIds(expressionsOf(designer, metamodel), designer.persistence);
const registration = OpenRegistration.open(encode(webShopRegistration()), binding);
const listOf = (type: string) => settings.value.lists.find((list) => list.type === type)!;
const tagType = (): string => settings.value.lists[0].type;

/** The web-shop example with what its registration keeps, or without a registration. */
const opened = (withRegistration = true) => withSettings(readHierarchy(webShop()).value, withRegistration ? registration : undefined, settings.value, metamodel, derive);
const membersOf = (model: Model, type: string): [string, unknown, unknown][] => {
  const list = listOf(type);
  return model.elements.filter((element) => element.type === type).map((element) => [element.id, element.attributes[list.key], element.attributes[list.value]]);
};

describe('the settings of a definition', () => {
  it('are a list or a state for each block the definition names, with nothing found', () => {
    expect(settings.findings).toEqual([]);
    const lists = Object.entries(declared).filter(([, setting]) => object(setting).type !== undefined).map(([block]) => block);
    const states = Object.entries(declared).filter(([, setting]) => object(setting).attribute !== undefined).map(([block]) => block);
    expect(settings.value.lists.map((list) => list.block)).toEqual(lists);
    expect(settings.value.states.map((state) => state.block)).toEqual(states);
    for (const list of settings.value.lists) {
      const written = object(declared[list.block]);
      expect(list).toEqual({ block: list.block, type: written.type, key: written.key, value: written.value, initial: written.initial ?? [] });
    }
  });

  const problems = (setting: Json, name = 'tags'): string[] => interpretSettings({ ...declared, [name]: setting }, metamodel, designer.persistence, [binding]).findings.map((found) => found.message);

  it.each([
    ['a block no binding declares', { type: 'Tag', key: 'name', value: 'colour' }, 'shades', 'not every binding declares'],
    ['a type the metamodel does not have', { type: 'Label', key: 'name', value: 'colour' }, 'tags', 'Label'],
    ['an attribute the type does not have', { type: 'Tag', key: 'name', value: 'hue' }, 'tags', 'hue'],
    ['a type whose ids are not derived', { type: 'Requirement', key: 'title', value: 'state' }, 'tags', 'not derived'],
    ['a state of a type without the attribute', { attribute: 'collapsed', of: ['Item', 'Tag'] }, 'collapsed', 'Tag'],
    ['neither a list nor a state', { colour: 'red' }, 'tags', 'no list and no state'],
  ])('leave out and report %s (DESL 10.1, step 4)', (_what, setting, name, word) => {
    const found = problems(setting, name);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(word);
  });
});

describe('a value kept in a block', () => {
  const attributes = (type: string) => metamodel.types[type].attributes;

  it('is written as DESL 5.5 says, and read back', () => {
    const colour = attributes(tagType()).colour;
    expect(writtenSetting('blue', colour, metamodel)).toBe('blue');
    expect(writtenSetting(true, attributes('Item').collapsed, metamodel)).toBe('yes');
    expect(writtenSetting(false, attributes('Item').collapsed, metamodel)).toBe('no');
    expect(writtenSetting(240, attributes('Column').width, metamodel)).toBe('240');
    expect(readSetting('yes', attributes('Item').collapsed, metamodel)).toBe(true);
    expect(readSetting('no', attributes('Item').collapsed, metamodel)).toBe(false);
    expect(readSetting('maybe', attributes('Item').collapsed, metamodel)).toBeUndefined();
    expect(readSetting('240', attributes('Column').width, metamodel)).toBe(240);
    expect(readSetting('wide', attributes('Column').width, metamodel)).toBeUndefined();
    expect(readSetting('Blue', colour, metamodel)).toBe('blue');
    // An enumeration's stored form is read as its key.
    expect(readSetting('Question', attributes('Assessment').kind, metamodel)).toBe('question');
    expect(writtenSetting('question', attributes('Assessment').kind, metamodel)).toBe('Question');
  });
});

describe('a document read with its registration', () => {
  const { model, stored } = opened();

  it('has the members of each list the registration keeps, in its order, with their derived ids', () => {
    expect(membersOf(model, tagType()).slice(0, 3)).toEqual([['tag/customer', 'customer', 'blue'], ['tag/search', 'search', 'default'], ['tag/performance', 'performance', 'orange']]);
    expect(membersOf(model, 'Category')).toEqual([['category/functional', 'functional', 'blue'], ['category/non-functional', 'non-functional', 'purple'], ['category/technical', 'technical', 'brown']]);
    expect(membersOf(model, 'Filter')).toEqual([['filter/Open security', 'Open security', '#security @proposed sort:state'], ['filter/Backend', 'Backend', 'item:back* sort:number']]);
    // The members are the document's own, after the elements of the body.
    expect(model.elements.filter((element) => element.type === tagType()).every((element) => element.parent === undefined && !element.ephemeral)).toBe(true);
  });

  it('has the states the registration keeps on the elements their ids name', () => {
    expect(model.elements.filter((element) => element.attributes.collapsed === true).map((element) => element.id)).toEqual(['REQ-0002', 'ITEM-0003']);
  });

  it('knows which blocks the registration holds', () => {
    expect([...stored.keys()].sort()).toEqual(['categories', 'collapsed', 'filters', 'states', 'tags']);
  });

  it('has the initial members of each list, and no state, without a registration', () => {
    const bare = opened(false);
    expect(bare.stored.size).toBe(0);
    expect(membersOf(bare.model, 'Category').map(([, name, colour]) => [name, colour])).toEqual(object(declared.categories).initial ? (object(declared.categories).initial as Json[]).map((member) => [member.name, member.colour]) : []);
    expect(membersOf(bare.model, tagType())).toEqual([]);
    expect(bare.model.elements.some((element) => element.attributes.collapsed === true)).toBe(false);
  });
});

describe('the changes of a transaction', () => {
  const { model, stored } = opened();
  const steps = (changes: readonly Change[], on: Model = model, blocks = stored, from: Settings = settings.value) =>
    settingSteps(changes, on, applyChanges(on, changes), from, blocks, metamodel, binding.registration.blocks);

  it('are the body\'s when they touch no setting', () => {
    const change: Change = { kind: 'set', id: 'REQ-0001', attributes: { title: 'Search' } };
    expect(steps([change])).toEqual({ body: [change], registration: [], session: [], outsideHistory: false });
  });

  it('write the value of a member where it stands', () => {
    expect(steps([{ kind: 'set', id: 'tag/mail', attributes: { colour: 'red' } }]).registration).toEqual([{ kind: 'setting', block: 'tags', key: 'mail', value: 'red' }]);
  });

  it('rename a member\'s key where it stands, and add a new one after the last', () => {
    expect(steps([{ kind: 'set', id: 'tag/mail', attributes: { name: 'email' } }]).registration).toEqual([{ kind: 'setting', block: 'tags', key: 'mail', rename: 'email' }]);
    expect(steps([{ kind: 'add', id: 'tag/ux', type: tagType(), attributes: { name: 'ux' } }]).registration).toEqual([{ kind: 'setting', block: 'tags', key: 'ux', value: 'default', position: { after: 'privacy' } }]);
  });

  it('remove a member, and move one to its new place', () => {
    expect(steps([{ kind: 'remove', id: 'tag/core' }]).registration).toEqual([{ kind: 'setting', block: 'tags', key: 'core', remove: true }]);
    expect(steps([{ kind: 'move', id: 'tag/core', position: { before: 'tag/customer' } }]).registration).toEqual([{ kind: 'setting', block: 'tags', key: 'core', position: { index: 0 } }]);
    expect(steps([{ kind: 'move', id: 'tag/customer', position: { after: 'tag/search' } }]).registration).toEqual([{ kind: 'setting', block: 'tags', key: 'search', position: { index: 0 } }]);
  });

  it('write the whole list where its block is absent, the change with it', () => {
    const bare = opened(false);
    const written = steps([{ kind: 'set', id: 'category/technical', attributes: { colour: 'red' } }], bare.model, bare.stored).registration;
    expect(written).toEqual([
      { kind: 'setting', block: 'categories', key: 'functional', value: 'blue' },
      { kind: 'setting', block: 'categories', key: 'non-functional', value: 'purple', position: { after: 'functional' } },
      { kind: 'setting', block: 'categories', key: 'technical', value: 'red', position: { after: 'non-functional' } },
    ]);
  });

  it('write a member the block lacks with the change, in the list\'s order', () => {
    // An implicit member, as DESL 7.7.2 adds one: the block is written with it.
    const implicit: Model = { ...model, elements: [...model.elements, { id: 'tag/b2b', type: tagType(), attributes: { name: 'b2b', colour: 'default' }, host: {}, ephemeral: false, line: 0 }] };
    expect(steps([{ kind: 'set', id: 'tag/legal', attributes: { colour: 'red' } }], implicit).registration).toEqual([
      { kind: 'setting', block: 'tags', key: 'legal', value: 'red' },
      { kind: 'setting', block: 'tags', key: 'b2b', value: 'default', position: { after: 'privacy' } },
    ]);
  });

  it('keep a state that differs from its default by the element\'s id, outside the history', () => {
    const collapsed = steps([{ kind: 'set', id: 'REQ-0001', attributes: { collapsed: true } }]);
    expect(collapsed).toEqual({ body: [], registration: [{ kind: 'setting', block: 'collapsed', key: 'REQ-0001', value: 'yes' }], session: [], outsideHistory: true });
    expect(steps([{ kind: 'set', id: 'ITEM-0003', attributes: { collapsed: false } }]).registration).toEqual([{ kind: 'setting', block: 'collapsed', key: 'ITEM-0003', remove: true }]);
    expect(steps([{ kind: 'set', id: 'ITEM-0001', attributes: { collapsed: false } }]).registration).toEqual([]);
  });

  it('keep a state of an element whose id is ephemeral for the session only', () => {
    const ephemeral: Model = { ...model, elements: model.elements.map((element) => (element.id === 'REQ-0001' ? { ...element, ephemeral: true } : element)) };
    expect(steps([{ kind: 'set', id: 'REQ-0001', attributes: { collapsed: true } }], ephemeral)).toEqual({ body: [], registration: [], session: [{ id: 'REQ-0001', attribute: 'collapsed', value: true }], outsideHistory: false });
  });

  it('are parted where one transaction changes both', () => {
    const changes: Change[] = [
      { kind: 'set', id: 'REQ-0003', attributes: { title: 'Pay', collapsed: true } },
      { kind: 'set', id: 'tag/payment', attributes: { colour: 'blue' } },
    ];
    const parted = steps(changes);
    expect(parted.body).toEqual([{ kind: 'set', id: 'REQ-0003', attributes: { title: 'Pay' } }]);
    expect(parted.registration).toEqual([
      { kind: 'setting', block: 'tags', key: 'payment', value: 'blue' },
      { kind: 'setting', block: 'collapsed', key: 'REQ-0003', value: 'yes' },
    ]);
    expect(parted.outsideHistory).toBe(false);
  });

  it('are planned by the registration as the FBL library writes them', () => {
    const open = OpenRegistration.open(encode(webShopRegistration()), binding);
    for (const step of steps([{ kind: 'set', id: 'tag/mail', attributes: { name: 'email' } }, { kind: 'move', id: 'tag/core', position: { before: 'tag/customer' } }]).registration) {
      expect(open.change(step)).toHaveProperty('planned');
    }
    const text = new TextDecoder().decode(open.bytes);
    expect(text).toContain('tags:\r\n  core: default\r\n  customer: blue\r\n');
    expect(text).toContain('  email: yellow\r\n');
  });
});
