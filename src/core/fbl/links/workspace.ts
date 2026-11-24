// The workspace's index of documents, and a link resolved against it (FBL 0.23 sections 17.3 to 17.6; etalii.adp
// spec 089). Paths are kept as the host gives them, with forward slashes, and compared as text.

import { type Link, linkToDocument, linkToElement, parseLink } from './link';

/** The codes of a link's findings (FBL 17.6). */
export const linkCodes = {
  malformed: 'link.malformed',
  brokenDocument: 'link.broken-document',
  brokenElement: 'link.broken-element',
  ambiguousDocument: 'link.ambiguous-document',
} as const;

/** An element of a document that can be linked to: its id, and its attributes of a text type, in declaration order. */
export interface IndexedElement {
  readonly id: string;
  readonly attributes: readonly (readonly [string, string])[];
}

/** A link a document holds, and the element or value of it that holds it, as its tool type names that. */
export interface HeldLink {
  readonly holder: string;
  readonly text: string;
}

/** One document of the workspace as the index sees it (FBL 17.3). */
export interface IndexedDocument {
  readonly path: string;
  /** Its document id; undefined for a body that holds none yet, which nothing resolves to until it is given one. */
  readonly documentId?: string;
  /** The attribute its tool type names an element by (DISL's and DESL's `linkable`); undefined to use an element's first attribute. */
  readonly nameProperty?: string;
  /** Its elements that can be linked to, in document order; two with one id are both kept, as a body may hold them. */
  readonly elements: readonly IndexedElement[];
  /** The links it holds. */
  readonly links: readonly HeldLink[];
}

/** A link that resolved: its target document and, for a link to an element, that element. */
export interface Resolved {
  readonly link: Link;
  readonly path: string;
  readonly element?: IndexedElement;
  /** The link as load-time validation writes it (FBL 17.4, step 4); equal to what was read when nothing differs. */
  readonly refreshed: Link;
}

/** A link's finding (FBL 17.6). */
export interface LinkFinding {
  readonly code: (typeof linkCodes)[keyof typeof linkCodes];
  readonly message: string;
  /** For `link.ambiguous-document`, the documents to choose from, by path. */
  readonly candidates: readonly string[];
  /** The link as it was read, for every finding but `link.malformed`: it is shown by its cached name. */
  readonly link?: Link;
}

export type Resolution = { readonly resolved: Resolved; readonly finding?: undefined } | { readonly resolved?: undefined; readonly finding: LinkFinding };

/** A link, in some document of the workspace, that resolves to an element (FBL 17.5). */
export interface Backlink {
  /** The consuming document. */
  readonly path: string;
  /** The element or value of it that holds the link. */
  readonly holder: string;
  readonly link: Link;
}

/** The value of `element`'s attribute `name`, or undefined. */
export const attributeOf = (element: IndexedElement, name: string): string | undefined => element.attributes.find(([n]) => n === name)?.[1];

/** A path's file name, with its extension and without its folder. */
export const fileNameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/**
 * What names `element` of `document`: the value of `nameProp` when the element has that attribute, else of the
 * type's name property, else of its first attribute; and the attribute that was used, undefined for the type's own.
 */
function nameOf(document: IndexedDocument, element: IndexedElement, nameProp: string | undefined): [string | undefined, string] {
  if (nameProp !== undefined) {
    const value = attributeOf(element, nameProp);
    if (value !== undefined) return [nameProp, value];
  }
  const own = (document.nameProperty !== undefined ? attributeOf(element, document.nameProperty) : element.attributes[0]?.[1]) ?? '';
  // A name property that names no attribute is replaced by the one used in its place (FBL 17.4).
  return [nameProp !== undefined ? document.nameProperty : undefined, own];
}

const byPath = (a: IndexedDocument, b: IndexedDocument): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** The documents of one workspace root (FBL 17.3), each as its tool type reads it, kept in path order. */
export class LinkWorkspace {
  private documentList: IndexedDocument[];

  constructor(readonly root: string, documents: Iterable<IndexedDocument> = []) {
    this.documentList = [...documents].sort(byPath);
  }

