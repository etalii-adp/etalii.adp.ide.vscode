import { describe, expect, it } from 'vitest';
import type { Model } from '../../../../src/core/disl/model';
import type { FblElement } from '../../../../src/core/fbl';
import { mindmapLayout } from '../../../../src/core/plugins/mindmap-layout';
import { defaultMetrics, layoutOf, measure, type Box, type Metrics, type Topic } from '../../../../src/core/plugins/mindmap-layout/layout';
import { architecture, read, recorded } from '../support';

// The layout plugin `net.etalii.adp.freeplane.mindmapLayout` (etalii.adp spec 027, T066): the
// two-sided arrangement of mindmap.md, section 4, ported from standalone's `MindmapLayout`. A
// comment above a test names its counterpart in standalone at `5756a07`,
// `src/diagrams/mindmap/backend/EtAlii.Adp.Diagram.Mindmap.Tests/MindmapLayout.Tests.cs`
// (`MindmapLayoutTests`). Standalone's layout is told which nodes are folded; this one is given the
// nodes that are drawn, so a folded node comes without its descendants.

const backend = 'ID_411002937';
const diagramTypes = 'ID_411002941';
const hierarchy = 'ID_88117425';
const leaf = 'ID_88117422';
const root = 'ID_1730044821';

const nothing = (): boolean => false;

/** The nodes the plugin read as the tree that is drawn: a node `folded` says is folded comes without what is under it. */
function drawn(elements: readonly FblElement[], folded: (element: FblElement) => boolean = nothing): Topic {
  const topic = (element: FblElement): Topic => ({
    id: element.id,
    text: element.attributes.text as string,
    ...(typeof element.attributes.position === 'string' ? { position: element.attributes.position } : {}),
    children: folded(element) ? [] : elements.filter((child) => child.parentId === element.id).map(topic),
  });
  return topic(elements[0]);
}

const corpus = (folded?: (element: FblElement) => boolean): Topic => drawn(read(architecture()).elements, folded);
const map = (nodes: string): Topic => drawn(read(`<map version="freeplane 1.11.5">${nodes}</map>`).elements);
const every = (topic: Topic): Topic[] => [topic, ...topic.children.flatMap(every)];
const find = (topic: Topic, id: string): Topic => every(topic).find((candidate) => candidate.id === id)!;
/** A tree with one topic replaced. */
const withTopic = (topic: Topic, id: string, replace: (found: Topic) => Topic): Topic =>
  (topic.id === id ? replace(topic) : { ...topic, children: topic.children.map((child) => withTopic(child, id, replace)) });

const right = (box: Box): number => box.x + box.width;
const bottom = (box: Box): number => box.y + box.height;
const centerX = (box: Box): number => box.x + box.width / 2;
const centerY = (box: Box): number => box.y + box.height / 2;
const layout = (topic: Topic, metrics: Metrics = defaultMetrics): ReadonlyMap<string, Box> => layoutOf(topic, metrics);
const box = (boxes: ReadonlyMap<string, Box>, id: string): Box => boxes.get(id)!;

const twoLong = '<node TEXT="r" ID="root"><node TEXT="a considerably longer sibling label than most" ID="a" POSITION="right"/><node TEXT="another considerably longer sibling label" ID="b" POSITION="right"/></node>';

