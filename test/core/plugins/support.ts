// What the tests of the mind map's two plugins share: the binding of `definitions/mindmap/`, a body
// opened through the FBL library as a host opens it, an edit carried out and held to what FBL asks
// of every plan, and standalone's recorded transcript with the documents it was made from.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { applyEdit, inverseOf, loadDocument, PluginBody } from '../../../src/core/fbl';
import type { FblBinding, FblElement, FblSplice, ModelChange, PluginReadResult } from '../../../src/core/fbl';
import { freeplaneMm } from '../../../src/core/plugins/freeplane-mm';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export const utf8 = (text: string): Uint8Array => encoder.encode(text);
export const textOf = (bytes: Uint8Array): string => decoder.decode(bytes);
const bytesOf = (body: string | Uint8Array): Uint8Array => (typeof body === 'string' ? utf8(body) : body);

/** The bytes of a file of the repository, exactly as they are on disk. */
export const fileBytes = (path: string): Uint8Array => new Uint8Array(readFileSync(path));

/** The genuine Freeplane save standalone's tests read: CRLF lines with LF inside its `richcontent`, and a CRLF after `</map>`. */
export const architecture = (): Uint8Array => fileBytes('fixtures/tools/mindmap/architecture.mm');

let loaded: FblBinding | undefined;

/** The binding the definition names, `mindmap.fbl#mindmap`, loaded as the tool type loads it. */
export function binding(): FblBinding {
  if (!loaded) {
    const { document, problems } = loadDocument(fileBytes('definitions/mindmap/mindmap.fbl'));
    const found = document?.bindings.get('mindmap');
    if (!found) throw new Error(`mindmap.fbl does not load: ${problems.map((problem) => problem.message).join('; ')}`);
    loaded = found;
  }
  return loaded;
}

/** What the plugin reads of a body. */
export const read = (body: string | Uint8Array): PluginReadResult => freeplaneMm.read({ files: [{ relativePath: '', bytes: bytesOf(body) }] });

/** A body opened as a host opens it: through the library, with the plugin as the binding's reader. */
export const open = (body: string | Uint8Array): PluginBody => PluginBody.open(bytesOf(body), binding(), freeplaneMm, 'map.mm');

export const bodyText = (body: PluginBody): string => textOf(body.bytes);

/** The node with an id, which the test expects to be there. */
export function node(from: PluginBody | PluginReadResult, id: string): FblElement {
  const elements = 'model' in from ? from.model.elements : from.elements;
  const found = elements.find((element) => element.id === id);
  if (!found) throw new Error(`No node '${id}' was read.`);
  return found;
}

/** The nodes under a node, in the order of the file. */
export const childrenOf = (from: PluginBody | PluginReadResult, id: string): FblElement[] =>
  ('model' in from ? from.model.elements : from.elements).filter((element) => element.parentId === id);

/** The bytes a node's own span covers, as text. */
export const written = (body: PluginBody, id: string): string => {
  const span = node(body, id).ownSpan;
  return textOf(body.bytes.subarray(span.start, span.end));
};

/** The UTF-8 byte offset of the first place `needle` is written in `text`, or of its end. */
export function offsetOf(text: string, needle: string, end = false): number {
  const index = text.indexOf(needle);
  if (index < 0) throw new Error(`'${needle}' is not in the text.`);
  return utf8(text.slice(0, index + (end ? needle.length : 0))).length;
}

const latin = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

/**
 * Plans one change through the library, applies it, and gives its splices. Every planned edit is
 * held to what FBL 11.4 asks: the bytes outside its splices are the bytes before, no splice writes
 * what was already there, its inverse restores the body exactly, and the body still reads.
 */
export function change(body: PluginBody, made: ModelChange): readonly FblSplice[] {
  const before = body.bytes;
  const result = body.change(made);
  if (!('planned' in result)) throw new Error(`The change was refused: ${result.refused}`);
  const { splices } = result.planned;
  const after = body.bytes;

  let kept = 0;
  let shift = 0;
  for (const splice of splices) {
    expect(splice.start, 'the splices are in body order and do not overlap').toBeGreaterThanOrEqual(kept);
    expect(latin(after.subarray(kept + shift, splice.start + shift)), 'the bytes before a splice are kept').toBe(latin(before.subarray(kept, splice.start)));
    expect(splice.text, 'a splice writes something else than it replaces').not.toBe(textOf(before.subarray(splice.start, splice.end)));
    shift += utf8(splice.text).length - (splice.end - splice.start);
    kept = splice.end;
  }
  expect(latin(after.subarray(kept + shift)), 'the bytes after the last splice are kept').toBe(latin(before.subarray(kept)));
  expect(latin(applyEdit(after, inverseOf(before, result.planned))), 'the inverse restores the bytes').toBe(latin(before));
  expect(body.model.unreadable, 'the body reads after the edit').toBe(false);
  return splices;
}

/** Plans a change the plugin has to refuse, and gives the sentence. Nothing is written and nothing is recorded. */
export function refusal(body: PluginBody, made: ModelChange): string {
  const before = body.bytes;
  const undoable = body.canUndo;
  const result = body.change(made);
  if (!('refused' in result)) throw new Error('The change was planned, and was expected to be refused.');
  expect(latin(body.bytes)).toBe(latin(before));
  expect(body.canUndo).toBe(undoable);
  return result.refused;
}

/** Undoes every edit of a body. */
export function undoAll(body: PluginBody): void {
  while (body.canUndo) expect(body.undo()).toHaveProperty('done');
}

