import { describe, expect, it } from 'vitest';
import type { Change, Outcome } from '../../../src/core/disl/behavior';
import type { Model, Value } from '../../../src/core/disl/model';
import { bindingAt, cities, interpreted, knowledgeSpecification, knowledgeYaml, minimalFolder, minimalSpecification, modelOf, object } from './support';

// The operations of a designer (etalii.adp spec 027, task T102; DESL 8 and 10.3): every operation
// the definition lists is read, and running one is one transaction, which gives the changes of the
// model in order or the sentence that refuses it. The operations are counted from the definition,
// and each is run once on the Cities example with a target and arguments this file gives it.

const specification = knowledgeSpecification();
const declared = object(specification.operations);
const parts = interpreted(specification);
const { operations } = parts;
const model = modelOf(parts, knowledgeYaml(), cities());

type Done = Exclude<Outcome, { readonly refused: string }>;
function done(outcome: Outcome): Done {
  if (outcome.refused !== undefined) throw new Error(`refused: ${outcome.refused}`);
  return outcome;
}
const run = (id: string, selection: readonly string[] = [], args: Readonly<Record<string, Value>> = {}, on: Model = model): Done => done(operations.run(on, id, selection, args));
const refusal = (id: string, selection: readonly string[] = [], args: Readonly<Record<string, Value>> = {}, on: Model = model): string | undefined => operations.run(on, id, selection, args).refused;
const added = (outcome: Done): Extract<Change, { kind: 'add' }>[] => outcome.changes.filter((change) => change.kind === 'add');
const sets = (outcome: Done): Extract<Change, { kind: 'set' }>[] => outcome.changes.filter((change) => change.kind === 'set');
const removed = (outcome: Done): string[] => outcome.changes.filter((change) => change.kind === 'remove').map((change) => change.id);
const elementOf = (on: Model, id: string) => on.elements.find((element) => element.id === id);

// A target and arguments for each operation of the definition, by its name: what a gesture of the surface would give it.
// `first` is what is done before it, where the example has nothing for it to act on.
interface Sample { readonly on?: readonly string[] | ((on: Model) => readonly string[]); readonly args?: Readonly<Record<string, Value>>; readonly first?: readonly (readonly [string, readonly string[], Readonly<Record<string, Value>>])[] }
const samples: Readonly<Record<string, Sample>> = {
  addProperty: { args: { name: 'Mayor', valueType: 'text' } },
  renameProperty: { on: ['p3'], args: { name: 'Inhabitants' } },
  changePropertyType: { on: ['p3'], args: { valueType: 'text' } },
  duplicateProperty: { on: ['p2'] },
  moveProperty: { on: ['p3'], args: { after: 'p5' } },
  deleteProperty: { on: ['p9'] },
  setTitleProperty: { on: ['p1'] },
  createRelation: { args: { name: 'Twin', targetFile: '.' } },
  setParentRelation: { on: (on) => on.elements.filter((element) => element.attributes.targetFile === '.').map((element) => element.id), first: [['createRelation', [], { name: 'Twin', targetFile: '.' }]] },
  addOption: { on: ['p2'], args: { name: 'Luxembourg', colour: 'green' } },
  renameOption: { on: ['o1'], args: { name: 'The Netherlands' } },
  recolourOption: { on: ['o1'], args: { colour: 'orange' } },
  moveOption: { on: ['o2'] },
  deleteOption: { on: ['o2'] },
  addRow: {},
  deleteRows: { on: ['r1', 'r2'] },
  moveRow: { on: ['r2'] },
  setText: { on: ['r2'], args: { property: 'p1', value: 'Antwerpen' } },
  setNumber: { on: ['r2'], args: { property: 'p3', value: 536079 } },
  setChecked: { on: ['r2'], args: { property: 'p6', value: true } },
  setDate: { on: ['r2'], args: { property: 'p7', value: '1291-02-21' } },
  setDateTime: { on: ['r2'], args: { property: 'p8', value: '2026-10-13T12:00:00+02:00' } },
  setTime: { on: ['r2'], args: { property: 'p9', value: '08:30' } },
  setOption: { on: ['r2'], args: { property: 'p2', value: 'o1' } },
  clearCell: { on: ['r1/p3'] },
  addItem: { on: ['r2'], args: { property: 'p4', option: 'o4' } },
  removeItem: { on: ['r1/p4/o4'] },
  addView: { args: { name: 'Board' } },
  renameView: { on: ['v2'], args: { name: 'Atlas' } },
  duplicateView: { on: ['v1'] },
  moveView: { on: ['v2'] },
  deleteView: { on: ['v1'] },
  switchView: { on: ['v2'] },
  setColumn: { on: ['v1'], args: { property: 'p3', visible: false } },
  moveColumn: { on: ['v1/columns/p1'], first: [['setColumn', ['v1'], { property: 'p1', width: 200 }]] },
  resetColumn: { on: ['v1/columns/p3'] },
  calculate: { on: ['v1'], args: { property: 'p3', calculation: 'sum' } },
  removeCalculation: { on: ['v1/columns/p3'], first: [['calculate', ['v1'], { property: 'p3', calculation: 'sum' }]] },
  freeze: { on: ['v1'], args: { property: 'p1' } },
  unfreeze: { on: ['v1'], first: [['freeze', ['v1'], { property: 'p1' }]] },
  addSort: { on: ['v1'], args: { property: 'p1' } },
  setSortDirection: { on: ['v1/sorts/p3'], args: { direction: 'ascending' } },
  moveSort: { on: ['v1/sorts/p1'], first: [['addSort', ['v1'], { property: 'p1' }]] },
  removeSort: { on: ['v1/sorts/p3'] },
  addCondition: { on: ['v1'], args: { property: 'p3', operator: 'greater-than', number: 500000 } },
  setCondition: { on: ['v1/filter/0'], args: { operator: 'is-not' } },
  removeCondition: { on: ['v1/filter/0'] },
  addFilterGroup: { on: ['v1'], args: { match: 'any' } },
  setMatch: { on: ['v1'], args: { match: 'any' } },
  groupBy: { on: ['v1'], args: { property: 'p6' } },
  ungroup: { on: ['v1'] },
  hideEmptyGroups: { on: ['v1'], args: { hide: true } },
  setGroup: { on: ['v1'], args: { slot: 'collapsed', key: 'o1' } },
  unsetGroup: { on: ['v1/groupOrder/o2'], first: [['setGroup', ['v1'], { slot: 'groupOrder', key: 'o2' }]] },
  moveGroup: { on: ['v1/groupOrder/o1'], first: [['setGroup', ['v1'], { slot: 'groupOrder', key: 'o2' }], ['setGroup', ['v1'], { slot: 'groupOrder', key: 'o1' }]] },
};

