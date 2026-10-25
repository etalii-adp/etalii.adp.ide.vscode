import { describe, expect, it } from 'vitest';
import { checkMentions, interpretMentions, mentionsIn, mentionTemplate, segmentsOf, type MentionFacet } from '../../../src/core/desl/mentions';
import { loadDesigner } from '../../../src/core/desl/specification';
import { interpretMetamodel, type Metamodel } from '../../../src/core/disl/metamodel';
import type { Model, ModelElement } from '../../../src/core/disl/model';
import type { Specification } from '../../../src/core/disl/specification';
import { BoundedRegex } from '../../../src/core/fbl/expressions/regexMatcher';
import { hierarchySpecification, object, readHierarchy, webShop, type Json } from './support';

// Mentions (DESL 4.3, 6.5): the text of an attribute names elements by id where a match of its
// pattern has the group `id`. Read of the Hierarchical Requirement Designer's definition, whose
// descriptions, notes and `about` mention items and requirements, and of its web-shop example.

const specification = hierarchySpecification();
const designer = loadDesigner(specification).value;
const metamodel = interpretMetamodel(designer.interpreted).value;
const mentions = interpretMentions(metamodel);
const types = object(object(specification.metamodel).types);

/** The attributes of the definition that have mentions, as `Type.attribute`. */
const declared = Object.entries(types).flatMap(([type, written]) => Object.entries(object(object(written).attributes)).filter(([, attribute]) => object(attribute).mentions !== undefined).map(([name]) => `${type}.${name}`));
const facetOf = (where: string): MentionFacet => {
  const [type, attribute] = where.split('.');
  const facet = mentions.value.of(type, attribute);
  if (!facet) throw new Error(`${where} has no mentions`);
  return facet;
};

const modelOf = (text: string): Model => readHierarchy(text).value;

const title = (element: ModelElement): string | undefined => {
  const value = element.attributes[metamodel.types[element.type]?.labelAttribute ?? ''];
  return typeof value === 'string' ? value : undefined;
};

describe('the mentions of a metamodel', () => {
  it('are every facet the definition declares, each compiled with nothing found', () => {
    expect(declared.length).toBeGreaterThan(0);
    expect(mentions.findings).toEqual([]);
    expect(mentions.value.facets.map((facet) => `${facet.type}.${facet.attribute}`)).toEqual(declared);
  });

  const withFacet = (facet: Json, type = 'string'): Metamodel => {
    const changed = { ...designer.interpreted, metamodel: { ...designer.interpreted.metamodel, types: { ...designer.interpreted.metamodel.types, Note: { attributes: { body: { type, mentions: facet } } } } } };
    return interpretMetamodel(changed as unknown as Specification).value;
  };

  it.each([
    ['a pattern outside FBL\'s subset', { pattern: '(?<id>\w+)(?=x)', types: ['Note'] }, 'string', 'pattern'],
    ['a pattern without the group `id`', { pattern: '\[(?<name>\w+)\]', types: ['Note'] }, 'string', 'group'],
    ['a type the metamodel does not have', { pattern: '(?<id>\w+)', types: ['Page'] }, 'string', 'Page'],
    ['no type at all', { pattern: '(?<id>\w+)' }, 'string', 'no type'],
    ['an attribute that is no text', { pattern: '(?<id>\w+)', types: ['Note'] }, 'int', 'no `string`'],
  ])('leave out and report a facet with %s (DESL 10.1, step 4)', (_what, facet, type, word) => {
    const found = interpretMentions(withFacet(facet, type));
    expect(found.value.of('Note', 'body')).toBeUndefined();
    expect(found.findings.map((finding) => finding.code)).toEqual(['desl.metamodel']);
    expect(found.findings[0].message).toContain(word);
  });
});

