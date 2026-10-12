import { describe, expect, it } from 'vitest';
import { isWarningOrWorse } from '../../../src/core/fbl/finding';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import { produceTemplate, replacePlaceholders, templateKey } from '../../../src/core/fbl/routing/templateWriter';
import { allBindings, bindingOf } from './support/bindings';
import { knowledgeBinding, knowledgeIds, knowledgeTypes } from './support/knowledge';
import { textOf, utf8 } from './support/repository';
import { TestPlugin } from './support/testPlugin';

// Templates (FBL 13). Counterparts of standalone's Routing/Templates.Tests.cs and, for what a new
// knowledge file starts as, of its Conformance/KnowledgeTemplates.Tests.cs.
const declaredTemplates = allBindings()
  .filter(({ binding }) => binding.template && !binding.plugin)
  .flatMap(({ document, binding }) => binding.claims.origins.map((origin) => ({ document, name: binding.name, origin })));

describe('a new body from a template', () => {
  it('the declared templates are found', () => {
    // Six bindings read by their rules have a template, one of them for six origins.
    expect(declaredTemplates.length).toBeGreaterThanOrEqual(11);
  });

  it.each(declaredTemplates)('every declared template reads back without a warning: $document#$name as $origin', ({ document, name, origin }) => {
    const binding = bindingOf(document, name);
    const fileName = `New plan${binding.claims.extensions[0] ?? '.txt'}`;
    const bytes = produceTemplate(binding, origin, fileName, (rule) => `ID_${rule}_1`)!;
    const model = OpenBody.open(bytes, binding, { fileName }).model;
    expect(model.unreadable, 'the template is unreadable').toBe(false);
    expect(model.findings.filter((finding) => isWarningOrWorse(finding.severity))).toEqual([]);
  });

  it('a template by origin wins over the bindings text', () => {
    const turtle = bindingOf('w3c-turtle.fbl', 'turtle');
    const skos = textOf(produceTemplate(turtle, 'w3c/skos', 'Animals 2.ttl', () => 'x')!);
    const rdf = textOf(produceTemplate(turtle, 'w3c/rdf', 'Animals 2.ttl', () => 'x')!);
    expect(skos).toContain('ex:Animals_2 a skos:ConceptScheme ;\r\n');
    expect(skos).toContain('skos:prefLabel "Animals 2"@en');
    expect(rdf).toContain('ex:Animals_2 rdfs:label "Animals 2" .\r\n');
  });

  it.each([
    ['Plan', 'Plan'],
    ['my plan-2', 'my_plan_2'],
    ['2024 roadmap', '_2024_roadmap'],
    ['__x__', 'x'],
    ['---', 'untitled'],
    ['café', 'caf'],
  ])('the key placeholder is sanitised exactly: %j', (baseName, key) => {
    expect(templateKey(baseName)).toBe(key);
  });

  it('only the four placeholders are replaced', () => {
    const text = replacePlaceholders('{name} {base} {key} {newid:node} {id} {newid} { base }', 'a b.mm', (rule) => `N-${rule}`);
    expect(text).toBe('a b.mm a b a_b N-node {id} {newid} { base }');
  });

  it('a plugin without template text is asked for one', () => {
    const chart = bindingOf('helm-chart.fbl', 'chart');
    const bytes = produceTemplate(chart, 'helm/chart', 'web.yaml', () => 'x', new TestPlugin('net.etalii.adp.helm.chartFolder'));
    expect(bytes).toEqual(utf8('template for web.yaml (web)'));
  });
});

/** A new knowledge file from one binding's template, read through another (or the same) binding. */
function newKnowledgeFile(template: string, readBy: string, extension: string): OpenBody {
  let made = 0;
  const fileName = `Cities${extension}`;
  const bytes = produceTemplate(knowledgeBinding(template), 'etalii/knowledge', fileName, (rule) => `${rule}${++made}`);
  expect(bytes).toBeDefined();
  return OpenBody.open(bytes!, knowledgeBinding(readBy), { fileName, deriveId: knowledgeIds, attributeType: knowledgeTypes.of });
}

describe('a new knowledge file', () => {
  it.each([
    ['yaml', '.yaml'],
    ['json', '.json'],
    ['xml', '.xml'],
  ])('a new file, reads through its binding, as one title property one view and no rows: %s', (name, extension) => {
    const model = newKnowledgeFile(name, name, extension).model;

    // Nothing to report, and exactly the table an author starts from.
    expect(model.unreadable).toBe(false);
    expect(model.findings).toEqual([]);
    expect(model.elements.map((element) => element.type).sort()).toEqual(['Property', 'Table', 'View']);

    const table = model.elements.find((element) => element.type === 'Table')!;
    expect(table.attributes.name).toBe('Cities');

    const property = model.elements.find((element) => element.type === 'Property')!;
    expect(property.id).toBe('property1');
    expect(property.attributes.name).toBe('Name');
    const written = Object.values(property.attributes).map((value) => String(value).toLowerCase());
    expect(written).toContain('text');
    expect(written).toContain('true');

    const view = model.elements.find((element) => element.type === 'View')!;
    expect(view.id).toBe('view2');
  });

  it.each([
    ['yaml', 'json', '.json'],
    ['json', 'xml', '.xml'],
    ['xml', 'yaml', '.yaml'],
  ])('a template of another format, is not a table of this one: %s read as %s', (template, readBy, extension) => {
    // What a host would create if it took the template of the wrong binding.
    const model = newKnowledgeFile(template, readBy, extension).model;

    // It is caught on reading, by the file being unreadable or holding no table.
    const caught = model.unreadable || model.findings.length > 0 || model.elements.every((element) => element.type !== 'Property');
    expect(caught, `A ${template} template read as ${readBy} gave a table.`).toBe(true);
  });
});
