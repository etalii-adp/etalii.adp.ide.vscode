import * as vscode from 'vscode';
import { relativeLink } from './relativeLink';

/** What picking a link came to: the value to store, why there is none, or nothing when the user cancelled. */
export type PickedLink = { readonly value: string } | { readonly refused: string } | undefined;

/**
 * The project link picker a definition names as `net.etalii.adp.ide.projectLinkPicker`: the
 * platform's own dialog for a file or a folder, opened in the document's folder. What is picked is
 * stored relative to the document. The project is the workspace folder the document is in, or the
 * document's own folder when it is in none.
 */
export async function pickLink(document: vscode.Uri): Promise<PickedLink> {
  const folder = vscode.Uri.joinPath(document, '..');
  const root = vscode.workspace.getWorkspaceFolder(document)?.uri ?? folder;
  // Where the platform has one dialog for both, a file or a folder; elsewhere it is a file's.
  const picked = await vscode.window.showOpenDialog({ title: 'Link to', openLabel: 'Link', defaultUri: folder, canSelectFiles: true, canSelectFolders: true, canSelectMany: false });
  if (!picked || picked.length === 0) return undefined;
  const target = picked[0];
  const value = target.scheme === document.scheme && target.authority === document.authority ? relativeLink(document.path, target.path, root.path) : undefined;
  return value === undefined ? { refused: 'A link is to a file or a folder of the project, and that one is outside it.' } : { value };
}
