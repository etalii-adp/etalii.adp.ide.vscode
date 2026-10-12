import * as vscode from 'vscode';
import type { AnyToolType } from './toolTypes';

// Which file opens in which tool (etalii.adp spec 027, research R6): the claims of a tool type's
// bindings decide, by extension and marker both.

/**
 * The tool type a file opens in without being asked: the one that claims its name and text. A claim
 * that is registration only is left out, because such a file is a tool's only by choice.
 */
export function claimantOf(types: readonly AnyToolType[], fileName: string, text: string): AnyToolType | undefined {
  const name = fileName.toLowerCase();
  return types.find((type) => type.claimed(fileName, text)
    && type.claims.some((claim) => !claim.registrationOnly && claim.extensions.some((extension) => name.endsWith(`.${extension}`))));
}

// The files the user chose "Open as Text" for: they stay text for the session.
const keptAsText = new Set<string>();

export function keepAsText(uri: vscode.Uri): void {
  keptAsText.add(uri.toString());
}

export function staysText(uri: vscode.Uri): boolean {
  return keptAsText.has(uri.toString());
}

/**
 * Hands a file a tool type's editor was opened on, and does not claim, back to the text editor, and
 * closes the tool's own tab. Nothing is reported: the file is simply not this tool's.
 */
export function handBack(uri: vscode.Uri, viewType: string, panel: vscode.WebviewPanel): void {
  panel.webview.html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body></body></html>';
  const column = panel.viewColumn;
  // Both wait until the editor has resolved: Visual Studio Code still has to show the panel it
  // handed over, and reports "OverlayWebview has been disposed" when the panel is gone by then.
  setTimeout(() => void (async () => {
    // Not as a preview: a preview would take the place of the tool's tab while that is still being shown.
    await vscode.commands.executeCommand('vscode.openWith', uri, 'default', { viewColumn: column, preview: false });
    const own = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter((tab) => tab.input instanceof vscode.TabInputCustom && tab.input.viewType === viewType && tab.input.uri.toString() === uri.toString());
    if (own.length > 0) await vscode.window.tabGroups.close(own, true);
  })(), 0);
}
