import { describe, expect, it } from 'vitest';
import { loadDocument } from '../../../src/core/fbl/documents/documentLoader';
import type { FblBinding } from '../../../src/core/fbl/documents/types';
import { findingCodes } from '../../../src/core/fbl/finding';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import type { FblModel, FblOptions, IdRequest } from '../../../src/core/fbl/model';
import type { ModelChange } from '../../../src/core/fbl/planning/modelChange';
import { OpenRegistration } from '../../../src/core/fbl/registration/openRegistration';
import { RegistrationDocument } from '../../../src/core/fbl/registration/registrationDocument';
import { readBody } from '../../../src/core/fbl/rules/bodyReading';
import { bindingOf, inlineBinding } from './support/bindings';
import { bytesOf, ordinal, textOf, utf8 } from './support/repository';

// Rule precedence, ids, headers and findings (FBL 5, 7.4, 7.5, 8.1, 8.5, 8.6). Counterparts of
// standalone's Reading/Reading.Tests.cs and Reading/TypedValue.Tests.cs, and what a slot reads from
// a scalar (FBL 0.5, sections 4.1.5 and 5.2), which standalone leaves to its fixtures.
const timeline = (): FblBinding => bindingOf('timeline.fbl', 'timeline');

const read = (body: string, binding: FblBinding, options: FblOptions = { fileName: 'plan.t' }): FblModel =>
  readBody(utf8(body), binding, options).toModel();

