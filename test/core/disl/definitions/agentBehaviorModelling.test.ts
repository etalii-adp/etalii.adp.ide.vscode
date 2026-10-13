import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyChanges, interpretBehavior, type Outcome, type Situation } from '../../../../src/core/disl/behavior';
import { interpretConstraints } from '../../../../src/core/disl/constraints';
import { interpretCoordinates } from '../../../../src/core/disl/coordinates';
import { createExpressions } from '../../../../src/core/disl/expressions';
import { formFor, interpretForms, rowsOf } from '../../../../src/core/disl/forms';
import { interpretLayout } from '../../../../src/core/disl/layout';
import { interpretMetamodel } from '../../../../src/core/disl/metamodel';
import type { Model, ModelElement, Value } from '../../../../src/core/disl/model';
import { interpretNotation } from '../../../../src/core/disl/notation';
import { derivedIds, interpretPersistence } from '../../../../src/core/disl/persistence';
import { loadSpecification } from '../../../../src/core/disl/specification';
import { interpretToolbox } from '../../../../src/core/disl/toolbox';
import { interpretViewpoints } from '../../../../src/core/disl/viewpoints';
import { createScene, type Scene, type SceneTool } from '../../../../src/core/scene/scene';

// Agent Behavior Modelling's definition, read by the interpreter alone (etalii.adp spec 027, task
// T121): no binding, no plugin and no document. Each construct the definition uses that no other
// definition does is read as it is written: `anchor.sides`, the derived id strategy, the `tidyTree`
// layout, parent placements and retyping, with what its menus and its form need beside them. What
// a test expects is taken from the definition itself, so a number or a sentence is typed here only
// where it is the test's own model.

type Json = Readonly<Record<string, unknown>>;
const written = JSON.parse(readFileSync('definitions/agent-behavior-modelling/agent-behavior-modelling.dis', 'utf8')) as Json;
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
const sceneTool: SceneTool = { metamodel: metamodel.value, expressions, coordinates: coordinates.value, viewpoints: viewpoints.value };

// A tree of the test's own, each node named by the place the definition derives for it.
//   1 Sequence ─┬─ 1.1 Check
//               ├─ 1.2 Fallback ─┬─ 1.2.1 Do
//               │                └─ 1.2.2 Retry ── 1.2.2.1 AskUser
//               └─ 1.3 Guard
const node = (id: string, type: string, parent?: string, more: Readonly<Record<string, Value>> = {}): ModelElement =>
  ({ id, type, attributes: { label: `${type} ${id}`, ...more }, host: {}, ephemeral: false, line: 1, ...(parent === undefined ? {} : { parent }) });
const treeOf = (...elements: ModelElement[]): Model => ({ diagram: {}, elements, relations: [] });
const tree = treeOf(
  node('1', 'Sequence'), node('1.1', 'Check', '1'), node('1.2', 'Fallback', '1'), node('1.2.1', 'Do', '1.2'),
  node('1.2.2', 'Retry', '1.2', { attempts: 2 }), node('1.2.2.1', 'AskUser', '1.2.2'), node('1.3', 'Guard', '1'),
);

const spacing = at('layout', 'algorithms', 'tree', 'spacing') as { readonly node: number; readonly layer: number; readonly component: number };
const minGap = at('layout', 'algorithms', 'tree', 'tidyTree', 'rows', 'minGap') as number;
const [width, height] = at('notation', 'nodes', 'Sequence', 'size', 'default') as [number, number];

const sceneOf = (model: Model, corners: Readonly<Record<string, { x: number; y: number }>> = {}): Scene => createScene(sceneTool, model, { corners });
const boxOf = (scene: Scene, id: string) => scene.nodes.find((drawn) => drawn.id === id)!.box;
/** Where an intent takes place: every node where the scene draws it. */
const situationOf = (model: Model, corners: Readonly<Record<string, { x: number; y: number }>> = {}): Situation => {
  const scene = sceneOf(model, corners);
  return { bounds: (id) => scene.nodes.find((drawn) => drawn.id === id)?.box };
};
const done = (outcome: Outcome): Extract<Outcome, { refused?: undefined }> => {
  if (outcome.refused !== undefined) throw new Error(`refused: ${outcome.refused}`);
  return outcome;
};
const refusal = (outcome: Outcome): string => {
  if (outcome.refused === undefined) throw new Error('not refused');
  return outcome.refused;
};

