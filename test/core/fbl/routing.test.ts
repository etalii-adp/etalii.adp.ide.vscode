import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDocument } from '../../../src/core/fbl/documents/documentLoader';
import { bindingOf as newBinding, bodyOf, claimsOf, type FblBinding, type Marker } from '../../../src/core/fbl/documents/types';
import { nodeFiles } from '../../../src/core/fbl/files/nodeFiles';
import { folderFiles, recogniseFolder } from '../../../src/core/fbl/routing/folderSubject';
import { globMatches } from '../../../src/core/fbl/routing/glob';
import { markerMatches } from '../../../src/core/fbl/routing/markerEvaluator';
import { bare, candidates, readings } from '../../../src/core/fbl/routing/router';
import { allBindings, bindingOf } from './support/bindings';
import { utf8 } from './support/repository';
import { linkFolder, skipWithoutLinks, withFolders } from './support/temporaryFolder';

// Markers (FBL 12.2), candidates (FBL 12.3), readings (FBL 9.4) and globs (FBL 10.1). Counterparts
// of standalone's Routing/Routing.Tests.cs.
const all = () => allBindings().map(({ binding }) => binding);

// One document with a binding for each format family (FBL 0.3), each claiming its own extensions of
// one tool type, as a designer's persistence names them (FBL 8.1). The extensions are shared with
// other formats, so each binding has the marker a file needs before it is claimed.
const claim = (extensions: string, marker: string): string => `"claims": { "extensions": ${extensions}, "shared": true, "marker": ${marker}, "origins": ["test/cards"] }`;
const rootKey = '{ "rootKey": "designer", "value": "test/cards" }';
const families = `{ "fbl": "0.3", "bindings": {
  "yaml": { ${claim('[".yaml", ".yml"]', rootKey)}, "body": { "kind": "file", "family": "yaml" }, "reader": "declared",
    "elements": [{ "name": "card", "type": "Card", "at": "/cards/*" }] },
  "json": { ${claim('[".json", ".ded"]', rootKey)}, "body": { "kind": "file", "family": "json" }, "reader": "declared",
    "elements": [{ "name": "card", "type": "Card", "at": "/cards/*" }] },
  "xml": { ${claim('[".xml"]', '{ "pattern": "^<ded\\\\s[^>]*designer=\\"test/cards\\"" }')}, "body": { "kind": "file", "family": "xml" }, "reader": "declared",
    "elements": [{ "name": "card", "type": "Card", "at": "/ded/card" }] }
} }`;

/** The bindings of the document above, in document order. A warning (a newer minor version) does not stop it loading. */
function familyBindings(): FblBinding[] {
  const { document, problems } = loadDocument(utf8(families));
  const errors = problems.filter((problem) => problem.severity === 'error');
  if (!document || errors.length > 0) throw new Error(`The document does not load: ${errors.map((problem) => `${problem.pointer}: ${problem.message}`).join('; ')}`);
  return [...document.bindings.values()];
}

