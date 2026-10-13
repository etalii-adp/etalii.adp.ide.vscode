// From what the interpreter makes of one request to what the FBL library plans (etalii.adp spec
// 027, research R5): the changes of the behavior, in the metamodel's names and values, become
// model changes in the binding's names and the library's values, and the edits the library plans
// for them, one after the other, become the splices of the text as it was before the request.

import type { Change, ViewChange } from '../disl/behavior';
import { attributesOf, type Metamodel } from '../disl/metamodel';
import type { Model, Value } from '../disl/model';
import { toBinding, type InterpretedPersistence, type ViewBind } from '../disl/persistence';
import { allRules, type FblBinding } from '../fbl/documents/types';
import type { FblModel } from '../fbl/model';
import type { ModelChange } from '../fbl/planning/modelChange';
import type { Edit } from '../fbl/splice';
import { decode, encode } from '../fbl/text/utf8';
import type { TextSplice } from '../frame/toolType';

/** What the changes are read against: the binding of the open document, and what was read through it. */
export interface ChangeContext {
  readonly binding: FblBinding;
  readonly metamodel: Metamodel;
  readonly persistence: InterpretedPersistence;
  readonly read: FblModel;
}

export interface Refused {
  readonly refused: string;
}

type Step = Extract<ModelChange, { kind: 'add' | 'set' | 'remove' | 'move' }>;

const DIAGRAM = 'diagram';

const scalar = (value: unknown): boolean =>
  value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'bigint' || (typeof value === 'number' && Number.isFinite(value));
/** A value of a model change (FBL 6.4): a scalar or a list of scalars. A structure and a number that is none are not. */
const takes = (value: unknown): boolean => scalar(value) || (Array.isArray(value) && value.every(scalar));

/**
 * The changes of one request as the steps the FBL library plans, in order. A request that changes
 * nothing gives no step.
 *
 * - The values a change gives one entry are one step: a `set` after an `add` or a `set` of the same entry joins it.
 * - A removal the binding's own cascade makes is left out, so that nothing is removed twice. So is
 *   the removal of an element that lies in another one the request removes: it goes with that one.
 * - A binding read by a plugin declares no rule: a type is named as `typeMap` reads it, an attribute
 *   by the metamodel's name, and what the body can take is the plugin's to say when it plans.
 * - A `set` on the diagram (id `''`) is a `set` of the entry the binding reads as the diagram, or an `add` of it when the document has none.
 */
