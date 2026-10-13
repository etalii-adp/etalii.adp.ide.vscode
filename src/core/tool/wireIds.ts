// The ids a tool type is spoken to by: those of its toolbox entries, its actions and the rows of
// ADP Properties. A definition may keep the ids its tool type has always had in every host in an
// `x-` key of its own, mapped from the names of the specification, since DISL derives an id from a
// name and those ids are no names it could have. They stay a host's own and are no part of DISL.
// The key is found by its shape, not by its name: a top-level `x-` mapping with `tools`, `actions`
// or `properties`. Without one, every id is the specification's own name.
//
// - `tools.<tool>.drop`: the id a toolbox entry is offered and dropped under.
// - `actions.<operation>` or `actions.<kind>`: the id of a menu entry; `actions."<Type>/<key>"`
//   overrides it for the entries offered on an element of that type. `<param>` in an id stands for
//   the argument of that name the entry gives its operation.
// - `properties.<row>`: the id of a row, by the row's own id.
// - `types.<Type>`: what a type is called in an id.

import type { Value } from '../disl/model';
import { isObject } from '../disl/specification';

export interface WireIds {
  /** The id a tool is offered and dropped under. */
  tool(id: string): string;
  /** The tool an id names. */
  toolOf(wire: string): string;
  /** The id of a menu entry: by its operation or its kind, the types of what it is offered on, the nearest first, and the arguments it gives. */
  action(key: string, types: readonly string[], args?: Readonly<Record<string, Value>>): string;
  /** What an id of a menu entry may stand for, where no entry that is offered has it: each operation or kind, with the arguments the id carries. */
  actionsOf(wire: string): readonly { readonly key: string; readonly args: Readonly<Record<string, Value>> }[];
  /** The id of a row of ADP Properties. */
  property(row: string): string;
  /** What a type is called in an id: as the mapping has it, else in lower case. */
  type(name: string): string;
}

type Names = Readonly<Record<string, string>>;

const strings = (value: unknown): Names => Object.fromEntries(Object.entries(isObject(value) ? value : {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The ids of a specification, as it is written. */
export function wireIdsOf(specification: Readonly<Record<string, unknown>>): WireIds {
  const mapping = Object.entries(specification).map(([name, value]) => (name.startsWith('x-') && isObject(value) && (isObject(value.tools) || isObject(value.actions) || isObject(value.properties)) ? value : undefined)).find((value) => value !== undefined) ?? {};
  const tools = Object.fromEntries(Object.entries(isObject(mapping.tools) ? mapping.tools : {}).flatMap(([id, entry]) => (isObject(entry) && typeof entry.drop === 'string' ? [[id, entry.drop]] : []))) as Names;
  const actions = strings(mapping.actions);
  const properties = strings(mapping.properties);
  const types = strings(mapping.types);
  const typeOf = (wire: string): string => Object.keys(types).find((name) => types[name] === wire) ?? wire;
  const argument = (value: Value | undefined): string => (typeof value === 'string' && Object.hasOwn(types, value) ? types[value] : String(value ?? ''));

  return {
    tool: (id) => (Object.hasOwn(tools, id) ? tools[id] : id),
    toolOf: (wire) => Object.keys(tools).find((id) => tools[id] === wire) ?? wire,
    action: (key, lineage, args = {}) => {
      const named = lineage.map((type) => `${type}/${key}`).find((name) => Object.hasOwn(actions, name)) ?? key;
      // Without a mapping, an entry that gives arguments is told from its siblings by them.
      if (!Object.hasOwn(actions, named)) return Object.keys(args).length === 0 ? key : `${key}:${Object.values(args).map((value) => String(value)).join(',')}`;
      return actions[named].replace(/<([^<>]+)>/g, (_whole, name: string) => argument(args[name]));
    },
    actionsOf: (wire) => Object.entries(actions).flatMap(([name, pattern]) => {
      const params = [...pattern.matchAll(/<([^<>]+)>/g)].map((match) => match[1]);
      const found = new RegExp(`^${pattern.split(/<[^<>]+>/).map(escaped).join('(.+)')}$`).exec(wire);
      return found ? [{ key: name.slice(name.lastIndexOf('/') + 1), args: Object.fromEntries(params.map((param, index) => [param, typeOf(found[index + 1])])) }] : [];
    }),
    property: (row) => (Object.hasOwn(properties, row) ? properties[row] : row),
    type: (name) => (Object.hasOwn(types, name) ? types[name] : name.toLowerCase()),
  };
}
