// The planner of the persistence plugin `net.etalii.adp.freeplane.mm` (etalii.adp spec 027,
// research R9): what standalone's commands do to the XML in place (`MindmapDocument`,
// `MindmapNode`, with `FreeplaneXmlWriter` for the text they write), given as splices of the
// body's bytes, so everything a change does not concern is kept byte for byte (FBL 11.4). No
// fixture of etalii.adp states these bytes (etalii.adp issue 141): standalone's command tests and
// its recorded transcript do.

import { applyEdit, type FblSplice, type ModelChange, type PluginPlanRequest, type PluginPlanResult, type SpliceOperation } from '../../fbl';
import { attributeOf, isWhiteText, readMap, richContent, type XmlElement, type XmlNode } from './reader';

/** A change that cannot be made, with the sentence the host shows (FBL 6.4). */
class Refusal extends Error {}

const refuse = (sentence: string): never => {
  throw new Refusal(sentence);
};

const GONE = 'The node no longer exists.';
const EXISTS = 'A node with that id already exists.';
const NO_SIBLING = 'The root node cannot have a sibling.';
const NOT_BESIDE = 'The node to place it beside is not under that node.';

const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

/** Text escaping (FBL 4.5): `&`, `<` and `>`. */
const escapeText = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
/** Attribute escaping (FBL 4.5): the text escapes, `"`, LF and CR; and the quote the value is written in, when that is `'`. */
const escapeAttribute = (value: string, quote = '"'): string => {
  const escaped = escapeText(value).replaceAll('"', '&quot;').replaceAll('\n', '&#xa;').replaceAll('\r', '&#xd;');
  return quote === '\'' ? escaped.replaceAll('\'', '&apos;') : escaped;
};
/** Notes as Freeplane keeps them: one paragraph for each line. */
const htmlOf = (notes: string): string => `<html><head/><body>${notes.split('\n').map((line) => `<p>${escapeText(line)}</p>`).join('')}</body></html>`;
const noteOf = (notes: string): string => `<richcontent TYPE="NOTE">${htmlOf(notes)}</richcontent>`;

/** A value of a change as text; null and nothing are the empty text. */
const textOf = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

/** What a change does to the content of one element: the children it takes out and the text it puts in. */
interface Content {
  readonly removed: Set<XmlNode>;
  /** `at` is an offset between two children; without it the text goes before the end tag. */
  readonly inserts: { readonly at?: number; readonly text: string }[];
  /** What a removal and an insertion are named (FBL 6.1): an entry for a node, a key for a note or a formatted text. */
  entry: boolean;
}

