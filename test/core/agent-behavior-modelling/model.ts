// What the tests of Agent Behavior Modelling share: the tool type read from its definition
// (etalii.adp spec 027, User Story 4), with the plugins the plug-in starts with: the Markdown
// reader and writer `abmMarkdown` and the action `abmArrange`.
import type { DiagramToolType, EditOutcome, EditRequest, Source } from '../../../src/core/frame/toolType';
import { plugins } from '../../../src/core/plugins/index';
import { layoutOf, type Corner } from '../../../src/core/tool/registrationLayout';
import { applied, behaviorModel, behaviorModelFolder, definitionOf, diagramOf, linesChanged, refusal, spliced, type Applied } from '../tool/support';

export const type: DiagramToolType = diagramOf(definitionOf(behaviorModelFolder), plugins);

/** The example most cases start from, with its registration, which lowers the row of 1.2. */
export const source = behaviorModel('research-assistant');
export const research = source.text;
/** The same Markdown, opened without a registration. */
export const bare: Source = { fileName: source.fileName, text: research };

/** A Markdown file as a source. */
export const markdown = (text: string, registration?: string): Source => ({ fileName: 'agent.md', text, ...(registration === undefined ? {} : { registration }) });

export const edit = (request: EditRequest, from: Source = source, confirmed = false): EditOutcome => type.edit(from, request, {}, confirmed);

/** The applied outcome of a request. */
export const done = (request: EditRequest, from: Source = source, confirmed = false): Applied => applied(edit(request, from, confirmed));

/** The source after a request that is applied: its Markdown spliced, and its registration where the edit changed it. */
export function after(request: EditRequest, from: Source = source, confirmed = false): Source {
  const outcome = done(request, from, confirmed);
  return { ...from, text: spliced(from.text, outcome.splices), ...(typeof outcome.registration === 'string' ? { registration: outcome.registration } : {}) };
}

/** The lines a request takes out and puts in: every other line is the same before and after. */
export const change = (request: EditRequest, from: Source = source, confirmed = false): { readonly removed: string[]; readonly added: string[] } =>
  linesChanged(from.text, after(request, from, confirmed).text);

/** The sentence a request is refused with. */
export const sentenceOf = (request: EditRequest, from: Source = source): string => refusal(edit(request, from));

/** Where a node is drawn. */
export const boxOf = (id: string, from: Source = source) => type.view(from, {}).nodes.find((node) => node.id === id)!.box;

/** The corners the registration of an applied outcome keeps, by id. */
export const layoutAfter = (outcome: Applied): Readonly<Record<string, Corner>> => layoutOf(outcome.registration as string);

/** The labels of the children of a node, in order. */
export const childLabels = (from: Source, parent: string): string[] =>
  type.view(from, {}).nodes.filter((node) => node.id.startsWith(`${parent}.`) && node.id.split('.').length === parent.split('.').length + 1).map((node) => node.labels[1].editText);

// What the definition's `tidyTree` and its notation state, which the cases below count with.
export const nodeWidth = 200;
export const nodeHeight = 60;
/** The space between two neighbouring subtrees. */
export const horizontalGap = 28;
/** The space between a parent's bottom and its children's top. */
export const verticalGap = 56;
/** The least space a dragged row keeps between its parent's bottom and its own top. */
export const minimumGap = 16;
