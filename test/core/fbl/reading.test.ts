import { describe, expect, it } from 'vitest';
import type { FblBinding } from '../../../src/core/fbl/documents/types';
import { findingCodes } from '../../../src/core/fbl/finding';
import type { FblModel, FblOptions } from '../../../src/core/fbl/model';
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
    const reading = readBody(utf8('<notamap/>'), bindingOf('mindmap.fbl', 'freeplane'), { fileName: 'plan.mm' });
    const model = reading.toModel();
    expect(model.unreadable).toBe(true);
    expect(reading.unreadable).toBeDefined();
    expect(model.elements).toEqual([]);
    expect(model.findings.map((finding) => finding.code)).toEqual([findingCodes.unparseable]);
  });

  it('an entry a rule matches but cannot read is reported and kept', () => {
    // The when expression fails on an entry whose count is not a number.
    const binding = inlineBinding('[{ "name": "item", "type": "Item", "at": "/items/*", "when": "int(entry.count) > 0", "id": { "from": { "key": "id" } } }]');
    const text = 'items:\n  - id: a\n    count: 3\n  - id: b\n    count: many\n';
    const reading = readBody(utf8(text), binding, { fileName: 'plan.t' });
    const model = reading.toModel();
    const unreadable = model.findings.filter((finding) => finding.code === findingCodes.unreadableEntry);
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0].location).toMatchObject({ file: 'plan.t', line: 4, column: 3 });
    expect(unreadable[0].location.length).toBeGreaterThan(0);
    expect(model.elements.map((element) => element.id)).toEqual(['a']);
    expect(model.unreadable).toBe(false);
    expect(textOf(reading.text.bytes)).toBe(text);
  });

  it('a statement no rule reads is reported when the binding asks for it', () => {
    const model = read('causal-loop\n\nthis is not a statement\n', bindingOf('causal-loop-diagram.fbl', 'cld'), { fileName: 'loop.cld' });
    const unbound = model.findings.filter((finding) => finding.code === findingCodes.unboundStatement);
    expect(unbound).toHaveLength(1);
    expect(unbound[0].location).toEqual({ file: 'loop.cld', line: 3, column: 1, length: 23 });
  });
});
