// The plugins a definition may name (etalii.adp spec 027, research R8; DISL 13.1): the registry
// `toolTypeFrom` is given, the two interfaces beside the FBL library's `PersistencePlugin`, and
// what a definition and its bindings name of them.

import type { Change } from '../disl/behavior';
import type { ConstraintFinding } from '../disl/constraints';
import type { PluginFunction } from '../disl/expressions';
import type { LayoutPlugin } from '../disl/layout';
import type { RoutingPlugin } from '../scene/scene';
import type { Model } from '../disl/model';
import { isObject } from '../disl/specification';
import type { FblBinding } from '../fbl/documents/types';
import type { FblElement } from '../fbl/model';
import type { Span } from '../fbl/span';
import type { PersistencePlugin } from '../fbl/plugins/persistencePlugin';
import type { EditOutcome, Source } from '../frame/toolType';
import type { ViewLogic } from './tableView';

// A layout plugin is called by the scene, which does not import this folder: its interface is the interpreter's.
export type { LayoutPlugin, LayoutRequest } from '../disl/layout';
// A routing plugin is called by the scene too: its interface is the scene's.
export type { RouteRequest, RoutedEnd, RoutingPlugin } from '../scene/scene';
export type { PluginFunction } from '../disl/expressions';

export interface ActionRequest {
  readonly source: Source;
  readonly model: Model;
  readonly selection: readonly string[];
}

/** What an action comes to: an outcome of the frame, or changes to the model, which are planned as any other. */
export type ActionResult = EditOutcome | { readonly kind: 'changes'; readonly changes: readonly Change[] };

export interface ActionPlugin {
  readonly id: string;
  run(request: ActionRequest): ActionResult;
}

/** The functions a plugin adds to CEL (DISL 13.1.1), by their names. */
export interface CelFunctionsPlugin {
  readonly id: string;
  readonly functions: Readonly<Record<string, PluginFunction>>;
}

/**
 * What a binding cannot state of how a tool type reads its documents, for the tool type of an origin: no plugin a
 * definition names, and carried as one is, as a view's logic is. Each member stands in for a gap the definition's
 * companion lists.
 */
export interface ReadingLogic {
  /** The origin of the tool type it is for. */
  readonly id: string;
  /** The entries the library read of a body, read again where the tool type reads them otherwise: `text` is the text of a span of the body. */
  reread?(elements: readonly FblElement[], text: (span: Span) => string): readonly FblElement[];
  /** An entry's statement written again with a set of its attributes, where the tool type writes it otherwise than the binding would; nothing to leave it to the binding. */
  restate?(statement: string, changes: Readonly<Record<string, unknown>>): string | undefined;
  /** The sentence for an entry no rule of the binding reads, from its text; nothing for the definition's own. */
  unreadable?(entry: string): string | undefined;
  /** A number as the tool type shows it in a form. */
  numberText?(value: number): string;
  /** The style of an underline that no style states, where the tool type draws it otherwise than straight, such as `wavy`. */
  readonly underlineStyle?: string;
  /** The findings of a model in the order the tool type reports them, where `constraints.order` cannot state it, as when it interleaves two codes. */
  order?(findings: readonly ConstraintFinding[], model: Model): readonly ConstraintFinding[];
}

/** What an export of a document is given: its model, the name of its file without the extension, and where the canvas draws the centre of each node, by id. */
export interface ExportRequest {
  readonly model: Model;
  readonly stem: string;
  readonly centres: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
}

/** A file a tool type writes of a document beside it, such as a page that shows it otherwise; the document itself is not changed. */
export interface ToolExport {
  /** The id its command and its menu entry are known by: `etalii.adp.export.<id>`. */
  readonly id: string;
  /** The label of its menu entry. */
  readonly label: string;
  /** The name of the file, for a document of that name without its extension, exported at a moment of local time. */
  name(stem: string, moment: Date): string;
  /** The text of the file. */
  write(request: ExportRequest): string;
  /** How a person reads and uses the file, in Markdown, saved by the command `etalii.adp.exportInstructions.<id>`; none where the file needs no explaining. */
  readonly instructions?: string;
}

