import { describe, expect, it } from 'vitest';
import type { FblBinding } from '../../../src/core/fbl/documents/types';
import { findingCodes } from '../../../src/core/fbl/finding';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import type { FblModel, FblOptions } from '../../../src/core/fbl/model';
import type { ModelChange } from '../../../src/core/fbl/planning/modelChange';
import { OpenRegistration } from '../../../src/core/fbl/registration/openRegistration';
import { RegistrationDocument } from '../../../src/core/fbl/registration/registrationDocument';
import { readBody } from '../../../src/core/fbl/rules/bodyReading';
import { bindingOf, inlineBinding } from './support/bindings';
import { textOf, utf8 } from './support/repository';

// Rule precedence, ids, headers and findings (FBL 5, 7.4, 7.5, 8.1, 8.5, 8.6). Counterparts of
// standalone's Reading/Reading.Tests.cs.
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
});
