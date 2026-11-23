// The CEL environment of DISL 12 on `@marcbachmann/cel-js`: the library parses and evaluates, and
// this module adds what DISL puts on top of CEL: elements with their attributes and their
// neighbours, the function library of 12.4 as far as it is built, and a specification's own
// `functions`. In CEL an integer is a `bigint` and any other number a `number`, as the library
// has it; what an evaluation gives back is plain data again.

import { Environment, Optional, serialize, type ASTNode } from '@marcbachmann/cel-js';
import { attributesOf, defaultOf, isA, ordinal, parseYearMonth, valueKind, yearMonthOf, zeroOf, type Metamodel } from './metamodel';
import { finding, type Attributes, type Finding, type Model, type ModelElement, type ModelRelation, type Value } from './model';
import { elementaryCycles, type Cycles } from './cycles';
import { celOf, isObject, type Attribute, type Expression, type Specification } from './specification';

/** The variables of one evaluation, by name (DISL 12.3). An integer among them is a `bigint`. */
export type Scope = Readonly<Record<string, unknown>>;

/**
 * What an evaluation gave. `value` is plain data: a number for an integer, an id for an element,
 * null for an optional without a value. `raw` is the same as CEL holds it, for a later scope.
 * A failure is a result, never an exception: its caller turns it into a finding or a default (DISL 2.5).
 */
export type Evaluated =
  | { readonly ok: true; readonly value: Value; readonly raw: unknown }
  | { readonly ok: false; readonly error: string };

/** An expression parsed once. `error` says why it could not be parsed; evaluating it then fails with the same words. */
export interface Compiled {
  readonly cel: string;
  readonly error?: string;
  evaluate(scope?: Scope): Evaluated;
}

/** A model as CEL sees it: `diagram`, and each element as `self` or behind a relation's end. */
export interface World {
  readonly diagram: unknown;
  /** The element with this id as CEL holds it, or null. */
  element(id: string): unknown;
  /** `diagram` and `env`, `self` when an id is given, and whatever else the context binds. */
  scope(self?: string, more?: Scope): Scope;
  /** A value of the model as CEL holds it, by the type of its attribute. */
  toCel(value: Value | undefined, attribute: Attribute): unknown;
}

export interface WorldOptions {
  /** Members of `env` (DISL 12.2) that differ from their defaults, such as `viewpoint`, `mode`, `zoom` and `readOnly`. */
  readonly env?: Scope;
  /** `self.view` of an element: its placement in the current view. Without it, `view` is null, as in a headless context. */
  view?(id: string): Scope | undefined;
  /** `diagram.file`: the name of the file the model was read from (DISL 8.6). */
  readonly file?: string;
  /** The host attribute that holds the id an element is written with (DISL 0.10, `persistence.writtenId`): `self.id` reads it, the empty text where the element has none. */
  readonly writtenId?: string;
}

export interface Expressions {
  /** The functions of the specification that could not be read. */
  readonly findings: readonly Finding[];
  /** Parses an expression, once for each source text. */
  compile(expression: Expression): Compiled;
  evaluate(expression: Expression, scope?: Scope): Evaluated;
  over(model: Model, options?: WorldOptions): World;
}

export interface ExpressionOptions {
  readonly locale?: string;
  /** The host's measure of a text at a font size, for a specification whose text metric is `host` (DISL 6.5). */
  textWidth?(text: string, fontSize: number): number;
  /** Functions of the language the specification is written in that DISL does not have, each registered by its signature. */
  library?(register: (signature: string, handler: (...args: never[]) => unknown) => void): void;
  /** The host's implementation of a plugin function a specification declares (DISL 13.1.1), by the plugin's id and the function's name. */
  pluginFunction?(plugin: string, name: string): PluginFunction | undefined;
}

/**
 * A plugin function as a host carries it (DISL 13.1.1): its arguments as CEL holds them, `read`, which reads a
 * member of an element as an expression would, and `host`, which reads what the binding reads of an element beside
 * the model (a host attribute, DISL 11.2), which no expression can. What it gives back is held by CEL as it is:
 * elements, lists, strings.
 */
export type PluginFunction = (args: readonly unknown[], read: (target: unknown, name: string) => unknown, host: (target: unknown, name: string) => unknown) => unknown;

// The library tells a value of a type of its own by its constructor, so an element is an object of
// this class, and reads its members through a proxy. What CEL may not see of it is kept beside it.
class Entity {}
class Namespace {}

interface Facts {
  readonly id: string;
  readonly type: string;
  /** Whether a member holds a value of its own, which is what `has()` and `.?` ask (DISL 4.3). */
  stored(name: string): boolean;
  find(id: string): Entity | null;
  /** A host attribute of the element (DISL 11.2), for a plugin function. */
  host?(name: string): unknown;
}

const facts = new WeakMap<object, Facts>();
const factsOf = (value: unknown): Facts | undefined => (typeof value === 'object' && value !== null ? facts.get(value) : undefined);

const reason = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const summary = (error as { summary?: unknown }).summary;
  return typeof summary === 'string' ? summary : error.message.split('\n')[0];
};

const number = (value: unknown): number => Number(value);

