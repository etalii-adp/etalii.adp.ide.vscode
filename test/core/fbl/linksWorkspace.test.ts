import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { loadDocument } from '../../../src/core/fbl/documents/documentLoader';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import { linkText } from '../../../src/core/fbl/links/link';
import { type HeldLink, type IndexedDocument, type IndexedElement, LinkWorkspace } from '../../../src/core/fbl/links/workspace';
import { utf8 } from './support/repository';

// The conformance fixture of FBL 0.23 section 17, `specifications/fbl/fixtures/links-workspace/` of etalii.adp
// (spec 089): its folder is one workspace, and every link its documents hold resolves, or is reported, and is
// rewritten by load-time validation as `conformance.json` says. The counterpart of the desktop host's
// `adp-links/tests/links_workspace.rs`. A timeline and a dependency graph are read through a yaml binding that
// names their document id, which this library reads; the tool types' own bindings take links up in later changes,
// so a knowledge file and a mind map are read here directly, as their definitions describe them.

const root = 'fixtures/fbl/conformance/fixtures/links-workspace';

interface Case {
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

const conformance = JSON.parse(readFileSync(join(root, 'conformance.json'), 'utf8')) as { links: Case[]; withoutId: string[] };

const diagramBinding = (() => {
  const json = `{ "fbl": "0.23", "bindings": { "t": { "claims": { "extensions": [".tml", ".dgr"] }, "body": { "kind": "file", "family": "yaml" }, "reader": "declared",
    "document": { "id": { "key": "id" } },
    "elements": [ { "name": "element", "type": "Element", "at": "/elements/*", "id": { "from": { "key": "id" } }, "attributes": { "label": { "key": "label" }, "link": { "key": "link" } } } ] } } }`;
  const { document, problems } = loadDocument(utf8(json));
  expect(problems.filter((problem) => problem.severity === 'error')).toEqual([]);
  return document!.bindings.get('t')!;
})();

/** A timeline or a dependency graph: its elements named by `label`, and the `link` of a linked one. */
function diagram(path: string): IndexedDocument {
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
function knowledge(path: string): IndexedDocument {
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
function mindmap(path: string): IndexedDocument {
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

function files(folder: string): string[] {
  return readdirSync(folder)
    .sort()
    .flatMap((name) => (statSync(join(folder, name)).isDirectory() ? files(`${folder}/${name}`) : [`${folder}/${name}`]));
}

const theWorkspace = (): LinkWorkspace =>
  new LinkWorkspace(
    root,
    files(root).flatMap((path) => (path.endsWith('.tml') || path.endsWith('.dgr') ? [diagram(path)] : path.endsWith('.yaml') ? [knowledge(path)] : path.endsWith('.mm') ? [mindmap(path)] : [])),
  );

describe('the links workspace (FBL 17)', () => {
  it('reads as documents without an id only those the fixture lists', () => {
    const workspace = theWorkspace();
    const without = workspace.documents.filter((document) => document.documentId === undefined).map((document) => workspace.display(document.path));
    expect(without.sort()).toEqual([...conformance.withoutId].sort());
  });

  it('holds every link the fixture lists, and no other', () => {
    const workspace = theWorkspace();
    const held = workspace.documents.flatMap((document) => document.links.map((link) => `${workspace.display(document.path)} at ${link.holder}: ${link.text}`));
    const listed = conformance.links.map((entry) => `${entry.in} at ${entry.at}: ${entry.link}`);
    expect([...new Set(held)].sort()).toEqual([...new Set(listed)].sort());
  });

  it.each(conformance.links.map((entry) => [`${entry.in} at ${entry.at}: ${entry.case}`, entry] as const))('%s', (_, entry) => {
    const workspace = theWorkspace();
    const { resolved, finding } = workspace.resolve(entry.link);
    if (entry.finding !== undefined) {
      expect(finding?.code).toBe(entry.finding);
      if (entry.candidates) expect(finding?.candidates.map((path) => workspace.display(path))).toEqual(entry.candidates);
    } else {
      expect(finding).toBeUndefined();
      expect(workspace.display(resolved!.path)).toBe(entry.target);
      expect(resolved!.link.element?.id).toBe(entry.element);
      expect(linkText(resolved!.refreshed)).toBe(entry.after);
    }
  });

  it('finds the backlinks of a row in every kind of document', () => {
    const workspace = theWorkspace();
    const from = new Set(workspace.backlinks(`${root}/knowledge/provinces.yaml`, 'nh').map((backlink) => workspace.display(backlink.path)));
    expect(from.has('plan/release.tml')).toBe(true);
    expect(from.has('teams/services.dgr')).toBe(true);
    expect([...from].some((path) => path.startsWith('knowledge/'))).toBe(true);
  });
});
