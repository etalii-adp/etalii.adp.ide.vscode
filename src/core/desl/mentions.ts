// Mentions (DESL 4.3): a `string` or `text` attribute whose value names elements of the same
// document by id, where a match of the attribute's `pattern` has its group `id`. A mention is text,
// and nothing here changes it: it is found, resolved to the element it names, drawn as such, and
// reported by `std.mentions` when it names nothing of the types it may name (DESL 6.5).

import { BoundedRegex, RegexBudgetError } from '../fbl/expressions/regexMatcher';
import { checkRegex, parseRegex, type RegexNode } from '../fbl/expressions/regexSubset';
import { isA, type Metamodel } from '../disl/metamodel';
import { finding, type Finding, type Loaded, type Model, type ModelElement } from '../disl/model';
import { isObject } from '../disl/specification';

/** The `mentions` facet of one attribute of one type, compiled. */
export interface MentionFacet {
  readonly type: string;
  readonly attribute: string;
  readonly pattern: string;
  /** The element types a mention may name. */
  readonly types: readonly string[];
  readonly regex: BoundedRegex;
}

/** Every `mentions` facet of a metamodel. */
export interface Mentions {
  readonly facets: readonly MentionFacet[];
  /** The facet of an attribute of a type, when it has one. */
  of(type: string, attribute: string): MentionFacet | undefined;
}

/** One mention in a text: the whole match, and the id its group `id` took, in UTF-16 code units of the text. */
export interface Mention {
  readonly id: string;
  readonly start: number;
  readonly end: number;
}

/** A part of a text as a surface draws it: plain text, or a mention with what it names. */
export type TextPart =
  | { readonly text: string }
  | { readonly text: string; readonly mention: { readonly id: string; readonly title?: string; readonly type?: string; readonly broken: boolean } };

/** The name of the group a mention's id is in (DESL 4.3). */
const group = 'id';
/** The id of the finding of a mention that names nothing (DESL 6.5). */
export const mentionsCode = 'std.mentions';

/**
 * The `mentions` facets of every attribute of every element type, each pattern compiled in FBL's
 * common subset (FBL 2.5). A facet whose pattern does not compile or has no group `id`, that names
 * a type the metamodel does not have, or that is on an attribute that is no string, is left out
 * and reported (DESL 10.1, step 4).
 */
export function interpretMentions(metamodel: Metamodel): Loaded<Mentions> {
  const findings: Finding[] = [];
  const problem = (message: string): void => void findings.push(finding('desl.metamodel', 'error', message));
  const facets: MentionFacet[] = [];
  for (const [type, declared] of Object.entries(metamodel.types)) {
    for (const [attribute, definition] of Object.entries(declared.attributes)) {
      const facet = definition.mentions as unknown;
      if (facet === undefined) continue;
      const where = `\`${type}.${attribute}\``;
      if (!isObject(facet) || typeof facet.pattern !== 'string') {
        problem(`The mentions of ${where} give no pattern.`);
        continue;
      }
      if (definition.type !== 'string' && definition.type !== 'text') {
        problem(`${where} has mentions, and is no \`string\` or \`text\`.`);
        continue;
      }
      const types = Array.isArray(facet.types) ? facet.types.filter((name): name is string => typeof name === 'string') : [];
      const unknown = types.filter((name) => !Object.hasOwn(metamodel.types, name));
      if (types.length === 0) problem(`The mentions of ${where} name no type they may name.`);
      for (const name of unknown) problem(`The mentions of ${where} name \`${name}\`, which is not a type of this tool.`);
      const invalid = checkRegex(facet.pattern);
      if (invalid !== undefined) problem(`The pattern of the mentions of ${where} cannot be used: ${invalid}`);
      if (types.length === 0 || unknown.length > 0 || invalid !== undefined) continue;
      const regex = new BoundedRegex(facet.pattern);
      if (!regex.groupNames.includes(group)) {
        problem(`The pattern of the mentions of ${where} has no group \`${group}\`.`);
        continue;
      }
      facets.push({ type, attribute, pattern: facet.pattern, types, regex });
    }
  }
  return { value: { facets, of: (type, attribute) => facets.find((facet) => facet.type === type && facet.attribute === attribute) }, findings };
}

/**
 * The mentions of a text, from left to right, each match starting where the one before ended (an
 * empty match one further). A match in which the group `id` takes no part is no mention (DESL 4.3).
 * A text whose matching takes longer than its budget has no mentions.
 */
