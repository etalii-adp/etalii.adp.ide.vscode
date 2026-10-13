// Which file is a tool type's (etalii.adp spec 027, FR-008, research R6): the claims of its
// bindings as the frame's `Claim`, the binding a file goes to, and whether a file looks like one.
// Routing is the FBL library's (FBL 12).

import type { FblBinding } from '../fbl/documents/types';
import { extensionOf, nameOf } from '../fbl/files/paths';
import { markerMatches } from '../fbl/routing/markerEvaluator';
import { candidates, suggests as suggested } from '../fbl/routing/router';
import { encode } from '../fbl/text/utf8';
import type { Claim } from '../frame/toolType';

/** One claim for each binding, the extensions without their dot. */
export const claimsOf = (bindings: readonly FblBinding[]): Claim[] => bindings.map(({ claims }) => ({
  extensions: claims.extensions.map((extension) => extension.replace(/^\./, '')),
  shared: claims.shared,
  marker: claims.marker !== undefined,
  registrationOnly: claims.registrationOnly,
}));

const extended = (binding: FblBinding, fileName: string): boolean => {
  const extension = extensionOf(nameOf(fileName)).toUpperCase();
  return extension.length > 0 && binding.claims.extensions.some((claimed) => claimed.toUpperCase() === extension);
};

/**
 * The binding a file goes to: the one whose extension and marker both match, and none when no
 * marker matches. A binding that claims for its registration only never routes a bare file (FBL
 * 12.3): such a file is opened by choice, so its extension, and its marker where it has one, claim it.
 */
export function claimingBinding(bindings: readonly FblBinding[], fileName: string, text: string): FblBinding | undefined {
  const bytes = encode(text);
  return candidates(fileName, bytes, bindings, true)[0]
    ?? bindings.find((binding) => binding.claims.registrationOnly && extended(binding, fileName) && (!binding.claims.marker || markerMatches(binding.claims.marker, bytes)));
}

/** Whether a file of a claimed extension looks like the tool type's: its text holds what a binding's `claims.suggest` names. */
export const suggests = (bindings: readonly FblBinding[], fileName: string, text: string): boolean =>
  bindings.some((binding) => extended(binding, fileName) && suggested(binding, encode(text)));
