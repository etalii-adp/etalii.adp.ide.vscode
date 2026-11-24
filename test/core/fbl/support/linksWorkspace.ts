import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import { parse } from 'yaml';
import { loadDocument } from '../../../../src/core/fbl/documents/documentLoader';
import { OpenBody } from '../../../../src/core/fbl/history/openBody';
import { type HeldLink, type IndexedDocument, type IndexedElement, LinkWorkspace } from '../../../../src/core/fbl/links/workspace';
import { utf8 } from './repository';

// The conformance fixture of FBL 0.23 section 17, `specifications/fbl/fixtures/links-workspace/` of etalii.adp
// (spec 089), indexed as one workspace. A timeline and a dependency graph are read through a yaml binding that
// names their document id, which this library reads; a knowledge file and a mind map are read directly, as their
// definitions describe them, so that the index does not depend on a tool type it is used to test.

export const root = 'fixtures/fbl/conformance/fixtures/links-workspace';

export interface Case {
  readonly in: string;
  readonly at: string;
  readonly link: string;
  readonly target?: string;
  readonly element?: string;
  readonly after?: string;
  readonly finding?: string;
  readonly candidates?: readonly string[];
  readonly case: string;
}

export const conformance = JSON.parse(readFileSync(join(root, 'conformance.json'), 'utf8')) as { links: Case[]; withoutId: string[] };

const diagramBinding = (() => {
  const json = `{ "fbl": "0.23", "bindings": { "t": { "claims": { "extensions": [".tml", ".dgr"] }, "body": { "kind": "file", "family": "yaml" }, "reader": "declared",
    "document": { "id": { "key": "id" } },
    "elements": [ { "name": "element", "type": "Element", "at": "/elements/*", "id": { "from": { "key": "id" } }, "attributes": { "label": { "key": "label" }, "link": { "key": "link" } } } ] } } }`;
  const { document, problems } = loadDocument(utf8(json));
  expect(problems.filter((problem) => problem.severity === 'error')).toEqual([]);
  return document!.bindings.get('t')!;
})();

/** A timeline or a dependency graph: its elements named by `label`, and the `link` of a linked one. */
export function diagram(path: string): IndexedDocument {
  const model = OpenBody.open(readFileSync(path), diagramBinding).model;
  expect(model.unreadable, path).toBe(false);
  const elements = model.elements.filter((element) => !element.isRelation && element.parentId === undefined);
  return {
    path,
    ...(model.documentId === undefined ? {} : { documentId: model.documentId }),
    nameProperty: 'label',
    elements: elements.map((element): IndexedElement => ({ id: element.writtenId ?? element.id, attributes: [['label', String(element.attributes.label ?? '')]] })),
    links: elements.flatMap((element): HeldLink[] => (typeof element.attributes.link === 'string' ? [{ holder: element.id, text: element.attributes.link }] : [])),
  };
}

interface KnowledgeFile {
  id?: string;
  properties?: { id: string; name: string; title?: boolean; target?: string }[];
  rows?: { id: string; cells?: { property: string; text?: string; rows?: { row: string }[] }[] }[];
}

/** A knowledge file: its rows named by the title property, and the links its relations and their cells hold. */
export function knowledge(path: string): IndexedDocument {
  const file = parse(readFileSync(path, 'utf8')) as KnowledgeFile;
  const properties = file.properties ?? [];
  const nameOf = (id: string): string | undefined => properties.find((property) => property.id === id)?.name;
  const links: HeldLink[] = [];
  const elements = (file.rows ?? []).map((row): IndexedElement => {
    const attributes: [string, string][] = [];
    for (const cell of row.cells ?? []) {
      const name = nameOf(cell.property);
      if (name !== undefined && cell.text !== undefined) attributes.push([name, String(cell.text)]);
      for (const item of cell.rows ?? []) if (item.row.startsWith('$')) links.push({ holder: `${row.id}/${cell.property}`, text: item.row });
    }
    return { id: row.id, attributes };
  });
  for (const property of properties) if (property.target?.startsWith('$')) links.push({ holder: property.id, text: property.target });
  const title = properties.find((property) => property.title === true)?.name;
  return { path, ...(file.id === undefined ? {} : { documentId: file.id }), ...(title === undefined ? {} : { nameProperty: title }), elements, links };
}

/** A mind map: the central topic's `adp-id`, every node by its `TEXT`, and each node's `adp-link` (mindmap.md, section 3.8). */
export function mindmap(path: string): IndexedDocument {
  const text = readFileSync(path, 'utf8');
  const elements: IndexedElement[] = [];
  const links: HeldLink[] = [];
  let documentId: string | undefined;
  let node: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    const opened = /<node TEXT="([^"]*)" ID="([^"]*)"/.exec(line);
    if (opened) {
      node = opened[2];
      elements.push({ id: node, attributes: [['text', opened[1]]] });
    }
    const attribute = /<attribute NAME="([^"]*)" VALUE="([^"]*)"/.exec(line);
    if (attribute?.[1] === 'adp-id' && documentId === undefined) documentId = attribute[2];
    if (attribute?.[1] === 'adp-link' && node !== undefined) links.push({ holder: node, text: attribute[2] });
  }
  return { path, ...(documentId === undefined ? {} : { documentId }), nameProperty: 'text', elements, links };
}

export function files(folder: string): string[] {
  return readdirSync(folder)
    .sort()
    .flatMap((name) => (statSync(join(folder, name)).isDirectory() ? files(`${folder}/${name}`) : [`${folder}/${name}`]));
}

export const theWorkspace = (): LinkWorkspace =>
  new LinkWorkspace(
    root,
    files(root).flatMap((path) => (path.endsWith('.tml') || path.endsWith('.dgr') ? [diagram(path)] : path.endsWith('.yaml') ? [knowledge(path)] : path.endsWith('.mm') ? [mindmap(path)] : [])),
  );
