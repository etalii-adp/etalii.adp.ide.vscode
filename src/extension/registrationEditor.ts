import * as vscode from 'vscode';
import type { DiagramType } from '../core/frame/diagramType';
import { viewTypeOf } from '../core/frame/diagramType';
import { bodyOf, originOf } from '../core/registration/registration';

/**
 * Opening a registration opens the diagram it registers: the `.adp` names a tool type and the file
 * that holds the model, and is itself only the visualization. A registration this plug-in cannot
 * follow says why and changes nothing.
 */
export class RegistrationEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'etalii.adp.registration';

  constructor(private readonly types: readonly DiagramType[]) {}

  static register(types: readonly DiagramType[]): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(RegistrationEditorProvider.viewType, new RegistrationEditorProvider(types));
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const target = await this.target(document);
    if (typeof target === 'string') {
      panel.webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"></head>
<body style="padding: 16px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);">
<p>${target.replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character] ?? character)}</p>
<p>Use <strong>Reopen Editor With...</strong> and choose the text editor to see the registration itself.</p></body></html>`;
      return;
    }
    // The body opens where the registration would have, and the registration's own tab goes. Both
    // wait until this call has returned: Visual Studio Code still has to show the panel it handed
    // over, and reports "OverlayWebview has been disposed" when the panel is gone by then.
    panel.webview.html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body></body></html>';
    const column = panel.viewColumn;
    setTimeout(() => void this.follow(document.uri, target, column), 0);
  }

  /** Opens the diagram a registration registers, then closes the registration's own tab. */
  private async follow(registration: vscode.Uri, target: { body: vscode.Uri; type: DiagramType }, column: vscode.ViewColumn | undefined): Promise<void> {
    // Not as a preview: a preview would take the place of the registration's tab while that is still being shown.
    await vscode.commands.executeCommand('vscode.openWith', target.body, viewTypeOf(target.type), { viewColumn: column, preview: false });
    const own = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter((tab) => tab.input instanceof vscode.TabInputCustom && tab.input.viewType === RegistrationEditorProvider.viewType && tab.input.uri.toString() === registration.toString());
    if (own.length > 0) await vscode.window.tabGroups.close(own, true);
  }

  /** The body and tool type a registration names, or the sentence that says why it cannot be followed. */
  async target(document: vscode.TextDocument): Promise<{ body: vscode.Uri; type: DiagramType } | string> {
    const text = document.getText();
    const origin = originOf(text);
    if (origin === undefined) return 'This registration is empty: its first line names no tool type.';
    const type = this.types.find((candidate) => candidate.origin === origin);
    if (!type) return `This registration names the tool type ${origin}, which this plug-in does not bring.`;

    const folder = document.uri.with({ path: document.uri.path.slice(0, document.uri.path.lastIndexOf('/') + 1) });
    const named = bodyOf(text);
    const base = document.uri.path.slice(document.uri.path.lastIndexOf('/') + 1).replace(/\.adp$/i, '');
    const body = vscode.Uri.joinPath(folder, named ?? `${base}.${type.extensions[0]}`);
    try {
      await vscode.workspace.fs.stat(body);
    } catch {
      return `This registration's document, ${named ?? `${base}.${type.extensions[0]}`}, is not there.`;
    }
    return { body, type };
  }
}
