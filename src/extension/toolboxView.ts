import * as vscode from 'vscode';
import type { FromToolbox, ToToolbox } from '../core/frame/protocol';
import type { Diagrams, OpenDiagram } from './diagramEditor';
import { webviewHtml } from './webviewHtml';

const nothingOpen = 'Open a diagram to see what can be added to it.';
const readOnly = 'This diagram is read-only, so nothing can be added to it.';

/**
 * The ADP Toolbox: a view of its own, which the user can drag wherever Visual Studio Code puts views,
 * showing the entries of whichever diagram has the focus. An entry is dragged onto the canvas, or
 * added at the centre of what the canvas shows with a click, Enter or Space.
 */
export class ToolboxView implements vscode.WebviewViewProvider {
  static readonly viewId = 'etalii.adp.toolbox';
  private view: vscode.WebviewView | undefined;

  constructor(private readonly context: vscode.ExtensionContext, private readonly diagrams: Diagrams) {
    context.subscriptions.push(diagrams.onDidChange(() => this.show()));
  }

  static register(context: vscode.ExtensionContext, diagrams: Diagrams): vscode.Disposable {
    return vscode.window.registerWebviewViewProvider(ToolboxView.viewId, new ToolboxView(context, diagrams), { webviewOptions: { retainContextWhenHidden: true } });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')] };
    view.webview.html = webviewHtml(view.webview, this.context.extensionUri, 'toolbox', 'ADP Toolbox');
    view.webview.onDidReceiveMessage((message: FromToolbox) => this.receive(message));
    view.onDidDispose(() => {
      this.view = undefined;
    });
  }

  private show(): void {
    void this.view?.webview.postMessage(entriesOf(this.diagrams.active));
  }

  private receive(message: FromToolbox): void {
    if (message.type === 'ready') {
      this.show();
      return;
    }
    const active = this.diagrams.active;
    if (active && !active.readOnly) active.post({ v: 1, type: 'addAtCentre', entry: message.entry });
  }
}

/** The entries for the active diagram, or the sentence that says why there are none. */
export function entriesOf(active: OpenDiagram | undefined): ToToolbox {
  if (!active) return { v: 1, type: 'entries', entries: [], empty: nothingOpen };
  if (active.readOnly || active.lastView?.readOnly) return { v: 1, type: 'entries', entries: [], empty: readOnly };
  return { v: 1, type: 'entries', entries: active.type.toolbox(active.source) };
}
