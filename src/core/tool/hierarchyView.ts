// What a designer of the `hierarchy` kind shows and what a gesture on it asks (DESL 7.7): a page of
// boxes that contain boxes, the levels and the entries of a document, with their labels, their
// notes and the stored filters, after the filter a viewer applied. A hierarchy view is plain data,
// as a table view is: it crosses to the webview as JSON, and holds nothing of a definition beyond
// the ids, the names and the values the document and the definition give, and which operation of
// the definition each gesture runs.

import type { ElementGesture, GestureOperation, HierarchyGestures as GestureMap, LabelGesture } from '../desl/hierarchy';
import { aboutOf, completionsOf, filtered, hierarchyOf, labelValues, levelWord, lowerAscii, memberName, membersOf, notesOf, sortKeysOf, sortWord } from '../desl/hierarchy';
import { mentionTemplate, segmentsOf, type Mentions, type TextPart } from '../desl/mentions';
import type { DesignerOperation, RunStep } from '../desl/operations';
import type { HierarchyLabel, HierarchySurface } from '../desl/surface';
import { attributesOf, defaultOf, isA, valueKind, type Metamodel } from '../disl/metamodel';
import type { Model, ModelElement, Value } from '../disl/model';
import { labelOf as labelOfName } from '../disl/specification';
import type { Control, Field, Severity } from '../frame/toolType';
import { operationsOf, type TableOperation, type TableValue, type ThemedColour, type ViewLogic } from './tableView';

/** A gesture on a level, an entry, a note, a member of a list, a stored filter or a column width; which operation runs it is the view's. */
export type HierarchyGesture = ElementGesture;
/** A gesture on a label of a level or an entry: a value added or removed, the one value set or cleared. */
export type HierarchyLabelGesture = LabelGesture;

/**
 * The operation a gesture runs now, and the parameters it gives which part, by the part: `value`,
 * `member`, `into`, `after`; `name` and `colour` of a new member of a list, `name` and `query` of a
 * stored filter, `kind`, `text` and `detail` of a note; or, for another gesture, the attribute's name.
 */
export interface HierarchyGestureState {
  readonly operation: string;
  /** What the operation is called for what the gesture is made on, where the definition words it so. */
  readonly label?: string;
  readonly enabled: boolean;
  /** Why it is not enabled. */
  readonly reason?: string;
  readonly params: Readonly<Record<string, string>>;
}

export type HierarchyGestures = Partial<Record<HierarchyGesture, HierarchyGestureState>>;

/** A part of a text: plain text, or a mention of a level or an entry with its title, or broken when it names nothing it may name (DESL 4.3). */
export type HierarchySegment = TextPart;

/** One value of a label a level or an entry carries, as written, with the member of the label's list it names. */
export interface HierarchyLabelValue {
  /** The label attribute. */
  readonly label: string;
  /** The id of the member it names; absent when it names none. */
  readonly member?: string;
  readonly name: string;
  /** The value of the member's colour attribute, as the document stores it; the page draws it in the theme's colour of that name. */
  readonly colourKey?: string;
  /** The colour a view logic of the tool type gives the key, where it has one. */
  readonly colour?: ThemedColour;
  /** Whether the member is implicit: a value no member of the list held (DESL 7.7.2). */
  readonly implied: boolean;
}

/** A level or an entry of the page. */
export interface HierarchyNode {
  readonly id: string;
  readonly role: 'level' | 'entry';
  readonly type: string;
  /** How deep it lies: 1 for a top level and for an entry in one. */
  readonly depth: number;
  /** The level it stands in. */
  readonly parent?: string;
  /** The id shown beside its title; absent where the surface hides ids. */
  readonly shownId?: string;
  /** Whether its id lasts for this reading only (DESL 5.3.3): a fold of it is kept for the session. */
  readonly ephemeral: boolean;
  readonly title: string;
  readonly description: readonly HierarchySegment[];
  readonly descriptionText: string;
  readonly labels: readonly HierarchyLabelValue[];
  readonly collapsed: boolean;
  /** Its open notes: how many, of which kinds, the icon of the one kind when one is open, and the open notes of what it holds. */
  readonly notes: { readonly open: number; readonly noteKinds: readonly string[]; readonly icon?: string; readonly within: number };
  /** The findings about it, counted by severity. */
  readonly findings: readonly { readonly severity: Severity; readonly count: number }[];
  /** Whether it may be given a new id: its id is held by another before it, or it has none yet. */
  readonly renumber: boolean;
  readonly gestures: HierarchyGestures;
  /** The entries it holds that the filter leaves, in its order. */
  readonly entries: readonly HierarchyNode[];
  /** The levels it holds that the filter leaves, in document order. */
  readonly levels: readonly HierarchyNode[];
}

