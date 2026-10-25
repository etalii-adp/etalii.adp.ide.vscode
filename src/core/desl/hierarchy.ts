// What a hierarchy surface (DESL 7.7) asks of the model beside its layout, worked out without a
// view: the implicit members of the lists its labels name (7.7.2), what a filter's words leave of
// the page and in which order (7.7.3), the words a filter field offers to complete, the open notes of
// each level and entry (7.7.1), and which of a specification's operations a gesture of the surface
// runs, read from the operations' actions, since DESL leaves the gestures to prose (8.1).

import { isA, valueKind, type Metamodel } from '../disl/metamodel';
import type { Model, ModelElement } from '../disl/model';
import { celOf, isCel, isObject } from '../disl/specification';
import { mentionsIn, type Mentions } from './mentions';
import type { DesignerOperation } from './operations';
import type { DeriveId } from './settings';
import type { HierarchyLabel, HierarchySurface } from './surface';

/** CEL's `lowerAscii`: ASCII letters in lower case and every other character as it is, as a label names a member ignoring case. */
export const lowerAscii = (text: string): string => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

/** The values of a label attribute an element holds: one, several, or none. */
export function labelValues(element: ModelElement, attribute: string): string[] {
  const value = element.attributes[attribute];
  return typeof value === 'string' ? (value === '' ? [] : [value]) : Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item !== '') : [];
}

/** The members of a label's list in their order: the elements of its options type. */
export const membersOf = (model: Model, label: HierarchyLabel): ModelElement[] => model.elements.filter((element) => element.type === label.options.type);

/** The name of a member, as its options' `name` attribute holds it. */
export const memberName = (member: ModelElement, label: HierarchyLabel): string => {
  const name = member.attributes[label.options.name];
  return typeof name === 'string' ? name : '';
};

// ---- implicit members (DESL 7.7.2) ----

/**
 * A model with the implicit members of each label's list: every value a level or an entry holds
 * that names no member, ignoring case, becomes an element of the options type, with the id its
 * derived rule gives it, after the members of its type in the order of its first appearance,
 * spelt as it first appears, with no colour stored, so that it has the colour attribute's default.
 * `implied` holds their ids. Such a value is never reported.
 */
export function withImplicitMembers(model: Model, surface: HierarchySurface, derive: DeriveId): { readonly model: Model; readonly implied: ReadonlySet<string> } {
  const implied = new Set<string>();
  let elements = [...model.elements];
  for (const label of Object.values(surface.labels)) {
    const known = new Set(membersOf({ ...model, elements }, label).map((member) => lowerAscii(memberName(member, label))));
    const made: ModelElement[] = [];
    for (const element of model.elements) {
      if (!label.on.includes(element.type)) continue;
      for (const value of labelValues(element, label.attribute)) {
        if (known.has(lowerAscii(value))) continue;
        known.add(lowerAscii(value));
        const attributes = { [label.options.name]: value };
        const id = derive(label.options.type, attributes);
        if (id === undefined || elements.some((other) => other.id === id) || made.some((other) => other.id === id)) continue;
        made.push({ id, type: label.options.type, attributes, host: {}, ephemeral: false, line: 0 });
        implied.add(id);
      }
    }
    if (made.length === 0) continue;
    const last = elements.map((element) => element.type).lastIndexOf(label.options.type);
    const at = last < 0 ? elements.length : last + 1;
    elements = [...elements.slice(0, at), ...made, ...elements.slice(at)];
  }
  return { model: implied.size === 0 ? model : { ...model, elements }, implied };
}

// ---- the tree ----

/** The levels and entries of a model as the page stands them: the top levels, and of each level its entries and then its levels, in document order. */
export interface HierarchyTree {
  /** The levels without a level above them, in document order. */
  readonly roots: readonly ModelElement[];
  /** Levels and entries whose parent is no level: an entry at the top, or anything nested in an entry. */
  readonly stray: readonly ModelElement[];
  /** Of a level, by its id, the entries it holds, in document order. */
  entriesOf(level: string): readonly ModelElement[];
  /** Of a level, by its id, the levels it holds, in document order. */
  levelsOf(level: string): readonly ModelElement[];
  /** The levels above an element, the nearest first. */
  ancestorsOf(id: string): readonly ModelElement[];
  /** How deep a level lies: 1 for a top level. */
  depthOf(id: string): number;
  byId: ReadonlyMap<string, ModelElement>;
}

