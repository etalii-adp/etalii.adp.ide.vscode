import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import { definitionOf, diagramOf } from './support';

// What a tool type exports, offered on its diagram and answered by the extension (etalii.adp spec 082,
// task T005, research R4): the causal loop diagram's flow page, of the document as the editor holds it.

const type = diagramOf(definitionOf('causal-loop-diagram'), registry);
const folder = 'examples/causal-loop-diagram/on-call';
const source: Source = { fileName: `${folder}/on-call.cld`, text: readFileSync(`${folder}/on-call.cld`, 'utf8'), registration: readFileSync(`${folder}/on-call.adp`, 'utf8') };
const moment = new Date(2026, 10, 22, 23, 59);
const dataOf = (text: string): { v: [string, string, number, number][] } => JSON.parse(/^const DATA = (.*);$/m.exec(text)![1]) as { v: [string, string, number, number][] };

describe('an export of a tool type', () => {
  it('is offered on the diagram itself, after its own entries, and not on an element', () => {
    expect(type.exports?.map(({ id, label }) => ({ id, label }))).toEqual([{ id: 'flowPage', label: 'Export flow page' }]);
    const actions = type.actions(source, []);
    expect(actions.at(-1)).toEqual({ id: 'export:flowPage', label: 'Export flow page', enabled: true });
    expect(actions.map((action) => action.label)).toContain('Arrange diagram');
    expect(type.actions(source, ['variable:fatigue']).some((action) => action.id.startsWith('export:'))).toBe(false);
  });

  it('is answered as an export, which the extension writes, and changes nothing of the document', () => {
    expect(type.edit(source, { kind: 'action', action: 'export:flowPage' }, {}, false)).toEqual({ kind: 'export', export: 'flowPage' });
    expect(type.exported!(source, 'nothing', {}, moment)).toBeUndefined();
  });

  it('is of the text as the editor holds it, unsaved edits included, with the positions the canvas draws', () => {
    const edited = { ...source, text: source.text.replace('variable fatigue', 'variable sleep "Sleep"\nvariable fatigue') };
    const page = type.exported!(edited, 'flowPage', {}, moment)!;
    expect(page.name).toBe('on-call {2026-11-22 23.59}.html');
    const data = dataOf(page.text);
    expect(data.v.map(([id]) => id)).toContain('sleep');
    const scene = type.view(edited, {});
    for (const [id, , x, y] of data.v) {
      const node = scene.nodes.find((candidate) => candidate.id === `variable:${id}`)!;
      expect(x).toBeCloseTo(node.box.x + node.box.width / 2, 6);
      expect(y).toBeCloseTo(node.box.y + node.box.height / 2, 6);
    }
  });

  it('is offered by no tool type that carries none', () => {
    const other = diagramOf(definitionOf('gartner-hype-cycle-graph'), registry);
    expect(other.exports).toEqual([]);
    expect(other.actions({ fileName: 'x.hcg', text: '' }, []).some((action) => action.id.startsWith('export:'))).toBe(false);
  });
});