describe('Agent Behavior Modelling\'s definition', () => {
  it('reads with no finding: nothing of it is unsupported, skipped or read as something else', () => {
    const findings = [loaded, metamodel, persistence, coordinates, notation, layout, viewpoints, constraints, forms, toolbox, behavior].flatMap((part) => part.findings).concat(expressions.findings);
    expect(findings.filter((finding) => finding.code.startsWith('disl.unsupported-'))).toEqual([]);
    expect(findings.map((finding) => `${finding.code}: ${finding.message}`)).toEqual([]);
  });

  it('draws a document with no finding either', () => {
    expect(sceneOf(tree).findings.map((finding) => finding.message)).toEqual([]);
  });
});

describe('the derived id strategy (DISL 11.5.2)', () => {
  it('is read with its expression', () => {
    expect(persistence.value.ids.strategy).toBe('derived');
    expect(persistence.value.ids.expression).toBe(at('persistence', 'ids', 'expression'));
  });

  it('gives every element the id its expression computes, ancestors before descendants, and says which ids changed', () => {
    // The second child of the root moved to the front, and a node added under it, each still under the id it had or was made with.
    const moved = treeOf(
      node('1', 'Sequence'), node('1.2', 'Fallback', '1'), node('1.2.1', 'Do', '1.2'), node('1.2.2', 'Retry', '1.2', { attempts: 2 }), node('1.2.2.1', 'AskUser', '1.2.2'),
      node('new', 'Check', '1.2'), node('1.1', 'Check', '1'), node('1.3', 'Guard', '1'),
    );
    const { model, renamed } = derivedIds(persistence.value, expressions, moved);
    expect(model.elements.map((element) => [element.id, element.parent])).toEqual([
      ['1', undefined], ['1.1', '1'], ['1.1.1', '1.1'], ['1.1.2', '1.1'], ['1.1.2.1', '1.1.2'], ['1.1.3', '1.1'], ['1.2', '1'], ['1.3', '1'],
    ]);
    expect(Object.fromEntries(renamed)).toEqual({ '1.2': '1.1', '1.2.1': '1.1.1', '1.2.2': '1.1.2', '1.2.2.1': '1.1.2.1', new: '1.1.3', '1.1': '1.2' });
  });

  it('changes nothing of a model whose ids are the derived ones', () => {
    const { model, renamed } = derivedIds(persistence.value, expressions, tree);
    expect(model).toBe(tree);
    expect(renamed.size).toBe(0);
  });

  it('names what an intent created by its derived id, in the model after it and in what it asks to be selected', () => {
    const outcome = done(behavior.value.operate(tree, 'addChild', ['1.2'], situationOf(tree), undefined, { kind: 'Check' }));
    expect(outcome.created).toEqual(['1.2.3']);
    expect(outcome.after.elements.find((element) => element.id === '1.2.3')).toMatchObject({ type: 'Check', parent: '1.2', attributes: { label: 'New question' } });
    expect(outcome.effects).toEqual([{ kind: 'select', elements: ['1.2.3'] }, { kind: 'editLabel', elements: ['1.2.3'] }]);
    // The change itself is made of the document as it was read: the new node under the id it was made with.
    expect(outcome.changes).toMatchObject([{ kind: 'add', type: 'Check', parent: '1.2' }]);
  });
});

