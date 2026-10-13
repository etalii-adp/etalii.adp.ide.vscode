import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { interpretBehavior, type Outcome } from '../../../../src/core/disl/behavior';
import { interpretConstraints } from '../../../../src/core/disl/constraints';
import { interpretCoordinates } from '../../../../src/core/disl/coordinates';
import { createExpressions } from '../../../../src/core/disl/expressions';
import { interpretForms } from '../../../../src/core/disl/forms';
import { interpretLayout, type LayoutPlugin, type LayoutRequest } from '../../../../src/core/disl/layout';
import { interpretMetamodel } from '../../../../src/core/disl/metamodel';
import type { Model, ModelElement, Value } from '../../../../src/core/disl/model';
import { interpretNotation, lineHeight, nodeNotation } from '../../../../src/core/disl/notation';
import { interpretPersistence, newId } from '../../../../src/core/disl/persistence';
import { loadSpecification } from '../../../../src/core/disl/specification';
import { interpretToolbox } from '../../../../src/core/disl/toolbox';
import { interpretViewpoints } from '../../../../src/core/disl/viewpoints';
import { createScene, type SceneTool } from '../../../../src/core/scene/scene';

// The mind map's definition, read by the interpreter alone (etalii.adp spec 027, task T063): no
// binding, no plugin and no document. Each construct the definition uses that the hype cycle
// graph's does not is read as it is written, and what a test expects is taken from the definition
// itself, so a number or a sentence is typed here only where it is the test's own model.

type Json = Readonly<Record<string, unknown>>;
const written = JSON.parse(readFileSync('definitions/mindmap/mindmap.dis', 'utf8')) as Json;
const at = (...path: string[]): unknown => path.reduce<unknown>((node, step) => (node as Json | undefined)?.[step], written);

const loaded = loadSpecification(written);
const specification = loaded.value;
const metamodel = interpretMetamodel(specification);
const persistence = interpretPersistence(specification, metamodel.value);
const expressions = createExpressions(specification, metamodel.value);
const coordinates = interpretCoordinates(specification, metamodel.value);
const notation = interpretNotation(specification, metamodel.value);
const layout = interpretLayout(specification);
const viewpoints = interpretViewpoints(specification, metamodel.value, { notation: notation.value, coordinates: coordinates.value, layout: layout.value });
const constraints = interpretConstraints(specification, metamodel.value, expressions);
const forms = interpretForms(specification, metamodel.value, expressions);
const toolbox = interpretToolbox(specification, metamodel.value);
const behavior = interpretBehavior(specification, metamodel.value, expressions, {
  constraints: constraints.value, layout: layout.value, coordinates: coordinates.value, persistence: persistence.value, toolbox: toolbox.value,
  notation: notation.value, viewpoints: viewpoints.value,
});
// A layout of the test's own in the place of the plugin the definition names: every node it is given, one under the other.
const requests: LayoutRequest[] = [];
const column: LayoutPlugin = {
  id: 'net.etalii.adp.freeplane.mindmapLayout',
  place: (request) => {
    requests.push(request);
    return Object.fromEntries(Object.keys(request.sizes).map((id, index) => [id, { x: 5, y: index * 100 }]));
  },
};
const sceneTool: SceneTool = { metamodel: metamodel.value, expressions, coordinates: coordinates.value, viewpoints: viewpoints.value, layouts: (id) => (id === column.id ? column : undefined) };

// A map of the test's own: a centre with a branch of two levels and a leaf.
//   centre ── branch ── twig ── bud
//          └─ leaf
const node = (id: string, text: string, parent?: string, more: Readonly<Record<string, Value>> = {}): ModelElement =>
  ({ id, type: 'Node', attributes: { text, ...more }, host: {}, ephemeral: false, line: 1, ...(parent === undefined ? {} : { parent }) });
const mapOf = (...elements: ModelElement[]): Model => ({ diagram: {}, elements, relations: [] });
const map = mapOf(node('centre', 'Centre'), node('branch', 'Branch', 'centre'), node('twig', 'Twig', 'branch'), node('bud', 'Bud', 'twig'), node('leaf', '', 'centre'));