export function modelChangesOf(changes: readonly Change[], context: ChangeContext, model: Model): readonly ModelChange[] | Refused {
  const { binding, metamodel, persistence } = context;
  const rules = allRules(binding);
  const typeOf = (id: string): string | undefined => [...model.elements, ...model.relations].find((element) => element.id === id)?.type;
  const endsOf = (id: string): readonly (string | undefined)[] => {
    const relation = model.relations.find((candidate) => candidate.id === id);
    return relation ? [relation.source, relation.target] : [];
  };
  /** The rules of the binding that read a type of the metamodel. */
  const rulesOf = (type: string | undefined) => {
    const stored = type === undefined ? undefined : toBinding(binding, metamodel, persistence, type, {})?.type;
    return rules.filter((rule) => rule.type === stored);
  };

  function stored(type: string, id: string, attributes: Readonly<Record<string, Value | null | undefined>>): { type: string; attributes: Readonly<Record<string, unknown>> } | Refused {
    const named = type === DIAGRAM ? 'the diagram' : `\`${id}\``;
    const found = toBinding(binding, metamodel, persistence, type, attributes as Readonly<Record<string, Value | undefined>>) ?? (binding.plugin && rules.length === 0 ? {
      type: Object.entries(persistence.typeMap).find(([, entry]) => entry.as === type)?.[0] ?? type,
      attributes: Object.fromEntries(Object.entries(attributes).map(([name, value]) => [name, value ?? null])),
    } : undefined);
    if (!found) return { refused: `The document holds nothing of the kind of ${named}, so the change cannot be written.` };
    const reading = rules.filter((rule) => rule.type === found.type);
    // A binding read by a plugin declares no rule: what it takes is the plugin's to say when it plans.
    if (reading.length === 0) return found;
    // A relation's ends are attributes of a model change, whether or not the binding reads them as attributes.
    const known = new Set([...reading.flatMap((rule) => rule.attributes.map(([name]) => name)), ...(reading.some((rule) => rule.isRelation) ? ['source', 'target'] : [])]);
    for (const [name, value] of Object.entries(found.attributes)) {
      if (!known.has(name)) return { refused: `The document has no place for \`${name}\` of ${named}, so the change cannot be written.` };
      if (!takes(value)) return { refused: `The document cannot hold the value given for \`${name}\` of ${named}.` };
    }
    return found;
  }

  // What the removal of `id` takes by the binding's own cascade: the entries of the rules it names that refer to it.
  const removed = new Set(changes.filter((change) => change.kind === 'remove').map((change) => change.id));
  const parentOf = new Map(model.elements.map((element) => [element.id, element.parent]));
  function held(id: string): boolean {
    for (let parent = parentOf.get(id), seen = 0; parent !== undefined && seen < parentOf.size; parent = parentOf.get(parent), seen++) if (removed.has(parent)) return true;
    return false;
  }
  function cascaded(id: string): boolean {
    const mine = rulesOf(typeOf(id)).map((rule) => rule.name);
    return endsOf(id).some((end) => {
      if (end === undefined || !removed.has(end)) return false;
      const taking = rulesOf(typeOf(end)).filter((rule) => rule.remove);
      return taking.length > 0 && taking.every((rule) => mine.some((name) => rule.remove!.cascade.includes(name)));
    });
  }

  const steps: Step[] = [];
  const merge = (id: string, attributes: Readonly<Record<string, unknown>>): boolean => {
    const index = steps.map((step) => step.id).lastIndexOf(id);
    const last = steps[index];
    if (!last || (last.kind !== 'add' && last.kind !== 'set')) return false;
    steps[index] = { ...last, attributes: { ...last.attributes, ...attributes } };
    return true;
  };

  for (const change of changes) {
    if (change.kind === 'remove') {
      if (!cascaded(change.id) && !held(change.id)) steps.push({ kind: 'remove', id: change.id });
    } else if (change.kind === 'move') {
      steps.push({ kind: 'move', id: change.id, ...(change.parent === undefined ? {} : { parent: change.parent }), ...(change.position === undefined ? {} : { position: change.position }) });
    } else if (change.kind === 'add') {
      const ends = { ...(change.source === undefined ? {} : { source: change.source }), ...(change.target === undefined ? {} : { target: change.target }) };
      // An attribute the metamodel declares read-only is the file's to state, never written: a new element starts without it.
      const declared = attributesOf(metamodel, change.type);
      const written = Object.fromEntries(Object.entries(change.attributes).filter(([name]) => !Object.hasOwn(declared, name) || declared[name].readOnly !== true));
      const found = stored(change.type, change.id, { ...written, ...ends });
      if ('refused' in found) return found;
      steps.push({ kind: 'add', type: found.type, id: change.id, attributes: found.attributes, ...(change.parent === undefined ? {} : { parent: change.parent }), ...(change.position === undefined ? {} : { position: change.position }) });
    } else if (change.id === '') {
      const found = stored(DIAGRAM, '', change.attributes);
      if ('refused' in found) return found;
      const entry = context.read.elements.find((element) => element.type === found.type);
      if (!merge(entry?.id ?? '', found.attributes)) steps.push(entry ? { kind: 'set', id: entry.id, attributes: found.attributes } : { kind: 'add', type: found.type, id: '', attributes: found.attributes });
    } else {
      const added = changes.find((other) => other.kind === 'add' && other.id === change.id);
      const type = added?.kind === 'add' ? added.type : typeOf(change.id);
      if (type === undefined) return { refused: `\`${change.id}\` is not in the document, so it cannot be changed.` };
      const found = stored(type, change.id, change.attributes);
      if ('refused' in found) return found;
      if (!merge(change.id, found.attributes)) steps.push({ kind: 'set', id: change.id, attributes: found.attributes });
    }
  }
  // The diagram's entry was added under no id: the binding gives it none.
  return steps.map((step) => (step.kind === 'add' && step.id === '' ? { kind: 'add', type: step.type, attributes: step.attributes } : step));
}

/**
 * The changes of one request to the stored view data as the steps the FBL library plans, where
 * `persistence.view.bind` keeps that data in entries of the body (DISL 11.6): a pin, the state of
 * a group and a kept filter are each the add, the set or the removal of the entry that holds it,
 * named `pinned:<element>` or `groups:<element>#<key>`. What is not there is not removed. A kept
 * filter back at its default is emptied where the binding removes an empty value, and written as
 * its default, which `standard` gives, where the binding has no way to leave it out.
 */
