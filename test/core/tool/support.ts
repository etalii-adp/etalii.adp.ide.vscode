// What the tests of a tool type made from its definition share: a folder of `definitions/` read
// from disk into the map the core takes, the tool type of the hype cycle graph's definition, an
// example opened as a source, and an applied outcome carried out on the text.
import { readFileSync, readdirSync } from 'node:fs';
import type { FblBinding } from '../../../src/core/fbl/documents/types';
import { applySplices } from '../../../src/core/fbl/splice';
import { decode, encode } from '../../../src/core/fbl/text/utf8';
import type { DesignerToolType, DiagramToolType, EditOutcome, Source, TextSplice, ViewOptions } from '../../../src/core/frame/toolType';
import type { Scene, SceneEnd } from '../../../src/core/scene/scene';
import { readDefinitionFolder, type Definition } from '../../../src/core/tool/definitionFolder';
import { pluginRegistry, type PluginRegistry, type Plugins } from '../../../src/core/tool/pluginRegistry';
import { toolTypeFrom } from '../../../src/core/tool/toolTypeFrom';

export type Json = Readonly<Record<string, unknown>>;
export const object = (value: unknown): Json => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {});
export const array = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
/** The value at a path of a parsed document. */
export const at = (value: unknown, ...path: string[]): unknown => path.reduce<unknown>((node, step) => object(node)[step], value);

// ---- folders of definitions/ ----

export const hypeCycleFolder = 'gartner-hype-cycle-graph';
export const behaviorModelFolder = 'agent-behavior-modelling';

/** The files of one folder of `definitions/`, as their bytes by name: what `readDefinitionFolder` takes. */
export const folderFiles = (folder: string): Map<string, Uint8Array> =>
  new Map(readdirSync(`definitions/${folder}`).map((file) => [file, new Uint8Array(readFileSync(`definitions/${folder}/${file}`))]));