describe('routing a file to its bindings', () => {
  it.each<[string, boolean]>([
    ['<map version="freeplane 1.11.5">\n<node TEXT="a"/>\n</map>\n', true],
    ['\n\n\n\n<map>\n</map>\n', true],
    ['\n\n\n\n\n<map>\n</map>\n', false],
    ['<mapping/>\n', false],
  ])('a pattern marker looks at its first lines: %j', (body, matches) => {
    // The mind map's marker, ^<map[\s>] within 5 lines.
    const marker = bindingOf('mindmap.fbl', 'freeplane').claims.marker!;
    expect(markerMatches(marker, utf8(body))).toBe(matches);
  });

  it.each<[string, boolean]>([
    ['bundle:\n  name: x\n', true],
    ['{ "bundle": { "name": "x" } }', true],
    ['other: 1\n', false],
    ['bundle: [unclosed\n', false],
  ])('a root key marker reads YAML and JSON without a binding: %j', (body, matches) => {
    const marker: Marker = { rootKey: 'bundle', lines: 0 };
    expect(markerMatches(marker, utf8(body))).toBe(matches);
  });

  it('a first line marker is matched after a byte order mark', () => {
    const marker: Marker = { firstLine: 'causal-loop', lines: 0 };
    const body = Uint8Array.of(0xef, 0xbb, 0xbf, ...utf8('causal-loop 1\n'));
    expect(markerMatches(marker, body)).toBe(true);
    expect(markerMatches(marker, utf8('# causal-loop\n'))).toBe(false);
  });

  it('a registration only binding is never a candidate', () => {
    // A bundle's resource file and a chart's Chart.yaml are claimed only through registrations.
    expect(candidates('nightly.yml', utf8('resources:\n  jobs: {}\n'), all())).toEqual([]);
    expect(candidates('Chart.yaml', utf8('apiVersion: v2\n'), all())).toEqual([]);
  });

  it('an extension is matched ignoring case', () => {
    expect(candidates('Plan.TML', utf8('elements: []\n'), all()).map((binding) => binding.name)).toEqual(['timeline']);
  });

  it('several candidates are all returned', () => {
    // Two bindings claiming the same extension.
    const a = newBinding({ name: 'a', claims: claimsOf({ extensions: ['.x'] }), body: bodyOf({ family: 'lines' }) });
    const b = newBinding({ name: 'b', claims: claimsOf({ extensions: ['.x'] }), body: bodyOf({ family: 'lines' }) });
    // The router never chooses on the caller's behalf.
    expect(candidates('file.x', new Uint8Array(), [a, b])).toEqual([a, b]);
  });

  it('a reading whose suggest matches is offered first', () => {
    const turtle = bindingOf('w3c-turtle.fbl', 'turtle');
    const skos = utf8('@prefix skos: <http://www.w3.org/2004/02/skos/core#> .\nex:s a skos:ConceptScheme .\n');
    expect(readings(turtle, skos)).toEqual(['w3c/skos', 'w3c/rdf', 'w3c/owl', 'w3c/shacl']);
    expect(bare(turtle)).toBe('w3c/rdf');
  });

  it.each<[string, string, string]>([
    ['cards.yaml', 'designer: test/cards\ncards: []\n', 'yaml'],
    ['Cards.YML', 'designer: test/cards\ncards: []\n', 'yaml'],
    ['cards.json', '{ "designer": "test/cards", "cards": [] }\n', 'json'],
    ['cards.ded', '{ "designer": "test/cards", "cards": [] }\n', 'json'],
    ['cards.xml', '<?xml version="1.0"?>\n<ded version="1" designer="test/cards">\n</ded>\n', 'xml'],
  ])('a file goes to the binding of its document that claims it: %s', (fileName, body, binding) => {
    // One candidate, so the file opens as it (FBL 12.3): the family is chosen by the claim, not by the caller.
    expect(candidates(fileName, utf8(body), familyBindings()).map((candidate) => candidate.name)).toEqual([binding]);
  });

  it.each<[string, string]>([
    // An extension no binding of the document has.
    ['cards.txt', 'designer: test/cards\ncards: []\n'],
    ['cards', 'designer: test/cards\ncards: []\n'],
    // A shared extension without the mark, or with another tool type's.
    ['cards.yaml', 'cards: []\n'],
    ['cards.yaml', 'designer: test/other\ncards: []\n'],
    ['cards.json', '{ "cards": [] }\n'],
    ['cards.xml', '<ded version="1" designer="test/other">\n</ded>\n'],
    // The mark of one family under the extension of another: the xml binding's pattern is not in a yaml body.
    ['cards.xml', 'designer: test/cards\ncards: []\n'],
  ])('a file no binding of its document claims goes to none: %s %j', (fileName, body) => {
    expect(candidates(fileName, utf8(body), familyBindings())).toEqual([]);
  });

  it.each<[string, string, boolean]>([
    ['templates/**', 'templates/a/b.yaml', true],
    ['templates/**', 'values.yaml', false],
    ['**/.helmignore', '.helmignore', true],
    ['**/.helmignore', 'charts/x/.helmignore', true],
    ['charts/*/Chart.yaml', 'charts/x/Chart.yaml', true],
    ['charts/*/Chart.yaml', 'charts/x/y/Chart.yaml', false],
    ['values*.yaml', 'values.prod.yaml', true],
    ['file?.[ab]', 'file1.a', true],
    ['file?.[!ab]', 'file1.a', false],
  ])('a glob matches as FBL defines it: %s on %s', (glob, path, matches) => {
    expect(globMatches(glob, path, false)).toBe(matches);
  });

  // Needs a symbolic link, which some systems refuse to make; the test is then skipped with that reason.
  it('a folder is recognised and its files selected without following links', (context) => {
    skipWithoutLinks(context);
    const chart = bindingOf('helm-chart.fbl', 'chart');
    withFolders(2, (folder, outside) => {
      folder.write('Chart.yaml', 'apiVersion: v2\n');
      folder.write('values.yaml', 'a: 1\n');
      folder.write('templates/deployment.yaml', 'kind: Deployment\n');
      folder.write('.git/config', 'x\n');
      folder.write('README.md', '# chart\n');
      outside.write('secret.yaml', 'x: 1\n');
      expect(linkFolder(outside.path, join(folder.path, 'templates', 'linked'))).toBeUndefined();
      const recognised = recogniseFolder(chart, folder.path, nodeFiles);
      const files = folderFiles(chart, folder.path, nodeFiles).map((file) => file.relativePath);
      // Ordinal order, .git ignored, README unselected, the link not followed.
      expect(recognised).toBe(true);
      expect(files).toEqual(['Chart.yaml', 'templates/deployment.yaml', 'values.yaml']);
      rmSync(join(folder.path, 'Chart.yaml'));
      expect(recogniseFolder(chart, folder.path, nodeFiles)).toBe(false);
    });
  });
});
