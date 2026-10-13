import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PersistencePlugin } from '../../../src/core/fbl/plugins/persistencePlugin';
import { missingPlugins, pluginReferences, pluginRegistry, type ActionPlugin, type LayoutPlugin } from '../../../src/core/tool/pluginRegistry';
import { altered, at, behaviorModelFolder, definitionOf, diagramOf, fixture, hypeCycleFolder, noPlugins, refusal, viewing, type Json } from './support';

// The plugins a definition names (etalii.adp spec 027, research R8; contracts/tool-type.md,
// "Plugins"). Every plugin here is made up for the test: this phase carries none.

const reader: PersistencePlugin = {
  id: 'org.example.reader',
  read: () => ({ elements: [], findings: [], unreadable: false }),
  plan: () => ({ refused: 'This reader plans nothing.' }),
  template: () => new Uint8Array(),
};
const layout: LayoutPlugin = { id: 'org.example.layout', place: () => ({}) };
const action: ActionPlugin = { id: 'org.example.action', run: () => ({ kind: 'refused', sentence: 'Not now.' }) };

describe('the plugin registry', () => {
  const registry = pluginRegistry({ persistence: [reader], layout: [layout], action: [action] });

  it('finds a plugin by its id, under what it provides and under nothing else', () => {
    expect(registry.persistence('org.example.reader')).toBe(reader);
    expect(registry.layout('org.example.layout')).toBe(layout);
    expect(registry.action('org.example.action')).toBe(action);
    expect(registry.layout('org.example.reader')).toBeUndefined();
    expect(registry.action('org.example.layout')).toBeUndefined();
    expect(registry.persistence('org.example.action')).toBeUndefined();
  });

  it('has nothing under an id it was not given', () => {
    expect(registry.persistence('org.example.other')).toBeUndefined();
    expect(pluginRegistry(noPlugins).action('org.example.action')).toBeUndefined();
  });
});

describe('the plugins a definition names', () => {
  const behaviorModel = definitionOf(behaviorModelFolder);
  const declared = Object.keys(at(behaviorModel.definition.specification, 'plugins') as Json);

  it('are those of its `plugins` section, each with what it provides and whether it is required', () => {
    const references = pluginReferences(behaviorModel.definition.specification, behaviorModel.bindings);
    expect(references.map((reference) => reference.id)).toEqual(declared);
    expect(references).toHaveLength(2);
    // DISL's `persistenceFormat` is the registry's `persistence`.
    expect(references[0]).toMatchObject({ provides: ['persistence'], required: true });
    expect(references[1]).toMatchObject({ provides: ['action'], required: false });
  });

  it('include the reader of a binding the definition does not declare, as a required one', () => {
    const undeclared = { ...behaviorModel.definition.specification, plugins: {} };
    expect(pluginReferences(undeclared, behaviorModel.bindings)).toEqual([{ id: declared[0], provides: ['persistence'], required: true, fallback: {} }]);
  });

  it('are missing when the registry lacks them, and not when it has them', () => {
    const references = pluginReferences(behaviorModel.definition.specification, behaviorModel.bindings);
    expect(missingPlugins(references, pluginRegistry(noPlugins)).map((reference) => reference.id)).toEqual(declared);
    const carried = pluginRegistry({ ...noPlugins, persistence: [{ ...reader, id: declared[0] }], action: [{ ...action, id: declared[1] }] });
    expect(missingPlugins(references, carried)).toEqual([]);
  });

  it('are none for a definition that names none', () => {
    const hypeCycle = definitionOf(hypeCycleFolder);
    expect(pluginReferences(hypeCycle.definition.specification, hypeCycle.bindings)).toEqual([]);
  });
});