describe('the `tidyTree` layout (DISL 10.3)', () => {
  it('places each node\'s children left to right in model order, a parent centred over its first and last child, the leftmost node at 0', () => {
    const scene = sceneOf(tree);
    // 1.1 is a leaf, so the children of 1.2 tuck in under it: tidy, not boxed.
    expect(boxOf(scene, '1.1')).toEqual({ x: 0, y: height + spacing.layer, width, height });
    expect(boxOf(scene, '1.2').x).toBe(width + spacing.node);
    expect(boxOf(scene, '1.2.2').x - boxOf(scene, '1.2.1').x).toBe(width + spacing.node);
    expect(boxOf(scene, '1.2').x).toBe((boxOf(scene, '1.2.1').x + boxOf(scene, '1.2.2').x) / 2);
    expect(boxOf(scene, '1.2.2.1').x).toBe(boxOf(scene, '1.2.2').x);
    expect(boxOf(scene, '1.3').x).toBe(boxOf(scene, '1.2').x + width + spacing.node);
    expect(boxOf(scene, '1').x).toBe((boxOf(scene, '1.1').x + boxOf(scene, '1.3').x) / 2);
    expect(Math.min(...scene.nodes.map((drawn) => drawn.box.x))).toBe(0);
  });

  it('hangs each row `spacing.layer` below the bottom of its parent, the roots at 0', () => {
    const scene = sceneOf(tree);
    const depth = (id: string): number => id.split('.').length - 1;
    for (const drawn of scene.nodes) expect(drawn.box.y, drawn.id).toBe(depth(drawn.id) * (height + spacing.layer));
  });

  it('packs several roots `spacing.component` apart, in one row', () => {
    const scene = sceneOf(treeOf(node('1', 'Do'), node('2', 'Sequence'), node('2.1', 'Do', '2')));
    expect(boxOf(scene, '1')).toMatchObject({ x: 0, y: 0 });
    expect(boxOf(scene, '2')).toMatchObject({ x: width + spacing.component, y: 0 });
  });

  it('draws a row at the first height stored for any of its nodes, and what is beneath hangs from there', () => {
    const scene = sceneOf(tree, { '1.2': { x: 999, y: 300 } });
    for (const id of ['1.1', '1.2', '1.3']) expect(boxOf(scene, id).y, id).toBe(300);
    expect(boxOf(scene, '1.2.1').y).toBe(300 + height + spacing.layer);
    expect(boxOf(scene, '1.2.2.1').y).toBe(300 + 2 * (height + spacing.layer));
    // Across, the place is always the computed one.
    expect(boxOf(scene, '1.2').x).toBe(boxOf(sceneOf(tree), '1.2').x);
    expect(scene.nodes.find((drawn) => drawn.id === '1.2')!.pinned).toBe(true);
    expect(scene.nodes.find((drawn) => drawn.id === '1.1')!.pinned).toBe(false);
  });

  it('never draws a row closer to its parent than `rows.minGap`', () => {
    const scene = sceneOf(tree, { '1.1': { x: 0, y: -500 } });
    expect(boxOf(scene, '1.1').y).toBe(height + minGap);
    expect(boxOf(scene, '1.3').y).toBe(height + minGap);
  });

  it('says of every node what a drag of it carries, and gives the tree a drag is previewed from', () => {
    const scene = sceneOf(tree);
    expect(scene.tree).toMatchObject({ spacing: { node: spacing.node, layer: spacing.layer, component: spacing.component }, rows: { minGap } });
    expect(scene.tree!.nodes.map((entry) => [entry.id, entry.parent])).toEqual(tree.elements.map((element) => [element.id, element.parent]));
  });
});

