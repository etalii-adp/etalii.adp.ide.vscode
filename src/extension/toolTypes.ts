import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EditRequest, ToolType } from '../core/frame/toolType';
import { plugins } from '../core/plugins/index';
import type { Scene } from '../core/scene/scene';
import type { HierarchyRequest, HierarchyView } from '../core/tool/hierarchyView';
import type { TableRequest, TableView } from '../core/tool/tableView';
import { toolTypesFrom } from '../core/tool/toolTypeFrom';

/**
 * A tool type this plug-in brings: a diagram or a designer read from its definition. A request is
 * the tool type's own, and its `edit` refuses one it does not know.
 */
export type AnyToolType = ToolType<Scene | TableView | HierarchyView, EditRequest | TableRequest | HierarchyRequest>;

/** Every file of every folder of `definitions/` in the plug-in's install folder, as bytes by name. */
function definitionFolders(extensionPath: string): Map<string, Map<string, Uint8Array>> {
  const root = path.join(extensionPath, 'definitions');
  const folders = new Map<string, Map<string, Uint8Array>>();
  if (!fs.existsSync(root)) return folders;
  for (const folder of fs.readdirSync(root, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const files = new Map<string, Uint8Array>();
    for (const file of fs.readdirSync(path.join(root, folder.name), { withFileTypes: true })) {
      if (file.isFile()) files.set(file.name, fs.readFileSync(path.join(root, folder.name, file.name)));
    }
    folders.set(folder.name, files);
  }
  return folders;
}

/**
 * The tool types this plug-in brings: the folders of `definitions/` that load, read once from the
 * install folder when the plug-in starts (etalii.adp spec 027, research R7). A folder that does not
 * load is logged with its reason and nothing is offered for it.
 */
export function toolTypesAt(extensionPath: string): readonly AnyToolType[] {
  const { types, skipped } = toolTypesFrom(definitionFolders(extensionPath), plugins);
  for (const { folder, reason } of skipped) console.warn(`ADP: definitions/${folder} is not offered. ${reason}`);

  return types as readonly unknown[] as readonly AnyToolType[];
}