/** A member of a label's list. */
export interface HierarchyMember {
  readonly id: string;
  readonly name: string;
  readonly colourKey?: string;
  readonly colour?: ThemedColour;
  readonly implied: boolean;
  readonly gestures: HierarchyGestures;
}

/** A label of the surface with its list (DESL 7.7.2). */
export interface HierarchyList {
  /** The label attribute. */
  readonly label: string;
  /** What a member of its list is called. */
  readonly name: string;
  /** What a filter's word for one of its members starts with. */
  readonly prefix: string;
  readonly many: boolean;
  /** The types of the levels and entries that carry it. */
  readonly on: readonly string[];
  readonly members: readonly HierarchyMember[];
  /** The values a member's colour may take, in order. */
  readonly colours: readonly { readonly key: string; readonly label: string }[];
  /** Adding, removing, setting and clearing a value of the label on a level or an entry. */
  readonly gestures: Partial<Record<HierarchyLabelGesture, HierarchyGestureState>>;
  /** Adding a member to the list. */
  readonly add?: HierarchyGestureState;
}

/** A note about a level or an entry (DESL 7.7.1). */
export interface HierarchyNote {
  readonly id: string;
  readonly kind: string;
  readonly kindLabel: string;
  readonly icon?: string;
  /** What it is about, as written. */
  readonly about: string;
  /** The level or entry it is about; absent when it names none. */
  readonly aboutId?: string;
  readonly text: readonly HierarchySegment[];
  readonly textRaw: string;
  readonly detail: readonly HierarchySegment[];
  readonly detailRaw: string;
  readonly resolved: boolean;
  readonly gestures: HierarchyGestures;
}

/** What a mention picked for a text is written as: the literal text before and after the id, and the types of what it may name. */
export interface HierarchyMentionTemplate {
  readonly before: string;
  readonly after: string;
  readonly types: readonly string[];
}

/** What a page of boxes draws. */
export interface HierarchyView {
  readonly name: string;
  readonly ids: 'shown' | 'hidden';
  /** The type of the levels and the type of the entries, which a toolbox entry is named by. */
  readonly roles: { readonly level: string; readonly entry: string };
  /** What a mention picked in the description of a level or an entry is written as, by the type of the level or entry; absent where its description holds none (DESL 4.3). */
  readonly mentions: Readonly<Record<string, HierarchyMentionTemplate>>;
  /** The words of a filter that are no label's: the one that selects levels by their title and the one that sorts (DESL 7.7.3). */
  readonly queryWords: { readonly level: string; readonly sort: string };
  /** True when nothing that edits may be offered. */
  readonly readOnly: boolean;
  /** Why the page is read-only or empty, when there is something to say. */
  readonly notice?: string;
  /** The top levels the filter leaves, in document order. */
  readonly roots: readonly HierarchyNode[];
  /** Levels and entries that stand in no level, which a page shows apart. */
  readonly stray: readonly HierarchyNode[];
  readonly lists: readonly HierarchyList[];
  readonly notes: readonly HierarchyNote[];
  /** The kinds a note may be of, in order. */
  readonly noteKinds: readonly { readonly key: string; readonly label: string; readonly icon?: string }[];
  readonly filters: readonly { readonly id: string; readonly name: string; readonly query: string; readonly gestures: HierarchyGestures }[];
  /** The filter a viewer applied, with how many levels and entries it leaves of how many. */
  readonly applied?: { readonly query: string; readonly shown: number; readonly total: number };
  /** The words the filter field offers for the last word of the applied filter (DESL 7.7.3). */
  readonly completions: readonly string[];
  readonly sortKeys: readonly string[];
  /** The widths the document keeps of the columns of levels, by depth. */
  readonly widths: readonly { readonly id: string; readonly level: string; readonly width: number; readonly gestures: HierarchyGestures }[];
  /** The narrowest and the widest a column may be, from the facets of the width attribute. */
  readonly widthRange?: { readonly min?: number; readonly max?: number };
  /** The gestures of the page itself: a top level added, the applied filter stored, a column's width kept. */
  readonly pageGestures: { readonly addLevel?: HierarchyGestureState; readonly addFilter?: HierarchyGestureState; readonly addWidth?: HierarchyGestureState };
  /** The level a viewer narrowed the page to. */
  readonly focus?: string;
  /** Everything reading the document found, each about the level or entry it is about where it is one. */
  readonly findings: readonly { readonly rule: string; readonly severity: Severity; readonly message: string; readonly line: number; readonly node?: string }[];
  /** Every operation of the definition, by its id. Which are offered now is in the frame's actions, by the same id. */
  readonly operations: Readonly<Record<string, TableOperation>>;
}