export function hierarchyOf(model: Model, surface: HierarchySurface): HierarchyTree {
  const members = model.elements.filter((element) => element.type === surface.levels.type || element.type === surface.entries.type);
  const byId = new Map(members.map((element) => [element.id, element]));
  const isLevel = (element: ModelElement | undefined): element is ModelElement => element?.type === surface.levels.type;
  const under = (parent: string | undefined, type: string): ModelElement[] => members.filter((element) => element.parent === parent && element.type === type);
  const ancestorsOf = (id: string): ModelElement[] => {
    const above: ModelElement[] = [];
    const seen = new Set([id]);
    for (let parent = byId.get(id)?.parent; parent !== undefined && !seen.has(parent); parent = byId.get(parent)?.parent) {
      seen.add(parent);
      const element = byId.get(parent);
      if (!element) break;
      above.push(element);
    }
    return above;
  };
  return {
    roots: members.filter((element) => isLevel(element) && element.parent === undefined),
    stray: members.filter((element) => (element.parent === undefined ? element.type === surface.entries.type : !isLevel(byId.get(element.parent)))),
    entriesOf: (level) => under(level, surface.entries.type),
    levelsOf: (level) => under(level, surface.levels.type),
    ancestorsOf,
    depthOf: (id) => ancestorsOf(id).filter(isLevel).length + 1,
    byId,
  };
}

// ---- filters (DESL 7.7.3) ----

/** The word that selects levels by their title, and the one that orders the entries (DESL 7.7.3). */
export const levelWord = 'item:';
export const sortWord = 'sort:';

/** One word of a filter's query, as written, and what it selects. */
export interface QueryWord {
  readonly text: string;
  /** A member of a label's list, a pattern of level titles, an order, or a word that selects nothing. */
  readonly kind: 'label' | 'level' | 'sort' | 'unknown';
  /** The label attribute a label word names. */
  readonly label: string;
  /** What follows the prefix. */
  readonly value: string;
}

/**
 * A query read word by word (DESL 7.7.3): `<prefix><name>` for a member of a label's list,
 * `item:pattern` for the levels whose title matches, and `sort:key`. The longest prefix that fits a
 * word decides what it is, and a prefix alone is no word of its kind.
 */
export function parseQuery(text: string, surface: HierarchySurface): QueryWord[] {
  const labels = Object.values(surface.labels).sort((left, right) => right.prefix.length - left.prefix.length);
  return text.split(/\s+/).filter((word) => word !== '').map((word): QueryWord => {
    const lower = lowerAscii(word);
    if (lower.startsWith(levelWord) && word.length > levelWord.length) return { text: word, kind: 'level', label: '', value: word.slice(levelWord.length) };
    if (lower.startsWith(sortWord) && word.length > sortWord.length) return { text: word, kind: 'sort', label: '', value: word.slice(sortWord.length) };
    const label = labels.find((candidate) => lower.startsWith(lowerAscii(candidate.prefix)) && word.length > candidate.prefix.length);
    return label === undefined ? { text: word, kind: 'unknown', label: '', value: word } : { text: word, kind: 'label', label: label.attribute, value: word.slice(label.prefix.length) };
  });
}

/** The order of a query: of several `sort:` words the first counts; empty for the document's order. */
export const sortOf = (words: readonly QueryWord[]): string => words.find((word) => word.kind === 'sort')?.value ?? '';

/** The keys a `sort:` word takes (DESL 7.7.3): `number`, `title`, and each label attribute. */
export const sortKeysOf = (surface: HierarchySurface): string[] => ['number', 'title', ...Object.keys(surface.labels)];

