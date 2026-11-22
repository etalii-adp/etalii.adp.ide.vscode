import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Source } from '../../../../src/core/frame/toolType';
import { carried, plugins as registry } from '../../../../src/core/plugins/index';
import type { Scene, SceneEdge, SceneNode } from '../../../../src/core/scene/scene';
import { pluginRegistry } from '../../../../src/core/tool/pluginRegistry';
import { definitionOf, diagramOf } from '../../tool/support';

// The causal loop diagram opened and drawn from its definition (etalii.adp spec 081, tasks T003 to
// T016), against what standalone's module drew for the same files: the positions and sizes of its
// recorded transcript's payloads (`fixtures/tools/causal-loop-diagram/causal-loop.transcript.json`).
// A payload names an element by its id, and gives the centre it is drawn at.

const type = diagramOf(definitionOf('causal-loop-diagram'), registry);

interface Recorded { readonly document: string; readonly payloads: readonly string[]; readonly findings: readonly string[] }
const transcript = JSON.parse(readFileSync('fixtures/tools/causal-loop-diagram/causal-loop.transcript.json', 'utf8')) as { readonly documents: readonly Recorded[] };

const examples = 'examples/causal-loop-diagram';
const fixtures = 'fixtures/tools/causal-loop-diagram';

/** A document of the transcript as a source, from the copy this repository holds; nothing for one it holds no copy of. */
function sourceOf(recorded: string): Source | undefined {
  const fixture = /\.Tests\/Fixtures\/([^/]+)\.cld$/.exec(recorded);
  if (fixture) return { fileName: `${fixture[1]}.cld`, text: readFileSync(`${fixtures}/${fixture[1]}.cld`, 'utf8') };
  const example = /^diagrams\/causal-loop-diagram\/examples\/([^/]+)\/\1\.cld$/.exec(recorded);
  if (!example) return undefined;
  const folder = `${examples}/${example[1]}`;
  const files = readdirSync(folder);
  return {
    fileName: `${example[1]}.cld`, text: readFileSync(`${folder}/${example[1]}.cld`, 'utf8'),
    ...(files.includes(`${example[1]}.adp`) ? { registration: readFileSync(`${folder}/${example[1]}.adp`, 'utf8') } : {}),
  };
}

const documents = transcript.documents.flatMap((recorded) => {
  const source = sourceOf(recorded.document);
  return source ? [{ name: recorded.document.split('/').slice(-2).join('/'), source, recorded }] : [];
});

/** What a payload says of a node: its id, its centre, and its width and height where it states them. */
function payloadOf(line: string): { readonly id: string; readonly x: number; readonly y: number; readonly width?: number; readonly height?: number; readonly fields: Record<string, unknown> } {
  const [id, , at, rest] = line.split(' | ');
  const [x, y] = at.split(', ').map(Number);
  const fields = JSON.parse(rest.slice(rest.indexOf('{'))) as Record<string, unknown>;
  return { id, x, y, ...(typeof fields.width === 'number' ? { width: fields.width } : {}), ...(typeof fields.height === 'number' ? { height: fields.height } : {}), fields };
}

const centre = (node: SceneNode): { x: number; y: number } => ({ x: node.box.x + node.box.width / 2, y: node.box.y + node.box.height / 2 });
const near = (actual: number, expected: number): boolean => Math.abs(actual - expected) < 1e-6 * Math.max(1, Math.abs(expected));
const viewOf = (source: Source): Scene => type.view(source, {});
const edgeOf = (scene: Scene, id: string): SceneEdge => {
  const edge = scene.edges.find((candidate) => candidate.id === id);
  if (!edge) throw new Error(`No edge ${id}.`);
  return edge;
};

