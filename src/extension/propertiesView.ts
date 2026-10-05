import * as vscode from 'vscode';
import type { FromProperties, ToProperties } from '../core/frame/protocol';
import type { Diagrams, OpenDiagram } from './diagramEditor';
import { webviewHtml } from './webviewHtml';

const nothingOpen = 'Open a diagram to see the properties of what you select in it.';
const nothingSelected = 'Select an element or a relation in the diagram to see its properties.';
const severalSelected = 'Several items are selected. Select one to see its properties.';

/**
 * ADP Properties: a view that shows and edits the selection of whichever diagram has the focus. It
 * follows that diagram, and says so when none has the focus rather than showing the last one.
 */
export class PropertiesView implements vscode.WebviewViewProvider {
  static readonly viewId = 'etalii.adp.properties';
  private view: vscode.WebviewView | undefined;

  constructor(private readonly context: vscode.ExtensionContext, private readonly diagrams: Diagrams) {
    context.subscriptions.push(diagrams.onDidChange(() => this.show()));
  }

  static register(context: vscode.ExtensionContext, diagrams: Diagrams): vscode.Disposable {
    return vscode.window.registerWebviewViewProvider(PropertiesView.viewId, new PropertiesView(context, diagrams), { webviewOptions: { retainContextWhenHidden: true } });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')] };
    view.webview.html = webviewHtml(view.webview, this.context.extensionUri, 'properties', 'ADP Properties');
    view.webview.onDidReceiveMessage((message: FromProperties) => void this.receive(message));
    view.onDidDispose(() => {
      this.view = undefined;
    });
  }

  private post(message: ToProperties): void {
    void this.view?.webview.postMessage(message);
  }

  private show(): void {
    const active = this.diagrams.active;
    this.post(describe(active));
  }

  private async receive(message: FromProperties): Promise<void> {
    if (message.type === 'ready') {
      this.show();
      return;
    }
    const active = this.diagrams.active;
    // The edit is for the element the rows were shown for; if the selection moved on, it is dropped.
    if (!active || active.selection.length !== 1 || active.selection[0] !== message.target) return;
    const performed = await this.diagrams.perform(active, { kind: 'setField', id: message.target, field: message.field, value: message.value });
    this.post({ v: 1, type: 'fieldOutcome', field: message.field, ...(performed.result === 'refused' ? { refused: performed.sentence ?? '' } : {}) });
    if (performed.result !== 'applied') this.show();
  }
}

/** The rows for a diagram's selection, or the sentence that says why there are none. */
export function describe(active: OpenDiagram | undefined): ToProperties {
  if (!active) return { v: 1, type: 'fields', fields: [], empty: nothingOpen };
  if (active.selection.length === 0) return { v: 1, type: 'fields', fields: [], empty: nothingSelected };
  if (active.selection.length > 1) return { v: 1, type: 'fields', fields: [], empty: severalSelected };
  const fields = active.fields().map((field) => (active.readOnly && field.readOnly === undefined ? { ...field, readOnly: 'This file is read-only.' } : field));
  return { v: 1, type: 'fields', fields, target: active.selection[0] };
}
