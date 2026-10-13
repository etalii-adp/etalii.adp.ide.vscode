import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decode, encode } from '../../../src/core/fbl/text/utf8';
import { viewTypeOf, type Source, type TextSplice } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import type { TableRequest } from '../../../src/core/tool/tableView';
import { applied, definitionOf, designerOf, refusal, spliced } from './support';

// The Knowledge designer as a tool type made from its definition (etalii.adp spec 027, task T104),
// against what its definition and its bindings say of the same files: the four examples of
// standalone's module, and the bytes of etalii.adp's FBL fixtures `knowledge-yaml`, `knowledge-json`,
// `knowledge-xml` and `knowledge-kept`, which state every kind of edit the designer makes, in each
// format. A step of a fixture is one model change; here each is the operation of the definition
// that comes to it, run as the table surface runs it. What a test expects is the fixture's, and is
// typed here only where an operation of the definition makes more than the one change of its step.

const folder = 'knowledge';
const type = designerOf(definitionOf(folder), registry);

interface Step { readonly doc: string; readonly edit?: Record<string, { readonly id?: string }>; readonly expect?: string; readonly undo?: boolean; readonly refused?: string }
interface Fixture { readonly input: string; readonly steps: readonly Step[] }
const fixtures = 'fixtures/fbl/conformance/fixtures';
const fixtureOf = (name: string): Fixture => JSON.parse(readFileSync(`${fixtures}/${name}/fixture.json`, 'utf8')) as Fixture;
const inputOf = (name: string): string => readFileSync(`${fixtures}/${name}/${fixtureOf(name).input}`, 'utf8');

const operation = (name: string, on: readonly string[] = [], args: Readonly<Record<string, string | number | boolean>> = {}): TableRequest => ({ kind: 'operation', operation: name, on, args });

/** The splices that undo an applied outcome: of the text after it, each putting back the bytes its splice took out. This is what undo in the editor does. */
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

/** The text after a request that is applied, which also undoes exactly. A question it would ask is answered yes. */
function after(source: Source, request: TableRequest): string {
  const outcome = applied(type.edit(source, request, {}, true));
  expect(outcome.registration, 'nothing of a knowledge file is kept in a registration').toBeUndefined();
  const text = spliced(source.text, outcome.splices);
  expect(spliced(text, inverseOf(source.text, outcome.splices)), 'undo gives the bytes before').toBe(source.text);
  return text;
}

/** The id a request gave something new: the one new id of this host's form that the text has after it and not before. */
function madeIn(before: string, text: string): string | undefined {
  const known = new Set(before.match(/[0-9a-z]{25}/g));
  return text.match(/[0-9a-z]{25}/g)?.find((id) => !known.has(id));
}

