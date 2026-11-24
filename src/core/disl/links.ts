// Links to other documents as a specification declares them (DISL 0.12, 4.12; FBL 0.23 section 17;
// etalii.adp spec 089): which types can be linked to and by what name, which stand for the target of a
// link, the document as the workspace's index holds it, and the model as it is shown while the
// workspace is known: each linked element named by its target's current name, `self.linked` read from
// the target, a link that does not resolve reported where it is held, and what load-time validation
// writes (FBL 17.4).

import { cachedName, linkText } from '../fbl/links/link';
import { attributeOf, type HeldLink, type IndexedDocument, type IndexedElement, type LinkFinding, linkCodes, type LinkWorkspace } from '../fbl/links/workspace';
import { attributesOf, type Metamodel, valueKind } from './metamodel';
import { finding, type Finding, type Model, type ModelElement } from './model';
import { isObject } from './specification';

/** `linkable` of a type (DISL 4.12): the attribute that names its elements in a link. */
export interface Linkable {
  readonly nameProperty?: string;
}

/** `linked` of a type (DISL 4.12): the attribute of type `link` that holds its link, and the target's attributes it shows. */
export interface Linked {
  readonly attribute: string;
  readonly shows: readonly { readonly attribute: string; readonly label?: unknown }[];
}

/** The first of a type's lineage that declares `key`, as it declares it. */
function declaredIn(metamodel: Metamodel, type: string, key: string): unknown {
  for (const name of metamodel.types[type]?.lineage ?? []) {
    const declared = metamodel.types[name]?.declared as Readonly<Record<string, unknown>> | undefined;
    if (declared && Object.hasOwn(declared, key)) return declared[key];
  }
  return undefined;
}

/** Whether elements of `type` can be linked to, and by what name: its own `nameProperty`, else its label attribute. */
export function linkableOf(metamodel: Metamodel, type: string): Linkable | undefined {
  const declared = declaredIn(metamodel, type, 'linkable');
  if (declared !== true && !isObject(declared)) return undefined;
  const named = isObject(declared) && typeof declared.nameProperty === 'string' ? declared.nameProperty : metamodel.types[type]?.labelAttribute;
  return named === undefined ? {} : { nameProperty: named };
}

/** Whether each element of `type` stands for the target of its link, and which attribute holds that link. */
export function linkedOf(metamodel: Metamodel, type: string): Linked | undefined {
  const declared = declaredIn(metamodel, type, 'linked');
  if (!isObject(declared) || typeof declared.attribute !== 'string') return undefined;
  const shows = Array.isArray(declared.shows) ? declared.shows.filter((entry) => isObject(entry) && typeof entry.attribute === 'string') as Linked['shows'] : [];
  return { attribute: declared.attribute, shows };
}

/** The attributes of a type that hold links: those of type `link`. */
const linkAttributes = (metamodel: Metamodel, type: string): string[] =>
  Object.entries(attributesOf(metamodel, type)).flatMap(([name, attribute]) => (attribute.type === 'link' ? [name] : []));

/** Whether an attribute holds a text an element can be named by (FBL 17.1): a string or a text, not a link. */
function namesBy(metamodel: Metamodel, type: string, name: string): boolean {
  const attribute = attributesOf(metamodel, type)[name];
  if (attribute.type === 'link') return false;
  const kind = valueKind(metamodel, attribute.type);
  return kind.kind === 'primitive' && (kind.primitive === 'string' || kind.primitive === 'text');
}

/** The links an element holds, each with the attribute it is held in. */
function linksOf(metamodel: Metamodel, element: ModelElement): { readonly attribute: string; readonly text: string }[] {
  return linkAttributes(metamodel, element.type).flatMap((attribute) => {
    const value = element.attributes[attribute];
    const texts = Array.isArray(value) ? value : [value];
    return texts.flatMap((text) => (typeof text === 'string' && text !== '' ? [{ attribute, text }] : []));
  });
}

/**
 * A document as the workspace's index holds it (FBL 17.3): its document id, and each element of a linkable
 * type with its text attributes, the name property first; and the links it holds, each by the element that
 * holds it.
 */