describe('the operations of a designer', () => {
  it('are those the definition lists, each with its label, what it is for and its parameters', () => {
    expect(operations.all.map((operation) => operation.id)).toEqual(Object.keys(declared));
    expect(operations.all).toHaveLength(55);
    for (const operation of operations.all) {
      const written = object(declared[operation.id]);
      expect(operation.label, operation.id).toBe(written.label);
      expect(operation.for, operation.id).toEqual(typeof written.for === 'string' ? [written.for] : written.for);
      expect(operation.params.map((param) => param.name), operation.id).toEqual(Object.keys(object(written.params)));
    }
  });

  it('give a parameter its type, whether it is required and its default', () => {
    const add = operations.all.find((operation) => operation.id === 'addProperty')!;
    expect(add.params).toEqual([
      { name: 'name', label: 'Name', type: 'string', required: true },
      { name: 'valueType', label: 'Value type', type: 'ValueType', required: true, default: 'text' },
      { name: 'after', label: 'After', type: 'Property', required: false },
    ]);
  });

  it('have a sample here for each of them', () => {
    expect(Object.keys(samples).sort()).toEqual(Object.keys(declared).sort());
  });

  it.each(Object.keys(declared))('%s is one transaction, which changes the model', (id) => {
    const sample = samples[id];
    const on = (sample.first ?? []).reduce((before, [operation, selection, args]) => run(operation, selection, args, before).after, model);
    // An operation on something that is already as it asks changes nothing: the title is the title.
    const outcome = run(id, typeof sample.on === 'function' ? sample.on(on) : sample.on ?? [], sample.args, on);
    if (id === 'setTitleProperty') expect(outcome.changes).toEqual([]);
    else expect(outcome.changes.length, 'the changes it makes').toBeGreaterThan(0);
    // The model after it holds every element once, and nothing the changes removed.
    const ids = outcome.after.elements.map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const gone of removed(outcome)) expect(ids).not.toContain(gone);
    for (const made of added(outcome)) expect(ids).toContain(made.id);
  });
});

