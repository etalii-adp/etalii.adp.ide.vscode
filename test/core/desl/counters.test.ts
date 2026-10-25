import { describe, expect, it } from 'vitest';
import { counterRules, countedId, highestOf, markSets, nextCounted, numbered, numberOf, renumbering, type CounterRule } from '../../../src/core/desl/counters';
import { loadDesigner } from '../../../src/core/desl/specification';
import type { Model, Value } from '../../../src/core/disl/model';
import { hierarchySpecification, interpreted, minimalSpecification, object, readHierarchy, webShop, type Json } from './support';

// Counted ids (DESL 5.3.5): a prefix and a number counted up per document, the last one kept in a
// mark of the document. Read of the Hierarchical Requirement Designer's definition and its web-shop
// example, whose mark is REQ-0012 while its highest requirement is REQ-0010, and which holds one
// REQ-NEW; and run on DESL's smallest example with its books counted.

const specification = hierarchySpecification();
const designer = loadDesigner(specification).value;
const rules = counterRules(designer.persistence);
const declared = Object.entries(object(object(object(specification.persistence).ids).types)).filter(([, rule]) => object(rule).strategy === 'counter');
const requirement = (): CounterRule => rules.find((rule) => rule.placeholder !== undefined && rule.prefix.startsWith('R'))!;

const lineOf = (text: string, needle: string): number => text.split('\n').findIndex((line) => line.includes(needle)) + 1;
const model = (ids: readonly string[], diagram: Readonly<Record<string, Value>> = {}): Model => ({
  diagram, relations: [], elements: ids.map((id, line) => ({ id, type: 'T', attributes: {}, host: {}, ephemeral: false, line })),
});

describe('the counter rules', () => {
  it('are one for each type the definition counts, with its prefix, digits, mark and placeholder', () => {
    expect(rules.map((rule) => rule.type)).toEqual(declared.map(([type]) => type));
    for (const [type, written] of declared) {
      const rule = object(written as Json);
      expect(rules.find((candidate) => candidate.type === type)).toEqual({ type, prefix: rule.prefix, digits: rule.digits ?? 1, mark: rule.mark, placeholder: rule.placeholder });
    }
  });
});

describe('the number of an id', () => {
  const rule: CounterRule = { type: 'T', prefix: 'REQ-', digits: 4, mark: 'last' };

  it('is the integer of its digits when the id is the prefix followed by digits only', () => {
    expect(numberOf(rule, 'REQ-0012')).toBe(12);
    expect(numberOf(rule, 'REQ-12')).toBe(12);
    expect(numberOf(rule, 'REQ-NEW')).toBeUndefined();
    expect(numberOf(rule, 'REQ-12a')).toBeUndefined();
    expect(numberOf(rule, 'REQ-')).toBeUndefined();
    expect(numberOf(rule, 'ITEM-0001')).toBeUndefined();
    expect(numberOf(rule, undefined)).toBeUndefined();
  });

  it('gives a new id padded to the digits, and with more where the number needs more', () => {
    expect(countedId(rule, 13)).toBe('REQ-0013');
    expect(countedId(rule, 12345)).toBe('REQ-12345');
  });

  it('counts on from the higher of the mark and every number in the document', () => {
    expect(nextCounted(rule, model(['REQ-0003', 'REQ-0010'], { last: 'REQ-0012' }))).toBe('REQ-0013');
    expect(nextCounted(rule, model(['REQ-0003', 'REQ-0020'], { last: 'REQ-0012' }))).toBe('REQ-0021');
    // A hand-written number is accepted, and the count goes past it.
    expect(nextCounted(rule, model(['REQ-77']))).toBe('REQ-0078');
  });

  it('reads a missing mark, or one without a number, as no mark', () => {
    expect(nextCounted(rule, model(['REQ-0004']))).toBe('REQ-0005');
    expect(nextCounted(rule, model(['REQ-0004'], { last: 'none' }))).toBe('REQ-0005');
    expect(nextCounted(rule, model([]))).toBe('REQ-0001');
  });

  it('counts past the ids already given in the transaction', () => {
    expect(highestOf(rule, model(['REQ-0001']), ['REQ-0002', 'REQ-0003'])).toBe(3);
    expect(nextCounted(rule, model(['REQ-0001']), ['REQ-0002'])).toBe('REQ-0003');
  });
});

