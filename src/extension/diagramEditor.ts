import * as vscode from 'vscode';
import type { DiagramType, EditRequest, Field, Source, ViewModel, ViewOptions } from '../core/frame/diagramType';
import { viewTypeOf } from '../core/frame/diagramType';
import type { FromCanvas, ToCanvas } from '../core/frame/protocol';
import { spliceBetween } from '../core/text/splice';
import { LineDocument } from '../core/text/lineDocument';
import type { Findings } from './findings';
import { webviewHtml } from './webviewHtml';

/** What an edit request came to, as the canvas and the property grid are told. */
export interface Performed {
  readonly result: 'applied' | 'refused' | 'cancelled';
  readonly sentence?: string;
}

/** One diagram open in an editor: its document, its webview and what only this editor knows. */
export class OpenDiagram {
  options: ViewOptions = {};
  selection: readonly string[] = [];
  lastView: ViewModel | undefined;
  readOnly = false;

  constructor(readonly type: DiagramType, readonly document: vscode.TextDocument, readonly panel: vscode.WebviewPanel) {}

  get source(): Source {
    return { text: this.document.getText() };
  }

  fields(): Field[] {
    return this.type.fields(this.source, this.selection);
  }

  post(message: ToCanvas): void {
    void this.panel.webview.postMessage(message);
  }
}

/**
 * Every diagram open in this window, and the one that has the focus. The custom text editor of each
 * diagram type registers its editors here; ADP Properties and the commands act on the active one.
 */
export class Diagrams implements vscode.Disposable {
  private readonly open = new Set<OpenDiagram>();
  private current: OpenDiagram | undefined;
  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires when the active diagram, its selection or its document changes. */
  readonly onDidChange = this.changed.event;

  constructor(private readonly findings: Findings) {}

  get active(): OpenDiagram | undefined {
    return this.current;
  }

  dispose(): void {
    this.changed.dispose();
  }

  add(diagram: OpenDiagram): void {
    this.open.add(diagram);
    if (diagram.panel.active) this.activate(diagram);
  }

  remove(diagram: OpenDiagram): void {
    this.open.delete(diagram);
    if (this.current === diagram) this.activate(undefined);
  }

  activate(diagram: OpenDiagram | undefined): void {
    this.current = diagram;
    this.changed.fire();
  }

  /** Recomputes and sends what a diagram draws; called after every change of its document or options. */
  refresh(diagram: OpenDiagram): void {
    const source = diagram.source;
    const computed = diagram.type.view(source, diagram.options);
    const view: ViewModel = diagram.readOnly ? { ...computed, readOnly: true } : computed;
    diagram.lastView = view;
    diagram.post({
      v: 1, type: 'view', origin: diagram.type.origin, view,
      toolbox: view.readOnly ? [] : diagram.type.toolbox(source),
      actions: view.readOnly ? [] : diagram.type.actions(source, diagram.selection),
      version: diagram.document.version,
    });
    this.findings.show(diagram.document, diagram.type);
    if (diagram === this.current) this.changed.fire();
  }

  refreshDocument(document: vscode.TextDocument): void {
    for (const diagram of this.open) {
      if (diagram.document === document) this.refresh(diagram);
    }
  }