/**
 * What a definition does not state of a tool type and the tool type exports, for the tool type of an origin: no plugin a
 * definition names, and carried as one is (`docs/disl-support.md`, "Code for one tool type").
 */
export interface ExportLogic {
  /** The origin of the tool type it is for. */
  readonly id: string;
  readonly exports: readonly ToolExport[];
}

export interface PluginRegistry {
  persistence(id: string): PersistencePlugin | undefined;
  layout(id: string): LayoutPlugin | undefined;
  action(id: string): ActionPlugin | undefined;
  celFunctions(id: string): CelFunctionsPlugin | undefined;
  /** The routing plugin of an id, for an edge whose routing names it (DISL 6.10). */
  routing(id: string): RoutingPlugin | undefined;
  /** What a definition cannot state of a view, for the tool type of an origin: no plugin a definition names, and carried as one is. */
  views(origin: string): ViewLogic | undefined;
  /** How the tool type of an origin reads what its binding cannot state. */
  reading(origin: string): ReadingLogic | undefined;
  /** What the tool type of an origin exports. */
  exports(origin: string): ExportLogic | undefined;
}

/** The plugins a host carries, by what each provides. */
export interface Plugins {
  readonly persistence: readonly PersistencePlugin[];
  readonly layout: readonly LayoutPlugin[];
  readonly action: readonly ActionPlugin[];
  readonly celFunctions?: readonly CelFunctionsPlugin[];
  readonly routing?: readonly RoutingPlugin[];
  readonly views?: readonly ViewLogic[];
  readonly reading?: readonly ReadingLogic[];
  readonly exports?: readonly ExportLogic[];
}

export function pluginRegistry(plugins: Plugins): PluginRegistry {
  const by = <T extends { readonly id: string }>(list: readonly T[]) => (id: string): T | undefined => list.find((plugin) => plugin.id === id);
  return { persistence: by(plugins.persistence), layout: by(plugins.layout), action: by(plugins.action), celFunctions: by(plugins.celFunctions ?? []), routing: by(plugins.routing ?? []), views: by(plugins.views ?? []), reading: by(plugins.reading ?? []), exports: by(plugins.exports ?? []) };
}

type Provides = 'persistence' | 'layout' | 'action' | 'celFunctions' | 'routing';

/** A plugin as a definition or a binding names it. */
export interface PluginReference {
  readonly id: string;
  /** What it provides of what the registry holds; DISL's `persistenceFormat` is `persistence`. */
  readonly provides: readonly Provides[];
  readonly required: boolean;
  /** For each extension point, the built-in that stands in for the plugin (DISL 13.1). */
  readonly fallback: Readonly<Record<string, string>>;
}

const provided: Readonly<Record<string, Provides>> = { persistenceFormat: 'persistence', layout: 'layout', action: 'action', celFunctions: 'celFunctions', routing: 'routing' };

/** The plugins of a specification's `plugins`, in its order, then the reader of a binding it does not declare, which is required. */
export function pluginReferences(specification: Readonly<Record<string, unknown>>, bindings: readonly FblBinding[]): PluginReference[] {
  const references: PluginReference[] = [];
  for (const [id, declared] of Object.entries(isObject(specification.plugins) ? specification.plugins : {})) {
    if (!isObject(declared)) continue;
    const points: readonly unknown[] = Array.isArray(declared.provides) ? declared.provides : [];
    references.push({
      id,
      provides: points.flatMap((point) => (typeof point === 'string' && Object.hasOwn(provided, point) ? [provided[point]] : [])),
      required: declared.required === true,
      fallback: Object.fromEntries(Object.entries(isObject(declared.fallback) ? declared.fallback : {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
    });
  }
  for (const binding of bindings) {
    const id = binding.plugin?.plugin;
    if (id !== undefined && !references.some((reference) => reference.id === id)) references.push({ id, provides: ['persistence'], required: true, fallback: {} });
  }
  return references;
}

/** The references the registry lacks: for something they provide, or because they provide nothing a registry holds. */
export const missingPlugins = (references: readonly PluginReference[], registry: Pick<PluginRegistry, Provides>): PluginReference[] =>
  references.filter((reference) => reference.provides.length === 0 || reference.provides.some((point) => registry[point](reference.id) === undefined));
