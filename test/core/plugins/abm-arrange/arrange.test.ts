import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DiagramToolType, EditRequest, Source } from '../../../../src/core/frame/toolType';
import { abmArrange } from '../../../../src/core/plugins/abm-arrange/index';
import { plugins } from '../../../../src/core/plugins/index';
import { pluginRegistry } from '../../../../src/core/tool/pluginRegistry';
import { layoutOf } from '../../../../src/core/tool/registrationLayout';
import { applied, at, behaviorModel, behaviorModelFolder, behaviorModelNames, definitionOf, diagramOf, noPlugins, refusal, specificationOf, type Applied } from '../../tool/support';

// The action plugin `net.etalii.adp.etalii.abmArrange` (etalii.adp spec 027, task T123): Agent
// Behavior Modelling's "Arrange diagram", through the tool type read from the definition. The tidy
// tree is the arrangement and a drag is only an override the registration keeps, so arranging
// forgets every dragged position.
//
// `tidyTreePlaces.json` is what `compute()` of the hand-coded `layout.ts` gave for the four
// examples, recorded once before that code was deleted: the top-left corner of every node, by id.

const type: DiagramToolType = diagramOf(definitionOf(behaviorModelFolder), plugins);
const recorded = JSON.parse(readFileSync('test/core/plugins/abm-arrange/tidyTreePlaces.json', 'utf8')) as Readonly<Record<string, Readonly<Record<string, { readonly x: number; readonly y: number }>>>>;

const arrange: EditRequest = { kind: 'action', action: 'abm.arrange' };
const made = (source: Source, request: EditRequest): Applied => applied(type.edit(source, request, {}, false));
/** The source with the registration an applied outcome gives it; the Markdown is as it was. */
const withRegistration = (source: Source, outcome: Applied): Source => ({ ...source, registration: outcome.registration as string });
/** Where every node of a scene is drawn, by id. */
const placesOf = (source: Source): Record<string, { x: number; y: number }> => Object.fromEntries(type.view(source, {}).nodes.map((node) => [node.id, { x: node.box.x, y: node.box.y }]));
/** The source after a node is dragged down by a distance: its row and everything beneath it is lowered in the registration. */
const lowered = (source: Source, id: string, by: number): Source => {
  const box = type.view(source, {}).nodes.find((node) => node.id === id)!.box;
  return withRegistration(source, made(source, { kind: 'move', id, x: box.x, y: box.y + by }));
};

