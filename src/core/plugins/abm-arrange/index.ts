// The action plugin `net.etalii.adp.etalii.abmArrange` (etalii.adp spec 027, research R8): Agent
// Behavior Modelling's "Arrange diagram". The tidy tree is the arrangement, and a drag is only an
// override the registration keeps, so arranging forgets every dragged position: the registration's
// `layout:` block goes, and the Markdown is never touched.

import type { ActionPlugin } from '../../tool/pluginRegistry';
import { layoutOf, withLayout } from '../../tool/registrationLayout';

export const abmArrange: ActionPlugin = {
  id: 'net.etalii.adp.etalii.abmArrange',
  run: ({ source }) => {
    if (source.registration === undefined) return { kind: 'refused', sentence: 'This behavior model was opened without a registration, so it has no dragged positions to forget.' };
    if (Object.keys(layoutOf(source.registration)).length === 0) return { kind: 'refused', sentence: 'This behavior model is already arranged.' };
    return { kind: 'applied', splices: [], registration: withLayout(source.registration, {}) };
  },
};