// The parts of the library's macro protocol `sortBy` uses: the checker and evaluator are its own, typed here as far as they are read.
interface MacroChecker { check(node: unknown, ctx: MacroContext): { readonly kind: string; readonly valueType?: unknown } }
interface MacroContext { forkWithVariable(name: string, type: unknown): MacroContext; reuse(ctx: MacroContext): MacroContext; setIterValue(value: unknown, evaluator: MacroEvaluator): MacroContext }
interface MacroEvaluator { run(node: unknown, ctx: MacroContext): unknown }
interface SortBy { readonly receiver: unknown; readonly bound: string; readonly key: unknown; keyCtx?: MacroContext; readonly typeCheck: typeof sortByCheck; readonly evaluate: typeof sortByEvaluate }

const compareKeys = (a: unknown, b: unknown): number =>
  typeof a === 'string' && typeof b === 'string' ? (a < b ? -1 : a > b ? 1 : 0) : Number(a) - Number(b);

function sortByCheck(checker: MacroChecker, macro: SortBy, ctx: MacroContext): unknown {
  const listType = checker.check(macro.receiver, ctx);
  macro.keyCtx = ctx.forkWithVariable(macro.bound, listType.kind === 'list' ? listType.valueType : listType);
  checker.check(macro.key, macro.keyCtx);
  return listType;
}

function sortByEvaluate(evaluator: MacroEvaluator, macro: SortBy, ctx: MacroContext): unknown {
  const items = evaluator.run(macro.receiver, ctx);
  if (!Array.isArray(items)) throw new Error('sortBy() needs a list.');
  const keyed = items.map((item: unknown, index) => ({ item, index, key: evaluator.run(macro.key, macro.keyCtx!.reuse(ctx).setIterValue(item, evaluator)) }));
  return keyed.sort((a, b) => compareKeys(a.key, b.key) || a.index - b.index).map(entry => entry.item);
}

function sortByMacro({ args, receiver }: { readonly args: readonly { readonly op: string; readonly args: unknown }[]; readonly receiver: unknown }): SortBy {
  if (args[0].op !== 'id') throw new Error('sortBy(x, key) needs a name to bind each item to as its first argument.');
  return { receiver, bound: args[0].args as string, key: args[1], typeCheck: sortByCheck, evaluate: sortByEvaluate };
}