export function viewStepsOf(changes: readonly ViewChange[], bind: ViewBind, binding: FblBinding, read: FblModel, standard: (filter: string) => Value | null): readonly ModelChange[] | Refused {
  // simplified: stored view data is written where `view.bind` keeps it in the document; a kind a registration keeps is refused, until a definition read here stores one there.
  const unbound: Refused = { refused: 'This is kept beside the document, which this host does not write for this tool yet.' };
  const steps: ModelChange[] = [];
  // Whether an entry is there once the steps so far are carried out.
  const there = (id: string): boolean => {
    const last = steps.map((step) => ('id' in step ? step.id : undefined)).lastIndexOf(id);
    return last < 0 ? read.find(id) !== undefined : steps[last].kind !== 'remove';
  };
  for (const change of changes) {
    if (change.kind === 'pin' || change.kind === 'unpin') {
      const to = bind.pinned;
      if (!to) return unbound;
      const id = `pinned:${change.element}`;
      if (change.kind === 'unpin') { if (there(id)) steps.push({ kind: 'remove', id }); }
      else if (there(id)) steps.push({ kind: 'set', id, attributes: { [to.x]: change.x, [to.y]: change.y } });
      else steps.push({ kind: 'add', type: to.type, id, attributes: { [to.element]: change.element, [to.x]: change.x, [to.y]: change.y } });
    } else if (change.kind === 'group') {
      const to = bind.groups;
      if (!to) return unbound;
      const id = `groups:${change.element}#${change.group}`;
      if (change.collapsed === null) { if (there(id)) steps.push({ kind: 'remove', id }); }
      else if (there(id)) steps.push({ kind: 'set', id, attributes: { [to.collapsed]: change.collapsed } });
      else steps.push({ kind: 'add', type: to.type, id, attributes: { [to.element]: change.element, [to.group]: change.group, [to.collapsed]: change.collapsed } });
    } else {
      const to = bind.filters;
      const attribute = to && Object.hasOwn(to.values, change.id) ? to.values[change.id] : undefined;
      if (!to || attribute === undefined) return unbound;
      const removable = allRules(binding).some((rule) => rule.type === to.type && rule.attributes.some(([name, slot]) => name === attribute && slot.empty === 'remove'));
      const value = change.value === null && !removable ? standard(change.id) : change.value;
      if (!takes(value)) return { refused: 'The document cannot hold the value given for this filter.' };
      const entry = read.elements.find((element) => element.type === to.type);
      steps.push(entry ? { kind: 'set', id: entry.id, attributes: { [attribute]: value } } : { kind: 'add', type: to.type, attributes: { [attribute]: value } });
    }
  }
  return steps;
}

// A stretch of the body while edits are laid over it: bytes of the body as it was, or bytes an edit wrote.
type Piece = { readonly from: number; readonly to: number } | { readonly written: Uint8Array };

const lengthOf = (piece: Piece): number => ('written' in piece ? piece.written.length : piece.to - piece.from);

/**
 * Edits planned one after the other, each against the body the one before left, as splices of the
 * body before the first: in the order of the body, not overlapping, and touching no byte that no
 * edit touched.
 */
export function composedSplices(edits: readonly Edit[]): TextSplice[] {
  if (edits.length === 1) return edits[0].splices.map((splice) => ({ offset: splice.start, length: splice.end - splice.start, text: splice.text }));
  let pieces: Piece[] = [{ from: 0, to: Infinity }];
  // The pieces with one cut at an offset of the body as it is now, and the index of the piece that starts there.
  const cut = (at: number): number => {
    let start = 0;
    for (let index = 0; index < pieces.length; index++) {
      const piece = pieces[index];
      const end = start + lengthOf(piece);
      if (at === start) return index;
      if (at < end) {
        const within = at - start;
        const halves: Piece[] = 'written' in piece ? [{ written: piece.written.subarray(0, within) }, { written: piece.written.subarray(within) }] : [{ from: piece.from, to: piece.from + within }, { from: piece.from + within, to: piece.to }];
        pieces.splice(index, 1, ...halves);
        return index + 1;
      }
      start = end;
    }
    return pieces.length;
  };
  for (const edit of edits) {
    // The last first, so that the offsets of the others still hold.
    for (const splice of [...edit.splices].reverse()) {
      const first = cut(splice.start);
      const last = cut(splice.end);
      pieces.splice(first, last - first, { written: encode(splice.text) });
    }
    pieces = pieces.filter((piece) => lengthOf(piece) > 0);
  }

  const splices: TextSplice[] = [];
  let kept = 0;
  let written: Uint8Array[] = [];
  const close = (until: number): void => {
    if (until > kept || written.length > 0) splices.push({ offset: kept, length: until - kept, text: decode(Uint8Array.from(written.flatMap((bytes) => [...bytes]))) });
    written = [];
  };
  for (const piece of pieces) {
    if ('written' in piece) written.push(piece.written);
    else if (piece.to > piece.from) {
      close(piece.from);
      kept = piece.to;
    }
  }
  return splices;
}
