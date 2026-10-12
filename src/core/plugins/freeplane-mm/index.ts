// The persistence plugin of the binding `mindmap.fbl#mindmap` (etalii.adp spec 027, research R9;
// FBL 11): it reads a Freeplane `.mm` body as standalone's plugin does and, unlike standalone's,
// plans every edit as splices.

import type { PersistencePlugin } from '../../fbl';
import { newShortGuid } from '../../text/shortGuid';
import { plan } from './planner';
import { read } from './reader';

export const freeplaneMm: PersistencePlugin = {
  id: 'net.etalii.adp.freeplane.mm',
  read,
  plan,
  // The map a new diagram starts as (the companion document, section 2): one root node named after
  // the file's base name, LF, no final newline.
  template: ({ name, placeholders }) => {
    const text = (placeholders.get('base') ?? name).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    return new TextEncoder().encode(`<map version="freeplane 1.11.5">\n<node TEXT="${text}" ID="ID_${newShortGuid()}"/>\n</map>`);
  },
};
