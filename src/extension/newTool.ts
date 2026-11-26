/**
 * Where "New ADP Tool…" in the Explorer makes its document: in the folder that was right-clicked, or in the folder of
 * the file that was, so the new document lands where the user was looking (etalii.adp spec 092, T034's new-user check).
 */
export function folderOfResource(path: string, isFolder: boolean): string {
  if (isFolder) return path;
  const slash = path.lastIndexOf('/');
  return slash <= 0 ? '/' : path.slice(0, slash);
}

/** One tool type a new document can be made of, as the picker shows it. */
export interface NewToolChoice {
  readonly label: string;
  readonly command: string;
  readonly extension: string;
}

/** The tool types that can make a new document, by the name the user reads, in alphabetical order. */
export function newToolChoices(types: readonly { readonly displayName: string; readonly command: string; readonly extension: string }[]): NewToolChoice[] {
  return types.map(({ displayName, command, extension }) => ({ label: displayName, command, extension })).sort((a, b) => a.label.localeCompare(b.label));
}
