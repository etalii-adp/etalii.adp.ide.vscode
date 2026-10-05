import { describe, expect, it } from 'vitest';
import { agentBehaviorModelling as type } from '../../../src/core/agent-behavior-modelling/index';
import { arrange, compute, dragPreview, minimumGap, nodeHeight, nodeWidth } from '../../../src/core/agent-behavior-modelling/layout';
import { nodeOf } from '../../../src/core/agent-behavior-modelling/model';
import { parse } from '../../../src/core/agent-behavior-modelling/parser';
import { LineDocument } from '../../../src/core/text/lineDocument';
import { read } from '../files';

const text = read('examples/agent-behavior-modelling/research-assistant/research-assistant.md');
const model = parse(LineDocument.parse(text));
const now = arrange(model, new Map());
const at = (id: string) => now.get(id)!;
const drag = (id: string, x: number, y: number) => dragPreview(model, now, nodeOf(model, id)!, x, y);

describe('what is drawn while a node is dragged', () => {
  it('carries the node and everything beneath it with the pointer', () => {
    const preview = drag('1.2', at('1.2').x + 30, at('1.2').y + 50);
    expect(preview.get('1.2')).toEqual({ x: at('1.2').x + 30, y: at('1.2').y + 50 });
    expect(preview.get('1.2.3')).toEqual({ x: at('1.2.3').x + 30, y: at('1.2.3').y + 50 });
  });

  it('moves the rest of its row, and what hangs under it, up and down only, and leaves the parent', () => {
    const preview = drag('1.2', at('1.2').x + 30, at('1.2').y + 50);
    expect(preview.get('1.1')).toEqual({ x: at('1.1').x, y: at('1.1').y + 50 });
    expect(preview.get('1.3.1.2')).toEqual({ x: at('1.3.1.2').x, y: at('1.3.1.2').y + 50 });
    expect(preview.get('1')).toEqual(at('1'));
  });

  it('draws the siblings it has passed where the new order would put them, so they step aside', () => {
    // 1.1 dragged to just past the middle of 1.2: it would become the second child.
    const preview = drag('1.1', at('1.2').x + 10, at('1.1').y);
    // What the tree looks like with 1.2 first and 1.1 second, every node keeping its id.
    const swapped = compute({ ...model, nodes: model.nodes.map((node) => (node.id === '1' ? { ...node, childIds: ['1.2', '1.1', '1.3', '1.4'] } : node)) });
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
    const two = parse(LineDocument.parse('## Behavior\n- **Do:** a\n- **Do in order:** b\n  - **Do:** c\n'));
    const drawn = arrange(two, new Map());
    const preview = dragPreview(two, drawn, nodeOf(two, '1')!, drawn.get('2')!.x + nodeWidth, 0);
    expect(preview.get('2')!.x).toBe(0);
    expect(preview.get('2.1')!.x).toBe(0);
  });

  it('comes with the view: the whole tree and where each node is drawn, whatever is in view', () => {
    const view = type.view({ text }, { viewport: { x: 0, y: 0, width: 10, height: 10 } });
    const tree = view.chrome.tree as { id: string; parent: string | null; x: number; y: number }[];
    expect(tree).toHaveLength(13);
    expect(tree[0]).toEqual({ id: '1', parent: null, ...at('1') });
    expect(tree[12]).toEqual({ id: '1.4', parent: '1', ...at('1.4') });
    expect(view.elements.length).toBeLessThan(13);
  });
});
