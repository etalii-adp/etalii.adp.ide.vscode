import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadDocument, loadDocumentAt } from '../../../../src/core/fbl/documents/documentLoader';
import type { FblBinding, FblDocument } from '../../../../src/core/fbl/documents/types';
import { nodeFiles } from '../../../../src/core/fbl/files/nodeFiles';
import { conformance, ordinal, utf8 } from './repository';

const documents = new Map<string, FblDocument>();

function documentOf(name: string): FblDocument {
  let document = documents.get(name);
  if (!document) {
    const loaded = loadDocumentAt(join(conformance, name), nodeFiles);
    const errors = loaded.problems.filter((problem) => problem.severity === 'error');
    if (!loaded.document || errors.length > 0) throw new Error(`${name} does not load: ${errors.map((problem) => `${problem.pointer}: ${problem.message}`).join('; ')}`);
    document = loaded.document;
    documents.set(name, document);
  }
  return document;
}

/** A copied binding by its document and name, loaded once and checked for load errors. */
export function bindingOf(document: string, name: string): FblBinding {
  const binding = documentOf(document).bindings.get(name);
  if (!binding) throw new Error(`${document} has no binding '${name}'.`);
  return binding;
}

/** Every copied binding, with the document it is in, in ordinal order of the documents. */
export function allBindings(): { document: string; binding: FblBinding }[] {
  return readdirSync(conformance)
    .filter((name) => name.endsWith('.fbl'))
    .sort(ordinal)
    .flatMap((document) => [...documentOf(document).bindings.values()].map((binding) => ({ document, binding })));
}

/** A binding `t` of the yaml family written in a test, with the element rules given as JSON. */
export function inlineBinding(elements: string, extra = ''): FblBinding {
  const json = `{ "fbl": "0.1", "bindings": { "t": { "claims": { "extensions": [".t"] }, "body": { "kind": "file", "family": "yaml" }, "reader": "declared", "elements": ${elements}${extra} } } }`;
  const { document, problems } = loadDocument(utf8(json));
  if (!document || problems.length > 0) throw new Error(`The inline binding does not load: ${problems.map((problem) => `${problem.pointer}: ${problem.message}`).join('; ')}`);
  return document.bindings.get('t')!;
}
