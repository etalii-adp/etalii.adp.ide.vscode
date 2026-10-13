// One folder of `definitions/` as a tool definition with its bindings (etalii.adp spec 027,
// contracts/definitions.md): the specification, its companion, and each binding the specification
// names, resolved to the copied file of that name. The files are given as bytes: the core reads no disk.

import { isObject } from '../disl/specification';
import { loadDocument } from '../fbl/documents/documentLoader';
import type { FblBinding } from '../fbl/documents/types';
import { decode } from '../fbl/text/utf8';

export interface Definition {
  /** The folder, which is the specification's file name without its extension. */
  readonly name: string;
  readonly kind: 'diagram' | 'designer';
  /** The specification file as parsed JSON, as it is written. */
  readonly specification: Readonly<Record<string, unknown>>;
  /** The text of the companion document. */
  readonly companion: string;
}

/** What a folder gives: a definition with its bindings, or the reason it is no tool type. */
export type FolderRead =
  | { readonly definition: Definition; readonly bindings: readonly FblBinding[] }
  | { readonly reason: string };

const provenance = 'PROVENANCE.md';

/** Reads one folder, given as its files' bytes by name. It never throws. */
export function readDefinitionFolder(name: string, files: ReadonlyMap<string, Uint8Array>): FolderRead {
  const specifications = [...files.keys()].filter((file) => file.endsWith('.dis') || file.endsWith('.des'));
  if (specifications.length === 0) return { reason: 'The folder has no specification: a `.dis` or a `.des` file.' };
  if (specifications.length > 1) return { reason: `The folder has more than one specification: ${specifications.map((file) => `\`${file}\``).join(', ')}.` };
  const [file] = specifications;
  const base = file.slice(0, -4);
  const companion = files.get(`${base}.md`);
  if (!companion) return { reason: `The folder lacks \`${base}.md\`, the companion of its specification.` };
  if (!files.has(provenance)) return { reason: `The folder lacks \`${provenance}\`, the record of where its files come from.` };

  let specification: unknown;
  try {
    specification = JSON.parse(decode(files.get(file)!));
  } catch (error) {
    return { reason: `\`${file}\` is not JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!isObject(specification)) return { reason: `\`${file}\` is not a specification: its top level is not an object.` };

  const persistence = isObject(specification.persistence) ? specification.persistence : {};
  if (persistence.format !== 'fbl') return { reason: `The definition stores its model as \`${String(persistence.format ?? 'json')}\`, and a tool type is read through an FBL binding only.` };
  // simplified: one binding, as a diagram has; read `persistence.bindings` too when the first designer arrives.
  const references = [persistence.binding].filter((reference): reference is string => typeof reference === 'string' && reference.includes('#'));
  if (references.length === 0) return { reason: 'The definition does not name its FBL binding as an address and a name.' };

  const bindings: FblBinding[] = [];
  for (const reference of references) {
    const hash = reference.lastIndexOf('#');
    // Whatever form the address has, it is the copied file of that name (contracts/definitions.md).
    const copied = reference.slice(0, hash).split(/[\\/]/).pop() ?? '';
    const bytes = files.get(copied);
    if (!bytes) return { reason: `The folder lacks \`${copied}\`, which the definition names as its binding.` };
    const loaded = loadDocument(bytes, copied);
    if (!loaded.document) return { reason: `\`${copied}\` does not load: ${loaded.problems.map((problem) => `${problem.pointer} ${problem.message}`).join('; ')}` };
    const binding = loaded.document.bindings.get(reference.slice(hash + 1));
    if (!binding) return { reason: `\`${copied}\` has no binding \`${reference.slice(hash + 1)}\`.` };
    bindings.push(binding);
  }
  return { definition: { name, kind: file.endsWith('.des') ? 'designer' : 'diagram', specification, companion: decode(companion) }, bindings };
}