/** A level title pattern as a test: `*` any run of characters, `?` one, the rest as written, in any case, the whole title. */
function patternOf(pattern: string): RegExp {
  const source = Array.from(pattern, (character) => (character === '*' ? '[\\s\\S]*' : character === '?' ? '[\\s\\S]' : character.replace(/[.+^${}()|[\]\\]/g, '\\$&'))).join('');
  return new RegExp(`^${source}$`, 'i');
}

/** What a query leaves of the page. */
export interface Filtered {
  /** Whether the query narrows at all: false when it only sorts or is empty. */
  readonly narrows: boolean;
  /** The ids of the levels and entries that stay on the page. */
  readonly shown: ReadonlySet<string>;
  /** How many levels and entries stay, and how many there are. */
  readonly count: number;
  readonly total: number;
  /** The sort key the query orders the entries by, or empty for the document's order. */
  readonly sort: string;
  /** The entries a level holds that stay, in the query's order. */
  entriesOf(level: string): readonly ModelElement[];
}

/**
 * The page a query leaves (DESL 7.7.3). Words of one kind are alternatives, and kinds combine: an
 * entry stays when, for every label its words name, it holds one of the members they name,
 * ignoring case, and it stands in a level an `item:` word selects, or below one, or no `item:` word
 * is given. A level stays when it holds an entry that stays, or, with no word of a label, when it is
 * selected or below one that is, or no `item:` word is given; every level above what stays stays
 * with it. The sort orders the entries within each level by number (the id, its digits as a
 * number), by title ignoring case, or by the place of their first value in a label's list, those
 * whose value the list does not hold after those it does, and those without one last; levels keep
 * the document's order. Nothing is written.
 */
export function filtered(model: Model, surface: HierarchySurface, query: string | readonly QueryWord[], tree: HierarchyTree = hierarchyOf(model, surface)): Filtered {
  const words = typeof query === 'string' ? parseQuery(query, surface) : query;
  const byLabel = new Map<string, Set<string>>();
  for (const word of words.filter((candidate) => candidate.kind === 'label')) byLabel.set(word.label, (byLabel.get(word.label) ?? new Set()).add(lowerAscii(word.value)));
  const patterns = words.filter((word) => word.kind === 'level').map((word) => patternOf(word.value));
  const narrows = byLabel.size > 0 || patterns.length > 0;
  const nodes = [...tree.byId.values()];
  const titleOf = (element: ModelElement): string => {
    const title = element.attributes[element.type === surface.levels.type ? surface.levels.title : surface.entries.title];
    return typeof title === 'string' ? title : '';
  };
  const shown = new Set<string>();
  if (narrows) {
    const selected = (element: ModelElement): boolean => element.type === surface.levels.type && patterns.some((pattern) => pattern.test(titleOf(element)));
    const inScope = (element: ModelElement): boolean => patterns.length === 0 || selected(element) || tree.ancestorsOf(element.id).some(selected);
    const keep = (element: ModelElement): void => {
      shown.add(element.id);
      for (const above of tree.ancestorsOf(element.id)) shown.add(above.id);
    };
    for (const element of nodes) {
      if (!inScope(element)) continue;
      if (element.type === surface.entries.type && [...byLabel].every(([label, names]) => labelValues(element, label).some((value) => names.has(lowerAscii(value))))) keep(element);
      else if (element.type === surface.levels.type && byLabel.size === 0) keep(element);
    }
  } else for (const element of nodes) shown.add(element.id);

  const key = sortOf(words).toLowerCase();
  const label = Object.values(surface.labels).find((candidate) => lowerAscii(candidate.attribute) === key);
  const places = label ? membersOf(model, label).map((member) => lowerAscii(memberName(member, label))) : [];
  const rank = (element: ModelElement): number => {
    const value = label ? labelValues(element, label.attribute)[0] : undefined;
    if (value === undefined) return Number.MAX_SAFE_INTEGER;
    const place = places.indexOf(lowerAscii(value));
    return place < 0 ? Number.MAX_SAFE_INTEGER - 1 : place;
  };
  const compare = (left: ModelElement, right: ModelElement): number => {
    if (key === 'number') return left.id.localeCompare(right.id, undefined, { numeric: true });
    if (key === 'title') return titleOf(left).localeCompare(titleOf(right), undefined, { sensitivity: 'base' });
    return label ? rank(left) - rank(right) : 0;
  };
  return {
    narrows, shown, count: nodes.filter((element) => shown.has(element.id)).length, total: nodes.length, sort: key,
    // Array.prototype.sort is stable, so equal entries keep the document's order.
    entriesOf: (level) => tree.entriesOf(level).filter((element) => shown.has(element.id)).sort(compare),
  };
}

