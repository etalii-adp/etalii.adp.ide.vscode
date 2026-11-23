import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EditRequest, Finding, Source } from '../../../../src/core/frame/toolType';
import { plugins as registry } from '../../../../src/core/plugins/index';
import { definitionOf, diagramOf, spliced } from '../../tool/support';

// The dependency graph opened from its definition (etalii.adp spec 088, tasks T008 to T012), against
// what standalone's module found for the same files: the findings of its parity transcript
// (`fixtures/tools/dependency-graph/dependency-graph.transcript.json`), in their order, with their
// codes and sentences.

const type = diagramOf(definitionOf('dependency-graph'), registry);

interface Recorded { readonly document: string; readonly sha256: string; readonly findings?: readonly string[] }
const transcript = JSON.parse(readFileSync('fixtures/tools/dependency-graph/dependency-graph.transcript.json', 'utf8')) as { readonly documents: readonly Recorded[] };

const fixtures = 'fixtures/tools/dependency-graph';
const inline = 'fixtures/tools/dependency-graph-inline';

/** A document of the transcript as a source, from the copy this repository holds. */
function sourceOf(recorded: string): Source {
  const written = /^inline\/(.+)$/.exec(recorded);
  if (written) return { fileName: `${written[1]}.dgr`, text: readFileSync(`${inline}/${written[1]}.dgr`, 'utf8') };
  const fixture = /\.Tests\/Fixtures\/([^/]+)\.dgr$/.exec(recorded);
  if (fixture) return { fileName: `${fixture[1]}.dgr`, text: readFileSync(`${fixtures}/${fixture[1]}.dgr`, 'utf8') };
  return { fileName: 'services.dgr', text: readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8') };
}

const documents = transcript.documents.map((recorded) => ({ name: recorded.document.split('/').slice(-1)[0], source: sourceOf(recorded.document), recorded }));

/** A finding as the transcript writes it, without its place where the transcript names an element rather than a line. */
const shown = (finding: Finding, recorded: string | undefined): string => {
  const severity = finding.severity === 'information' ? 'Info' : finding.severity[0].toUpperCase() + finding.severity.slice(1);
  const place = recorded?.startsWith('line ') ? `line ${finding.line + 1}` : recorded?.split(' | ')[0];
  return `${place} | ${severity} | ${finding.rule} | ${finding.message}`;
};

describe('the dependency graph, read from its definition', () => {
  it('reads its definition with no finding', () => {
    expect(type.findings({ fileName: 'empty.dgr', text: 'elements: []\nrelations: []\n' })).toEqual([]);
  });

  it('opens the example with its ten nodes and eleven dependencies', () => {
    const scene = type.view({ fileName: 'services.dgr', text: readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8') }, {});
    expect(scene.nodes.length).toBe(10);
    expect(scene.edges.length).toBe(11);
  });

  it('refuses every edit of a file that does not read, naming the file, in the standalone host\'s words', () => {
    const broken: Source = { fileName: 'not-yaml.dgr', text: readFileSync(`${inline}/not-yaml.dgr`, 'utf8') };
    const refusal = { kind: 'refused', sentence: 'not-yaml.dgr could not be read, so it cannot be edited.' };
    expect(type.edit(broken, { kind: 'action', action: 'dependencies.add-element', x: 480.25, y: -60 }, {}, false)).toEqual(refusal);
    expect(type.edit(broken, { kind: 'rename', id: 'a', text: 'Nobody' }, {}, false)).toEqual(refusal);
  });

  it('judges a typed X and Row by the text typed, as the rows\' rules read it (DISL 9.3)', () => {
    const services: Source = { fileName: 'services.dgr', text: readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8') };
    const set = (field: string, value: string) => type.edit(services, { kind: 'setField', id: 'checkout-web', field, value }, {}, false).kind;
    expect(['1234.5', '-2', '0.00001', '1e21'].map((value) => set('dependencies.x', value))).toEqual(['applied', 'applied', 'applied', 'applied']);
    expect(set('dependencies.row', '-2')).toBe('applied');
    expect(type.edit(services, { kind: 'setField', id: 'checkout-web', field: 'dependencies.row', value: '1.5' }, {}, false)).toEqual({ kind: 'refused', sentence: "'1.5' is not a number this graph can place a node at." });
  });

  it('refuses a dependency of a node on itself, and checks a dependency on a node made in the same edit against that node', () => {
    const services: Source = { fileName: 'services.dgr', text: readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8') };
    expect(type.edit(services, { kind: 'connect', from: 'checkout-web', to: 'checkout-web' }, {}, false)).toEqual({ kind: 'refused', sentence: 'A node cannot depend on itself.' });
    expect(type.edit(services, { kind: 'action', action: 'dependencies.add-after', id: 'checkout-web' }, {}, false).kind).toBe('applied');
  });

  it('draws a dependency by the anchor it leaves: out of the right the dragged node depends, out of the left it is depended on', () => {
    const graph: Source = { fileName: 'pair.dgr', text: 'elements:\n  - id: a\n    label: A\n    x: 0\n    row: 0\n  - id: b\n    label: B\n    x: 240\n    row: 1\nrelations: []\n' };
    const drawn = (request: EditRequest): string => {
      const outcome = type.edit(graph, request, {}, false);
      return outcome.kind === 'applied' ? spliced(graph.text, outcome.splices).split('relations:')[1].replace(/id: \S+/g, 'id: *') : JSON.stringify(outcome);
    };
    expect(drawn({ kind: 'connect', from: 'a', to: 'b', fromAnchor: 'right' })).toBe('\n  - id: *\n    from: a\n    to: b\n');
    expect(drawn({ kind: 'connect', from: 'a', to: 'b', fromAnchor: 'left' })).toBe('\n  - id: *\n    from: b\n    to: a\n');
  });

  it('makes the other node where a line is let go on empty canvas, and the dependency with it, as one edit', () => {
    const graph: Source = { fileName: 'one.dgr', text: 'elements:\n  - id: a\n    label: A\n    x: 0\n    row: 0\nrelations: []\n' };
    const made = (fromAnchor: string): string => {
      const outcome = type.edit(graph, { kind: 'connect', from: 'a', to: '', fromAnchor, toPoint: { x: -120.5, y: 180 } }, {}, false);
      if (outcome.kind !== 'applied') return JSON.stringify(outcome);
      const text = spliced(graph.text, outcome.splices);
      const added = /- id: (\S+)\n    label: New node\n    x: -120.5\n    row: 3\n/.exec(text)?.[1] ?? 'no node';
      return text.split('relations:')[1].replaceAll(added, 'new').replace(/id: \S+/g, 'id: *');
    };
    expect(made('right')).toBe('\n  - id: *\n    from: a\n    to: new\n');
    expect(made('left')).toBe('\n  - id: *\n    from: new\n    to: a\n');
  });

  it('holds every document of the transcript: twelve fixtures, the example and the 26 inline documents', () => {
    expect(documents.length).toBe(39);
  });

  it('holds each document as the transcript recorded it, byte for byte', () => {
    const changed = documents.filter(({ source, recorded }) => createHash('sha256').update(source.text, 'utf8').digest('hex') !== recorded.sha256.toLowerCase());
    expect(changed.map(({ recorded }) => recorded.document)).toEqual([]);
  });

  // Two documents differ, as `docs/disl-support.md` lists: the message of a file that is not YAML is the YAML reader's own,
  // and a node and a dependency that share an id, the dependency written first, are read in the file's order (etalii.adp #791).
  const differing = ['inline/not-yaml', 'inline/relations-before-elements'];
  describe.each(documents.filter(({ recorded }) => !differing.includes(recorded.document)))('$name', ({ source, recorded }) => {
    it('finds what the transcript found, in its order, with its codes and sentences', () => {
      const expected = recorded.findings ?? [];
      const found = type.findings(source).filter((finding) => !finding.rule.startsWith('disl.'));
      expect(found.map((finding, index) => shown(finding, expected[index]))).toEqual(expected);
    });
  });
});
