import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FblBinding } from '../../../../src/core/fbl/documents/types';
import type { FblOptions } from '../../../../src/core/fbl/model';
import { bindingOf } from '../support/bindings';
import { naturalIds } from '../support/naturalIds';
import { filesBelow, ordinal, pathOf, root } from '../support/repository';
import minimums from './minimums.json';

// The real files the bindings are tried on (etalii.adp spec 009, contracts/corpus.md): the files
// copied from standalone to fixtures/fbl/real-files, under the paths they have there, and, by the
// same rules, the files of this repository itself. They are enumerated when the tests run, so a
// file added later is covered without a change here; each kind has a recorded minimum, so a broken
// enumeration fails rather than passing on no files. The minimums are standalone's, and apply to
// the copied files alone.

/** One real file: the name it is listed and recorded by, where it is, and the folder its name is relative to. */
export interface RealFile {
  /** `/`-separated: relative to fixtures/fbl/real-files for a copied file, to the repository for one of its own. */
  readonly name: string;
  readonly path: string;
  /** The folder a registration's body must stay within. */
  readonly root: string;
  readonly copied: boolean;
}

/** One copied binding tried on the real files: which files it takes, and how many there were when the suite was written. */
export interface CorpusBinding {
  readonly key: string;
  readonly document: string;
  readonly binding: string;
  readonly minimum: number;
  readonly selects: (file: RealFile) => boolean;
}

export const minimumRegistrations: number = minimums.registrations;
export const minimumChartFolders: number = minimums.chartFolders;
export const minimumTurtle: number = minimums.turtle;

const copiedRoot = pathOf('fixtures/fbl/real-files');
const leftOut = new Set(['node_modules', 'dist', 'out', 'reports', '.vscode-test', '.debug', '.git', '.claude']);

function enumerate(): RealFile[] {
  const copied = filesBelow(copiedRoot).map((name): RealFile => ({ name, path: join(copiedRoot, ...name.split('/')), root: copiedRoot, copied: true }));
  const own: RealFile[] = [];
  const walk = (folder: string, prefix: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const name = prefix + entry.name;
      if (!entry.isDirectory()) own.push({ name, path: join(folder, entry.name), root, copied: false });
      // The copies are listed above, and FBL's own corpus is not a real file.
      else if (!leftOut.has(entry.name) && name !== 'fixtures/fbl') walk(join(folder, entry.name), `${name}/`);
    }
  };
  walk(root, '');
  const names = new Set(copied.map((file) => file.name));
  const clash = own.find((file) => names.has(file.name));
  if (clash) throw new Error(`${clash.name} is both a copied file and a file of this repository; the divergence record could not tell them apart.`);
  return [...copied, ...own].sort((a, b) => ordinal(a.name, b.name));
}

/** Every real file, in ordinal order of its name. */
export const all: readonly RealFile[] = enumerate();

const byName = new Map(all.map((file) => [file.name, file]));

export function fileOf(name: string): RealFile {
  const file = byName.get(name);
  if (!file) throw new Error(`${name} is not a real file of the suite.`);
  return file;
}

export const bytesOfFile = (file: RealFile): Uint8Array => new Uint8Array(readFileSync(file.path));

const has = (file: RealFile, ...extensions: readonly string[]): boolean => extensions.some((extension) => file.name.toLowerCase().endsWith(extension));

/** The declared file bindings and the files each claims. */
export const declared: readonly CorpusBinding[] = minimums.bindings.map((entry) => ({
  key: entry.key,
  document: entry.document,
  binding: entry.binding,
  minimum: entry.minimum,
  // Only a file whose extension could match is read for what it contains.
  selects: (file) => has(file, ...entry.extensions) && (entry.contains === undefined || new TextDecoder().decode(bytesOfFile(file)).includes(entry.contains)),
}));

export function find(key: string): CorpusBinding {
  const binding = declared.find((candidate) => candidate.key === key);
  if (!binding) throw new Error(`No declared binding has the key ${key}.`);
  return binding;
}

const claimed = new Map<string, readonly RealFile[]>();

/** The files a declared binding takes. */
export function filesOf(binding: CorpusBinding): readonly RealFile[] {
  if (!claimed.has(binding.key)) claimed.set(binding.key, all.filter(binding.selects));
  return claimed.get(binding.key)!;
}

/** The pairs of every declared binding and each file it takes, for a test of every real file. */
export const pairs: readonly { key: string; file: string }[] = declared.flatMap((binding) => filesOf(binding).map((file) => ({ key: binding.key, file: file.name })));

export const loaded = (binding: CorpusBinding): FblBinding => bindingOf(binding.document, binding.binding);

export const registrations: readonly RealFile[] = all.filter((file) => has(file, '.adp'));

export const chartFolders: readonly RealFile[] = all.filter((file) => file.name === 'Chart.yaml' || file.name.endsWith('/Chart.yaml'));

export const turtleFiles: readonly RealFile[] = all.filter((file) => has(file, '.ttl', '.nt'));

/** The options a real file is read with: its name for findings and the natural ids the fixtures use. */
export function optionsFor(binding: FblBinding, name: string, headers?: ReadonlyMap<string, string>): FblOptions {
  return { fileName: name, deriveId: naturalIds(binding.name), registrationHeaders: headers ?? new Map(), resource: headers?.get('resource') };
}

/** A path as the name it has in the suite: relative to the folder the file's own name is relative to. */
export const nameIn = (file: RealFile, path: string): string => path.slice(file.root.length).replace(/^[\\/]+/, '').replace(/\\/g, '/');