/** Every gesture a page of boxes, the toolbox or the property grid can ask of a designer of the `hierarchy` kind. */
export type HierarchyRequest =
  /** An operation of the definition run on what is selected, or on the document when nothing is, with its arguments. */
  | { readonly kind: 'operation'; readonly operation: string; readonly on?: readonly string[]; readonly args?: Readonly<Record<string, TableValue>> }
  /** A level or an entry whose id another holds before it, or that has none yet, given a new one. */
  | { readonly kind: 'renumber'; readonly id: string }
  /**
   * A toolbox entry dropped into a level, or at the top for none, after a sibling there, where the
   * definition puts a new one when `after` is absent, or first among its kind there when it is empty.
   */
  | { readonly kind: 'drop'; readonly entry: string; readonly parent?: string; readonly after?: string }
  /** A row of ADP Properties of a level or an entry edited. */
  | { readonly kind: 'setField'; readonly id: string; readonly field: string; readonly value: string };

// ---- the view of a model ----

/** What a hierarchy view is made of. */
export interface HierarchyParts {
  readonly surface: HierarchySurface;
  readonly metamodel: Metamodel;
  readonly operations: readonly DesignerOperation[];
  readonly gestures: GestureMap;
  readonly mentions: Mentions;
  readonly logic?: ViewLogic;
  readonly locale?: string;
}

/** A finding as the view is given it: the frame's, with the element it is about. */
export interface NodeFinding {
  readonly rule: string;
  readonly severity: Severity;
  readonly message: string;
  readonly line: number;
  readonly element?: string;
}

/** What the view of one document is made of beside its model. */
export interface HierarchyState {
  readonly name: string;
  readonly readOnly: boolean;
  readonly notice?: string;
  readonly findings: readonly NodeFinding[];
  /** The ids of the implicit members of the lists (DESL 7.7.2). */
  readonly implied: ReadonlySet<string>;
  /** The ids that may be given a new one. */
  readonly renumbered: ReadonlySet<string>;
  /** The folds this viewer keeps for the session, by id: each counts only while the element's id is ephemeral, after which the registration decides (DESL 5.3.3). */
  readonly collapsed?: Readonly<Record<string, boolean>>;
  readonly query?: string;
  readonly focus?: string;
  /** Whether an operation is offered for a selection, can run now, and why not. */
  availability(operation: string, on: readonly string[]): { readonly offered: boolean; readonly available: boolean; readonly reason?: string; readonly label?: string };
}

const NOT_CHANGED = 'No operation of this tool changes it.';
const ID_KEPT = 'An id is given by the document, and is not changed here.';

const textOf = (value: Value | undefined): string => (typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value));

