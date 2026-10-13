import { describe, expect, it } from 'vitest';
import { decode, encode } from '../../../src/core/fbl/text/utf8';
import type { DiagramToolType, EditOutcome, EditRequest, Source } from '../../../src/core/frame/toolType';
import { plugins } from '../../../src/core/plugins/index';
import { readDefinitionFolder } from '../../../src/core/tool/definitionFolder';
import { at, behaviorModel, behaviorModelFolder, definitionOf, diagramOf, example, fixture, folderFiles, hypeCycleFolder, object, withFile, type Json } from './support';

// A definition is what a tool type is: a label, a colour and a refusal sentence changed in a
// temporary copy of a definition show in the tool type, with no other change (etalii.adp spec 027,
// task T125). The copy is the folder's files in memory, as the extension reads them, with the three
// values replaced in its specification; the folder on disk is never written.

type Path = readonly (string | number)[];
interface Change { readonly path: Path; readonly from: unknown; readonly to: unknown }

/** A value with what lies at a path replaced, everything else as it was. */
const replaced = (value: unknown, path: Path, to: unknown): unknown => {
  if (path.length === 0) return to;
  const [step, ...rest] = path;
  if (Array.isArray(value)) return (value as unknown[]).map((item, index) => (index === step ? replaced(item, rest, to) : item));
  return { ...object(value), [step]: replaced(object(value)[String(step)], rest, to) };
};
const valueAt = (value: unknown, path: Path): unknown => path.reduce<unknown>((node, step) => (Array.isArray(node) ? (node as unknown[])[Number(step)] : object(node)[String(step)]), value);

/** The tool type of a copy of a folder, with each change made to its specification: every change replaces the value it says it does. */
function typeOfCopy(folder: string, changes: readonly Change[]): DiagramToolType {
  const files = folderFiles(folder);
  const name = `${folder}.dis`;
  let specification = JSON.parse(decode(files.get(name)!)) as Json;
  for (const change of changes) {
    expect(valueAt(specification, change.path), change.path.join('/')).toEqual(change.from);
    specification = replaced(specification, change.path, change.to) as Json;
  }
  const read = readDefinitionFolder(folder, withFile(files, name, encode(JSON.stringify(specification))));
  if ('reason' in read) throw new Error(`The copy of definitions/${folder} is no tool type: ${read.reason}`);
  return diagramOf(read, plugins);
}

/** Everything a tool type gives for a document: its scene, its toolbox, its findings, and the rows and the actions of each element and of the diagram. */
function given(type: DiagramToolType, source: Source) {
  const scene = type.view(source, {});
  const ids = [...scene.nodes.map((node) => node.id), ...scene.edges.map((edge) => edge.id)];
  const { tokens, ...drawn } = scene;
  return {
    drawn, tokens, toolbox: type.toolbox(source), findings: type.findings(source),
    fields: Object.fromEntries(ids.map((id) => [id, type.fields(source, [id])])),
    actions: Object.fromEntries(['', ...ids].map((id) => [id, type.actions(source, id === '' ? [] : [id])])),
  };
}

/** What each request comes to. */
const outcomes = (type: DiagramToolType, source: Source, requests: readonly EditRequest[]): EditOutcome[] => requests.map((request) => type.edit(source, request, {}, false));
/** An outcome with the ids a document cannot have had before left out: a new element is given a new id each time. */
const comparable = (outcome: EditOutcome): unknown => (outcome.kind === 'applied' ? { ...outcome, splices: outcome.splices.map((splice) => ({ ...splice, text: splice.text.replace(/id: [0-9a-z]{25}/, 'id: <new>') })), select: outcome.select === undefined ? undefined : '<new>' } : outcome);

