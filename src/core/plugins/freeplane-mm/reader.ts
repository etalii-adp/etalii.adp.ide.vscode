// The reader of the persistence plugin `net.etalii.adp.freeplane.mm` (etalii.adp spec 027, research
// R9; the mind map's companion document, section 3): a Freeplane `.mm` body read as standalone's
// `MindmapFreeplanePlugin` and `MindmapDocument` read it, one `Node` for each `<node>`. The XML is
// read over the bytes by the small reader below and not by the FBL library's xml family, which
// needs a binding's rules and keeps no comment in an element's content; the planner needs every
// child of an element, with its span, to know what standalone's commands would find beside a node.

import { findingCodes, type FblElement, type PluginReadRequest, type PluginReadResult, type Span } from '../../fbl';

export interface XmlAttribute {
  readonly name: string;
  /** From the name to the closing quote. */
  readonly start: number;
  readonly end: number;
  /** Between the quotes. */
  readonly value: Span;
  readonly quote: string;
  /** The value, references decoded. */
  readonly text: string;
}

/** Character data or a CDATA section, with its text decoded. */
export interface XmlText {
  readonly kind: 'text';
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** A comment or a processing instruction: kept, never read. */
export interface XmlOther {
  readonly kind: 'other';
  readonly start: number;
  readonly end: number;
}

export interface XmlElement {
  readonly kind: 'element';
  readonly name: string;
  /** The `<` of the start tag. */
  readonly start: number;
  /** After the `>` of the end tag, or of the tag itself when it is self-closed. */
  end: number;
  /** The end of the name in the start tag, where a first attribute goes. */
  readonly nameEnd: number;
  readonly attributes: XmlAttribute[];
  /** The `>` that ends the start tag, or the `/>` of a self-closed tag. */
  close: Span;
  selfClosed: boolean;
  endTag?: Span;
  readonly parent?: XmlElement;
  readonly children: XmlNode[];
}

export type XmlNode = XmlElement | XmlText | XmlOther;

/** A body that reads: its `<map>`, and every `<node>` under it in the order of the file, with the id of its element. */
export interface MapReading {
  readonly map: XmlElement;
  readonly nodes: readonly { readonly element: XmlElement; readonly id: string; readonly line: number }[];
}

/** Why a body is no map, and where. */
export interface Problem {
  readonly problem: string;
  readonly offset: number;
}

const NODE = 'node';
const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
const strict = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** What standalone's platform calls white space, which decides what a command takes with a node. */
const white = '\\t-\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const allWhite = new RegExp(`^[${white}]*$`);
const whiteRuns = new RegExp(`[${white}]+`);

export const isBlank = (text: string): boolean => allWhite.test(text);
export const isWhiteText = (node: XmlNode | undefined): node is XmlText => node?.kind === 'text' && isBlank(node.text);
export const elementsOf = (element: XmlElement, name?: string): XmlElement[] =>
  element.children.filter((child): child is XmlElement => child.kind === 'element' && (name === undefined || child.name === name));
export const attributeOf = (element: XmlElement, name: string): XmlAttribute | undefined => element.attributes.find((attribute) => attribute.name === name);

/** The `richcontent` of a node that holds its formatted text (`NODE`) or its notes (`NOTE`). */
export const richContent = (element: XmlElement, type: string): XmlElement | undefined =>
  elementsOf(element, 'richcontent').find((candidate) => attributeOf(candidate, 'TYPE')?.text.toUpperCase() === type);

class NotWellFormed extends Error {
  constructor(readonly offset: number, message: string) {
    super(message);
  }
}

const isSpace = (byte: number): boolean => byte === 0x20 || byte === 0x09 || byte === 0x0d || byte === 0x0a;
const isNameByte = (byte: number, first: boolean): boolean =>
  byte >= 0x80 || (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a) || byte === 0x5f || byte === 0x3a
  || (!first && ((byte >= 0x30 && byte <= 0x39) || byte === 0x2d || byte === 0x2e));

/** The document element of a body, every element with its children and their spans. Throws `NotWellFormed`. */
function parseXml(bytes: Uint8Array): XmlElement {
  const text = (start: number, end: number): string => decoder.decode(bytes.subarray(start, end));
  const startsWith = (at: number, literal: string): boolean => {
    for (let i = 0; i < literal.length; i++) if (bytes[at + i] !== literal.charCodeAt(i)) return false;
    return true;
  };
  const closed = (from: number, terminator: string, what: string): number => {
    for (let i = from; i + terminator.length <= bytes.length; i++) if (startsWith(i, terminator)) return i + terminator.length;
    throw new NotWellFormed(from, `The ${what} is not closed.`);
  };
  const skipSpace = (from: number): number => {
    let at = from;
    while (at < bytes.length && isSpace(bytes[at])) at++;
    return at;
  };
  const name = (from: number): number => {
    let at = from;
    while (at < bytes.length && isNameByte(bytes[at], at === from)) at++;
    if (at === from) throw new NotWellFormed(from, 'A name was expected here.');
    return at;
  };
  // The five entities XML defines and characters by number. A declared entity is not expanded.
  // simplified: a map that declares entities of its own in a document type is unreadable; expand them when a real file has one.
  const decoded = (raw: string, at: number): string => raw.replace(/&([^;&]*)(;?)/g, (_all, reference: string, ended: string) => {
    const known: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' };
    if (ended === '') throw new NotWellFormed(at, 'An \'&\' must start a reference ending in \';\'.');
    if (Object.hasOwn(known, reference)) return known[reference];
    const number = /^#(?:x([0-9a-fA-F]{1,6})|([0-9]{1,7}))$/.exec(reference);
    const code = number ? parseInt(number[1] ?? number[2], number[1] === undefined ? 10 : 16) : -1;
    if (!number) throw new NotWellFormed(at, `The entity '&${reference};' is not one XML defines.`);
    if (code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) throw new NotWellFormed(at, `'&${reference};' is not a character.`);
    return String.fromCodePoint(code);
  });

  let root: XmlElement | undefined;
  const stack: XmlElement[] = [];
  let at = startsWith(0, 'ï»¿') ? 3 : 0;
  while (at < bytes.length) {
    const top = stack[stack.length - 1];
    if (bytes[at] !== 0x3c) {
      let end = at;
      while (end < bytes.length && bytes[end] !== 0x3c) end++;
      // A lone carriage return reads as a line feed, as an XML parser reads it; CRLF is kept (FBL 4.5).
      const read = decoded(text(at, end).replace(/\r(?!\n)/g, '\n'), at);
      if (top) top.children.push({ kind: 'text', start: at, end, text: read });
      else if (!isBlank(read)) throw new NotWellFormed(at, 'Text must be inside the document element.');
      at = end;
    } else if (startsWith(at, '<?') || startsWith(at, '<!--')) {
      const end = startsWith(at, '<?') ? closed(at + 2, '?>', 'processing instruction') : closed(at + 4, '-->', 'comment');
      top?.children.push({ kind: 'other', start: at, end });
      at = end;
    } else if (startsWith(at, '<![CDATA[')) {
      if (!top) throw new NotWellFormed(at, 'A CDATA section must be inside the document element.');
      const end = closed(at + 9, ']]>', 'CDATA section');
      top.children.push({ kind: 'text', start: at, end, text: text(at + 9, end - 3) });
      at = end;
    } else if (startsWith(at, '<!')) {
      if (root) throw new NotWellFormed(at, 'A document type declaration must come before the document element.');
      let depth = 0;
      let quote = 0;
      let end = at + 2;
      for (; end < bytes.length; end++) {
        const byte = bytes[end];
        if (quote !== 0) quote = byte === quote ? 0 : quote;
        else if (byte === 0x22 || byte === 0x27) quote = byte;
        else if (byte === 0x5b) depth++;
        else if (byte === 0x5d) depth--;
        else if (byte === 0x3e && depth === 0) break;
      }
      if (end >= bytes.length) throw new NotWellFormed(at, 'The declaration is not closed.');
      at = end + 1;
    } else if (startsWith(at, '</')) {
      const nameEnd = name(at + 2);
      const close = skipSpace(nameEnd);
      if (bytes[close] !== 0x3e) throw new NotWellFormed(at, `The end tag of '${text(at + 2, nameEnd)}' is not closed.`);
      if (!top) throw new NotWellFormed(at, `The end tag '${text(at + 2, nameEnd)}' closes nothing.`);
      if (top.name !== text(at + 2, nameEnd)) throw new NotWellFormed(at, `The end tag '${text(at + 2, nameEnd)}' does not close '${top.name}'.`);
      top.endTag = { start: at, end: close + 1 };
      top.end = close + 1;
      stack.pop();
      at = close + 1;
    } else {
      if (!top && root) throw new NotWellFormed(at, 'The body has a second document element.');
      const nameEnd = name(at + 1);
      const element: XmlElement = { kind: 'element', name: text(at + 1, nameEnd), start: at, end: at, nameEnd, attributes: [], close: { start: at, end: at }, selfClosed: false, parent: top, children: [] };
      let position = nameEnd;
      for (;;) {
        const spaced = skipSpace(position);
        if (spaced >= bytes.length) throw new NotWellFormed(at, `The start tag of '${element.name}' is not closed.`);
        if (startsWith(spaced, '/>')) {
          element.selfClosed = true;
          element.close = { start: spaced, end: spaced + 2 };
          break;
        }
        if (bytes[spaced] === 0x3e) {
          element.close = { start: spaced, end: spaced + 1 };
          break;
        }
        if (spaced === position) throw new NotWellFormed(spaced, 'Attributes must be separated by whitespace.');
        const attributeEnd = name(spaced);
        const attribute = text(spaced, attributeEnd);
        const equals = skipSpace(attributeEnd);
        if (bytes[equals] !== 0x3d) throw new NotWellFormed(equals, `The attribute '${attribute}' has no value.`);
        const open = skipSpace(equals + 1);
        if (bytes[open] !== 0x22 && bytes[open] !== 0x27) throw new NotWellFormed(open, `The value of '${attribute}' must be quoted.`);
        let end = open + 1;
        while (end < bytes.length && bytes[end] !== bytes[open]) {
          if (bytes[end] === 0x3c) throw new NotWellFormed(end, 'An attribute value cannot contain \'<\'.');
          end++;
        }
        if (end >= bytes.length) throw new NotWellFormed(open, `The value of '${attribute}' is not closed.`);
        if (attributeOf(element, attribute)) throw new NotWellFormed(spaced, `The attribute '${attribute}' is written twice.`);
        // White space written in a value reads as a space, as an XML parser reads it.
        element.attributes.push({ name: attribute, start: spaced, end: end + 1, value: { start: open + 1, end }, quote: String.fromCharCode(bytes[open]), text: decoded(text(open + 1, end).replace(/\r\n|[\t\n\r]/g, ' '), open) });
        position = end + 1;
      }
      element.end = element.close.end;
      if (top) top.children.push(element);
      else root = element;
      if (!element.selfClosed) stack.push(element);
      at = element.close.end;
    }
  }
  if (stack.length > 0) throw new NotWellFormed(bytes.length, `The element '${stack[stack.length - 1].name}' is not closed.`);
  if (!root) throw new NotWellFormed(bytes.length, 'The body has no document element.');
  return root;
}

/** The bytes as a map, or why they are none: standalone's `MindmapDocument.Parse`, with its sentences. */
export function readMap(bytes: Uint8Array): MapReading | Problem {
  try {
    strict.decode(bytes);
  } catch {
    return { problem: 'The map is not valid UTF-8.', offset: 0 };
  }
  let map: XmlElement;
  try {
    map = parseXml(bytes);
  } catch (error) {
    if (!(error instanceof NotWellFormed)) throw error;
    return { problem: `The map is not well-formed XML: ${error.message}`, offset: error.offset };
  }
  if (map.name !== 'map') return { problem: 'The file does not start with a <map> element.', offset: map.start };
  const roots = elementsOf(map, NODE).length;
  if (roots !== 1) return { problem: `A map has exactly one root node; this one has ${roots}.`, offset: map.start };

  // An element's id is its ID for the first node the file gives it. A later holder, and a node
  // without one, has an id no ID can equal, since XML forbids the NUL in it.
  const nodes: { element: XmlElement; id: string; line: number }[] = [];
  const holders = new Map<string, number>();
  const lineAt = lines(bytes);
  const walk = (element: XmlElement): void => {
    for (const child of elementsOf(element)) {
      if (child.name === NODE) {
        const stored = attributeOf(child, 'ID')?.text ?? '';
        const seen = stored === '' ? 0 : (holders.get(stored) ?? 0) + 1;
        if (stored !== '') holders.set(stored, seen);
        nodes.push({ element: child, id: stored === '' ? `\u0000${nodes.length + 1}` : seen === 1 ? stored : `${stored}\u0000${seen}`, line: lineAt(child.start).line });
      }
      walk(child);
    }
  };
  walk(map);
  return { map, nodes };
}

/** The line and column of an offset, counted from one, for offsets asked in rising order. CRLF, LF and a lone CR each end a line. */
function lines(bytes: Uint8Array): (offset: number) => { line: number; column: number } {
  let at = 0;
  let line = 1;
  let lineStart = 0;
  return (offset) => {
    for (; at < offset; at++) {
      if (bytes[at] === 0x0a || (bytes[at] === 0x0d && bytes[at + 1] !== 0x0a)) {
        line++;
        lineStart = at + 1;
      }
    }
    return { line, column: offset - lineStart + 1 };
  };
}

/** All character data inside an element, its descendants' included. */
const valueOf = (element: XmlElement): string => element.children.map((child) => (child.kind === 'element' ? valueOf(child) : child.kind === 'text' ? child.text : '')).join('');
const collapsed = (element: XmlElement): string => valueOf(element).split(whiteRuns).filter((word) => word.length > 0).join(' ');
const firstBody = (element: XmlElement): XmlElement | undefined => {
  for (const child of elementsOf(element)) {
    const found = child.name === 'body' ? child : firstBody(child);
    if (found) return found;
  }
  return undefined;
};

/** An HTML body as the text a user reads: one line for each paragraph, markup dropped, white space collapsed. */
function plainText(rich: XmlElement): string {
  const body = firstBody(rich) ?? rich;
  const paragraphs = elementsOf(body, 'p');
  return paragraphs.length > 0 ? paragraphs.map(collapsed).join('\n') : collapsed(body);
}

/** FBL 11.2 `read`: never fails on content. */
export function read(request: PluginReadRequest): PluginReadResult {
  const bytes = request.files.find((file) => file.relativePath === '')?.bytes ?? new Uint8Array();
  const reading = readMap(bytes);
  if ('problem' in reading) {
    const { line, column } = lines(bytes)(reading.offset);
    return { elements: [], findings: [{ code: findingCodes.unparseable, severity: 'error', message: reading.problem, location: { file: '', line, column, length: 0 } }], unreadable: true };
  }
  const ids = new Map(reading.nodes.map((node) => [node.element, node.id]));
  const elements = reading.nodes.map(({ element, id, line }): FblElement => {
    const formatted = richContent(element, 'NODE');
    const notes = richContent(element, 'NOTE');
    const stored = attributeOf(element, 'ID')?.text ?? '';
    const link = attributeOf(element, 'LINK')?.text;
    const position = attributeOf(element, 'POSITION')?.text;
    const parent = element.parent && ids.get(element.parent);
    return {
      id,
      idIsStored: id === stored,
      type: 'Node',
      rule: NODE,
      isRelation: false,
      attributes: {
        text: formatted ? plainText(formatted) : attributeOf(element, 'TEXT')?.text ?? '',
        notes: notes ? plainText(notes) : '',
        folded: attributeOf(element, 'FOLDED')?.text.toLowerCase() === 'true',
        storedId: stored,
        // Only when the file writes one, empty or not: `has(self.link)` is "the node is linked".
        ...(link === undefined ? {} : { link }),
        ...(position === undefined ? {} : { position }),
      },
      ...(parent === undefined ? {} : { parentId: parent, parentSlot: 'children' }),
      ownSpan: { start: element.start, end: element.end },
      line,
    };
  });
  return { elements, findings: [], unreadable: false };
}