// ---- standalone's transcript (fixtures/tools/mindmap/mindmap.transcript.json) ----

export interface TranscriptEdit {
  readonly do: string;
  readonly answer: string;
  readonly unchanged?: boolean;
  readonly hunks?: readonly string[];
  readonly sha256?: string;
}

export interface TranscriptDocument {
  readonly document: string;
  readonly sha256: string;
  readonly sameAs?: string;
  readonly payloads?: readonly string[];
  readonly edits?: readonly TranscriptEdit[];
  readonly undoAll?: string;
}

export const transcript = (): { readonly documents: readonly TranscriptDocument[] } =>
  JSON.parse(readFileSync('fixtures/tools/mindmap/mindmap.transcript.json', 'utf8')) as { documents: TranscriptDocument[] };

export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * The inline documents of the transcript, which records their names and hashes and not their text:
 * copied from standalone's `Parity/MindmapCorpus.cs` at `5756a07`.
 */
export const inline: Readonly<Record<string, string>> = {
  'inline/unclosed.mm': '<map version="freeplane 1.12.15"><node TEXT="unclosed"</map>',
  'inline/not-a-map.mm': 'just some text',
  'inline/two-roots.mm': '<map version="freeplane 1.12.15">\n<node TEXT="one" ID="ID_1"/>\n<node TEXT="two" ID="ID_2"/>\n</map>\n',
  'inline/unnamed-root.mm': '<map version="freeplane 1.12.15"><node TEXT="" ID="ID_1"><node TEXT="a child" ID="ID_2"/></node></map>',
  'inline/blank-root.mm': '<map version="freeplane 1.12.15">\n<node TEXT="   ">\n<node TEXT="a child" ID="ID_2"/>\n</node>\n</map>\n',
  'inline/empty-ordinary-node.mm': '<map version="freeplane 1.12.15"><node TEXT="root" ID="ID_1"><node TEXT="" ID="ID_2"/></node></map>',
  'inline/duplicate-id.mm': '<map version="freeplane 1.12.15"><node TEXT="root" ID="ID_1"><node TEXT="first" ID="ID_2"/><node TEXT="second" ID="ID_2"/></node></map>',
  'inline/without-ids.mm':
    '<map version="freeplane 1.12.15">\n<node TEXT="centre">\n<node TEXT="left" POSITION="left">\n<node TEXT="deep"/>\n</node>\n<node TEXT="right" POSITION="bottom_or_right" FOLDED="true">\n<node TEXT="hidden"/>\n</node>\n</node>\n</map>\n',
  'inline/rich-and-links.mm':
    '<map version="freeplane 1.12.15">\r\n<node TEXT="root" ID="ID_R" LINK="">\r\n'
    + '<node ID="ID_F"><richcontent TYPE="NODE">\n<html>\n<head/>\n<body>\n<p>Formatted</p>\n<p>  text   here </p>\n</body>\n</html>\n</richcontent>\r\n'
    + '<richcontent TYPE="NOTE">\n<html>\n<head/>\n<body>\n<p>A note</p>\n</body>\n</html>\n</richcontent>\r\n</node>\r\n'
    + '<node TEXT="empty note" ID="ID_E"><richcontent TYPE="NOTE"><html><head/><body/></html></richcontent></node>\r\n'
    + '<node TEXT="web" ID="ID_W" LINK="https://example.org/a?b=1&amp;c=2" FOLDED="false"/>\r\n'
    + '</node>\r\n</map>\r\n',
};

/** Where the documents the transcript names by a path of standalone are copied to. */
const copied: Readonly<Record<string, string>> = {
  'diagrams/mindmap/backend/EtAlii.Adp.Diagram.Mindmap.Tests/Fixtures/architecture.mm': 'fixtures/tools/mindmap/architecture.mm',
  'diagrams/mindmap/examples/example 1/design.mm': 'examples/mindmap/example 1/design.mm',
  'diagrams/mindmap/examples/example 1/mindmap.mm': 'examples/mindmap/example 1/mindmap.mm',
};

/** A document of the transcript with the bytes it was recorded from, which the recorded hash holds it to. */
export function recorded(name: string): { readonly document: TranscriptDocument; readonly bytes: Uint8Array } {
  const document = transcript().documents.find((candidate) => candidate.document === name);
  if (!document) throw new Error(`The transcript has no document '${name}'.`);
  const bytes = name in copied ? fileBytes(copied[name]) : utf8(inline[name]);
  expect(sha256(bytes), `${name} is the document the transcript was recorded from`).toBe(document.sha256);
  return { document, bytes };
}

/** A text's lines, each with its own ending, as the transcript counts them. */
const linesOf = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/**
 * The text after a step of the transcript: each hunk `@line -removed +"inserted"` replaces
 * `removed` lines from `line`, counted from one in the text before the step. The step's hash holds
 * the result.
 */
export function afterStep(text: string, step: TranscriptEdit): string {
  if (step.unchanged) return text;
  const before = linesOf(text);
  const after: string[] = [];
  let taken = 0;
  for (const hunk of step.hunks ?? []) {
    const parts = /^@(\d+) -(\d+) \+(.*)$/s.exec(hunk);
    if (!parts) throw new Error(`Not a hunk: ${hunk}`);
    const line = Number(parts[1]) - 1;
    after.push(...before.slice(taken, line), JSON.parse(parts[3]) as string);
    taken = line + Number(parts[2]);
  }
  const result = [...after, ...before.slice(taken)].join('');
  expect(sha256(utf8(result)), `the hunks of '${step.do}' give the recorded text`).toBe(step.sha256);
  return result;
}