describe('the causal loop diagram, drawn from its definition', () => {
  it('holds every document of the transcript this repository has a copy of', () => {
    // Eleven fixtures and the six examples of the module.
    expect(documents.length).toBe(17);
  });

  describe.each(documents)('$name', ({ source, recorded }) => {
    const scene = viewOf(source);
    const nodes = recorded.payloads.map(payloadOf).filter((payload) => !payload.id.startsWith('link:'));

    it('draws the variables and loops the transcript does, under the same ids', () => {
      expect(scene.nodes.map((node) => node.id).sort()).toEqual(nodes.map((payload) => payload.id).sort());
    });

    it('places each one at the centre, and gives it the size, standalone did', () => {
      const wrong = nodes.flatMap((payload) => {
        const node = scene.nodes.find((candidate) => candidate.id === payload.id);
        if (!node) return [];
        const at = centre(node);
        const same = near(at.x, payload.x) && near(at.y, payload.y)
          && (payload.width === undefined || near(node.box.width, payload.width)) && (payload.height === undefined || near(node.box.height, payload.height));
        return same ? [] : [`${payload.id}: drawn at ${at.x}, ${at.y} (${node.box.width} × ${node.box.height}), recorded at ${payload.x}, ${payload.y} (${payload.width} × ${payload.height})`];
      });
      expect(wrong).toEqual([]);
    });

    it('finds what the transcript found, in its order, with its codes, sentences and lines', () => {
      // A finding of this host counts its lines from zero, and words a severity in full; the transcript, from one and `Info`.
      const found = type.findings(source).filter((finding) => !finding.rule.startsWith('disl.'))
        .map((finding) => `${finding.line > 0 ? `line ${finding.line + 1}` : 'nowhere'} | ${finding.severity === 'information' ? 'Info' : finding.severity[0].toUpperCase() + finding.severity.slice(1)} | ${finding.rule} | ${finding.message}`);
      expect(found).toEqual(recorded.findings);
    });

    it('draws a link between the two variables the transcript joins', () => {
      const links = recorded.payloads.map(payloadOf).filter((payload) => payload.id.startsWith('link:'));
      const drawn = links.filter((link) => scene.nodes.some((node) => node.id === link.fields.fromElementId) && scene.nodes.some((node) => node.id === link.fields.toElementId));
      for (const link of drawn) {
        const edge = edgeOf(scene, link.id);
        expect([edge.source, edge.target]).toEqual([link.fields.fromElementId, link.fields.toElementId]);
      }
    });
  });
});

describe('a causal loop diagram written here', () => {
  const header = 'causal-loop 1\r\n';
  const source = (body: string): Source => ({ fileName: 'written.cld', text: header + body });

  it('names each element by its key: a variable by its name, a link by its two ends and a loop by its identifier', () => {
    const scene = viewOf(source('variable a "A"\r\nvariable b\r\nlink a -> b +\r\nlink b -> a -\r\nloop B1 \"T\" a b\r\n'));
    expect(scene.nodes.map((node) => node.id)).toEqual(['variable:a', 'variable:b', 'loop:B1']);
    expect(scene.edges.map((edge) => [edge.id, edge.source, edge.target])).toEqual([['link:a|b', 'variable:a', 'variable:b'], ['link:b|a', 'variable:b', 'variable:a']]);
  });

  it('labels a variable with its label, else its name', () => {
    const scene = viewOf(source('variable a "Alpha"\r\nvariable b\r\n'));
    expect(scene.nodes.map((node) => node.labels[0]?.text)).toEqual(['Alpha', 'b']);
  });

  it('bows a link to the left of its direction, and a flipped one to the right', () => {
    const scene = viewOf(source('variable a\r\nvariable b\r\nlink a -> b +\r\nlink b -> a + flipped\r\n'));
    const [ab, ba] = [edgeOf(scene, 'link:a|b'), edgeOf(scene, 'link:b|a')];
    // `a` is above `b` on the ring: going down, left is the screen's right.
    const control = (edge: SceneEdge): number => {
      const step = edge.path[1];
      if (step.op !== 'Q') throw new Error(`${edge.id} is no quadratic curve.`);
      return step.cx;
    };
    expect(control(ab)).toBeGreaterThan(0);
    // Flipped, going up it bows to the right, which is the screen's right too.
    expect(control(ba)).toBeGreaterThan(0);
  });

  it('marks a polarity beside the arrowhead, and nothing for an unstated one', () => {
    const scene = viewOf(source('variable a\r\nvariable b\r\nvariable c\r\nlink a -> b +\r\nlink b -> c -\r\nlink c -> a\r\n'));
    expect(scene.edges.map((edge) => edge.labels?.map((label) => label.text) ?? [])).toEqual([['+'], ['−'], []]);
  });

  it('crosses a delayed link with two bars, and a plain one with none', () => {
    const scene = viewOf(source('variable a\r\nvariable b\r\nlink a -> b + delayed\r\nlink b -> a +\r\n'));
    expect(edgeOf(scene, 'link:a|b').midMarkers?.map((mid) => mid.marker)).toEqual(['bar', 'bar']);
    expect(edgeOf(scene, 'link:b|a').midMarkers).toBeUndefined();
  });

  it('draws a link of a variable to itself as a bow over it', () => {
    const scene = viewOf(source('variable a\r\nlink a -> a +\r\n'));
    const edge = edgeOf(scene, 'link:a|a');
    const node = scene.nodes[0];
    expect(edge.path.map((step) => step.op)).toEqual(['M', 'C']);
    expect(Math.min(...edge.path.flatMap((step) => (step.op === 'C' ? [step.c1y, step.c2y] : [])))).toBeLessThan(node.box.y);
  });

  it('turns a balancing loop\'s arrow the other way', () => {
    const scene = viewOf(source('variable a\r\nvariable b\r\nlink a -> b +\r\nlink b -> a -\r\nloop B1 \"T\" a b\r\nloop R1 \"T\" a b\r\n'));
    expect(scene.nodes.filter((node) => node.type === 'Loop').map((node) => [node.icon?.icon, node.icon?.flip])).toEqual([['mdi-sync', 'horizontal'], ['mdi-sync', 'horizontal']]);
    const reinforcing = viewOf(source('variable a\r\nvariable b\r\nlink a -> b +\r\nlink b -> a +\r\nloop R1 \"T\" a b\r\n'));
    expect(reinforcing.nodes.find((node) => node.type === 'Loop')?.icon?.flip).toBe('none');
  });

  it('underlines a loop whose label disagrees with its arrows wavy, and one that agrees not at all', () => {
    const scene = viewOf(source('variable a\r\nvariable b\r\nlink a -> b +\r\nlink b -> a +\r\nloop B1 \"T\" a b\r\nloop R1 \"T\" a b\r\n'));
    const fonts = scene.nodes.filter((node) => node.type === 'Loop').map((node) => node.labels[0]?.style.font);
    expect(fonts.map((font) => [font?.decoration, font?.decorationStyle])).toEqual([['underline', 'wavy'], [undefined, undefined]]);
  });

  it('says that a diagram without variables states none yet', () => {
    expect(viewOf(source('')).notice).toBe('This causal loop diagram states no variables yet.');
    expect(viewOf(source('variable a\r\n')).notice).toBeUndefined();
  });
});