/** Creates the environment of one specification. It is made once and kept: making it is the expensive part. */
export function createExpressions(specification: Specification, metamodel: Metamodel, options: ExpressionOptions = {}): Expressions {
  const locale = options.locale ?? specification.language.defaultLocale ?? 'en';
  const environment = new Environment({ unlistedVariablesAreDyn: true, enableOptionalTypes: true, homogeneousAggregateLiterals: false });
  const findings: Finding[] = [];
  environment.registerType('Entity', Entity).registerType('Namespace', Namespace);
  environment.registerConstant('math', 'Namespace', new Namespace()).registerConstant('lists', 'Namespace', new Namespace());
  const register = <A extends unknown[]>(signature: string, handler: (...args: A) => unknown): void =>
    void environment.registerFunction(signature, handler as (...args: unknown[]) => unknown);

  // The scope of the evaluation in progress: a function that uses `diagram` or `env` reads it there.
  let active: Scope = {};

  // ---- members of elements ----

  const member = (target: unknown, name: string): unknown => {
    if (target instanceof Optional) return target.hasValue() ? member(target.value(), name) : undefined;
    if (target instanceof Map) return target.get(name);
    return typeof target === 'object' && target !== null && (factsOf(target) || Object.hasOwn(target, name)) ? (target as Record<string, unknown>)[name] : undefined;
  };
  const has = (target: unknown, name: string): boolean => {
    if (target instanceof Optional) return target.hasValue() && has(target.value(), name);
    return factsOf(target)?.stored(name) ?? member(target, name) !== undefined;
  };
  register('__has(dyn, string): bool', has);
  register('__field(dyn, string): optional<dyn>', (target: unknown, name: string) => (has(target, name) ? Optional.of(member(target, name)) : Optional.none()));

  const typed = (name: string) => (entity: Entity): boolean => isA(metamodel, factsOf(entity)?.type ?? '', name);
  const list = (entity: Entity, name: string): Entity[] => member(entity, name) as Entity[];
  register('Entity.isA(string): bool', (entity: Entity, type: string) => typed(type)(entity));
  register('Entity.incomingOf(string): list<dyn>', (entity: Entity, type: string) => list(entity, 'incoming').filter(typed(type)));
  register('Entity.outgoingOf(string): list<dyn>', (entity: Entity, type: string) => list(entity, 'outgoing').filter(typed(type)));
  register('Entity.nodesOfType(string): list<dyn>', (entity: Entity, type: string) => list(entity, 'nodes').filter(typed(type)));
  register('Entity.relationsOfType(string): list<dyn>', (entity: Entity, type: string) => list(entity, 'relations').filter(typed(type)));
  register('Entity.elementById(string): dyn', (entity: Entity, id: string) => factsOf(entity)?.find(id) ?? null);
  // Every node under a node, a node before what is under it; and what a node is in, the nearest first (DISL 12.2).
  const under = (entity: Entity): Entity[] => list(entity, 'children').flatMap((child) => [child, ...under(child)]);
  register('Entity.descendants(): list<dyn>', under);
  register('Entity.ancestors(): list<dyn>', (entity: Entity) => {
    const above: Entity[] = [];
    for (let parent = member(entity, 'parent'); parent instanceof Entity; parent = member(parent, 'parent')) above.push(parent);
    return above;
  });
  // What DESL adds to an element and to the document (DESL 9.2, 9.4). Elements are compared by identity, never by id.
  register('Entity.elementsOfType(string): list<dyn>', (entity: Entity, type: string) => list(entity, 'elements').filter(typed(type)));
  register('Entity.childrenOfType(string): list<dyn>', (entity: Entity, type: string) => list(entity, 'children').filter(typed(type)));
  register('Entity.ancestorsOfType(string): list<dyn>', (entity: Entity, type: string) => {
    const above: Entity[] = [];
    for (let parent = member(entity, 'parent'); parent instanceof Entity; parent = member(parent, 'parent')) if (typed(type)(parent)) above.push(parent);
    return above;
  });
  register('Entity.positionIn(list<dyn>): int', (entity: Entity, items: unknown[]) => BigInt(items.indexOf(entity)));
  register('list.isUnique(): bool', (items: unknown[]) => new Set(items).size === items.length);
  // The middle of a box, such as `self.view.bounds`, as its x and its y (DISL 12.2).
  register('map.center(): list<double>', (box: unknown) => {
    const side = (name: string): number => number(member(box, name) ?? 0);
    return [side('x') + side('width') / 2, side('y') + side('height') / 2];
  });
  // The elementary cycles over relations of a type, each starting at its member first in model order, ordered by their
  // first member, then lexicographically by member order: a depth-first walk of the successors in model order (DISL 12.4).
  const cyclesOver = (entity: Entity, type: string, max: bigint): Cycles => {
    const nodes = list(entity, 'nodes');
    const order = nodes.map((node) => factsOf(node)!.id);
    const position = new Map(order.map((id, index) => [id, index]));
    const successors = new Map<string, string[]>();
    for (const relation of list(entity, 'relations').filter(typed(type))) {
      const [from, to] = [factsOf(member(relation, 'source'))?.id, factsOf(member(relation, 'target'))?.id];
      if (from === undefined || to === undefined) continue;
      (successors.get(from) ?? successors.set(from, []).get(from)!).push(to);
    }
    for (const list of successors.values()) list.sort((a, b) => (position.get(a) ?? Infinity) - (position.get(b) ?? Infinity));
    return elementaryCycles(order, successors, Number(max));
  };
  register('Entity.cycles(string, int): list<dyn>', (entity: Entity, type: string, max: bigint) => {
    const byId = new Map(list(entity, 'nodes').map((node) => [factsOf(node)!.id, node]));
    return cyclesOver(entity, type, max).cycles.map((cycle) => cycle.map((id) => byId.get(id)));
  });
  register('Entity.cyclesTruncated(string, int): bool', (entity: Entity, type: string, max: bigint) => cyclesOver(entity, type, max).truncated);
  // The graph members of a node (DISL 12.2), over the relations of a type and its subtypes: the nodes one relation
  // leads to and comes from, in model order and each once; every node reached by following them, the node itself only
  // when it lies on a cycle; and whether it does (etalii.adp spec 090, research R2).
  const endOf = (relation: Entity, end: 'source' | 'target'): Entity | undefined => {
    const node = member(relation, end);
    return node instanceof Entity ? node : undefined;
  };
  const once = (nodes: (Entity | undefined)[]): Entity[] => [...new Set(nodes.filter((node): node is Entity => node !== undefined))];
  const successorsOf = (entity: Entity, type: string): Entity[] => once(list(entity, 'outgoing').filter(typed(type)).map((relation) => endOf(relation, 'target')));
  const reachableFrom = (entity: Entity, type: string): Entity[] => {
    const reached: Entity[] = [];
    const seen = new Set<Entity>();
    const next = [...successorsOf(entity, type)];
    for (let node = next.shift(); node !== undefined; node = next.shift()) {
      if (seen.has(node)) continue;
      seen.add(node);
      reached.push(node);
      next.push(...successorsOf(node, type));
    }
    return reached;
  };
  register('Entity.successors(string): list<dyn>', successorsOf);
  register('Entity.predecessors(string): list<dyn>', (entity: Entity, type: string) => once(list(entity, 'incoming').filter(typed(type)).map((relation) => endOf(relation, 'source'))));
  register('Entity.neighbors(): list<dyn>', (entity: Entity) =>
    once([...list(entity, 'incoming').map((relation) => endOf(relation, 'source')), ...list(entity, 'outgoing').map((relation) => endOf(relation, 'target'))]).filter((node) => node !== entity));
  register('Entity.reachable(string): list<dyn>', reachableFrom);
  register('Entity.inCycle(string): bool', (entity: Entity, type: string) => reachableFrom(entity, type).includes(entity));
  register('Entity.hasCycle(string): bool', (entity: Entity, type: string) => cyclesOver(entity, type, 1n).cycles.length > 0);
  options.library?.(register);
  register('Entity.label(): string', (entity: Entity) => String(member(entity, metamodel.types[factsOf(entity)?.type ?? '']?.labelAttribute ?? '') ?? ''));

  // ---- the function library (DISL 12.1 and 12.4), as far as it is built ----

  // Halves round away from zero, as CEL's `math.round` does and `Math.round` does not.
  register('Namespace.round(dyn): double', (_: unknown, value: unknown) => Math.sign(number(value)) * Math.round(Math.abs(number(value))));
  register('Namespace.floor(dyn): double', (_: unknown, value: unknown) => Math.floor(number(value)));
  register('Namespace.ceil(dyn): double', (_: unknown, value: unknown) => Math.ceil(number(value)));
  register('Namespace.trunc(dyn): double', (_: unknown, value: unknown) => Math.trunc(number(value)));
  register('Namespace.sqrt(dyn): double', (_: unknown, value: unknown) => Math.sqrt(number(value)));
  register('Namespace.abs(dyn): dyn', (_: unknown, value: unknown) => (typeof value === 'bigint' ? (value < 0n ? -value : value) : Math.abs(number(value))));
  register('Namespace.range(int): list<int>', (_: unknown, size: bigint) => Array.from({ length: Number(size) }, (_item, index) => BigInt(index)));
  const least = (...values: unknown[]): unknown => values.reduce((a, b) => ((b as number) < (a as number) ? b : a));
  const greatest = (...values: unknown[]): unknown => values.reduce((a, b) => ((b as number) > (a as number) ? b : a));
  for (const count of [2, 3, 4]) {
    const parameters = Array.from({ length: count }, () => 'dyn').join(', ');
    register(`min(${parameters}): dyn`, least);
    register(`max(${parameters}): dyn`, greatest);
    register(`Namespace.least(${parameters}): dyn`, (_: unknown, ...values: unknown[]) => least(...values));
    register(`Namespace.greatest(${parameters}): dyn`, (_: unknown, ...values: unknown[]) => greatest(...values));
  }
  register('clamp(dyn, dyn, dyn): dyn', (value: unknown, low: unknown, high: unknown) => greatest(low, least(value, high)));
  register('lower(string): string', (text: string) => text.toLowerCase());
  register('upper(string): string', (text: string) => text.toUpperCase());
  register('list.flatten(): list<dyn>', (items: unknown[]) => items.flat());
  register('list.distinct(): list<dyn>', (items: unknown[]) => [...new Set(items)]);
  // Strings by code point, numbers by value; stable (DISL 12.1).
  // CEL's list extension: the first and the last item, none of an empty list.
  register('list.first(): optional<dyn>', (items: unknown[]) => (items.length > 0 ? Optional.of(items[0]) : Optional.none()));
  register('list.last(): optional<dyn>', (items: unknown[]) => (items.length > 0 ? Optional.of(items[items.length - 1]) : Optional.none()));
  // CEL's list extension: the macro `sortBy(x, key)`, a stable sort by the key each item gives, strings by code point.
  void environment.registerFunction('list.sortBy(ast, ast): list<dyn>', sortByMacro as never);
  register('list.sort(): list<dyn>', (items: unknown[]) => [...items].sort(compareKeys));
  register('list.indexOf(dyn): int', (items: unknown[], item: unknown) => BigInt(items.indexOf(item)));
  // The numeric aggregates of DISL 12.4: an empty list has no average, minimum or maximum, which fails the expression.
  const numbers = (items: unknown[], name: string): number[] => {
    if (items.length === 0 && name !== 'sum') throw new Error(`${name}() of an empty list`);
    return items.map(number);
  };
  // The sum, the least and the greatest of whole numbers are whole numbers, and of a list holding another number a
  // double (DISL 12.4), so `….max() + 1` adds two ints, as CEL requires (etalii.adp spec 090, research R1). The sum of
  // an empty list is the whole number 0.
  const whole = (items: unknown[]): items is bigint[] => items.every((item) => typeof item === 'bigint');
  register('list.sum(): dyn', (items: unknown[]) => (whole(items) ? items.reduce((sum, item) => sum + item, 0n) : numbers(items, 'sum').reduce((sum, item) => sum + item, 0)));
  register('list.avg(): double', (items: unknown[]) => numbers(items, 'avg').reduce((sum, item) => sum + item, 0) / items.length);
  register('list.min(): dyn', (items: unknown[]) => (whole(items) && items.length > 0 ? items.reduce((a, b) => (b < a ? b : a)) : Math.min(...numbers(items, 'min'))));
  register('list.max(): dyn', (items: unknown[]) => (whole(items) && items.length > 0 ? items.reduce((a, b) => (b > a ? b : a)) : Math.max(...numbers(items, 'max'))));
  // simplified: a theme token is resolved by the page that draws, in its mode, so `token()` gives the paint `{token}` that names it (DISL 6.2).
  register('token(string): dyn', (name: string) => new Map([['token', name]]));

  register('yearMonth(dyn, dyn): int', (year: unknown, month: unknown) => BigInt(number(year) * 12 + number(month) - 1));
  register('int.year(): int', (index: bigint) => BigInt(yearMonthOf(Number(index)).year));
  register('int.month(): int', (index: bigint) => BigInt(yearMonthOf(Number(index)).month));
  register('parseYearMonth(string): optional<int>', (text: string) => {
    const index = parseYearMonth(text);
    return index === undefined ? Optional.none() : Optional.of(BigInt(index));
  });
  register('formatYearMonth(dyn, string): string', (index: unknown, pattern: string) => formatPattern(number(index), pattern, locale));
  register('formatNumber(dyn, string): string', (value: unknown, pattern: string) => formatNumber(value, pattern));
  register('formatDuration(dyn, string): string', (value: unknown, style: string) => formatDuration(value, style));

  register('enumLabel(string, dyn): string', (name: string, key: unknown) => metamodel.enums[name]?.values.find((value) => value.key === key)?.label ?? String(key));
  register('ordinal(dyn, string): int', (key: unknown, name: string) => BigInt(ordinal(metamodel, name, String(key))));

  const metric = specification.notation?.textMetric;
  register('textWidth(string, dyn): double', (text: string, fontSize: unknown) => {
    if (typeof metric === 'object') {
      // Graphemes are counted as code points: close for the texts a diagram holds, and the same in every host.
      const count = metric.count === 'codepoint' || metric.count === 'grapheme' ? [...text].length : text.length;
      return count * metric.advance * number(fontSize);
    }
    if (!options.textWidth) throw new Error('textWidth() has no text metric to measure with');
    return options.textWidth(text, number(fontSize));
  });

  // ---- parsing ----

  const parse = (cel: string): ((scope: Scope) => unknown) => environment.parse(needsRewrite.test(cel) ? rewrite(environment.parse(cel).ast) : cel);

  const cache = new Map<string, Compiled>();
  const compile = (expression: Expression): Compiled => {
    const cel = celOf(expression);
    const known = cache.get(cel);
    if (known) return known;
    let run: ((scope: Scope) => unknown) | undefined;
    let error: string | undefined;
    try { run = parse(cel); } catch (failure) { error = reason(failure); }
    const compiled: Compiled = {
      cel,
      error,
      evaluate(scope = {}) {
        if (!run) return { ok: false, error: error ?? '' };
        const outer = active;
        active = scope;
        try {
          const raw = run(scope);
          return { ok: true, value: plain(raw), raw };
        } catch (failure) {
          return { ok: false, error: reason(failure) };
        } finally {
          active = outer;
        }
      },
    };
    cache.set(cel, compiled);
    return compiled;
  };

  // ---- the specification's own functions (DISL 3.4) ----

  const declared = Object.entries(specification.functions ?? {});
  const bodies = new Map<string, (scope: Scope) => unknown>();
  const body = (cel: string): ((scope: Scope) => unknown) => bodies.get(cel) ?? bodies.set(cel, parse(cel)).get(cel)!;
  for (const [name, declaration] of declared) {
    let depth = 0;
    try {
      register(`${name}(${declaration.params.map(() => 'dyn').join(', ')}): dyn`, (...values: unknown[]) => {
        // A function sees its parameters, and of its caller's scope only what `uses` lists.
        const scope: Record<string, unknown> = Object.fromEntries(declaration.params.map((parameter, index) => [parameter.name, values[index]]));
        for (const used of declaration.uses ?? []) scope[used] = active[used];
        if (declaration.recursion && depth >= declaration.recursion.maxDepth) return body(declaration.recursion.atMaxDepth)(scope);
        depth++;
        try { return body(declaration.cel)(scope); } finally { depth--; }
      });
    } catch (failure) {
      findings.push(finding('disl.function', 'error', `The function \`${name}\` of the specification cannot be used: ${reason(failure)}`));
    }
  }
  // ---- the plugin functions a specification declares (DISL 13.1.1) ----

  // The host's implementation where it carries the plugin; else the declared fallback over the named parameters;
  // else an evaluation error, so that a constraint reports it could not be evaluated.
  for (const [plugin, declared] of Object.entries(isObject(specification.plugins) ? specification.plugins : {})) {
    for (const declaration of isObject(declared) && Array.isArray(declared.celFunctions) ? declared.celFunctions : []) {
      if (!isObject(declaration) || typeof declaration.name !== 'string') continue;
      const name = declaration.name;
      const params = (Array.isArray(declaration.params) ? declaration.params : []).map((param: unknown) => (isObject(param) && typeof param.name === 'string' ? param.name : ''));
      const uses = (Array.isArray(declaration.uses) ? declaration.uses : []).filter((used): used is string => typeof used === 'string');
      const carried = options.pluginFunction?.(plugin, name);
      const fallback = typeof declaration.fallback === 'string' ? declaration.fallback : undefined;
      try {
        register(`${name}(${params.map(() => 'dyn').join(', ')}): dyn`, (...values: unknown[]) => {
          if (carried) return carried(values, member, (target, attribute) => factsOf(target instanceof Optional ? (target.hasValue() ? target.value() : undefined) : target)?.host?.(attribute));
          if (fallback === undefined) throw new Error(`the plugin ${plugin}, which carries ${name}(), is not present`);
          const scope: Record<string, unknown> = Object.fromEntries(params.map((param, index) => [param, values[index]]));
          for (const used of uses) scope[used] = active[used];
          return body(fallback)(scope);
        });
      } catch (failure) {
        findings.push(finding('disl.function', 'error', `The plugin function \`${name}\` of the specification cannot be used: ${reason(failure)}`));
      }
    }
  }
  // Parsed only now, when every function is known, so that the order of declaration does not matter here.
  for (const [name, declaration] of declared) {
    try { body(declaration.cel); } catch (failure) {
      findings.push(finding('disl.function', 'error', `The function \`${name}\` of the specification cannot be read: ${reason(failure)}`));
    }
  }

  // ---- a model as CEL sees it ----

  const over = (model: Model, worldOptions: WorldOptions = {}): World => {
    const byId = new Map<string, ModelElement | ModelRelation>([...model.relations, ...model.elements].map((element) => [element.id, element]));
    const entities = new Map<string, Entity>();
    const env = { now: new Date(), locale, mode: 'light', zoom: 1.0, user: {}, viewpoint: '', readOnly: false, ...worldOptions.env };

    const entity = (known: Omit<Facts, 'find'>, read: (name: string) => unknown): Entity => {
      const proxy = new Proxy(new Entity(), {
        get: (target, name, receiver) => (typeof name === 'string' && name !== 'constructor' ? read(name) : Reflect.get(target, name, receiver) as unknown),
      });
      facts.set(proxy, { ...known, find });
      return proxy;
    };
    const toCel = (value: Value | undefined, attribute: Attribute): unknown => {
      const kind = valueKind(metamodel, attribute.type);
      const one = (item: Value): unknown => {
        if (kind.kind === 'reference') return typeof item === 'string' ? find(item) : null;
        const integer = kind.kind === 'primitive' && (kind.primitive === 'int' || kind.primitive === 'yearMonth');
        // A duration is written in ISO 8601 and is a CEL duration (DISL 4.2), so it has `getSeconds()` and arithmetic.
        if (kind.kind === 'primitive' && kind.primitive === 'duration' && typeof item === 'string') return durationOf(item) ?? item;
        return integer && typeof item === 'number' && Number.isInteger(item) ? BigInt(item) : item;
      };
      const present = value ?? defaultOf(attribute) ?? zeroOf(kind, attribute.many === true);
      return attribute.many === true && Array.isArray(present) ? present.map(one) : one(present);
    };
    const attribute = (type: string, stored: Attributes, name: string): unknown => {
      const attributes = attributesOf(metamodel, type);
      return Object.hasOwn(attributes, name) ? toCel(Object.hasOwn(stored, name) ? stored[name] : undefined, attributes[name]) : undefined;
    };
    const all = (elements: readonly ModelElement[]): Entity[] => elements.map((element) => find(element.id) as Entity);

    const diagram = entity({ id: '', type: 'diagram', stored: (name) => Object.hasOwn(model.diagram, name) }, (name) => {
      switch (name) {
        case 'id': return '';
        case 'type': case 'kind': return 'diagram';
        case 'file': return worldOptions.file ?? '';
        case 'nodes': return all(model.elements);
        case 'relations': return all(model.relations);
        case 'elements': return all([...model.elements, ...model.relations]);
        default: return attribute('diagram', model.diagram, name);
      }
    });

    function find(id: string | undefined): Entity | null {
      const element = id === undefined ? undefined : byId.get(id);
      if (!element) return null;
      const known = entities.get(element.id);
      if (known) return known;
      const relation = 'source' in element || 'target' in element || metamodel.types[element.type]?.kind === 'relation';
      const built = (name: string): unknown => {
        switch (name) {
          case 'id': return worldOptions.writtenId === undefined ? element.id : writtenText(element.host[worldOptions.writtenId]);
          case 'type': return element.type;
          case 'kind': return relation ? 'relation' : 'node';
          case 'view': return worldOptions.view?.(element.id) ?? null;
          case 'parent': return find(element.parent);
          case 'owner': return find(element.parent) ?? diagram;
          case 'children': return all(model.elements.filter((child) => child.parent === element.id));
          case 'incoming': return all(model.relations.filter((other) => other.target === element.id));
          case 'outgoing': return all(model.relations.filter((other) => other.source === element.id));
          case 'source': case 'target': return relation ? find((element as ModelRelation)[name]) : undefined;
          // The slot it is kept in (DESL 9.2), unless its type has an attribute of that name.
          case 'slot': return Object.hasOwn(attributesOf(metamodel, element.type), 'slot') ? undefined : element.slot ?? '';
          default: return undefined;
        }
      };
      // A derived attribute is its expression's value for this element, computed when it is read (DISL 4.3); one
      // that reads itself, directly or not, or fails, reads as its default or its zero value.
      const derivedValues = new Map<string, unknown>();
      const derivedOf = (name: string): unknown => {
        const declared = attributesOf(metamodel, element.type)[name];
        if (derivedValues.has(name)) return derivedValues.get(name);
        const fallback = toCel(undefined, declared);
        derivedValues.set(name, fallback);
        const result = compile(declared.derived!).evaluate({ diagram, document: diagram, env, self: created });
        const value = result.ok ? result.raw : fallback;
        derivedValues.set(name, value);
        return value;
      };
      const isDerived = (name: string): boolean => {
        const attributes = attributesOf(metamodel, element.type);
        return Object.hasOwn(attributes, name) && attributes[name].derived !== undefined;
      };
      const created: Entity = entity(
        { id: element.id, type: element.type, stored: (name) => Object.hasOwn(element.attributes, name) || (built(name) ?? null) !== null, host: (name) => element.host[name] },
        (name) => { const value = built(name); return value !== undefined ? value : isDerived(name) ? derivedOf(name) : attribute(element.type, element.attributes, name); },
      );
      entities.set(element.id, created);
      return created;
    }

    return {
      diagram,
      element: find,
      // `document` is DESL's name for what DISL calls `diagram` (DESL 9.3).
      scope: (self, more) => ({ diagram, document: diagram, env, ...(self === undefined ? {} : { self: find(self) }), ...more }),
      toCel,
    };
  };

  return { findings, compile, evaluate: (expression, scope) => compile(expression).evaluate(scope), over };
}

