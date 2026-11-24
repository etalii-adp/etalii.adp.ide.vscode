import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PluginPlanRequest } from '../../../src/core/fbl';
import { LinkWorkspace } from '../../../src/core/fbl/links/workspace';
import type { DiagramToolType, Source } from '../../../src/core/frame/toolType';
import { plan } from '../../../src/core/plugins/freeplane-mm/planner';
import { read } from '../../../src/core/plugins/freeplane-mm/reader';
import { plugins as registry } from '../../../src/core/plugins/index';
import { conformance, mindmap, root, theWorkspace } from '../fbl/support/linksWorkspace';
import { applied, definitionOf, diagramOf, spliced } from './support';

// The mind map in a workspace of documents that link to each other (etalii.adp spec 089; DISL 4.12; FBL 0.23
// section 17; the companion document, section 3.8): the map's document id is the central topic's `adp-id`, a
// node with an `adp-link` is a linked node, labelled with its target's current name, a link that does not
// resolve is reported at its node and drawn with the broken mark, and the first edit writes what load-time
// validation finds with it, in one step.

const type = diagramOf(definitionOf('mindmap'), registry) as DiagramToolType;
const path = `${root}/ideas/ideas.mm`;
const text = readFileSync(path, 'utf8');
const ideas: Source = { fileName: path, text };

/** The fixture's workspace, with the map indexed as the tool type indexes it. */
const workspace = (): LinkWorkspace => {
  const links = theWorkspace();
  links.put(type.indexed!(ideas)!);
  return links;
};
const inWorkspace = (source: Source = ideas): Source => ({ ...source, links: workspace() });

const labelOf = (source: Source, id: string): string | undefined => type.view(source, {}).nodes.find((node) => node.id === id)?.labels[0]?.text;
const glyphsOf = (source: Source, id: string): string | undefined => type.view(source, {}).nodes.find((node) => node.id === id)?.labels.find((label) => label.text.includes('↪'))?.text;

describe('a map in the workspace index', () => {
  it('holds its document id, its nodes named by their text, and the link of each linked node', () => {
    const indexed = type.indexed!(ideas)!;
    const expected = mindmap(path);
    expect(indexed.documentId).toBe('m8c1u4wa');
    expect(indexed.nameProperty).toBe('text');
    expect(indexed.elements.map((element) => [element.id, element.attributes[0]])).toEqual(expected.elements.map((element) => [element.id, element.attributes[0]]));
    expect(indexed.links).toEqual(expected.links);
  });

  it('reads a linked node as a LinkedNode', () => {
    const types = type.view(ideas, {}).nodes.map((node) => node.type);
    expect(types.filter((name) => name === 'LinkedNode')).toHaveLength(8);
  });
});