describe('the measure of a node', () => {
  it('is the metrics the definition gives the layout as its options', () => {
    expect(defaultMetrics).toEqual({ fontSize: 14, lineHeight: 1.4, horizontalPadding: 10, verticalPadding: 6, horizontalGap: 48, verticalGap: 10, minimumWidth: 32, minimumGapRatio: 0.1 });
  });

  // MindmapLayoutTests.Measure_GivesAnEmptyNodeAMinimumWidth
  it('gives an empty node the minimum width', () => {
    expect(measure('', defaultMetrics)).toEqual({ width: 32, height: 31.6 });
    expect(measure('a', defaultMetrics).width).toBe(32);
  });

  // MindmapMetricsTests.ATextsWidth_IsTheSharedMetricsWidth_WithThisModulesOwnSizingAroundIt: the
  // shared estimate (a UTF-16 code unit is 0.55 of the font size) with the padding around it,
  // rounded to two decimals. Its fixture is not copied; the widths of the transcript below are.
  it('is the shared estimate of the text with the padding around it, to two decimals', () => {
    expect(measure('ADP architecture', defaultMetrics)).toEqual({ width: 143.2, height: 31.6 });
    expect(measure('Backend', defaultMetrics).width).toBe(73.9);
    // A character outside the Basic Multilingual Plane counts as two, as on every ADP host.
    expect(measure('Ünïcödé — dash, curly ‘quotes’, emoji 🌐', defaultMetrics).width).toBe(328);
    expect(measure('wider', { ...defaultMetrics, fontSize: 20, horizontalPadding: 0, verticalPadding: 0 })).toEqual({ width: 55, height: 28 });
  });
});

