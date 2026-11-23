import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EditOutcome, EditRequest, Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import { definitionOf, diagramOf, spliced } from './support';

// The SLO map opened and edited from its definition (etalii.adp spec 090, task T023): every read
// fixture of FBL's openslo-slo-read is drawn with the elements it lists, and the definition's
// findings each case states, at its element and with its severity, are reported and no others;
// the placeholder a missing reference stands for is drawn and cannot be edited; and the gestures of
// the canvas and ADP Properties write what FBL's openslo-slo-edits says. FBL's own reading of the
// fixtures is held by test/core/fbl/conformanceFixtures.test.ts.

const type = diagramOf(definitionOf('openslo-slo'), registry);
const fixtures = 'fixtures/fbl/conformance/fixtures/';

interface Expected {
  readonly rule: string;
  readonly line: number;
  readonly 'x-severity': 'error' | 'warning' | 'info';
  readonly 'x-element': string;
}

interface ReadFixture {
  readonly input: string;
  readonly read: { readonly elements: readonly { readonly id: string; readonly type: string }[]; readonly findings?: readonly Expected[] };
}

/** A read case's input: its own stream, or one of OpenSLO's examples, which are copied to examples/openslo-slo/. */
function inputOf(name: string, fixture: ReadFixture): Source {
  const vendored = fixture.input.indexOf('vendored/openslo/');
  const path = vendored < 0 ? `${fixtures}openslo-slo-read/${name}/${fixture.input}` : `examples/openslo-slo/${fixture.input.slice(vendored + 'vendored/openslo/'.length)}`;
  return { fileName: path.slice(path.lastIndexOf('/') + 1), text: readFileSync(path, 'utf8') };
}

const cases = readdirSync(`${fixtures}openslo-slo-read`).sort();
const fixtureOf = (name: string): ReadFixture => JSON.parse(readFileSync(`${fixtures}openslo-slo-read/${name}/fixture.json`, 'utf8')) as ReadFixture;
const severities = { error: 'error', warning: 'warning', info: 'information' } as const;

function edited(source: Source, request: EditRequest): string {
  const outcome: EditOutcome = type.edit(source, request, {}, true);
  if (outcome.kind !== 'applied') throw new Error(`${outcome.kind}: ${JSON.stringify(outcome)}`);
  return spliced(source.text, outcome.splices);
}

describe('the SLO map', () => {
  it('has every read case of FBL', () => {
    expect(cases.length).toBe(17);
  });

  it.each(cases)('draws %s with the elements it lists', (name) => {
    const fixture = fixtureOf(name);
    const source = inputOf(name, fixture);
    expect(type.claimed(source.fileName, source.text)).toBe(true);
    const drawn = new Set(type.view(source, {}).nodes.map((node) => `${node.id} (${node.type})`));
    // A document of no kind the map draws is kept and listed, not drawn (openslo.unknown-kind).
    for (const element of fixture.read.elements.filter((candidate) => candidate.type !== 'Unbound')) expect(drawn).toContain(`${element.id} (${element.type})`);
  });

  it.each(cases.filter((name) => fixtureOf(name).read.findings !== undefined))('reports the findings %s states, at their elements, and no others', (name) => {
    const fixture = fixtureOf(name);
    const found = type.findings(inputOf(name, fixture)).map((finding) => `${finding.rule} ${finding.severity} line ${finding.line + 1} at ${finding.element ?? ''}`).sort();
    const stated = (fixture.read.findings ?? []).map((finding) => `${finding.rule} ${severities[finding['x-severity']]} line ${finding.line} at ${finding['x-element']}`).sort();
    expect(found).toEqual(stated);
  });

  it('draws a placeholder for an object a reference names and the file does not hold, which cannot be edited', () => {
    const source = inputOf('findings-missing-reference', fixtureOf('findings-missing-reference'));
    const scene = type.view(source, {});
    const placeholder = scene.nodes.find((node) => node.id === 'missing:Service:payments');
    expect(placeholder?.type).toBe('Missing');
    expect(placeholder?.style.stroke?.dash).toEqual([6, 4]);
    expect(scene.edges.find((edge) => edge.type === 'OfService')?.target).toBe('missing:Service:payments');
    const refusal = 'This object is not in the file. Open the folder it belongs to through a registration to draw it, or add its document here.';
    expect(type.edit(source, { kind: 'rename', id: 'missing:Service:payments', text: 'payments-api' }, {}, false)).toEqual({ kind: 'refused', sentence: refusal });
    expect(type.fields(source, ['missing:Service:payments']).every((field) => field.readOnly === refusal)).toBe(true);
  });

  it('draws a data source as a cylinder and the lines of a reference with rounded corners, as its notation says', () => {
    const text = [
      'apiVersion: openslo/v1', 'kind: DataSource', 'metadata:', '  name: prometheus', 'spec:', '  type: Prometheus', '  connectionDetails: {}',
      '---', 'apiVersion: openslo/v1', 'kind: SLI', 'metadata:', '  name: latency', 'spec:', '  thresholdMetric:', '    metricSource:', '      metricSourceRef: prometheus', '      spec:', '        query: latency', '',
    ].join('\n');
    const source: Source = { fileName: 'sources.yaml', text };
    const scene = type.view(source, {});
    const cylinder = scene.nodes.find((node) => node.id === 'DataSource:prometheus');
    expect(cylinder?.type).toBe('DataSource');
    expect(cylinder?.shape.kind).toBe('path');
    const measured = scene.edges.find((edge) => edge.target === 'DataSource:prometheus');
    expect(measured).toBeDefined();
    expect(measured!.path.length).toBeGreaterThan(1);
    // Each corner of the orthogonal route is a quarter curve.
    expect(scene.edges.some((edge) => edge.path.some((command) => command.op === 'Q'))).toBe(true);
    expect(scene.findings.filter((finding) => finding.code.startsWith('disl.'))).toEqual([]);
  });
});

describe('the gestures of the SLO map, as the bytes of FBL\'s openslo-slo-edits', () => {
  interface Step { readonly expect?: string }
  const steps = (JSON.parse(readFileSync(`${fixtures}openslo-slo-edits/fixture.json`, 'utf8')) as { readonly steps: readonly Step[] }).steps;
  const checkout: Source = { fileName: 'checkout.yaml', text: readFileSync(`${fixtures}openslo-slo-edits/checkout.yaml`, 'utf8') };

  it('changes an objective\'s target in ADP Properties, the comment after it staying', () => {
    expect(edited(checkout, { kind: 'setField', id: 'SLO:checkout-availability/objective:1', field: 'targetRatio', value: '0.995' })).toBe(steps[1].expect);
  });

  it('changes the SLO\'s window, its first time window\'s duration', () => {
    const before: Source = { ...checkout, text: steps[1].expect! };
    expect(edited(before, { kind: 'setField', id: 'SLO:checkout-availability', field: 'duration', value: '7d' })).toBe(steps[2].expect);
  });
});
