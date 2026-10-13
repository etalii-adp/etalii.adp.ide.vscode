// The behavior of a specification (DISL 9), and with it every way a user changes a model: an
// intent (a tool used at a place, two elements connected, a value entered, an element moved, a
// selection removed, an operation run) becomes one ordered list of changes with the model as it
// would be afterwards, or the sentence of a refusal. One intent is one transaction (DISL 14.4):
// the gesture's constraints, the change, the hooks, the neighbour bounds, then the invariants.
//
// What is built: `messages`, `reasons`, `editGate`, hooks (`on`, `for`, `attribute`, `when`,
// `phase`, `order`, `maxHookDepth`), operations (`for`, `enabled`, `unavailable`, `confirm`,
// `actions`), `deletion` (`relations`, `children`, `references: "unset"`, `confirm`), the actions
// `set`, `unset`, `create`, `connect`, `delete`, `let`, `if`, `forEach`, `layout` (the `rows`
// algorithm), `abort`, `call`, and those that only ask the host for something (`select`, `reveal`,
// `highlight`, `editLabel`, `openForm`, `notify`, `open`), the `view` action for a viewer's folds
// and for the view data that is stored (a pin, the state of a group, a kept filter), a `create`
// placed `after` or `before` a sibling, a node moved under another parent, the standard entries
// `pin`, `unpin`, `unpinAll` and `create-child`, and the gestures on a derived relation that its
// `edits` map to an operation. The `clipboard` is read and kept, and nothing is done with it. Parent
// placements, retyping and simulations are not read, and an action of another kind is reported and skipped.

import type { Constraints, Gesture } from './constraints';
import { monthsIn, scalesOf, unitOf, type Axis, type Coordinates, type CoordinateSystem, type Placement, type PlacementSource, type SnapRule, type Snapping } from './coordinates';
import type { Expressions, Scope, World } from './expressions';
import { createTexts, type FormItem } from './forms';
import type { Layout, LayoutConfig } from './layout';
import { attributesOf, defaultOf, defaultsOf, derivedRelations, formatMoment, isA, isRelation, linkKind, parseYearMonth, valueKind, type DerivedRelation, type Metamodel } from './metamodel';
import { finding, type Attributes, type Finding, type Loaded, type Model, type ModelElement, type ModelRelation, type Value } from './model';
import { edgeNotation, interpretNotation, nodeNotation, type EndAnchor, type Label, type Notation } from './notation';
import { foldsOf, newId, type InterpretedPersistence, type StoredView } from './persistence';
import { isCel, isObject, labelOf, localized, type Attribute, type CelValue, type Doc, type Expression, type Message, type NeighbourBounds, type Reason, type Specification } from './specification';
import { setsFor, type ContextSet, type Toolbox } from './toolbox';
import type { Viewpoints } from './viewpoints';

// ---- as the schema has them ----

/** `$defs/Hook` (DISL 9.2). */
export interface HookDeclaration {
  readonly id: string;
  readonly on: string | readonly string[];
  readonly for?: string | readonly string[];
  readonly attribute?: string | readonly string[];
  readonly when?: Expression;
  readonly actions: readonly unknown[];
  readonly phase?: 'before' | 'after';
  readonly order?: number;
  readonly doc?: Doc;
}

/** `$defs/Confirmation` (DISL 9.5). */
export interface Confirmation {
  readonly message: Message;
  readonly title?: Message;
  readonly confirmLabel?: Message;
  readonly cancelLabel?: Message;
  readonly danger?: boolean;
  readonly when?: Expression;
  readonly count?: Expression;
  readonly threshold?: number;
}

/** `$defs/Operation` (DISL 9.3). */
export interface OperationDeclaration {
  readonly label?: Message;
  readonly icon?: unknown;
  readonly shortcut?: string;
  readonly for?: string | readonly string[];
  readonly enabled?: Expression;
  readonly unavailable?: readonly Reason[];
  readonly confirm?: Message | Confirmation;
  readonly actions?: readonly unknown[];
  readonly params?: Readonly<Record<string, unknown>>;
  /** A plugin that is the operation (DISL 13.1): its name, or an object with its `name`. */
  readonly plugin?: unknown;
  readonly doc?: Doc;
}

/** `behavior.clipboard` (DISL 9.5), as it is written. */
export interface Clipboard {
  readonly relations?: 'internal' | 'all' | 'none';
  readonly ids?: 'regenerate';
  readonly names?: 'keep' | 'suffix';
  readonly [name: string]: unknown;
}

/** `$defs/DeletionPolicy` (DISL 9.5). */
export interface DeletionPolicy {
  readonly children?: 'delete' | 'reparent' | 'forbid';
  readonly relations?: 'delete' | 'forbid' | 'reconnect';
  readonly references?: 'unset' | 'delete-referencing' | 'forbid';
  readonly confirm?: Message | Confirmation;
}

/** `$defs/Behavior` (DISL 9.1), as far as it is read. */
export interface BehaviorSection {
  readonly hooks?: readonly HookDeclaration[];
  readonly operations?: Readonly<Record<string, OperationDeclaration>>;
  readonly deletion?: Readonly<Record<string, DeletionPolicy>>;
  readonly clipboard?: Clipboard;
  readonly maxHookDepth?: number;
  readonly editGate?: readonly Reason[];
  readonly messages?: Readonly<Record<string, Message>>;
  readonly doc?: Doc;
}

// ---- what an intent gives ----

/**
 * One change to a model, at the metamodel's level: the types, the attribute names and the values
 * are the metamodel's (`Value`: an integer and a `yearMonth` are numbers, an enum value is its key).
 *
 * - `add`: a new element, or a new relation when it has `source` and `target` (the ids of its ends).
 *   `attributes` holds every value it starts with, the consequences of hooks included.
 * - `set`: values of attributes of one element or relation; null empties an attribute. The id `''`
 *   is the diagram itself.
 * - `remove`: an element or a relation. What goes with it is in the list as changes of its own, before it.
 * - `move`: an element, with what it holds, under another parent (the top level without one), at a
 *   place among that parent's children: after the last without a `position`. An index counts the
 *   children without the element itself.
 *
 * The `position` of an `add` is the sibling it goes directly after or before; without one it goes after the last.
 * Its `slot` is the named place of its parent it is kept in, where the parent holds several kinds apart.
 */
export type Change =
  | { readonly kind: 'add'; readonly id: string; readonly type: string; readonly attributes: Attributes; readonly source?: string; readonly target?: string; readonly parent?: string; readonly slot?: string; readonly position?: Beside }
  | { readonly kind: 'set'; readonly id: string; readonly attributes: Readonly<Record<string, Value | null>> }
  | { readonly kind: 'remove'; readonly id: string }
  | { readonly kind: 'move'; readonly id: string; readonly parent?: string; readonly position?: Beside | { readonly index: number } };

/** A place next to a sibling, by the sibling's id. */
export type Beside = { readonly after: string } | { readonly before: string };

/** What an action asks of the host beside the change: nothing of it is part of the model. `open` carries the link in `message`. */
export interface Effect {
  readonly kind: 'select' | 'editLabel' | 'openForm' | 'reveal' | 'highlight' | 'notify' | 'open';
  readonly elements: readonly string[];
  readonly message?: string;
}

/**
 * One change to the view data that is stored with the diagram (DISL 11.6): no change of the model,
 * and an edit all the same, which is written and undone with the intent it belongs to.
 *
 * - `pin`: an element is kept at a position, in the coordinates of its placement.
 * - `unpin`: its pin and its stored position go, and the layout places it again.
 * - `group`: the state of a group of an element's items, by the group's key; null where the state
 *   is the group's default again, which is not stored.
 * - `filter`: the value of a kept filter; null where it is the filter's default again.
 */
export type ViewChange =
  | { readonly kind: 'pin'; readonly element: string; readonly x: number; readonly y: number }
  | { readonly kind: 'unpin'; readonly element: string }
  | { readonly kind: 'group'; readonly element: string; readonly group: string; readonly collapsed: boolean | null }
  | { readonly kind: 'filter'; readonly id: string; readonly value: Value | null };

/**
 * What one intent comes to: the changes in order and the model after them, or the sentence that
 * refuses it. `collapsed` holds the folds the intent changed for this viewer, by element: viewer
 * state, which is no change of the model (DISL 11.6). `view` holds what it changed of the stored view data.
 */
export type Outcome =
  | {
    readonly changes: readonly Change[]; readonly after: Model; readonly created: readonly string[]; readonly effects: readonly Effect[];
    readonly collapsed: Readonly<Record<string, boolean>>; readonly view: readonly ViewChange[]; readonly refused?: undefined;
  }
  | { readonly refused: string };

/** Where an intent takes place: the members of `env` (DISL 12.2), of which `viewpoint` and `readOnly` are read here, and what is kept of the view. */
export interface Situation {
  readonly env?: Scope;
  /** The folds this viewer holds, by element (DISL 11.6). An element that is not named is as `persistence.view.initial` says. */
  readonly collapsed?: Readonly<Record<string, boolean>>;
  /** The view data stored with the diagram: what is pinned, the groups that are not at their default, and the kept filters. */
  readonly view?: StoredView;
  /** Where a node is drawn now, as the point its placement names: what pinning it, or dragging it, starts from. */
  at?(id: string): Point | undefined;
}

/** A point of the canvas, in canvas units at zoom 1, in the coordinate system of the viewpoint. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Where an end of a relation attaches: the part of the element, the side of that part, and how far along it (DISL 6.10). */
export interface EndPlace {
  readonly part?: string;
  readonly side?: string;
  readonly at?: number;
}

export interface Question {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly danger: boolean;
}

export interface Operation {
  readonly id: string;
  readonly label: Message;
  readonly icon?: string;
  readonly doc?: string;
  /** Types of the metamodel, `diagram` or `selection`. */
  readonly for: readonly string[];
  /** Its own shortcut, and those of the tools and context entries that run it. */
  readonly keys: readonly string[];
  /** The plugin that is the operation, by its id: the host runs it. */
  readonly plugin?: string;
  /**
   * For an operation with one parameter whose first action sets an attribute to it: that attribute,
   * which is where a host without a dialog asks the value, and the parameter the value is given as.
   */
  readonly asks?: string;
  readonly param?: string;
  /** Whether one of its actions opens a link (DISL 9.4, `open`). */
  readonly opens: boolean;
  /** Whether it changes nothing of the model: viewer state, the selection, a link opened. It is then no edit, and is run in a read-only document too. */
  readonly viewOnly: boolean;
}

export interface Availability {
  /** Whether the operation applies to the selection at all; one that does not is not shown. */
  readonly offered: boolean;
  /** Whether it can run now; one that cannot is shown disabled, with `reason` when there is one. */
  readonly available: boolean;
  readonly reason?: string;
  readonly label: string;
  /** The element it runs on; absent when it runs on the diagram or on the selection. */
  readonly target?: string;
  /** The question to ask before it runs. */
  readonly confirm?: Question;
}

export interface OfferedEntry {
  readonly kind: string;
  readonly label: string;
  readonly icon?: string;
  readonly shortcut?: string;
  readonly operation?: string;
  readonly creates?: string;
  readonly via?: string;
  readonly enabled: boolean;
  /** Why it is not enabled. */
  readonly reason?: string;
}

