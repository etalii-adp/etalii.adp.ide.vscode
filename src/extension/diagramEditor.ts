import * as vscode from 'vscode';
import type { DiagramType, EditRequest, Field, Source, ViewModel, ViewOptions } from '../core/frame/diagramType';
import { viewTypeOf } from '../core/frame/diagramType';
import type { FromCanvas, ToCanvas } from '../core/frame/protocol';
import { LineDocument } from '../core/text/lineDocument';
import { spliceBetween } from '../core/text/splice';
import type { Findings } from './findings';
import { webviewHtml } from './webviewHtml';

/** What an edit request came to, as the canvas and the property grid are told. */
export interface Performed {
  readonly result: 'applied' | 'refused' | 'cancelled';
  readonly sentence?: string;
}

/** The registration beside a document: the file of the same name with the extension `.adp`. */
export function registrationUriOf(document: vscode.Uri): vscode.Uri {
  const dot = document.path.lastIndexOf('.');
  const slash = document.path.lastIndexOf('/');
  return document.with({ path: `${dot > slash ? document.path.slice(0, dot) : document.path}.adp` });
}

/** One diagram open in an editor: its document, its webview and what only this editor knows. */
export class OpenDiagram {
  options: ViewOptions = {};
  selection: readonly string[] = [];
  lastView: ViewModel | undefined;
  readOnly = false;
  /** The text of the registration beside the document, when there is one. */
  registration: string | undefined;
  readonly registrationUri: vscode.Uri;

  constructor(readonly type: DiagramType, readonly document: vscode.TextDocument, readonly panel: vscode.WebviewPanel) {
    this.registrationUri = registrationUriOf(document.uri);
  }

  get source(): Source {
    return this.registration === undefined ? { text: this.document.getText() } : { text: this.document.getText(), registration: this.registration };
  }

  fields(): Field[] {
    return this.type.fields(this.source, this.selection);
  }

  post(message: ToCanvas): void {
    void this.panel.webview.postMessage(message);
  }
}

async function readText(uri: vscode.Uri): Promise<string | undefined> {
  const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
  if (open) return open.getText();
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

// The one replacement that turns a document's text into another, as an edit of that document.
function replaceBetween(edit: vscode.WorkspaceEdit, document: vscode.TextDocument, after: string): void {
  const before = document.getText();
  const splice = spliceBetween(before, after);
  if (!splice) return;
  const lines = LineDocument.parse(before).lines;
  const offsetOf = (line: number): number => lines.slice(0, line).reduce((sum, entry) => sum + entry.text.length + entry.ending.length, 0);
  edit.replace(document.uri, new vscode.Range(document.positionAt(offsetOf(splice.startLine)), document.positionAt(offsetOf(splice.endLine))), splice.text);
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
    // A file of a shared extension has findings only while it is open as a diagram.
    const stillOpen = [...this.open].some((other) => other.document === diagram.document);
    if (diagram.type.shared && !stillOpen) this.findings.clear(diagram.document.uri);
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

  /** A text document changed: every diagram on it, or on the document it is the registration of, follows. */
  refreshDocument(document: vscode.TextDocument): void {
    const uri = document.uri.toString();
    for (const diagram of this.open) {
      if (diagram.document === document) {
        this.refresh(diagram);
      } else if (diagram.registrationUri.toString() === uri) {
        diagram.registration = document.getText();
        this.refresh(diagram);
      }
    }
  }

  /** A registration file changed, appeared or went on disk. */
  async refreshRegistration(uri: vscode.Uri): Promise<void> {
    for (const diagram of this.open) {
      if (diagram.registrationUri.toString() !== uri.toString()) continue;
      diagram.registration = await readText(uri);
      this.refresh(diagram);
    }
  }

  /** A document was saved: the registration beside it, which is only its visualization, is saved with it. */
  async saved(document: vscode.TextDocument): Promise<void> {
    for (const diagram of this.open) {
      if (diagram.document !== document) continue;
      const registration = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === diagram.registrationUri.toString());
      if (registration?.isDirty) await registration.save();
      return;
    }
  }

  /**
   * Carries out one edit request on a diagram's document, as one undoable edit: of the document, of
   * the registration beside it, or of both together. A request made on an older version of the
   * document is cancelled rather than applied to text it was not computed from.
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
      case 'showField':
        void vscode.commands.executeCommand('etalii.adp.properties.focus');
        return { result: 'applied' };
      case 'confirm':
        return { result: 'cancelled' };
      case 'applied': {
        const edit = new vscode.WorkspaceEdit();
        replaceBetween(edit, diagram.document, outcome.text);

        let registrationChanged = false;
        if (typeof outcome.registration === 'string' && outcome.registration !== diagram.registration) {
          registrationChanged = true;
          if (diagram.registration === undefined) {
            // The registration is written when there is first something to keep in it.
            edit.createFile(diagram.registrationUri, { contents: new TextEncoder().encode(outcome.registration), ignoreIfExists: false });
          } else {
            replaceBetween(edit, await vscode.workspace.openTextDocument(diagram.registrationUri), outcome.registration);
          }
        }

        if (edit.size > 0 && !(await vscode.workspace.applyEdit(edit))) {
          return { result: 'refused', sentence: 'Visual Studio Code did not accept the edit; the file was not changed.' };
        }
        if (registrationChanged) {
          diagram.registration = outcome.registration as string;
          // A change of the registration alone leaves the document clean, so nothing would save
          // the registration later: it is saved now. With the document changed too, it is saved
          // when the document is.
          const registration = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === diagram.registrationUri.toString());
          if (registration?.isDirty && !diagram.document.isDirty) await registration.save();
          this.refresh(diagram);
        }
        if (outcome.select !== undefined) {
          diagram.post({ v: 1, type: 'reveal', id: outcome.select, ...(outcome.editLabel ? { editLabel: true, multiline: outcome.multiline === true } : {}) });
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
    diagram.registration = await readText(diagram.registrationUri);
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