describe('a label, a colour and a refusal sentence changed in a temporary copy of a definition show in the tool type with no other change', () => {
  describe('the Gartner hype cycle graph', () => {
    const label: Change = { path: ['toolbox', 'groups', 0, 'tools', 0, 'label'], from: 'Trend', to: 'Technology' };
    const colour: Change = { path: ['notation', 'theme', 'tokens', 'ghg.peak'], from: '#f7e7a1', to: '#ffd700' };
    const sentence: Change = { path: ['behavior', 'messages', 'std.readOnly'], from: 'The graph could not be read, so it cannot be edited.', to: 'Mend the YAML of this graph before you edit it.' };
    const original = diagramOf(definitionOf(hypeCycleFolder), plugins);
    const changed = typeOfCopy(hypeCycleFolder, [label, colour, sentence]);
    const documents = [fixture('triggers-and-notes'), example('llms-and-agents')];
    const broken = fixture('not-yaml');

    it('a copy with nothing changed gives what the definition gives', () => {
      const copy = typeOfCopy(hypeCycleFolder, []);
      for (const document of documents) expect(given(copy, document)).toEqual(given(original, document));
      expect(given(copy, broken)).toEqual(given(original, broken));
    });

    it('the label of a toolbox tool', () => {
      const entry = (type: DiagramToolType) => type.toolbox(documents[0]).find((tool) => tool.id === 'ghg.add.trend');
      expect(entry(original)?.label).toBe('Trend');
      expect(entry(changed)?.label).toBe('Technology');
      expect(entry(changed)).toEqual({ ...entry(original), label: 'Technology' });
    });

    it('the colour of a theme token', () => {
      expect(original.view(documents[0], {}).tokens?.['ghg.peak']).toEqual({ light: '#f7e7a1', dark: '#6b5a17' });
      // The dark mode states its own value for the token, which the copy leaves as it is.
      expect(changed.view(documents[0], {}).tokens?.['ghg.peak']).toEqual({ light: '#ffd700', dark: '#6b5a17' });
    });

    it('the sentence a graph that cannot be read is refused with', () => {
      const request: EditRequest = { kind: 'action', action: 'ghg.arrange' };
      expect(original.edit(broken, request, {}, false)).toEqual({ kind: 'refused', sentence: sentence.from });
      expect(changed.edit(broken, request, {}, false)).toEqual({ kind: 'refused', sentence: sentence.to });
      expect(changed.view(broken, {}).notice).toBe(sentence.to);
      expect(original.view(broken, {}).notice).toBe(sentence.from);
    });

    it.each(documents.map((document) => [document.fileName, document] as const))('and nothing else of %s', (_name, document) => {
      const before = given(original, document);
      const after = given(changed, document);
      // The copy with the one label and the one token put back is the definition's, to the last value.
      expect({
        ...after,
        toolbox: after.toolbox.map((tool) => (tool.id === 'ghg.add.trend' ? { ...tool, label: label.from } : tool)),
        tokens: { ...after.tokens, 'ghg.peak': { ...after.tokens?.['ghg.peak'], light: colour.from } },
      }).toEqual(before);
      expect(after.toolbox.filter((tool, index) => tool.label !== before.toolbox[index].label)).toHaveLength(1);
      expect(Object.keys(after.tokens ?? {}).filter((token) => JSON.stringify(after.tokens?.[token]) !== JSON.stringify(before.tokens?.[token]))).toEqual(['ghg.peak']);
    });

    it('and no other sentence: every other request comes to what it came to', () => {
      const requests: EditRequest[] = [
        { kind: 'rename', id: 'transistors', text: '  ' }, { kind: 'connect', from: 'radio', to: 'radio' }, { kind: 'connect', from: 'radio', to: 'transistor-invented' },
        { kind: 'action', action: 'ghg.even-phases', id: 'transistors' }, { kind: 'setField', id: 'radio', field: 'ghg.stop', value: 'June' }, { kind: 'handle', id: 'radio', handle: 2, x: 300 },
        { kind: 'action', action: 'ghg.remove', id: 'transistors' }, { kind: 'rename', id: 'radio', text: 'Wireless' }, { kind: 'drop', entry: 'ghg.add.trend', x: 0, y: 0 }, { kind: 'action', action: 'ghg.arrange' },
      ];
      expect(outcomes(changed, documents[0], requests).map(comparable)).toEqual(outcomes(original, documents[0], requests).map(comparable));
      expect(outcomes(original, documents[0], requests).filter((outcome) => outcome.kind === 'refused')).toHaveLength(6);
      // The findings of the graph that cannot be read are the reader's, and are as they were.
      expect(changed.findings(broken)).toEqual(original.findings(broken));
    });
  });

  describe('Agent Behavior Modelling', () => {
    const label: Change = { path: ['toolbox', 'groups', 0, 'tools', 7, 'label'], from: 'Check', to: 'Verify' };
    const colour: Change = { path: ['notation', 'theme', 'tokens', 'color.abm.check'], from: '#9edcfa', to: '#00aaff' };
    const refusal = 'Drop the node below the node it belongs under: a Do in order, a Try in order, a Do together, or a Retry, Repeat until, Only while or Ask approval before that has no child yet.';
    const sentence: Change = { path: ['behavior', 'placements', 'underNearestAbove', 'refusal'], from: refusal, to: 'Drop it under a node that takes another child.' };
    const original = diagramOf(definitionOf(behaviorModelFolder), plugins);
    const changed = typeOfCopy(behaviorModelFolder, [label, colour, sentence]);
    const documents = [behaviorModel('research-assistant'), behaviorModel('customer-support')];

    it('a copy with nothing changed gives what the definition gives', () => {
      const copy = typeOfCopy(behaviorModelFolder, []);
      for (const document of documents) expect(given(copy, document)).toEqual(given(original, document));
    });

    it('the label of a toolbox tool', () => {
      const entry = (type: DiagramToolType) => type.toolbox(documents[0]).find((tool) => tool.id === 'abm.add.check');
      expect(entry(original)?.label).toBe('Check');
      expect(entry(changed)).toEqual({ ...entry(original), label: 'Verify' });
    });

    it('the colour of a theme token', () => {
      expect(original.view(documents[0], {}).tokens?.['color.abm.check']).toEqual({ light: '#9edcfa', dark: '#086fa1' });
      expect(changed.view(documents[0], {}).tokens?.['color.abm.check']).toEqual({ light: '#00aaff', dark: '#086fa1' });
      // A Check is still filled with the token: its colour is the page's to look up.
      expect(changed.view(documents[0], {}).nodes.find((node) => node.id === '1.1.1')?.style.fill).toEqual({ token: 'color.abm.check' });
    });

    it('the sentence a drop no node is above is refused with', () => {
      const request: EditRequest = { kind: 'drop', entry: 'abm.add.check', x: 0, y: -500 };
      expect(original.edit(documents[0], request, {}, false)).toEqual({ kind: 'refused', sentence: refusal });
      expect(changed.edit(documents[0], request, {}, false)).toEqual({ kind: 'refused', sentence: 'Drop it under a node that takes another child.' });
      // The same placement refuses "Add Check here" on the canvas, with the same sentence.
      expect(changed.edit(documents[0], { kind: 'action', action: 'abm.add.check', x: 0, y: -500 }, {}, false)).toEqual({ kind: 'refused', sentence: 'Drop it under a node that takes another child.' });
    });

    it.each(documents.map((document) => [document.fileName, document] as const))('and nothing else of %s', (_name, document) => {
      const before = given(original, document);
      const after = given(changed, document);
      expect({
        ...after,
        toolbox: after.toolbox.map((tool) => (tool.id === 'abm.add.check' ? { ...tool, label: label.from } : tool)),
        tokens: { ...after.tokens, 'color.abm.check': { ...after.tokens?.['color.abm.check'], light: colour.from } },
      }).toEqual(before);
      expect(after.toolbox.filter((tool, index) => tool.label !== before.toolbox[index].label)).toHaveLength(1);
      // The label of the tool is no other text: the keyword a Check is drawn with and the entries of the menus are the type's own.
      expect(after.drawn.nodes.find((node) => node.type === 'Check')?.labels[0].text).toBe('Check');
      expect(after.actions[''].map((action) => action.label)).toContain('Add Check here');
    });

    it('and no other sentence: every other request comes to what it came to', () => {
      const requests: EditRequest[] = [
        { kind: 'connect', from: '1.4', to: '1.1' }, { kind: 'connect', from: '1.3.1', to: '1.3' }, { kind: 'connect', from: '1.3', to: '1.1' }, { kind: 'action', action: 'abm.move-earlier', id: '1.1' },
        { kind: 'setField', id: '1.2', field: 'abm.kind', value: 'Check' }, { kind: 'action', action: 'abm.add.check', id: '1.4' }, { kind: 'move', id: '1.1', x: 114, y: 160 },
        { kind: 'action', action: 'abm.remove', id: '1.3' }, { kind: 'rename', id: '1.2', text: 'Search widely' }, { kind: 'drop', entry: 'abm.add.check', x: 546, y: 260 }, { kind: 'action', action: 'abm.arrange' },
      ];
      expect(outcomes(changed, documents[0], requests)).toEqual(outcomes(original, documents[0], requests));
      expect(outcomes(original, documents[0], requests).filter((outcome) => outcome.kind === 'refused')).toHaveLength(7);
      expect(at(outcomes(original, documents[0], requests)[6], 'sentence')).toBe('That is already there.');
    });
  });
});