describe('a required plugin that is missing', () => {
  // The behavior model's binding is read by a plugin, which this phase does not carry.
  const behaviorModel = definitionOf(behaviorModelFolder);
  const plugin = Object.keys(at(behaviorModel.definition.specification, 'plugins') as Json)[0];
  const type = diagramOf(behaviorModel);
  const source = { fileName: 'bug-fixer.md', text: readFileSync('examples/agent-behavior-modelling/bug-fixer/bug-fixer.md', 'utf8') };

  it('gives a document that is read-only, with a notice that names the plugin', () => {
    const scene = type.view(source, {});
    expect(scene.readOnly).toBe(true);
    expect(scene.notice).toContain(plugin);
  });

  it('gives FBL\'s `std.pluginMissing`, which names the plugin, once', () => {
    const found = type.findings(source).filter((finding) => finding.rule === 'std.pluginMissing');
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain(plugin);
    expect(found[0].message).toBe(type.view(source, {}).notice);
  });

  it('offers nothing that edits, and refuses every request with the same sentence', () => {
    expect(type.toolbox(source)).toEqual([]);
    expect(type.actions(source, [])).toEqual([]);
    const notice = type.view(source, {}).notice;
    expect(refusal(type.edit(source, { kind: 'rename', id: '1', text: 'Fix the bug' }, {}, false))).toBe(notice);
    expect(refusal(type.edit(source, { kind: 'drop', entry: 'anything', x: 0, y: 0 }, {}, true))).toBe(notice);
  });

  it('does so for a required plugin of any kind, and still draws what the binding reads', () => {
    const hypeCycle = definitionOf(hypeCycleFolder);
    const needing = { ...hypeCycle, definition: altered(hypeCycle.definition, (specification) => ({ ...specification, plugins: { 'org.example.action': { provides: ['action'], required: true } } })) };
    const document = fixture('triggers-and-notes');

    const without = diagramOf(needing);
    expect(without.view(document, {})).toMatchObject({ readOnly: true });
    expect(without.view(document, {}).nodes).toHaveLength(5);
    expect(without.view(document, {}).notice).toContain('org.example.action');
    expect(without.findings(document).map((finding) => finding.rule)).toEqual(['std.pluginMissing']);
    expect(refusal(without.edit(document, { kind: 'rename', id: 'radio', text: 'Wireless' }, {}, false))).toContain('org.example.action');

    const carrying = diagramOf(needing, pluginRegistry({ ...noPlugins, action: [action] }));
    expect(carrying.view(document, {}).readOnly).toBe(false);
    expect(carrying.findings(document)).toEqual([]);
    expect(carrying.edit(document, { kind: 'rename', id: 'radio', text: 'Wireless' }, {}, false).kind).toBe('applied');
  });
});

describe('an optional plugin that is missing', () => {
  const hypeCycle = definitionOf(hypeCycleFolder);
  const document = fixture('triggers-and-notes');
  // The layout a viewpoint names, as the plugin's own; its fallback is the algorithm the definition has.
  const packed = at(hypeCycle.definition.specification, 'viewpoints', 'compact', 'layout') as string;
  const algorithm = at(hypeCycle.definition.specification, 'layout', 'algorithms', packed, 'algorithm') as string;
  const byPlugin = {
    ...hypeCycle,
    definition: altered(hypeCycle.definition, (specification) => ({
      ...specification,
      plugins: { 'org.example.layout': { provides: ['layout'], required: false, fallback: { layout: algorithm } } },
      layout: { ...(specification.layout as Json), algorithms: { ...(at(specification, 'layout', 'algorithms') as Json), [packed]: { ...(at(specification, 'layout', 'algorithms', packed) as Json), algorithm: 'plugin:org.example.layout' } } },
    })),
  };
  const compact = viewing({ viewpoint: 'compact' });

  it('falls back as the definition\'s `fallback` says: the layout it names is run in the plugin\'s place', () => {
    const type = diagramOf(byPlugin);
    const places = type.view(document, compact).nodes.map((node) => [node.id, node.box]);
    expect(places).toEqual(diagramOf(hypeCycle).view(document, compact).nodes.map((node) => [node.id, node.box]));
    // Packed along its rows, and not left at the origin.
    expect(new Set(type.view(document, compact).nodes.map((node) => node.box.x)).size).toBeGreaterThan(1);
  });

  it('leaves the document editable, and is no finding of it', () => {
    const type = diagramOf(byPlugin);
    expect(type.view(document, {}).readOnly).toBe(false);
    expect(type.findings(document).filter((finding) => finding.rule === 'std.pluginMissing')).toEqual([]);
    expect(type.edit(document, { kind: 'rename', id: 'radio', text: 'Wireless' }, {}, false).kind).toBe('applied');
  });
});
