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
    // The two summaries and the comparison are derived nodes (DISL 4.11.2), drawn from the steps and flows.
    expect([...types].sort()).toEqual(['Comparison', 'Outcome', 'Step', 'Summary', 'Trigger']);
    // Ids by kind: the steps of the future state go on from those of the current one.
    expect(scene.nodes.filter((node) => node.type === 'Step').map((node) => node.id)).toEqual(Array.from({ length: 12 }, (_, i) => `s${i + 1}`));
  });

  it('draws each state\'s totals and the comparison of the two, computed and not editable', () => {
    const source = example('request-fulfilment');
    const scene = type.view(source, {});
    const label = (id: string): string | undefined => scene.nodes.find((node) => node.id === id)?.labels[0]?.text;
    // The figures the companion works by hand for this example (value-stream-map.md, "Request fulfilment").
    expect(label('summary-current')).toBe('Lead time 11.51 h\nProcess time 1.05 h\nFlow efficiency 9.1 %\nHand-offs 2.2');
    expect(label('summary-future')).toBe('Lead time 3.56 h\nProcess time 1.05 h\nFlow efficiency 29.5 %\nHand-offs 2.2');
    expect(label('comparison')).toBe('Current → future (difference)\nLead time 11.51 h → 3.56 h (-7.94 h)\nProcess time 1.05 h → 1.05 h (0 h)\nFlow efficiency 9.1 % → 29.5 %\nHand-offs 2.2 → 2.2 (0)');
    expect(type.fields(source, ['summary-current']).every((field) => field.readOnly !== undefined)).toBe(true);
    expect(type.edit(source, { kind: 'rename', id: 'comparison', text: 'x' }, {}, false).kind).toBe('refused');
  });

  it('computes the figures the companion works by hand for the restore-service example', () => {
    const scene = type.view(example('restore-service'), {});
    const label = (id: string): string | undefined => scene.nodes.find((node) => node.id === id)?.labels[0]?.text;
    expect(label('summary-current')).toBe('Lead time 5.92 h\nProcess time 1.42 h\nFlow efficiency 23.9 %\nHand-offs 3');
    expect(label('summary-future')).toBe('Lead time 3.75 h\nProcess time 1.42 h\nFlow efficiency 37.8 %\nHand-offs 2');
  });

  it('labels a step with its name, its performer and its times, written short', () => {
    const scene = type.view(example('request-fulfilment'), {});
    const label = (id: string): string[] => scene.nodes.find((node) => node.id === id)?.labels.map((text) => text.text) ?? [];
    expect(label('s1')).toEqual(['Log request', 'service desk', 'PT 5m · WT 10m']);
    expect(label('s4')).toEqual(['Build custom', 'platform team', 'PT 2h · WT 1d']);
    expect(label('t1')).toEqual(['Request submitted']);
  });

  it.each(['request-fulfilment', 'restore-service'])('stands no two elements of %s in the same place', (name) => {
    // Found by the host test (spec 090, T029): the columns and rows are recursive functions over the
    // flows, and a recursive call inside a comprehension once lost the outer one's place, so an
    // alternative stood on the main path and a step after a branch stood back in an early column.
    const scene = type.view(example(name), {});
    const placed = scene.nodes.filter((node) => ['Trigger', 'Step', 'Outcome'].includes(node.type));
    const overlapping = placed.flatMap((one, index) => placed.slice(index + 1)
      .filter((other) => one.box.x < other.box.x + other.box.width && other.box.x < one.box.x + one.box.width && one.box.y < other.box.y + other.box.height && other.box.y < one.box.y + one.box.height)
      .map((other) => `${one.id}/${other.id}`));
    expect(overlapping).toEqual([]);
  });

  it('puts a step one column after the deepest step that flows into it, and an alternative on a row of its own', () => {
    const scene = type.view(example('request-fulfilment'), {});
    const box = (id: string) => scene.nodes.find((node) => node.id === id)!.box;
    expect(box('s4').y).toBeGreaterThan(box('s3').y);
    expect(box('s6').x).toBe(box('s5').x + 230);
    expect(box('o1').x).toBe(box('s6').x + 230);
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
    // Found by the host test (spec 090, T029): "15m" was written, and the step's times then vanished.
    const shorthand = type.edit(twoSteps, { kind: 'setField', id: 's2', field: 'waitTime', value: '15m' }, {}, true);
    expect(shorthand).toMatchObject({ kind: 'refused', sentence: expect.stringContaining('PT15M') });
    expect(type.fields(twoSteps, ['s2']).find((field) => field.id === 'waitTime')).toMatchObject({ placeholder: 'PT15M, PT2H or P1D' });
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