// The gesture of this host for each step of the three fixtures, which make the same 76 changes in
// the same order. `as` is the id the fixture gives what the step creates, in place of the new one.
// `from` is the step whose bytes the gesture starts on, where one operation makes several steps.
interface Gesture { readonly request: TableRequest; readonly as?: string; readonly from?: number; readonly differs?: 'active' | 'placed' }
const gestures: Readonly<Record<number, Gesture>> = {
  1: { request: operation('addProperty', [], { name: 'Mayor', valueType: 'text' }), as: 'p10' },
  2: { request: operation('renameProperty', ['p10'], { name: 'Mayor name' }) },
  3: { request: operation('renameProperty', ['p10'], { name: '' }) },
  4: { request: operation('changePropertyType', ['p10'], { valueType: 'number' }) },
  5: { request: operation('moveProperty', ['p10'], { after: 'p1' }) },
  6: { request: operation('addOption', ['p2'], { name: 'Luxembourg', colour: 'green' }), as: 'o5' },
  7: { request: operation('renameOption', ['o5'], { name: 'Luxemburg' }) },
  8: { request: operation('recolourOption', ['o5'], { colour: 'purple' }) },
  9: { request: operation('moveOption', ['o5']) },
  10: { request: operation('deleteOption', ['o2']) },
  11: { request: operation('setText', ['r1'], { property: 'p1', value: 'Mokum' }) },
  12: { request: operation('setText', ['r2'], { property: 'p1', value: '' }) },
  13: { request: operation('setText', ['r2'], { property: 'p1', value: 'Antwerpen' }) },
  14: { request: operation('setNumber', ['r1'], { property: 'p3', value: 931300 }) },
  15: { request: operation('setChecked', ['r1'], { property: 'p6', value: false }) },
  16: { request: operation('clearCell', ['r1/p6']) },
  17: { request: operation('setDate', ['r1'], { property: 'p7', value: '1300-03-27' }) },
  18: { request: operation('clearCell', ['r1/p7']) },
  19: { request: operation('setDateTime', ['r1'], { property: 'p8', value: '2026-10-09T08:00:00Z' }) },
  20: { request: operation('clearCell', ['r1/p8']) },
  21: { request: operation('setTime', ['r1'], { property: 'p9', value: '10:00' }) },
  22: { request: operation('clearCell', ['r1/p9']) },
  23: { request: operation('setOption', ['r1'], { property: 'p2', value: 'o5' }) },
  24: { request: operation('clearCell', ['r1/p2']) },
  25: { request: operation('addItem', ['r2'], { property: 'p4', option: 'o4' }) },
  26: { request: operation('removeItem', ['r1/p4/o4']) },
  27: { request: operation('addItem', ['r1'], { property: 'p5', row: 'ut' }) },
  28: { request: operation('removeItem', ['r1/p5/nh']) },
  29: { request: operation('deleteOption', ['o3']) },
  // A change of type converts the values in the same step (DESL 7.6): the fixture's two steps are one gesture.
  31: { request: operation('changePropertyType', ['p3'], { valueType: 'text' }), from: 29 },
  32: { request: operation('deleteProperty', ['p9']) },
  33: { request: operation('addRow'), as: 'r3' },
  34: { request: operation('setText', ['r3'], { property: 'p1', value: 'Ghent' }) },
  35: { request: operation('moveRow', ['r3']) },
  // The definition's new view is also the one that is shown from then on.
  36: { request: operation('addView', [], { name: 'Board' }), as: 'v3', differs: 'active' },
  37: { request: operation('renameView', ['v3'], { name: 'Kanban' }) },
  // The copy of a view with its settings is one gesture, and the definition puts it after the view it copies, where the fixture's four steps add it last.
  41: { request: operation('duplicateView', ['v1']), as: 'v4', from: 37, differs: 'placed' },
  42: { request: operation('moveView', ['v3']) },
  43: { request: operation('deleteView', ['v4']) },
  44: { request: operation('switchView', ['v2']) },
  // A gesture on a column of a view gives the settings the column has, with the one it changes.
  45: { request: operation('setColumn', ['v1'], { property: 'p3', visible: false }) },
  46: { request: operation('setColumn', ['v1'], { property: 'p3', visible: false, width: 160 }) },
  47: { request: operation('setColumn', ['v1'], { property: 'p3', visible: false, wrap: true }) },
  48: { request: operation('calculate', ['v1'], { property: 'p3', calculation: 'sum' }) },
  49: { request: operation('calculate', ['v1'], { property: 'p3', calculation: 'percentEmpty' }) },
  50: { request: operation('removeCalculation', ['v1/columns/p3']) },
  51: { request: operation('setColumn', ['v1'], { property: 'p1', width: 200 }) },
  52: { request: operation('moveColumn', ['v1/columns/p1']) },
  53: { request: operation('resetColumn', ['v1/columns/p1']) },
  54: { request: operation('setColumn', ['v2'], { property: 'p1', width: 200 }) },
  55: { request: operation('resetColumn', ['v2/columns/p1']) },
  56: { request: operation('addSort', ['v1'], { property: 'p1' }) },
  57: { request: operation('setSortDirection', ['v1/sorts/p1'], { direction: 'descending' }) },
  58: { request: operation('moveSort', ['v1/sorts/p1']) },
  59: { request: operation('addCondition', ['v1'], { property: 'p3', operator: 'greater-than', number: 500000 }) },
  60: { request: operation('setMatch', ['v1'], { match: 'any' }) },
  61: { request: operation('addFilterGroup', ['v1'], { match: 'all' }) },
  62: { request: operation('addCondition', ['v1/filter/2'], { property: 'p1', operator: 'contains', text: 'dam' }) },
  63: { request: operation('removeCondition', ['v1/filter/2']) },
  64: { request: operation('hideEmptyGroups', ['v1'], { hide: true }) },
  65: { request: operation('freeze', ['v1'], { property: 'p1' }) },
  66: { request: operation('freeze', ['v1'], { property: 'p3' }) },
  67: { request: operation('unfreeze', ['v1']) },
  68: { request: operation('setGroup', ['v1'], { slot: 'groupOrder', key: 'o5' }) },
  69: { request: operation('setGroup', ['v1'], { slot: 'groupOrder', key: 'o1' }) },
  70: { request: operation('moveGroup', ['v1/groupOrder/o1']) },
  71: { request: operation('setGroup', ['v1'], { slot: 'hiddenGroups', key: 'o5' }) },
  72: { request: operation('setGroup', ['v1'], { slot: 'collapsed', key: 'o1' }) },
  73: { request: operation('unsetGroup', ['v1/collapsed/o1']) },
  74: { request: operation('deleteProperty', ['p3']) },
  75: { request: operation('deleteRows', ['r2']) },
};
// The steps one gesture of another step makes with it.
const within: readonly number[] = [30, 38, 39, 40];