describe('an operation', () => {
  it('is refused on what it is not for, and on nothing', () => {
    expect(refusal('renameProperty', ['r1'], { name: 'x' })).toBeDefined();
    expect(refusal('renameProperty', [], { name: 'x' })).toBeDefined();
    expect(refusal('noSuchOperation')).toBeDefined();
  });

  it('is unavailable with the definition\'s reason, and refused with it when it is run anyway', () => {
    const reason = 'The title property cannot be deleted.';
    expect(operations.availability(model, 'deleteProperty', ['p1'])).toMatchObject({ offered: true, available: false, reason });
    expect(refusal('deleteProperty', ['p1'])).toBe(reason);
    expect(operations.availability(model, 'deleteProperty', ['p3'])).toMatchObject({ offered: true, available: true });
    expect(refusal('changePropertyType', ['p1'], { valueType: 'number' })).toBe('The title property stays a text property.');
    expect(refusal('deleteView', ['v1'], {}, run('deleteView', ['v2']).after)).toBe('A table keeps at least one view.');
  });

  it('asks its question with the count the definition counts, and asks nothing below its threshold', () => {
    expect(operations.availability(model, 'deleteProperty', ['p3']).confirm?.message).toBe('Delete `Population` and its values in 2 rows?');
    expect(operations.availability(model, 'deleteOption', ['o3']).confirm?.message).toBe('3 rows use `Port`. Delete it and clear them?');
    const unused = run('addOption', ['p2'], { name: 'Luxembourg' });
    expect(operations.availability(unused.after, 'deleteOption', [added(unused)[0].id]).confirm).toBeUndefined();
  });

  it('is refused by a constraint that prevents, with the constraint\'s sentence (DESL 6.4)', () => {
    expect(refusal('renameProperty', ['p3'], { name: 'country' })).toBe('A property named `country` already exists.');
  });

  it('gives a new element the id its type\'s rule says: a new one, or the one derived from the model', () => {
    const property = added(run('addProperty', [], { name: 'Mayor', valueType: 'text' }))[0];
    expect(property).toMatchObject({ type: 'Property', attributes: { name: 'Mayor', valueType: 'text' } });
    expect(property.id).toMatch(/^[0-9a-z]{25}$/);
    expect(added(run('setNumber', ['r2'], { property: 'p3', value: 536079 }))).toEqual([
      { kind: 'add', id: 'r2/p3', type: 'Cell', parent: 'r2', slot: 'cells', attributes: { property: 'p3', number: 536079 } },
    ]);
    expect(added(run('addCondition', ['v1'], { property: 'p3', operator: 'greater-than', number: 500000 })).map((change) => [change.id, change.slot])).toEqual([['v1/filter/1', 'filter']]);
    expect(added(run('setGroup', ['v1'], { slot: 'collapsed', key: 'o1' })).map((change) => change.id)).toEqual(['v1/collapsed/o1']);
    // A cell that is made for its first item is the parent of that item, by the id it was given.
    expect(added(run('addItem', ['r2'], { property: 'p5', row: 'an' })).map((change) => [change.id, change.type, change.parent])).toEqual([
      ['r2/p5', 'Cell', 'r2'], ['r2/p5/an', 'CellItem', 'r2/p5'],
    ]);
  });

  it('gives a new name that is taken a number, as the definition computes it', () => {
    expect(added(run('addProperty', [], { name: 'Country', valueType: 'text' }))[0].attributes.name).toBe('Country 2');
  });

  it('fills in the default of a parameter that is not given', () => {
    expect(added(run('addProperty', [], { name: 'Mayor' }))[0].attributes.valueType).toBe('text');
    expect(added(run('addView'))[0].attributes.name).toBe('Table');
  });

  it('assigns nothing from a parameter or an attribute that holds no value, and stores no value that is its default', () => {
    // The copy of a view holds what the view holds: its condition has an option and no number, and nothing is at a default.
    const copy = added(run('duplicateView', ['v1']));
    expect(copy.map((change) => [change.type, change.attributes])).toEqual([
      ['View', { name: 'All cities copy', groupBy: 'p2' }],
      ['Column', { property: 'p3', width: 120 }],
      ['Sort', { property: 'p3', direction: 'descending' }],
      ['Condition', { property: 'p2', operator: 'is', option: 'o1' }],
    ]);
    // A column that is hidden keeps its width, which the gesture did not give.
    expect(sets(run('setColumn', ['v1'], { property: 'p3', visible: false }))).toEqual([{ kind: 'set', id: 'v1/columns/p3', attributes: { visible: false } }]);
    // And shown again, the value is the default, which is not stored.
    const hidden = run('setColumn', ['v1'], { property: 'p3', visible: false }).after;
    expect(sets(run('setColumn', ['v1'], { property: 'p3', visible: true }, hidden))).toEqual([{ kind: 'set', id: 'v1/columns/p3', attributes: { visible: null } }]);
    // A new property has no value for what it was not given.
    expect(added(run('addOption', ['p2'], { name: 'Luxembourg' }))[0].attributes).toEqual({ name: 'Luxembourg' });
  });

  it('places what it creates and what it reorders among its siblings', () => {
    expect(added(run('duplicateProperty', ['p2']))[0]).toMatchObject({ type: 'Property', position: { after: 'p2' }, attributes: { name: 'Country 2', valueType: 'selection' } });
    expect(run('moveProperty', ['p3'], { after: 'p5' }).changes).toEqual([{ kind: 'move', id: 'p3', position: { after: 'p5' } }]);
    expect(run('moveProperty', ['p3']).changes).toEqual([{ kind: 'move', id: 'p3', position: { before: 'p1' } }]);
    expect(run('moveOption', ['o2']).changes).toEqual([{ kind: 'move', id: 'o2', parent: 'p2', position: { before: 'o1' } }]);
    expect(run('moveProperty', ['p3'], { after: 'p5' }).after.elements.filter((element) => element.type === 'Property').map((element) => element.id))
      .toEqual(['p1', 'p2', 'p4', 'p5', 'p3', 'p6', 'p7', 'p8', 'p9']);
  });

  it('takes with an element what it contains, and unsets what refers to it (DESL 4.6, 4.7)', () => {
    const outcome = run('deleteRows', ['r2']);
    expect(removed(outcome)).toEqual(['r2/p1', 'r2/p2', 'r2/p4/o3', 'r2/p4', 'r2']);
    // A view that is deleted while it is the active one leaves the next as the active one, as the definition says.
    expect(sets(run('deleteView', ['v1']))).toEqual([{ kind: 'set', id: '', attributes: { activeView: 'v2' } }]);
    // An option that goes takes the values that name it: each is unset, and the option removed.
    const option = run('deleteOption', ['o2']);
    expect(sets(option)).toEqual([{ kind: 'set', id: 'r2/p2', attributes: { option: null } }]);
    expect(removed(option)).toEqual(['o2']);
  });
});