describe('the arrange action gives the places today\'s `layout.ts` gives', () => {
  it('is the plugin the definition names for "Arrange diagram", on the diagram and on a node', () => {
    const operations = at(specificationOf(behaviorModelFolder), 'behavior', 'operations');
    expect([at(operations, 'arrange', 'plugin', 'name'), at(operations, 'arrangeFromNode', 'plugin', 'name')]).toEqual([abmArrange.id, abmArrange.id]);
    expect(plugins.action(abmArrange.id)).toBe(abmArrange);
    const example = behaviorModel('research-assistant');
    expect(type.actions(example, []).at(-1)).toEqual({ id: 'abm.arrange', label: 'Arrange diagram', icon: 'mdi-sitemap-outline', enabled: true });
    expect(type.actions(example, ['1.2']).at(-1)).toEqual({ id: 'abm.arrange', label: 'Arrange diagram', icon: 'mdi-sitemap-outline', enabled: true });
    // Invoked on a node it does the same as on the diagram.
    expect(type.edit(example, { ...arrange, id: '1.2' }, {}, false)).toEqual(type.edit(example, arrange, {}, false));
  });

  it('has the record of all four examples', () => {
    expect(Object.keys(recorded).sort()).toEqual(behaviorModelNames());
  });

  it.each(behaviorModelNames())('%s: after a row was dragged, arranging draws every node where the tidy tree alone puts it', (name) => {
    const example = behaviorModel(name);
    // The second row is lowered: every node but the root is drawn 40 further down, and the registration says so.
    const dragged = lowered(example, '1.1', 40);
    expect(Object.keys(layoutOf(dragged.registration)).length).toBeGreaterThan(0);
    expect(placesOf(dragged)).not.toEqual(recorded[name]);
    const outcome = made(dragged, arrange);
    expect(outcome.splices).toEqual([]);
    expect(layoutOf(outcome.registration as string)).toEqual({});
    const arranged = withRegistration(dragged, outcome);
    expect(placesOf(arranged)).toEqual(recorded[name]);
    // The tidy tree's own places are those of the Markdown opened without a registration.
    expect(placesOf(arranged)).toEqual(placesOf({ fileName: example.fileName, text: example.text }));
    expect(type.view(arranged, {}).tree?.nodes.map((node) => [node.id, { x: node.x, y: node.y }])).toEqual(Object.entries(recorded[name]));
  });

  it('forgets the row the example itself stores', () => {
    const example = behaviorModel('research-assistant');
    expect(layoutOf(example.registration)).toEqual({ '1.2': { x: 360, y: 160 } });
    expect(placesOf(example)['1.1'].y).toBe(160);
    const outcome = made(example, arrange);
    expect(outcome).toEqual({ kind: 'applied', splices: [], registration: 'etalii/agent-behavior-modelling\n' });
    expect(placesOf(withRegistration(example, outcome))).toEqual(recorded['research-assistant']);
  });

  it('forgets several dragged rows at once', () => {
    // Three rows are lowered, each by another distance, and the second row is dragged twice.
    let dragged = behaviorModel('customer-support');
    for (const [id, by] of [['1.1', 40], ['1.2.1', 25], ['1.3.1', 60], ['1.2', 10]] as const) dragged = lowered(dragged, id, by);
    const places = placesOf(dragged);
    const expected = recorded['customer-support'];
    expect(places['1.1'].y - expected['1.1'].y).toBe(50);
    expect(places['1.2.1'].y - expected['1.2.1'].y).toBe(75);
    expect(places['1.3.1'].y - expected['1.3.1'].y).toBe(110);
    expect(Object.keys(layoutOf(dragged.registration)).length).toBe(Object.keys(expected).length - 1);
    const outcome = made(dragged, arrange);
    expect(outcome.splices).toEqual([]);
    expect(outcome.registration).toBe('etalii/agent-behavior-modelling\n');
    expect(placesOf(withRegistration(dragged, outcome))).toEqual(expected);
  });

  it('never touches the Markdown, and keeps everything of the registration outside the block byte for byte', () => {
    const example = behaviorModel('research-assistant');
    const above = 'etalii/agent-behavior-modelling\r\nbody: research-assistant.md\r\n\r\n';
    const below = 'notes: kept\r\n\r\n  indented: too\r\n';
    const registration = `${above}layout:\r\n  1.2: 360 160\r\n  1.3.1: 1140 300\r\n${below}`;
    const outcome = made({ ...example, registration }, arrange);
    expect(outcome.splices).toEqual([]);
    expect(outcome.registration).toBe(above + below);
    // The plugin itself answers the same, whatever the tool type it is asked through.
    expect(abmArrange.run({ source: { ...example, registration } } as Parameters<typeof abmArrange.run>[0])).toEqual({ kind: 'applied', splices: [], registration: above + below });
  });

  it('refuses when no position is stored, and when there is no registration to store one in', () => {
    const example = behaviorModel('bug-fixer');
    expect(example.registration).toBe('etalii/agent-behavior-modelling\n');
    expect(refusal(type.edit(example, arrange, {}, false))).toBe('This behavior model is already arranged.');
    expect(refusal(type.edit({ fileName: example.fileName, text: example.text }, arrange, {}, false))).toBe('This behavior model was opened without a registration, so it has no dragged positions to forget.');
    // Once arranged, there is nothing left to forget.
    const dragged = lowered(example, '1.1', 40);
    expect(refusal(type.edit(withRegistration(dragged, made(dragged, arrange)), arrange, {}, false))).toBe('This behavior model is already arranged.');
  });

  it('does nothing where the host does not carry the plugin, which the definition does not require', () => {
    const markdownOnly = pluginRegistry({ ...noPlugins, persistence: [plugins.persistence('net.etalii.adp.etalii.abmMarkdown')!] });
    const without = diagramOf(definitionOf(behaviorModelFolder), markdownOnly);
    const example = behaviorModel('research-assistant');
    expect(at(specificationOf(behaviorModelFolder), 'plugins', abmArrange.id, 'required')).toBe(false);
    expect(without.view(example, {}).nodes).toHaveLength(13);
    // The entry is offered all the same, and no finding says the plugin is missing: it answers with an edit of nothing.
    expect(without.findings(example)).toEqual([]);
    expect(without.actions(example, []).at(-1)).toMatchObject({ id: 'abm.arrange', enabled: true });
    expect(without.edit(example, arrange, {}, false)).toEqual({ kind: 'applied', splices: [] });
  });
});
