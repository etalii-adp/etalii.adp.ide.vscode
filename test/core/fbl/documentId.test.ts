import { describe, expect, it } from 'vitest';
import { loadDocument } from '../../../src/core/fbl/documents/documentLoader';
import type { FblBinding } from '../../../src/core/fbl/documents/types';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import { textOf, utf8 } from './support/repository';

// The document id a body holds (FBL 0.23 section 17.2; etalii.adp spec 089): read from the root key `document.id`
// names, and written there by the change `setDocumentId`, after a schema marker or replacing the value it had.

function binding(version = '0.23', documentId = '"document": { "id": { "key": "id" } },'): FblBinding {
  const json = `{ "fbl": "${version}", "bindings": { "t": { "claims": { "extensions": [".t"] }, "body": { "kind": "file", "family": "yaml" }, "reader": "declared", ${documentId}
    "elements": [ { "name": "item", "type": "Item", "at": "/items/*", "id": { "from": { "key": "id" } }, "attributes": { "label": { "key": "label" } }, "insert": { "container": "/items", "keys": ["id", "label"] } } ] } } }`;
  const { document, problems } = loadDocument(utf8(json));
  if (!document || problems.some((problem) => problem.severity === 'error')) throw new Error(problems.map((problem) => `${problem.pointer}: ${problem.message}`).join('; '));
  return document.bindings.get('t')!;
}

describe('a document id (FBL 17.2)', () => {
  it('is read from the root key the binding names, and is no element and no unmatched key', () => {
    const body = OpenBody.open(utf8('plan: 1\nid: k3f9x2ma\nitems:\n  - id: a\n    label: A\n'), binding());
    expect(body.model.documentId).toBe('k3f9x2ma');
    expect(body.model.elements.map((element) => element.id)).toEqual(['a']);
    expect(body.model.findings).toEqual([]);
  });

  it('is none when the body holds none, or the binding names no slot', () => {
    expect(OpenBody.open(utf8('items:\n  - id: a\n'), binding()).model.documentId).toBeUndefined();
    expect(OpenBody.open(utf8('id: k3f9x2ma\nitems: []\n'), binding('0.22', '')).model.documentId).toBeUndefined();
  });

  it('is written after a schema marker, with the body line endings, and undone', () => {
    const text = 'plan: 1\r\nitems:\r\n  - id: a\r\n    label: A\r\n';
    const body = OpenBody.open(utf8(text), binding());
    expect(body.change({ kind: 'setDocumentId', id: 'p0q7e2zd' })).not.toHaveProperty('refused');
    expect(textOf(body.bytes)).toBe('plan: 1\r\nid: p0q7e2zd\r\nitems:\r\n  - id: a\r\n    label: A\r\n');
    expect(body.model.documentId).toBe('p0q7e2zd');
    body.undo();
    expect(textOf(body.bytes)).toBe(text);
  });

  it('is written before the first key when that holds no scalar, and replaces one already there', () => {
    const before = OpenBody.open(utf8('items:\n  - id: a\n'), binding());
    before.change({ kind: 'setDocumentId', id: 'p0q7e2zd' });
    expect(textOf(before.bytes)).toBe('id: p0q7e2zd\nitems:\n  - id: a\n');
    const replaced = OpenBody.open(utf8('plan: 1\nid: old\nitems: []\n'), binding());
    replaced.change({ kind: 'setDocumentId', id: 'p0q7e2zd' });
    expect(textOf(replaced.bytes)).toBe('plan: 1\nid: p0q7e2zd\nitems: []\n');
  });

  it('is refused without a slot, or empty', () => {
    expect(OpenBody.open(utf8('items: []\n'), binding('0.22', '')).change({ kind: 'setDocumentId', id: 'x' })).toEqual({ refused: 'This file keeps no document id.' });
    expect(OpenBody.open(utf8('items: []\n'), binding()).change({ kind: 'setDocumentId', id: '' })).toEqual({ refused: 'A document id is not empty.' });
  });
});
