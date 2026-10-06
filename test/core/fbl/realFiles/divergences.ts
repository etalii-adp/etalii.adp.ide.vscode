import { expect } from 'vitest';
import record from './divergences.json';

/**
 * A place where a copied binding and a real file disagree: the property it breaks, the binding and
 * file, what was observed exactly, and why it is so.
 */
export interface Divergence {
  readonly property: string;
  readonly binding: string;
  readonly file: string;
  readonly observed: string;
  readonly reason: string;
}

/** The properties a divergence is recorded under. */
export const properties = ['unreadable', 'edit', 'remove', 'registration-body', 'registration-view', 'registration-resource', 'registration-layout', 'reading-suggest'];

/**
 * realFiles/divergences.json: every disagreement the real-file tests found, recorded instead of
 * hidden. A disagreement that is not listed fails its test; a listed one whose observation has
 * changed, or that no longer occurs, fails too, so the list cannot go stale.
 */
export const divergences: readonly Divergence[] = record.divergences;

/**
 * Checks one property on one file: `observed` is nothing when the binding and the file agree, else
 * the exact disagreement, which must then be listed with that observation.
 */
export function checkDivergence(property: string, binding: string, file: string, observed: string | undefined): void {
  const listed = divergences.find((divergence) => divergence.property === property && divergence.binding === binding && divergence.file === file);
  if (observed === undefined) {
    expect(listed?.observed, `The divergence listed for ${property} on ${file} (${binding}) no longer occurs; remove it from divergences.json.`).toBeUndefined();
    return;
  }
  expect(listed, `${property} diverges on ${file} (${binding}) and is not listed in divergences.json:\n${observed}`).toBeDefined();
  expect(observed, `The divergence of ${property} on ${file} (${binding}) has changed.`).toBe(listed!.observed);
}