  get documents(): readonly IndexedDocument[] {
    return this.documentList;
  }

  document(path: string): IndexedDocument | undefined {
    return this.documentList.find((d) => d.path === path);
  }

  /** Replaces the document at its path, or adds it: a document read again after it changed. */
  put(document: IndexedDocument): void {
    this.documentList = [...this.documentList.filter((d) => d.path !== document.path), document].sort(byPath);
  }

  /** Takes the document at `path` out of the index: a file deleted, or moved out of the workspace. */
  remove(path: string): void {
    this.documentList = this.documentList.filter((d) => d.path !== path);
  }

  /** A path as a finding names it: relative to the workspace's root. */
  display(path: string): string {
    const root = this.root.endsWith('/') ? this.root : `${this.root}/`;
    return path.startsWith(root) ? path.slice(root.length) : path;
  }

  /**
   * Resolves the link `text` (FBL 17.3): parsed; the target document by its id, else by its file name among the
   * documents of that id or, when none has it, among all that have an id; then the target element by its id.
   */
  resolve(text: string): Resolution {
    const link = parseLink(text);
    if (!link) return { finding: { code: linkCodes.malformed, message: `'${text}' is not a link.`, candidates: [] } };
    const withId = this.documentList.filter((d) => d.documentId === link.documentId);
    let target: IndexedDocument;
    if (withId.length === 1) {
      target = withId[0];
    } else {
      const pool = withId.length === 0 ? this.documentList.filter((d) => d.documentId !== undefined) : withId;
      const named = pool.filter((d) => fileNameOf(d.path) === link.documentName);
      if (named.length === 0) {
        return { finding: { code: linkCodes.brokenDocument, message: `No document '${link.documentName}' with id '${link.documentId}' is in the workspace.`, candidates: [], link } };
      }
      if (named.length > 1) {
        const candidates = named.map((d) => d.path);
        return {
          finding: {
            code: linkCodes.ambiguousDocument,
            message: `${candidates.length} documents are '${link.documentName}' with id '${link.documentId}': ${candidates.map((p) => this.display(p)).join(', ')}.`,
            candidates,
            link,
          },
        };
      }
      target = named[0];
    }
    const part = link.element;
    if (!part) return { resolved: { link, path: target.path, refreshed: linkToDocument(target.documentId ?? '', fileNameOf(target.path)) } };
    const holders = target.elements.filter((e) => e.id === part.id);
    if (holders.length === 0) {
      return { finding: { code: linkCodes.brokenElement, message: `'${part.name ?? part.id}' is no longer in '${fileNameOf(target.path)}'.`, candidates: [], link } };
    }
    if (holders.length > 1) {
      return { finding: { code: linkCodes.ambiguousDocument, message: `'${fileNameOf(target.path)}' holds ${holders.length} elements with id '${part.id}'.`, candidates: [target.path], link } };
    }
    const [nameProp, name] = nameOf(target, holders[0], part.nameProp);
    return { resolved: { link, path: target.path, element: holders[0], refreshed: linkToElement(target.documentId ?? '', fileNameOf(target.path), part.id, nameProp, name) } };
  }

  /**
   * The backlinks of the element `elementId` of the document at `path` (FBL 17.5): every link of the workspace
   * that resolves to it, in path order and then in the order each document holds them. Computed, never stored.
   */
  backlinks(path: string, elementId: string): Backlink[] {
    return this.documentList.flatMap((document) =>
      document.links.flatMap((held) => {
        const { resolved } = this.resolve(held.text);
        return resolved && resolved.path === path && resolved.link.element?.id === elementId ? [{ path: document.path, holder: held.holder, link: resolved.link }] : [];
      }),
    );
  }

  /** How many links of the workspace a delete of these elements of the document at `path` breaks (FBL 17.5). */
  brokenByDeleting(path: string, elementIds: readonly string[]): number {
    return elementIds.reduce((sum, id) => sum + this.backlinks(path, id).length, 0);
  }
}
