// The action plugin `net.etalii.adp.ide.projectLinkPicker` (etalii.adp spec 027, research R8): the
// mind map's "Link to" names it, to pick a file or a folder of the project. The core shows no
// dialog, so the plugin answers with the outcome that asks the extension for one: the extension
// shows the platform's dialog and sets the path that is picked, relative to the document, as the
// row this names.

import type { ActionPlugin } from '../../tool/pluginRegistry';

export const projectLinkPicker: ActionPlugin = {
  id: 'net.etalii.adp.ide.projectLinkPicker',
  // The definition does not say where the path is stored: it is the node's `link`.
  run: (request) => (request.selection.length === 1
    ? { kind: 'pickPath', id: request.selection[0], field: 'link' }
    : { kind: 'refused', sentence: 'A link is given to one node at a time.' }),
};