const value = (model: Model, self: string, cel: string): unknown => {
  const result = expressions.evaluate(cel, expressions.over(model).scope(self));
  if (!result.ok) throw new Error(`\`${cel}\` could not be evaluated: ${result.error}`);
  return result.value;
};
const done = (outcome: Outcome): Extract<Outcome, { refused?: undefined }> => {
  if (outcome.refused !== undefined) throw new Error(`refused: ${outcome.refused}`);
  return outcome;
};

describe('the mind map\'s definition', () => {
  it('reads with no finding: nothing of it is unsupported, skipped or read as something else', () => {
    const findings = [loaded, metamodel, persistence, coordinates, notation, layout, viewpoints, constraints, forms, toolbox, behavior].flatMap((part) => part.findings).concat(expressions.findings);
    expect(findings.filter((finding) => finding.code.startsWith('disl.unsupported-'))).toEqual([]);
    expect(findings.map((finding) => `${finding.code}: ${finding.message}`)).toEqual([]);
  });

  it('draws a document with no finding either', () => {
    expect(createScene(sceneTool, map).findings.map((finding) => finding.message)).toEqual([]);
  });
});

describe('autoSize: "fitContent"', () => {
  const size = nodeNotation(notation.value, metamodel.value, 'Node').size;
  const padding = at('notation', 'styles', 'node', 'padding') as [number, number];
  const fontSize = at('notation', 'styles', 'node', 'font', 'size') as number;
  const [minWidth, minHeight] = at('notation', 'nodes', 'Node', 'size', 'min') as [number, number];
  // A measure of the test's own, so that a width here is a count of characters: ten units each.
  const boxOf = (model: Model, id: string) => createScene(sceneTool, model, { textWidth: (text) => text.length * 10 }).nodes.find((drawn) => drawn.id === id)!.box;

  it('is read as written, with the least size beside it', () => {
    expect(size).toMatchObject({ autoSize: 'fitContent', min: [minWidth, minHeight], resizable: false });
  });

  it('makes a node as wide as its text and the padding on both sides', () => {
    expect(boxOf(map, 'centre').width).toBeCloseTo('Centre'.length * 10 + 2 * padding[1], 6);
    expect(boxOf(map, 'branch').width).toBeCloseTo('Branch'.length * 10 + 2 * padding[1], 6);
  });

  it('keeps a node with little or no text at the least size', () => {
    expect(boxOf(map, 'leaf')).toMatchObject({ width: minWidth, height: minHeight });
    expect(boxOf(map, 'centre').height).toBe(minHeight);
  });

  it('makes a node of several lines one line higher for each, and as wide as its widest', () => {
    const lines = mapOf(node('centre', 'one\nthree\nxx'));
    const line = lineHeight(notation.value.textMetric, fontSize, notation.value.styles.node.font);
    expect(boxOf(lines, 'centre').height).toBeCloseTo(3 * line + 2 * padding[0], 6);
    expect(boxOf(lines, 'centre').width).toBeCloseTo('three'.length * 10 + 2 * padding[1], 6);
  });
});

describe('the clipboard', () => {
  it('is read as written', () => {
    expect(behavior.value.clipboard).toEqual(at('behavior', 'clipboard'));
    expect(behavior.value.clipboard).toEqual({ relations: 'internal', ids: 'regenerate' });
  });
});

describe('persistence.view', () => {
  it('is read as written: nothing stored, folding and the viewport each viewer\'s own, a fold seeded from the file', () => {
    expect(persistence.value.view).toEqual({ store: [], viewer: ['collapsed', 'viewport'], initial: { collapsed: { cel: 'self.folded' } }, bind: {} });
    expect(persistence.value.view.initial).toEqual(at('persistence', 'view', 'initial'));
  });
});