describe('reading a body through a binding', () => {
  it('the first rule in binding order takes an entry and an entry becomes one element', () => {
    // Both rules select every item; only the second's when excludes nothing.
    const binding = inlineBinding(`[
      { "name": "special", "type": "Special", "at": "/items/*", "when": "has(entry.special)", "id": { "from": { "key": "id" } } },
      { "name": "plain", "type": "Plain", "at": "/items/*", "id": { "from": { "key": "id" } } }
    ]`);
    const model = read('items:\n  - id: a\n    special: true\n  - id: b\n', binding);
    expect(model.elements.map((element) => `${element.id}:${element.type}`)).toEqual(['a:Special', 'b:Plain']);
  });

  it('an entry without an id is addressed by its place and marked not stored', () => {
    const binding = inlineBinding('[{ "name": "item", "type": "Item", "at": "/items/*" }]');
    const model = read('items:\n  - label: a\n', binding);
    expect(model.elements).toHaveLength(1);
    expect(model.elements[0].idIsStored).toBe(false);
  });

  it('a sidecar id is taken from the registrations identities', () => {
    const binding = inlineBinding('[{ "name": "item", "type": "Item", "at": "/items/*", "id": { "sidecar": { "key": "entry.label" } }, "attributes": { "label": { "key": "label" } } }]');
    const model = read('items:\n  - label: Tea\n  - label: Cup\n', binding, { fileName: 'plan.t', identities: new Map([['Tea', 'c1']]) });
    // The stored identity is used; an element without one is not given a stored id.
    expect(model.elements[0].id).toBe('c1');
    expect(model.elements[0].idIsStored).toBe(true);
    expect(model.elements[1].idIsStored).toBe(false);
  });

  it('the second of two equal ids is reported and not stored', () => {
    const model = read('elements:\n  - id: a\n    label: One\n    begin: 2026-01-01\n  - id: a\n    label: Two\n    begin: 2026-02-01\n', timeline());
    const duplicates = model.findings.filter((finding) => finding.code === findingCodes.duplicateId);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].location.line).toBe(5);
    expect(model.elements[0].idIsStored).toBe(true);
    expect(model.elements[1].idIsStored).toBe(false);
    expect(model.elements[1].id).not.toBe('a');
  });

  it('a missing header mark is reported and the body is still read', () => {
    const model = read('elements:\n  - id: a\n    label: One\n    begin: 2026-01-01\n', timeline());
    expect(model.findings.map((finding) => finding.code)).toContain(findingCodes.headerMismatch);
    expect(model.elements).toHaveLength(1);
  });

  it('a required header that is missing makes the body unreadable with one finding', () => {
    const body = OpenBody.open(utf8('<notamap/>'), bindingOf('mindmap.fbl', 'freeplane'), { fileName: 'plan.mm' });
    expect(body.model.unreadable).toBe(true);
    expect(body.isReadOnly).toBe(true);
    expect(body.model.elements).toEqual([]);
    expect(body.model.findings.map((finding) => finding.code)).toEqual([findingCodes.unparseable]);
  });

  it('an entry a rule matches but cannot read is reported and kept', () => {
    // The when expression fails on an entry whose count is not a number.
    const binding = inlineBinding('[{ "name": "item", "type": "Item", "at": "/items/*", "when": "int(entry.count) > 0", "id": { "from": { "key": "id" } } }]');
    const text = 'items:\n  - id: a\n    count: 3\n  - id: b\n    count: many\n';
    const body = OpenBody.open(utf8(text), binding, { fileName: 'plan.t' });
    const unreadable = body.model.findings.filter((finding) => finding.code === findingCodes.unreadableEntry);
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0].location).toMatchObject({ file: 'plan.t', line: 4, column: 3 });
    expect(unreadable[0].location.length).toBeGreaterThan(0);
    expect(body.model.elements.map((element) => element.id)).toEqual(['a']);
    expect(body.model.unreadable).toBe(false);
    expect(textOf(body.bytes)).toBe(text);
  });

  it('a statement no rule reads is reported when the binding asks for it', () => {
    const model = read('causal-loop\n\nthis is not a statement\n', bindingOf('causal-loop-diagram.fbl', 'cld'), { fileName: 'loop.cld' });
    const unbound = model.findings.filter((finding) => finding.code === findingCodes.unboundStatement);
    expect(unbound).toHaveLength(1);
    expect(unbound[0].location).toEqual({ file: 'loop.cld', line: 3, column: 1, length: 23 });
  });

  it('planning is deterministic', () => {
    const text = 'timeline: 1\nelements:\n  - id: a\n    label: One\n    begin: 2026-01-01\n';
    const change: ModelChange = { kind: 'set', id: 'a', attributes: { label: 'Two: and more' } };
    const first = OpenBody.open(utf8(text), timeline()).plan(change);
    const second = OpenBody.open(utf8(text), timeline()).plan(change);
    expect(first).toHaveProperty('planned');
    expect((first as { planned: { splices: unknown[] } }).planned.splices.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });

  it('an unknown registration header is kept and reported', () => {
    const bytes = utf8('generic/timeline\r\nbody: plan.tml\r\ncolour: green\r\n');
    const registration = RegistrationDocument.read(bytes);
    const findings = registration.unknownHeaders([], 'plan.adp');
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe(findingCodes.unknownHeader);
    expect(findings[0].location.line).toBe(3);
    expect(registration.unknownHeaders(['colour'], 'plan.adp')).toEqual([]);
    expect(OpenRegistration.open(bytes).bytes).toEqual(bytes);
  });

  it('a stale layout entry is reported and removed at the next write', () => {
    const registration = OpenRegistration.open(utf8('generic/timeline\r\nlayout:\r\n  a: 1 2\r\n  gone: 3 4\r\n'));
    registration.knownIds = new Set(['a']);
    const stale = registration.document.staleEntries(registration.knownIds, 'plan.adp');
    registration.change({ kind: 'place', id: 'a', x: 5, y: 6 });
    expect(stale.map((finding) => finding.code)).toEqual([findingCodes.staleViewData]);
    expect(textOf(registration.bytes)).toBe('generic/timeline\r\nlayout:\r\n  a: 5 6\r\n');
  });

  it('a block that names a view is read as that view with its block and place', () => {
    // The Structurizr workspace of the copied structurizr-open-block fixture.
    const bytes = bytesOf('fixtures/fbl/conformance/fixtures/structurizr-open-block/shop.dsl');
    const file = Buffer.from(bytes);
    const start = file.indexOf('container shop "containers" {');
    const end = file.indexOf('}', file.indexOf('autoLayout lr', start)) + 1;
    const model = OpenBody.open(bytes, bindingOf('structurizr.fbl', 'workspace'), { fileName: 'shop.dsl' }).model;
    // The view block on line 9, from its first byte to the brace that closes it.
    expect(start).toBeGreaterThan(0);
    expect(model.views).toHaveLength(1);
    expect(model.views[0]).toEqual({ name: 'containers', block: 'view', line: 9, span: { start, end } });
  });

  it('an id strategy is asked with the type and line of every entry without a stored id', () => {
    // The causal loop diagram of the copied causal-loop-rename fixture, whose links and loop store no id.
    const bytes = bytesOf('fixtures/fbl/conformance/fixtures/causal-loop-rename/growth.cld');
    const requests: IdRequest[] = [];
    const deriveId = (request: IdRequest): string | undefined => {
      requests.push(request);
      return undefined;
    };
    expect(OpenBody.open(bytes, bindingOf('causal-loop-diagram.fbl', 'cld'), { fileName: 'growth.cld', deriveId }).model.unreadable).toBe(false);
    // The two links on lines 7 and 8 and the loop on line 10.
    expect(requests.map((request) => `${request.type}@${request.line}`).sort(ordinal)).toEqual(['CausalLink@7', 'CausalLink@8', 'Loop@10']);
  });
});

