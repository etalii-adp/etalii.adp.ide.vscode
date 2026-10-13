// What the tests of the behavior model's persistence plugin share: the binding of
// `definitions/agent-behavior-modelling/`, a body opened through the FBL library as a host opens
// it, and an edit given as the lines it took out and put in. The checks FBL 11.4 asks of every plan
// are those of `change` in ../support.
import { loadDocument, PluginBody } from '../../../../src/core/fbl';
import type { FblBinding, FblElement, FblSplice, ModelChange, PluginReadResult } from '../../../../src/core/fbl';
import { abmMarkdown } from '../../../../src/core/plugins/abm-markdown';
import { change, fileBytes, textOf, utf8 } from '../support';

const bytesOf = (body: string | Uint8Array): Uint8Array => (typeof body === 'string' ? utf8(body) : body);

let loaded: FblBinding | undefined;

/** The binding the definition names, `agent-behavior-modelling.fbl#abm`, loaded as the tool type loads it. */
export function binding(): FblBinding {
  if (!loaded) {
    const { document, problems } = loadDocument(fileBytes('definitions/agent-behavior-modelling/agent-behavior-modelling.fbl'));
    const found = document?.bindings.get('abm');
    if (!found) throw new Error(`agent-behavior-modelling.fbl does not load: ${problems.map((problem) => problem.message).join('; ')}`);
    loaded = found;
  }
  return loaded;
}

/** What the plugin reads of a body. */
export const read = (body: string | Uint8Array): PluginReadResult => abmMarkdown.read({ files: [{ relativePath: '', bytes: bytesOf(body) }] });

/** A body opened as a host opens it: through the library, with the plugin as the binding's reader. */
export const open = (body: string | Uint8Array): PluginBody => PluginBody.open(bytesOf(body), binding(), abmMarkdown, 'agent.md');

/** The nodes a body or a reading holds, in the order of the file. */
export const nodes = (from: PluginBody | PluginReadResult): readonly FblElement[] => ('model' in from ? from.model.elements : from.elements);

/** The labels of the nodes under a node, in order. */
export const labels = (from: PluginBody | PluginReadResult, parent: string): unknown[] =>
  nodes(from).filter((element) => element.parentId === parent).map((element) => element.attributes.label);

/** The UTF-8 byte offset a line starts at, the line counted from zero. */
export function lineStart(text: string, line: number): number {
  const parts = text.split('\n');
  return utf8(parts.slice(0, line).map((part) => `${part}\n`).join('')).length;
}

/** A text as the lines it holds, without the one line ending it starts or ends with. */
const linesOf = (text: string): string[] => (text.length === 0 ? [] : (/^\r?\n/.test(text) ? text.replace(/^\r?\n/, '') : text.replace(/\r?\n$/, '')).split(/\r?\n/));

export interface Edited {
  readonly splices: readonly FblSplice[];
  /** The lines the splices took out, in order. */
  readonly removed: string[];
  /** The lines the splices put in, in order. */
  readonly added: string[];
  /** The body's text after the change. */
  readonly text: string;
}

/** Makes one change through the body, held to FBL 11.4, and gives the lines its splices took out and put in. */
export function edit(body: PluginBody, made: ModelChange): Edited {
  const before = body.bytes;
  const splices = change(body, made);
  return {
    splices,
    removed: splices.flatMap((splice) => linesOf(textOf(before.subarray(splice.start, splice.end)))),
    added: splices.flatMap((splice) => linesOf(splice.text)),
    text: textOf(body.bytes),
  };
}

/** The text a change gives a document, opened afresh. */
export const after = (text: string, made: ModelChange): string => edit(open(text), made).text;
