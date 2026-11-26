// The persistence plugin of the binding `mindmap.fbl#mindmap` (etalii.adp spec 027, research R9;
// FBL 11): it reads a Freeplane `.mm` body as standalone's plugin does and, unlike standalone's,
// plans every edit as splices.

import { base36, nanoid, type PersistencePlugin } from '../../fbl';
import { plan } from './planner';
import { DOCUMENT_ID, read } from './reader';

export const freeplaneMm: PersistencePlugin = {
  id: 'net.etalii.adp.freeplane.mm',
  read,
  plan,
  // The map a new diagram starts as (the companion document, section 2): one root node named after
  // the file's base name, LF, no final newline. Its id is `ID_` and 8 characters of `0-9a-z`, as the
  // definition's `ids` rule gives a node ADP creates (etalii.adp spec 089, FR-003). Its central topic holds the
  // map's document id as `adp-id` from the start (section 3.8, FBL 17.2), so the new map can be linked to before its
  // first edit (etalii.adp spec 092, host test T034).
  template: ({ name, placeholders }) => {
    const text = (placeholders.get('base') ?? name).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    return new TextEncoder().encode(`<map version="freeplane 1.11.5">\n<node TEXT="${text}" ID="ID_${nanoid(base36, 8)}">\n<attribute NAME="${DOCUMENT_ID}" VALUE="${nanoid(base36, 8)}"/>\n</node>\n</map>`);
  },
};