describe('the marks', () => {
  const rule: CounterRule = { type: 'T', prefix: 'REQ-', digits: 4, mark: 'last' };

  it('are set to the last id given, once for each rule that gave one', () => {
    expect(markSets([rule], model([], { last: 'REQ-0012' }), ['REQ-0013', 'REQ-0014'])).toEqual([{ kind: 'set', id: '', attributes: { last: 'REQ-0014' } }]);
    expect(markSets([rule], model([]), [])).toEqual([]);
    expect(markSets([rule], model([], { last: 'REQ-0014' }), ['REQ-0014'])).toEqual([]);
  });

  it('go with a new id given to elements in the order asked, of their own rule', () => {
    const rule2: CounterRule = { type: 'U', prefix: 'U', digits: 1, mark: 'lastU' };
    const both: Model = { ...model(['REQ-0001', 'x']), elements: [...model(['REQ-0001']).elements, { id: 'x', type: 'U', attributes: {}, host: {}, ephemeral: true, line: 2 }, { id: 'y', type: 'V', attributes: {}, host: {}, ephemeral: true, line: 3 }] };
    expect(renumbering(both, ['REQ-0001', 'x', 'y'], [rule, rule2])).toEqual({
      renamed: [{ id: 'REQ-0001', newId: 'REQ-0002' }, { id: 'x', newId: 'U1' }],
      marks: [{ kind: 'set', id: '', attributes: { last: 'REQ-0002' } }, { kind: 'set', id: '', attributes: { lastU: 'U1' } }],
    });
  });
});

describe('a document read with its placeholders', () => {
  it('numbers a placeholder in memory after the mark, ephemeral, and reports it by std.missingId', () => {
    const read = numbered(readHierarchy(webShop()), rules);
    const placeholder = `${requirement().prefix}${requirement().placeholder!}`;
    const next = countedId(requirement(), Math.max(numberOf(requirement(), read.model.diagram[requirement().mark]) ?? 0, 10) + 1);
    expect(read.unnumbered).toEqual([{ id: placeholder, newId: next, type: requirement().type, line: lineOf(webShop(), `+ ${placeholder}`) }]);
    const element = read.model.elements.find((candidate) => candidate.id === next)!;
    expect(element).toMatchObject({ ephemeral: true, parent: 'ITEM-0003', line: lineOf(webShop(), `+ ${placeholder}`) });
    expect(read.model.elements.some((candidate) => candidate.id === placeholder)).toBe(false);
    expect(read.findings.map((found) => [found.code, found.severity, found.message, found.location.line, found.element])).toEqual([
      ['std.missingId', 'warning', `${next} is numbered when the document is next changed: the file holds ${placeholder}.`, lineOf(webShop(), `+ ${placeholder}`), next],
    ]);
  });

  it('numbers several placeholders in reading order, and what lies in one follows it', () => {
    const text = webShop()
      .replace('- ITEM-0006 Data', '- ITEM-NEW Data')
      .replace('- REQ-0010 Personal data', '- REQ-NEW Personal data');
    const read = numbered(readHierarchy(text), rules);
    expect(read.unnumbered.map((done) => [done.newId, done.line])).toEqual([
      ['REQ-0013', lineOf(text, 'REQ-NEW A guest')],
      ['ITEM-0008', lineOf(text, 'ITEM-NEW Data')],
      ['REQ-0014', lineOf(text, 'REQ-NEW Personal data')],
    ]);
    const parents = (id: string): string | undefined => read.model.elements.find((element) => element.id === id)?.parent;
    expect(parents('REQ-0009')).toBe('ITEM-0008');
    expect(parents('REQ-0014')).toBe('ITEM-0008');
    // The library's duplicate at the later placeholder is a missing id to DESL.
    expect(read.findings.map((found) => `${found.code}@${found.location.line}`)).toEqual([
      `std.missingId@${lineOf(text, 'REQ-NEW A guest')}`, `std.missingId@${lineOf(text, 'ITEM-NEW Data')}`, `std.missingId@${lineOf(text, 'REQ-NEW Personal data')}`,
    ]);
  });

  it('keeps a later holder of a duplicated number under the id of its place, ephemeral, with std.duplicateId', () => {
    const text = webShop().replace('- REQ-0007 Customers sign in', '- REQ-0006 Customers sign in');
    const read = numbered(readHierarchy(text), rules);
    const duplicate = read.findings.find((found) => found.code === 'std.duplicateId')!;
    expect(duplicate).toMatchObject({ location: { line: lineOf(text, 'REQ-0006 Customers') }, detail: { id: 'REQ-0006', count: 2 } });
    expect(read.model.elements.find((element) => element.id === duplicate.element)).toMatchObject({ ephemeral: true, type: requirement().type });
    expect(read.unnumbered.map((done) => done.newId)).toEqual(['REQ-0013']);
  });

  it('gives back what has no counted type as it was read', () => {
    const read = readHierarchy(webShop());
    expect(numbered(read, []).model).toBe(read.value);
  });
});