describe('a change of a column\'s value type', () => {
  const converted = (property: string, to: string, on: Model = model): Done => run('changePropertyType', [property], { valueType: to }, on);
  const cell = (outcome: Done, id: string) => elementOf(outcome.after, id)?.attributes;

  it('converts every value its conversion converts, in the same transaction (DESL 7.6)', () => {
    // written-form: a number becomes the text it is written as.
    const text = converted('p3', 'text');
    expect(text.changes).toEqual([
      { kind: 'set', id: 'p3', attributes: { valueType: 'text' } },
      { kind: 'set', id: 'r1/p3', attributes: { number: null, text: '931298' } },
      { kind: 'set', id: '45ako65f2m2wasyxq3mam8ikt/p3', attributes: { number: null, text: '345345' } },
    ]);
    // parse: and back, a text that reads as a number becomes that number.
    const back = converted('p3', 'number', text.after);
    expect(cell(back, 'r1/p3')).toEqual({ property: 'p3', number: 931298 });
  });

  it('keeps a value its conversion cannot convert, under its old key', () => {
    const number = converted('p2', 'text');
    const kept = converted('p2', 'number', number.after);
    expect(cell(kept, 'r1/p2')).toEqual({ property: 'p2', text: 'Netherlands' });
  });

  it('makes a selection of a text by the option of that name, and creates the option when there is none', () => {
    const names = converted('p2', 'text');
    expect(cell(names, 'r1/p2')).toEqual({ property: 'p2', text: 'Netherlands' });
    const renamed = run('setText', ['r2'], { property: 'p2', value: 'Flanders' }, names.after);
    const again = converted('p2', 'selection', renamed.after);
    expect(cell(again, 'r1/p2')).toEqual({ property: 'p2', option: 'o1' });
    const made = added(again).filter((change) => change.type === 'Option');
    expect(made.map((change) => [change.parent, change.attributes])).toEqual([['p2', { name: 'Flanders' }]]);
    expect(cell(again, 'r2/p2')).toEqual({ property: 'p2', option: made[0].id });
  });

  it('wraps one value as the only item, and unwraps the only item', () => {
    const several = converted('p2', 'multipleSelection');
    expect(cell(several, 'r1/p2')).toEqual({ property: 'p2' });
    expect(several.after.elements.filter((element) => element.parent === 'r1/p2').map((element) => [element.id, element.attributes])).toEqual([['r1/p2/o1', { option: 'o1' }]]);
    const one = converted('p4', 'selection');
    // Amsterdam has two tags, which stay; Antwerp has one, which becomes its value.
    expect(cell(one, 'r2/p4')).toEqual({ property: 'p4', option: 'o3' });
    expect(one.after.elements.filter((element) => element.parent === 'r1/p4')).toHaveLength(2);
    expect(one.after.elements.filter((element) => element.parent === 'r2/p4')).toHaveLength(0);
  });
});