describe('the view action', () => {
  const intents = behavior.value;
  const folded = mapOf(node('centre', 'Centre'), node('branch', 'Branch', 'centre', { folded: true }), node('twig', 'Twig', 'branch'));

  it('changes this viewer\'s fold and nothing of the model', () => {
    const outcome = done(intents.operate(map, 'toggleFold', ['branch'], {}));
    expect(outcome.changes).toEqual([]);
    expect(outcome.collapsed).toEqual({ branch: true });
  });

  it('reads the viewer\'s own state before the file\'s, and the file\'s where the viewer has none', () => {
    expect(done(intents.operate(map, 'toggleFold', ['branch'], { collapsed: { branch: true } })).collapsed).toEqual({ branch: false });
    expect(done(intents.operate(folded, 'toggleFold', ['branch'], {})).collapsed).toEqual({ branch: false });
    expect(done(intents.operate(folded, 'toggleFold', ['branch'], { collapsed: { branch: false } })).collapsed).toEqual({ branch: true });
  });

  it('is offered in a read-only document, since it writes nothing', () => {
    expect(done(intents.operate(map, 'toggleFold', ['branch'], { env: { readOnly: true } })).collapsed).toEqual({ branch: true });
  });

  it('is named by what it will do: one entry of the menu, "Collapse" or "Expand"', () => {
    const entries = (model: Model, id: string, collapsed?: Readonly<Record<string, boolean>>) =>
      intents.menu(model, id, collapsed ? { collapsed } : {}).groups.flat().filter((entry) => entry.operation === 'toggleFold').map((entry) => entry.label);
    expect(entries(map, 'branch')).toEqual(['Collapse']);
    expect(entries(map, 'branch', { branch: true })).toEqual(['Expand']);
    expect(entries(folded, 'branch')).toEqual(['Expand']);
    expect(entries(map, 'leaf')).toEqual([]);
    expect(intents.availability(map, 'toggleFold', ['branch'], { collapsed: { branch: true } }).label).toBe('Expand');
  });

  it('is not run on a node with nothing to fold', () => {
    expect(intents.operate(map, 'toggleFold', ['leaf'], {}).refused).toEqual(expect.any(String));
  });
});

describe('the id prefix', () => {
  it('is read as written and starts every id that is made', () => {
    expect(persistence.value.ids).toMatchObject({ strategy: 'uuid-v4', prefix: at('persistence', 'ids', 'prefix'), encoding: 'base36' });
    expect(newId(persistence.value, 'Node')).toMatch(/^ID_[0-9a-z]{25}$/);
    expect(done(behavior.value.operate(map, 'addChild', ['leaf'], {})).created[0]).toMatch(/^ID_[0-9a-z]{25}$/);
  });
});

describe('descendants()', () => {
  it('is every node under a node, at any depth, in the order of the document', () => {
    expect(value(map, 'centre', 'self.descendants().map(d, d.id)')).toEqual(['branch', 'twig', 'bud', 'leaf']);
    expect(value(map, 'branch', 'self.descendants().map(d, d.id)')).toEqual(['twig', 'bud']);
    expect(value(map, 'bud', 'self.descendants().size()')).toBe(0);
  });

  it('counts what a deletion takes with it, which the question names', () => {
    expect(behavior.value.deletion(map, ['branch'])).toMatchObject({
      confirm: { title: at('behavior', 'deletion', 'Node', 'confirm', 'title'), message: "Delete 'Branch' and the 2 nodes under it? You can undo this.", confirmLabel: 'Delete', danger: true },
    });
    expect(behavior.value.deletion(map, ['twig']).confirm?.message).toBe("Delete 'Twig' and the 1 nodes under it? You can undo this.");
    expect(behavior.value.deletion(map, ['bud']).confirm).toBeUndefined();
  });

  it('keeps a node out of its own branch', () => {
    const rule = (child: string, parent: string): unknown => {
      const result = expressions.evaluate(at('constraints', 'rules', '3', 'rule') as string, expressions.over(map).scope(undefined, { child: expressions.over(map).element(child), parent: expressions.over(map).element(parent) }));
      return result.ok ? result.value : result.error;
    };
    expect(rule('branch', 'bud')).toBe(false);
    expect(rule('branch', 'leaf')).toBe(true);
  });
});