/** The host's own sentences for pinning, where a definition has no words for them. */
const NOTHING_PINNED = 'No position is locked.';
const NOT_PINNED = 'Its position is not locked.';
const NOT_KEPT = 'This is not kept with the diagram, so it cannot be changed here.';

/** A pending connection (DISL 7.3): a connect gesture that ended on an element. */
export interface Pending {
  readonly source: string;
  readonly target: string;
}

export interface Behavior {
  /** The sentences the specification gives in place of the host's own, by their standard id (DISL 9.1). */
  readonly messages: Readonly<Record<string, Message>>;
  /** One of them as text, or nothing when the specification does not give it. */
  message(id: string, model: Model, situation?: Situation, more?: Scope): string | undefined;
  readonly operations: readonly Operation[];
  /** `behavior.clipboard` as it is written, when it is. Nothing is done with it here. */
  readonly clipboard?: Clipboard;
  availability(model: Model, operation: string, selection: readonly string[], situation?: Situation): Availability;
  /**
   * The entries offered on a target, in groups that are shown apart: an element, the empty canvas
   * (no target) or a pending connection. `sets` are the context menus unless the context tools are given.
   */
  menu(model: Model, target: string | Pending | undefined, situation?: Situation, sets?: readonly ContextSet[]): { readonly groups: readonly (readonly OfferedEntry[])[]; readonly standardEntries: boolean; readonly runSingle: boolean };
  /** What removing a selection takes with it, and the question to ask first when there is one. */
  deletion(model: Model, selection: readonly string[], situation?: Situation): { readonly removes: readonly string[]; readonly confirm?: Question; readonly refused?: string };

  /** A tool used at a point: the element it creates there, or the operation it runs, on the element the point is on when one is given. */
  create(model: Model, tool: string, at: Point, situation?: Situation, on?: string): Outcome;
  /** A relation of a type drawn from one element to another; an end that is not given attaches where the notation's default says. */
  connect(model: Model, type: string, source: string, target: string, ends?: { readonly source?: EndPlace; readonly target?: EndPlace }, situation?: Situation): Outcome;
  /** Attributes of an element (the diagram when none is named) set to values; null empties one. */
  change(model: Model, element: string | undefined, values: Readonly<Record<string, Value | null>>, situation?: Situation): Outcome;
  /** A value entered in an item of a form: a text, or what the item's widget gives. */
  edit(model: Model, element: string | undefined, item: FormItem, input: Value, situation?: Situation): Outcome;
  /** A label edited in place: the text goes through the label's `parse`, else to the attribute it shows. The first editable label when none is named. */
  editLabel(model: Model, element: string, text: string, situation?: Situation, label?: string): Outcome;
  /** Elements dragged by a distance in canvas units; each lands where the snapping of a move puts it. */
  move(model: Model, elements: readonly string[], by: Point, situation?: Situation): Outcome;
  /** Edges of an element dragged, each by a distance in canvas units. */
  resize(model: Model, element: string, by: { readonly left?: number; readonly top?: number; readonly right?: number; readonly bottom?: number }, situation?: Situation): Outcome;
  /** A handle of an element's shape dragged to a value of its parameter, before snapping. */
  dragHandle(model: Model, element: string, param: string, value: number, situation?: Situation): Outcome;
  /** An end of a relation dragged to another place on the element it is on. */
  reattach(model: Model, relation: string, side: 'source' | 'target', end: EndPlace, situation?: Situation): Outcome;
  remove(model: Model, selection: readonly string[], situation?: Situation): Outcome;
  /** A node put under another node, with what it holds, at a place among that node's children: after the last when none is given. */
  reparent(model: Model, element: string, parent: string, index?: number, situation?: Situation): Outcome;
  /** An operation run on a selection, at the point it was invoked at when there is one. */
  operate(model: Model, operation: string, selection: readonly string[], situation?: Situation, at?: Point, args?: Readonly<Record<string, Value>>): Outcome;
  /** A child added to an element by the first `create-child` entry its menu offers (DISL 7.3), in the slot the entry names. */
  createChild(model: Model, parent: string, situation?: Situation): Outcome;
  /** A node pinned at a position, in the coordinates of its placement: a layout that respects pins leaves it there (DISL 7.3, 10.4). */
  pin(model: Model, element: string, at: Point | undefined, situation?: Situation): Outcome;
  /** The pins of the named nodes taken off, or of every pinned node when none is named, as one edit. */
  unpin(model: Model, elements: readonly string[] | undefined, situation?: Situation): Outcome;
  /** A group of an element's items collapsed or expanded, by the group's key (DISL 6.9). Its state is stored only while it differs from its default. */
  fold(model: Model, element: string, group: string, collapsed: boolean, situation?: Situation): Outcome;
  /** A kept filter of the canvas set to a value (DISL 6.13.1). The value is stored only while it differs from the filter's default. */
  filter(model: Model, id: string, value: Value, situation?: Situation): Outcome;
}

/** The other sections the behavior works with. */
export interface BehaviorParts {
  readonly constraints: Constraints;
  readonly layout: Layout;
  readonly coordinates: Coordinates;
  readonly persistence: InterpretedPersistence;
  readonly toolbox: Toolbox;
  /** The notation, which says what a position and a size are bound to; read from the specification when absent. */
  readonly notation?: Notation;
  /** The viewpoints, for the notation and the coordinate system of the one an intent takes place in. */
  readonly viewpoints?: Viewpoints;
  /** The row a `rows` layout gives each element (DISL 10.2), which needs where the elements are drawn: the canvas brings it. */
  rows?(config: LayoutConfig, model: Model): ReadonlyMap<string, number>;
  /** The id of a new element of a type; the persistence's when absent. */
  newId?(type: string): string;
}

// ---- changes ----

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const merged = (attributes: Attributes, values: Readonly<Record<string, Value | null>>): Attributes => {
  const next: Record<string, Value> = { ...attributes };
  for (const [name, value] of Object.entries(values)) {
    if (value === null) delete next[name];
    else next[name] = value;
  }
  return next;
};

// An element put into a list: directly after or before the sibling a position names, else at the end.
// The order among the children of one parent is the order of the list.
const beside = (elements: readonly ModelElement[], element: ModelElement, position: Beside | undefined): ModelElement[] => {
  const sibling = position === undefined ? -1 : elements.findIndex((other) => other.id === ('after' in position ? position.after : position.before));
  const at = sibling < 0 ? elements.length : position !== undefined && 'after' in position ? sibling + 1 : sibling;
  return [...elements.slice(0, at), element, ...elements.slice(at)];
};

/** A model with changes applied, in order. A change that names nothing in the model is left out. */
export function applyChanges(model: Model, changes: readonly Change[]): Model {
  let { diagram, elements, relations } = model;
  for (const change of changes) {
    if (change.kind === 'add') {
      const line = Math.max(0, ...elements.map((element) => element.line), ...relations.map((relation) => relation.line)) + 1;
      const made: ModelElement = { id: change.id, type: change.type, attributes: change.attributes, host: {}, ephemeral: false, line, ...(change.parent === undefined ? {} : { parent: change.parent }), ...(change.slot === undefined ? {} : { slot: change.slot }) };
      if ('source' in change || 'target' in change) relations = [...relations, { ...made, source: change.source, target: change.target }];
      else elements = beside(elements, made, change.position);
    } else if (change.kind === 'move') {
      const moved = elements.find((element) => element.id === change.id);
      if (!moved) continue;
      const { parent: _old, ...rest } = moved;
      void _old;
      const others = elements.filter((element) => element.id !== change.id);
      const position = change.position;
      const next = position && 'index' in position ? others.filter((element) => element.parent === change.parent)[position.index] : undefined;
      elements = beside(others, { ...rest, ...(change.parent === undefined ? {} : { parent: change.parent }) }, next ? { before: next.id } : position && !('index' in position) ? position : undefined);
    } else if (change.kind === 'remove') {
      elements = elements.filter((element) => element.id !== change.id);
      relations = relations.filter((relation) => relation.id !== change.id);
    } else if (change.id === '') {
      diagram = merged(diagram, change.attributes);
    } else {
      const update = <T extends ModelElement>(element: T): T => (element.id === change.id ? { ...element, attributes: merged(element.attributes, change.attributes) } : element);
      elements = elements.map(update);
      relations = relations.map(update);
    }
  }
  return { diagram, elements, relations };
}

// ---- snapping (DISL 5.9, 5.10) ----

const awayFromZero = (value: number): number => Math.sign(value) * Math.round(Math.abs(value));

// The rule of a gesture along an axis: the most specific declaration wins, and one for the gesture is more specific than its level.
const ruleFor = (system: CoordinateSystem | undefined, own: Snapping | undefined, gesture: string, axis: 'x' | 'y'): SnapRule | undefined =>
  own?.byGesture?.[gesture]?.[axis] ?? own?.[axis] ?? system?.snapping?.byGesture?.[gesture]?.[axis] ?? system?.snapping?.[axis];

// A value on the nearest allowed one. A tie goes by `ties`: away from the origin of the axis unless it says otherwise.
function snapped(rule: SnapRule | undefined, value: number, axis: Axis | undefined, diagram: Attributes, cel: (source: string, value: number) => number | undefined): number {
  if (!isObject(rule)) return value;
  const zero = axis?.origin ?? 0;
  let result = value;
  if (typeof rule.cel === 'string') {
    result = cel(rule.cel, value) ?? value;
  } else if (Array.isArray(rule.values) && rule.values.length > 0) {
    result = (rule.values as number[]).reduce((best, candidate) => (Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best));
  } else {
    const months = rule.calendar ? (monthsIn(unitOf(rule.calendar.unit, diagram, axis?.fallbackUnit)) ?? 1) * Math.max(1, rule.calendar.step ?? 1) : undefined;
    const step = months ?? (typeof rule.grid?.spacing === 'number' ? rule.grid.spacing : 0);
    if (step > 0) {
      const offset = rule.grid?.offset ?? 0;
      const lower = offset + Math.floor((value - offset) / step) * step;
      const upper = lower + step;
      const tie = Math.abs((value - lower) - (upper - value)) < 1e-9;
      const away = Math.abs(upper - zero) >= Math.abs(lower - zero) ? upper : lower;
      if (value === lower || rule.direction === 'floor') result = lower;
      else if (rule.direction === 'ceil') result = upper;
      else if (!tie) result = value - lower < upper - value ? lower : upper;
      else if (rule.ties === 'up') result = upper;
      else if (rule.ties === 'down') result = lower;
      else if (rule.ties === 'even') result = Math.round((lower - offset) / step) % 2 === 0 ? lower : upper;
      else result = rule.ties === 'toward-zero' ? (away === upper ? lower : upper) : away;
    }
  }
  if (typeof rule.min === 'number') result = Math.max(rule.min, result);
  if (typeof rule.max === 'number') result = Math.min(rule.max, result);
  return result;
}

// ---- neighbour bounds (DISL 4.3) ----

const within = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

/**
 * The present values of ordered attributes, each kept `gap` from the anchors around it and from
 * the two ends. The first `inner` are anchors; an absent one among them counts as an anchor when
 * `spread`. The pinned one is placed first, and the others around it. Nothing when there is no room.
 */
