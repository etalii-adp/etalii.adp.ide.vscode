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
 * One change of a registration alone: a row dragged, or a diagram arranged. Such a change leaves
 * the document untouched, so Visual Studio Code's undo history of the document has nothing to take
 * back; the step is kept here instead, with how many edits of the document were on that history
 * when it was made, so Undo takes steps back in the order they were made.
 */
interface LayoutStep {
  /** The registration's text before the step; undefined when the step created the file. */
  readonly before: string | undefined;
  readonly after: string;
  readonly depth: number;
}

/** The layout steps of one document, beside how deep its own undo history is since it was opened. */
class LayoutHistory {
  depth = 0;
  readonly undo: LayoutStep[] = [];
  readonly redo: LayoutStep[] = [];

  /** Whether the next thing to undo is a layout step rather than an edit of the document. */
  get canUndo(): boolean {
    return this.undo.length > 0 && this.undo[this.undo.length - 1].depth === this.depth;
  }

  /** Whether the next thing to redo is a layout step: it was made before any edit that can be redone. */
  get canRedo(): boolean {
    return this.redo.length > 0 && this.redo[this.redo.length - 1].depth === this.depth;
  }

  /** The document changed: by an undo, a redo, or a new edit, which ends what could be redone. */
  documentChanged(reason: vscode.TextDocumentChangeReason | undefined): void {
    if (reason === vscode.TextDocumentChangeReason.Undo) {
      this.depth -= 1;
    } else if (reason === vscode.TextDocumentChangeReason.Redo) {
      this.depth += 1;
    } else {
      this.depth += 1;
      this.redo.length = 0;
    }
  }
}

/**
 * Every diagram open in this window, and the one that has the focus. The custom text editor of each
 * diagram type registers its editors here; ADP Properties and the commands act on the active one.
 */
export class Diagrams implements vscode.Disposable {
  private readonly open = new Set<OpenDiagram>();
  private current: OpenDiagram | undefined;
  private readonly histories = new Map<string, LayoutHistory>();
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
    this.historyOf(diagram);
    if (diagram.panel.active) this.activate(diagram);
  }

  remove(diagram: OpenDiagram): void {
    this.open.delete(diagram);
    if (this.current === diagram) this.activate(undefined);
    // A file of a shared extension has findings only while it is open as a diagram.
    const stillOpen = [...this.open].some((other) => other.document === diagram.document);
    if (diagram.type.shared && !stillOpen) this.findings.clear(diagram.document.uri);
    if (!stillOpen) this.histories.delete(diagram.document.uri.toString());
  }

  activate(diagram: OpenDiagram | undefined): void {
    this.current = diagram;
    this.publishHistory();
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

  private historyOf(diagram: OpenDiagram): LayoutHistory {
    const key = diagram.document.uri.toString();
    let history = this.histories.get(key);
    if (!history) {
      history = new LayoutHistory();
      this.histories.set(key, history);
    }
    return history;
  }

  // Undo and Redo go to a layout step only while one is next in line; otherwise they are the
  // platform's own, on the document.
  private publishHistory(): void {
    const history = this.current ? this.historyOf(this.current) : undefined;
    void vscode.commands.executeCommand('setContext', 'etalii.adp.layoutUndo', history?.canUndo === true);
    void vscode.commands.executeCommand('setContext', 'etalii.adp.layoutRedo', history?.canRedo === true);
  }

  /** A document was edited, or an edit of it undone or redone: its layout steps keep their place in line. */
  documentChanged(event: vscode.TextDocumentChangeEvent): void {
    if (event.contentChanges.length === 0) return;
    const history = this.histories.get(event.document.uri.toString());
    if (!history) return;
    history.documentChanged(event.reason);
    this.publishHistory();
  }

  /** Whether Undo, or Redo, on the active diagram is a layout step now. */
  layoutStepNext(direction: 'undo' | 'redo'): boolean {
    const history = this.current ? this.historyOf(this.current) : undefined;
    return direction === 'undo' ? history?.canUndo === true : history?.canRedo === true;
  }

  /** Takes the active diagram's last layout step back, or makes the last one taken back again. */
  async stepLayout(direction: 'undo' | 'redo'): Promise<boolean> {
    const diagram = this.current;
    if (!diagram) return false;
    const history = this.historyOf(diagram);
    if (direction === 'undo' ? !history.canUndo : !history.canRedo) return false;
    const step = (direction === 'undo' ? history.undo.pop() : history.redo.pop()) as LayoutStep;
    await this.writeRegistration(diagram, direction === 'undo' ? step.before : step.after);
    (direction === 'undo' ? history.redo : history.undo).push(step);
    this.refresh(diagram);
    this.publishHistory();
    return true;
  }

  // Writes a registration's text, creating or removing the file as the text asks, and saves it:
  // it is only its document's visualization and is never left modified by itself.
  private async writeRegistration(diagram: OpenDiagram, text: string | undefined): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    if (text === undefined) {
      edit.deleteFile(diagram.registrationUri, { ignoreIfNotExists: true });
    } else if (diagram.registration === undefined) {
      edit.createFile(diagram.registrationUri, { contents: new TextEncoder().encode(text), overwrite: true });
    } else {
      replaceBetween(edit, await vscode.workspace.openTextDocument(diagram.registrationUri), text);
    }
    if (edit.size > 0) await vscode.workspace.applyEdit(edit);
    diagram.registration = text;
    const registration = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === diagram.registrationUri.toString());
    if (registration?.isDirty) await registration.save();
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
        const documentChanges = outcome.text !== diagram.document.getText();
        const registrationBefore = diagram.registration;
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
          if (!documentChanges) {
            // The registration alone changed: the step is this history's to take back, in its turn.
            const history = this.historyOf(diagram);
            history.undo.push({ before: registrationBefore, after: outcome.registration as string, depth: history.depth });
            history.redo.length = 0;
            this.publishHistory();
          }
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