export function mentionsIn(text: string, facet: MentionFacet): Mention[] {
  const found: Mention[] = [];
  let at = 0;
  try {
    while (at <= text.length) {
      const match = facet.regex.match(text, at);
      if (!match) break;
      const id = match.value(group);
      if (id !== undefined) found.push({ id, start: match.start, end: match.end });
      at = match.end > match.start ? match.end : match.end + 1;
    }
  } catch (error) {
    if (!(error instanceof RegexBudgetError)) throw error;
  }
  return found;
}

/** The texts of an element's attribute: its value, or each value of several. */
const textsOf = (element: ModelElement, attribute: string): string[] => {
  const value = element.attributes[attribute];
  return typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
};

/** The element a mention names: the first that holds its id (DESL 5.3.4), when it is of one of the types the facet allows. */
export function mentioned(model: Model, facet: MentionFacet, metamodel: Metamodel, id: string): ModelElement | undefined {
  const element = model.elements.find((candidate) => candidate.id === id);
  return element && facet.types.some((type) => isA(metamodel, element.type, type)) ? element : undefined;
}

/**
 * One `std.mentions` warning for each mention that names no element of the types its facet lists
 * (DESL 6.5), in document order. It is located at the line of the element that holds the text:
 * where the mention stands within a value of several lines is the binding's, which this module
 * does not know.
 */
export function checkMentions(model: Model, mentions: Mentions, metamodel: Metamodel, file = ''): Finding[] {
  const findings: Finding[] = [];
  const named = (facet: MentionFacet): string => facet.types.map((type) => (metamodel.types[type]?.label ?? type).toLowerCase()).join(' or ');
  for (const element of model.elements) {
    for (const facet of mentions.facets) {
      if (facet.type !== element.type) continue;
      for (const text of textsOf(element, facet.attribute)) {
        for (const mention of mentionsIn(text, facet)) {
          if (mentioned(model, facet, metamodel, mention.id)) continue;
          findings.push({
            code: mentionsCode, severity: 'warning', message: `${mention.id} names no ${named(facet)} of this document.`,
            location: { file, line: element.line, column: 1, length: 0 }, element: element.id, detail: { id: mention.id, attribute: facet.attribute },
          });
        }
      }
    }
  }
  return findings;
}

/**
 * A text as the parts a surface draws: the plain text between mentions, and each mention with the
 * element it names, its title by `titleOf`, or marked broken when it names nothing it may name.
 */
export function segmentsOf(text: string, facet: MentionFacet, model: Model, metamodel: Metamodel, titleOf: (element: ModelElement) => string | undefined): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const mention of mentionsIn(text, facet)) {
    if (mention.start > at) parts.push({ text: text.slice(at, mention.start) });
    const element = mentioned(model, facet, metamodel, mention.id);
    const title = element ? titleOf(element) : undefined;
    parts.push({
      text: text.slice(mention.start, mention.end),
      mention: { id: mention.id, broken: element === undefined, ...(element ? { type: element.type } : {}), ...(title === undefined ? {} : { title }) },
    });
    at = mention.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

/**
 * What a mention is written as, around the id: the literal text that stands directly before and
 * after the group `id` in the alternative that holds it. `\[(?<id>…)\]` gives `[` and `]`, and
 * `^(?<id>\S+)$` gives nothing on either side. Nothing when the pattern has no group `id`.
 */
export function mentionTemplate(pattern: string): { readonly before: string; readonly after: string } | undefined {
  let tree: RegexNode;
  try { tree = parseRegex(pattern); } catch { return undefined; }
  // A group or a quantifier holds one node, a sequence or an alternation several.
  const holds = (node: RegexNode): boolean => {
    if (node.kind === 'group' && node.name === group) return true;
    if ('node' in node) return holds(node.node);
    return 'nodes' in node && node.nodes.some(holds);
  };
  const literal = (nodes: readonly RegexNode[]): string => {
    let text = '';
    for (const node of nodes) {
      if (node.kind === 'char') text += String.fromCharCode(node.code);
      else if (node.kind === 'start' || node.kind === 'end') continue;
      else break;
    }
    return text;
  };
  const find = (node: RegexNode): { before: string; after: string } | undefined => {
    switch (node.kind) {
      case 'group': return node.name === group ? { before: '', after: '' } : find(node.node);
      case 'alternation': {
        const alternative = node.nodes.find(holds);
        return alternative && find(alternative);
      }
      case 'concat': {
        const index = node.nodes.findIndex(holds);
        if (index < 0) return undefined;
        const inner = find(node.nodes[index]);
        if (!inner) return undefined;
        // The literal text next to the group, read outwards from it.
        const before = literal([...node.nodes.slice(0, index)].reverse()).split('').reverse().join('');
        return { before: before + inner.before, after: inner.after + literal(node.nodes.slice(index + 1)) };
      }
      default: return 'node' in node ? find(node.node) : undefined;
    }
  };
  return find(tree);
}
