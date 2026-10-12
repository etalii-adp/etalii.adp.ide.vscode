import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDocument, loadDocumentAt, resolveReference, type LoadProblem } from '../../../src/core/fbl/documents/documentLoader';
import { allRules, type FblBinding, type FblDocument } from '../../../src/core/fbl/documents/types';
import { nodeFiles } from '../../../src/core/fbl/files/nodeFiles';
import { conformance, utf8 } from './support/repository';
import { withFolders } from './support/temporaryFolder';

// Loading an FBL document (FBL 2.1, 2.3, 2.7, 14.1). Counterparts of standalone's
// Loading/Loading.Tests.cs, and three more: the versions this host knows, one binding per format
// family, and every copied binding loads.
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

  it.each([['0.1'], ['0.2'], ['0.3'], ['0.4'], ['0.5'], ['0.6']])('a version up to 0.6 loads without a warning: %s', (version) => {
    // "A host MUST read a document of an earlier minor version with its meaning" (FBL 2.7).
    const { document, problems } = loadDocument(documentOf(binding(), version));
    expect(problems).toEqual([]);
    expect(document!.version).toBe(version);
  });

  it('a newer minor version loads with a warning', () => {
    // Standalone's test loads 0.2, which its loader still takes for newer; FBL 2.7 names 0.1 to
    // 0.6, so the first newer minor version is 0.7.
    const { document, problems } = loadDocument(documentOf(binding(), '0.7'));
    expect(document).toBeDefined();
    expect(problems.map((problem) => problem.severity)).toEqual(['warning']);
    expect(problems[0].pointer).toBe('/fbl');
  });

  it('a document holds one binding per format family', () => {
    // FBL 0.3, sections 1.2 and 8.1: a tool type whose documents may be written in several formats
    // names one binding of each, and all of them may live in one document.
    const of = (family: string, extension: string, rule: string): string =>
      `"${family}": { "claims": { "extensions": ["${extension}"] }, "body": { "kind": "file", "family": "${family}" }, "reader": "declared", "elements": [${rule}] }`;
    const element = '{ "name": "item", "type": "Item", "at": "/items/item", "id": { "from": { "attribute": "id" } }, "attributes": { "label": { "attribute": "label" } } }';
    const text = `{ "fbl": "0.3", "bindings": { ${of('yaml', '.yaml', item)}, ${of('json', '.json', item)}, ${of('xml', '.xml', element)} } }`;
    const { document, problems } = loadDocument(utf8(text));
    expect(problems).toEqual([]);
    const bindings = [...document!.bindings.values()];
    expect(bindings.map((one) => `${one.name}:${one.body.family}:${one.claims.extensions.join(',')}`)).toEqual(['yaml:yaml:.yaml', 'json:json:.json', 'xml:xml:.xml']);
    expect(bindings.map((one) => one.elements.map((rule) => rule.name))).toEqual([['item'], ['item'], ['item']]);
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

  const vendored = (file: string): FblDocument => {
    const { document, problems } = loadDocumentAt(join(conformance, file), nodeFiles);
    expect(problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    return document!;
  };

  const vendoredBinding = (file: string, name: string): FblBinding => vendored(file).bindings.get(name)!;

  it('a vendored folder binding loads its file rules and its plugin', () => {
    const chart = vendoredBinding('helm-chart.fbl', 'chart');
    // The file rules' families and the plugin's version, as helm-chart.fbl declares them.
    expect(chart.body.files.map((file) => file.family ?? null)).toEqual(['yaml', 'yaml', 'json', 'lines', null, 'yaml', null, 'yaml', 'yaml']);
    expect(chart.plugin!.version).toBe('^0.1.0');
  });

  it('vendored bindings load their title claims rules and registration settings', () => {
    const helm = vendoredBinding('helm-chart.fbl', 'chart');
    const structurizr = vendoredBinding('structurizr.fbl', 'workspace');
    const turtle = vendoredBinding('w3c-turtle.fbl', 'turtle');
    const timeline = vendoredBinding('timeline.fbl', 'timeline');
    // Each value as the copied document declares it.
    expect(vendored('helm-chart.fbl').version).toBe('0.1');
    expect(helm.title).toBe('Helm chart');
    expect(helm.claims.suggest).toEqual(['apiVersion:']);
    expect(allRules(structurizr).filter((rule) => rule.opens).map((rule) => rule.name)).toEqual(['person', 'softwareSystem', 'container']);
    expect(turtle.registration.headers).toEqual(['language']);
    expect(helm.registration.createOnFirstPlacement).toBe(true);
    expect(timeline.registration.createOnFirstPlacement).toBe(false);
  });

  // The gate of the plan: every copied binding loads with the subset of FBL 2.5 and the CEL this host has.
  const documents = readdirSync(conformance).filter((name) => name.endsWith('.fbl')).sort();

  it('the copied bindings are found', () => {
    expect(documents).toHaveLength(9);
  });

  it.each(documents)('every copied binding loads: %s', (name) => {
    const { document, problems } = loadDocumentAt(join(conformance, name), nodeFiles);
    expect(problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(document!.bindings.size).toBeGreaterThan(0);
  });
});
