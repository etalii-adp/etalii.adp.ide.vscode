import { byteLength } from '../fbl/text/utf8';
import type { Action, DiagramType, EditOutcome, EditRequest, Field, Finding, TextSplice, ToolboxEntry, ViewModel, ViewOptions } from './toolType';

// simplified: the two hand-coded diagram types keep the contract of spec 006 and are wrapped here as
// tool types; the last pull request of spec 027 (User Story 4) removes them and this file with them.

/** A document as a hand-coded diagram type reads it. */
export interface HandCodedSource {
  readonly text: string;
  readonly registration?: string;
}

/** The gestures of spec 006, which are all a hand-coded diagram type answers. */
export type HandCodedRequest = Exclude<EditRequest, { readonly kind: 'reparent' | 'fold' | 'pin' | 'openLink' }>;

/** What an edit request came to in spec 006: an applied outcome carries the document's whole new text. */
export type HandCodedOutcome =
  | { readonly kind: 'applied'; readonly text: string; readonly registration?: string | null; readonly select?: string; readonly editLabel?: boolean; readonly multiline?: boolean }
  | Exclude<EditOutcome, { readonly kind: 'applied' | 'open' }>;

/** One diagram type in the shape of spec 006. */
export interface HandCodedDiagramType {
  readonly origin: string;
  readonly displayName: string;
  /** File extensions without the dot. */
  readonly extensions: readonly string[];
  /** True when the extension belongs to other tools too, so a file is this type only by choice. */
  readonly shared: boolean;
  suggests(text: string): boolean;
  findings(source: HandCodedSource): Finding[];
  view(source: HandCodedSource, options: ViewOptions): ViewModel;
  toolbox(source: HandCodedSource): ToolboxEntry[];
  fields(source: HandCodedSource, selection: readonly string[]): Field[];
  actions(source: HandCodedSource, selection: readonly string[]): Action[];
  edit(source: HandCodedSource, request: HandCodedRequest, options: ViewOptions, confirmed: boolean): HandCodedOutcome;
  newDocument(name: string): string;
}

const isHighSurrogate = (unit: number): boolean => unit >= 0xd800 && unit <= 0xdbff;
const isLowSurrogate = (unit: number): boolean => unit >= 0xdc00 && unit <= 0xdfff;

/** The one range in which two texts differ, as a splice of the first; nothing when they are equal. */
function spliceBetween(from: string, to: string): TextSplice[] {
  if (from === to) return [];
  const shortest = Math.min(from.length, to.length);
  let prefix = 0;
  while (prefix < shortest && from.charCodeAt(prefix) === to.charCodeAt(prefix)) prefix++;
  // Never between the two halves of a surrogate pair, so the splice is whole characters.
  if (prefix > 0 && isHighSurrogate(from.charCodeAt(prefix - 1))) prefix--;
  let suffix = 0;
  while (suffix < shortest - prefix && from.charCodeAt(from.length - 1 - suffix) === to.charCodeAt(to.length - 1 - suffix)) suffix++;
  if (suffix > 0 && isLowSurrogate(from.charCodeAt(from.length - suffix))) suffix--;
  return [{
    offset: byteLength(from.slice(0, prefix)),
    length: byteLength(from.slice(prefix, from.length - suffix)),
    text: to.slice(prefix, to.length - suffix),
  }];
}

/** A hand-coded diagram type as a tool type of the frame's contract. */
export function fromHandCoded(type: HandCodedDiagramType): DiagramType {
  return {
    origin: type.origin,
    kind: 'diagram',
    displayName: type.displayName,
    claims: [{ extensions: type.extensions, shared: type.shared, marker: false, registrationOnly: type.shared }],
    claimed: (fileName) => {
      const dot = fileName.lastIndexOf('.');
      return dot >= 0 && type.extensions.includes(fileName.slice(dot + 1).toLowerCase());
    },
    suggests: (_fileName, text) => type.suggests(text),
    findings: (source) => type.findings(source),
    view: (source, options) => type.view(source, options),
    toolbox: (source) => type.toolbox(source),
    fields: (source, selection) => type.fields(source, selection),
    actions: (source, selection) => type.actions(source, selection),
    edit: (source, request, options, confirmed) => {
      if (request.kind === 'reparent' || request.kind === 'fold' || request.kind === 'pin' || request.kind === 'openLink') {
        return { kind: 'refused', sentence: 'This diagram has nothing to do that with.' };
      }
      const outcome = type.edit(source, request, options, confirmed);
      if (outcome.kind !== 'applied') return outcome;
      const { text, ...rest } = outcome;
      return { ...rest, splices: spliceBetween(source.text, text) };
    },
    newDocument: (name) => type.newDocument(name),
  };
}
