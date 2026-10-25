// The operations of a designer (DESL 8) and the editing transaction (DESL 10.3). An operation's
// actions are the closed set DISL's behavior runs too, so a transaction is run by the behavior of
// `../disl/`; this module gives it the operations in the names it knows, and adds what DESL asks of
// a transaction beside its actions: the ids a specification derives (5.3.2), the conversion of a
// column's values when its value type changes (7.6), and the quick change of a cell (10.3), which
// is the transaction the surface's own parts give.
//
// Two rules decide what an action stores, which DESL leaves to its sentence "a writer leaves out a
// value that is not stored" (4.3); `docs/disl-support.md` records both as this host's:
//
// - A value that is only the read of an attribute or of a parameter that holds no value assigns
//   nothing: a copy of an element holds what the element holds, and a gesture changes what it gives.
// - A value that is its attribute's default is not stored.

import { applyChanges, interpretBehavior, type Availability, type Change, type Outcome } from '../disl/behavior';
import type { Constraints } from '../disl/constraints';
import { interpretCoordinates } from '../disl/coordinates';
import type { Expressions } from '../disl/expressions';
import { interpretLayout } from '../disl/layout';
import { attributesOf, defaultOf, valueKind, type Metamodel } from '../disl/metamodel';
import { finding, type Finding, type Loaded, type Model, type ModelElement, type Value } from '../disl/model';
import { entryOf, fromStored, mapped, momentAttributes, newId } from '../disl/persistence';
import { celOf, isCel, isObject, labelOf, localized, type Attribute, type IdRule, type LocalizedText, type Message, type Specification } from '../disl/specification';
import { interpretToolbox } from '../disl/toolbox';
import { findRule, type FblBinding } from '../fbl/documents/types';
import type { FblOptions, IdRequest } from '../fbl/model';
import { counterRules, markSets, nextCounted } from './counters';
import { scoped, type DesignerSpecification } from './specification';
import type { Surface, ValueType } from './surface';

/** One parameter of an operation: an attribute, given by the gesture (DESL 8.1). */
export interface Parameter {
  readonly name: string;
  readonly label: string;
  /** A primitive, an enumeration or an element type of the metamodel. */
  readonly type: string;
  readonly required: boolean;
  readonly default?: Value;
}

export interface DesignerOperation {
  readonly id: string;
  /** Its label as the specification writes it. */
  readonly label: Message;
  /** The types it applies to an element of, `selection` or `document`. */
  readonly for: readonly string[];
  readonly params: readonly Parameter[];
}

export interface Operations {
  /** The operations the specification declares, in its order. */
  readonly all: readonly DesignerOperation[];
  /** Whether an operation applies to a selection, whether it can run now, and the question it asks first. */
  availability(model: Model, operation: string, selection: readonly string[]): Availability;
  /** One operation run on a selection, or on the document when that is empty, as one transaction. */
  run(model: Model, operation: string, selection: readonly string[], args?: Readonly<Record<string, Value>>): Outcome;
  /** The value of a row for a column set, or emptied with null: the quick change of a cell. */
  setCell(model: Model, row: string, column: string, value: Value | null): Outcome;
  /** One of several values of a row for a column added or taken away. */
  setItem(model: Model, row: string, column: string, value: Value, present: boolean): Outcome;
  /** A view made the one the document is left in. */
  activate(model: Model, view: string): Outcome;
  /** What the FBL library asks of the specification to read a body through a binding: the derived ids, the types of the attributes, which hold several values, and the types read as unreadable. */
  reading(binding: FblBinding): Pick<FblOptions, 'deriveId' | 'attributeType' | 'timeAttributes' | 'many' | 'unreadableTypes'>;
}

const NOT_HERE = 'This cannot be done with what is selected.';
const NO_VALUE = 'This value cannot be changed here.';