/** What reads a model as a page of boxes: the view, the rows of ADP Properties of a level or an entry, and the operations a row's edit runs. */
export function hierarchyReader(parts: HierarchyParts) {
  const { surface, metamodel, gestures, mentions, logic } = parts;
  const locale = parts.locale ?? 'en';
  const labels = Object.values(surface.labels);
  const roleOf = (type: string): HierarchyNode['role'] | undefined => (type === surface.levels.type ? 'level' : type === surface.entries.type ? 'entry' : undefined);
  const membersOfRole = (type: string) => (type === surface.levels.type ? surface.levels : surface.entries);
  const titleOf = (element: ModelElement): string => textOf(element.attributes[membersOfRole(element.type).title]);

  /** How an element is named in a list: its title, else its label attribute, else its id. */
  const nameOf = (_model: Model, element: ModelElement): string => {
    if (roleOf(element.type)) return titleOf(element) || element.id;
    const named = metamodel.types[element.type]?.labelAttribute;
    return named !== undefined && typeof element.attributes[named] === 'string' ? element.attributes[named] : element.id;
  };

  const colourKeyOf = (member: ModelElement, label: HierarchyLabel): string | undefined => {
    const attribute = label.options.colour;
    if (attribute === undefined) return undefined;
    const declared = attributesOf(metamodel, member.type)[attribute];
    const value = member.attributes[attribute] ?? (declared === undefined ? undefined : defaultOf(declared));
    return typeof value === 'string' ? value : undefined;
  };
  const coloured = (key: string | undefined): { readonly colourKey?: string; readonly colour?: ThemedColour } => {
    const colour = key === undefined ? undefined : logic?.colour?.(key);
    return { ...(key === undefined ? {} : { colourKey: key }), ...(colour === undefined ? {} : { colour }) };
  };

  /** The text of an attribute as parts, its mentions with what they name. */
  const segments = (model: Model, element: ModelElement, attribute: string): HierarchySegment[] => {
    const text = textOf(element.attributes[attribute]);
    const facet = mentions.of(element.type, attribute);
    if (!facet) return text === '' ? [] : [{ text }];
    return segmentsOf(text, facet, model, metamodel, (named) => (roleOf(named.type) ? titleOf(named) : undefined));
  };

  /** A gesture as it stands now for what it is made on. */
  const stateOf = (state: HierarchyState, found: GestureOperation | undefined, on: readonly string[]): HierarchyGestureState | undefined => {
    if (!found) return undefined;
    const now = state.availability(found.operation, on);
    if (!now.offered) return undefined;
    const enabled = now.available && !state.readOnly;
    const reason = state.readOnly ? state.notice : now.reason;
    return { operation: found.operation, ...(now.label === undefined ? {} : { label: now.label }), enabled, ...(enabled || reason === undefined ? {} : { reason }), params: found.params };
  };
  /** The parameters of a gesture by the part each plays rather than by the attribute it sets: a page knows the parts, not the attributes. */
  const byPart = (found: HierarchyGestureState | undefined, parts: Readonly<Record<string, string>>): HierarchyGestureState | undefined =>
    found && { ...found, params: Object.fromEntries(Object.entries(found.params).map(([attribute, param]) => [parts[attribute] ?? attribute, param])) };
  const noteParts: Readonly<Record<string, string>> = surface.notes === undefined ? {} : { [surface.notes.kind]: 'kind', [surface.notes.text]: 'text', [surface.notes.detail]: 'detail' };
  const gesturesOf = (state: HierarchyState, element: ModelElement): HierarchyGestures => {
    const found: Partial<Record<HierarchyGesture, HierarchyGestureState>> = {};
    for (const [gesture, operation] of Object.entries(gestures.on[element.type] ?? {}) as [HierarchyGesture, GestureOperation][]) {
      const now = stateOf(state, operation, [element.id]);
      if (now) found[gesture] = gesture === 'addNote' || gesture === 'change' ? byPart(now, noteParts) : now;
    }
    return found;
  };

  /** What a mention picked in a description is written as, by the type of the level or entry that holds it. */
  const templates: Record<string, HierarchyMentionTemplate> = {};
  for (const role of [surface.levels, surface.entries]) {
    const facet = mentions.of(role.type, role.description);
    const template = facet && mentionTemplate(facet.pattern);
    if (facet && template) templates[role.type] = { ...template, types: facet.types };
  }

  /** The member of a label's list a value names, its name compared ignoring case (DESL 7.7.2). */
  const memberOf = (model: Model, label: HierarchyLabel, value: string): ModelElement | undefined =>
    membersOf(model, label).find((member) => lowerAscii(memberName(member, label)) === lowerAscii(value));

  /** The view of a model: its levels and entries the applied filter leaves, its lists, notes, stored filters and widths. */
  function view(model: Model, state: HierarchyState): HierarchyView {
    const tree = hierarchyOf(model, surface);
    const query = state.query ?? '';
    const shown = filtered(model, surface, query, tree);
    const counts = notesOf(model, surface, metamodel, mentions, tree);
    const bySeverity = new Map<string, Map<Severity, number>>();
    for (const found of state.findings) {
      if (found.element === undefined || !tree.byId.has(found.element)) continue;
      const counted = bySeverity.get(found.element) ?? new Map<Severity, number>();
      counted.set(found.severity, (counted.get(found.severity) ?? 0) + 1);
      bySeverity.set(found.element, counted);
    }

    const nodeOf = (element: ModelElement, depth: number, parent: string | undefined): HierarchyNode => {
      const role = roleOf(element.type)!;
      const notes = counts.get(element.id);
      const valued = labels.filter((label) => label.on.includes(element.type)).flatMap((label) => labelValues(element, label.attribute).map((value): HierarchyLabelValue => {
        const member = memberOf(model, label, value);
        return { label: label.attribute, name: value, ...(member ? { member: member.id, ...coloured(colourKeyOf(member, label)) } : {}), implied: member !== undefined && state.implied.has(member.id) };
      }));
      const kept = surface.collapsed === undefined ? false : element.attributes[surface.collapsed] === true;
      const levels = role === 'level' ? tree.levelsOf(element.id).filter((level) => shown.shown.has(level.id)) : [];
      const entries = role === 'level' ? shown.entriesOf(element.id) : [];
      return {
        id: element.id, role, type: element.type, depth, ...(parent === undefined ? {} : { parent }),
        ...(surface.ids === 'shown' ? { shownId: element.id } : {}), ephemeral: element.ephemeral,
        title: titleOf(element),
        description: segments(model, element, membersOfRole(element.type).description), descriptionText: textOf(element.attributes[membersOfRole(element.type).description]),
        labels: valued,
        collapsed: (element.ephemeral ? state.collapsed?.[element.id] : undefined) ?? kept,
        notes: { open: notes?.open ?? 0, noteKinds: notes?.noteKinds ?? [], ...(notes?.icon === undefined ? {} : { icon: notes.icon }), within: notes?.within ?? 0 },
        findings: [...(bySeverity.get(element.id) ?? new Map<Severity, number>())].map(([severity, count]) => ({ severity, count })),
        renumber: state.renumbered.has(element.id),
        gestures: gesturesOf(state, element),
        entries: entries.map((entry) => nodeOf(entry, depth, element.id)),
        levels: levels.map((level) => nodeOf(level, depth + 1, element.id)),
      };
    };

    const enumOf = (type: string, attribute: string | undefined) => {
      const declared = attribute === undefined ? undefined : attributesOf(metamodel, type)[attribute];
      const kind = declared === undefined ? undefined : valueKind(metamodel, declared.type);
      return kind?.kind === 'enum' ? kind.enum.values : [];
    };
    const iconOf = (icon: unknown): { readonly icon?: string } => (typeof icon === 'string' ? { icon } : {});

    const lists = labels.map((label): HierarchyList => {
      const labelGestures: Partial<Record<HierarchyLabelGesture, HierarchyGestureState>> = {};
      for (const [gesture, found] of Object.entries(gestures.labels[label.attribute] ?? {}) as [HierarchyLabelGesture, GestureOperation][]) {
        // A label's gesture is offered on a level or an entry, so it is shown by what it is, not by a selection.
        labelGestures[gesture] = { operation: found.operation, enabled: !state.readOnly, ...(state.readOnly && state.notice !== undefined ? { reason: state.notice } : {}), params: found.params };
      }
      const add = byPart(stateOf(state, gestures.adds[label.options.type], []), { [label.options.name]: 'name', ...(label.options.colour === undefined ? {} : { [label.options.colour]: 'colour' }) });
      return {
        label: label.attribute, name: metamodel.types[label.options.type]?.label ?? label.options.type, prefix: label.prefix, many: label.many, on: label.on,
        members: membersOf(model, label).map((member) => ({ id: member.id, name: memberName(member, label), ...coloured(colourKeyOf(member, label)), implied: state.implied.has(member.id), gestures: gesturesOf(state, member) })),
        colours: enumOf(label.options.type, label.options.colour).map((value) => ({ key: value.key, label: value.label })),
        gestures: labelGestures,
        ...(add ? { add } : {}),
      };
    });

    const notesPart = surface.notes;
    const notes = notesPart === undefined ? [] : model.elements.filter((element) => isA(metamodel, element.type, notesPart.type)).map((note): HierarchyNote => {
      const kind = textOf(note.attributes[notesPart.kind]);
      const value = enumOf(note.type, notesPart.kind).find((candidate) => candidate.key === kind);
      const about = aboutOf(note, surface, mentions);
      return {
        id: note.id, kind, kindLabel: value?.label ?? kind, ...iconOf(value?.icon),
        about: textOf(note.attributes[notesPart.about]), ...(about !== undefined && tree.byId.has(about) ? { aboutId: about } : {}),
        text: segments(model, note, notesPart.text), textRaw: textOf(note.attributes[notesPart.text]),
        detail: segments(model, note, notesPart.detail), detailRaw: textOf(note.attributes[notesPart.detail]),
        resolved: note.attributes[notesPart.resolved] === true,
        gestures: gesturesOf(state, note),
      };
    });

    const filtersPart = surface.filters;
    const widthsPart = surface.widths;
    const widthAttribute = widthsPart === undefined ? undefined : attributesOf(metamodel, widthsPart.type)[widthsPart.width];
    const words = query.split(/\s+/);
    const addLevel = stateOf(state, gestures.adds[surface.levels.type], []);
    const addFilter = filtersPart === undefined ? undefined : byPart(stateOf(state, gestures.adds[filtersPart.type], []), { [filtersPart.name]: 'name', [filtersPart.query]: 'query' });
    const addWidth = widthsPart === undefined ? undefined : stateOf(state, gestures.adds[widthsPart.type], []);
    const inTree = (id: string | undefined): id is string => id !== undefined && tree.byId.has(id);
    const noteKindsAt = notesPart === undefined ? [] : enumOf(notesPart.type, notesPart.kind);
    const range = widthAttribute === undefined ? undefined : { ...(typeof widthAttribute.min === 'number' ? { min: widthAttribute.min } : {}), ...(typeof widthAttribute.max === 'number' ? { max: widthAttribute.max } : {}) };
    return {
      name: state.name, ids: surface.ids, readOnly: state.readOnly, ...(state.notice === undefined ? {} : { notice: state.notice }),
      roles: { level: surface.levels.type, entry: surface.entries.type }, mentions: templates, queryWords: { level: levelWord, sort: sortWord },
      roots: tree.roots.filter((level) => shown.shown.has(level.id)).map((level) => nodeOf(level, 1, undefined)),
      stray: tree.stray.filter((element) => shown.shown.has(element.id)).map((element) => nodeOf(element, 1, undefined)),
      lists, notes,
      noteKinds: noteKindsAt.map((value) => ({ key: value.key, label: value.label, ...iconOf(value.icon) })),
      filters: filtersPart === undefined ? [] : model.elements.filter((element) => element.type === filtersPart.type)
        .map((element) => ({ id: element.id, name: textOf(element.attributes[filtersPart.name]), query: textOf(element.attributes[filtersPart.query]), gestures: gesturesOf(state, element) })),
      ...(query.trim() === '' ? {} : { applied: { query, shown: shown.count, total: shown.total } }),
      completions: completionsOf(words[words.length - 1] ?? '', model, surface).map((completion) => completion.word),
      sortKeys: sortKeysOf(surface),
      widths: widthsPart === undefined ? [] : model.elements.filter((element) => element.type === widthsPart.type).map((element) => {
        const width = element.attributes[widthsPart.width];
        return { id: element.id, level: textOf(element.attributes[widthsPart.level]), width: typeof width === 'number' ? width : 0, gestures: gesturesOf(state, element) };
      }),
      ...(range === undefined ? {} : { widthRange: range }),
      pageGestures: { ...(addLevel ? { addLevel } : {}), ...(addFilter ? { addFilter } : {}), ...(addWidth ? { addWidth } : {}) },
      ...(state.focus === undefined ? {} : { focus: state.focus }),
      findings: state.findings.map((found) => ({ rule: found.rule, severity: found.severity, message: found.message, line: found.line, ...(inTree(found.element) ? { node: found.element } : {}) })),
      operations: operationsOf(model, metamodel, parts.operations, locale, nameOf),
    };
  }

  // ---- ADP Properties ----

  /** The rows of ADP Properties a level or an entry has, by what each edits: its id, its title, its description, and each label it may carry. */
  function rowsOf(type: string): { readonly id: string; readonly attribute?: string; readonly label?: HierarchyLabel }[] {
    const role = membersOfRole(type);
    return [{ id: 'id' }, { id: role.title, attribute: role.title }, { id: role.description, attribute: role.description }, ...labels.filter((label) => label.on.includes(type)).map((label) => ({ id: label.attribute, attribute: label.attribute, label }))];
  }

  /** The rows of ADP Properties of one level or entry. Each row an operation of the definition changes is edited; another is shown with the reason. */
  function fields(model: Model, id: string, refusal: string | undefined): Field[] {
    const element = model.elements.find((candidate) => candidate.id === id);
    if (!element || !roleOf(element.type)) return [];
    const on = gestures.on[element.type] ?? {};
    const role = membersOfRole(element.type);
    return rowsOf(element.type).map((row): Field => {
      const name = row.attribute === undefined ? 'Id' : labelOfName(row.attribute);
      if (row.attribute === undefined) return { id: row.id, label: name, group: '', control: 'text', value: element.id, readOnly: ID_KEPT };
      const label = row.label;
      let control: Control = 'text';
      let options: string[] | undefined;
      let changed = false;
      if (label) {
        const names = membersOf(model, label).map((member) => memberName(member, label));
        control = label.many ? 'tags' : 'choice';
        options = label.many ? names : ['', ...names];
        const found = gestures.labels[label.attribute] ?? {};
        changed = label.many ? found.add !== undefined && found.remove !== undefined : found.set !== undefined;
      } else if (row.attribute === role.title) changed = on.rename !== undefined;
      else {
        control = 'multiline';
        changed = on.describe !== undefined;
      }
      const readOnly = refusal ?? (changed ? undefined : NOT_CHANGED);
      return {
        id: row.id, label: name, group: '', control, value: label ? labelValues(element, label.attribute).join(', ') : textOf(element.attributes[row.attribute]),
        ...(options === undefined ? {} : { options }), ...(readOnly === undefined ? {} : { readOnly }),
      };
    });
  }

  /**
   * The operations an edit of a row of ADP Properties runs, as one transaction: the title and the
   * description set by the operations that set them; a label of several values each value that is
   * new added and each one that is gone removed; a label of one value set to the member it names,
   * or cleared. A row no operation changes, a value that names no member of a one-valued label's
   * list, and nothing that changes, are said so.
   */
  function fieldSteps(model: Model, id: string, field: string, text: string): readonly RunStep[] | { readonly refused: string } {
    const element = model.elements.find((candidate) => candidate.id === id);
    if (!element || !roleOf(element.type)) return { refused: 'That entry is no longer in this file.' };
    const row = rowsOf(element.type).find((candidate) => candidate.id === field);
    if (!row) return { refused: 'This value cannot be changed here.' };
    if (row.attribute === undefined) return { refused: ID_KEPT };
    const on = gestures.on[element.type] ?? {};
    const role = membersOfRole(element.type);
    const one = (found: GestureOperation | undefined, part: string, value: Value): readonly RunStep[] | { readonly refused: string } =>
      (found ? [{ operation: found.operation, on: [id], args: found.params[part] === undefined ? {} : { [found.params[part]]: value } }] : { refused: NOT_CHANGED });
    const label = row.label;
    if (!label) return row.attribute === role.title ? one(on.rename, row.attribute, text) : one(on.describe, row.attribute, text);
    const found = gestures.labels[label.attribute] ?? {};
    if (!label.many) {
      const typed = text.trim();
      if (typed === '') return found.clear ? [{ operation: found.clear.operation, on: [id] }] : { refused: NOT_CHANGED };
      const member = memberOf(model, label, typed);
      if (!member) return { refused: `'${typed}' is not one of ${membersOf(model, label).map((candidate) => memberName(candidate, label)).join(', ')}.` };
      return one(found.set, 'member', member.id);
    }
    if (!found.add || !found.remove) return { refused: NOT_CHANGED };
    const held = labelValues(element, label.attribute);
    const given = text.split(/[,\s]+/).map((part) => part.trim()).filter((part) => part !== '');
    const has = (values: readonly string[], value: string): boolean => values.some((candidate) => lowerAscii(candidate) === lowerAscii(value));
    const named = (gesture: GestureOperation, value: string): RunStep => ({ operation: gesture.operation, on: [id], args: gesture.params.value === undefined ? {} : { [gesture.params.value]: value } });
    return [
      ...held.filter((value) => !has(given, value)).map((value) => named(found.remove!, value)),
      ...given.filter((value, index) => !has(held, value) && given.findIndex((other) => lowerAscii(other) === lowerAscii(value)) === index).map((value) => named(found.add!, value)),
    ];
  }

  return { view, fields, fieldSteps, roleOf };
}
