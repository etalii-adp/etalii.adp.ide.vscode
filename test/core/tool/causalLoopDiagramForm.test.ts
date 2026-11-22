import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { plugins } from '../../../src/core/plugins/index';
import { definitionOf, diagramOf, spliced } from './support';

// The diagram's own form, shown in ADP Properties with nothing selected (etalii.adp spec 081, T038).
const type = diagramOf(definitionOf('causal-loop-diagram'), plugins);
const source = { fileName: 'on-call.cld', text: readFileSync('examples/causal-loop-diagram/on-call/on-call.cld', 'utf8') };

describe('a causal loop diagram with nothing selected', () => {
  const fields = type.fields(source, []);

  it('shows the diagram\'s own form', () => {
    expect(fields.map((field) => `${field.group} | ${field.label} | ${field.value}`)).toEqual([
      'Identity | Title | ', 'Flow page | Link strength | 3', 'Flow page | Delay length | 5', 'Flow page | Inertia | 1.2',
      'Flow page | Simulation speed | 1', 'Flow page | Dot density | 3', 'Flow page | Heatmap reading | Backlog',
    ]);
  });

  it('writes a row of it into the document, and refuses what its parse does not accept', () => {
    const title = fields.find((field) => field.label === 'Title')!;
    const set = type.edit(source, { kind: 'setField', id: '', field: title.id, value: 'Why on-call gets worse' }, {}, false);
    expect(set.kind).toBe('applied');
    expect(set.kind === 'applied' && spliced(source.text, set.splices)).toContain('title "Why on-call gets worse"');
    const strength = fields.find((field) => field.label === 'Link strength')!;
    expect(type.edit(source, { kind: 'setField', id: '', field: strength.id, value: '9' }, {}, false)).toEqual({ kind: 'refused', sentence: 'Link strength is 9; it must be between 0.5 and 8.' });
  });
});