describe('a layout named as a plugin', () => {
  const declared = at('layout', 'algorithms', 'mindmap') as Json;

  it('is read as written: the plugin\'s id, the spacing and the options that are the plugin\'s own', () => {
    expect(layout.findings).toEqual([]);
    expect(layout.value).toMatchObject({ default: 'mindmap', trigger: 'always', respect: 'none' });
    expect(layout.value.algorithms.mindmap).toMatchObject({
      name: 'mindmap', algorithm: declared.algorithm, plugin: 'net.etalii.adp.freeplane.mindmapLayout', spacing: declared.spacing, options: declared.options,
    });
  });

  it('is the layout of the one viewpoint', () => {
    expect(viewpoints.value.all[viewpoints.value.default].layout?.plugin).toBe('net.etalii.adp.freeplane.mindmapLayout');
  });

  it('is given what is drawn, with the sizes of the notation, the spacing and the options, and places each node by its top-left', () => {
    requests.length = 0;
    const scene = createScene(sceneTool, map, { collapsed: { branch: true } });
    expect(requests).toHaveLength(1);
    expect(requests[0].model.elements.map((element) => element.id)).toEqual(['centre', 'branch', 'leaf']);
    expect(Object.keys(requests[0].sizes)).toEqual(['centre', 'branch', 'leaf']);
    expect(requests[0].sizes.leaf).toEqual({ width: 32, height: 31.6 });
    expect(requests[0]).toMatchObject({ spacing: declared.spacing, options: declared.options });
    expect(scene.nodes.map((drawn) => [drawn.id, drawn.box.x, drawn.box.y])).toEqual([['centre', 5, 0], ['branch', 5, 100], ['leaf', 5, 200]]);
  });

  it('may size a node it places', () => {
    const sizing: SceneTool = { ...sceneTool, layouts: () => ({ id: column.id, place: () => ({ centre: { x: 1, y: 2, width: 300, height: 40 }, leaf: { x: 7, y: 8 } }) }) };
    const scene = createScene(sizing, map);
    expect(scene.nodes.find((drawn) => drawn.id === 'centre')?.box).toEqual({ x: 1, y: 2, width: 300, height: 40 });
    expect(scene.nodes.find((drawn) => drawn.id === 'leaf')?.box).toEqual({ x: 7, y: 8, width: 32, height: 31.6 });
  });

  it('that is not there leaves the nodes where they are, and says so', () => {
    const without: SceneTool = { ...sceneTool, layouts: () => undefined };
    expect(createScene(without, map).findings.map((finding) => finding.code)).toEqual(['disl.scene']);
  });
});

// What the definition uses beside the seven constructs task T063 names, and the scene must read to draw a map at all.
describe('what else the definition is drawn from', () => {
  const scene = createScene(sceneTool, map);

  it('a derived relation: one branch for each node with a parent, from the parent to the node', () => {
    expect(scene.edges.map((edge) => [edge.type, edge.source, edge.target])).toEqual([
      ['Branch', 'centre', 'branch'], ['Branch', 'branch', 'twig'], ['Branch', 'twig', 'bud'], ['Branch', 'centre', 'leaf'],
    ]);
    expect(scene.edges[0].id).toBe('Branch:centre->branch');
  });

  it('an arc in a custom shape: the box has round corners, not cut ones', () => {
    const shape = scene.nodes[0].shape;
    expect(shape.kind).toBe('path');
    // Four straight sides and four corners, each corner a curve.
    expect(shape.kind === 'path' ? shape.commands.map((command) => command.op).filter((op) => op === 'C' || op === 'Q').length : 0).toBeGreaterThanOrEqual(4);
  });

  it('a container that can be folded: a node with children says so, a leaf does not', () => {
    const fold = (drawn: typeof scene, id: string) => drawn.nodes.find((candidate) => candidate.id === id)?.fold;
    expect([fold(scene, 'centre'), fold(scene, 'branch'), fold(scene, 'bud'), fold(scene, 'leaf')]).toEqual(['unfolded', 'unfolded', undefined, undefined]);
    const folded = createScene(sceneTool, map, { collapsed: { branch: true } });
    expect(folded.nodes.map((drawn) => drawn.id)).toEqual(['centre', 'branch', 'leaf']);
    expect(fold(folded, 'branch')).toBe('folded');
    expect(folded.edges.map((edge) => edge.target)).toEqual(['branch', 'leaf']);
  });

  it('the glyphs of a node, which read the viewer\'s fold', () => {
    const glyphs = (collapsed: Readonly<Record<string, boolean>>, id: string) =>
      createScene(sceneTool, mapOf(node('centre', 'Centre', undefined, { notes: 'a note' }), node('branch', 'Branch', 'centre', { link: 'a.md' }), node('twig', 'Twig', 'branch')), { collapsed })
        .nodes.find((drawn) => drawn.id === id)!.labels.find((label) => label.id === 'indicators')?.text;
    expect(glyphs({}, 'centre')).toBe('•');
    expect(glyphs({}, 'branch')).toBe('↗');
    expect(glyphs({ branch: true }, 'branch')).toBe('↗ ⊕');
    expect(glyphs({ centre: true }, 'centre')).toBe('•  ⊕');
  });
});
