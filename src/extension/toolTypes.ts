import * as fs from 'node:fs';
import * as path from 'node:path';
import { agentBehaviorModelling } from '../core/agent-behavior-modelling/index';
import { fromHandCoded } from '../core/frame/handCoded';
import type { EditRequest, ToolType, ViewModel } from '../core/frame/toolType';
import { gartnerHypecycleGraph } from '../core/gartner-hypecycle-graph/index';
import { plugins } from '../core/plugins/index';
import type { Scene } from '../core/scene/scene';
import { toolTypesFrom } from '../core/tool/toolTypeFrom';

/** A tool type this plug-in brings: one read from its definition, or one of the two hand-coded diagrams. */
export type AnyToolType = ToolType<Scene | ViewModel, EditRequest>;

/** Whether what a tool type shows is a scene, which a definition gives, and not a hand-coded view model. */
export function isScene(view: Scene | ViewModel): view is Scene {
  return 'nodes' in view;
}

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

  // simplified: a hand-coded type wins for its origin, so the two diagrams are as they were, and
  // keeps its place in the list; the last pull request of spec 027 (User Story 4) removes the two
  // and this list is then `types` alone. Under test, ADP_TEST_DEFINITIONS=1 lets the definition win.
  const handCoded: AnyToolType[] = [gartnerHypecycleGraph, agentBehaviorModelling].map(fromHandCoded);
  const definitionWins = process.env.ADP_TEST !== undefined && process.env.ADP_TEST_DEFINITIONS === '1';
  const read = (origin: string): AnyToolType | undefined => types.find((type) => type.origin === origin);
  return [
    ...handCoded.map((type) => (definitionWins ? read(type.origin) ?? type : type)),
    ...types.filter((type) => !handCoded.some((other) => other.origin === type.origin)),
  ];
}
