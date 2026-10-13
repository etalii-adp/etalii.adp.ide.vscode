// The persistence plugin of the binding `agent-behavior-modelling.fbl#abm` (etalii.adp spec 027,
// research R8 and R12; FBL 11): it reads the behavior tree a Markdown file holds under its Behavior
// heading, and plans every change as the lines it touches. The parser, the writer and the kinds of
// the hand-coded diagram are owned here now.

import type { PersistencePlugin } from '../../fbl';
import { plan } from './planner';
import { read } from './reader';
import { newDocument } from './template';

export const abmMarkdown: PersistencePlugin = {
  id: 'net.etalii.adp.etalii.abmMarkdown',
  read,
  plan,
  // The file a new diagram starts as, titled with the file's base name.
  template: ({ name, placeholders }) => new TextEncoder().encode(newDocument(placeholders.get('base') ?? name.replace(/\.md$/i, ''))),
};