describe('`anchor.sides` and the line of a derived relation', () => {
  it('draws a line from the middle of the parent\'s bottom to the middle of the child\'s top, at right angles', () => {
    const scene = sceneOf(tree);
    const edge = scene.edges.find((drawn) => drawn.id === 'child:1.2')!;
    const [parent, child] = [boxOf(scene, '1'), boxOf(scene, '1.2')];
    expect(edge.from).toMatchObject({ node: '1', side: 'bottom', x: parent.x + width / 2, y: parent.y + height });
    expect(edge.to).toMatchObject({ node: '1.2', side: 'top', x: child.x + width / 2, y: child.y });
    expect(edge.routing).toBe('orthogonal');
    const middle = (edge.from!.y + edge.to!.y) / 2;
    expect(edge.path).toEqual([
      { op: 'M', x: edge.from!.x, y: edge.from!.y }, { op: 'L', x: edge.from!.x, y: middle }, { op: 'L', x: edge.to!.x, y: middle }, { op: 'L', x: edge.to!.x, y: edge.to!.y },
    ]);
    expect(edge.targetMarker).toBe(at('notation', 'edges', 'Child', 'targetMarker'));
  });

  it('draws the shapes the definition names: a superellipse, a hexagon, a pill, a parallelogram and its own diode', () => {
    const scene = sceneOf(treeOf(node('1', 'Sequence'), node('1.1', 'Retry', '1'), node('1.2', 'Check', '1'), node('1.3', 'AskUser', '1'), node('1.4', 'Delegate', '1'), node('1.5', 'Do', '1')));
    const shape = (id: string) => scene.nodes.find((drawn) => drawn.id === id)!.shape;
    expect(shape('1')).toMatchObject({ kind: 'path', name: 'superellipse' });
    expect(shape('1.1')).toMatchObject({ kind: 'path', name: 'hexagon' });
    expect(shape('1.2')).toMatchObject({ kind: 'rect', name: 'pill' });
    expect(shape('1.3')).toMatchObject({ kind: 'path', name: 'parallelogram' });
    expect(shape('1.4')).toMatchObject({ kind: 'path', name: 'diode' });
    expect(shape('1.5')).toMatchObject({ kind: 'rect', name: 'rect' });
    // A parallelogram leans to the right by its skew, a fraction of its width.
    const skew = at('notation', 'nodes', 'AskUser', 'shape', 'params', 'skew') as number;
    const leaning = shape('1.3');
    const box = boxOf(scene, '1.3');
    expect(leaning.kind === 'path' && leaning.commands.slice(0, 4)).toEqual([
      { op: 'M', x: box.x + skew * width, y: box.y }, { op: 'L', x: box.x + width, y: box.y }, { op: 'L', x: box.x + (1 - skew) * width, y: box.y + height }, { op: 'L', x: box.x, y: box.y + height },
    ]);
    // A superellipse touches the middle of each side of its box.
    const squircle = shape('1');
    const points = squircle.kind === 'path' ? squircle.commands.flatMap((command) => (command.op === 'Z' ? [] : [command])) : [];
    expect(Math.min(...points.map((point) => point.x))).toBeCloseTo(boxOf(scene, '1').x, 6);
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(boxOf(scene, '1').y + height, 6);
  });
});

describe('parent placements (DISL 9.1)', () => {
  const refusalOf = at('behavior', 'placements', 'underNearestAbove', 'refusal') as string;

  it('puts a dropped node under the nearest node above the drop that takes another child, among its children by where it landed', () => {
    const scene = sceneOf(tree);
    const under = boxOf(scene, '1.2');
    // Below 1.2, between its two children: the second of three.
    const outcome = done(behavior.value.create(tree, 'check', { x: under.x + width / 2, y: under.y + height + 100 }, situationOf(tree)));
    expect(outcome.changes).toMatchObject([{ kind: 'add', type: 'Check', parent: '1.2', position: { index: 1 }, attributes: { label: at('toolbox', 'groups', '0', 'tools', '7', 'initial', 'label') } }]);
    expect(outcome.created).toEqual(['1.2.2']);
    expect(outcome.after.elements.filter((element) => element.parent === '1.2').map((element) => [element.id, element.type])).toEqual([['1.2.1', 'Do'], ['1.2.2', 'Check'], ['1.2.3', 'Retry']]);
    // A tool that says `after: "none"` asks for nothing, and a node the layout places is not pinned by a drop.
    expect(outcome.effects).toEqual([]);
    expect(outcome.view).toEqual([]);
  });

  it('takes the first node of an empty tree as its root, and refuses a drop no node is above with the placement\'s sentence', () => {
    const empty = treeOf();
    expect(done(behavior.value.create(empty, 'sequence', { x: 10, y: 10 }, situationOf(empty))).changes).toMatchObject([{ kind: 'add', type: 'Sequence' }]);
    expect(done(behavior.value.create(empty, 'sequence', { x: 10, y: 10 }, situationOf(empty))).created).toEqual(['1']);
    expect(refusal(behavior.value.create(tree, 'check', { x: 0, y: -50 }, situationOf(tree)))).toBe(refusalOf);
  });

  it('places what an operation creates with `place` the same way, at the point it was invoked at', () => {
    const scene = sceneOf(tree);
    const under = boxOf(scene, '1.3');
    const outcome = done(behavior.value.operate(tree, 'addHere', [], situationOf(tree), { x: under.x + 10, y: under.y + height + 40 }, { kind: 'Do' }));
    expect(outcome.changes).toMatchObject([{ kind: 'add', type: 'Do', parent: '1.3', position: { index: 0 } }]);
    expect(outcome.effects).toEqual([{ kind: 'select', elements: ['1.3.1'] }, { kind: 'editLabel', elements: ['1.3.1'] }]);
  });
});

