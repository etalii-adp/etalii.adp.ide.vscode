import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readingOf } from '../../../src/core/desl/operations';
import { expressionsOf, loadDesigner } from '../../../src/core/desl/specification';
import { interpretMetamodel } from '../../../src/core/disl/metamodel';
import type { Model, Value } from '../../../src/core/disl/model';
import { readModel } from '../../../src/core/disl/persistence';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import { encode } from '../../../src/core/fbl/text/utf8';
import { plugins as registry } from '../../../src/core/plugins/index';
import { definitionOf, designerOf } from './support';

// The post-incident review read from its definition (etalii.adp spec 090, task T012), held to what
// FBL's fixtures `post-incident-review-read` declare a host reads of the two examples: the document's
// own attributes, every entry, factor, action and category in the order of the file, each with its
// attributes as the specification types them, and no finding of the reading.

const folder = definitionOf('post-incident-review');
const designer = loadDesigner(folder.definition.specification).value;
const metamodel = interpretMetamodel(designer.interpreted).value;
const binding = folder.bindings[0];

interface Expected {
  readonly document: { readonly attributes: Readonly<Record<string, unknown>> };
  readonly elements: readonly { readonly id: string; readonly type: string; readonly attributes: Readonly<Record<string, unknown>> }[];
}
// The four intervals of each example, as its timeline gives them: start to detection, detection to engagement, detection to mitigated, start to resolved.
const cases = [
  { name: 'certificate-expiry', fixture: 'fixtures/tools/post-incident-review/read/fixture.json', intervals: ['PT47M', 'PT8M', 'PT51M', 'PT3H'] },
  { name: 'checkout-latency', fixture: 'fixtures/tools/post-incident-review/read/checkout-latency/fixture.json', intervals: ['PT7M', 'PT8M', 'PT50M', 'PT1H25M'] },
].map(({ name, fixture, intervals }) => ({ name, intervals, text: readFileSync(`examples/post-incident-review/${name}.md`, 'utf8'), read: (JSON.parse(readFileSync(fixture, 'utf8')) as { read: Expected }).read }));
const figures = ['timeToDetect', 'timeToEngage', 'timeToMitigate', 'timeToResolve'];
const surface = designer.surface as { parts: { id: string; figures?: Record<string, { value: string }> }[] };
const summary = surface.parts.find((part) => part.id === 'summary')!;

/** The model the designer reads of a text, as the host reads it: through the binding, with what the specification tells the FBL library. */
function modelOf(name: string, text: string): { readonly model: Model; readonly findings: readonly string[] } {
  const expressions = expressionsOf(designer, metamodel);
  const body = OpenBody.open(encode(text), binding, { fileName: `${name}.md`, ...readingOf(designer.persistence, metamodel, expressions)(binding) });
  const read = readModel(body.model, binding, metamodel, designer.persistence);
  return { model: read.value, findings: read.findings.map((finding) => `${finding.code} ${finding.message}`) };
}

/** A value of the model as a fixture writes it. */
const written = (value: Value | undefined): unknown => (Array.isArray(value) ? value.map(written) : value === undefined ? undefined : value);

describe.each(cases)('the post-incident review $name', ({ name, text, read, intervals }) => {
  const { model, findings } = modelOf(name, text);

  it('is read with no finding', () => {
    expect(findings).toEqual([]);
  });

  it('reads the document\'s own attributes', () => {
    for (const [attribute, value] of Object.entries(read.document.attributes)) expect(written(model.diagram[attribute]), attribute).toEqual(value);
  });

  it('reads every element in the order of the file, each with its attributes', () => {
    expect(model.elements.map((element) => `${element.id} ${element.type}`)).toEqual(read.elements.map((element) => `${element.id} ${element.type}`));
    for (const expected of read.elements) {
      const element = model.elements.find((candidate) => candidate.id === expected.id)!;
      for (const [attribute, value] of Object.entries(expected.attributes)) expect(written(element.attributes[attribute]) ?? emptyOf(value), `${expected.id}.${attribute}`).toEqual(value);
    }
  });

  it('is claimed by the designer, which reads every entry and finds every milestone it has', () => {
    const type = designerOf(folder, registry);
    expect(type.claimed(`${name}.md`, text)).toBe(true);
    // What the designer reports of the review itself: none of its entries is unreadable, and its milestones are each there once.
    const reported = type.findings({ fileName: `${name}.md`, text }).map((finding) => finding.rule);
    expect(reported.filter((rule) => rule.startsWith('std.') || rule === 'pir.missing-milestone' || rule === 'pir.second-milestone')).toEqual([]);
  });

  it('computes the four intervals between its milestones', () => {
    const expressions = expressionsOf(designer, metamodel);
    const world = expressions.over(model);
    const computed = figures.map((figure) => expressions.evaluate(summary.figures![figure].value, world.scope(undefined)));
    expect(computed.map((result) => (result.ok ? result.value : result.error))).toEqual(intervals);
  });
});

/** What a fixture writes for an attribute a reading leaves out: a list with no item, an empty text, false. */
function emptyOf(value: unknown): unknown {
  if (Array.isArray(value)) return [];
  if (value === '') return '';
  if (value === false) return false;
  return undefined;
}