export function keptApart(values: readonly (number | undefined)[], low: number, high: number, gap: number, inner: number, spread: boolean, pinned: number): (number | undefined)[] | undefined {
  const slots = [...values];
  const count = Math.max(0, Math.min(inner, slots.length));
  // The gaps between two places: one for each anchor from the first to the second.
  const steps = (from: number, to: number): number => (spread ? to - from : 1 + slots.slice(from + 1, to).filter((slot) => slot !== undefined).length);
  if (slots.every((slot) => slot === undefined)) return slots;
  if (steps(-1, count) * gap > high - low) return undefined;

  const moved = pinned >= 0 && pinned < count ? slots[pinned] : undefined;
  if (moved !== undefined) {
    let below = pinned - 1;
    while (below >= 0 && slots[below] === undefined) below--;
    let above = pinned + 1;
    while (above < count && slots[above] === undefined) above++;
    const floor = (below < 0 ? low : slots[below]!) + steps(below, pinned) * gap;
    slots[pinned] = within(moved, floor, (above >= count ? high : slots[above]!) - steps(pinned, above >= count ? count : above) * gap);
  }

  let previousAt = -1;
  let previous = low;
  for (let index = 0; index < slots.length; index++) {
    const value = slots[index];
    if (value === undefined) continue;
    // One that is no anchor is only kept between the two ends, after the one before it.
    const highest = Math.max(low, high - gap);
    const kept = index < count
      ? within(value, previous + steps(previousAt, index) * gap, high - steps(index, count) * gap)
      : within(value, Math.min(previous + gap, highest), highest);
    slots[index] = kept;
    previousAt = index;
    previous = kept;
  }
  return slots;
}

// ---- a drop in a viewpoint that places by layout ----

/**
 * Where a point along an axis that a layout places stands on the axis of the viewpoint it varies.
 * DISL does not state it, so this is an interim rule: between two placed elements the coordinate
 * runs evenly from the one's own place to the other's, beyond the first and the last it runs at the
 * scale of the base axis, and with nothing placed it is the point itself. Each pair is where an
 * element is placed by the layout, and where it is in the base viewpoint.
 */
export function baseCoordinate(pairs: readonly { readonly placed: number; readonly base: number }[], at: number): number {
  const ordered = [...pairs].sort((a, b) => a.placed - b.placed);
  const before = ordered.filter((pair) => pair.placed <= at).at(-1);
  const after = ordered.find((pair) => pair.placed > at);
  if (!before) return after ? after.base - (after.placed - at) : at;
  if (!after || after.placed === before.placed) return before.base + (at - before.placed);
  return before.base + ((at - before.placed) / (after.placed - before.placed)) * (after.base - before.base);
}

// ---- the behavior ----

type Source = 'user' | 'hook' | 'operation' | 'layout';

// An element among the variables of a transaction: it is looked up again in the working model each time.
class Reference {
  constructor(readonly ids: string | readonly string[]) {}
}

// A derived relation as `self` of the operation one of its gestures runs: its two ends, each looked up as a Reference is.
class Ends {
  constructor(readonly source: string, readonly target: string) {}
}

const skips = ['move', 'resize', 'retype', 'reparent', 'plugin'];
// The actions that change nothing of the model: an operation of these alone is offered in a read-only document and is no undo step (DISL 9.4).
const viewing = ['view', 'select', 'reveal', 'highlight', 'open'];
const asks = ['select', 'reveal', 'highlight', 'editLabel', 'openForm'] as const;
const defaultLabels: Readonly<Record<string, string>> = {
  delete: 'Delete', editLabel: 'Rename', duplicate: 'Duplicate', openForm: 'Properties', moveUp: 'Move up', moveDown: 'Move down',
  pin: 'Lock position', unpin: 'Unlock position', unpinAll: 'Unlock all positions',
};

const list = (value: string | readonly string[] | undefined): readonly string[] => (value === undefined ? [] : typeof value === 'string' ? [value] : value);
const bound = (source: PlacementSource | undefined): { readonly attribute: string; readonly offset: number } | undefined =>
  (isObject(source) && 'attribute' in source ? { attribute: source.attribute, offset: typeof source.offset === 'number' ? source.offset : 0 } : undefined);
const allowed = (flag: Placement['movable'], axis: 'x' | 'y'): boolean => (typeof flag === 'object' ? flag[axis] !== false : flag !== false);
const attributeIn = (value: unknown): string | undefined => (isObject(value) && typeof value.attribute === 'string' ? value.attribute : undefined);

