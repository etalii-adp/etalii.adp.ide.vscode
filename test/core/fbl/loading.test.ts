import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDocument, loadDocumentAt, resolveReference, type LoadProblem } from '../../../src/core/fbl/documents/documentLoader';
import { nodeFiles } from '../../../src/core/fbl/files/nodeFiles';
import { conformance, utf8 } from './support/repository';
import { withFolders } from './support/temporaryFolder';

// Loading an FBL document (FBL 2.1, 2.3, 2.7, 14.1). Counterparts of standalone's
// Loading/Loading.Tests.cs, and one test more: every copied binding loads.
const item = '{ "name": "item", "type": "Item", "at": "/items/*", "id": { "from": { "key": "id" } }, "attributes": { "label": { "key": "label" } } }';

const binding = (claims = '{ "extensions": [".t"] }', reader = '"declared"', elements = `[${item}]`): string =>
  `{ "claims": ${claims}, "body": { "kind": "file", "family": "yaml" }, "reader": ${reader}, "elements": ${elements} }`;

const documentOf = (text: string, version = '0.1'): Uint8Array => utf8(`{ "fbl": "${version}", "bindings": { "t": ${text} } }`);

const load = (text: string, version = '0.1'): readonly LoadProblem[] => loadDocument(documentOf(text, version)).problems;

const errorAt = (problems: readonly LoadProblem[], pointer: string): boolean =>
  problems.some((problem) => problem.severity === 'error' && problem.pointer === pointer);

describe('loading an FBL document', () => {
  it('a valid document loads without a problem', () => {
    // The baseline every refusal below departs from by one change.
    const { document, problems } = loadDocument(documentOf(binding()));
    expect(problems).toEqual([]);
    expect(document!.bindings.get('t')!.elements.map((rule) => rule.name)).toEqual(['item']);
  });

  it('a duplicate key anywhere is rejected at its pointer', () => {
    const problems = load(binding(undefined, undefined, '[{ "name": "item", "type": "Item", "type": "Other", "at": "/items/*" }]'));
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe('error');
    expect(problems[0].pointer).toBe('/bindings/t/elements/0/type');
  });

  it.each([['1.0'], ['2.3']])('another major version is refused: %s', (version) => {
    expect(errorAt(load(binding(), version), '/fbl')).toBe(true);
  });

  it('a newer minor version loads with a warning', () => {
    const { document, problems } = loadDocument(documentOf(binding(), '0.2'));
    expect(document).toBeDefined();
    expect(problems.map((problem) => problem.severity)).toEqual(['warning']);
  });

  it.each([
    ['[{ "name": "item", "type": "Item", "at": "/items/*", "parent": { "rules": ["missing"], "slot": "parent" } }]', '/bindings/t/elements/0/parent/rules'],
    ['[{ "name": "item", "type": "Item", "at": "/items/*", "remove": { "cascade": ["missing"] } }]', '/bindings/t/elements/0/remove/cascade'],
    ['[{ "name": "item", "type": "Item", "at": "/items/*", "within": ["missing"] }]', '/bindings/t/elements/0/within'],
    ['[{ "name": "item", "type": "Item", "at": "/items/*", "files": ["missing"] }]', '/bindings/t/elements/0/files'],
    ['[{ "name": "item", "type": "Item", "at": "/items/*", "attributes": { "owner": { "key": "owner", "reference": { "to": ["missing"] } } } }]', '/bindings/t/elements/0/attributes/owner/reference/to'],
    ['[{ "name": "item", "type": "Item", "at": "/items/*" }, { "name": "item", "type": "Other", "at": "/others/*" }]', '/bindings/t/elements/1/name'],
  ])('a name that does not resolve is rejected at its pointer: %s', (elements, pointer) => {
    expect(errorAt(load(binding(undefined, undefined, elements)), pointer)).toBe(true);
  });

  it.each([
    ['{ "extensions": [".t"], "shared": true }', '"declared"', `[${item}]`, '/bindings/t/claims'],
    ['{ "extensions": [".t"], "readings": { "a": { "bare": true }, "b": { "bare": true } } }', '"declared"', `[${item}]`, '/bindings/t/claims/readings'],
    ['{ "extensions": [".t"] }', '"declared"', '[]', '/bindings/t'],
    ['{ "extensions": [".t"] }', '{ "plugin": "x.y" }', `[${item}]`, '/bindings/t'],
    ['{ "extensions": [".t"] }', '"declared"', '[{ "name": "item", "type": "Item", "at": "/items/*", "attributes": { "label": { "key": "label", "text": true } } }]', '/bindings/t/elements/0/attributes/label'],
  ])('a step six check is applied: %s %s %s', (claims, reader, elements, pointer) => {
    expect(errorAt(load(binding(claims, reader, elements)), pointer)).toBe(true);
  });

  it('a shared claim with a marker is accepted', () => {
    expect(load(binding('{ "extensions": [".t"], "shared": true, "marker": { "rootKey": "items" } }'))).toEqual([]);
  });

  it('every problem is reported rather than the first', () => {
    const problems = load(binding(
      '{ "extensions": [".t"], "shared": true }',
      undefined,
      '[{ "name": "item", "type": "Item", "at": "/items/*", "line": "(a)\\\\1", "remove": { "cascade": ["missing"] } }]',
    ));
    // The claim, the rule's two anchors and the cascade, each with its own pointer.
    const pointers = problems.map((problem) => problem.pointer);
    expect(pointers).toContain('/bindings/t/claims');
    expect(pointers).toContain('/bindings/t/elements/0');
    expect(pointers).toContain('/bindings/t/elements/0/remove/cascade');
    expect(problems.filter((problem) => problem.message.trim() === '')).toEqual([]);
  });

  it('a reference resolves against the referring document', () => {
    withFolders(1, (folder) => {
      const document = folder.write('bindings/plan.fbl', `{ "fbl": "0.1", "bindings": { "t": ${binding()}, "u": ${binding('{ "extensions": [".u"] }')} } }`);
      const fixture = folder.write('fixtures/one/fixture.json', '{}');
      const across = resolveReference('../../bindings/plan.fbl#u', fixture, nodeFiles);
      const within = resolveReference('#t', document, nodeFiles);
      expect(across.name).toBe('u');
      expect(within.name).toBe('t');
      expect(() => resolveReference('#missing', document, nodeFiles)).toThrow();
    });
  });

  // The gate of the plan: every copied binding loads with the subset of FBL 2.5 and the CEL this host has.
  const documents = readdirSync(conformance).filter((name) => name.endsWith('.fbl')).sort();

  it('the copied bindings are found', () => {
    expect(documents).toHaveLength(8);
  });

  it.each(documents)('every copied binding loads: %s', (name) => {
    const { document, problems } = loadDocumentAt(join(conformance, name), nodeFiles);
    expect(problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(document!.bindings.size).toBeGreaterThan(0);
  });
});
