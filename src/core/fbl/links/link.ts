// A link as FBL 0.23 section 17.1 writes it: `$<document-id>@<document-name>[#<element-id>[.<name-prop>][=<name>]]`
// (etalii.adp spec 089). Read by splitting at the separators first and unescaping each part after; written with
// each part escaped only where a character would end it.

/** The part of a link after `#`. */
export interface ElementPart {
  readonly id: string;
  /** The attribute of the target element that names it; undefined for its type's name property. */
  readonly nameProp?: string;
  /** That attribute's value as last seen; undefined until load-time validation fills it in. */
  readonly name?: string;
}

/** A link to a document, or to an element of it. */
export interface Link {
  /** The target document's id. */
  readonly documentId: string;
  /** The target document's file name, with its extension and without its folder. */
  readonly documentName: string;
  /** The target element; undefined for a link to the document as a whole. */
  readonly element?: ElementPart;
}

const endsAnId = new Set(['$', '@', '#', '.', '=']);
const endsAFileName = new Set(['#']);
const endsAName = new Set<string>();

const isControl = (c: string): boolean => {
  const code = c.codePointAt(0) ?? 0;
  return code < 0x20 || code === 0x7f;
};
const idChar = (c: string): boolean => !isControl(c) && !'#$%.=@'.includes(c);
const fileChar = (c: string): boolean => !isControl(c) && c !== '#' && c !== '%';
const textChar = (c: string): boolean => !isControl(c) && c !== '%';

/** One part of a link unescaped, or undefined when it holds a character its part does not allow, or is empty where it must not be. */
function part(raw: string, allowed: (c: string) => boolean, mayBeEmpty: boolean): string | undefined {
  if (raw === '' && !mayBeEmpty) return undefined;
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  for (let at = 0; at < raw.length; ) {
    const c = String.fromCodePoint(raw.codePointAt(at) ?? 0);
    if (c === '%') {
      const hex = raw.slice(at + 1, at + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) return undefined;
      bytes.push(parseInt(hex, 16));
      at += 3;
    } else if (allowed(c)) {
      bytes.push(...encoder.encode(c));
      at += c.length;
    } else {
      return undefined;
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return undefined;
  }
}

function escape(text: string, reserved: ReadonlySet<string>): string {
  let escaped = '';
  for (const c of text) {
    if (c === '%' || reserved.has(c)) {
      for (const byte of new TextEncoder().encode(c)) escaped += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    } else {
      escaped += c;
    }
  }
  return escaped;
}

/** The text before the first `separator` and the rest after it, or undefined when there is none. */
function splitOnce(text: string, separator: string): [string, string] | undefined {
  const at = text.indexOf(separator);
  return at < 0 ? undefined : [text.slice(0, at), text.slice(at + separator.length)];
}

/** A link to a document as a whole. */
export const linkToDocument = (documentId: string, documentName: string): Link => ({ documentId, documentName });

/** A link to an element, named by `nameProp` (undefined for the type's name property) with the cached `name`. */
export const linkToElement = (documentId: string, documentName: string, id: string, nameProp?: string, name?: string): Link => ({
  documentId,
  documentName,
  element: { id, ...(nameProp === undefined ? {} : { nameProp }), ...(name === undefined ? {} : { name }) },
});

/** Reads a link, or undefined when `text` is not one (`link.malformed`). */
export function parseLink(text: string): Link | undefined {
  if (!text.startsWith('$')) return undefined;
  const idAndRest = splitOnce(text.slice(1), '@');
  if (!idAndRest) return undefined;
  const [rawId, rest] = idAndRest;
  const nameAndElement = splitOnce(rest, '#');
  const [rawName, rawElement] = nameAndElement ?? [rest, undefined];
  const documentId = part(rawId, idChar, false);
  const documentName = part(rawName, fileChar, false);
  if (documentId === undefined || documentName === undefined) return undefined;
  if (rawElement === undefined) return { documentId, documentName };
  const [beforeName, rawCached] = splitOnce(rawElement, '=') ?? [rawElement, undefined];
  const [rawElementId, rawProp] = splitOnce(beforeName, '.') ?? [beforeName, undefined];
  const id = part(rawElementId, idChar, false);
  const nameProp = rawProp === undefined ? undefined : part(rawProp, idChar, false);
  const name = rawCached === undefined ? undefined : part(rawCached, textChar, true);
  if (id === undefined || (rawProp !== undefined && nameProp === undefined) || (rawCached !== undefined && name === undefined)) return undefined;
  return linkToElement(documentId, documentName, id, nameProp, name);
}

/** The link as it is written, each part escaped where a character would end it. */
export function linkText(link: Link): string {
  let text = `$${escape(link.documentId, endsAnId)}@${escape(link.documentName, endsAFileName)}`;
  if (link.element) {
    text += `#${escape(link.element.id, endsAnId)}`;
    if (link.element.nameProp !== undefined) text += `.${escape(link.element.nameProp, endsAnId)}`;
    if (link.element.name !== undefined) text += `=${escape(link.element.name, endsAName)}`;
  }
  return text;
}

/** The name a link caches, or undefined. */
export const cachedName = (link: Link): string | undefined => link.element?.name;
