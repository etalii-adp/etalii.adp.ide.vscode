import { describe, expect, it } from 'vitest';
import { isWarningOrWorse } from '../../../src/core/fbl/finding';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import { produceTemplate, replacePlaceholders, templateKey } from '../../../src/core/fbl/routing/templateWriter';
import { allBindings, bindingOf } from './support/bindings';
import { textOf, utf8 } from './support/repository';
import { TestPlugin } from './support/testPlugin';

// Templates (FBL 13). Counterparts of standalone's Routing/Templates.Tests.cs.
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
