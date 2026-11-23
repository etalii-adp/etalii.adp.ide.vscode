import { describe, expect, it } from 'vitest';
import { loadDesigner } from '../../../src/core/desl/specification';
import { documentTypesOf, interpretSurface, type SectionsSurface } from '../../../src/core/desl/surface';
import { interpretMetamodel } from '../../../src/core/disl/metamodel';
import { object, specificationAt, type Json } from './support';

// DESL 0.4's `sections` surface (DESL 7.8), with the checks of DESL 10.1, step 4, read of the
// post-incident review's specification (etalii.adp spec 090, task T016).

const review = (): Json => specificationAt('definitions/post-incident-review/post-incident-review.des');

/** A specification's surface as this host reads it, with the types the persistence maps to the document and the operations it declares. */
function read(json: Json) {
  const loaded = loadDesigner(json);
  const documentTypes = documentTypesOf(loaded.value.persistence);
  return { loaded, surface: interpretSurface(loaded.value.surface, interpretMetamodel(loaded.value.interpreted).value, 'en', { documentTypes, operations: Object.keys(loaded.value.operations) }) };
}

/** The review with its surface's parts changed. */
const withParts = (change: (parts: Json[]) => Json[]): Json => {
  const json = review();
  const surface = object(json.surface);
  return { ...json, surface: { ...surface, parts: change((surface.parts as Json[]).map((part) => ({ ...part }))) } };
};
const changedPart = (id: string, change: (part: Json) => Json): Json => withParts((parts) => parts.map((part) => (part.id === id ? change(part) : part)));

describe('a sections surface (DESL 7.8)', () => {
  it('is read of DESL 0.4 with nothing found', () => {
    const { loaded, surface } = read(review());
    expect(loaded.value.interpreted).toBeDefined();
    expect(loaded.findings).toEqual([]);
    expect(surface.findings).toEqual([]);
    expect(surface.value?.kind).toBe('sections');
  });

  it('has its parts in the order the specification lists them, each a record or a list of its type', () => {
    const sections = read(review()).surface.value as SectionsSurface;
    expect(sections.parts.map((part) => `${part.id} ${part.kind} ${part.type}${part.document ? ' (document)' : ''}`)).toEqual([
      'summary record Summary (document)', 'impact record Impact (document)', 'timeline list Entry', 'factors list Factor', 'actions list Action', 'categories list Category',
    ]);
  });

  it('gives each field its label, and the widget its attribute\'s type implies where none is named', () => {
    const sections = read(review()).surface.value as SectionsSurface;
    const timeline = sections.parts.find((part) => part.id === 'timeline')!;
    expect(timeline.fields.map((field) => `${field.attribute} ${field.label} ${field.widget}`)).toEqual([
      'time Time dateTime', 'kind Milestone choice', 'text Text text', 'author By choice', 'evidence Evidence text', 'detail Detail text',
    ]);
    const actions = sections.parts.find((part) => part.id === 'actions')!;
    expect(actions.fields.map((field) => `${field.attribute} ${field.widget} ${field.many ? 'many' : 'one'}`)).toEqual([
      'done checkbox one', 'text text one', 'owner text one', 'due date one', 'addresses text many',
    ]);
  });

  it('reads a list\'s order, groups, add gesture, time strip and marks, and a part\'s figures, in their order', () => {
    const sections = read(review()).surface.value as SectionsSurface;
    const [summary, , timeline, factors] = sections.parts;
    expect(summary.figures.map((figure) => `${figure.id} ${figure.label} ${figure.absentText}`)).toEqual([
      'timeToDetect Time to detect No start or detection entry yet', 'timeToEngage Time to engage No detection or engagement entry yet',
      'timeToMitigate Time to mitigate No detection or mitigated entry yet', 'timeToResolve Time to resolve No start or resolved entry yet',
    ]);
    expect(timeline.order).toContain('int(self.time)');
    expect(timeline.add).toBe('addEntry');
    expect(timeline.timeStrip).toEqual({ at: 'time', highlight: 'has(self.kind)', label: expect.stringContaining("'Detection'") });
    expect(timeline.marks.map((mark) => `${mark.id} ${mark.label} ${mark.style}`)).toEqual(['secondMilestone Second milestone warning', 'noAuthor No author info']);
    expect(factors.group).toContain('uncategorised');
    expect(factors.marks.map((mark) => mark.style)).toEqual(['warning', 'info']);
  });

  it.each([
    ['two parts of one id', withParts((parts) => [...parts, { ...parts[5] }]), 'categories'],
    ['a part of a type that is neither an element type nor mapped to the document', changedPart('impact', (part) => ({ ...part, type: 'Outcome' })), 'Outcome'],
    ['a field of an attribute its type does not have', changedPart('timeline', (part) => ({ ...part, fields: [...(part.fields as Json[]), { attribute: 'severity' }] })), 'severity'],
    ['a field of an attribute the document does not have', changedPart('summary', (part) => ({ ...part, fields: [{ attribute: 'impact' }] })), 'impact'],
    ['an add gesture of no operation', changedPart('factors', (part) => ({ ...part, add: 'addCause' })), 'addCause'],
    ['a time strip at an attribute that is no date and time', changedPart('timeline', (part) => ({ ...part, timeStrip: { at: 'text' } })), 'text'],
    ['an order on a record', changedPart('impact', (part) => ({ ...part, order: 'self.effect' })), 'order'],
    ['marks on a record', changedPart('summary', (part) => ({ ...part, marks: { late: { when: 'true', label: 'Late' } } })), 'marks'],
    ['a part of no kind DESL has', changedPart('categories', (part) => ({ ...part, kind: 'grid' })), 'grid'],
    ['a widget DESL does not have', changedPart('categories', (part) => ({ ...part, fields: [{ attribute: 'name', widget: 'slider' }] })), 'slider'],
  ])('is not read with %s, and says what', (_, json, named) => {
    const { surface } = read(json);
    expect(surface.value).toBeUndefined();
    expect(surface.findings.map((found) => found.code)).toEqual(expect.arrayContaining(['desl.surface']));
    expect(surface.findings.map((found) => found.message).join(' ')).toContain(named);
  });
});
