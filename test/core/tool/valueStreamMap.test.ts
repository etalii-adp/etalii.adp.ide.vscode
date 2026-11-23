import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EditOutcome, EditRequest, Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import { definitionOf, diagramOf, spliced } from './support';

// The value stream map opened and edited from its definition (etalii.adp spec 090, tasks T006 to
// T010): its two examples are claimed and drawn with no findings, every step labelled with its
// performer and its times, and the gestures of the canvas, ADP Properties and the document's action
// edit the file as its binding says. Where the binding and its future fixture differ (etalii.adp
// issue 810), this host follows the binding, and the test says so where it looks.

const type = diagramOf(definitionOf('value-stream-map'), registry);

const example = (name: string): Source => ({ fileName: `${name}.vsm`, text: readFileSync(`examples/value-stream-map/${name}.vsm`, 'utf8') });
const twoSteps: Source = { fileName: 'two-steps.vsm', text: readFileSync('fixtures/fbl/conformance/fixtures/value-stream-map-future/two-steps.vsm', 'utf8') };

function edited(source: Source, request: EditRequest): string {
  const outcome: EditOutcome = type.edit(source, request, {}, true);
  if (outcome.kind !== 'applied') throw new Error(`${outcome.kind}: ${JSON.stringify(outcome)}`);
  return spliced(source.text, outcome.splices);
}

describe('the value stream map', () => {
  it.each(['request-fulfilment', 'restore-service'])('claims and draws %s with no findings', (name) => {
    const source = example(name);
    expect(type.claimed(source.fileName, source.text)).toBe(true);
    expect(type.findings(source)).toEqual([]);
    const scene = type.view(source, {});
    expect(scene.findings).toEqual([]);
    const types = new Set(scene.nodes.map((node) => node.type));
    expect([...types].sort()).toEqual(['Outcome', 'Step', 'Trigger']);
    // Ids by kind: the steps of the future state go on from those of the current one.
    expect(scene.nodes.filter((node) => node.type === 'Step').map((node) => node.id)).toEqual(Array.from({ length: 12 }, (_, i) => `s${i + 1}`));
  });

  it('labels a step with its name, its performer and its times, written short', () => {
    const scene = type.view(example('request-fulfilment'), {});
    const label = (id: string): string[] => scene.nodes.find((node) => node.id === id)?.labels.map((text) => text.text) ?? [];
    expect(label('s1')).toEqual(['Log request', 'service desk', 'PT 5m · WT 10m']);
    expect(label('s4')).toEqual(['Build custom', 'platform team', 'PT 2h · WT 1d']);
    expect(label('t1')).toEqual(['Request submitted']);
  });

  it('draws a trigger as a chevron and a step as a box', () => {
    const scene = type.view(example('request-fulfilment'), {});
    const shape = (id: string): string => scene.nodes.find((node) => node.id === id)?.shape.kind ?? '';
    expect(shape('t1')).toBe('path');
    expect(shape('s1')).toBe('rect');
  });

  it('adds a step under the next id of its kind', () => {
    expect(edited(twoSteps, { kind: 'drop', entry: 'step', x: 600, y: 10 })).toContain('      waitTime: PT1H\n    - id: s3\n      name: New step\n  outcome:');
  });

  it('renames a step, sets its waiting time and connects two elements', () => {
    expect(edited(twoSteps, { kind: 'rename', id: 's2', text: 'Fix it' })).toBe(twoSteps.text.replace('name: Resolve', 'name: Fix it'));
    expect(edited(twoSteps, { kind: 'setField', id: 's2', field: 'waitTime', value: 'PT3H' })).toBe(twoSteps.text.replace('waitTime: PT1H', 'waitTime: PT3H'));
    expect(edited(twoSteps, { kind: 'connect', from: 's1', to: 'o1' })).toBe(twoSteps.text.replace('      to: o1\n', '      to: o1\n    - from: s1\n      to: o1\n'));
  });

  it('creates the future state as a copy of the current one, each element based on its own', () => {
    const text = edited(twoSteps, { kind: 'action', action: 'createFutureState' } as EditRequest);
    expect(text).toContain('future:\n  trigger:\n    id: t2\n    name: Call received\n    basedOn: t1\n  steps:\n    - id: s3\n');
    expect(text).toContain('      basedOn: s2\n  outcome:\n    id: o2\n    name: Caller helped\n    basedOn: o1\n');
    expect(text).toContain('view:\n  state: future\n');
    // The binding has no rule that places a flow under `future.flows` (etalii.adp issue 810): its
    // flows are written where its only flow rule for them says, under `current.flows`.
    expect(text).toContain('    - from: t2\n      to: s3\n');
  });
});