/** A word a filter field offers for the one being typed, with what it is. */
export interface Completion {
  readonly word: string;
  /** The label attribute it names a member of, or `item` or `sort` for those words. */
  readonly hint: string;
}

/**
 * What a filter field offers for `typed`, the start of a word (DESL 7.7.3): each label's prefix,
 * `item:` and `sort:`, then every member of every label's list with its prefix, then `sort:` with
 * each key, those that start with what is typed, ignoring case, and none that is typed in full.
 * For nothing typed, the prefixes alone.
 */
export function completionsOf(typed: string, model: Model, surface: HierarchySurface): Completion[] {
  const labels = Object.values(surface.labels);
  const prefixes: Completion[] = [
    ...labels.map((label) => ({ word: label.prefix, hint: label.attribute })),
    { word: levelWord, hint: levelWord.slice(0, -1) },
    { word: sortWord, hint: sortWord.slice(0, -1) },
  ];
  const wanted = lowerAscii(typed);
  if (wanted === '') return prefixes;
  const members = labels.flatMap((label) => membersOf(model, label).map((member) => ({ word: `${label.prefix}${memberName(member, label)}`, hint: label.attribute })));
  const orders = sortKeysOf(surface).map((key) => ({ word: `${sortWord}${key}`, hint: sortWord.slice(0, -1) }));
  return [...prefixes, ...members, ...orders].filter((candidate) => {
    const word = lowerAscii(candidate.word);
    return word.startsWith(wanted) && word !== wanted;
  });
}

// ---- notes (DESL 7.7.1) ----

/** The notes of one level or entry: how many are open, their kinds in order, the icon of the one kind when one is open, and the open ones inside it. */
export interface NoteCount {
  readonly open: number;
  readonly noteKinds: readonly string[];
  readonly icon?: string;
  /** The open notes about what lies inside it, which a collapsed level's icon stands for too. */
  readonly within: number;
}

/** The id of the level or entry a note is about: the mention of its `about` attribute, else its value. */
export function aboutOf(note: ModelElement, surface: HierarchySurface, mentions?: Mentions): string | undefined {
  const notes = surface.notes;
  const value = notes ? note.attributes[notes.about] : undefined;
  if (typeof value !== 'string' || value === '') return undefined;
  const facet = notes && mentions?.of(note.type, notes.about);
  return facet ? mentionsIn(value, facet)[0]?.id : value.trim();
}