describe('the menus', () => {
  const kinds = ['Sequence', 'Fallback', 'Parallel', 'Retry', 'RepeatUntil', 'Guard', 'Approval', 'Check', 'Do', 'AskUser', 'Delegate'];

  it('repeat an entry for each item of its `forEach`, each with its label and its arguments, in the groups the entries declare', () => {
    const { groups } = behavior.value.menu(tree, '1.2', situationOf(tree));
    expect(groups.map((group) => group.length)).toEqual([5, kinds.length, 1]);
    expect(groups[1].map((entry) => [entry.operation, entry.args])).toEqual(kinds.map((kind) => ['addChild', { kind }]));
    expect(groups[1][3].label).toBe('Add child: Retry');
    expect(groups[1][0].label).toBe('Add child: Do in order');
    // A leaf, and a wrapper that has its child, take no other: the entries are not shown.
    expect(behavior.value.menu(tree, '1.1', situationOf(tree)).groups.map((group) => group.length)).toEqual([5, 1]);
    expect(behavior.value.menu(tree, '1.2.2', situationOf(tree)).groups.map((group) => group.length)).toEqual([5, 1]);
    const canvas = behavior.value.menu(tree, undefined, situationOf(tree)).groups;
    expect(canvas[0].map((entry) => [entry.operation, entry.args, entry.label])).toEqual(kinds.map((kind, index) => ['addHere', { kind }, index === 3 ? 'Add Retry here' : expect.stringMatching(/^Add .+ here$/)]));
  });

  it('offer `moveUp` and `moveDown`, each unavailable at its end with the definition\'s sentence, and move a node among its siblings', () => {
    const entries = (id: string) => Object.fromEntries(behavior.value.menu(tree, id, situationOf(tree)).groups[0].map((entry) => [entry.kind, entry]));
    expect(entries('1.1').moveUp).toMatchObject({ label: 'Move earlier', enabled: false, reason: at('behavior', 'messages', 'std.atStart') });
    expect(entries('1.1').moveDown).toMatchObject({ label: 'Move later', enabled: true });
    expect(entries('1.3').moveDown).toMatchObject({ enabled: false, reason: at('behavior', 'messages', 'std.atEnd') });
    expect(entries('1').moveUp).toMatchObject({ enabled: false });

    const later = done(behavior.value.shift(tree, '1.1', 1, situationOf(tree)));
    expect(later.changes).toEqual([{ kind: 'move', id: '1.1', parent: '1', position: { index: 1 } }]);
    expect(later.after.elements.filter((element) => element.parent === '1').map((element) => element.type)).toEqual(['Fallback', 'Check', 'Guard']);
    expect(Object.fromEntries(later.renamed)).toMatchObject({ '1.1': '1.2', '1.2': '1.1', '1.2.1': '1.1.1' });
    expect(refusal(behavior.value.shift(tree, '1.1', -1, situationOf(tree)))).toBe(at('behavior', 'messages', 'std.atStart'));
    expect(refusal(behavior.value.shift(tree, '1.3', 1, situationOf(tree)))).toBe(at('behavior', 'messages', 'std.atEnd'));
  });

  it('ask before removing a node with nodes beneath it, with their number', () => {
    expect(behavior.value.deletion(tree, ['1.2'], situationOf(tree)).confirm).toMatchObject({ title: 'Remove', confirmLabel: 'Remove', danger: true, message: 'Removing this node also removes the 3 nodes beneath it.' });
    expect(behavior.value.deletion(tree, ['1.2.2'], situationOf(tree)).confirm?.message).toBe('Removing this node also removes the 1 node beneath it.');
    expect(behavior.value.deletion(tree, ['1.1'], situationOf(tree)).confirm).toBeUndefined();
    expect(done(behavior.value.remove(tree, ['1.2'], situationOf(tree))).after.elements.map((element) => element.id)).toEqual(['1', '1.1', '1.2']);
  });
});