/** The lines a text has that another has not, without the comma that ends an entry of a list on one line. */
function gained(before: string, text: string): string[] {
  const line = (written: string): string => written.trim().replace(/,$/, '');
  const had = before.split(/\r?\n/).map(line);
  return text.split(/\r?\n/).map(line).filter((written) => {
    const at = had.indexOf(written);
    if (at >= 0) had.splice(at, 1);
    return at < 0;
  }).sort();
}

describe.each([['knowledge-yaml', 'cities.yaml'], ['knowledge-json', 'cities.json'], ['knowledge-xml', 'cities.xml']])('the edits of %s', (name, fileName) => {
  const fixture = fixtureOf(name);
  const input = inputOf(name);
  const edits = fixture.steps.findIndex((step) => step.undo === true);
  const before = (index: number): string => (index === 0 ? input : fixture.steps[index].expect ?? input);

  it('are the 76 steps this file has a gesture for', () => {
    expect(edits).toBe(76);
    expect([...Object.keys(gestures).map(Number), ...within, 0].sort((a, b) => a - b)).toEqual(Array.from({ length: edits }, (_step, index) => index));
  });

  it('opens and saves without an edit: nothing is found and nothing changes', () => {
    const source = { fileName, text: input };
    expect(type.findings(source)).toEqual([]);
    expect(type.view(source, {}).readOnly).toBe(false);
    expect(source.text).toBe(input);
  });

  it.each(Object.keys(gestures).map(Number))('step %i gives the bytes of the fixture, and undoes exactly', (index) => {
    const { request, as, from, differs } = gestures[index];
    const step = fixture.steps[index];
    const source: Source = { fileName, text: before(from ?? index - 1) };
    if (step.refused !== undefined) {
      expect(refusal(type.edit(source, request, {}, true)), step.doc).toBe(step.refused);
      return;
    }
    let text = after(source, request);
    if (as !== undefined) {
      const made = madeIn(source.text, text);
      expect(made, 'the id of what the gesture made').toMatch(/^[0-9a-z]{25}$/);
      text = text.replaceAll(made!, as);
    }
    const expected = step.expect!;
    if (differs === 'active') expect(text, step.doc).toBe(expected.replace(/(activeView\W+)v1/, `$1${as}`));
    else if (differs === 'placed') expect(gained(source.text, text), step.doc).toEqual(gained(source.text, expected));
    else expect(text, step.doc).toBe(expected);
  });
});

describe('what the designer does not know', () => {
  const fixture = fixtureOf('knowledge-kept');
  const input = inputOf('knowledge-kept');
  const fileName = 'cities.yaml';

  it('is kept byte for byte through the edits around it (FBL 6.1)', () => {
    const steps: readonly TableRequest[] = [
      operation('setNumber', ['r1'], { property: 'p3', value: 931300 }),
      operation('setText', ['r2'], { property: 'p1', value: 'Antwerpen' }),
      operation('renameView', ['v1'], { name: 'Every city' }),
    ];
    let text = input;
    steps.forEach((request, index) => {
      text = after({ fileName, text }, request);
      expect(text, fixture.steps[index + 1].doc).toBe(fixture.steps[index + 1].expect);
    });
    // The fixture's fourth step removes a cell, which no operation of the definition does; its fifth removes the row.
    expect(after({ fileName, text: fixture.steps[4].expect! }, operation('deleteRows', ['r1']))).toBe(fixture.steps[5].expect);
  });

  it('is reported where it cannot be read, on its line, and the document is still shown', () => {
    const source = { fileName, text: input };
    expect(type.findings(source).map((found) => [found.rule, found.line])).toContainEqual(['std.unreadableEntry', 27]);
    expect(type.view(source, {}).readOnly).toBe(false);
  });
});