// Which values convert to which of a specification's scalar types (FBL 7.4). A value arrives as its
// family read it: typed from YAML and JSON, always text from XML. The module is imported where it
// is used, so that this file loads before the module exists.
describe('a value read for a typed attribute', () => {
  const typedValue = (): Promise<{ reads: (type: string, value: unknown) => boolean }> => import('../../../src/core/fbl/rules/typedValue');

  it.each([
    ['number', '931298'],
    ['number', '-1.5e3'],
    ['bool', 'true'],
    ['date', '2026-10-09'],
    ['datetime', '2026-10-09T08:30:00+02:00'],
    ['time', '08:30'],
    ['time', '08:30:15'],
    ['text', 'anything'],
    ['Property', 'p1'],
  ])('text that converts, reads: %s %s', async (type, value) => {
    expect((await typedValue()).reads(type, value)).toBe(true);
  });

  it.each([
    ['number', 'about half a million'],
    ['number', 'NaN'],
    ['number', ''],
    ['bool', 'yes'],
    ['date', '9 October'],
    ['date', '2026-13-01'],
    ['datetime', 'tomorrow'],
    ['time', 'half past eight'],
  ])('text that does not convert, does not read: %s %j', async (type, value) => {
    expect((await typedValue()).reads(type, value)).toBe(false);
  });

  it('typed values, read as their own type only', async () => {
    // An integer is a bigint here, where standalone has a long.
    const { reads } = await typedValue();
    expect(reads('number', 931298n)).toBe(true);
    expect(reads('number', 0.5)).toBe(true);
    expect(reads('bool', false)).toBe(true);
    expect(reads('number', true)).toBe(false);
    expect(reads('bool', 1n)).toBe(false);
    expect(reads('date', 20261009n)).toBe(false);
  });
});