describe('a line drawn from one node to another (`reparent`)', () => {
  const connect = (model: Model, source: string, target: string): Outcome => behavior.value.connect(model, 'Child', source, target, {}, situationOf(model));

  it('moves the second, with everything under it, to be the first\'s last child', () => {
    const outcome = done(connect(tree, '1.2', '1.3'));
    expect(outcome.changes).toEqual([{ kind: 'move', id: '1.3', parent: '1.2' }]);
    expect(outcome.after.elements.filter((element) => element.parent === '1.2').map((element) => element.type)).toEqual(['Do', 'Retry', 'Guard']);
    expect(Object.fromEntries(outcome.renamed)).toEqual({ '1.3': '1.2.3' });
  });

  it('is refused with the sentences of the definition', () => {
    expect(refusal(connect(tree, '1.2.2', '1.2'))).toBe('A node cannot move beneath itself.');
    expect(refusal(connect(tree, '1.1', '1.3'))).toBe('"Check" holds no children.');
    expect(refusal(connect(tree, '1.2.2', '1.3'))).toBe('"Retry up to 2 times" holds exactly one child, and already has it.');
    expect(refusal(connect(tree, '1', '1.3'))).toBe('That node is already there.');
  });
});

describe('retyping (DISL 7.5, 9.5)', () => {
  const kind = rowsOf(formFor(forms.value, 'Sequence').items)[0];
  const on = (model: Model, element: string) => ({ model, element });

  it('shows the type of an element as the item of kind `type`, with the types its `options` give, each named by `optionLabel`', () => {
    expect(rowsOf(formFor(forms.value, 'Retry').items).map((item) => [item.kind, item.attribute])).toEqual([['type', undefined], ['field', 'label'], ['field', 'attempts'], ['field', 'notes'], ['computed', undefined]]);
    expect(kind.label(on(tree, '1.2'))).toBe('Kind');
    expect(kind.display(on(tree, '1.2'))).toBe('Try in order');
    expect(kind.display(on(tree, '1.2.2'))).toBe('Retry');
    // A node with two children can become a composite only; one with one child, a wrapper too; a leaf, anything.
    expect(kind.options(on(tree, '1.2')).map((option) => option.label)).toEqual(['Do in order', 'Try in order', 'Do together']);
    expect(kind.options(on(tree, '1.2.2')).map((option) => option.value)).toEqual(['Sequence', 'Fallback', 'Parallel', 'Retry', 'RepeatUntil', 'Guard', 'Approval']);
    expect(kind.options(on(tree, '1.1'))).toHaveLength(11);
  });

  it('retypes the element to the type that is chosen, by its name in the list, with what `attributeMapping` gives', () => {
    const outcome = done(behavior.value.edit(tree, '1.2', kind, 'Do together', situationOf(tree)));
    expect(outcome.changes).toEqual([{ kind: 'retype', id: '1.2', type: 'Parallel', attributes: {} }]);
    expect(outcome.after.elements.find((element) => element.id === '1.2')).toMatchObject({ type: 'Parallel', attributes: { label: 'Fallback 1.2' } });

    // A node that becomes a Retry allows three attempts, and one that was a Retry keeps the most of its own and three.
    const retried = done(behavior.value.edit(tree, '1.3', kind, 'Retry', situationOf(tree)));
    expect(retried.changes).toEqual([{ kind: 'retype', id: '1.3', type: 'Retry', attributes: { attempts: 3 } }]);
    const more = applyChanges(tree, [{ kind: 'set', id: '1.2.2', attributes: { attempts: 5 } }]);
    expect(done(behavior.value.edit(more, '1.2.2', kind, 'Retry', situationOf(more))).changes).toEqual([{ kind: 'retype', id: '1.2.2', type: 'Retry', attributes: { attempts: 5 } }]);
    // What the new type does not have is left behind.
    expect(done(behavior.value.edit(tree, '1.2.2', kind, 'Only while', situationOf(tree))).after.elements.find((element) => element.id === '1.2.2')!.attributes).toEqual({ label: 'Retry 1.2.2' });
  });

  it('refuses a value that is not among the choices with the first of the item\'s refusals that holds, else with a sentence of its own', () => {
    expect(refusal(behavior.value.edit(tree, '1.2', kind, 'Check', situationOf(tree)))).toBe('"Check" holds no children, and this node has 2 children.');
    expect(refusal(behavior.value.edit(tree, '1.2.2', kind, 'Do', situationOf(tree)))).toBe('"Do" holds no children, and this node has 1 child.');
    expect(refusal(behavior.value.edit(tree, '1.2', kind, 'Retry', situationOf(tree)))).toBe('"Retry up to 3 times" holds exactly one child, and this node has 2.');
    expect(refusal(behavior.value.edit(tree, '1.2', kind, 'Nothing', situationOf(tree)))).toMatch(/'Nothing'/);
  });

  it('refuses a number of attempts below one with the sentence of the field', () => {
    const attempts = rowsOf(formFor(forms.value, 'Retry').items)[2];
    expect(attempts.visible(on(tree, '1.2.2'))).toBe(true);
    expect(attempts.visible(on(tree, '1.2'))).toBe(false);
    expect(refusal(behavior.value.edit(tree, '1.2.2', attempts, '0', situationOf(tree)))).toBe('\'0\' is not a number of attempts; a Retry allows at least 1.');
    expect(done(behavior.value.edit(tree, '1.2.2', attempts, '4', situationOf(tree))).changes).toEqual([{ kind: 'set', id: '1.2.2', attributes: { attempts: 4 } }]);
  });
});