describe('the Knowledge designer', () => {
  const example = (name: string): Source => ({ fileName: name, text: readFileSync(`examples/knowledge/${name}`, 'utf8') });
  const examples = ['cities.yaml', 'cities.json', 'cities.xml', 'provinces.yaml'];

  it('is a designer, named and registered as its definition says', () => {
    expect([type.kind, type.origin, type.displayName, viewTypeOf(type)]).toEqual(['designer', 'etalii/knowledge', 'Knowledge', 'etalii.adp.etalii.knowledge']);
    expect(type.claims).toEqual([
      { extensions: ['yaml', 'yml'], shared: true, marker: true, registrationOnly: false },
      { extensions: ['json', 'ded'], shared: true, marker: true, registrationOnly: false },
      { extensions: ['xml'], shared: true, marker: true, registrationOnly: false },
    ]);
  });

  it.each(examples)('opens %s with nothing found, and an edit of it that is undone leaves its bytes', (name) => {
    const source = example(name);
    expect(type.claimed(source.fileName, source.text)).toBe(true);
    expect(type.findings(source)).toEqual([]);
    const shown = type.view(source, {});
    expect(shown.readOnly).toBe(false);
    expect(shown.rows.length).toBeGreaterThan(0);
    // `after` checks that the inverse of the edit's splices gives the bytes that were read.
    expect(after(source, operation('addRow'))).not.toBe(source.text);
  });

  it('shows the same table for the same knowledge in YAML, JSON and XML (DESL 5.1)', () => {
    const [yaml, json, xml] = ['cities.yaml', 'cities.json', 'cities.xml'].map((name) => type.view(example(name), {}));
    expect(json).toEqual(yaml);
    expect(xml).toEqual(yaml);
    // And as the fixture `knowledge-equivalence` has it: the same elements through each binding.
    const read = (format: string): string[] => (JSON.parse(readFileSync(`${fixtures}/knowledge-equivalence/${format}/fixture.json`, 'utf8')) as { read: { elements: { id: string; type: string }[] } }).read.elements
      .filter((element) => element.type === 'Row' || element.type === 'Property').map((element) => element.id);
    const all = type.view({ ...example('cities.yaml'), text: example('cities.yaml').text.replace('activeView: v1', 'activeView: v2') }, {});
    expect([...all.properties.map((property) => property.id), ...all.rows.map((row) => row.id)]).toEqual(read('yaml'));
    expect(read('json')).toEqual(read('yaml'));
    expect(read('xml')).toEqual(read('yaml'));
  });

  it('claims a file by its envelope, whatever of its extensions it has, and no file without it', () => {
    const json = example('cities.json').text;
    expect(type.claimed('cities.ded', json)).toBe(true);
    expect(type.claimed('cities.yml', example('cities.yaml').text)).toBe(true);
    expect(type.claimed('package.json', '{ "name": "adp" }')).toBe(false);
    expect(type.claimed('settings.yaml', 'name: Cities\r\nproperties: []\r\n')).toBe(false);
    expect(type.claimed('other.yaml', 'ded: "0.1"\r\ndesigner: example/reading-list\r\n')).toBe(false);
    expect(type.claimed('pom.xml', '<project/>')).toBe(false);
    // A file is read through the binding of its own format, and a YAML file with a JSON name is no knowledge file.
    expect(type.claimed('cities.json', example('cities.yaml').text)).toBe(false);
    expect(type.suggests('cities.yaml', example('cities.yaml').text)).toBe(true);
    expect(type.suggests('settings.yaml', 'name: Cities\r\n')).toBe(false);
  });

  it('gives a new document in the format of the name it is given, which opens with one column, one view and no row', () => {
    for (const name of ['new.yaml', 'new.json', 'new.xml', 'new.ded']) {
      const source = { fileName: name, text: type.newDocument(name) };
      expect(type.claimed(name, source.text), name).toBe(true);
      expect(type.findings(source), name).toEqual([]);
      const shown = type.view(source, {});
      expect([shown.name, shown.properties.map((property) => property.name), shown.views.map((tab) => tab.name), shown.rows.length], name).toEqual(['new', ['Name'], ['Table'], 0]);
    }
  });

  it('shows the cells of a selected row as the rows of ADP Properties, and sets one from there', () => {
    const source = example('cities.yaml');
    const fields = type.fields(source, ['r2']);
    expect(fields.map((field) => [field.id, field.label, field.control, field.value])).toEqual([
      ['p1', 'Name', 'text', 'Antwerp'], ['p2', 'Country', 'choice', 'Belgium'], ['p3', 'Population', 'number', ''], ['p4', 'Tags', 'tags', 'Port'],
      ['p5', 'Province', 'tags', ''], ['p6', 'Visited', 'choice', ''], ['p7', 'Founded', 'text', ''], ['p8', 'Updated', 'text', ''], ['p9', 'Opens', 'text', ''],
    ]);
    expect(fields[1].options).toEqual(['Netherlands', 'Belgium', 'Germany', 'France', 'Finland', 'Italy']);
    expect(type.fields(source, [])).toEqual([]);
    expect(type.fields(source, ['p1'])).toEqual([]);
    const set = (field: string, value: string): string => after(source, { kind: 'setField', id: 'r2', field, value });
    expect(set('p1', 'Antwerpen')).toBe(after(source, operation('setText', ['r2'], { property: 'p1', value: 'Antwerpen' })));
    expect(set('p3', '536079')).toBe(after(source, operation('setNumber', ['r2'], { property: 'p3', value: 536079 })));
    expect(set('p2', 'Netherlands')).toBe(after(source, operation('setOption', ['r2'], { property: 'p2', value: 'o1' })));
    expect(refusal(type.edit(source, { kind: 'setField', id: 'r2', field: 'p3', value: 'many' }, {}, false))).toContain('number');
  });

  it('asks before an operation whose definition asks, with the definition\'s question, and does nothing until it is answered', () => {
    const source = example('cities.yaml');
    expect(type.edit(source, operation('deleteProperty', ['p3']), {}, false)).toMatchObject({ kind: 'confirm', message: 'Delete `Population` and its values in 2 rows?' });
    expect(applied(type.edit(source, operation('deleteProperty', ['p3']), {}, true)).splices.length).toBeGreaterThan(0);
  });

  it('refuses with the definition\'s sentence, and writes nothing', () => {
    const source = example('cities.yaml');
    expect(refusal(type.edit(source, operation('deleteProperty', ['p1']), {}, true))).toBe('The title property cannot be deleted.');
    expect(refusal(type.edit(source, operation('renameProperty', ['p3'], { name: 'Name' }), {}, true))).toBe('A property named `Name` already exists.');
    expect(type.edit(source, operation('noSuchOperation'), {}, true).kind).toBe('refused');
    expect(type.edit(source, { kind: 'cell', row: 'r9', property: 'p1', value: 'x' }, {}, true).kind).toBe('refused');
  });

  it('edits a cell in place as the definition\'s operation for it does', () => {
    const source = example('cities.yaml');
    expect(after(source, { kind: 'cell', row: 'r2', property: 'p3', value: 536079 })).toBe(after(source, operation('setNumber', ['r2'], { property: 'p3', value: 536079 })));
    expect(after(source, { kind: 'item', row: 'r2', property: 'p4', value: 'o4', present: true })).toBe(after(source, operation('addItem', ['r2'], { property: 'p4', option: 'o4' })));
    expect(after(source, { kind: 'show', view: 'v2' })).toBe(after(source, operation('switchView', ['v2'])));
  });

  it('gives an entry that was written without an id a new one with the first edit, in the same step (DESL 5.3.4)', () => {
    const source = example('cities.yaml');
    const without = { ...source, text: source.text.replace('  - id: r2\r\n    cells:', '  - cells:') };
    expect(without.text).not.toBe(source.text);
    expect(type.findings(without).map((found) => found.rule)).toEqual(['std.missingId']);
    const text = after(without, operation('renameView', ['v2'], { name: 'Atlas' }));
    expect(type.findings({ ...without, text })).toEqual([]);
    expect(text).toMatch(/ {2}- id: [0-9a-z]{25}\r\n {4}cells:\r\n {6}- property: p1\r\n {8}text: Antwerp/);
  });

  it('has no toolbox: what it adds is added from the table', () => {
    expect(type.toolbox(example('cities.yaml'))).toEqual([]);
  });
});