/** FBL 11.2 `plan`: the splices that realise one model change, or the sentence that refuses it. */
export function plan(request: PluginPlanRequest): PluginPlanResult {
  const bytes = request.files.find((file) => file.relativePath === '')?.bytes ?? new Uint8Array();
  const reading = readMap(bytes);
  // The library asks for no plan of a body that does not read (FBL 7.5).
  if ('problem' in reading) return { refused: reading.problem };
  const { map, nodes } = reading;
  const written = (start: number, end: number): string => decoder.decode(bytes.subarray(start, end));

  const byId = new Map(nodes.map((node) => [node.id, node.element]));
  const idOf = new Map(nodes.map((node) => [node.element, node.id]));
  const isNode = (element: XmlElement | undefined): element is XmlElement => element !== undefined && idOf.has(element);
  const isRoot = (element: XmlElement): boolean => !isNode(element.parent);
  const holds = (id: string): boolean => byId.has(id) || nodes.some((node) => attributeOf(node.element, 'ID')?.text === id);

  // The line ending between the file's nodes: that of the first text under `<map>` with a line
  // break in it, which is always structural (standalone's `FreeplaneNewline`).
  const structural = map.children.find((child) => child.kind === 'text' && child.text.includes('\n'));
  const newline = structural?.kind === 'text' && structural.text.includes('\r\n') ? '\r\n' : '\n';

  const splices: FblSplice[] = [];
  const add = (operation: SpliceOperation, start: number, end: number, text: string): void => {
    if (written(start, end) !== text) splices.push({ operation, start, end, text });
  };
  const contents = new Map<XmlElement, Content>();
  const contentOf = (element: XmlElement, entry: boolean): Content => {
    let content = contents.get(element);
    if (!content) contents.set(element, content = { removed: new Set(), inserts: [], entry });
    return content;
  };
  const remaining = (element: XmlElement): XmlNode[] => element.children.filter((child) => !contents.get(element)?.removed.has(child));

  /** Takes a child out with the white space after it, so the children that stay are laid out as they were. */
  function detach(child: XmlElement, entry: boolean): void {
    const parent = child.parent!;
    const left = remaining(parent);
    const next = left[left.indexOf(child) + 1];
    const content = contentOf(parent, entry);
    content.removed.add(child);
    if (isWhiteText(next)) content.removed.add(next);
  }

  /** Puts text in as the last thing an element holds, on a line of its own. */
  function append(element: XmlElement, text: string, entry: boolean): void {
    const last = remaining(element).at(-1);
    contentOf(element, entry).inserts.push({ text: isWhiteText(last) && last.text.includes('\n') ? text + newline : newline + text + newline });
  }

  /** Puts a node's text among the node children of `parent`, where the change's position says. */
  function place(parent: XmlElement, text: string, position: Extract<ModelChange, { kind: 'add' }>['position']): void {
    const siblings = remaining(parent).filter((child): child is XmlElement => child.kind === 'element' && isNode(child));
    if (position === undefined) return append(parent, text, true);
    if ('index' in position) {
      const before = position.index >= 0 ? siblings[position.index] : undefined;
      if (!before) return append(parent, text, true);
      contentOf(parent, true).inserts.push({ at: before.start, text: text + newline });
      return;
    }
    const beside = siblings.find((sibling) => idOf.get(sibling) === ('after' in position ? position.after : position.before));
    if (!beside) return refuse(NOT_BESIDE);
    contentOf(parent, true).inserts.push('after' in position ? { at: beside.end, text: newline + text } : { at: beside.start, text: text + newline });
  }

  const attributesEnd = (element: XmlElement): number => element.attributes.at(-1)?.end ?? element.nameEnd;

  /** Writes an attribute: the value of the one that is there, or a new one after the last. */
  function setAttribute(element: XmlElement, name: string, value: string): void {
    const attribute = attributeOf(element, name);
    if (attribute) add('replace-value', attribute.value.start, attribute.value.end, escapeAttribute(value, attribute.quote));
    else add('insert-key', attributesEnd(element), attributesEnd(element), ` ${name}="${escapeAttribute(value)}"`);
  }

  function setNotes(element: XmlElement, notes: string): void {
    const left = remaining(element);
    const existing = left.find((child): child is XmlElement => child === richContent(element, 'NOTE'));
    if (notes === '') {
      if (!existing) return;
      detach(existing, false);
      // Only white space left means the note was all the node held: it goes too, and the tag closes.
      if (remaining(element).every(isWhiteText)) for (const child of remaining(element)) contentOf(element, false).removed.add(child);
    } else if (!existing) {
      // Before the first child node, which is where Freeplane puts it.
      const first = left.find((child) => child.kind === 'element' && isNode(child));
      if (first) contentOf(element, false).inserts.push({ at: first.start, text: noteOf(notes) + newline });
      else append(element, noteOf(notes), false);
    } else if (existing.selfClosed) {
      add('self-close', existing.close.start, existing.close.end, '>');
      add('replace-value', existing.end, existing.end, htmlOf(notes));
      add('self-close', existing.end, existing.end, '</richcontent>');
    } else {
      add('replace-value', existing.close.end, existing.endTag!.start, htmlOf(notes));
    }
  }

  function set(element: XmlElement, attributes: Readonly<Record<string, unknown>>): void {
    if ('text' in attributes) {
      // Plain text replaces formatted text outright: beside it, Freeplane would show the old text.
      const formatted = richContent(element, 'NODE');
      if (formatted) contentOf(element, false).removed.add(formatted);
      setAttribute(element, 'TEXT', textOf(attributes.text));
    }
    if ('link' in attributes) {
      const link = textOf(attributes.link);
      const attribute = attributeOf(element, 'LINK');
      // An emptied link is an unlink: the attribute goes, with the white space before it.
      if (link !== '') setAttribute(element, 'LINK', link);
      else if (attribute) {
        let start = attribute.start;
        while (start > element.nameEnd && ' \t\r\n'.includes(String.fromCharCode(bytes[start - 1]))) start--;
        add('remove-key', start, attribute.end, '');
      }
    }
    if ('notes' in attributes) setNotes(element, textOf(attributes.notes));
  }

  /** The attributes a change may give a node. `folded` and `position` are the file's, and ADP never writes them. */
  function checked(attributes: Readonly<Record<string, unknown>>): void {
    for (const name of Object.keys(attributes)) if (!['text', 'notes', 'link'].includes(name)) refuse(`The \`${name}\` of a node cannot be changed.`);
  }

  /** The content changes as splices: an element left with nothing is self-closed, one given its first content is opened (FBL 6.1). */
  function render(): void {
    for (const [element, content] of contents) {
      const removal: SpliceOperation = content.entry ? 'remove-entry' : 'remove-key';
      const insertion: SpliceOperation = content.entry ? 'insert-entry' : 'insert-key';
      const { removed, inserts } = content;
      if (element.selfClosed) {
        if (inserts.length === 0) continue;
        add('self-close', element.close.start, element.close.end, '>');
        for (const insert of inserts) add(insertion, element.end, element.end, insert.text);
        add('self-close', element.end, element.end, `</${element.name}>`);
      } else if (removed.size === element.children.length && removed.size > 0 && inserts.length === 0) {
        // The white space around what goes is the tag's own to take (FBL 6.1, `self-close`).
        const gone = element.children.filter((child) => child.kind !== 'text' || !isWhiteText(child));
        const [first, last] = [gone[0] ?? element.children[0], gone.at(-1) ?? element.children.at(-1)!];
        add('self-close', element.close.start, first.start, '/>');
        add(removal, first.start, last.end, '');
        add('self-close', last.end, element.endTag!.end, '');
      } else {
        let run: { start: number; end: number } | undefined;
        for (const child of [...element.children, undefined]) {
          if (child && removed.has(child)) run = { start: run?.start ?? child.start, end: child.end };
          else if (run) {
            add(removal, run.start, run.end, '');
            run = undefined;
          }
        }
        for (const insert of inserts) add(insertion, insert.at ?? element.endTag!.start, insert.at ?? element.endTag!.start, insert.text);
      }
    }
  }

  const change = request.change;
  try {
    switch (change.kind) {
      case 'add': {
        if (change.type !== 'Node') refuse(`A mind map holds only nodes, so no \`${change.type}\` is added.`);
        if (change.id === undefined) return refuse('A new node needs an id.');
        checked(change.attributes);
        if (change.parent === undefined) refuse(NO_SIBLING);
        const parent = byId.get(change.parent!) ?? refuse(GONE);
        if (holds(change.id)) refuse(EXISTS);
        // TEXT and ID in that order, as standalone writes a new node, then what its other commands would add.
        const link = textOf(change.attributes.link);
        const notes = textOf(change.attributes.notes);
        const tag = `<node TEXT="${escapeAttribute(textOf(change.attributes.text))}" ID="${escapeAttribute(change.id)}"${link === '' ? '' : ` LINK="${escapeAttribute(link)}"`}`;
        place(parent, notes === '' ? `${tag}/>` : `${tag}>${newline}${noteOf(notes)}${newline}</node>`, change.position);
        break;
      }
      case 'set': {
        const element = byId.get(change.id) ?? refuse(GONE);
        checked(change.attributes);
        set(element, change.attributes);
        break;
      }
      case 'remove': {
        const element = byId.get(change.id) ?? refuse(GONE);
        if (isRoot(element)) refuse('The root node cannot be removed.');
        detach(element, true);
        break;
      }
      case 'move': {
        const element = byId.get(change.id) ?? refuse(GONE);
        if (isRoot(element)) refuse('The root node cannot be moved.');
        if (change.parent === undefined) refuse(NO_SIBLING);
        const parent = byId.get(change.parent!) ?? refuse('The destination node no longer exists.');
        for (let within: XmlElement | undefined = parent; within; within = within.parent) if (within === element) refuse('A node cannot be moved into its own branch.');
        // The node's own bytes, unchanged (FBL 11.2), and an index counted once it is taken out.
        detach(element, true);
        place(parent, written(element.start, element.end), change.position);
        break;
      }
      case 'storeId': {
        const element = byId.get(change.id) ?? refuse(GONE);
        if (holds(change.newId)) refuse(EXISTS);
        setAttribute(element, 'ID', change.newId);
        break;
      }
      default:
        // A mind map has one type of node, and its file holds no place and no identity beside the ID.
        return { refused: 'A mind map file cannot hold this change.' };
    }
    render();
  } catch (error) {
    if (error instanceof Refusal) return { refused: error.message };
    throw error;
  }

  // In body order; what is written at an offset comes before what is replaced from there on (FBL 6.5).
  const ordered = splices.map((splice, index) => ({ splice, index }))
    .sort((a, b) => a.splice.start - b.splice.start || Number(a.splice.end > a.splice.start) - Number(b.splice.end > b.splice.start) || a.index - b.index)
    .map((entry) => entry.splice);
  // A node moved to where it is: the same bytes taken out and put back.
  if (change.kind === 'move' && sameBytes(applyEdit(bytes, { splices: ordered }), bytes)) return { planned: [] };
  return { planned: ordered.map((splice) => ({ file: '', splice })) };
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((byte, index) => byte === b[index]);