// The read of an attribute or of a parameter, and nothing else: `self.width`, `p.option`.
const bare = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/;
const readOf = (value: unknown): string | undefined => {
  const cel = (typeof value === 'string' ? value : isCel(value) ? value.cel : '').trim();
  return bare.test(cel) ? cel : undefined;
};

/** The actions with the first rule of this module written into them: an assignment from a bare read is made only where that read holds a value. */
function assigning(actions: unknown): unknown[] {
  return (Array.isArray(actions) ? actions : []).flatMap((action: unknown): unknown[] => {
    if (!isObject(action)) return [action];
    const nested = { ...action };
    for (const list of ['then', 'else', 'do']) if (Array.isArray(action[list])) nested[list] = assigning(action[list]);
    if (isObject(action.set)) {
      return Object.entries(action.set).map(([name, value]) => {
        const read = readOf(value);
        const when = read === undefined ? action.when : action.when === undefined ? `has(${read})` : `(${celOf(action.when as string)}) && has(${read})`;
        return { ...nested, set: { [name]: value }, ...(when === undefined ? {} : { when }) };
      });
    }
    if (isObject(action.create) && isObject(action.create.attributes)) {
      const attributes = Object.fromEntries(Object.entries(action.create.attributes).map(([name, value]) => {
        const read = readOf(value);
        return [name, read === undefined ? value : `has(${read}) ? ${read} : null`];
      }));
      return [{ ...nested, create: { ...action.create, attributes } }];
    }
    return [nested];
  });
}