/** Interprets `behavior`. Its findings are the expressions that cannot be read and the actions that are not run. */
export function interpretBehavior(specification: Specification, metamodel: Metamodel, expressions: Expressions, parts: BehaviorParts): Loaded<Behavior> {
  const section = (specification.behavior ?? {}) as BehaviorSection;
  const { constraints, coordinates, toolbox } = parts;
  const findings: Finding[] = [];
  const texts = createTexts(specification, expressions);
  const { worded, applicable, holds } = texts;
  const locale = specification.language.defaultLocale ?? 'en';
  const ownNotation = parts.notation ?? interpretNotation(specification, metamodel).value;
  const hooks = [...(section.hooks ?? [])].sort((a, b) => Number(b.phase === 'before') - Number(a.phase === 'before') || (a.order ?? 0) - (b.order ?? 0));
  const declared = section.operations ?? {};
  const messages = section.messages ?? {};
  // A condition that is not given holds, and one that cannot be evaluated does not.
  const given = (condition: unknown, scope: Scope): boolean => condition === undefined || holds(condition, scope, false);
  const mint = (type: string): string => parts.newId?.(type) ?? newId(parts.persistence, type);

  // ---- what cannot be read ----

  const unread = (owner: string, values: readonly unknown[]): void => {
    for (const value of values) {
      const error = typeof value === 'string' || isCel(value) ? expressions.compile(value).error : undefined;
      if (error !== undefined) findings.push(finding('disl.behavior', 'error', `An expression of ${owner} cannot be read: ${error}`));
    }
  };
  const inspect = (owner: string, actions: readonly unknown[] | undefined): void => {
    for (const action of actions ?? []) {
      if (!isObject(action)) continue;
      const skipped = skips.find((kind) => kind in action);
      if (skipped !== undefined) findings.push(finding('disl.behavior', 'warning', `An action of ${owner} is a \`${skipped}\`, which this add-on does not run, so it is skipped.`));
      const members = (value: unknown): unknown[] => (isObject(value) ? Object.values(value).flatMap((member) => (isObject(member) && !isCel(member) ? Object.values(member) : [member])) : []);
      unread(owner, [action.when, action.if, action.forEach, action.delete, action.target, ...members(action.set), ...members(action.let), ...members(action.create), ...members(action.connect), ...members(action.abort)]);
      for (const nested of [action.then, action.else, action.do]) if (Array.isArray(nested)) inspect(owner, nested);
    }
  };
  for (const hook of hooks) {
    unread(`the hook \`${hook.id}\``, [hook.when]);
    inspect(`the hook \`${hook.id}\``, hook.actions);
  }
  for (const [id, operation] of Object.entries(declared)) {
    unread(`the operation \`${id}\``, [operation.enabled, isCel(operation.label) ? operation.label : undefined]);
    inspect(`the operation \`${id}\``, operation.actions);
  }

  // ---- what a viewer holds ----

  // `self.view.collapsed` (DISL 11.6, 12.2) for the situation of an intent. The last one is kept: an intent asks it several times.
  let viewed: { readonly model: Model; readonly held: Situation['collapsed']; readonly stored: Situation['view']; readonly view: (id: string) => Scope } | undefined;
  const viewFor = (model: Model, situation: Situation | undefined): ((id: string) => Scope) => {
    if (viewed?.model !== model || viewed.held !== situation?.collapsed || viewed.stored !== situation?.view) {
      const folded = foldsOf(parts.persistence, expressions, model, situation?.collapsed);
      const pinned = situation?.view?.pinned ?? {};
      viewed = { model, held: situation?.collapsed, stored: situation?.view, view: (id) => ({ collapsed: folded(id), pinned: Object.hasOwn(pinned, id) }) };
    }
    return viewed.view;
  };
  let seen: { readonly model: Model; readonly situation: Situation | undefined; readonly world: World } | undefined;
  const worldOf = (model: Model, situation: Situation | undefined): World => {
    if (seen?.model !== model || seen.situation !== situation) seen = { model, situation, world: expressions.over(model, { env: situation?.env, view: viewFor(model, situation) }) };
    return seen.world;
  };
  // The kinds of view data that are stored: changing one is an edit, whatever action does it (DISL 9.4).
  const stores = (kind: string): boolean => parts.persistence.view.store.includes(kind);
  const edits = (view: unknown): boolean => isObject(view) && ((view.pinned !== undefined && stores('pinned')) || (view.groups !== undefined && stores('groups'))
    || (isObject(view.filters) && Object.keys(view.filters).some((id) => ownNotation.canvas.filters[id]?.persist === true)));
  const free = (actions: readonly unknown[] | undefined): boolean =>
    (actions ?? []).length > 0 && (actions ?? []).every((action) => isObject(action) && viewing.some((kind) => kind in action) && !edits(action.view));
  // Whether a layout that runs by itself leaves a pinned node where it is, so that a drag and a drop pin (DISL 10.4).
  const pins = (parts.layout.trigger === 'always' || parts.layout.trigger === 'onChange') && parts.layout.respect === 'pinned' && stores('pinned');

  // The relations the model's relation types derive (DISL 4.11.3): no part of the model, and found again for each model.
  const derivedOf = new WeakMap<Model, readonly DerivedRelation[]>();
  const derivedIn = (model: Model): readonly DerivedRelation[] => {
    let known = derivedOf.get(model);
    if (!known) derivedOf.set(model, known = derivedRelations(metamodel, expressions, model).value);
    return known;
  };

  // The state a group of an element's items has while nothing is stored for it, by the group's key; nothing for a key that names no group (DISL 6.9).
  const groupDefault = (model: Model, element: string, key: string, scope: Scope): boolean | undefined => {
    const type = find(model, element)?.type;
    if (type === undefined) return undefined;
    for (const compartment of nodeNotation(ownNotation, metamodel, type).compartments) {
      const grouped = compartment.groupBy;
      if (!grouped && compartment.collapsible && compartment.id === key) return holds(compartment.collapsed, scope, false);
      if (!grouped || !('children' in compartment.items)) continue;
      for (const child of compartment.items.children) {
        const attribute = attributesOf(metamodel, child)[grouped.attribute] as Attribute | undefined;
        const kind = attribute && valueKind(metamodel, attribute.type);
        const value = kind?.kind === 'enum' ? kind.enum.values.find((candidate) => candidate.stored === key) : undefined;
        if (value) return grouped.collapsed[value.key] === true;
      }
    }
    return undefined;
  };

  // ---- the viewpoint an intent takes place in ----

  const viewOf = (situation: Situation | undefined, base: boolean): { readonly notation: Notation; readonly system: CoordinateSystem | undefined } => {
    const all = parts.viewpoints?.all ?? {};
    const name = typeof situation?.env?.viewpoint === 'string' && situation.env.viewpoint !== '' ? situation.env.viewpoint : parts.viewpoints?.default;
    const own = name !== undefined && Object.hasOwn(all, name) ? all[name] : undefined;
    // What is created is placed as the viewpoint a variant varies places it.
    const viewpoint = base && own?.variantOf !== undefined ? all[own.variantOf] : own;
    return { notation: viewpoint?.notation ?? ownNotation, system: coordinates.systems[viewpoint?.coordinateSystem ?? coordinates.default] };
  };

  const indexes = new WeakMap<Model, Map<string, ModelElement | ModelRelation>>();
  const find = (model: Model, id: string): ModelElement | ModelRelation | undefined => {
    let index = indexes.get(model);
    if (!index) indexes.set(model, index = new Map<string, ModelElement | ModelRelation>([...model.relations, ...model.elements].map((element) => [element.id, element])));
    return index.get(id);
  };
  const typeOf = (model: Model, id: string): string => (id === '' ? 'diagram' : find(model, id)?.type ?? '');
  const policyOf = (type: string): DeletionPolicy => {
    const name = (metamodel.types[type]?.lineage ?? [type]).find((candidate) => Object.hasOwn(section.deletion ?? {}, candidate));
    return name === undefined ? {} : section.deletion![name];
  };

  // The value an attribute takes: a whole number for an integer and a month, and no more decimals than its `precision`.
  const fitted = (value: Value | null, attribute: Attribute | undefined): Value | null => {
    if (value === null || !attribute) return value;
    const kind = valueKind(metamodel, attribute.type);
    if (kind.kind !== 'primitive' || Array.isArray(value)) return value;
    if (kind.primitive === 'yearMonth' && typeof value === 'string') return parseYearMonth(value) ?? value;
    if (typeof value !== 'number') return value;
    if (kind.primitive === 'int' || kind.primitive === 'yearMonth') return awayFromZero(value);
    const factor = typeof attribute.precision === 'number' ? 10 ** attribute.precision : undefined;
    return factor === undefined ? value : awayFromZero(value * factor) / factor;
  };

  const question = (confirm: Message | Confirmation | undefined, scope: Scope, deleting: boolean, title: string): Question | undefined => {
    if (confirm === undefined) return undefined;
    const asked: Confirmation = isObject(confirm) && !isCel(confirm) && 'message' in confirm ? (confirm as unknown as Confirmation) : { message: confirm as Message };
    const counted = asked.count === undefined ? undefined : expressions.evaluate(asked.count, scope);
    const count = counted?.ok ? counted.raw : undefined;
    const asking = { ...scope, count };
    if (!given(asked.when, asking) || (count !== undefined && Number(count) < (asked.threshold ?? 0))) return undefined;
    return {
      title: worded(asked.title, asking, title),
      message: worded(asked.message, asking, ''),
      confirmLabel: worded(asked.confirmLabel, asking, deleting ? 'Delete' : 'OK'),
      cancelLabel: worded(asked.cancelLabel, asking, 'Cancel'),
      danger: asked.danger ?? deleting,
    };
  };

  const message = (id: string, model: Model, situation?: Situation, more?: Scope): string | undefined =>
    (Object.hasOwn(messages, id) ? worded(messages[id], texts.scope({ model, env: situation?.env }, more), '') || undefined : undefined);

  // Why no change can be made at all: the diagram is read-only, or a reason of the edit gate applies (DISL 9.1).
  const gate = (model: Model, situation: Situation | undefined): string | undefined => {
    if (situation?.env?.readOnly === true) return message('std.readOnly', model, situation) ?? 'This diagram cannot be changed here.';
    return applicable(section.editGate, texts.scope({ model, env: situation?.env }));
  };

  // ---- one transaction ----

  const open = (model: Model, situation: Situation | undefined, kind: 'change' | 'handle' | 'create', ungated = false) => {
    const env = situation?.env;
    const collapsed: Record<string, boolean> = {};
    const viewChanges: ViewChange[] = [];
    // What is pinned once this transaction is done: what the document keeps, with what the transaction changed of it.
    const pinnedNow = (id: string): boolean => {
      const last = [...viewChanges].reverse().find((change) => (change.kind === 'pin' || change.kind === 'unpin') && change.element === id);
      return last ? last.kind === 'pin' : Object.hasOwn(situation?.view?.pinned ?? {}, id);
    };
    // What the viewer holds, with what this transaction changed of it.
    const view = (id: string): Scope => ({ ...viewFor(model, situation)(id), ...(Object.hasOwn(collapsed, id) ? { collapsed: collapsed[id] } : {}), pinned: pinnedNow(id) });
    const before = expressions.over(model, { env, view });
    const changes: Change[] = [];
    const created: string[] = [];
    const effects: Effect[] = [];
    const ran = new Set<string>();
    const edited = new Map<string, string[]>();
    const touched = new Map<string, Set<string>>();
    let working = model;
    let world: { readonly model: Model; readonly world: World } = { model, world: before };
    let refused = ungated ? undefined : gate(model, situation);
    let lastGesture: Gesture | undefined;

    const refuse = (sentence: string): void => { refused ??= sentence; };
    const now = (): World => {
      if (world.model !== working) world = { model: working, world: expressions.over(working, { env, view }) };
      return world.world;
    };
    const scopeOf = (self: string | undefined, variables: Readonly<Record<string, unknown>> = {}): Scope => {
      const over = now();
      const more: Record<string, unknown> = {};
      const held = (value: unknown): unknown => (value instanceof Ends ? { source: over.element(value.source), target: over.element(value.target) }
        : !(value instanceof Reference) ? value : typeof value.ids === 'string' ? over.element(value.ids) : value.ids.map((id) => over.element(id)));
      for (const [name, value] of Object.entries(variables)) {
        // The parameters of an operation are one variable, `p`, whose members may be elements.
        const members = !(value instanceof Ends) && !(value instanceof Reference) && isObject(value) && Object.values(value).some((member) => member instanceof Reference);
        more[name] = members ? Object.fromEntries(Object.entries(value).map(([member, given]) => [member, held(given)])) : held(value);
      }
      if (self === undefined) return over.scope(undefined, more);
      return self === '' ? over.scope(undefined, { self: over.diagram, ...more }) : over.scope(self, more);
    };
    const evaluated = (expression: unknown, scope: Scope): { readonly value: Value; readonly raw: unknown } | undefined => {
      if (typeof expression !== 'string' && !isCel(expression)) return expression === undefined ? undefined : { value: expression as Value, raw: expression };
      const result = expressions.evaluate(expression, scope);
      if (!result.ok) refuse(`This could not be done: ${result.error}`);
      // simplified: a moment an expression gives is stored in the host's local time with its offset, to the second; read the attribute's `timezone` and `newPrecision` when a definition states another.
      return !result.ok ? undefined : result.raw instanceof Date ? { value: formatMoment(result.raw), raw: result.raw } : result;
    };

    // ---- the view data that is stored (DISL 11.6) ----

    const pin = (id: string, at: Point | undefined): void => {
      const element = find(working, id);
      const kept = situation?.view?.pinned[id];
      if (!element || 'source' in element || isRelation(metamodel.types[element.type])) return refuse('That is no longer in this diagram.');
      if (!stores('pinned')) return refuse(NOT_KEPT);
      if (element.ephemeral) return refuse('Its id is not kept in the document, so its position cannot be locked.');
      if (!at) return refuse('Where it is drawn is not known here, so its position cannot be locked.');
      if (!(pinnedNow(id) && kept?.x === at.x && kept.y === at.y)) viewChanges.push({ kind: 'pin', element: id, x: at.x, y: at.y });
    };
    const unpin = (id: string): void => {
      if (!stores('pinned')) return refuse(NOT_KEPT);
      if (!pinnedNow(id)) return refuse(NOT_PINNED);
      viewChanges.push({ kind: 'unpin', element: id });
    };
    const group = (id: string, key: string, state: boolean): void => {
      const standard = groupDefault(working, id, key, scopeOf(id));
      if (standard === undefined) return refuse('That is no longer in this diagram.');
      if (!stores('groups')) return refuse(NOT_KEPT);
      const now = [...viewChanges].reverse().find((change) => change.kind === 'group' && change.element === id && change.group === key);
      const held = now?.kind === 'group' ? now.collapsed ?? standard : situation?.view?.groups[id]?.[key] ?? standard;
      if (held !== state) viewChanges.push({ kind: 'group', element: id, group: key, collapsed: state === standard ? null : state });
    };
    const keep = (id: string, value: Value): void => {
      const kept = Object.hasOwn(ownNotation.canvas.filters, id) ? ownNotation.canvas.filters[id] : undefined;
      if (!kept?.persist || !stores('filters')) return refuse(NOT_KEPT);
      const standard = isCel(kept.default) ? evaluated(kept.default, scopeOf(undefined))?.value ?? null : kept.default;
      const held = situation?.view && Object.hasOwn(situation.view.filters, id) ? situation.view.filters[id] : standard;
      if (!same(held, value)) viewChanges.push({ kind: 'filter', id, value: same(value, standard) ? null : value });
    };

    // A gesture is checked against the model as it was before the transaction (DISL 8.4).
    const check = (gesture: Gesture): boolean => {
      if (refused !== undefined) return false;
      lastGesture = gesture;
      const found = constraints.refusals(gesture, model);
      if (found.length > 0) refuse(found[0].message);
      return found.length === 0;
    };

    const apply = (change: Change): void => {
      working = applyChanges(working, [change]);
      const at = change.kind === 'set' ? changes.map((other) => other.id).lastIndexOf(change.id) : -1;
      const earlier = at < 0 ? undefined : changes[at];
      if (earlier?.kind === 'add' && change.kind === 'set') changes[at] = { ...earlier, attributes: merged(earlier.attributes, change.attributes) };
      else if (earlier?.kind === 'set' && change.kind === 'set') changes[at] = { ...earlier, attributes: { ...earlier.attributes, ...change.attributes } };
      else changes.push(change);
    };

    const fire = (event: string, id: string, attributes: readonly string[], source: Source): void => {
      for (const hook of hooks) {
        if (refused !== undefined) return;
        const type = typeOf(working, id);
        if (!list(hook.on).includes(event) || (hook.for !== undefined && !list(hook.for).some((name) => isA(metamodel, type, name)))) continue;
        if (event === 'change' && hook.attribute !== undefined && !list(hook.attribute).some((name) => attributes.includes(name))) continue;
        // A hook runs once for an element in a transaction, and a transaction runs no more than so many (DISL 9.2).
        const key = JSON.stringify([hook.id, id]);
        if (ran.has(key)) continue;
        const variables = { old: before.element(id), event: { kind: event, attribute: attributes[0] ?? null, source } };
        if (!given(hook.when, scopeOf(id, variables))) continue;
        if (ran.size >= (section.maxHookDepth ?? 100)) return refuse('This could not be done: its consequences do not come to an end.');
        ran.add(key);
        act(hook.actions, id, { ...variables }, 'hook');
      }
    };

    const write = (id: string, values: Readonly<Record<string, Value | null>>, source: Source, checked = source !== 'hook'): void => {
      if (refused !== undefined) return;
      const element = id === '' ? undefined : find(working, id);
      if (id !== '' && !element) return refuse('That is no longer in this diagram.');
      const type = element?.type ?? 'diagram';
      const attributes = attributesOf(metamodel, type);
      const current = element?.attributes ?? working.diagram;
      const next: Record<string, Value | null> = {};
      for (const [name, value] of Object.entries(values)) {
        const fits = fitted(value, Object.hasOwn(attributes, name) ? attributes[name] : undefined);
        if (!same(current[name], fits)) next[name] = fits;
      }
      const names = Object.keys(next);
      if (names.length === 0) return;
      if (checked) for (const name of names) if (!check({ kind: 'change', self: id === '' ? undefined : id, values: { attribute: name, newValue: next[name] } })) return;
      apply({ kind: 'set', id, attributes: next });
      touched.set(id, new Set([...(touched.get(id) ?? []), ...names]));
      if (source === 'user') edited.set(id, [...(edited.get(id) ?? []), ...names]);
      fire('change', id, names, source);
    };

    // The snapped point of a drop of an element of a type, in domain values, and what its placement binds to it.
    const dropped = (type: string, at: Point | undefined): { readonly position: Point | null; readonly placed: Record<string, Value> } => {
      if (!at) return { position: null, placed: {} };
      const view = viewOf(situation, true);
      const node = nodeNotation(view.notation, metamodel, type);
      const system = coordinates.systems[node.placement.system ?? ''] ?? view.system;
      const position = { x: at.x, y: at.y };
      const placed: Record<string, Value> = {};
      for (const axis of ['x', 'y'] as const) {
        position[axis] = snapped(ruleFor(system, node.snapping, 'drop', axis), at[axis], system?.[axis], working.diagram, (cel, value) => {
          const result = expressions.evaluate(cel, scopeOf(undefined, { value }));
          return result.ok && typeof result.value === 'number' ? result.value : undefined;
        });
        const source = bound(node.placement[axis]);
        if (source) placed[source.attribute] = position[axis] - source.offset;
      }
      return { position, placed };
    };

    const add = (type: string, attributes: Readonly<Record<string, Value | null>>, ends?: { readonly source: string; readonly target: string }, parent?: string, position?: Beside, slot?: string): string | undefined => {
      const meta = metamodel.types[type];
      if (!meta || meta.abstract || isRelation(meta) !== (ends !== undefined)) {
        refuse(`This could not be done: \`${type}\` is not a type that can be created here.`);
        return undefined;
      }
      const id = mint(type);
      // A default that is computed is worked out now, in the `create` context (DISL 4.3).
      const computed: Record<string, Value> = {};
      for (const [name, attribute] of Object.entries(meta.attributes)) {
        if (!isCel(attribute.default) || 'fixed' in attribute || Object.hasOwn(attributes, name)) continue;
        const value = evaluated(attribute.default, scopeOf(undefined, { elementType: type, position: null, parent: parent === undefined ? null : new Reference(parent) }))?.value;
        if (value !== undefined && value !== null) computed[name] = value;
      }
      const fits: Record<string, Value | null> = {};
      for (const [name, value] of Object.entries({ ...defaultsOf(metamodel, type), ...computed, ...attributes })) fits[name] = fitted(value, meta.attributes[name]);
      apply({ kind: 'add', id, type, attributes: merged({}, fits), ...ends, ...(parent === undefined ? {} : { parent }), ...(slot === undefined ? {} : { slot }), ...(position === undefined ? {} : { position }) });
      created.push(id);
      fire(ends ? 'connect' : 'create', id, [], 'user');
      return id;
    };

    // The attributes the ends of a relation are bound to, with where each end attaches: where it is given, else the notation's default.
    const attached = (id: string, places: { readonly source?: EndPlace; readonly target?: EndPlace }, defaults: boolean): Record<string, Value> => {
      const notation = edgeNotation(viewOf(situation, false).notation, metamodel, typeOf(working, id));
      let anchoring = notation.anchoring;
      for (const variant of notation.variants) if (given(variant.when, scopeOf(id))) anchoring = { ...anchoring, ...variant.anchoring };
      const values: Record<string, Value> = {};
      for (const side of ['source', 'target'] as const) {
        const anchor: EndAnchor | undefined = anchoring[side];
        const end = places[side];
        if (anchor?.mode !== 'part' || (!defaults && !end)) continue;
        for (const key of ['part', 'side', 'at'] as const) {
          const attribute = attributeIn(anchor[key]);
          if (attribute === undefined) continue;
          const preset = anchor.default?.[key];
          // A default is a literal, or computed for the relation as it is now.
          const value = end?.[key] ?? (!defaults ? undefined : isCel(preset) ? evaluated(preset, scopeOf(id))?.value : isObject(preset) ? undefined : preset);
          if (value !== undefined && value !== null) values[attribute] = value;
        }
      }
      return values;
    };

    const drop = (selection: readonly string[]): void => {
      const doomed: string[] = [];
      const mark = (id: string): void => {
        const element = find(working, id);
        if (!element || doomed.includes(id) || refused !== undefined) return;
        if (!isRelation(metamodel.types[element.type]) && !('source' in element)) {
          const policy = policyOf(element.type);
          const relations = working.relations.filter((relation) => relation.source === id || relation.target === id);
          const children = working.elements.filter((child) => child.parent === id);
          const kept = (relations.length > 0 && (policy.relations === 'forbid' || policy.relations === 'reconnect')) || (children.length > 0 && (policy.children === 'forbid' || policy.children === 'reparent'));
          if (kept) return refuse(`${metamodel.types[element.type]?.label ?? 'This'} cannot be removed while something is connected to it or lies in it.`);
          for (const other of [...relations, ...children]) mark(other.id);
        }
        doomed.push(id);
      };
      for (const id of selection) mark(id);
      if (doomed.length === 0) return;
      if (!check({ kind: 'delete', self: selection.find((id) => doomed.includes(id)), values: { selection: selection.map((id) => before.element(id)).filter((element) => element !== null) } })) return;
      for (const id of doomed) {
        const element = find(working, id);
        if (!element) continue;
        fire('source' in element ? 'disconnect' : 'delete', id, [], 'user');
        // A reference to what is removed is emptied (`references: "unset"`, DISL 9.5).
        for (const other of [...working.elements, ...working.relations]) {
          const referring = Object.entries(attributesOf(metamodel, other.type)).filter(([name, attribute]) => other.attributes[name] === id && valueKind(metamodel, attribute.type).kind === 'reference');
          if (referring.length > 0) apply({ kind: 'set', id: other.id, attributes: Object.fromEntries(referring.map(([name]) => [name, null])) });
        }
        apply({ kind: 'remove', id });
      }
    };

    const laidOut = (action: Readonly<Record<string, unknown>>, scope: Scope): void => {
      const config = typeof action.algorithm === 'string' && Object.hasOwn(parts.layout.algorithms, action.algorithm) ? parts.layout.algorithms[action.algorithm] : undefined;
      const refusals = isObject(action.refusals) ? action.refusals : {};
      // Another algorithm places what is drawn and writes nothing to the model.
      if (!config?.rows) return;
      const rows = parts.rows?.(config, working) ?? new Map<string, number>();
      if (rows.size === 0) return refuse(worded(refusals.nothingDrawn as Message | undefined, scope, 'There is nothing to lay out.'));
      let written = false;
      for (const element of working.elements) {
        const row = rows.get(element.id);
        const values: Record<string, Value> = {};
        for (const name of config.rows.writes) {
          const attribute = attributesOf(metamodel, element.type)[name] as Attribute | undefined;
          if (row !== undefined && attribute && !same(element.attributes[name] ?? defaultOf(attribute), row)) values[name] = row;
        }
        if (Object.keys(values).length === 0) continue;
        written = true;
        write(element.id, values, 'layout');
      }
      if (!written) refuse(worded(refusals.unchanged as Message | undefined, scope, 'This would change nothing.'));
    };

    function act(actions: readonly unknown[], self: string, variables: Record<string, unknown>, source: Source): void {
      for (const action of actions) {
        if (refused !== undefined) return;
        if (!isObject(action) || !given(action.when, scopeOf(self, variables))) continue;
        const one = (expression: unknown): { readonly value: Value; readonly raw: unknown } | undefined => evaluated(expression, scopeOf(self, variables));
        const each = (members: unknown): Record<string, Value | null> | undefined => {
          const values: Record<string, Value | null> = {};
          for (const [name, expression] of Object.entries(isObject(members) ? members : {})) {
            const result = one(expression);
            if (!result) return undefined;
            values[name] = result.value;
          }
          return values;
        };
        const target = action.target === undefined ? self : one(action.target)?.value;
        const kept = (name: unknown, id: string | undefined): void => { if (typeof name === 'string' && id !== undefined) variables[name] = new Reference(id); };
        const asked = asks.find((kind) => kind in action);
        // A sentence of an action is an expression, as every value of an action is (DISL 9.4).
        const said = (text: unknown, otherwise: string): string => {
          const result = text === undefined ? undefined : one(text)?.value;
          return typeof result === 'string' ? result : otherwise;
        };

        if (isObject(action.set)) {
          const values = each(action.set);
          if (values && typeof target === 'string') write(target, values, source);
        } else if (Array.isArray(action.unset)) {
          const stored = typeof target === 'string' ? (target === '' ? working.diagram : find(working, target)?.attributes) ?? {} : {};
          if (typeof target === 'string') write(target, Object.fromEntries((action.unset as string[]).filter((name) => Object.hasOwn(stored, name)).map((name) => [name, null])), source);
        } else if (isObject(action.create)) {
          const type = one(action.create.type)?.value;
          const values = each(action.create.attributes);
          const at = action.create.at === undefined ? undefined : one(action.create.at)?.value;
          const parent = action.create.parent === undefined ? undefined : one(action.create.parent)?.value;
          const slot = action.create.slot === undefined ? undefined : one(action.create.slot)?.value;
          if (typeof type !== 'string' || !values) continue;
          // Next to a sibling (DISL 9.4, positional create). Where the definition names none and the new
          // element goes under the parent of the element the action runs on, it goes directly after
          // that element: a host rule, see docs/disl-support.md.
          const sibling = (expression: unknown): string | undefined => {
            const named = expression === undefined ? undefined : one(expression)?.value;
            return typeof named === 'string' && named !== '' ? named : undefined;
          };
          const behind = sibling(action.create.after) ?? (action.create.before === undefined && self !== '' && typeof parent === 'string' && find(working, self)?.parent === parent ? self : undefined);
          const ahead = sibling(action.create.before);
          const next: Beside | undefined = behind !== undefined ? { after: behind } : ahead !== undefined ? { before: ahead } : undefined;
          const point = isObject(at) && typeof at.x === 'number' && typeof at.y === 'number' ? { x: at.x, y: at.y } : undefined;
          const { position, placed } = dropped(type, point);
          if (check({ kind: 'create', values: { elementType: type, position, parent: null, dropTarget: null, tool: null } })) kept(action.as, add(type, { ...placed, ...values }, undefined, typeof parent === 'string' && parent !== '' ? parent : undefined, next, typeof slot === 'string' && slot !== '' ? slot : undefined));
        } else if (isObject(action.connect)) {
          const type = one(action.connect.type)?.value;
          const from = one(action.connect.source)?.value;
          const to = one(action.connect.target)?.value;
          const values = each(action.connect.attributes);
          if (typeof type === 'string' && typeof from === 'string' && typeof to === 'string' && values) kept(action.as, related(type, from, to, {}, values));
        } else if (isObject(action.reorder)) {
          // Only the place among its siblings changes (DESL 8.2): `by` a signed number of places, or directly after or before a sibling.
          const moved = action.reorder.target === undefined ? self : one(action.reorder.target)?.value;
          const element = typeof moved === 'string' ? find(working, moved) : undefined;
          if (!element || 'source' in element) continue;
          const siblings = working.elements.filter((other) => other.parent === element.parent && other.slot === element.slot);
          const from = siblings.indexOf(element);
          const named = (expression: unknown): string | undefined => {
            const id = expression === undefined ? undefined : one(expression)?.value;
            return typeof id === 'string' && id !== '' ? id : undefined;
          };
          let to: number | undefined;
          if (action.reorder.by !== undefined) {
            const by = Number(one(action.reorder.by)?.value);
            to = Number.isInteger(by) ? from + by : undefined;
            if (to === undefined || to < 0 || to >= siblings.length) { refuse('It cannot be moved past the first or the last place.'); continue; }
          } else {
            const beside = named(action.reorder.after) ?? named(action.reorder.before);
            if (beside === undefined) continue;
            const at = siblings.findIndex((other) => other.id === beside);
            if (at < 0) { refuse('It can only be put next to what lies in the same place as it does.'); continue; }
            // Its place once it is taken out: after or before the sibling named.
            to = named(action.reorder.after) !== undefined ? (at < from ? at + 1 : at) : (at < from ? at : at - 1);
          }
          if (to === from) continue;
          const position: Beside = to < from ? { before: siblings[to].id } : { after: siblings[to].id };
          apply({ kind: 'move', id: element.id, ...(element.parent === undefined ? {} : { parent: element.parent }), position });
        } else if (action.delete !== undefined) {
          const doomed = one(action.delete)?.value;
          drop((Array.isArray(doomed) ? doomed : [doomed]).filter((id): id is string => typeof id === 'string'));
        } else if (isObject(action.let)) {
          for (const [name, expression] of Object.entries(action.let)) {
            const result = one(expression);
            if (!result) break;
            // An element is kept by its id, so that a later action sees it as it is then.
            const element = typeof result.raw === 'object' && result.raw !== null && typeof result.value === 'string';
            variables[name] = element ? new Reference(result.value as string) : result.raw;
          }
        } else if (action.if !== undefined) {
          const taken = holds(action.if, scopeOf(self, variables), false) ? action.then : action.else;
          if (Array.isArray(taken)) act(taken, self, variables, source);
        } else if (action.forEach !== undefined) {
          const items = one(action.forEach);
          const name = typeof action.as === 'string' ? action.as : 'item';
          if (!items || !Array.isArray(items.raw) || !Array.isArray(items.value) || !Array.isArray(action.do)) continue;
          const plain = items.value;
          items.raw.forEach((item: unknown, index) => {
            const id = typeof item === 'object' && item !== null ? plain[index] : undefined;
            act(action.do as unknown[], self, { ...variables, [name]: typeof id === 'string' ? new Reference(id) : item, index: BigInt(index) }, source);
          });
        } else if (isObject(action.layout)) {
          laidOut(action.layout, scopeOf(self, variables));
        } else if (isObject(action.abort)) {
          refuse(said(action.abort.message, 'This is not possible here.'));
        } else if (typeof action.call === 'string' && Object.hasOwn(declared, action.call)) {
          act(declared[action.call].actions ?? [], self, { ...variables, p: each(action.args) ?? {} }, source);
        } else if (isObject(action.view)) {
          // View data (DISL 9.4, 11.6): the viewer's fold of the target, and of what is stored its pin, the states of its groups and the kept filters.
          const folded = action.view.collapsed === undefined ? undefined : one(action.view.collapsed)?.value;
          if (typeof target === 'string' && target !== '' && typeof folded === 'boolean') collapsed[target] = folded;
          const pinned = action.view.pinned === undefined ? undefined : one(action.view.pinned)?.value;
          if (typeof target === 'string' && target !== '' && pinned === true) pin(target, situation?.at?.(target));
          else if (typeof target === 'string' && target !== '' && pinned === false && pinnedNow(target)) unpin(target);
          for (const [key, state] of Object.entries(each(action.view.groups) ?? {})) if (typeof target === 'string' && typeof state === 'boolean') group(target, key, state);
          // simplified: of the filters a `view` action sets, the kept ones are set; one that is each viewer's own is the canvas's to set.
          for (const [id, value] of Object.entries(each(action.view.filters) ?? {})) if (ownNotation.canvas.filters[id]?.persist === true && value !== null) keep(id, value);
        } else if (action.open !== undefined) {
          // An http or https address and a path are the host's to open; anything else is not opened (DISL 9.4).
          const link = one(action.open)?.value;
          const kind = typeof link === 'string' && link !== '' ? linkKind(link) : undefined;
          if (!kind) refuse('There is no link to open.');
          else if (kind.kind === 'uri' && kind.scheme !== 'http' && kind.scheme !== 'https') refuse(`The link "${String(link)}" is neither an http or https address nor a path, so it is not opened.`);
          else effects.push({ kind: 'open', elements: [self].filter((id) => id !== ''), message: link as string });
        } else if (isObject(action.notify)) {
          effects.push({ kind: 'notify', elements: [], message: said(action.notify.message, '') });
        } else if (asked !== undefined) {
          const named = isObject(action[asked]) ? (action[asked] as Record<string, unknown>).target : action[asked];
          const ids = named === undefined ? self : one(named)?.value;
          effects.push({ kind: asked, elements: (Array.isArray(ids) ? ids : [ids]).filter((id): id is string => typeof id === 'string' && id !== '') });
        }
      }
    }

    function related(type: string, source: string, target: string, ends: { readonly source?: EndPlace; readonly target?: EndPlace }, values: Readonly<Record<string, Value | null>> = {}): string | undefined {
      if (!check({ kind: 'connect', elements: { source, target }, values: { relationType: type } })) return undefined;
      const id = add(type, values, { source, target });
      if (id !== undefined) write(id, attached(id, ends, true), 'hook');
      return id;
    }

    // The neighbour bounds of every element the transaction touched (DISL 4.3): after the hooks, and part of the same step.
    const bounds = (): void => {
      for (const [id, names] of touched) {
        const element = id === '' ? undefined : find(working, id);
        const neighbour: NeighbourBounds | undefined = (metamodel.types[element?.type ?? '']?.lineage ?? []).map((type) => metamodel.types[type].declared.bounds?.neighbour).find((entry) => entry !== undefined);
        if (!element || !neighbour || !(neighbour.on ?? ['change', 'handle', 'create']).includes(kind)) continue;
        if (![...neighbour.attributes, ...neighbour.between].some((name) => names.has(name))) continue;
        const stored = (name: string): number | undefined => (typeof element.attributes[name] === 'number' ? element.attributes[name] : undefined);
        const number = (value: number | CelValue | undefined, otherwise: number): number => {
          const result = isCel(value) ? expressions.evaluate(value, scopeOf(id)) : undefined;
          return typeof value === 'number' ? value : result?.ok && typeof result.value === 'number' ? result.value : otherwise;
        };
        const [low, high] = neighbour.between.map(stored);
        if (low === undefined || high === undefined) continue;
        const values = neighbour.attributes.map(stored);
        const pinned = neighbour.pinned === 'edited' ? neighbour.attributes.findIndex((name) => edited.get(id)?.includes(name)) : -1;
        const kept = keptApart(values, low, high, number(neighbour.gap, 0), number(neighbour.inner, values.length), neighbour.absent === 'spread', pinned);
        if (!kept) return refuse('There is too little room between the two ends for this.');
        const next = Object.fromEntries(neighbour.attributes.flatMap((name, index) => (kept[index] !== undefined && kept[index] !== values[index] ? [[name, kept[index]]] : [])));
        if (Object.keys(next).length > 0) apply({ kind: 'set', id, attributes: next });
      }
    };

    const finish = (): Outcome => {
      if (refused === undefined) bounds();
      // An invariant that prevents rejects the whole transaction (DISL 14.4).
      const broken = refused === undefined && changes.length > 0 && lastGesture ? constraints.refusals(lastGesture, model, working) : [];
      if (broken.length > 0) refuse(broken[0].message);
      return refused === undefined ? { changes, after: working, created, effects, collapsed, view: viewChanges } : { refused };
    };

    // A gesture on a derived relation is the operation its `edits` map it to, run with the relation as `self` (DISL 4.11.4).
    const onDerived = (relation: Pick<DerivedRelation, 'type' | 'source' | 'target' | 'edits'>, gesture: string): void => {
      const operation = Object.hasOwn(relation.edits, gesture) ? relation.edits[gesture] : undefined;
      const type = metamodel.types[relation.type];
      const reason = isObject(type?.declared.derived) ? (type.declared.derived.reason as Message | undefined) : undefined;
      if (operation === undefined || !Object.hasOwn(declared, operation)) return refuse(worded(reason, scopeOf(undefined), 'This follows from what it joins, so it cannot be changed by itself.'));
      act(declared[operation].actions ?? [], '', { self: new Ends(relation.source, relation.target), position: null, p: {} }, 'operation');
    };

    return { act, add, apply, attached, check, dropped, drop, evaluated, finish, fire, group, keep, onDerived, pin, refuse, related, scopeOf, unpin, write, effects };
  };

  // ---- operations ----

  // The attribute the first action of an operation sets to its one parameter, as `p.<parameter>`.
  const asked = (operation: OperationDeclaration): { readonly asks?: string; readonly param?: string } => {
    const [param, ...more] = Object.keys(isObject(operation.params) ? operation.params : {});
    const first = operation.actions?.[0];
    const set = isObject(first) && isObject(first.set) ? first.set : {};
    const attribute = param === undefined || more.length > 0 ? undefined : Object.keys(set).find((name) => set[name] === `p.${param}`);
    return attribute === undefined ? {} : { asks: attribute, param };
  };

  const operations: Operation[] = Object.entries(declared).map(([id, operation]) => ({
    id,
    label: operation.label ?? labelOf(id),
    icon: typeof operation.icon === 'string' ? operation.icon : undefined,
    doc: localized(isObject(operation.doc) ? (operation.doc.summary as string | undefined) : operation.doc, locale, locale),
    for: list(operation.for ?? 'diagram'),
    keys: [...new Set([
      operation.shortcut,
      ...Object.values(toolbox.tools).filter((tool) => tool.operation === id).map((tool) => tool.shortcut),
      ...[...toolbox.contextTools, ...toolbox.contextMenus].flatMap((set) => set.entries.filter((entry) => entry.operation === id).map((entry) => entry.shortcut)),
    ].filter((key): key is string => key !== undefined))],
    ...(typeof operation.plugin === 'string' ? { plugin: operation.plugin } : isObject(operation.plugin) && typeof operation.plugin.name === 'string' ? { plugin: operation.plugin.name } : {}),
    ...asked(operation),
    opens: (operation.actions ?? []).some((action) => isObject(action) && action.open !== undefined),
    viewOnly: free(operation.actions),
  }));

  const availability = (model: Model, id: string, selection: readonly string[], situation?: Situation): Availability => {
    const operation = Object.hasOwn(declared, id) ? declared[id] : undefined;
    const known = operations.find((candidate) => candidate.id === id);
    if (!operation || !known) return { offered: false, available: false, label: labelOf(id) };
    const over = worldOf(model, situation);
    const first = selection.length > 0 ? find(model, selection[0]) : undefined;
    const target = first && known.for.some((name) => isA(metamodel, first.type, name)) ? first.id : undefined;
    const whole = known.for.includes('selection') && selection.length > 0;
    const scope = target !== undefined ? over.scope(target, { position: null })
      : over.scope(undefined, { self: over.diagram, position: null, ...(whole ? { selection: selection.map((entry) => over.element(entry)) } : {}) });
    const label = worded(known.label, scope, labelOf(id));
    if (target === undefined && !whole && !known.for.includes('diagram')) return { offered: false, available: false, label };
    const reason = (free(operation.actions) ? undefined : gate(model, situation)) ?? applicable(operation.unavailable, scope);
    return {
      offered: true, available: reason === undefined && given(operation.enabled, scope), reason, label, target,
      confirm: question(operation.confirm, scope, false, label),
    };
  };

  const done = (outcome: Outcome): outcome is Exclude<Outcome, { readonly refused: string }> => outcome.refused === undefined;
  const domain = (model: Model, system: CoordinateSystem | undefined, at: Point): Point => {
    if (!system) return at;
    const scales = scalesOf(system, model.diagram);
    return { x: scales.x.toValue(at.x), y: scales.y.toValue(at.y) };
  };

  const operate: Behavior['operate'] = (model, id, selection, situation, at, args) => {
    const state = availability(model, id, selection, situation);
    const position = at ? domain(model, viewOf(situation, true).system, at) : null;
    if (!state.offered) return { refused: message('std.notApplicable', model, situation, { operationId: id, position }) ?? 'This cannot be done with what is selected.' };
    if (!state.available) return { refused: state.reason ?? `${state.label} cannot be done now.` };
    const run = open(model, situation, 'change', free(declared[id].actions));
    const whole = state.target === undefined && selection.length > 0 ? { selection: new Reference(selection) } : {};
    // A parameter that is not given takes its default; one whose type is a type of the metamodel is the element of that id.
    const p: Record<string, unknown> = { ...args };
    for (const [name, param] of Object.entries(isObject(declared[id].params) ? declared[id].params : {})) {
      const stated = isObject(param) ? param : {};
      const value = args && Object.hasOwn(args, name) ? args[name] : isCel(stated.default) ? undefined : (stated.default as Value | undefined);
      if (value === undefined || value === null) delete p[name];
      else if (typeof stated.type !== 'string' || !Object.hasOwn(metamodel.types, stated.type)) p[name] = value;
      else if (typeof value !== 'string' || !find(model, value)) return { refused: 'That is no longer in this diagram.' };
      else p[name] = new Reference(value);
    }
    run.act(declared[id].actions ?? [], state.target ?? '', { position, p, ...whole }, 'operation');
    return run.finish();
  };

  // ---- intents ----

  const create: Behavior['create'] = (model, id, at, situation, on) => {
    const tool = Object.hasOwn(toolbox.tools, id) ? toolbox.tools[id] : undefined;
    if (tool?.operation !== undefined) return operate(model, tool.operation, on === undefined ? [] : [on], situation, at);
    if (!tool?.creates || tool.relation) return { refused: 'This tool places nothing where it is dropped.' };
    const run = open(model, situation, 'create');
    const node = nodeNotation(viewOf(situation, true).notation, metamodel, tool.creates);
    const system = coordinates.systems[node.placement.system ?? ''] ?? viewOf(situation, true).system;
    const { position, placed } = run.dropped(tool.creates, domain(model, system, at));
    const variables = { position, elementType: tool.creates, parent: null, dropTarget: null, tool: id };
    if (!run.check({ kind: 'create', values: variables })) return run.finish();
    const initial: Record<string, Value | null> = {};
    for (const [name, value] of Object.entries(tool.initial)) {
      const result = isCel(value) ? run.evaluated(value, run.scopeOf(undefined, variables)) : { value };
      if (!result) return run.finish();
      initial[name] = result.value;
    }
    const made = run.add(tool.creates, { ...placed, ...initial });
    // What follows a creation is the tool's to say (`after`, DISL 7.2); the new element is in `created` either way.
    if (made !== undefined && tool.after !== 'none') run.effects.push({ kind: tool.after, elements: [made] });
    // Where a layout respects pins, a node dropped from the toolbox is pinned at the drop point (DISL 10.4).
    if (made !== undefined && pins && Object.keys(placed).length === 0) run.pin(made, at);
    return run.finish();
  };

  const derivedType = (type: string): Readonly<Record<string, string>> | undefined => {
    const meta = metamodel.types[type];
    const rule = isRelation(meta) && isObject(meta.declared.derived) ? meta.declared.derived : undefined;
    return rule && Object.fromEntries(Object.entries(isObject(rule.edits) ? rule.edits : {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  };

  const connect: Behavior['connect'] = (model, type, source, target, ends, situation) => {
    const run = open(model, situation, 'create');
    const mapped = derivedType(type);
    // A derived relation is not created: drawing it is the operation its `edits` name, once the gesture's constraints let it (DISL 4.11.4).
    if (!mapped) run.related(type, source, target, ends ?? {});
    else if (run.check({ kind: 'connect', elements: { source, target }, values: { relationType: type } })) run.onDerived({ type, source, target, edits: mapped }, 'connect');
    return run.finish();
  };

  const createChild: Behavior['createChild'] = (model, parent, situation) => {
    const run = open(model, situation, 'create');
    const element = find(model, parent);
    const scope = run.scopeOf(parent);
    const entry = !element ? undefined : setsFor(toolbox.contextMenus, metamodel, element.type).filter((set) => given(set.when, scope))
      .flatMap((set) => set.entries).find((candidate) => candidate.kind === 'create-child' && candidate.creates !== undefined && given(candidate.visible, scope));
    const type = entry?.creates === undefined ? undefined : metamodel.types[entry.creates];
    if (!element || !entry || !type) run.refuse(message('std.notApplicable', model, situation) ?? 'Nothing can be added to this.');
    else if (run.check({ kind: 'create', elements: { parent }, values: { elementType: type.name, position: null, dropTarget: null, tool: null } })) {
      // A name that is required and has no default starts as "New" and what the type is called: a host rule, see docs/disl-support.md.
      const label = type.labelAttribute === undefined ? undefined : type.attributes[type.labelAttribute];
      const named = label?.required === true && label.default === undefined && !('fixed' in label) ? { [type.labelAttribute!]: `New ${type.label.toLowerCase()}` } : {};
      const made = run.add(type.name, named, undefined, parent);
      if (made !== undefined) run.effects.push({ kind: type.labelAttribute === undefined ? 'select' : 'editLabel', elements: [made] });
    }
    return run.finish();
  };

  const pin: Behavior['pin'] = (model, element, at, situation) => {
    const run = open(model, situation, 'change');
    run.pin(element, at);
    return run.finish();
  };

  const unpin: Behavior['unpin'] = (model, elements, situation) => {
    const run = open(model, situation, 'change');
    const all = elements ?? Object.keys(situation?.view?.pinned ?? {});
    if (all.length === 0) run.refuse(NOTHING_PINNED);
    for (const id of all) run.unpin(id);
    return run.finish();
  };

  const fold: Behavior['fold'] = (model, element, group, collapsed, situation) => {
    const run = open(model, situation, 'change');
    run.group(element, group, collapsed);
    return run.finish();
  };

  const filter: Behavior['filter'] = (model, id, value, situation) => {
    const run = open(model, situation, 'change');
    run.keep(id, value);
    return run.finish();
  };

  const change: Behavior['change'] = (model, element, values, situation) => {
    const run = open(model, situation, 'change');
    run.write(element ?? '', values, 'user');
    return run.finish();
  };

  const edit: Behavior['edit'] = (model, element, item, input, situation) => {
    const stopped = gate(model, situation);
    if (stopped !== undefined) return { refused: stopped };
    const parsed = item.parse({ model, element, env: situation?.env }, input);
    if ('refused' in parsed) return parsed;
    const run = open(model, situation, 'change');
    if ('set' in parsed) run.write(element ?? '', parsed.set, 'user');
    else run.act(parsed.write, element ?? '', { value: parsed.value }, 'user');
    run.act(item.onChange, element ?? '', {}, 'operation');
    return run.finish();
  };

  const editLabel: Behavior['editLabel'] = (model, element, text, situation, name) => {
    const run = open(model, situation, 'change');
    const notation = viewOf(situation, false).notation;
    const type = typeOf(model, element);
    const labels: readonly Label[] = isRelation(metamodel.types[type]) ? edgeNotation(notation, metamodel, type).labels : nodeNotation(notation, metamodel, type).labels;
    const attributeOf = (label: Label): string | undefined => attributeIn(label.editText) ?? attributeIn(label.text);
    const label = labels.find((candidate) => (name === undefined ? candidate.editable !== false && (candidate.parse?.write !== undefined || attributeOf(candidate) !== undefined) : candidate.id === name));
    const attribute = label && attributeOf(label);
    if (!label || label.editable === false || (label.parse?.write === undefined && attribute === undefined)) run.refuse('This text cannot be changed here.');
    else if (label.parse?.write !== undefined) run.act(label.parse.write, element, { value: text }, 'user');
    else run.write(element, { [attribute!]: text }, 'user');
    return run.finish();
  };

  // What moving or resizing an element needs: its placement, its scales, and the rule that snaps a gesture along an axis.
  const placing = (model: Model, id: string, situation: Situation | undefined, gesture: string, run: ReturnType<typeof open>) => {
    const element = find(model, id);
    const view = viewOf(situation, false);
    const node = nodeNotation(view.notation, metamodel, element?.type ?? '');
    const system = coordinates.systems[node.placement.system ?? ''] ?? view.system;
    const scales = system ? scalesOf(system, model.diagram) : undefined;
    const attributes = attributesOf(metamodel, element?.type ?? '');
    const read = (name: string | undefined): number | undefined => {
      const value = name === undefined || !element ? undefined : element.attributes[name] ?? (Object.hasOwn(attributes, name) ? defaultOf(attributes[name]) : undefined);
      return typeof value === 'number' ? value : undefined;
    };
    const snap = (axis: 'x' | 'y', value: number): number => snapped(ruleFor(system, node.snapping, gesture, axis), value, system?.[axis], model.diagram, (cel, raw) => {
      const result = expressions.evaluate(cel, run.scopeOf(id, { value: raw }));
      return result.ok && typeof result.value === 'number' ? result.value : undefined;
    });
    // The bounds a placement constraint sees, as CEL holds the attributes they are bound to (DISL 8.4).
    const boundsOf = (values: Readonly<Record<string, Value | null>>): Record<string, unknown> => {
      const world = texts.world(model, situation?.env);
      const result: Record<string, unknown> = {};
      for (const key of ['x', 'y', 'x2', 'y2'] as const) {
        const source = bound(node.placement[key]);
        const value = source && (Object.hasOwn(values, source.attribute) ? values[source.attribute] : read(source.attribute));
        if (source && typeof value === 'number' && Object.hasOwn(attributes, source.attribute)) result[key] = world.toCel(value, attributes[source.attribute]);
      }
      for (const key of ['width', 'height'] as const) {
        const name = attributeIn(node.size[key]);
        const value = name === undefined ? undefined : Object.hasOwn(values, name) ? values[name] : read(name);
        if (typeof value === 'number') result[key] = value;
      }
      return result;
    };
    return { element, node, scales, read, snap, boundsOf };
  };

  const move: Behavior['move'] = (model, elements, by, situation) => {
    const run = open(model, situation, 'change');
    for (const id of elements) {
      const { element, node, scales, read, snap, boundsOf } = placing(model, id, situation, 'move', run);
      const values: Record<string, Value> = {};
      for (const axis of ['x', 'y'] as const) {
        const source = bound(node.placement[axis]);
        const current = read(source?.attribute);
        if (!element || !source || !scales || current === undefined || by[axis] === 0 || !allowed(node.placement.movable, axis)) continue;
        values[source.attribute] = snap(axis, current + source.offset + by[axis] / scales[axis].perUnit) - source.offset;
        // The opposite edge moves along, so that the extent stays what it is.
        const opposite = bound(node.placement[`${axis}2`]);
        const far = read(opposite?.attribute);
        if (opposite && far !== undefined) values[opposite.attribute] = far + (values[source.attribute] as number) - current;
      }
      // A node no attribute places is where the layout put it: dragged, it is pinned where it is dropped (DISL 10.4).
      const from = situation?.at?.(id);
      const unplaced = (source: PlacementSource | undefined): boolean => source === undefined || source === 'free';
      const moved = (allowed(node.placement.movable, 'x') && by.x !== 0) || (allowed(node.placement.movable, 'y') && by.y !== 0);
      if (element && pins && from && unplaced(node.placement.x) && unplaced(node.placement.y) && moved) {
        run.pin(id, { x: allowed(node.placement.movable, 'x') ? from.x + by.x : from.x, y: allowed(node.placement.movable, 'y') ? from.y + by.y : from.y });
      }
      if (Object.keys(values).length === 0) continue;
      if (!run.check({ kind: 'placement', self: id, values: { gesture: 'move', oldBounds: boundsOf({}), newBounds: boundsOf(values), newParent: null } })) break;
      run.write(id, values, 'user', false);
      run.fire('move', id, [], 'user');
    }
    return run.finish();
  };

  const resize: Behavior['resize'] = (model, id, by, situation) => {
    const run = open(model, situation, 'change');
    const { element, node, scales, read, snap, boundsOf } = placing(model, id, situation, 'resize', run);
    const values: Record<string, Value> = {};
    const anchor = node.placement.anchor ?? 'top-left';
    const fraction = (axis: 'x' | 'y'): number => {
      if (typeof anchor !== 'string') return anchor[axis === 'x' ? 0 : 1];
      return anchor.includes(axis === 'x' ? 'left' : 'top') ? 0 : anchor.includes(axis === 'x' ? 'right' : 'bottom') ? 1 : 0.5;
    };
    for (const [axis, near, far, extent, only] of [['x', by.left ?? 0, by.right ?? 0, 'width', 'vertical'], ['y', by.top ?? 0, by.bottom ?? 0, 'height', 'horizontal']] as const) {
      if (!element || !scales || (near === 0 && far === 0) || !allowed(node.placement.resizable, axis) || node.size.resizable === false || node.size.resizable === only) continue;
      const source = bound(node.placement[axis]);
      const current = read(source?.attribute);
      const opposite = bound(node.placement[`${axis}2`]);
      const edge = read(opposite?.attribute);
      const sized = attributeIn(node.size[extent]);
      const size = read(sized);
      const to = (from: number, offset: number, distance: number): number => snap(axis, from + offset + distance / scales[axis].perUnit) - offset;
      if (opposite && edge !== undefined) {
        // The extent lies between two bound coordinates: each dragged edge is one of them.
        if (source && current !== undefined && near !== 0) values[source.attribute] = to(current, source.offset, near);
        if (far !== 0) values[opposite.attribute] = to(edge, opposite.offset, far);
      } else if (sized !== undefined && size !== undefined) {
        // The extent is a size in canvas units, and the anchor moves with the edges by its place between them.
        const shift = near * (1 - fraction(axis)) + far * fraction(axis);
        if (source && current !== undefined && shift !== 0) values[source.attribute] = to(current, source.offset, shift);
        values[sized] = size - near + far;
      }
    }
    if (Object.keys(values).length > 0 && run.check({ kind: 'placement', self: id, values: { gesture: 'resize', oldBounds: boundsOf({}), newBounds: boundsOf(values), newParent: null } })) {
      run.write(id, values, 'user', false);
      run.fire('resize', id, [], 'user');
    }
    return run.finish();
  };

  const dragHandle: Behavior['dragHandle'] = (model, id, param, value, situation) => {
    const run = open(model, situation, 'handle');
    const notation = viewOf(situation, false).notation;
    const reference = nodeNotation(notation, metamodel, typeOf(model, id)).shape;
    const shape = typeof reference === 'string' ? reference : 'type' in reference ? reference.type : '';
    const handle = (Object.hasOwn(notation.shapes, shape) ? notation.shapes[shape].handles : []).find((candidate) => candidate.param === param);
    const scope = run.scopeOf(id);
    if (!handle || !find(model, id)) run.refuse('That cannot be dragged here.');
    else if (!given(handle.visible, scope)) run.refuse(applicable(handle.refusals?.move === undefined ? [] : [handle.refusals.move as Reason], scope) ?? 'That cannot be dragged here.');
    else {
      const landed = snapped(handle.snap as SnapRule | undefined, value, undefined, model.diagram, (cel, raw) => {
        const result = expressions.evaluate(cel, run.scopeOf(id, { value: raw }));
        return result.ok && typeof result.value === 'number' ? result.value : undefined;
      });
      // A parameter bound to an attribute writes it; one that is computed is written by the handle's own actions (DISL 6.8).
      const attribute = typeof reference === 'object' && 'params' in reference ? attributeIn(reference.params?.[param]) : undefined;
      if (attribute !== undefined) run.write(id, { [attribute]: landed }, 'user');
      else run.act(handle.write ?? [], id, { value: landed }, 'user');
    }
    return run.finish();
  };

  const reattach: Behavior['reattach'] = (model, relation, side, end, situation) => {
    const run = open(model, situation, 'change');
    const values = find(model, relation) ? run.attached(relation, { [side]: end }, false) : {};
    if (Object.keys(values).length === 0) run.refuse('This end cannot be moved.');
    else run.write(relation, values, 'user');
    return run.finish();
  };

  const remove: Behavior['remove'] = (model, selection, situation) => {
    const run = open(model, situation, 'change');
    // A derived relation is not removed: removing it is the operation its `edits` name (DISL 4.11.4).
    const derived = derivedIn(model).filter((relation) => selection.includes(relation.id));
    for (const relation of derived) run.onDerived(relation, 'delete');
    run.drop(selection.filter((id) => !derived.some((relation) => relation.id === id)));
    return run.finish();
  };

  const reparent: Behavior['reparent'] = (model, id, parent, index, situation) => {
    const run = open(model, situation, 'change');
    const element = find(model, id);
    if (!element || !find(model, parent)) run.refuse('That is no longer in this diagram.');
    else if (run.check({ kind: 'containment', self: id, elements: { child: id, parent }, values: { slot: null } })) {
      // A node that is where it is asked to go is not moved.
      const children = model.elements.filter((child) => child.parent === parent);
      const others = children.filter((child) => child.id !== id);
      const at = Math.min(Math.max(index ?? others.length, 0), others.length);
      if (element.parent !== parent || children.findIndex((child) => child.id === id) !== at) run.apply({ kind: 'move', id, parent, ...(index === undefined ? {} : { position: { index: at } }) });
    }
    return run.finish();
  };

  const deletion: Behavior['deletion'] = (model, selection, situation) => {
    const outcome = remove(model, selection, situation);
    if (!done(outcome)) return { removes: [], refused: outcome.refused };
    const over = worldOf(model, situation);
    const all = selection.map((id) => over.element(id)).filter((element) => element !== null);
    // One removal asks at most once: the first element of the selection whose confirmation asks (DISL 9.5).
    for (const id of selection) {
      const type = typeOf(model, id);
      const confirm = question(policyOf(type).confirm, over.scope(id, { selection: all }), true, 'Delete');
      if (confirm) return { removes: outcome.changes.flatMap((entry) => (entry.kind === 'remove' ? [entry.id] : [])), confirm };
    }
    return { removes: outcome.changes.flatMap((entry) => (entry.kind === 'remove' ? [entry.id] : [])) };
  };

  const menu: Behavior['menu'] = (model, target, situation, sets = toolbox.contextMenus) => {
    const over = worldOf(model, situation);
    const pending = typeof target === 'object' ? target : undefined;
    const id = typeof target === 'string' ? target : undefined;
    const name = pending ? 'connection' : id === undefined ? 'diagram' : typeOf(model, id);
    const scope = pending ? over.scope(undefined, { source: over.element(pending.source), target: over.element(pending.target), sourceAnchor: null, position: null })
      : id === undefined ? over.scope(undefined, { self: over.diagram, position: null }) : over.scope(id, { position: null });
    const stopped = gate(model, situation);
    const groups: OfferedEntry[][] = [];
    const offered = setsFor(sets, metamodel, name).filter((set) => given(set.when, scope));
    for (const set of offered) {
      let previous: string | undefined;
      let group: OfferedEntry[] | undefined;
      for (const entry of set.entries) {
        // The groups are those of the entries as declared, whichever of them are shown (DISL 7.3).
        if (!group || entry.group !== previous) groups.push(group = []);
        previous = entry.group;
        const state = entry.operation === undefined ? undefined : availability(model, entry.operation, id === undefined ? [] : [id], situation);
        if (!given(entry.visible, scope) || state?.offered === false) continue;
        // `pin` is offered on a node that is not pinned and `unpin` on one that is; `unpinAll` has nothing to do while nothing is pinned (DISL 7.3).
        const pinned = situation?.view?.pinned ?? {};
        if ((entry.kind === 'pin' || entry.kind === 'unpin') && (id === undefined || (entry.kind === 'unpin') !== Object.hasOwn(pinned, id))) continue;
        const idle = entry.kind === 'unpinAll' && Object.keys(pinned).length === 0 ? NOTHING_PINNED : undefined;
        const made = entry.via ?? entry.creates;
        const reason = applicable(entry.unavailable, scope) ?? state?.reason ?? (entry.kind === 'operation' ? undefined : stopped) ?? idle;
        group.push({
          kind: entry.kind,
          label: worded(entry.label, scope, state?.label ?? defaultLabels[entry.kind] ?? (made === undefined ? labelOf(entry.kind) : metamodel.types[made]?.label ?? labelOf(made))),
          icon: entry.icon, shortcut: entry.shortcut, operation: entry.operation, creates: entry.creates, via: entry.via,
          enabled: reason === undefined && given(entry.enabled, scope) && state?.available !== false,
          reason,
        });
      }
    }
    return { groups: groups.filter((group) => group.length > 0), standardEntries: offered.some((set) => set.standardEntries), runSingle: offered.some((set) => set.runSingle) };
  };

  return {
    value: {
      messages, message, operations, ...(isObject(section.clipboard) ? { clipboard: section.clipboard } : {}),
      availability, menu, deletion, create, connect, change, edit, editLabel, move, resize, dragHandle, reattach, remove, reparent, operate, createChild, pin, unpin, fold, filter,
    },
    findings,
  };
}