// FBL 5.2, "Reading a scalar" (FBL 0.5): what a slot of a yaml or json body reads is settled by
// `read`, and without it by the attribute's type in the tool type's specification. The table of
// that section is the source of every row below; the type is given as a host gives it, through
// the options.
describe('what a slot reads from a scalar', () => {
  const unconvertedValue = 'fbl.unconverted-value';

  const rules = (attribute: string): string =>
    `[{ "name": "item", "type": "Item", "at": "/items/*", "id": { "from": { "key": "id" } }, "attributes": { "value": ${attribute} } }]`;

  const slot = (attribute = '{ "key": "value" }'): FblBinding => inlineBinding(rules(attribute));

  const jsonSlot = (attribute: string): FblBinding => {
    const text = `{ "fbl": "0.5", "bindings": { "t": { "claims": { "extensions": [".t"] }, "body": { "kind": "file", "family": "json" }, "reader": "declared", "elements": ${rules(attribute)} } } }`;
    const { document, problems } = loadDocument(utf8(text));
    expect(problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    return document!.bindings.get('t')!;
  };

  /** The options of a tool type whose specification gives every attribute the one type. */
  const typed = (type: string): FblOptions => ({ fileName: 'plan.t', attributeType: () => type });

  /** One entry `a` whose value is written as given; nothing for a key with no value. */
  const entry = (written: string): string => `items:\n  - id: a\n    value:${written === '' ? '' : ` ${written}`}\n`;

  const valueOf = (model: FblModel): unknown => model.find('a')!.attributes.value;

  it.each([
    ['yes', 'yes'],
    ['true', 'true'],
    ['1.0', '1.0'],
    ['007', '007'],
    ['"12"', '12'],
    ['\'null\'', 'null'],
    ['~', '~'],
    ['a b   # a comment', 'a b'],
    ['"tab\\there"', 'tab\there'],
    ['\'it\'\'s\'', 'it\'s'],
    ['!!str 12', '12'],
    ['|\n      two\n      lines', 'two\nlines\n'],
    ['', ''],
  ])('a slot read as text gives the written text: %j', (written, text) => {
    // FBL 4.1.5: what its author wrote, whatever the scalar's typed value; a tag does not change it.
    expect(valueOf(read(entry(written), slot('{ "key": "value", "read": "text" }')))).toBe(text);
  });

  it.each([
    ['1.50', '1.50'],
    ['true', 'true'],
    ['null', 'null'],
    ['"a\\u0041\\n"', 'aA\n'],
  ])('a json scalar read as text gives its literal characters or its content: %j', (written, text) => {
    const model = read(`{ "items": [{ "id": "a", "value": ${written} }] }`, jsonSlot('{ "key": "value", "read": "text" }'));
    expect(valueOf(model)).toBe(text);
  });

  it.each([
    ['yes', 'yes'],
    ['1.0', '1.0'],
    ['007', '007'],
    ['"12"', '12'],
    ['', ''],
  ])('a string attribute reads the written text without being asked: %j', (written, text) => {
    expect(valueOf(read(entry(written), slot(), typed('string')))).toBe(text);
  });

  it('a slot read as text translates the written text with its map', () => {
    const binding = slot('{ "key": "value", "read": "text", "map": { "yes": "agreed", "1.0": "first" } }');
    expect(valueOf(read(entry('yes'), binding))).toBe('agreed');
    expect(valueOf(read(entry('1.0'), binding))).toBe('first');
  });

  it('an absent key leaves the attribute absent and its default applies', () => {
    const body = 'items:\n  - id: a\n';
    expect('value' in read(body, slot('{ "key": "value", "read": "text" }')).find('a')!.attributes).toBe(false);
    expect(valueOf(read(body, slot('{ "key": "value", "read": "text", "default": "none" }')))).toBe('none');
  });

  it.each([
    ['number', '1.0', 1],
    ['number', '007', 7],
    ['number', '12', 12],
    ['number', '-1.5e3', -1500],
    ['int', '1.0', 1],
    ['int', '007', 7],
  ])('a number attribute reads the typed value converted to its type: %s %s', (type, written, value) => {
    // "A conversion that loses nothing succeeds (the int 1 to a number, the double 1.0 to an int)."
    const got = valueOf(read(entry(written), slot(), typed(type)));
    expect(typeof got === 'number' || typeof got === 'bigint').toBe(true);
    expect(Number(got)).toBe(value);
  });

  it.each([
    ['yes', true],
    ['true', true],
    ['false', false],
  ])('a bool attribute reads a bool: %s', (written, value) => {
    // The table's first row: `yes` is `true` for a bool attribute.
    expect(valueOf(read(entry(written), slot(), typed('bool')))).toBe(value);
  });

  it.each([
    ['number', 'yes'],
    ['number', '"12"'],
    ['int', '1.5'],
    ['bool', '1.0'],
    ['bool', '007'],
    ['bool', '"12"'],
  ])('a value that does not convert makes its entry unreadable: %s %s', (type, written) => {
    // The second entry has no value, so it reads whatever the type; the first is reported and is no element.
    const text = `${entry(written)}  - id: b\n`;
    const body = OpenBody.open(utf8(text), slot(), typed(type));
    const unreadable = body.model.findings.filter((finding) => finding.code === findingCodes.unreadableEntry);
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0].location).toMatchObject({ file: 'plan.t', line: 2 });
    expect(body.model.elements.map((element) => element.id)).toEqual(['b']);
    expect(body.model.unreadable).toBe(false);
    expect(textOf(body.bytes)).toBe(text);
  });

  it.each([
    ['number', '"12"', 12],
    ['number', '\'7\'', 7],
    ['int', '"1.0"', 1],
  ])('a quoted number converts from its written text when the binding asks: %s %s', (type, written, value) => {
    // `quoted: "convert"`: a quoted scalar is first read by the core schema from its written text.
    const got = valueOf(read(entry(written), slot('{ "key": "value", "quoted": "convert" }'), typed(type)));
    expect(typeof got === 'number' || typeof got === 'bigint').toBe(true);
    expect(Number(got)).toBe(value);
  });

  it('a quoted bool converts from its written text when the binding asks', () => {
    expect(valueOf(read(entry('"true"'), slot('{ "key": "value", "quoted": "convert" }'), typed('bool')))).toBe(true);
  });

  it('a quoted text that is no number does not convert even when the binding asks', () => {
    const model = read(entry('"wide"'), slot('{ "key": "value", "quoted": "convert" }'), typed('number'));
    expect(model.elements).toEqual([]);
    expect(model.findings.map((finding) => finding.code)).toEqual([findingCodes.unreadableEntry]);
  });

  it.each([['number'], ['int'], ['bool']])('a key with no value leaves a typed attribute absent and its default applies: %s', (type) => {
    // "nothing (`key:`)": null, the attribute is absent, and `default` applies.
    const without = read(entry(''), slot(), typed(type));
    expect(without.findings).toEqual([]);
    expect(without.find('a')!.attributes.value ?? null).toBeNull();
    const fallen = valueOf(read(entry(''), slot(`{ "key": "value", "default": ${type === 'bool' ? 'true' : '3'} }`), typed(type)));
    expect(type === 'bool' ? fallen : Number(fallen)).toBe(type === 'bool' ? true : 3);
  });

  it('a value that does not convert reads as its fallback and is reported at the value', () => {
    // The entry stays readable and the bytes of the slot are kept (FBL 5.2, 7.4).
    const text = 'items:\n  - id: a\n    value: wide   # not a number\n';
    const body = OpenBody.open(utf8(text), slot('{ "key": "value", "fallback": { "value": 0 } }'), typed('number'));
    expect(body.model.elements.map((element) => element.id)).toEqual(['a']);
    expect(Number(valueOf(body.model))).toBe(0);
    expect(body.model.findings.map((finding) => finding.code)).toEqual([unconvertedValue]);
    expect(body.model.findings[0].severity).toBe('warning');
    expect(body.model.findings[0].location).toEqual({ file: 'plan.t', line: 3, column: 12, length: 4 });
    expect(textOf(body.bytes)).toBe(text);
  });

  it('a fallback that is not to be reported gives no finding', () => {
    const model = read(entry('wide'), slot('{ "key": "value", "fallback": { "value": 0, "report": false } }'), typed('number'));
    expect(Number(valueOf(model))).toBe(0);
    expect(model.findings).toEqual([]);
  });

  it('a value that converts is not its fallback', () => {
    const model = read(entry('4'), slot('{ "key": "value", "fallback": { "value": 0 } }'), typed('number'));
    expect(Number(valueOf(model))).toBe(4);
    expect(model.findings).toEqual([]);
  });

  it.each([
    ['007', '007'],
    ['"12"', '12'],
    ['1.0', '1.0'],
    ['yes', 'yes'],
  ])('an id is the written text of its slot: %s', (written, id) => {
    // FBL 5.3: an entry written `id: 007` has the id `007`.
    const model = read(`items:\n  - id: ${written}\n`, slot());
    expect(model.elements.map((element) => `${element.id}:${element.idIsStored}`)).toEqual([`${id}:true`]);
  });

  it('a reference is compared as written text', () => {
    // "a reference written `7` does not name it": c2's end names nothing, c1's names the element 007.
    const text = 'timeline: 1\nelements:\n  - id: 007\n    label: One\n    begin: 2026-01-01\n  - id: b\n    label: Two\n    begin: 2026-02-01\n'
      + 'connections:\n  - id: c1\n    from: 007\n    to: b\n  - id: c2\n    from: 7\n    to: b\n';
    const model = read(text, timeline(), { fileName: 'plan.tml' });
    const dangling = model.findings.filter((finding) => finding.code === findingCodes.danglingReference);
    expect(dangling).toHaveLength(1);
    expect(dangling[0].location.line).toBe(13);
    expect(model.find('c1')).toMatchObject({ source: '007', target: 'b' });
  });

  it('a host asks a reading which element a reference names', () => {
    // The Notion add-ons' store turns a reference into a row through referencedBy, from outside the
    // library: the first element, in document order, of the rules it may name, whose key is the text.
    const binding = inlineBinding(`[
      { "name": "person", "type": "Person", "at": "/people/*", "id": { "from": { "key": "id" } }, "attributes": { "name": { "key": "name" } } },
      { "name": "task", "type": "Task", "at": "/tasks/*", "id": { "from": { "key": "id" } }, "attributes": { "owner": { "key": "owner", "reference": { "to": ["person"], "by": "name" } } } }
    ]`);
    const reading = readBody(utf8('people:\n  - id: p1\n    name: Ann\n  - id: p2\n    name: Ann\n  - id: p3\n    name: Bob\ntasks:\n  - id: t1\n    owner: Bob\n'), binding, { fileName: 'plan.t' });
    const reference = binding.elements.find((rule) => rule.name === 'task')!.attributes.find(([name]) => name === 'owner')![1].reference!;
    expect(reading.referencedBy(reference, 'Bob')?.id).toBe('p3');
    expect(reading.referencedBy(reference, 'Ann')?.id).toBe('p1');
    expect(reading.referencedBy(reference, 'Cy')).toBeUndefined();
  });

  it('a rule sees the written text and the style of a scalar beside its typed value', () => {
    // FBL 2.4: `text.label` is "yes" where `entry.label` is true; `style` names how it is written.
    const binding = inlineBinding(`[
      { "name": "plain", "type": "Plain", "at": "/items/*", "when": "text.value == 'yes' && style.value == 'plain'", "id": { "from": { "key": "id" } } },
      { "name": "quoted", "type": "Quoted", "at": "/items/*", "when": "text.value == 'yes' && style.value == 'double'", "id": { "from": { "key": "id" } } },
      { "name": "other", "type": "Other", "at": "/items/*", "id": { "from": { "key": "id" } } }
    ]`);
    const model = read('items:\n  - id: a\n    value: yes\n  - id: b\n    value: "yes"\n  - id: c\n    value: no\n', binding);
    expect(model.elements.map((element) => `${element.id}:${element.type}`)).toEqual(['a:Plain', 'b:Quoted', 'c:Other']);
  });
});