describe('the layout', () => {
  // MindmapLayoutTests.Compute_IsDeterministic
  it('is deterministic', () => {
    const first = layout(corpus());
    const second = layout(corpus());
    expect(first.size).toBeGreaterThan(0);
    expect([...second]).toEqual([...first]);
  });

  // MindmapLayoutTests.Compute_CentresTheRootOnTheOrigin
  it('centres the root on the origin', () => {
    const central = box(layout(corpus()), root);
    expect(centerX(central)).toBeCloseTo(0, 3);
    expect(centerY(central)).toBeCloseTo(0, 3);
    expect(central).toEqual({ x: -71.6, y: -15.8, width: 143.2, height: 31.6 });
  });

  // MindmapLayoutTests.Compute_PlacesEveryVisibleNode_AndNoOthers
  it('places every node it is given and no other', () => {
    expect([...layout(corpus()).keys()]).toEqual(every(corpus()).map((topic) => topic.id));
    expect(layout(corpus()).size).toBe(25);
  });

  // MindmapLayoutTests.Compute_HonoursFreeplanesPositionAttribute
  it('honours Freeplane\'s POSITION, in both of its vocabularies', () => {
    const boxes = layout(corpus());
    expect(box(boxes, backend).x).toBeGreaterThan(0);
    expect(right(box(boxes, diagramTypes))).toBeLessThan(0);

    const old = layout(map('<node TEXT="r" ID="r"><node TEXT="a" ID="a" POSITION="left"/><node TEXT="b" ID="b" POSITION="LEFT"/><node TEXT="c" ID="c" POSITION="right"/><node TEXT="d" ID="d" POSITION="top_or_left"/><node TEXT="e" ID="e" POSITION="bottom_or_right"/></node>'));
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => box(old, id).x > 0)).toEqual([false, false, true, false, true]);
  });

  // MindmapLayoutTests.Compute_AlternatesSidesForUnpositionedBranches
  it('alternates the sides of branches without a POSITION, starting right and counting only those', () => {
    const boxes = layout(map('<node TEXT="r" ID="r"><node TEXT="a" ID="a"/><node TEXT="b" ID="b"/><node TEXT="c" ID="c"/></node>'));
    expect(box(boxes, 'a').x).toBeGreaterThan(0);
    expect(right(box(boxes, 'b'))).toBeLessThan(0);
    expect(box(boxes, 'c').x).toBeGreaterThan(0);

    // A positioned branch, and one with a value that is no side, do not use up a turn.
    const mixed = layout(map('<node TEXT="r" ID="r"><node TEXT="a" ID="a"/><node TEXT="p" ID="p" POSITION="right"/><node TEXT="b" ID="b" POSITION="middle"/><node TEXT="c" ID="c"/></node>'));
    expect(['a', 'p', 'b', 'c'].map((id) => box(mixed, id).x > 0)).toEqual([true, true, false, true]);
  });

  // MindmapLayoutTests.Compute_SiblingsDoNotOverlap
  it('stacks siblings without overlap', () => {
    const tree = corpus();
    const boxes = layout(tree);
    let compared = 0;
    for (const parent of every(tree)) {
      // The root's children are on two sides; only siblings on one side share a column.
      for (const side of [true, false]) {
        const column = parent.children.filter((child) => (box(boxes, child.id).x >= 0) === side);
        for (let i = 1; i < column.length; i++) {
          expect(box(boxes, column[i].id).y, `'${column[i].text}' overlaps '${column[i - 1].text}'`).toBeGreaterThanOrEqual(bottom(box(boxes, column[i - 1].id)));
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(0);
  });

  // MindmapLayoutTests.Compute_PutsChildrenBeyondTheirParent_OnTheParentsSide
  it('puts children beyond their parent, on the parent\'s side', () => {
    const tree = corpus();
    const boxes = layout(tree);
    expect(find(tree, backend).children.length).toBeGreaterThan(0);
    for (const child of find(tree, backend).children) expect(box(boxes, child.id).x).toBeGreaterThanOrEqual(right(box(boxes, backend)) + defaultMetrics.horizontalGap - 0.01);
    expect(find(tree, diagramTypes).children.length).toBeGreaterThan(0);
    for (const child of find(tree, diagramTypes).children) expect(right(box(boxes, child.id))).toBeLessThanOrEqual(box(boxes, diagramTypes).x - defaultMetrics.horizontalGap + 0.01);
  });

  // MindmapLayoutTests.Compute_AFoldedBranch_HidesItsDescendantsAndTakesNoRoomForThem
  it('gives a folded branch, which comes without its descendants, no room for them', () => {
    const unfolded = layout(corpus());
    const folded = layout(corpus((element) => element.id === hierarchy));
    expect(unfolded.has('ID_88117426')).toBe(true);
    expect(folded.has('ID_88117426')).toBe(false);
    expect(folded.has(hierarchy)).toBe(true);
    // With the branch folded the Backend column is shorter, so its siblings sit closer.
    const tall = (boxes: ReadonlyMap<string, Box>): number => bottom(box(boxes, hierarchy)) - box(boxes, 'ID_88117420').y;
    expect(tall(folded)).toBeLessThan(tall(unfolded));
    // A folded root is alone.
    expect([...layout(corpus((element) => element.id === root)).keys()]).toEqual([root]);
  });

  // MindmapLayoutTests.Compute_ALongerTextWidensTheNode
  it('widens a node for a longer text', () => {
    const longer = withTopic(corpus(), leaf, (topic) => ({ ...topic, text: `${topic.text} with a considerably longer label` }));
    expect(box(layout(longer), leaf).width).toBeGreaterThan(box(layout(corpus()), leaf).width);
  });

  // MindmapLayoutTests.Compute_AnEditInOneBranch_LeavesTheOtherSideWhereItWas
  it('leaves the other side where it was when a branch grows', () => {
    const before = layout(corpus());
    const after = layout(withTopic(corpus(), leaf, (topic) => ({ ...topic, children: [{ id: 'ID_new', text: 'new', children: [] }] })));
    expect(after.has('ID_new')).toBe(true);
    for (const id of ['ID_411002941', 'ID_411002942', 'ID_411002945', 'ID_411002949']) expect(box(after, id)).toEqual(box(before, id));
  });

  // MindmapLayoutTests.Compute_KeepsAtLeastTheConfiguredShareOfANodesWidthAroundIt
  it('keeps at least the configured share of a node\'s width around it', () => {
    // Two long siblings: the fixed vertical gap alone would leave them closer than a tenth of their width.
    const boxes = layout(map(twoLong), { ...defaultMetrics, minimumGapRatio: 0.1 });
    const a = box(boxes, 'a');
    const b = box(boxes, 'b');
    const widest = Math.max(a.width, b.width);
    expect(widest * 0.1).toBeGreaterThan(defaultMetrics.verticalGap);
    expect(Math.min(Math.abs(b.y - bottom(a)), Math.abs(a.y - bottom(b)))).toBeGreaterThanOrEqual(widest * 0.1 - 0.01);
    // The horizontal side of the same rule: a child sits at least the root's share away.
    expect(a.x - right(box(boxes, 'root'))).toBeGreaterThanOrEqual(box(boxes, 'root').width * 0.1 - 0.01);
  });

  // MindmapLayoutTests.Compute_ChildrenOfOneParent_ShareTheSameHorizontalDistanceFromIt
  it('aligns the children of one parent on the edge nearest to it', () => {
    const tree = corpus();
    const boxes = layout(tree);
    let checked = 0;
    for (const parent of every(tree)) {
      // The root has children on two sides; each side is a column of its own.
      for (const side of [true, false]) {
        const column = parent.children.map((child) => box(boxes, child.id)).filter((child) => (centerX(child) > centerX(box(boxes, parent.id))) === side);
        if (column.length < 2) continue;
        checked++;
        expect(new Set(column.map((child) => (side ? child.x : right(child)).toFixed(6))).size).toBe(1);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  // MindmapLayoutTests.Compute_NoTwoVisibleNodes_Overlap
  it('lets no two nodes overlap', () => {
    const boxes = [...layout(corpus()).values()];
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        expect(right(a) <= b.x || right(b) <= a.x || bottom(a) <= b.y || bottom(b) <= a.y, `boxes at (${a.x},${a.y}) and (${b.x},${b.y}) overlap`).toBe(true);
      }
    }
  });

  // MindmapLayoutTests.Compute_ALargerConfiguredRatio_SpreadsTheSiblingsFurther
  it('spreads siblings further for a larger ratio', () => {
    const distance = (ratio: number): number => {
      const boxes = layout(map(twoLong), { ...defaultMetrics, minimumGapRatio: ratio });
      return box(boxes, 'b').y - bottom(box(boxes, 'a'));
    };
    expect(distance(0.5)).toBeGreaterThan(distance(0.1));
  });
});

describe('the nodes standalone placed', () => {
  // Parity/MindmapTranscript.cs, "payloads": every node of a document as standalone's mapper gives
  // it for a view that folds what the file folds, in the order of the file, at its box's centre
  // with the measured width and height. The documents left out are those that are no map, and the
  // three whose nodes share an ID: standalone keeps its boxes by the ID, so there the last holder's
  // box is recorded for every holder.
  it.each([
    'diagrams/mindmap/backend/EtAlii.Adp.Diagram.Mindmap.Tests/Fixtures/architecture.mm',
    'diagrams/mindmap/examples/example 1/design.mm',
    'diagrams/mindmap/examples/example 1/mindmap.mm',
    'inline/unnamed-root.mm',
    'inline/blank-root.mm',
    'inline/empty-ordinary-node.mm',
    'inline/without-ids.mm',
    'inline/rich-and-links.mm',
  ])('are where the layout places them, to the last digit: %s', (name) => {
    const { document, bytes } = recorded(name);
    const tree = drawn(read(bytes).elements, (element) => element.attributes.folded === true);
    const boxes = layout(tree);
    const placed = every(tree).map((topic) => {
      const at = box(boxes, topic.id);
      return { text: topic.text, x: centerX(at), y: centerY(at), width: at.width, height: at.height };
    });
    const recordedNodes = document.payloads!.map((line) => {
      const parts = /^.*? \| freeplane\/mindmap\+node \| (\S+), (\S+) \| MindmapNodePayload (\{.*\})$/s.exec(line);
      if (!parts) throw new Error(`Not a placed node: ${line}`);
      const payload = JSON.parse(parts[3]) as { text?: string; width: number; height: number };
      return { text: payload.text ?? '', x: Number(parts[1]), y: Number(parts[2]), width: payload.width, height: payload.height };
    });
    expect(recordedNodes.length).toBeGreaterThan(0);
    expect(placed).toEqual(recordedNodes);
  });
});

describe('the plugin', () => {
  interface Placed { readonly x: number; readonly y: number; readonly width?: number; readonly height?: number }

  /** The model the scene hands a layout: the nodes that are drawn, each under its parent, by the metamodel's names. */
  const modelOf = (topic: Topic): Model => {
    const elements = (from: Topic, parent?: string): Model['elements'][number][] => [
      { id: from.id, type: 'Node', attributes: { text: from.text, ...(from.position === undefined ? {} : { position: from.position }) }, host: {}, ...(parent === undefined ? {} : { parent }), ephemeral: false, line: 0 },
      ...from.children.flatMap((child) => elements(child, from.id)),
    ];
    return { diagram: {}, elements: elements(topic), relations: [] };
  };
  /** The request as the definition makes it: its `spacing` and the `options` of its layout `mindmap`. */
  const request = (topic: Topic, more: { spacing?: Record<string, number>; options?: Record<string, unknown> } = {}) => ({
    model: modelOf(topic),
    // The notation's sizes, which this layout does not place: it measures by its own options.
    sizes: Object.fromEntries(every(topic).map((each) => [each.id, { width: 1, height: 1 }])),
    spacing: more.spacing ?? { node: 10, layer: 48 },
    options: more.options ?? {
      'net.etalii.adp.mindmap.minimumGapRatio': 0.1, 'net.etalii.adp.mindmap.fontSize': 14, 'net.etalii.adp.mindmap.lineHeight': 1.4,
      'net.etalii.adp.mindmap.horizontalPadding': 10, 'net.etalii.adp.mindmap.verticalPadding': 6, 'net.etalii.adp.mindmap.minimumWidth': 32,
    },
  });
  const place = (topic: Topic, more?: Parameters<typeof request>[1]): Readonly<Record<string, Placed>> => mindmapLayout.place(request(topic, more));

  it('has the id the definition names its layout by', () => {
    expect(mindmapLayout.id).toBe('net.etalii.adp.freeplane.mindmapLayout');
  });

  it('gives every node of the model its top-left and the size it measured', () => {
    const tree = corpus((element) => element.attributes.folded === true);
    const placed = place(tree);
    expect(Object.keys(placed)).toHaveLength(22);
    expect(placed).toEqual(Object.fromEntries(layout(tree)));
    expect(placed[root]).toEqual({ x: -71.6, y: -15.8, width: 143.2, height: 31.6 });
  });

  it('reads its gaps from the spacing and its metrics from the options, and has the defaults without them', () => {
    const tree = map(twoLong);
    expect(place(tree, { spacing: {}, options: {} })).toEqual(Object.fromEntries(layout(tree)));
    expect(place(tree, { spacing: { node: 40, layer: 100 }, options: { 'net.etalii.adp.mindmap.minimumGapRatio': 0, 'net.etalii.adp.mindmap.fontSize': 20, 'net.etalii.adp.mindmap.minimumWidth': 60 } }))
      .toEqual(Object.fromEntries(layout(tree, { ...defaultMetrics, verticalGap: 40, horizontalGap: 100, minimumGapRatio: 0, fontSize: 20, minimumWidth: 60 })));
    const wide = place(tree, { spacing: { node: 40, layer: 100 }, options: { 'net.etalii.adp.mindmap.minimumGapRatio': 0, 'net.etalii.adp.mindmap.minimumWidth': 60 } });
    expect(wide.root.width).toBe(60);
    expect(wide.a.x - (wide.root.x + 60)).toBe(100);
    expect(wide.b.y - (wide.a.y + wide.a.height!)).toBeCloseTo(40, 6);
  });

  it('places nothing for a model without a node', () => {
    expect(mindmapLayout.place({ ...request(map('<node TEXT="r" ID="r"/>')), model: { diagram: {}, elements: [], relations: [] } })).toEqual({});
  });
});
