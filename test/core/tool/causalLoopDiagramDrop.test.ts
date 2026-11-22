import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { plugins } from '../../../src/core/plugins/index';
import { definitionOf, diagramOf, spliced } from './support';

// A link or a loop dropped from the toolbox is resolved by what it lands on (DISL 7.2, etalii.adp spec 081, T029).
const type = diagramOf(definitionOf('causal-loop-diagram'), plugins);
const source = { fileName: 'on-call.cld', text: readFileSync('examples/causal-loop-diagram/on-call/on-call.cld', 'utf8') };
const toil = type.view(source, {}).nodes.find((node) => node.id === 'variable:toil')!.box;

describe('a causal loop diagram\'s toolbox drops', () => {
  it.each(['causal-loop.add-link', 'causal-loop.add-loop'])('refuses %s dropped where there is no variable, with the definition\'s sentence', (entry) => {
    expect(type.edit(source, { kind: 'drop', entry, x: toil.x - 400, y: toil.y - 400 }, {}, false)).toEqual({ kind: 'refused', sentence: 'Drop a link or a loop onto a variable.' });
  });

  it('runs the link\'s operation on the variable it is dropped on: its form is asked, as its menu entry\'s is, and the answer writes the link', () => {
    const drop = { kind: 'drop', entry: 'causal-loop.add-link', x: toil.x + toil.width / 2, y: toil.y + toil.height / 2 } as const;
    expect(type.edit(source, drop, {}, false)).toMatchObject({ kind: 'ask', title: 'Add link', fields: [{ param: 'to', label: 'To variable' }] });
    expect(type.edit(source, { ...drop, params: { to: 'nobody' }, check: true }, {}, false)).toEqual({ kind: 'refused', sentence: '\'nobody\' is not a variable in this diagram.' });
    const written = type.edit(source, { ...drop, params: { to: 'mistakes' } }, {}, false);
    expect(written.kind === 'applied' && spliced(source.text, written.splices)).toContain('link toil -> mistakes +');
  });

  it('reads the definition with no finding about its drops', () => {
    expect(type.findings(source).filter((finding) => finding.rule === 'disl.toolbox')).toEqual([]);
  });
});
