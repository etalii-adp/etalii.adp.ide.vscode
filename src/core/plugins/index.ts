// The one place a plugin is registered (etalii.adp spec 027, research R8). A plugin is code for
// one tool type under `src/core/plugins/<plugin>/`; its id appears here and nowhere else outside
// its own folder, and `docs/disl-support.md` lists every one, which a test holds.

import { pluginRegistry, type PluginRegistry, type Plugins } from '../tool/pluginRegistry';

/** Every plugin this host carries. None yet. */
export const carried: Plugins = { persistence: [], layout: [], action: [] };

export const plugins: PluginRegistry = pluginRegistry(carried);