/** Interprets `operations`. Its findings are those of the behavior that runs them. */
export function interpretOperations(designer: DesignerSpecification, surface: Surface, metamodel: Metamodel, expressions: Expressions, constraints: Constraints): Loaded<Operations> {
  const { persistence } = designer;
  const locale = designer.interpreted.language.defaultLocale ?? 'en';
  const findings: Finding[] = [];
  const typesOf = (type: string): Readonly<Record<string, Attribute>> => attributesOf(metamodel, type);
  /** The slot of a type its children of another type are kept in, where it has one for them. */
  const slotFor = (parent: string, child: string): string | undefined => {
    const children = metamodel.types[parent]?.declared.children;
    const slots = isObject(children) && isObject(children.slots) ? children.slots : {};
    return Object.keys(slots).find((slot) => isObject(slots[slot]) && Array.isArray(slots[slot].allowed) && slots[slot].allowed.includes(child));
  };

  // ---- the operations, as the behavior of ../disl reads them ----

  const all: DesignerOperation[] = Object.entries(designer.operations).filter((entry): entry is [string, Record<string, unknown>] => isObject(entry[1])).map(([id, operation]) => ({
    id,
    label: (operation.label as Message | undefined) ?? labelOf(id),
    for: typeof operation.for === 'string' ? [operation.for] : Array.isArray(operation.for) ? operation.for.filter((name): name is string => typeof name === 'string') : [],
    params: Object.entries(isObject(operation.params) ? operation.params : {}).map(([name, declared]): Parameter => {
      const param = isObject(declared) ? declared : {};
      const standard = isCel(param.default) ? undefined : (param.default as Value | undefined);
      return {
        name, label: localized(param.label as LocalizedText | undefined, locale) ?? labelOf(name), type: typeof param.type === 'string' ? param.type : 'string', required: param.required === true,
        ...(standard === undefined ? {} : { default: standard }),
      };
    }),
  }));
  const declaredIds = new Set(all.map((operation) => operation.id));

  // The quick changes of the surface (DESL 10.3), each written as the operation it is: what a cell holds under the key of
  // a value type set or emptied, one of several values added or taken away, and a view shown. Their names are no
  // identifiers of DESL, so they are none of a specification's.
  const { cells, columns, rows, views } = surface;
  const quote = (name: string): string => `'${name}'`;
  const cellOf = `self.childrenOfType(${quote(cells.type)}).filter(c, c.${cells.column} == p.column)`;
  const cellSlot = slotFor(rows.type, cells.type);
  const itemSlot = cells.items === undefined ? undefined : slotFor(cells.type, cells.items);
  const within = (slot: string | undefined): Record<string, string> => (slot === undefined ? {} : { slot: quote(slot) });
  const column = { type: columns.type, required: true };
  const quick: Record<string, unknown> = {};
  for (const valueType of Object.values(surface.valueTypes)) {
    const { key } = valueType;
    if (!valueType.many) {
      quick[`=${key}`] = {
        for: [rows.type], params: { column, value: { type: typesOf(cells.type)[key]?.type ?? 'string' } },
        actions: [
          { let: { cell: cellOf } },
          {
            if: 'cell.size() == 0',
            then: [{ create: { type: quote(cells.type), parent: 'self', ...within(cellSlot), attributes: { [cells.column]: 'p.column', [key]: 'p.value' } }, when: 'has(p.value)' }],
            else: [{ set: { [key]: 'p.value' }, target: 'cell[0]', when: 'has(p.value)' }, { unset: [key], target: 'cell[0]', when: '!has(p.value)' }],
          },
        ],
      };
    } else if (cells.items !== undefined) {
      const item = { create: { type: quote(cells.items), ...within(itemSlot), attributes: { [key]: 'p.value' } } };
      const params = { column, value: { type: typesOf(cells.items)[key]?.type ?? 'string', required: true } };
      const held = (cell: string): string => `${cell}.childrenOfType(${quote(cells.items!)}).filter(i, i.${key} == p.value)`;
      quick[`+${key}`] = {
        for: [rows.type], params,
        actions: [
          { let: { cell: cellOf } },
          {
            if: 'cell.size() == 0',
            then: [
              { create: { type: quote(cells.type), parent: 'self', ...within(cellSlot), attributes: { [cells.column]: 'p.column' } }, as: 'made' },
              { create: { ...item.create, parent: 'made' } },
            ],
            else: [{ create: { ...item.create, parent: 'cell[0]' }, when: `${held('cell[0]')}.size() == 0` }],
          },
        ],
      };
      quick[`-${key}`] = {
        for: [rows.type], params,
        actions: [{ let: { cell: cellOf } }, { if: 'cell.size() > 0', then: [{ forEach: held('cell[0]'), as: 'i', do: [{ delete: 'i' }] }] }],
      };
    }
  }
  if (views.active !== undefined) quick['>'] = { for: [views.type], actions: [{ set: { [views.active]: 'self' }, target: 'document' }] };

  const operations: Record<string, unknown> = { ...quick };
  for (const [id, operation] of Object.entries(designer.operations)) {
    if (isObject(operation)) operations[id] = { ...operation, for: scoped(operation.for), actions: assigning(operation.actions) };
  }
  const specification = { ...designer.interpreted, behavior: { operations } } as Specification;

  // ---- ids (DESL 5.3) ----

  const rules = persistence.ids.types ?? {};
  const ruleOf = (type: string): IdRule | undefined => (Object.hasOwn(rules, type) && rules[type].strategy === 'derived' && rules[type].expression !== undefined ? rules[type] : undefined);
  const counters = counterRules(persistence);
  const counterOf = (type: string) => counters.find((rule) => rule.type === type);
  // An element of a type whose id is derived is made under a name of its own, and renamed once the transaction has given it what its id is derived from.
  let made = 0;
  const pending = '\u0001';
  const provisional = (): string => `${pending}${made++}`;
  const behavior = interpretBehavior(specification, metamodel, expressions, {
    constraints, persistence,
    layout: interpretLayout(specification).value,
    coordinates: interpretCoordinates(specification, metamodel).value,
    toolbox: interpretToolbox(specification, metamodel).value,
    newId: (type) => (ruleOf(type) || counterOf(type) ? provisional() : newId(persistence, type)),
  });
  findings.push(...behavior.findings);
  for (const [type, rule] of Object.entries(rules)) {
    const error = ruleOf(type) ? expressions.compile(rule.expression!).error : undefined;
    if (error !== undefined) findings.push(finding('desl.persistence', 'error', `The id of \`${type}\` cannot be derived: ${error}`));
  }

  /** The id a rule derives for an element of a model, or nothing when its expression gives none. */
  const derived = (model: Model, id: string, rule: IdRule): string | undefined => {
    const result = expressions.evaluate(rule.expression!, expressions.over(model).scope(id));
    return result.ok && typeof result.value === 'string' && result.value !== '' ? result.value : undefined;
  };

  /** The attribute of the metamodel a binding's attribute of a binding's type is read as, when there is one. */
  const declaredOf = (type: string, attribute: string): Attribute | undefined => {
    const entry = entryOf(persistence, type);
    const named = mapped(entry, attribute);
    const known = typesOf(entry.as);
    return named !== null && Object.hasOwn(known, named) ? known[named] : undefined;
  };
  const unreadableTypes = new Set(Object.entries(persistence.typeMap).filter(([, entry]) => entry.as === 'unreadable').map(([type]) => type));
  const reading: Operations['reading'] = (binding) => ({
    timeAttributes: momentAttributes(binding, metamodel, persistence),
    attributeType: (type, attribute) => declaredOf(type, attribute)?.type,
    many: (type, attribute) => declaredOf(type, attribute)?.many === true,
    unreadableTypes,
    // The identity context (DESL 9.3) over what the reader knows when it asks: the element with its attributes, its
    // parent, the siblings read before it in its slot, and what its references name.
    // simplified: the siblings stand in as elements of its own type, and of its ancestors only the parent is there; read more of the body when a rule derives an id from more.
    deriveId: (request: IdRequest): string | undefined => {
      const entry = entryOf(persistence, request.type);
      const rule = ruleOf(entry.as);
      if (!rule) return undefined;
      const stub = (id: string, type: string, more: Partial<ModelElement> = {}): ModelElement => ({ id, type, attributes: {}, host: {}, ephemeral: true, line: 0, ...more });
      const attributes: Record<string, Value> = {};
      const named: ModelElement[] = [];
      for (const [name, stored] of Object.entries(request.attributes)) {
        const target = mapped(entry, name);
        const declared = target === null ? undefined : typesOf(entry.as)[target];
        const value = declared && stored !== null && stored !== undefined ? fromStored(stored, declared, metamodel) : undefined;
        if (!declared || value === undefined) continue;
        attributes[target!] = value;
        if (typeof value === 'string' && valueKind(metamodel, declared.type).kind === 'reference') named.push(stub(value, declared.type));
      }
      const parentRule = findRule(binding, findRule(binding, request.rule)?.parent?.rules[0] ?? '');
      const place = { ...(request.parentId === undefined ? {} : { parent: request.parentId }), ...(request.parentSlot === undefined ? {} : { slot: request.parentSlot }) };
      const self = '\u0000';
      const elements = [
        ...(request.parentId !== undefined && parentRule ? [stub(request.parentId, entryOf(persistence, parentRule.type).as)] : []),
        ...named.filter((element, index) => element.id !== request.parentId && named.findIndex((other) => other.id === element.id) === index),
        ...Array.from({ length: request.positionInSlot }, (_sibling, index) => stub(`${self}${index}`, entry.as, place)),
        stub(self, entry.as, { attributes, ...place }),
      ];
      return derived({ diagram: {}, elements, relations: [] }, self, rule);
    },
  });

  // ---- what a transaction comes to ----

  /** The changes with one id written as another, wherever it is: an element, a parent, a place, a reference. */
  const renamed = (changes: readonly Change[], from: string, to: string): Change[] => {
    const id = (value: string): string => (value === from ? to : value);
    const place = <T extends Change>(change: T): T => {
      const position = 'position' in change ? change.position : undefined;
      const beside = position === undefined || 'index' in position ? position : 'after' in position ? { after: id(position.after) } : { before: id(position.before) };
      return { ...change, id: id(change.id), ...('parent' in change && change.parent !== undefined ? { parent: id(change.parent) } : {}), ...(beside === undefined ? {} : { position: beside }) };
    };
    return changes.map((change) => {
      if (change.kind !== 'add' && change.kind !== 'set') return place(change);
      const attributes = Object.fromEntries(Object.entries(change.attributes).map(([name, value]) => [name, value === from ? to : value]));
      return { ...place(change), attributes } as Change;
    });
  };

  /** The second rule of this module: a value that is its attribute's default is not stored. */
  const unstored = (changes: readonly Change[], model: Model): Change[] => changes.flatMap((change): Change[] => {
    if (change.kind !== 'add' && change.kind !== 'set') return [change];
    const type = change.kind === 'add' ? change.type : change.id === '' ? 'diagram' : [...model.elements, ...changes.filter((other) => other.kind === 'add')].find((element) => element.id === change.id)?.type;
    const known = type === undefined ? {} : typesOf(type);
    const standard = (name: string, value: Value | null): boolean => value !== null && Object.hasOwn(known, name) && defaultOf(known[name]) !== undefined && JSON.stringify(defaultOf(known[name])) === JSON.stringify(value);
    const entries = Object.entries(change.attributes);
    if (change.kind === 'add') return [{ ...change, attributes: Object.fromEntries(entries.filter(([name, value]) => !standard(name, value))) }];
    return [{ ...change, attributes: Object.fromEntries(entries.map(([name, value]) => [name, standard(name, value) ? null : value])) }];
  });

  // The written form of a value: the text a cell shows (DESL 7.6).
  const nameOf = (model: Model, id: Value | undefined): string => {
    const element = typeof id === 'string' ? model.elements.find((candidate) => candidate.id === id) : undefined;
    const label = element && metamodel.types[element.type]?.labelAttribute;
    const name = element && label !== undefined ? element.attributes[label] : undefined;
    return typeof name === 'string' ? name : String(id ?? '');
  };
  const writtenForm = (model: Model, value: Value, attribute: Attribute | undefined): string =>
    (attribute && valueKind(metamodel, attribute.type).kind === 'reference' ? nameOf(model, value) : String(value));
  // A text parsed in the form of a primitive type, or nothing when it is not in that form.
  const parsed = (written: string, primitive: string): Value | undefined => {
    switch (primitive) {
      case 'number': return /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(written) ? Number(written) : undefined;
      case 'int': return /^-?(0|[1-9]\d*)$/.test(written) ? Number(written) : undefined;
      case 'bool': return written === 'true' ? true : written === 'false' ? false : undefined;
      case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(written) ? written : undefined;
      case 'datetime': return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(written) ? written : undefined;
      case 'time': return /^\d{2}:\d{2}(:\d{2})?$/.test(written) ? written : undefined;
      default: return written;
    }
  };

  /**
   * The changes that convert the cells of every column whose value type a transaction changed
   * (DESL 7.6). A value its conversion does not convert stays as it is, under its old key.
   */
  function conversions(before: Model, after: Model): Change[] {
    const changes: Change[] = [];
    const itemsOf = (cell: string): ModelElement[] => (cells.items === undefined ? [] : after.elements.filter((element) => element.parent === cell && element.type === cells.items));
    for (const changed of after.elements.filter((element) => element.type === columns.type)) {
      const was = before.elements.find((element) => element.id === changed.id)?.attributes[columns.valueType];
      const now = changed.attributes[columns.valueType];
      const from: ValueType | undefined = typeof was === 'string' && Object.hasOwn(surface.valueTypes, was) ? surface.valueTypes[was] : undefined;
      const to: ValueType | undefined = typeof now === 'string' && Object.hasOwn(surface.valueTypes, now) ? surface.valueTypes[now] : undefined;
      const conversion = from && to && from !== to && Object.hasOwn(from.converts, to.id) ? from.converts[to.id] : undefined;
      if (!from || !to || conversion === undefined) continue;
      const source = typesOf(from.many ? cells.items ?? cells.type : cells.type)[from.key];
      const target = typesOf(to.many ? cells.items ?? cells.type : cells.type)[to.key];
      const options = columns.options;
      const created = new Map<string, string>();
      // The option of a column whose name is a text, ignoring case: the one it has, else one that is created for it, once.
      const optionOf = (written: string): string | undefined => {
        if (!options) return undefined;
        const wanted = written.toLowerCase();
        const has = after.elements.find((element) => element.parent === changed.id && element.type === options.type && String(element.attributes[options.name] ?? '').toLowerCase() === wanted);
        if (has || created.has(wanted)) return has?.id ?? created.get(wanted);
        const id = newId(persistence, options.type);
        const slot = slotFor(columns.type, options.type);
        changes.push({ kind: 'add', id, type: options.type, parent: changed.id, ...(slot === undefined ? {} : { slot }), attributes: { [options.name]: written } });
        created.set(wanted, id);
        return id;
      };
      const item = (cell: string, value: Value): Change => ({ kind: 'add', id: provisional(), type: cells.items!, parent: cell, ...(itemSlot === undefined ? {} : { slot: itemSlot }), attributes: { [to.key]: value } });
      for (const cell of after.elements.filter((element) => element.type === cells.type && element.attributes[cells.column] === changed.id)) {
        const items = from.many ? itemsOf(cell.id).filter((element) => element.attributes[from.key] !== undefined) : [];
        const value = from.many ? undefined : cell.attributes[from.key];
        if (from.many ? items.length === 0 : value === undefined) continue;
        const values = from.many ? items.map((element) => element.attributes[from.key]) : [value!];
        // One value, in the type of the key it goes under, or nothing when the conversion does not convert it.
        let converted: Value | undefined;
        if (conversion === 'written-form') converted = values.map((one) => writtenForm(after, one, source)).join(', ');
        else if (conversion === 'parse' && typeof value === 'string') converted = parsed(value, target ? (valueKind(metamodel, target.type) as { primitive?: string }).primitive ?? 'string' : 'string');
        else if (conversion === 'match-option' && typeof value === 'string' && value !== '') converted = optionOf(value);
        else if (conversion === 'wrap' && !from.many && to.many) converted = value;
        else if (conversion === 'unwrap' && from.many && !to.many && values.length === 1) converted = values[0];
        if (converted === undefined) continue;
        for (const old of items) changes.push({ kind: 'remove', id: old.id });
        if (to.many && cells.items !== undefined) {
          if (!from.many) changes.push({ kind: 'set', id: cell.id, attributes: { [from.key]: null } });
          changes.push(item(cell.id, converted));
        } else {
          changes.push({ kind: 'set', id: cell.id, attributes: { ...(from.many || from.key === to.key ? {} : { [from.key]: null }), [to.key]: converted } });
        }
      }
    }
    return changes;
  }

  /** A transaction's outcome, with what DESL asks of it beside its actions. */
  function concluded(model: Model, outcome: Outcome): Outcome {
    if (outcome.refused !== undefined) return outcome;
    let changes = [...outcome.changes, ...conversions(model, outcome.after)];
    // A value that is set back to what the document holds is no change of it.
    const held = (id: string, name: string): Value | null => (id === '' ? model.diagram : model.elements.find((element) => element.id === id)?.attributes)?.[name] ?? null;
    changes = unstored(changes, model)
      .map((change) => (change.kind !== 'set' ? change : { ...change, attributes: Object.fromEntries(Object.entries(change.attributes).filter(([name, value]) => changes.some((other) => other.kind === 'add' && other.id === change.id) || JSON.stringify(held(change.id, name)) !== JSON.stringify(value))) }))
      .filter((change) => change.kind !== 'set' || Object.keys(change.attributes).length > 0);
    // The counted ids (DESL 5.3.5), in the order the transaction made them, and one set of each mark to the last id it gave.
    const counted: string[] = [];
    const known: Model = { diagram: model.diagram, elements: [...model.elements, ...outcome.after.elements], relations: [] };
    for (const added of changes.filter((change) => change.kind === 'add' && change.id.startsWith(pending))) {
      const rule = added.kind === 'add' ? counterOf(added.type) : undefined;
      if (!rule) continue;
      const id = nextCounted(rule, known, counted);
      changes = renamed(changes, added.id, id);
      counted.push(id);
    }
    changes = [...changes, ...markSets(counters, model, counted)];
    // The derived ids, parents before children: a change that adds an element comes after the one that adds what it lies in.
    for (const added of changes.filter((change) => change.kind === 'add' && change.id.startsWith(pending))) {
      const rule = added.kind === 'add' ? ruleOf(added.type) : undefined;
      const id = rule ? derived(applyChanges(model, changes), added.id, rule) : undefined;
      if (id === undefined) return { refused: 'This could not be done: the id of what it makes could not be worked out.' };
      if (model.elements.some((element) => element.id === id) || changes.some((change) => change.kind === 'add' && change.id === id)) return { refused: `The document already has \`${id}\`, and a second one could not be told from it.` };
      changes = renamed(changes, added.id, id);
    }
    const created = changes.filter((change) => change.kind === 'add').map((change) => change.id);
    return { ...outcome, changes, created, after: applyChanges(model, changes) };
  }

  // ---- what is offered ----

  const typeOf = (model: Model, id: string): string | undefined => model.elements.find((element) => element.id === id)?.type;
  const unoffered: Availability = { offered: false, available: false, label: '' };
  const availability: Operations['availability'] = (model, id, selection) => {
    const operation = all.find((candidate) => candidate.id === id);
    if (!operation) return unoffered;
    // On a table the selection is rows (DESL 7.2): an operation for the selection is for them, one for a type for the one element selected, and one for the document for nothing selected.
    const whole = operation.for.includes('selection') && selection.length > 0 && selection.every((selected) => typeOf(model, selected) === rows.type);
    const one = selection.length === 1 && operation.for.includes(typeOf(model, selection[0]) ?? '');
    const none = selection.length === 0 && operation.for.includes('document');
    return whole || one || none ? behavior.value.availability(model, id, selection) : unoffered;
  };

  const run: Operations['run'] = (model, id, selection, args) => {
    const state = declaredIds.has(id) ? availability(model, id, selection) : behavior.value.availability(model, id, selection);
    if (!state.offered) return { refused: NOT_HERE };
    return concluded(model, behavior.value.operate(model, id, selection, undefined, undefined, args));
  };

  /** The value type of a column of a model, when the specification has it. */
  const valueTypeOf = (model: Model, id: string): ValueType | undefined => {
    const element = model.elements.find((candidate) => candidate.id === id && candidate.type === columns.type);
    const name = element?.attributes[columns.valueType];
    return typeof name === 'string' && Object.hasOwn(surface.valueTypes, name) ? surface.valueTypes[name] : undefined;
  };

  return {
    value: {
      all, availability, run, reading,
      setCell: (model, row, column, value) => {
        const valueType = valueTypeOf(model, column);
        if (!valueType || valueType.many) return { refused: NO_VALUE };
        return run(model, `=${valueType.key}`, [row], { column, ...(value === null ? {} : { value }) });
      },
      setItem: (model, row, column, value, present) => {
        const valueType = valueTypeOf(model, column);
        if (!valueType?.many) return { refused: NO_VALUE };
        return run(model, `${present ? '+' : '-'}${valueType.key}`, [row], { column, value });
      },
      activate: (model, view) => (views.active === undefined ? { refused: NOT_HERE } : run(model, '>', [view])),
    },
    findings,
  };
}