describe('the causal loop diagram\'s findings, written here', () => {
  const source = (body: string): Source => ({ fileName: 'written.cld', text: `causal-loop 1\r\n${body}` });
  const unlabelled = (scene: ReturnType<typeof type.findings>): string[] => scene.filter((finding) => finding.rule === 'causal-loop.unlabelled-loop').map((finding) => finding.message);
  const square = 'variable a\r\nvariable b\r\nvariable c\r\nvariable d\r\nlink a -> d +\r\nlink a -> b +\r\nlink b -> a +\r\nlink d -> a +\r\n';

  it('names the unlabelled loops in the order of the tool\'s cycle finder, the order of the links', () => {
    expect(unlabelled(type.findings(source(square)))).toEqual([
      'The links form a feedback loop through a → d that no loop statement names. It is reinforcing.',
      'The links form a feedback loop through a → b that no loop statement names. It is reinforcing.',
    ]);
  });

  it('names them in DISL\'s order, by member order, where the cycle finder is not carried', () => {
    const without = diagramOf(definitionOf('causal-loop-diagram'), pluginRegistry({ ...carried, celFunctions: [] }));
    expect(unlabelled(without.findings(source(square)))).toEqual([
      'The links form a feedback loop through a → b that no loop statement names. It is reinforcing.',
      'The links form a feedback loop through a → d that no loop statement names. It is reinforcing.',
    ]);
  });

  it('says why a statement cannot be read, in the tool\'s four sentences', () => {
    const found = type.findings(source('bogus\r\nlink a b\r\nlink a -> b weight=heavy\r\nvariable ""\r\n')).filter((finding) => finding.rule === 'causal-loop.unreadable-line');
    expect(found.map((finding) => [finding.line + 1, finding.message])).toEqual([
      [2, "'bogus' is not a statement this reading knows."],
      [3, "A link reads 'link <from> -> <to>', optionally followed by a polarity, 'delayed', 'flipped', a weight and a label."],
      [4, "'weight=heavy' does not read as a weight."],
      [5, 'A variable needs an id of at least one character.'],
    ]);
  });

  it('reads a link\'s note as the last word that is nothing else, quoted or not', () => {
    const text = source('variable a\r\nvariable b\r\nlink a -> b + "first" "second"\r\nlink b -> a - bare delayed\r\n');
    const note = (id: string): string | undefined => type.fields(text, [id]).find((field) => field.id === 'causal-loop.link-label')?.value;
    expect([note('link:a|b'), note('link:b|a')]).toEqual(['second', 'bare']);
  });

  it('reads a weight with a sign or without a leading digit, and shows one with an exponent as .NET does', () => {
    const text = source('variable a\r\nvariable b\r\nvariable c\r\nlink a -> b + weight=+2\r\nlink b -> c + weight=.5\r\nlink c -> a + weight=1e21\r\nlink b -> a + weight=0.000001\r\n');
    const weight = (id: string): string | undefined => type.fields(text, [id]).find((field) => field.id === 'causal-loop.link-weight')?.value;
    expect(['link:a|b', 'link:b|c', 'link:c|a', 'link:b|a'].map(weight)).toEqual(['2', '0.5', '1E+21', '1E-06']);
    expect(type.findings(text).filter((finding) => finding.rule === 'causal-loop.unreadable-line')).toEqual([]);
  });
});
