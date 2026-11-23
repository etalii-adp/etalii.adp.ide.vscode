import type { FblFiles } from './fblFiles';

// A folder a host has listed, as FBL's files: every entry by its `/`-separated path relative to the
// folder, a folder's ending in `/`, and the text of those it has read. The folder itself is `/`.
// A host that reads its files asynchronously lists the folder first, asks which files a folder
// subject reads (FBL 10.2), reads those, and hands their texts here.

/** The files of a listed folder: `paths` every entry, `texts` the files read, by the same paths. */
export function memoryFiles(paths: readonly string[], texts: Readonly<Record<string, string>> = {}, ignoresCase = false): FblFiles {
  const folders = new Set<string>(['/']);
  const files = new Set<string>();
  for (const path of [...paths, ...Object.keys(texts)]) {
    const parts = path.split('/').filter((part) => part.length > 0);
    for (let depth = 1; depth < parts.length; depth++) folders.add(`/${parts.slice(0, depth).join('/')}`);
    if (parts.length === 0) continue;
    if (path.endsWith('/')) folders.add(`/${parts.join('/')}`);
    else files.add(`/${parts.join('/')}`);
  }
  const children = (folder: string): string[] => {
    const prefix = folder === '/' ? '/' : `${folder}/`;
    const names = new Set<string>();
    for (const path of [...folders, ...files]) if (path !== folder && path.startsWith(prefix)) names.add(path.slice(prefix.length).split('/')[0]);
    return [...names].sort();
  };
  const encoder = new TextEncoder();
  return {
    read: (path) => {
      const text = texts[path.replace(/^\//, '')];
      return text === undefined ? undefined : encoder.encode(text);
    },
    kind: (path) => (folders.has(path) ? 'folder' : files.has(path) ? 'file' : undefined),
    list: (folder) => (folders.has(folder) ? children(folder) : []),
    ignoresCase,
  };
}