/** Of each level and entry that has open notes, or holds what has, how many there are and of which kinds (DESL 7.7.1). */
export function notesOf(model: Model, surface: HierarchySurface, metamodel: Metamodel, mentions?: Mentions, tree: HierarchyTree = hierarchyOf(model, surface)): ReadonlyMap<string, NoteCount> {
  const notes = surface.notes;
  const counts = new Map<string, { open: number; noteKinds: string[]; within: number }>();
  if (!notes) return counts;
  const at = (id: string) => counts.get(id) ?? counts.set(id, { open: 0, noteKinds: [], within: 0 }).get(id)!;
  for (const note of model.elements.filter((element) => isA(metamodel, element.type, notes.type))) {
    if (note.attributes[notes.resolved] === true) continue;
    const about = aboutOf(note, surface, mentions);
    if (about === undefined || !tree.byId.has(about)) continue;
    const count = at(about);
    count.open++;
    const kind = note.attributes[notes.kind];
    if (typeof kind === 'string' && !count.noteKinds.includes(kind)) count.noteKinds.push(kind);
    for (const above of tree.ancestorsOf(about)) at(above.id).within++;
  }
  const kindType = metamodel.types[notes.type]?.attributes[notes.kind]?.type;
  const values = kindType === undefined ? undefined : valueKind(metamodel, kindType);
  const iconOf = (kind: string): string | undefined => {
    const icon = values?.kind === 'enum' ? values.enum.values.find((value) => value.key === kind)?.icon : undefined;
    return typeof icon === 'string' ? icon : undefined;
  };
  return new Map([...counts].map(([id, count]) => {
    const icon = count.open === 1 ? iconOf(count.noteKinds[0]) : undefined;
    return [id, { open: count.open, noteKinds: count.noteKinds, within: count.within, ...(icon === undefined ? {} : { icon }) }];
  }));
}

// ---- gestures (DESL 8.1) ----

/**
 * A gesture of a hierarchy surface on an element of one type:
 * `addLevel` and `addEntry` make one inside it, `addLevelBelow` and `addEntryBelow` one directly
 * after it; `rename`, `describe`, `recolour` and `resize` set its name or title, its description,
 * its colour and its width from a parameter; `fold` turns its collapsed state; `move` puts it
 * elsewhere; `remove` deletes it; `addNote` makes a note about it; `change` and `resolve` edit a
 * note and turn whether it is resolved.
 */
export type ElementGesture = 'addLevel' | 'addEntry' | 'addLevelBelow' | 'addEntryBelow' | 'rename' | 'describe' | 'recolour' | 'resize' | 'fold' | 'move' | 'remove' | 'addNote' | 'change' | 'resolve';

/** A gesture on a label of a level or an entry: one of several values added or removed, the one value set or cleared. */
export type LabelGesture = 'add' | 'remove' | 'set' | 'clear';

/**
 * The operation a gesture runs, and which of its parameters plays which part: an attribute the
 * operation sets or creates from a parameter, by that attribute's name, and for a move `into` and
 * `after`, the parent and the sibling it goes after.
 */
export interface GestureOperation {
  readonly operation: string;
  readonly params: Readonly<Record<string, string>>;
}

export interface HierarchyGestures {
  /** By the type an operation for the document creates an element of, with no parent: a top level, a member of a list, a stored filter, a column width. */
  readonly adds: Readonly<Record<string, GestureOperation>>;
  /** By the type of the element a gesture is made on. */
  readonly on: Readonly<Record<string, Partial<Record<ElementGesture, GestureOperation>>>>;
  /** By label attribute. */
  readonly labels: Readonly<Record<string, Partial<Record<LabelGesture, GestureOperation>>>>;
}

/** An action as the walk over an operation's actions sees it: the action, and the names `let` bound before it, by their expressions. */
interface Seen {
  readonly action: Readonly<Record<string, unknown>>;
  readonly lets: ReadonlyMap<string, string>;
}

const source = (value: unknown): string => (typeof value === 'string' ? value.trim() : isCel(value) ? celOf(value).trim() : '');

/** Every action of a list, nested ones included, each with the `let` names bound before it. */
function walk(actions: unknown, lets: Map<string, string> = new Map()): Seen[] {
  const seen: Seen[] = [];
  for (const action of Array.isArray(actions) ? actions : []) {
    if (!isObject(action)) continue;
    if (isObject(action.let)) for (const [name, value] of Object.entries(action.let)) lets.set(name, source(value));
    seen.push({ action, lets: new Map(lets) });
    for (const nested of [action.then, action.else, action.do]) seen.push(...walk(nested, new Map(lets)));
  }
  return seen;
}

