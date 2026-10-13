import * as vscode from 'vscode';
import { relativeLink } from './relativeLink';

const file = 'File\u2026';
const folder = 'Folder\u2026';

/** What picking a link came to: the value to store, why there is none, or nothing when the user cancelled. */
export type PickedLink = { readonly value: string } | { readonly refused: string } | undefined;

/**
 * The project link picker a definition names as `net.etalii.adp.ide.projectLinkPicker`: the
 * platform's own dialog for a file or a folder, opened in the document's folder. What is picked is
 * stored relative to the document. Only macOS has one dialog for both; elsewhere the user says
 * first which of the two it is. The project is the workspace folder the document is in, or the
 * document's own folder when it is in none.
 */
export async function pickLink(document: vscode.Uri): Promise<PickedLink> {
  const beside = vscode.Uri.joinPath(document, '..');
  const root = vscode.workspace.getWorkspaceFolder(document)?.uri ?? beside;
  const kind = process.platform === 'darwin' ? undefined : await vscode.window.showQuickPick([file, folder], { title: 'Link to', placeHolder: 'What the node links to' });
  if (process.platform !== 'darwin' && kind === undefined) return undefined;
  const picked = await vscode.window.showOpenDialog({
    title: 'Link to', openLabel: 'Link', defaultUri: beside, canSelectMany: false, canSelectFiles: kind !== folder, canSelectFolders: kind !== file,
  });
  if (!picked || picked.length === 0) return undefined;
  const target = picked[0];
  const value = target.scheme === document.scheme && target.authority === document.authority ? relativeLink(document.path, target.path, root.path) : undefined;
  return value === undefined ? { refused: 'A link is to a file or a folder of the project, and that one is outside it.' } : { value };
}
