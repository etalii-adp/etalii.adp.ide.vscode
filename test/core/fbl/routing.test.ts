import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bindingOf as newBinding, bodyOf, claimsOf, type Marker } from '../../../src/core/fbl/documents/types';
import { nodeFiles } from '../../../src/core/fbl/files/nodeFiles';
import { folderFiles, recogniseFolder } from '../../../src/core/fbl/routing/folderSubject';
import { globMatches } from '../../../src/core/fbl/routing/glob';
import { markerMatches } from '../../../src/core/fbl/routing/markerEvaluator';
import { bare, candidates, readings } from '../../../src/core/fbl/routing/router';
import { allBindings, bindingOf } from './support/bindings';
import { utf8 } from './support/repository';
import { linkFolder, linkRefusal, withFolders } from './support/temporaryFolder';

// Markers (FBL 12.2), candidates (FBL 12.3), readings (FBL 9.4) and globs (FBL 10.1). Counterparts
// of standalone's Routing/Routing.Tests.cs.
const all = () => allBindings().map(({ binding }) => binding);

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
    const refused = linkRefusal();
    if (refused) context.skip(refused);
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