describe('a transaction that makes counted elements (DESL 5.3.5)', () => {
  // DESL's smallest example, with its books counted and their mark on the document.
  const minimal = minimalSpecification();
  const metamodel = object(minimal.metamodel);
  const persistence = object(minimal.persistence);
  const counted = {
    ...minimal,
    metamodel: { ...metamodel, document: { attributes: { lastBook: { type: 'string' } } } },
    persistence: { ...persistence, ids: { ...object(persistence.ids), types: { ...object(object(persistence.ids).types), Book: { strategy: 'counter', prefix: 'B-', digits: 3, mark: 'lastBook' } } } },
    operations: {
      ...object(minimal.operations),
      addTwo: { label: 'Two', for: 'document', actions: [{ create: { type: "'Book'" } }, { create: { type: "'Book'" } }] },
    },
  };
  const parts = interpreted(counted);
  const books: Model = {
    diagram: { lastBook: 'B-009' }, relations: [],
    elements: ['B-001', 'B-007'].map((id, line) => ({ id, type: 'Book', attributes: {}, host: {}, ephemeral: false, line: line + 1 })),
  };

  it('is read with nothing found', () => {
    expect(parts.findings).toEqual([]);
  });

  it('gives a new element the next number, and sets the mark in the same transaction', () => {
    const outcome = parts.operations.run(books, 'addBook', []);
    if (outcome.refused !== undefined) throw new Error(outcome.refused);
    expect(outcome.created).toEqual(['B-010']);
    expect(outcome.changes).toEqual([
      { kind: 'add', id: 'B-010', type: 'Book', attributes: {} },
      { kind: 'set', id: '', attributes: { lastBook: 'B-010' } },
    ]);
    expect(outcome.after.diagram.lastBook).toBe('B-010');
  });

  it('numbers what it makes in the order it makes it, and sets the mark once', () => {
    const outcome = parts.operations.run({ ...books, diagram: {} }, 'addTwo', []);
    if (outcome.refused !== undefined) throw new Error(outcome.refused);
    expect(outcome.created).toEqual(['B-008', 'B-009']);
    expect(outcome.changes.filter((change) => change.kind === 'set')).toEqual([{ kind: 'set', id: '', attributes: { lastBook: 'B-009' } }]);
  });
});
