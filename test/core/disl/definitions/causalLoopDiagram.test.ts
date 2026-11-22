import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Source } from '../../../../src/core/frame/toolType';
import { plugins as registry } from '../../../../src/core/plugins/index';
import type { Scene, SceneEdge, SceneNode } from '../../../../src/core/scene/scene';
import { definitionOf, diagramOf } from '../../tool/support';

// The causal loop diagram opened and drawn from its definition (etalii.adp spec 081, tasks T003 to
// T016), against what standalone's module drew for the same files: the positions and sizes of its
// recorded transcript's payloads (`fixtures/tools/causal-loop-diagram/causal-loop.transcript.json`).
// A payload names an element by its id, and gives the centre it is drawn at.

const type = diagramOf(definitionOf('causal-loop-diagram'), registry);

interface Recorded { readonly document: string; readonly payloads: readonly string[] }
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

  it('says that a diagram without variables states none yet', () => {
    expect(viewOf(source('')).notice).toBe('This causal loop diagram states no variables yet.');
    expect(viewOf(source('variable a\r\n')).notice).toBeUndefined();
  });
});
