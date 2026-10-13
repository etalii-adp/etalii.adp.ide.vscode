import * as vscode from 'vscode';
import { viewTypeOf } from '../core/frame/toolType';
import { staysText } from './opening';
import type { AnyToolType } from './toolTypes';

/**
 * Reopens a text tab in the tool whose binding claims its file (etalii.adp spec 027, research R6).
 * A manifest selects by file name only, and whether a YAML, JSON or XML file is a tool's is in its
 * text, so such a tool is registered as an option and its files open as text first: a tab on a
 * file of the workspace whose marker matches is then opened in the tool, with the platform's own
 * `vscode.openWith`. A diff, a file from version control and an untitled document are never
 * reopened, and neither is a file the user chose "Open as Text" for.
 */
export function watchReopening(context: vscode.ExtensionContext, types: readonly AnyToolType[]): void {
  const marked = types.filter((type) => type.claims.some((claim) => claim.shared && claim.marker && !claim.registrationOnly));
  if (marked.length === 0) return;

  const reopen = async (tab: vscode.Tab): Promise<void> => {
    // A diff is another kind of tab; a file from version control and an untitled document are not files of the workspace.
    if (!(tab.input instanceof vscode.TabInputText)) return;
    const { uri } = tab.input;
    if (uri.scheme !== 'file' || vscode.workspace.getWorkspaceFolder(uri) === undefined || staysText(uri)) return;
    const name = uri.path.toLowerCase();
    const candidates = marked.filter((type) => type.claims.some((claim) => claim.shared && claim.marker && claim.extensions.some((extension) => name.endsWith(`.${extension}`))));
    if (candidates.length === 0) return;
    const document = await vscode.workspace.openTextDocument(uri);
    const type = candidates.find((candidate) => candidate.claimed(document.fileName, document.getText()));
    if (!type) return;
    await vscode.commands.executeCommand('vscode.openWith', uri, viewTypeOf(type), { viewColumn: tab.group.viewColumn, preview: tab.isPreview });
    // The tool took the tab's place; a text tab that is still there beside it is closed.
    const left = tab.group.tabs.filter((other) => other.input instanceof vscode.TabInputText && other.input.uri.toString() === uri.toString());
    if (left.length > 0) await vscode.window.tabGroups.close(left, true);
  };

  context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs((event) => {
    for (const tab of event.opened) void reopen(tab);
  }));
  for (const tab of vscode.window.tabGroups.all.flatMap((group) => group.tabs)) void reopen(tab);
}