describe('a map that links, in its workspace', () => {
  it('reports each link that does not resolve at its node, as the conformance fixture says', () => {
    const found = type.findings(inWorkspace()).filter((finding) => finding.rule.startsWith('link.')).map((finding) => [finding.element, finding.rule]);
    const listed = conformance.links.filter((entry) => entry.in === 'ideas/ideas.mm' && entry.finding !== undefined).map((entry) => [entry.at, entry.finding]);
    expect(found).toEqual(listed);
  });

  it('reports nothing of its links outside a workspace', () => {
    expect(type.findings(ideas).filter((finding) => finding.rule.startsWith('link.'))).toEqual([]);
  });

  it('draws the broken mark on the nodes whose link does not resolve, and the link mark on the others', () => {
    const source = inWorkspace();
    const broken = conformance.links.filter((entry) => entry.in === 'ideas/ideas.mm' && entry.finding !== undefined).map((entry) => entry.at);
    for (const id of ['ID_2', 'ID_3', 'ID_4', 'ID_5', 'ID_6', 'ID_7', 'ID_8', 'ID_9']) expect(glyphsOf(source, id), id).toBe(broken.includes(id) ? '↪⚠' : '↪');
  });

  it('labels a linked node with its target\'s current name, and a broken one with the name it caches', () => {
    const source = inWorkspace();
    expect(labelOf(source, 'ID_7')).toBe('Launch');
    expect(labelOf(source, 'ID_4')).toBe('Lost');
    expect(labelOf(ideas, 'ID_7')).toBe('Start');
  });

  it('writes what load-time validation finds with the first edit, and nothing more', () => {
    const outcome = applied(type.edit(inWorkspace(), { kind: 'rename', id: 'ID_1', text: 'Ideas and more' }, {}, false));
    const after = spliced(text, outcome.splices);
    const changed = (lines: string): string[] => lines.split('\n');
    const before = changed(text);
    const differences = changed(after).flatMap((line, index) => (line === before[index] ? [] : [line]));
    const rewritten = conformance.links.filter((entry) => entry.in === 'ideas/ideas.mm' && entry.after !== undefined && entry.after !== entry.link);
    expect(differences).toEqual([
      '<node TEXT="Ideas and more" ID="ID_1">',
      ...rewritten.flatMap((entry) => [
        ...(entry.at === 'ID_7' ? ['<node TEXT="Launch" ID="ID_7">'] : []),
        `<attribute NAME="adp-link" VALUE="${entry.after!.replaceAll('"', '&quot;')}"/>`,
      ]),
    ]);
    expect(changed(after)).toHaveLength(before.length);
  });

  it('writes nothing more when nothing differs', () => {
    const source = inWorkspace();
    const first = spliced(text, applied(type.edit(source, { kind: 'rename', id: 'ID_1', text: 'Ideas and more' }, {}, false)).splices);
    const again = applied(type.edit({ ...source, text: first }, { kind: 'rename', id: 'ID_1', text: 'Ideas' }, {}, false));
    expect(spliced(first, again.splices)).toBe(first.replace('TEXT="Ideas and more"', 'TEXT="Ideas"'));
    expect(again.splices).toHaveLength(1);
  });

  it('gives a map without a document id one with the first edit, as the central topic\'s first child element', () => {
    const plain = '<map version="freeplane 1.11.5">\n<node TEXT="Plain" ID="ID_1">\n<node TEXT="Child" ID="ID_2"/>\n</node>\n</map>';
    const source: Source = { fileName: `${root}/ideas/plain.mm`, text: plain, links: workspace() };
    const after = spliced(plain, applied(type.edit(source, { kind: 'rename', id: 'ID_2', text: 'Kid' }, {}, false)).splices);
    expect(after).toMatch(/^<map version="freeplane 1\.11\.5">\n<node TEXT="Plain" ID="ID_1">\n<attribute NAME="adp-id" VALUE="[0-9a-z]{8}"\/>\n<node TEXT="Kid" ID="ID_2"\/>\n<\/node>\n<\/map>$/);
    expect(type.indexed!({ fileName: source.fileName, text: after })!.documentId).toMatch(/^[0-9a-z]{8}$/);
  });
});

describe('the plugin writes links (the companion document, section 3.8)', () => {
  const planned = (body: string, change: PluginPlanRequest['change']): string => {
    const bytes = new TextEncoder().encode(body);
    const files = [{ relativePath: '', bytes }];
    const result = plan({ files, last: read({ files }), change });
    if ('refused' in result) throw new Error(result.refused);
    return spliced(body, result.planned.map(({ splice }) => ({ offset: splice.start, length: splice.end - splice.start, text: splice.text })));
  };

  it('adds a linked node as the last child, its link the node\'s one Freeplane attribute', () => {
    const body = '<map version="freeplane 1.11.5">\r\n<node TEXT="Root" ID="ID_1">\r\n<node TEXT="A" ID="ID_2"/>\r\n</node>\r\n</map>';
    const after = planned(body, { kind: 'add', type: 'LinkedNode', id: 'ID_x1y2z3w4', parent: 'ID_1', attributes: { text: 'Utrecht', linkedElement: '$k3f9x2ma@provinces.yaml#ut.Name=Utrecht' } });
    expect(after).toBe('<map version="freeplane 1.11.5">\r\n<node TEXT="Root" ID="ID_1">\r\n<node TEXT="A" ID="ID_2"/>\r\n<node TEXT="Utrecht" ID="ID_x1y2z3w4">\r\n<attribute NAME="adp-link" VALUE="$k3f9x2ma@provinces.yaml#ut.Name=Utrecht"/>\r\n</node>\r\n</node>\r\n</map>');
  });

  it('writes the document id after the central topic\'s formatted text', () => {
    const body = '<map version="freeplane 1.11.5">\n<node ID="ID_1"><richcontent TYPE="NODE"><html/></richcontent>\n<node TEXT="A" ID="ID_2"/>\n</node>\n</map>';
    expect(planned(body, { kind: 'setDocumentId', id: 'abcd1234' })).toBe('<map version="freeplane 1.11.5">\n<node ID="ID_1"><richcontent TYPE="NODE"><html/></richcontent>\n<attribute NAME="adp-id" VALUE="abcd1234"/>\n<node TEXT="A" ID="ID_2"/>\n</node>\n</map>');
  });

  it('writes a document id into a central topic that holds nothing', () => {
    expect(planned('<map version="freeplane 1.11.5">\n<node TEXT="R" ID="ID_1"/>\n</map>', { kind: 'setDocumentId', id: 'abcd1234' }))
      .toBe('<map version="freeplane 1.11.5">\n<node TEXT="R" ID="ID_1">\n<attribute NAME="adp-id" VALUE="abcd1234"/>\n</node>\n</map>');
  });
});
