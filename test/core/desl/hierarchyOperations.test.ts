import { describe, expect, it } from 'vitest';
import type { Outcome } from '../../../src/core/disl/behavior';
import type { Model, Value } from '../../../src/core/disl/model';
import { hierarchySpecification, object, openHierarchy } from './support';

// Every operation of the Hierarchical Requirement Designer's definition run once, or more where it
// branches, on its web-shop example opened as the designer opens it (DESL 8, 10.3): the CEL each
// uses evaluates, its label, its unavailability and its question included, and the transaction
// gives model changes. The operations are counted from the definition; a test fails for one that
// has no sample here.

const declared = object(hierarchySpecification().operations);
const open = openHierarchy();
const { operations } = open.parts;
const { model } = open;

type Done = Exclude<Outcome, { readonly refused: string }>;
const idOf = (type: string, index = 0): string => model.elements.filter((element) => element.type === type)[index].id;
const placeholder = open.unnumbered[0]?.newId ?? '';

interface Sample {
  readonly on?: readonly string[] | ((on: Model) => readonly string[]);
  readonly args?: Readonly<Record<string, Value>> | ((on: Model) => Readonly<Record<string, Value>>);
  /** What is done before it, where the example has nothing for it to act on. */
  readonly first?: readonly [string, readonly string[], Readonly<Record<string, Value>>];
}
const samples: Readonly<Record<string, readonly Sample[]>> = {
  addTopItem: [{}],
  addItem: [{ on: ['ITEM-0001'] }],
  addItemBelow: [{ on: ['ITEM-0002'] }],
  // After its last requirement; before its first sub-item where it has no requirement; and into an empty item.
  addRequirement: [
    { on: ['ITEM-0001'] },
    { on: ['ITEM-0004'], first: ['deleteEntry', ['REQ-0006'], {}] },
    { on: (on) => [on.elements[on.elements.length - 1].id], first: ['addTopItem', [], {}] },
  ],
  addRequirementBelow: [{ on: ['REQ-0001'] }],
  setTitle: [{ on: ['REQ-0001'], args: { title: 'A customer finds a product by name.' } }],
  setDescription: [{ on: ['ITEM-0001'], args: { description: 'See [REQ-0002].' } }, { on: ['REQ-0002'], args: { description: '' } }],
  // Into another item after a sibling, to the end of another item, to the top level, and within its own item.
  moveItem: [
    { on: ['ITEM-0005'], args: { item: 'ITEM-0001', after: 'ITEM-0002' } },
    { on: ['ITEM-0003'], args: { item: 'ITEM-0006' } },
    { on: ['ITEM-0002'], args: {} },
    { on: ['ITEM-0004'], args: { after: 'ITEM-0006' } },
  ],
  moveRequirement: [
    { on: ['REQ-0001'], args: { item: 'ITEM-0004', after: 'REQ-0007' } },
    { on: ['REQ-0001'], args: { item: 'ITEM-0006' } },
    { on: ['REQ-0002'], args: { item: 'ITEM-0001' } },
  ],
  deleteEntry: [{ on: ['ITEM-0002'] }, { on: ['REQ-0009'] }],
  toggleCollapsed: [{ on: ['REQ-0001'] }, { on: ['ITEM-0003'] }],
  addTag: [{ on: ['REQ-0001'], args: { name: ' new tag ' } }, { on: ['REQ-0001'], args: { name: 'MAIL' } }],
  removeTag: [{ on: ['REQ-0001'], args: { name: 'SEARCH' } }],
  renameTag: [{ on: ['tag/security'], args: { name: 'safety first' } }],
  recolourTag: [{ on: ['tag/search'], args: { colour: 'red' } }],
  moveTag: [{ on: ['tag/search'], args: { after: 'tag/mail' } }, { on: ['tag/mail'] }],
  deleteTag: [{ on: ['tag/security'] }],
  setCategory: [{ on: ['REQ-0005'], args: { category: 'category/technical' } }],
  clearCategory: [{ on: ['REQ-0001'] }],
  addCategory: [{ args: { name: 'legal duty', colour: 'red' } }],
  renameCategory: [{ on: ['category/functional'], args: { name: 'feature' } }],
  recolourCategory: [{ on: ['category/technical'], args: { colour: 'pink' } }],
  moveCategory: [{ on: ['category/functional'], args: { after: 'category/technical' } }, { on: ['category/technical'] }],
  deleteCategory: [{ on: ['category/functional'] }],
  setState: [{ on: [placeholder], args: { state: 'state/done' } }],
  clearState: [{ on: ['REQ-0001'] }],
  addState: [{ args: { name: 'parked', colour: 'gray' } }],
  renameState: [{ on: ['state/accepted'], args: { name: 'agreed' } }],
  recolourState: [{ on: ['state/done'], args: { colour: 'green' } }],
  moveState: [{ on: ['state/done'], args: { after: 'state/proposed' } }, { on: ['state/done'] }],
  deleteState: [{ on: ['state/accepted'] }],
  addAssessment: [{ on: ['REQ-0001'], args: { text: 'Does search cover the descriptions?' } }, { on: ['ITEM-0001'], args: { kind: 'warning', text: 'Too broad.' } }],
  changeAssessment: [{ on: () => [idOf('Assessment')], args: { kind: 'remark', text: 'Thirty minutes is right.', detail: 'Agreed with [REQ-0006].' } }],
  resolveAssessment: [{ on: () => [idOf('Assessment')] }, { on: () => [idOf('Assessment', 1)] }],
  removeAssessment: [{ on: () => [idOf('Assessment', 2)] }],
  storeFilter: [{ args: { name: 'Mail: open', query: '#mail @proposed' } }],
  renameFilter: [{ on: ['filter/Backend'], args: { name: 'Server side' } }],
  removeFilter: [{ on: ['filter/Open security'] }],
  addColumnWidth: [{ args: { level: '1', width: 240 } }],
  setColumnWidth: [{ on: (on) => [on.elements.find((element) => element.type === 'Column')!.id], args: { width: 320 }, first: ['addColumnWidth', [], { level: '2', width: 200 }] }],
  resetColumnWidth: [{ on: (on) => [on.elements.find((element) => element.type === 'Column')!.id], first: ['addColumnWidth', [], { level: '2', width: 200 }] }],
};

