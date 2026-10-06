import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository's root: the folder this file is four folders below. */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** A path under the repository's root, from `/`-separated segments. */
export const pathOf = (...relative: string[]): string => join(root, ...relative.flatMap((part) => part.split('/')));

/** FBL's bindings, fixtures and registrations, copied unchanged from etalii.adp (fixtures/fbl/PROVENANCE.md). */
export const conformance = pathOf('fixtures', 'fbl', 'conformance');

/** The bytes of a file under the repository's root, exactly as they are on disk. */
export const bytesOf = (...relative: string[]): Uint8Array => new Uint8Array(readFileSync(pathOf(...relative)));

/** Every file under a folder, as `/`-separated paths relative to it, in ordinal order; a link is not followed. */
export function filesBelow(folder: string): string[] {
  const found: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(join(directory, entry.name), `${prefix}${entry.name}/`);
      else found.push(prefix + entry.name);
    }
  };
  walk(folder, '');
  return found.sort(ordinal);
}

/** Ordinal order: by UTF-16 code unit, as the baseline's tests order names. */
export const ordinal = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

export const utf8 = (text: string): Uint8Array => encoder.encode(text);

export const textOf = (bytes: Uint8Array): string => decoder.decode(bytes);
