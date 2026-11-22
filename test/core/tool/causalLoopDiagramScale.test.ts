import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { plugins } from '../../../src/core/plugins/index';
import { definitionOf, diagramOf } from './support';

// What spec 081 asks of the causal loop diagram as a whole (etalii.adp spec 081, SC-003 and SC-004).
const type = diagramOf(definitionOf('causal-loop-diagram'), plugins);
const read = (name: string): { fileName: string; text: string; registration: string } => ({
  fileName: `${name}.cld`,
  text: readFileSync(`examples/causal-loop-diagram/${name}/${name}.cld`, 'utf8'),
  registration: readFileSync(`examples/causal-loop-diagram/${name}/${name}.adp`, 'utf8'),
});

describe('the causal loop diagram as a whole', () => {
  it('reads its definition, and evaluates every expression of it, with no finding of the interpreter', () => {
    // The six examples between them reach every form, menu, label and constraint of the definition. The first twelve elements of
    // each are enough, as the larger ones hold no type the smaller do not, and every element of them takes ten seconds more.
    for (const name of ['business-philosophy', 'life-insurance', 'mental-health', 'on-call', 'reference', 'uk-cod-population']) {
      const source = read(name);
      type.view(source, {});
      for (const id of type.view(source, {}).nodes.map((node) => node.id).slice(0, 12)) {
        type.fields(source, [id]);
        type.actions(source, [id]);
      }
      type.fields(source, []);
      type.actions(source, []);
      expect(type.findings(source).filter((finding) => finding.rule.startsWith('disl.') || finding.rule.startsWith('cel.')), name).toEqual([]);
    }
  }, 30_000);

  it('draws the largest example within two seconds and arranges it within five', () => {
    const source = read('uk-cod-population');
    const drawing = performance.now();
    type.view(source, {});
    expect(performance.now() - drawing).toBeLessThan(2000);
    const arranging = performance.now();
    const arranged = type.edit(source, { kind: 'action', action: 'causal-loop.arrange' }, {}, false);
    expect(performance.now() - arranging).toBeLessThan(5000);
    expect(arranged.kind).toBe('applied');
  });
});