/** The parameters an expression reads, `p.<name>`, with the names it reads through a `let` followed once. */
function paramsIn(expression: string, lets: ReadonlyMap<string, string>): string[] {
  const read = (text: string): string[] => [...text.matchAll(/\bp\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]);
  const through = [...lets].filter(([name]) => new RegExp(`(^|[^.\\w])${name}\\b`).test(expression)).flatMap(([, value]) => read(value));
  return [...new Set([...read(expression), ...through])];
}

/**
 * Which operation each gesture of a hierarchy surface runs, recognised by what its actions do,
 * since DESL leaves the gestures to the specification's prose (DESL 8.1). An operation is
 * recognised by its structure alone, never by its name: one for the document that creates an
 * element of a type with no parent adds one; one for a level that creates a level or an entry in
 * `self` adds one inside it, and one that creates one in `self.parent` after `self` adds one below;
 * one that sets an attribute of `self` the surface names (title, description, colour, width, a note's
 * resolved state, the collapsed state as its negation) from a parameter or itself is that gesture;
 * one whose actions `move` or `reorder` with an `after` is a move; one that deletes `self` is a
 * removal, whatever it clears first; one that creates a note about `self.id` adds a note; one that sets a label attribute of
 * `self` by adding to it, filtering it, from a parameter, or unsets it is a label gesture. Of several
 * that fit, the first in the specification's order is taken. An operation that fits none is offered
 * in a menu only.
 */