describe('the mentions of a text', () => {
  const description = facetOf(declared[0]);
  const about = facetOf(declared.find((where) => where.endsWith('.about'))!);

  it('are the matches in which the group `id` takes part, from left to right', () => {
    const text = 'See [REQ-0002](https://example.com), then [REQ-0003] and [ITEM-0001].';
    expect(mentionsIn(text, description)).toEqual([
      { id: 'REQ-0003', start: text.indexOf('[REQ-0003]'), end: text.indexOf('[REQ-0003]') + 10 },
      { id: 'ITEM-0001', start: text.indexOf('[ITEM-0001]'), end: text.indexOf('[ITEM-0001]') + 11 },
    ]);
    expect(mentionsIn('[REQ-0002](x)', description)).toEqual([]);
    expect(mentionsIn('', description)).toEqual([]);
  });

  it('of a whole value is the value, where the pattern is anchored', () => {
    expect(mentionsIn('REQ-0006', about)).toEqual([{ id: 'REQ-0006', start: 0, end: 8 }]);
    expect(mentionsIn('REQ 0006', about)).toEqual([]);
  });

  it('are written as the literal text around the group `id`', () => {
    expect(mentionTemplate(description.pattern)).toEqual({ before: '[', after: ']' });
    expect(mentionTemplate(about.pattern)).toEqual({ before: '', after: '' });
    expect(mentionTemplate('(?:x)|<<(?:(?<id>\d+))>>!')).toEqual({ before: '<<', after: '>>!' });
    expect(mentionTemplate('(?<name>x)')).toBeUndefined();
  });

  it('are drawn as the element they name with its title, and as broken where they name nothing', () => {
    const model = modelOf(webShop());
    const text = 'Sent when [REQ-0003] succeeds, not [REQ-0099].';
    expect(segmentsOf(text, description, model, metamodel, title)).toEqual([
      { text: 'Sent when ' },
      { text: '[REQ-0003]', mention: { id: 'REQ-0003', type: 'Requirement', title: 'A customer pays by card, iDEAL or PayPal.', broken: false } },
      { text: ' succeeds, not ' },
      { text: '[REQ-0099]', mention: { id: 'REQ-0099', broken: true } },
      { text: '.' },
    ]);
  });
});

describe('std.mentions', () => {
  it('finds nothing in the example, whose every mention names an entry', () => {
    expect(checkMentions(modelOf(webShop()), mentions.value, metamodel)).toEqual([]);
  });

  it('is one warning for each mention that names nothing, on the line of the element that holds it', () => {
    const text = webShop().replace('Sent when [REQ-0003] succeeds', 'Sent when [REQ-0099] succeeds').replace('Question REQ-0006:', 'Question REQ-0098:');
    const model = modelOf(text);
    const found = checkMentions(model, mentions.value, metamodel, 'web-shop.md');
    const lineOf = (needle: string): number => text.split('\n').findIndex((line) => line.includes(needle)) + 1;
    expect(found.map((finding) => [finding.code, finding.severity, finding.message, finding.location.line])).toEqual([
      ['std.mentions', 'warning', 'REQ-0099 names no item or requirement of this document.', lineOf('REQ-0004 An order')],
      ['std.mentions', 'warning', 'REQ-0098 names no item or requirement of this document.', lineOf('Question REQ-0098')],
    ]);
    expect(found[0].element).toBe('REQ-0004');
  });

  it('is raised for an element of a type the facet does not allow', () => {
    const model = modelOf(webShop());
    const assessment = model.elements.find((element) => element.type === 'Assessment')!;
    const naming: Model = { ...model, elements: model.elements.map((element) => (element.id === 'REQ-0006' ? { ...element, attributes: { ...element.attributes, description: `[${assessment.id}]` } } : element)) };
    const pattern = '\\[(?<id>\\S+?)\\]';
    const loose: MentionFacet = { ...facetOf(declared[1]), pattern, regex: new BoundedRegex(pattern) };
    expect(mentionsIn(`[${assessment.id}]`, loose)).toHaveLength(1);
    expect(checkMentions(naming, { facets: [loose], of: () => loose }, metamodel).map((finding) => finding.element)).toEqual(['REQ-0006']);
  });
});
