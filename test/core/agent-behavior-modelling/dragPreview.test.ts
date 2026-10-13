import { describe, expect, it } from 'vitest';
import type { SceneTree } from '../../../src/core/scene/scene';
import { reordered, rowAndBeneath, subtreeOf, tidyTreePlaces, treeDragPreview, type TreePoint } from '../../../src/core/scene/tidyTree';
import { bare, markdown, minimumGap, nodeHeight, nodeWidth, source, type } from './model';

// What the canvas draws while a node is dragged: the tree a scene carries, with where each node is
// drawn, and `treeDragPreview` over it. The example is opened without its registration, so every
// row hangs where the tidy tree puts it.

const treeOf = (scene: { readonly tree?: SceneTree }): SceneTree => scene.tree!;
const placesOf = (tree: SceneTree): Map<string, TreePoint> => new Map(tree.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));

const tree = treeOf(type.view(bare, {}));
const now = placesOf(tree);
const at = (id: string): TreePoint => now.get(id)!;
const drag = (id: string, x: number, y: number): Map<string, TreePoint> => treeDragPreview(tree.nodes, now, id, x, y, tree);

describe('what is drawn while a node is dragged', () => {
  it('carries the node and everything beneath it with the pointer', () => {
    const preview = drag('1.2', at('1.2').x + 30, at('1.2').y + 50);
    expect(preview.get('1.2')).toEqual({ x: at('1.2').x + 30, y: at('1.2').y + 50 });
    expect(preview.get('1.2.3')).toEqual({ x: at('1.2.3').x + 30, y: at('1.2.3').y + 50 });
    expect(subtreeOf(tree.nodes, '1.2')).toEqual(['1.2', '1.2.1', '1.2.2', '1.2.3']);
  });

  it('moves the rest of its row, and what hangs under it, up and down only, and leaves the parent', () => {
    const preview = drag('1.2', at('1.2').x + 30, at('1.2').y + 50);
    expect(preview.get('1.1')).toEqual({ x: at('1.1').x, y: at('1.1').y + 50 });
    expect(preview.get('1.3.1.2')).toEqual({ x: at('1.3.1.2').x, y: at('1.3.1.2').y + 50 });
    expect(preview.get('1')).toEqual(at('1'));
    expect(rowAndBeneath(tree.nodes, '1.2')).toEqual(tree.nodes.map((node) => node.id).filter((id) => id !== '1'));
  });

  it('draws the siblings it has passed where the new order would put them, so they step aside', () => {
    // 1.1 dragged to just past the middle of 1.2: it would become the second child.
    const preview = drag('1.1', at('1.2').x + 10, at('1.1').y);
    // What the tree looks like with 1.2 first and 1.1 second, every node keeping its id.
    const swapped = tidyTreePlaces(reordered(tree.nodes, '1.1', 1), tree);
    expect(preview.get('1.2')!.x).toBe(swapped.get('1.2')!.x);
    expect(preview.get('1.2')!.x).toBeLessThan(at('1.2').x);
    expect(preview.get('1.2.1')!.x).toBe(swapped.get('1.2.1')!.x);
    expect(preview.get('1.3')!.x).toBe(swapped.get('1.3')!.x);
    // The dragged node is where the pointer has it, not where it would land.
    expect(preview.get('1.1')!.x).toBe(at('1.2').x + 10);
    expect(preview.get('1.1.2')!.x).toBe(at('1.1.2').x + (at('1.2').x + 10 - at('1.1').x));
  });

  it('leaves the siblings where they are until a middle is passed', () => {
    const preview = drag('1.1', at('1.1').x + 40, at('1.1').y);
    for (const id of ['1.2', '1.3', '1.4', '1.2.1']) expect(preview.get(id)).toEqual(at(id));
  });

  it('never shows a row closer to its parent than the minimum gap', () => {
    const preview = drag('1.1', at('1.1').x, -1000);
    expect(preview.get('1.1')!.y).toBe(at('1').y + nodeHeight + minimumGap);
    expect(preview.get('1.4')!.y).toBe(at('1').y + nodeHeight + minimumGap);
  });

  it('lets several roots change places too', () => {
    const two = treeOf(type.view(markdown('## Behavior\n- **Do:** a\n- **Do in order:** b\n  - **Do:** c\n'), {}));
    const drawn = placesOf(two);
    const preview = treeDragPreview(two.nodes, drawn, '1', drawn.get('2')!.x + nodeWidth, 0, two);
    expect(preview.get('2')!.x).toBe(0);
    expect(preview.get('2.1')!.x).toBe(0);
  });

  it('comes with the view: the whole tree and where each node is drawn, whatever is in view', () => {
    const scene = type.view(bare, { viewport: { x: 0, y: 0, width: 10, height: 10 } });
    const carried = treeOf(scene);
    expect(carried.nodes).toHaveLength(13);
    expect(carried.nodes[0]).toEqual({ id: '1', width: 200, height: 60, ...at('1') });
    expect(carried.nodes[12]).toEqual({ id: '1.4', parent: '1', width: 200, height: 60, ...at('1.4') });
    // Each node of the tree is drawn where the tree has it.
    expect(scene.nodes.map((node) => ({ id: node.id, x: node.box.x, y: node.box.y }))).toEqual(carried.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })));
    // The tidy tree's options come with it, as the definition states them: what a drag carries, reorders and lowers.
    expect(carried).toMatchObject({ parentAlign: 'firstLastCentre', origin: 'leftmostAtZero', rows: { stored: 'y', minGap: 16 }, drag: { carry: 'subtree', across: 'reorder', down: 'row' }, spacing: { node: 28, layer: 56, component: 56 } });
  });

  it('starts from the row heights the registration stores', () => {
    const stored = treeOf(type.view(source, {}));
    expect(stored.nodes.find((node) => node.id === '1.1')!.y).toBe(160);
    const preview = treeDragPreview(stored.nodes, placesOf(stored), '1.2', 0, 200, stored);
    expect(preview.get('1.1')!.y).toBe(200);
    expect(preview.get('1.2.1')!.y).toBe(316);
  });
});