export function gesturesOf(surface: HierarchySurface, metamodel: Metamodel, operations: readonly DesignerOperation[], declared: Readonly<Record<string, unknown>>): HierarchyGestures {
  const adds: Record<string, GestureOperation> = {};
  const on: Record<string, Partial<Record<ElementGesture, GestureOperation>>> = {};
  const labels: Record<string, Partial<Record<LabelGesture, GestureOperation>>> = {};
  const give = (type: string, gesture: ElementGesture, found: GestureOperation): void => {
    const gestures = on[type] ?? (on[type] = {});
    gestures[gesture] ??= found;
  };
  const quoted = (expression: string): string | undefined => /^'([^']*)'$/.exec(expression)?.[1] ?? /^"([^"]*)"$/.exec(expression)?.[1];
  const isSelf = (target: unknown): boolean => target === undefined || source(target) === 'self';
  const naming = (type: string): string | undefined => {
    if (type === surface.levels.type) return surface.levels.title;
    if (type === surface.entries.type) return surface.entries.title;
    if (surface.filters?.type === type) return surface.filters.name;
    return Object.values(surface.labels).find((label) => label.options.type === type)?.options.name;
  };
  const colourOf = (type: string): string | undefined => Object.values(surface.labels).find((label) => label.options.type === type)?.options.colour;
  const descriptionOf = (type: string): string | undefined => (type === surface.levels.type ? surface.levels.description : type === surface.entries.type ? surface.entries.description : undefined);

  for (const operation of operations) {
    const written = declared[operation.id];
    if (!isObject(written)) continue;
    const seen = walk(written.actions);
    const types = operation.for.filter((type) => Object.hasOwn(metamodel.types, type));
    const forDocument = operation.for.includes('document');
    /** The parameters each attribute is given from, by the expressions of a `set` or a `create`. */
    const roles = (values: unknown, lets: ReadonlyMap<string, string>): Record<string, string> => {
      const found: Record<string, string> = {};
      for (const [attribute, value] of Object.entries(isObject(values) ? values : {})) {
        const params = paramsIn(source(value), lets);
        if (params.length > 0) found[attribute] = params[0];
      }
      return found;
    };

    // Creates.
    for (const { action, lets } of seen) {
      if (!isObject(action.create)) continue;
      const created = quoted(source(action.create.type));
      if (created === undefined) continue;
      const parent = action.create.parent === undefined ? undefined : source(action.create.parent);
      const after = action.create.after === undefined ? undefined : source(action.create.after);
      const found = { operation: operation.id, params: roles(action.create.attributes, lets) };
      if (forDocument && parent === undefined) adds[created] ??= found;
      const role = isA(metamodel, created, surface.levels.type) ? 'Level' : isA(metamodel, created, surface.entries.type) ? 'Entry' : undefined;
      for (const type of types) {
        if (role !== undefined && parent === 'self' && type === surface.levels.type) give(type, `add${role}`, found);
        if (role !== undefined && parent === 'self.parent' && after === 'self') give(type, `add${role}Below`, found);
        const about = surface.notes && isObject(action.create.attributes) ? source(action.create.attributes[surface.notes.about]) : '';
        if (surface.notes && isA(metamodel, created, surface.notes.type) && about === 'self.id') give(type, 'addNote', found);
      }
    }

    // Sets of `self`, and unsets.
    for (const { action, lets } of seen) {
      if (!isSelf(action.target)) continue;
      const sets = isObject(action.set) ? action.set : {};
      for (const type of types) {
        for (const [attribute, value] of Object.entries(sets)) {
          const expression = source(value);
          const params = paramsIn(expression, lets);
          const found = (role: string): GestureOperation => ({ operation: operation.id, params: params.length > 0 ? { [role]: params[0] } : {} });
          if (surface.collapsed === attribute && expression.replace(/\s+/g, '') === `!self.${attribute}`) give(type, 'fold', found(attribute));
          if (surface.notes?.type === type && surface.notes.resolved === attribute && expression.replace(/\s+/g, '') === `!self.${attribute}`) give(type, 'resolve', found(attribute));
          if (params.length === 0) continue;
          if (naming(type) === attribute) give(type, 'rename', found(attribute));
          if (descriptionOf(type) === attribute) give(type, 'describe', found(attribute));
          if (colourOf(type) === attribute) give(type, 'recolour', found(attribute));
          if (surface.widths?.type === type && surface.widths.width === attribute) give(type, 'resize', found(attribute));
          if (surface.notes?.type === type && [surface.notes.kind, surface.notes.text, surface.notes.detail].includes(attribute)) give(type, 'change', { operation: operation.id, params: roles(sets, lets) });
          const label = surface.labels[attribute];
          if (label && label.on.includes(type)) {
            const gestures = labels[attribute] ?? (labels[attribute] = {});
            const squeezed = expression.replace(/\s+/g, '');
            if (label.many && squeezed.startsWith(`self.${attribute}+`)) gestures.add ??= found('value');
            else if (label.many && squeezed.startsWith(`self.${attribute}.filter(`)) gestures.remove ??= found('value');
            else if (!label.many) gestures.set ??= found('member');
          }
        }
      }
      if (Array.isArray(action.unset)) {
        for (const attribute of action.unset) {
          const label = typeof attribute === 'string' ? surface.labels[attribute] : undefined;
          if (label && !label.many && types.some((type) => label.on.includes(type))) (labels[attribute as string] ??= {}).clear ??= { operation: operation.id, params: {} };
        }
      }
    }

    // Moves and removals.
    const moving = seen.filter(({ action }) => isObject(action.move) || isObject(action.reorder));
    if (moving.length > 0 && moving.every(({ action }) => isSelf((isObject(action.move) ? action.move : action.reorder as Readonly<Record<string, unknown>>).target))) {
      const params: Record<string, string> = {};
      for (const { action, lets } of moving) {
        const step = (isObject(action.move) ? action.move : action.reorder) as Readonly<Record<string, unknown>>;
        const into = step.parent === undefined ? [] : paramsIn(source(step.parent), lets);
        const after = step.after === undefined ? [] : paramsIn(source(step.after), lets);
        if (into.length > 0) params.into ??= into[0];
        if (after.length > 0) params.after ??= after[0];
      }
      if (params.after !== undefined) for (const type of types) give(type, 'move', { operation: operation.id, params });
    }
    // A removal deletes `self` at the top of its actions, with whatever it clears first.
    const top = Array.isArray(written.actions) ? written.actions.filter(isObject) : [];
    if (top.some((action) => action.delete !== undefined && action.when === undefined && source(action.delete) === 'self')) for (const type of types) give(type, 'remove', { operation: operation.id, params: {} });
  }
  return { adds, on, labels };
}
