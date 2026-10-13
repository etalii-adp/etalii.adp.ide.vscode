// What the tests of the Gartner hype cycle graph share: the tool type read from its definition
// (etalii.adp spec 027, User Story 4), with the plugins the plug-in starts with, and a request made
// of a document as the lines it rewrites.
import type { DiagramToolType, EditOutcome, EditRequest, Source, ViewOptions } from '../../../src/core/frame/toolType';
import { plugins } from '../../../src/core/plugins/index';
import type { SceneNode } from '../../../src/core/scene/scene';
import { applied, definitionOf, diagramOf, fixture, hypeCycleFolder, linesChanged, refusal, sourceOf, spliced } from '../tool/support';

export const type: DiagramToolType = diagramOf(definitionOf(hypeCycleFolder), plugins);

/** The fixture most cases start from: two trends, a trigger, two notes and two influences, counted in years. */
export const base = fixture('triggers-and-notes');

export const edit = (source: Source, request: EditRequest, options: ViewOptions = {}, confirmed = false): EditOutcome => type.edit(source, request, options, confirmed);

/** The source after a request that is applied. */
export const after = (source: Source, request: EditRequest, options: ViewOptions = {}, confirmed = false): Source =>
  ({ ...source, text: spliced(source.text, applied(edit(source, request, options, confirmed)).splices) });

/** The lines a request takes out and puts in: every other line is the same before and after. */
export const change = (source: Source, request: EditRequest, options: ViewOptions = {}): { readonly removed: string[]; readonly added: string[] } =>
  linesChanged(source.text, after(source, request, options).text);

/** The sentence a request is refused with. */
export const sentenceOf = (source: Source, request: EditRequest, options: ViewOptions = {}): string => refusal(edit(source, request, options));

export const nodeOf = (source: Source, id: string, options: ViewOptions = {}): SceneNode => type.view(source, options).nodes.find((node) => node.id === id)!;

/** A graph of the lines given, under the header every graph starts with. */
export const graph = (...lines: string[]): Source => sourceOf(['gartner-hypecycle-graph: 1', ...lines, ''].join('\n'));

/** A graph of one trend `a` on row 0, with the lines that follow its phase count, in a unit when one is given. */
export const oneTrend = (start: string, stop: string, phases: number, more: readonly string[] = [], unit?: string): Source =>
  graph(...(unit === undefined ? [] : [`unit: ${unit}`]), 'trends:', '  - id: a', '    name: A', `    start: ${start}`, `    stop: ${stop}`, '    row: 0', `    phases: ${phases}`, ...more, 'influences: []');

/** The value a written line gives a key, among the lines an edit put in. */
export const written = (lines: readonly string[], key: string): string | undefined =>
  lines.map((line) => line.trim()).find((line) => line.startsWith(`${key}: `))?.slice(key.length + 2);
