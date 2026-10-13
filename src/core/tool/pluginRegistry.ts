// The plugins a definition may name (etalii.adp spec 027, research R8; DISL 13.1): the registry
// `toolTypeFrom` is given, the two interfaces beside the FBL library's `PersistencePlugin`, and
// what a definition and its bindings name of them.

import type { Change } from '../disl/behavior';
import type { LayoutPlugin } from '../disl/layout';
import type { Model } from '../disl/model';
import { isObject } from '../disl/specification';
import type { FblBinding } from '../fbl/documents/types';
import type { PersistencePlugin } from '../fbl/plugins/persistencePlugin';
import type { EditOutcome, Source } from '../frame/toolType';
import type { ViewLogic } from './tableView';

// A layout plugin is called by the scene, which does not import this folder: its interface is the interpreter's.
export type { LayoutPlugin, LayoutRequest } from '../disl/layout';

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

export interface PluginRegistry {
  persistence(id: string): PersistencePlugin | undefined;
  layout(id: string): LayoutPlugin | undefined;
  action(id: string): ActionPlugin | undefined;
  /** What a definition cannot state of a view, for the tool type of an origin: no plugin a definition names, and carried as one is. */
  views(origin: string): ViewLogic | undefined;
}

/** The plugins a host carries, by what each provides. */
export interface Plugins {
  readonly persistence: readonly PersistencePlugin[];
  readonly layout: readonly LayoutPlugin[];
  readonly action: readonly ActionPlugin[];
  readonly views?: readonly ViewLogic[];
}

export function pluginRegistry(plugins: Plugins): PluginRegistry {
  const by = <T extends { readonly id: string }>(list: readonly T[]) => (id: string): T | undefined => list.find((plugin) => plugin.id === id);
  return { persistence: by(plugins.persistence), layout: by(plugins.layout), action: by(plugins.action), views: by(plugins.views ?? []) };
}

type Provides = 'persistence' | 'layout' | 'action';

/** A plugin as a definition or a binding names it. */
export interface PluginReference {
  readonly id: string;
  /** What it provides of what the registry holds; DISL's `persistenceFormat` is `persistence`. */
  readonly provides: readonly Provides[];
  readonly required: boolean;
  /** For each extension point, the built-in that stands in for the plugin (DISL 13.1). */
  readonly fallback: Readonly<Record<string, string>>;
}

const provided: Readonly<Record<string, Provides>> = { persistenceFormat: 'persistence', layout: 'layout', action: 'action' };

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
