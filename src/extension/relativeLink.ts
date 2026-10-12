// What is stored for a file or folder the user picked as a link: its path relative to the document
// that links to it, with forward slashes, as Freeplane defines a map's `LINK`
// (definitions/mindmap/mindmap.md, section 8). No `vscode` here, so it is tested without an editor.

const segmentsOf = (path: string): string[] => path.split('/').filter((segment) => segment !== '');

/**
 * The link from a document to a target, all three given as the path of a URI. A folder is named
 * without a trailing slash, and the document's own folder is `.`. Nothing when the target is not
 * the root or inside it: a link never names anything outside the project.
 */
export function relativeLink(documentPath: string, targetPath: string, rootPath: string): string | undefined {
  // simplified: segments are compared as written, so a root and a target that differ only in case
  // are not taken as one; compare without case on a file system that ignores it when that binds.
  const root = segmentsOf(rootPath);
  const target = segmentsOf(targetPath);
  if (root.some((segment, index) => target[index] !== segment)) return undefined;

  const folder = segmentsOf(documentPath).slice(0, -1);
  let shared = 0;
  while (shared < folder.length && shared < target.length && folder[shared] === target[shared]) shared++;
  const link = [...folder.slice(shared).map(() => '..'), ...target.slice(shared)].join('/');
  return link === '' ? '.' : link;
}