/** Every folder of `definitions/`, as the extension reads them when it starts. */
export const allFolders = (): Map<string, Map<string, Uint8Array>> =>
  new Map(readdirSync('definitions', { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => [entry.name, folderFiles(entry.name)]));

/** A folder with one file left out, or put in its place. */
export const withFile = (files: ReadonlyMap<string, Uint8Array>, name: string, bytes?: Uint8Array): Map<string, Uint8Array> => {
  const changed = new Map(files);
  if (bytes) changed.set(name, bytes);
  else changed.delete(name);
  return changed;
};

/** The text of a file of a folder, exactly as it is on disk. */
export const fileText = (folder: string, extension: string): string => readFileSync(`definitions/${folder}/${folder}.${extension}`, 'utf8');

/** The specification of a folder as parsed JSON: its `.dis` file, or its `.des` file. */
export const specificationOf = (folder: string): Json =>
  JSON.parse(fileText(folder, readdirSync(`definitions/${folder}`).some((file) => file.endsWith('.des')) ? 'des' : 'dis')) as Json;

/** The FBL document of a folder as parsed JSON. */
export const bindingsOf = (folder: string): Json => JSON.parse(fileText(folder, 'fbl')) as Json;

export const noPlugins: Plugins = { persistence: [], layout: [], action: [] };

export interface ReadFolder {
  readonly definition: Definition;
  readonly bindings: readonly FblBinding[];
}

/** A folder read as a definition with its bindings; a folder that is no tool type fails the test with its reason. */
export function definitionOf(folder: string): ReadFolder {
  const read = readDefinitionFolder(folder, folderFiles(folder));
  if ('reason' in read) throw new Error(`definitions/${folder} is no tool type: ${read.reason}`);
  return read;
}

/** The definition with its specification altered in memory: the copied file is never changed. */
export const altered = (definition: Definition, alter: (specification: Json) => Json): Definition => ({ ...definition, specification: alter(definition.specification) });

/** The diagram a definition gives. */
export const diagramOf = (read: ReadFolder, plugins: PluginRegistry = pluginRegistry(noPlugins)): DiagramToolType =>
  toolTypeFrom(read.definition, read.bindings, plugins) as DiagramToolType;

/** The designer a definition gives. */
export const designerOf = (read: ReadFolder, plugins: PluginRegistry = pluginRegistry(noPlugins)): DesignerToolType =>
  toolTypeFrom(read.definition, read.bindings, plugins) as unknown as DesignerToolType;

/**
 * The view options a diagram read from its definition takes beside the viewport: the viewpoint to
 * draw, by its name, and the value of each filter that is not at its default, by the filter's id.
 */
export interface DiagramOptions extends ViewOptions {
  readonly viewpoint?: string;
  readonly filters?: Readonly<Record<string, { readonly value?: unknown; readonly match?: 'any' | 'all' }>>;
}
export const viewing = (options: DiagramOptions): ViewOptions => options;

// ---- documents ----

const examples = 'examples/gartner-hypecycle-graph';

export const exampleNames = (): string[] => readdirSync(examples, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

/** An example as the frame hands it to a tool type: its text and its registration's, exactly as they are on disk. */
export const example = (name: string): Source => ({
  fileName: `${name}.ghg`,
  text: readFileSync(`${examples}/${name}/${name}.ghg`, 'utf8'),
  registration: readFileSync(`${examples}/${name}/${name}.adp`, 'utf8'),
});

/** A fixture of the hype cycle graph as a source. */
export const fixture = (name: string): Source => ({ fileName: `${name}.ghg`, text: readFileSync(`fixtures/gartner-hypecycle-graph/${name}.ghg`, 'utf8') });

export const sourceOf = (text: string, fileName = 'document.ghg'): Source => ({ fileName, text });

const behaviorModels = 'examples/agent-behavior-modelling';

export const behaviorModelNames = (): string[] => readdirSync(behaviorModels, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

/** An example of Agent Behavior Modelling as the frame hands it to a tool type: its Markdown and its registration, exactly as they are on disk. */
export const behaviorModel = (name: string): Source => ({
  fileName: `${name}.md`,
  text: readFileSync(`${behaviorModels}/${name}/${name}.md`, 'utf8'),
  registration: readFileSync(`${behaviorModels}/${name}/${name}.adp`, 'utf8'),
});

// ---- outcomes ----

export type Applied = Extract<EditOutcome, { kind: 'applied' }>;

/** The applied outcome an edit came to; any other outcome fails the test with what it was. */
export function applied(outcome: EditOutcome): Applied {
  if (outcome.kind !== 'applied') throw new Error(`not applied: ${JSON.stringify(outcome)}`);
  return outcome;
}

/** The sentence of a refusal; any other outcome fails the test with what it was. */
export function refusal(outcome: EditOutcome): string {
  if (outcome.kind !== 'refused') throw new Error(`not refused: ${JSON.stringify(outcome)}`);
  return outcome.sentence;
}

/**
 * The text after the splices of one outcome, as the extension applies them: each is a range of
 * the UTF-8 bytes of the text before, they come in the order of the body, and none overlaps another.
 * What lies outside them is copied from the text before, byte for byte, which is checked against
 * the library's own application of the same splices.
 */
export function spliced(text: string, splices: readonly TextSplice[]): string {
  const bytes = encode(text);
  const parts: Uint8Array[] = [];
  let position = 0;
  for (const splice of splices) {
    if (!Number.isInteger(splice.offset) || !Number.isInteger(splice.length) || splice.length < 0) throw new Error(`not a splice: ${JSON.stringify(splice)}`);
    if (splice.offset < position || splice.offset + splice.length > bytes.length) throw new Error(`a splice out of order or out of the text: ${JSON.stringify(splice)} after ${position} of ${bytes.length}`);
    parts.push(bytes.subarray(position, splice.offset), encode(splice.text));
    position = splice.offset + splice.length;
  }
  parts.push(bytes.subarray(position));
  const after = decode(Uint8Array.from(parts.flatMap((part) => [...part])));
  const byLibrary = decode(applySplices(bytes, splices.map((splice) => ({ operation: 'replace-value' as const, start: splice.offset, end: splice.offset + splice.length, text: splice.text }))));
  if (after !== byLibrary) throw new Error('The splices give another text than the library makes of them.');
  return after;
}

/** The lines an edit took out and put in: every line before and after them is the same in both texts. */
export function linesChanged(before: string, after: string): { readonly removed: string[]; readonly added: string[] } {
  const old = before.split(/\r?\n/);
  const now = after.split(/\r?\n/);
  let head = 0;
  while (head < old.length && head < now.length && old[head] === now[head]) head++;
  let tail = 0;
  while (tail < old.length - head && tail < now.length - head && old[old.length - 1 - tail] === now[now.length - 1 - tail]) tail++;
  return { removed: old.slice(head, old.length - tail), added: now.slice(head, now.length - tail) };
}

// ---- recorded places ----

interface PlaceBox { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface PlaceEnd { readonly node: string; readonly part?: string; readonly at?: number; readonly side?: string; readonly x?: number; readonly y?: number }
interface Places {
  readonly nodes: readonly { readonly id: string; readonly type: string; readonly label: string; readonly text: string; readonly box: PlaceBox; readonly parts?: readonly { readonly id: string; readonly box: PlaceBox }[] }[];
  readonly edges: readonly { readonly id: string; readonly type: string; readonly from: PlaceEnd; readonly to: PlaceEnd; readonly hidden?: boolean }[];
}

// Two numbers are the same place when they differ by less than 0.5, as test/core/scene/scene.examples.test.ts has it.
const differs = (here: number | undefined, there: number | undefined): boolean => (here === undefined || there === undefined ? here !== there : !(Math.abs(here - there) < 0.5));

/**
 * Where a scene differs from the places recorded for an example in `fixtures/disl/places/`: the
 * comparison of test/core/scene/scene.examples.test.ts, on the scene a tool type gives. The x and y
 * of an end that an anchor of its node places are left out: etalii.adp issue 97, which that test records.
 */
export function placeDifferences(name: string, scene: Scene): { readonly nodes: string[]; readonly parts: string[]; readonly edges: string[] } {
  const places = JSON.parse(readFileSync(`fixtures/disl/places/${name}.places.json`, 'utf8')) as Places;
  const nodes: string[] = [];
  const parts: string[] = [];
  const edges: string[] = [];
  const said = (list: string[], element: string, what: string, here: unknown, there: unknown): void =>
    void list.push(`${name}: ${element}: ${what} is ${JSON.stringify(here)} here and ${JSON.stringify(there)} in the record`);
  const box = (list: string[], element: string, here: PlaceBox | undefined, there: PlaceBox): void => {
    for (const key of ['x', 'y', 'width', 'height'] as const) if (differs(here?.[key], there[key])) said(list, element, key, here?.[key], there[key]);
  };

  const cut = new Set(places.nodes.flatMap((node) => (node.parts ?? []).map((part) => part.id)));
  const drawn = new Map(scene.nodes.map((node) => [node.id, node]));
  for (const place of places.nodes) {
    const node = drawn.get(place.id);
    const element = `node ${place.id}`;
    if (!node) { said(nodes, element, 'drawn', false, true); continue; }
    if (node.type.toLowerCase() !== place.type) said(nodes, element, 'type', node.type, place.type);
    if (node.labels[0]?.editText !== place.label) said(nodes, element, 'label', node.labels[0]?.editText, place.label);
    if (node.labels[0]?.text !== place.text) said(nodes, element, 'text', node.labels[0]?.text, place.text);
    box(nodes, element, node.box, place.box);
    for (const part of place.parts ?? []) box(parts, `${element} part ${part.id}`, node.parts.find((candidate) => candidate.id === part.id)?.box, part.box);
    const extra = node.parts.filter((part) => cut.has(part.id) && !(place.parts ?? []).some((other) => other.id === part.id)).map((part) => part.id);
    if (extra.length > 0) said(parts, element, 'parts the record does not have', extra, []);
  }
  for (const node of scene.nodes) if (!places.nodes.some((place) => place.id === node.id)) said(nodes, `node ${node.id}`, 'drawn', true, false);

  const end = (element: string, which: string, here: SceneEnd | undefined, there: PlaceEnd): void => {
    if (!here) { said(edges, element, `${which} end`, undefined, there); return; }
    if (here.node !== there.node) said(edges, element, `${which}.node`, here.node, there.node);
    const stored = here.fallback ? undefined : here.part;
    if (stored !== there.part) said(edges, element, `${which}.part`, stored, there.part);
    if (there.part !== undefined && differs(here.at === undefined ? undefined : here.at * 1000, there.at === undefined ? undefined : there.at * 1000)) said(edges, element, `${which}.at`, here.at, there.at);
    if (here.side !== there.side) said(edges, element, `${which}.side`, here.side, there.side);
    if (here.anchor === undefined) for (const key of ['x', 'y'] as const) if (differs(here[key], there[key])) said(edges, element, `${which}.${key}`, here[key], there[key]);
  };
  const lines = new Map(scene.edges.map((edge) => [edge.id, edge]));
  for (const place of places.edges) {
    const edge = lines.get(place.id);
    const element = `edge ${place.id}`;
    if (!edge) { said(edges, element, 'in the scene', false, true); continue; }
    if (edge.type.toLowerCase() !== place.type) said(edges, element, 'type', edge.type, place.type);
    if ((edge.hidden !== undefined) !== (place.hidden === true)) said(edges, element, 'hidden', edge.hidden ?? false, place.hidden === true);
    if (place.hidden === true) {
      if (edge.source !== place.from.node || edge.target !== place.to.node) said(edges, element, 'ends', [edge.source, edge.target], [place.from.node, place.to.node]);
      continue;
    }
    end(element, 'from', edge.from, place.from);
    end(element, 'to', edge.to, place.to);
  }
  for (const edge of scene.edges) if (!places.edges.some((place) => place.id === edge.id)) said(edges, `edge ${edge.id}`, 'in the scene', true, false);
  return { nodes, parts, edges };
}
