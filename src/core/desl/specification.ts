// A DESL specification (DESL 3) as this host reads one: the designer type of a `.des` file. DESL
// defines its own constructs, and its metamodel, its functions, its constraints and its
// expressions have the shape of DISL's, so they are read by the interpreter of `../disl/`: this
// module gives it the specification in the names it knows, where the document is what DISL calls
// the diagram. The surface and the operations are read by the modules beside this one.

import { createExpressions, type Expressions } from '../disl/expressions';
import type { Metamodel } from '../disl/metamodel';
import { finding, type Finding, type Loaded } from '../disl/model';
import type { InterpretedPersistence } from '../disl/persistence';
import { emptySpecification, isObject, type IdStrategy, type Specification, type TypeMapEntry } from '../disl/specification';

/** The minor version of DESL this interpreter reads; its major version is 0. */
export const deslMinor = 1;

/** The name the interpreter of `../disl/` has for the document as a whole. */
const whole = 'diagram';
/** And DESL's own (DESL 4.1, 5.2, 6.2, 8.1). */
const written = 'document';

export interface DesignerSpecification {
  /** The language, the functions, the metamodel and the constraints, as the interpreter of `../disl/` reads them. */
  readonly interpreted: Specification;
  /** How elements get their ids, and what the bindings' types are in the metamodel (DESL 5.2, 5.3). */
  readonly persistence: InterpretedPersistence;
  /** The bindings `persistence.bindings` names, one for each format family, as they are written. */
  readonly bindings: readonly string[];
  /** `surface` and `operations` as they are written: `./surface` and `./operations` read them. */
  readonly surface: unknown;
  readonly operations: Readonly<Record<string, unknown>>;
}

const nothing: DesignerSpecification = {
  interpreted: emptySpecification, bindings: [], surface: undefined, operations: {},
  persistence: { format: 'fbl', ids: { strategy: 'uuid-v7', encoding: 'hex', stable: true, pattern: '', missing: 'assign', compare: 'exact' }, typeMap: {}, view: { store: [], viewer: [], initial: {}, bind: {} } },
};

/**
 * The CEL environment of a specification (DESL 9): that of `../disl/`, which has DESL's types and
 * its other functions under the same names, with the one function only DESL has.
 */
export const expressionsOf = (designer: DesignerSpecification, metamodel: Metamodel): Expressions => createExpressions(designer.interpreted, metamodel, {
  library: (register) => register('uniqueName(string, list<dyn>): string', (name: string, names: unknown[]) => {
    // `name` when no string of `names` equals it ignoring case, else with the smallest number from 2 that none has (DESL 9.4).
    const taken = new Set(names.map((other) => String(other).toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    let count = 2;
    while (taken.has(`${name} ${count}`.toLowerCase())) count++;
    return `${name} ${count}`;
  }),
});

/** What a rule or an operation is for, in the interpreter's names. */
export const scoped = (names: unknown): unknown => (names === written ? whole : Array.isArray(names) ? names.map((name: unknown) => (name === written ? whole : name)) : names);

/**
 * Reads a specification from its parsed JSON (DESL 10.1, steps 2 and 4 as far as the shape of the
 * top level goes; the JSON Schema is checked where the specification is written, in etalii.adp).
 * It never throws: what is no specification gives an empty one and a finding that says why.
 */
export function loadDesigner(json: unknown): Loaded<DesignerSpecification> {
  const findings: Finding[] = [];
  const error = (message: string): DesignerSpecification => {
    findings.push(finding('desl.specification', 'error', message));
    return nothing;
  };
  if (!isObject(json)) return { value: error('This is not a DESL specification: its top level is not an object.'), findings };

  const version = json.desl;
  const parts = typeof version === 'string' ? /^(\d+)\.(\d+)$/.exec(version) : null;
  if (!parts) return { value: error('The specification does not say which version of DESL it is written in.'), findings };
  if (Number(parts[1]) > 0) return { value: error(`The specification is written in DESL ${String(version)}, and this host reads DESL 0.${deslMinor}.`), findings };
  if (Number(parts[2]) > deslMinor) findings.push(finding('desl.specification', 'warning', `The specification is written in DESL ${String(version)}, which is newer than the DESL 0.${deslMinor} this host reads.`));

  const language = isObject(json.language) ? json.language : {};
  if (typeof language.id !== 'string' || typeof language.version !== 'string') error('The specification does not name its language: `language.id` and `language.version` are required.');
  const metamodel = isObject(json.metamodel) ? json.metamodel : undefined;
  if (!metamodel) error('The specification has no metamodel.');
  const persistence = isObject(json.persistence) ? json.persistence : {};
  if (persistence.format !== 'fbl') error(`The specification stores its documents as \`${String(persistence.format)}\`, and DESL 0.${deslMinor} has the one format \`fbl\`.`);
  const bindings = (Array.isArray(persistence.bindings) ? persistence.bindings : []).filter((reference): reference is string => typeof reference === 'string' && reference.includes('#'));
  if (bindings.length === 0) error('The specification names no FBL binding as an address and a name.');

  const constraints = isObject(json.constraints) ? json.constraints : {};
  const interpreted = {
    disl: '',
    language: { ...language, id: String(language.id ?? ''), version: String(language.version ?? '') },
    ...(isObject(json.functions) ? { functions: json.functions } : {}),
    // The attributes of the document are those of the table as a whole (DESL 4.1).
    metamodel: { ...metamodel, [whole]: metamodel?.[written] },
    constraints: { ...constraints, rules: (Array.isArray(constraints.rules) ? constraints.rules : []).map((rule: unknown) => (isObject(rule) ? { ...rule, scope: scoped(rule.scope) } : rule)) },
  } as unknown as Specification;

  const typeMap: Record<string, TypeMapEntry> = {};
  for (const [name, entry] of Object.entries(isObject(persistence.typeMap) ? persistence.typeMap : {})) {
    if (isObject(entry) && typeof entry.as === 'string') typeMap[name] = { ...entry, as: entry.as === written ? whole : entry.as } as TypeMapEntry;
  }
  const ids = { strategy: 'uuid-v7', encoding: 'hex', stable: true, pattern: '^[\\s\\S]+$', missing: 'assign', compare: 'exact', ...(isObject(persistence.ids) ? persistence.ids : {}) } as InterpretedPersistence['ids'] & IdStrategy;

  return {
    value: {
      interpreted, bindings, surface: json.surface, operations: isObject(json.operations) ? json.operations : {},
      persistence: { format: 'fbl', ids, typeMap, view: { store: [], viewer: [], initial: {}, bind: {} } },
    },
    findings,
  };
}