function done(outcome: Outcome): Done {
  if (outcome.refused !== undefined) throw new Error(`refused: ${outcome.refused}`);
  return outcome;
}

describe('every operation of the definition', () => {
  it('has a sample here', () => {
    expect(Object.keys(declared).filter((id) => !Object.hasOwn(samples, id))).toEqual([]);
    expect(Object.keys(samples).filter((id) => !Object.hasOwn(declared, id))).toEqual([]);
  });

  it('is read with nothing found', () => {
    expect(open.parts.findings.map((found) => `${found.code}: ${found.message}`)).toEqual([]);
  });

  describe.each(Object.keys(declared))('%s', (id) => {
    it.each((samples[id] ?? []).map((sample, index) => [index, sample] as const))('runs as one transaction (sample %i), its CEL evaluated', (_index, sample) => {
      const before = sample.first ? done(operations.run(model, sample.first[0], sample.first[1], sample.first[2])).after : model;
      const on = typeof sample.on === 'function' ? sample.on(before) : sample.on ?? [];
      const args = typeof sample.args === 'function' ? sample.args(before) : sample.args ?? {};
      const state = operations.availability(before, id, on);
      expect(state, `${id} is offered`).toMatchObject({ offered: true, available: true });
      expect(state.label).not.toBe('');
      if (state.confirm) expect(state.confirm.message).not.toMatch(/^$/);
      const outcome = done(operations.run(before, id, on, args));
      expect(outcome.changes.length, `${id} changes the model`).toBeGreaterThan(0);
    });
  });
});
