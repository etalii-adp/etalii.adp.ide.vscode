// The one place a plugin is registered (etalii.adp spec 027, research R8). A plugin is code for
// one tool type under `src/core/plugins/<plugin>/`; its id appears here and nowhere else outside
// its own folder, and `docs/disl-support.md` lists every one, which a test holds.

import { pluginRegistry, type PluginRegistry, type Plugins } from '../tool/pluginRegistry';
import { abmArrange } from './abm-arrange/index';
import { abmMarkdown } from './abm-markdown/index';
import { freeplaneMm } from './freeplane-mm/index';
import { knowledgeViews } from './knowledge-views/index';
import { mindmapLayout } from './mindmap-layout/index';
import { projectLinkPicker } from './project-link-picker/index';

/** Every plugin this host carries. */
export const carried: Plugins = { persistence: [freeplaneMm, abmMarkdown], layout: [mindmapLayout], action: [projectLinkPicker, abmArrange], views: [knowledgeViews] };

export const plugins: PluginRegistry = pluginRegistry(carried);