describe('a drag in a tidy tree (DISL 10.3)', () => {
  const dragged = (model: Model, id: string, by: { x: number; y: number }, corners: Readonly<Record<string, { x: number; y: number }>> = {}): Outcome =>
    behavior.value.move(model, [id], by, situationOf(model, corners));
  const pinsOf = (outcome: Extract<Outcome, { refused?: undefined }>) => Object.fromEntries(outcome.view.flatMap((change) => (change.kind === 'pin' ? [[change.element, change.y]] : [])));

  it('down, stores the height of the row for every node of the row and beneath it, and changes nothing of the model', () => {
    const scene = sceneOf(tree);
    const outcome = done(dragged(tree, '1.2', { x: 5, y: 40 }));
    expect(outcome.changes).toEqual([]);
    // Each is kept where it is drawn, the row's move added, by the point its placement names: its centre.
    const expected = Object.fromEntries(['1.1', '1.2', '1.2.1', '1.2.2', '1.2.2.1', '1.3'].map((id) => [id, boxOf(scene, id).y + height / 2 + 40]));
    expect(pinsOf(outcome)).toEqual(expected);
    expect(outcome.effects).toEqual([{ kind: 'select', elements: ['1.2'] }]);
  });

  it('across, past the middle of a sibling, takes that sibling\'s place in the model, and what is stored follows the nodes to their new ids', () => {
    const scene = sceneOf(tree);
    const outcome = done(dragged(tree, '1.1', { x: boxOf(scene, '1.2').x + 10 - boxOf(scene, '1.1').x, y: 30 }));
    expect(outcome.changes).toEqual([{ kind: 'move', id: '1.1', parent: '1', position: { index: 1 } }]);
    expect(outcome.after.elements.filter((element) => element.parent === '1').map((element) => [element.id, element.type])).toEqual([['1.1', 'Fallback'], ['1.2', 'Check'], ['1.3', 'Guard']]);
    // The pins name the nodes by the ids they have afterwards.
    expect(Object.keys(pinsOf(outcome)).sort()).toEqual(['1.1', '1.1.1', '1.1.2', '1.1.2.1', '1.2', '1.3']);
    expect(pinsOf(outcome)['1.2']).toBe(boxOf(scene, '1.1').y + height / 2 + 30);
    expect(outcome.effects).toEqual([{ kind: 'select', elements: ['1.2'] }]);
  });

  it('keeps a row at least `rows.minGap` below its parent, and refuses a drop that changes nothing', () => {
    const outcome = done(dragged(tree, '1.1', { x: 0, y: -1000 }));
    expect(pinsOf(outcome)['1.1']).toBe(height + minGap + height / 2);
    expect(refusal(dragged(tree, '1.1', { x: 20, y: 0 }))).toBe('That is already there.');
  });
});