  /**
   * Carries out one edit request on a diagram's document, as one undoable edit of that document.
   * A request made on an older version of the document is cancelled rather than applied to text it
   * was not computed from.
   */
  async perform(diagram: OpenDiagram, request: EditRequest, version?: number): Promise<Performed> {
    if (diagram.readOnly) return { result: 'cancelled' };
    if (version !== undefined && version !== diagram.document.version) return { result: 'cancelled' };

    let outcome = diagram.type.edit(diagram.source, request, diagram.options, false);
    if (outcome.kind === 'confirm') {
      const answer = await vscode.window.showWarningMessage(outcome.message, { modal: true }, outcome.confirmLabel);
      if (answer !== outcome.confirmLabel) return { result: 'cancelled' };
      outcome = diagram.type.edit(diagram.source, request, diagram.options, true);
    }

    switch (outcome.kind) {
      case 'refused':
        return { result: 'refused', sentence: outcome.sentence };
      case 'editInPlace':
        diagram.post({ v: 1, type: 'reveal', id: outcome.id, editLabel: true, multiline: outcome.multiline });
        return { result: 'applied' };
      case 'confirm':
        return { result: 'cancelled' };
      case 'applied': {
        const before = diagram.document.getText();
        const splice = spliceBetween(before, outcome.text);
        if (splice) {
          const lines = LineDocument.parse(before).lines;
          const offsetOf = (line: number): number => lines.slice(0, line).reduce((sum, entry) => sum + entry.text.length + entry.ending.length, 0);
          const range = new vscode.Range(diagram.document.positionAt(offsetOf(splice.startLine)), diagram.document.positionAt(offsetOf(splice.endLine)));
          const edit = new vscode.WorkspaceEdit();
          edit.replace(diagram.document.uri, range, splice.text);
          if (!(await vscode.workspace.applyEdit(edit))) {
            return { result: 'refused', sentence: 'Visual Studio Code did not accept the edit; the file was not changed.' };
          }
        }
        if (outcome.select !== undefined) {
          diagram.post({ v: 1, type: 'reveal', id: outcome.select, ...(outcome.editLabel ? { editLabel: true, multiline: true } : {}) });
        }
        return { result: 'applied' };
      }
    }
  }
}

async function isReadOnly(document: vscode.TextDocument): Promise<boolean> {
  if (vscode.workspace.fs.isWritableFileSystem(document.uri.scheme) === false) return true;
  try {
    const stat = await vscode.workspace.fs.stat(document.uri);
    return stat.permissions !== undefined && (stat.permissions & vscode.FilePermission.Readonly) !== 0;
  } catch {
    return false;
  }
}

/**
 * The custom text editor every diagram type shares. The diagram is an editor on the file's own text
 * document, so undo, redo, the modified state, save, revert and the text editor's view of the same
 * file are Visual Studio Code's own.
 */
export class DiagramEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext, private readonly type: DiagramType, private readonly diagrams: Diagrams) {}

  static register(context: vscode.ExtensionContext, type: DiagramType, diagrams: Diagrams): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(viewTypeOf(type), new DiagramEditorProvider(context, type, diagrams), {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    });
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const diagram = new OpenDiagram(this.type, document, panel);
    diagram.readOnly = await isReadOnly(document);
    panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')] };
    panel.webview.html = webviewHtml(panel.webview, this.context.extensionUri, 'canvas', this.type.displayName);
    this.diagrams.add(diagram);

    const subscriptions: vscode.Disposable[] = [
      panel.webview.onDidReceiveMessage((message: FromCanvas) => void this.receive(diagram, message)),
      panel.onDidChangeViewState(() => {
        if (panel.active) this.diagrams.activate(diagram);
        else if (this.diagrams.active === diagram) this.diagrams.activate(undefined);
      }),
    ];
    panel.onDidDispose(() => {
      for (const subscription of subscriptions) subscription.dispose();
      this.diagrams.remove(diagram);
    });
  }

  private async receive(diagram: OpenDiagram, message: FromCanvas): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.diagrams.refresh(diagram);
        return;
      case 'viewOptions':
        diagram.options = message.options;
        this.diagrams.refresh(diagram);
        return;
      case 'selection':
        diagram.selection = message.ids;
        this.diagrams.refresh(diagram);
        return;
      case 'editing':
        void vscode.commands.executeCommand('setContext', 'etalii.adp.editingText', message.active);
        return;
      case 'edit': {
        const performed = await this.diagrams.perform(diagram, message.request, message.version);
        diagram.post({ v: 1, type: 'outcome', seq: message.seq, ...performed });
        return;
      }
    }
  }
}