describe('a quick change of a cell', () => {
  it('is the transaction the definition\'s own operation for it makes (DESL 10.3)', () => {
    expect(done(operations.setCell(model, 'r2', 'p3', 536079)).changes).toEqual(run('setNumber', ['r2'], { property: 'p3', value: 536079 }).changes);
    expect(done(operations.setCell(model, 'r1', 'p1', 'Mokum')).changes).toEqual(run('setText', ['r1'], { property: 'p1', value: 'Mokum' }).changes);
    expect(done(operations.setCell(model, 'r1', 'p2', 'o2')).changes).toEqual(run('setOption', ['r1'], { property: 'p2', value: 'o2' }).changes);
  });

  it('empties a cell that is given no value, and leaves a cell that has none as it is', () => {
    expect(done(operations.setCell(model, 'r1', 'p6', null)).changes).toEqual([{ kind: 'set', id: 'r1/p6', attributes: { checked: null } }]);
    expect(done(operations.setCell(model, 'r2', 'p6', null)).changes).toEqual([]);
  });

  it('adds and takes away one of several values', () => {
    expect(done(operations.setItem(model, 'r2', 'p4', 'o4', true)).changes).toEqual(run('addItem', ['r2'], { property: 'p4', option: 'o4' }).changes);
    expect(done(operations.setItem(model, 'r1', 'p4', 'o4', false)).changes).toEqual([{ kind: 'remove', id: 'r1/p4/o4' }]);
    expect(done(operations.setItem(model, 'r1', 'p4', 'o4', true)).changes).toEqual([]);
  });

  it('is refused for a row or a column the document does not have', () => {
    expect(operations.setCell(model, 'r9', 'p1', 'x').refused).toBeDefined();
    expect(operations.setCell(model, 'r1', 'p0', 'x').refused).toBeDefined();
  });

  it('shows another view by the attribute of the document the surface names', () => {
    expect(done(operations.activate(model, 'v2')).changes).toEqual([{ kind: 'set', id: '', attributes: { activeView: 'v2' } }]);
    expect(done(operations.activate(model, 'v1')).changes).toEqual([]);
  });
});

describe('DESL\'s smallest example', () => {
  const small = interpreted(minimalSpecification());
  const binding = bindingAt(`${minimalFolder}/minimal-table.fbl`, 'yaml');
  const books = modelOf(small, binding, 'ded: "0.1"\ndesigner: example/reading-list\nfields:\n  - id: f1\n    name: Title\n    type: text\nviews:\n  - id: v1\n    name: All books\nbooks:\n  - id: b1\n    values:\n      - field: f1\n        text: Dune\n');

  it('reads a document with the ids its one rule derives', () => {
    expect(books.elements.map((element) => [element.type, element.id])).toEqual([['Field', 'f1'], ['View', 'v1'], ['Book', 'b1'], ['Value', 'b1/f1']]);
  });

  it('runs its one operation, and changes a cell without one', () => {
    const outcome = done(small.operations.run(books, 'addBook', [], {}));
    expect(outcome.changes.map((change) => [change.kind, change.kind === 'add' ? change.type : ''])).toEqual([['add', 'Book']]);
    expect(done(small.operations.setCell(books, 'b1', 'f1', 'Dune Messiah')).changes).toEqual([{ kind: 'set', id: 'b1/f1', attributes: { text: 'Dune Messiah' } }]);
  });
});
