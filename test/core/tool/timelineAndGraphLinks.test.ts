import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LinkWorkspace } from '../../../src/core/fbl/links/workspace';
import type { DiagramToolType, Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import { emptyLookup, lookupItems } from '../../../src/core/tool/linkActions';
import { conformance, diagram, root, theWorkspace } from '../fbl/support/linksWorkspace';
import { applied, definitionOf, diagramOf, spliced } from './support';

// The timeline and the dependency graph in a workspace of documents that link to each other (etalii.adp specs 089
// and 092; FBL 0.23 section 17): their bindings keep the document id under `id` and read an entry with a `link` key as
// a linked element, so each is indexed, its links are resolved, and a link that does not resolve is reported at its
// element, as the conformance fixture of FBL section 17 says.

interface Case { readonly tool: string; readonly file: string; readonly linkedTypes: readonly string[]; readonly id: string; readonly placed: RegExp }
const cases: readonly Case[] = [
  { tool: 'timeline', file: 'plan/release.tml', linkedTypes: ['LinkedMoment', 'LinkedPeriod'], id: 't5h8w1rz', placed: /link: \$k3f9x2ma@provinces\.yaml#nh\.Name=Noord-Holland\r?\n\s+begin: 2026-09-21\r?\n/ },
  { tool: 'dependency-graph', file: 'teams/services.dgr', linkedTypes: ['LinkedNode'], id: 'd7n2k4qp', placed: /link: \$k3f9x2ma@provinces\.yaml#nh\.Name=Noord-Holland\r?\n\s+x: 41435[12][.0-9]*\r?\n/ },
];

describe.each(cases)('a $tool that links', ({ tool, file, linkedTypes, id }) => {
  const type = diagramOf(definitionOf(tool), registry) as DiagramToolType;
  const path = `${root}/${file}`;
  const source: Source = { fileName: path, text: readFileSync(path, 'utf8') };
  const workspace = (): LinkWorkspace => {
    const links = theWorkspace();
    links.put(type.indexed!(source)!);
    return links;
  };
  const listed = conformance.links.filter((entry) => entry.in === file);

  it('is indexed with its document id and the link each linked element holds', () => {
    const indexed = type.indexed!(source)!;
    expect(indexed.documentId).toBe(id);
    expect(indexed.links.map((link) => link.text).sort()).toEqual(diagram(path).links.map((link) => link.text).sort());
  });

  it('names a linked element in the index by the name its link caches, so the lookup and Linked from show it', () => {
    const indexed = type.indexed!(source)!;
    const entry = listed.find((candidate) => candidate.link.includes('='))!;
    const element = indexed.elements.find((candidate) => candidate.id === entry.at)!;
    expect(element.attributes.find(([name]) => name === indexed.nameProperty)?.[1]).toBe(entry.link.slice(entry.link.lastIndexOf('=') + 1));
  });

  it('starts a new document with a document id of 8 characters of 0-9a-z (FBL 17.2)', () => {
    const fileName = `untitled.${type.claims.flatMap((claim) => claim.extensions)[0]}`;
    expect(type.indexed!({ fileName, text: type.newDocument(fileName) })?.documentId).toMatch(/^[0-9a-z]{8}$/);
  });

  it('reads an entry with a link as a linked element', () => {
    const linked = type.view(source, {}).nodes.filter((node) => linkedTypes.includes(node.type)).map((node) => node.id).sort();
    expect(linked).toEqual(listed.map((entry) => entry.at).sort());
  });

  it('reports each link that does not resolve at its element, and nothing outside a workspace', () => {
    const found = type.findings({ ...source, links: workspace() }).filter((finding) => finding.rule.startsWith('link.')).map((finding) => [finding.element, finding.rule]);
    expect(found.sort()).toEqual(listed.filter((entry) => entry.finding !== undefined).map((entry) => [entry.at, entry.finding]).sort());
    expect(type.findings(source).filter((finding) => finding.rule.startsWith('link.'))).toEqual([]);
  });

  it('labels a linked element with its target\'s current name', () => {
    const resolved = listed.find((entry) => entry.after !== undefined && entry.after !== entry.link && entry.after.includes('='))!;
    const name = resolved.after!.slice(resolved.after!.lastIndexOf('=') + 1);
    const labels = type.view({ ...source, links: workspace() }, {}).nodes.find((node) => node.id === resolved.at)!.labels.map((label) => label.text);
    expect(labels).toContain(name);
  });
});

describe.each(cases)('Add from another document in a $tool', ({ tool, file, linkedTypes, placed }) => {
  const type = diagramOf(definitionOf(tool), registry) as DiagramToolType;
  const path = `${root}/${file}`;
  const text = readFileSync(path, 'utf8');
  const source: Source = { fileName: path, text, links: theWorkspace() };
  const action = 'addLinkedHere';
  // 1,790,000,000 seconds, 21 September 2026, where the timeline draws 20 to a day; the graph's x is the point's own.
  const x = (1_790_000_000 / 86_400) * 20;

  it('asks the host\'s lookup, and adds a linked element for what was picked where the canvas was clicked', () => {
    expect(type.edit(source, { kind: 'action', action, x, y: 20 }, {}, false)).toEqual({ kind: 'lookup' });
    const item = lookupItems(source.links!).find((candidate) => candidate.pick.name === 'Noord-Holland')!;
    const outcome = applied(type.edit(source, { kind: 'action', action, x, y: 20, picked: item.pick }, {}, false));
    const after = spliced(text, outcome.splices);
    // The linked element shows its target's name and keeps no label of its own; a timeline's begin is the day it was placed on.
    expect(after).toMatch(placed);
    const added = type.view({ ...source, text: after }, {}).nodes.find((node) => node.id === outcome.select);
    expect(linkedTypes).toContain(added?.type);
  });
});

describe('the lookup with nothing to offer', () => {
  it('names the documents that hold no document id yet, and says how they get one', () => {
    const links = new LinkWorkspace('/w', [{ path: '/w/data/cities.yaml', elements: [{ id: 'r1', attributes: [['Name', 'Amsterdam']] }], links: [] }]);
    expect(lookupItems(links)).toEqual([]);
    expect(emptyLookup(links)).toBe("Nothing can be linked to yet: 'data/cities.yaml' has no document id. A document is given one with its first edit; change something in it and save it, then add the link.");
    expect(emptyLookup(new LinkWorkspace('/w'))).toBe('No document of the workspace has an element that can be linked to here.');
  });
});