export function indexedDocument(metamodel: Metamodel, model: Model, path: string, documentId: string | undefined): IndexedDocument {
  const elements: IndexedElement[] = [];
  let nameProperty: string | undefined;
  for (const element of model.elements) {
    const linkable = element.derived === undefined ? linkableOf(metamodel, element.type) : undefined;
    if (!linkable) continue;
    nameProperty ??= linkable.nameProperty;
    const names = Object.keys(attributesOf(metamodel, element.type)).filter((name) => namesBy(metamodel, element.type, name));
    const ordered = linkable.nameProperty !== undefined && names.includes(linkable.nameProperty) ? [linkable.nameProperty, ...names.filter((name) => name !== linkable.nameProperty)] : names;
    elements.push({ id: element.id, attributes: ordered.map((name) => [name, typeof element.attributes[name] === 'string' ? element.attributes[name] as string : ''] as const) });
  }
  const links: HeldLink[] = [...model.elements, ...model.relations].flatMap((element) => linksOf(metamodel, element).map(({ text }) => ({ holder: element.id, text })));
  return { path, ...(documentId === undefined ? {} : { documentId }), ...(nameProperty === undefined ? {} : { nameProperty }), elements, links };
}

/** A link of the document that load-time validation writes again (FBL 17.4, step 4): where it is held, and its new text. */
export interface Refreshed {
  readonly element: string;
  readonly attribute: string;
  readonly text: string;
  /** For a linked element whose label attribute caches the target's name: that attribute, and the name. */
  readonly label?: { readonly attribute: string; readonly name: string };
}

/** The model as it is shown in its workspace, its link findings, and what load-time validation writes of its links. */
export interface Linking {
  readonly model: Model;
  readonly findings: readonly Finding[];
  readonly refreshed: readonly Refreshed[];
}

const severityOf = (finding: LinkFinding): Finding['severity'] => (finding.code === linkCodes.malformed ? 'error' : 'warning');

/**
 * The model of a document in its workspace (DISL 4.12, FBL 17.4 to 17.6): every link resolved; a linked
 * element named by its target's current name, with `linked`, the target's `shows` attributes, while its link
 * resolves; a link that does not resolve reported at the element that holds it; and each link whose text
 * differs from what resolution found, with its new text.
 */
export function linkedModel(metamodel: Metamodel, model: Model, links: LinkWorkspace): Linking {
  const findings: Finding[] = [];
  const refreshed: Refreshed[] = [];
  const shown = (element: ModelElement): ModelElement => {
    const linked = linkedOf(metamodel, element.type);
    let named: string | undefined;
    let values: Readonly<Record<string, unknown>> | undefined;
    for (const held of linksOf(metamodel, element)) {
      const { resolved, finding: found } = links.resolve(held.text);
      if (found) {
        findings.push(finding(found.code, severityOf(found), found.message, { element: element.id, ...(found.candidates.length === 0 ? {} : { detail: { candidates: [...found.candidates] } }) }));
        continue;
      }
      const name = cachedName(resolved.refreshed);
      const label = linked?.attribute === held.attribute ? labelOf(metamodel, element, held.attribute) : undefined;
      const text = linkText(resolved.refreshed);
      const stale = label !== undefined && name !== undefined && element.attributes[label] !== name;
      if (text !== held.text || stale) refreshed.push({ element: element.id, attribute: held.attribute, text, ...(stale ? { label: { attribute: label!, name: name! } } : {}) });
      if (linked?.attribute !== held.attribute) continue;
      named = name;
      values = Object.fromEntries(linked.shows.flatMap((entry) => {
        const value = resolved.element === undefined ? undefined : attributeOf(resolved.element, entry.attribute);
        return value === undefined ? [] : [[entry.attribute, value]];
      }));
    }
    if (values === undefined) return element;
    const label = labelOf(metamodel, element, linked!.attribute);
    return { ...element, linked: values, ...(label === undefined || named === undefined ? {} : { attributes: { ...element.attributes, [label]: named } }) };
  };
  const elements = model.elements.map(shown);
  const relations = model.relations.map((relation) => shown(relation) as typeof relation);
  return { model: { ...model, elements, relations }, findings, refreshed };
}

/** The attribute a linked element is labelled by when it caches its target's name: its type's label attribute, unless that is the link itself. */
function labelOf(metamodel: Metamodel, element: ModelElement, link: string): string | undefined {
  const label = metamodel.types[element.type]?.labelAttribute;
  return label !== undefined && label !== link && Object.hasOwn(attributesOf(metamodel, element.type), label) ? label : undefined;
}