// ---- `has()` and `.?` ----

// The library reads a member in one way for `x.f`, `has(x.f)` and `x.?f`, and DISL does not: an
// attribute without a stored value reads as its default or its zero value, while `has()` and `.?`
// ask whether a value is stored (DISL 4.3). So an expression that holds either is written again
// with the two as calls of functions of this module, and parsed a second time.
//
// The same pass works around the library's typing of `o.value()`: on a variable it has no static
// type for, the result takes part in no comparison ("overlaps with"), so it is wrapped in `dyn()`.
const needsRewrite = /\.\?|\bhas\s*\(|\.value\s*\(|\.count\s*\(/;

function rewrite(node: ASTNode): string {
  const list = (nodes: readonly ASTNode[]): string => nodes.map(rewrite).join(', ');
  switch (node.op) {
    case 'value': {
      const value = node.args;
      if (typeof value === 'string') return JSON.stringify(value);
      if (typeof value === 'number') return /[.e]/.test(String(value)) ? String(value) : `${value}.0`;
      return typeof value === 'bigint' || typeof value === 'boolean' || value === null ? String(value) : serialize(node);
    }
    case 'id': return node.args;
    case '.': return `${rewrite(node.args[0])}.${node.args[1]}`;
    case '.?': return `__field(${rewrite(node.args[0])}, ${JSON.stringify(node.args[1])})`;
    case '[]': return `${rewrite(node.args[0])}[${rewrite(node.args[1])}]`;
    case '[?]': return `${rewrite(node.args[0])}[?${rewrite(node.args[1])}]`;
    case 'call': {
      const [name, parameters] = node.args;
      const asked = name === 'has' && parameters.length === 1 ? parameters[0] : undefined;
      return asked?.op === '.' ? `__has(${rewrite(asked.args[0])}, ${JSON.stringify(asked.args[1])})` : `${name}(${list(parameters)})`;
    }
    case 'rcall': {
      // DISL 12.4's macro `l.count(x, pred)`: the number of items for which `pred` holds.
      if (node.args[0] === 'count' && node.args[2].length === 2) return `${rewrite(node.args[1])}.filter(${list(node.args[2])}).size()`;
      const call = `${rewrite(node.args[1])}.${node.args[0]}(${list(node.args[2])})`;
      return node.args[0] === 'value' && node.args[2].length === 0 ? `dyn(${call})` : call;
    }
    case 'list': return `[${list(node.args)}]`;
    case 'map': return `{${node.args.map(([key, value]) => `${rewrite(key)}: ${rewrite(value)}`).join(', ')}}`;
    case '?:': return `(${rewrite(node.args[0])} ? ${rewrite(node.args[1])} : ${rewrite(node.args[2])})`;
    case '!_': return `(!${rewrite(node.args)})`;
    case '-_': return `(-${rewrite(node.args)})`;
    default: return `(${rewrite(node.args[0])} ${node.op} ${rewrite(node.args[1])})`;
  }
}

// ---- durations and numbers (DISL 4.2, 12.4) ----

/** The class of CEL's durations, which the library does not export by name. */
const Duration = (new Environment().evaluate("duration('0s')") as object).constructor as new (seconds: bigint | number, nanos?: number) => { readonly seconds: bigint; readonly nanos: number };

/** An ISO 8601 duration in weeks, days, hours, minutes and seconds (`PT20M`, `P2DT3H`) as a CEL duration; nothing for another text, a month or a year included. */
export function durationOf(text: string): InstanceType<typeof Duration> | undefined {
  const match = /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/.exec(text.trim());
  if (!match || /^-?PT?$/.test(text.trim())) return undefined;
  const [, minus, weeks, days, hours, minutes, seconds] = match;
  const whole = (part: string | undefined): number => (part === undefined ? 0 : Number(part));
  const fraction = Number((seconds ?? '0').replace(',', '.'));
  const total = ((whole(weeks) * 7 + whole(days)) * 24 + whole(hours)) * 3600 + whole(minutes) * 60 + Math.trunc(fraction);
  const nanos = Math.round((fraction - Math.trunc(fraction)) * 1e9);
  const duration = minus ? new Duration(-total, -nanos) : new Duration(total, nanos);
  written.set(duration, text);
  return duration;
}

/** The text each duration read from a document was written as, so that a copy of it is written the same way. */
const written = new WeakMap<object, string>();

/**
 * `formatDuration(d, style)` (DISL 12.4): `short` writes its days, hours, minutes and seconds that are
 * not zero, as `3d 4h`; `long` as `3 days 4 hours`; `iso` in ISO 8601. A duration of nothing is `0m`,
 * `0 minutes` and `PT0S`.
 */
function formatDuration(value: unknown, style: string): string {
  const duration = typeof value === 'string' ? durationOf(value) : value;
  if (!(duration instanceof Duration)) throw new Error('formatDuration() takes a duration.');
  let rest = Number(duration.seconds < 0n ? -duration.seconds : duration.seconds);
  const sign = duration.seconds < 0n ? '-' : '';
  const parts: [number, string, string, string][] = [];
  for (const [size, short, one, many] of [[86400, 'd', 'day', 'days'], [3600, 'h', 'hour', 'hours'], [60, 'm', 'minute', 'minutes'], [1, 's', 'second', 'seconds']] as const) {
    const count = Math.floor(rest / size);
    rest -= count * size;
    if (count > 0) parts.push([count, short, one, many]);
  }
  if (style === 'iso') {
    const of = (letter: string): string => parts.filter(([, short]) => short === letter).map(([count]) => `${count}${letter.toUpperCase()}`).join('');
    const time = `${of('h')}${of('m')}${of('s')}`;
    return `${sign}P${of('d')}${time.length > 0 ? `T${time}` : of('d').length > 0 ? '' : 'T0S'}`;
  }
  if (parts.length === 0) return style === 'long' ? '0 minutes' : '0m';
  return sign + parts.map(([count, short, one, many]) => (style === 'long' ? `${count} ${count === 1 ? one : many}` : `${count}${short}`)).join(' ');
}

/**
 * `formatNumber(n, pattern)` (DISL 12.4), in the patterns the hosts write: `0` a digit always written,
 * `#` one written when it is significant, `,` grouping by thousands and `.` the decimal point, in the
 * invariant culture; a half rounds away from zero.
 */
function formatNumber(value: unknown, pattern: string): string {
  if (!/^[#,]*0[0,]*(\.[0#]+)?$|^#[#,]*(\.[0#]+)?$/.test(pattern)) throw new Error(`'${pattern}' is not a number pattern: digits '0' and '#', grouping ',' and one decimal point '.'.`);
  if (typeof value !== 'bigint' && typeof value !== 'number') throw new Error('formatNumber() takes a number.');
  const [integerPart, decimalPart = ''] = pattern.split('.');
  const most = decimalPart.length;
  const least = decimalPart.replace(/#+$/, '').length;
  const scaled = Math.abs(Number(value)) * 10 ** most;
  const rounded = Math.round(scaled);
  let digits = String(rounded).padStart(most + 1, '0');
  let whole = digits.slice(0, digits.length - most);
  let decimals = digits.slice(digits.length - most);
  while (decimals.length > least && decimals.endsWith('0')) decimals = decimals.slice(0, -1);
  const minimum = (integerPart.match(/0/g) ?? []).length;
  whole = whole.replace(/^0+/, '').padStart(minimum, '0');
  if (integerPart.includes(',')) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  digits = decimals.length > 0 ? `${whole}.${decimals}` : whole;
  return (Number(value) < 0 && /[1-9]/.test(digits) ? '-' : '') + (digits.length > 0 ? digits : '0');
}

// ---- values ----

/** A host attribute's value as the text of an id: the empty text for none. */
const writtenText = (value: unknown): string => (value === undefined || value === null ? '' : String(value));

/** What CEL holds as plain data: a number for an integer, an id for an element, null for an optional without a value. */
function plain(value: unknown): Value {
  if (typeof value === 'bigint') return Number(value);
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Optional) return value.hasValue() ? plain(value.value()) : null;
  if (value instanceof Date) return value.toISOString();
  // A duration is stored as it was written, and one worked out in ISO 8601 (DISL 4.2).
  if (value instanceof Duration) return written.get(value) ?? formatDuration(value, 'iso');
  if (Array.isArray(value) || value instanceof Set) return [...value].map(plain);
  const known = factsOf(value);
  if (known) return known.id;
  const entries: [unknown, unknown][] = value instanceof Map ? [...value] : Object.entries(value);
  return Object.fromEntries(entries.map(([name, item]) => [String(name), plain(item)]));
}

// An LDML pattern as far as a month needs one: `u` and `y` are the signed astronomical year, `M`
// and `MM` the month's number, `MMM` and `MMMM` its name, and text between apostrophes is itself.
// A ruler writes its ticks with it too (DISL 5.13).
export function formatPattern(index: number, pattern: string, locale: string): string {
  const { year, month } = yearMonthOf(index);
  return pattern.replace(/'([^']*)'|[uy]+|M+/g, (token: string, quoted: string | undefined) => {
    if (quoted !== undefined) return quoted;
    if (token[0] !== 'M') return (year < 0 ? '-' : '') + String(Math.abs(year)).padStart(token.length, '0');
    if (token.length <= 2) return String(month).padStart(token.length, '0');
    return new Intl.DateTimeFormat(locale, { month: token.length === 3 ? 'short' : 'long', timeZone: 'UTC' }).format(Date.UTC(2000, month - 1, 1));
  });
}
