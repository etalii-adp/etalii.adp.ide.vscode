import * as vscode from 'vscode';
import type { EditRequest, Field, Source, ViewModel, ViewOptions } from '../core/frame/toolType';
import { viewTypeOf } from '../core/frame/toolType';
import type { FromCanvas, ToCanvas } from '../core/frame/protocol';
import { linkKind } from '../core/disl/metamodel';
import { placesOf, type Scene } from '../core/scene/scene';
import { spliceRanges } from '../core/tool/spliceRanges';
import type { Findings } from './findings';
import { handBack } from './opening';
import { pickLink } from './projectLinkPicker';
import type { AnyToolType } from './toolTypes';
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

/** One tool open in an editor: its document, its webview and what only this editor knows. */
export class OpenTool {
  options: ViewOptions = {};
  selection: readonly string[] = [];
  /** What the canvas was last sent: the tool type's own view, and the version of the document it was made of. */
  lastView: Scene | ViewModel | undefined;
  lastVersion: number | undefined;
  readOnly = false;
  /** The text of the registration beside the document, when there is one. */
  registration: string | undefined;
  readonly registrationUri: vscode.Uri;

  constructor(readonly type: AnyToolType, readonly document: vscode.TextDocument, readonly panel: vscode.WebviewPanel) {
    this.registrationUri = registrationUriOf(document.uri);
  }

  get source(): Source {
    const source = { fileName: this.document.fileName, text: this.document.getText() };
    return this.registration === undefined ? source : { ...source, registration: this.registration };
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

// A registration's new text, as an edit of its document. It is small and only a visualization, so
// it is replaced whole.
function replaceRegistration(edit: vscode.WorkspaceEdit, document: vscode.TextDocument, after: string): void {
  if (document.getText() === after) return;
  edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), document.positionAt(document.getText().length)), after);
}

// The name of what a request does, for the undo step: the label of the action it invokes.
function labelOf(tool: OpenTool, request: EditRequest): string | undefined {
  if (request.kind !== 'action') return undefined;
  return tool.type.actions(tool.source, request.id === undefined ? [] : [request.id], tool.options).find((action) => action.id === request.action)?.label;
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
  /** And after it; undefined when the step removed the file. */
  readonly after: string | undefined;
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
export class Tools implements vscode.Disposable {
  private readonly open = new Set<OpenTool>();
  private current: OpenTool | undefined;
  private readonly histories = new Map<string, LayoutHistory>();
  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires when the active diagram, its selection or its document changes. */
  readonly onDidChange = this.changed.event;

  constructor(private readonly findings: Findings) {}

  get active(): OpenTool | undefined {
    return this.current;
  }

  dispose(): void {
    this.changed.dispose();
  }

  add(diagram: OpenTool): void {
    this.open.add(diagram);
    this.historyOf(diagram);
    if (diagram.panel.active) this.activate(diagram);
  }

  remove(diagram: OpenTool): void {
    this.open.delete(diagram);
    if (this.current === diagram) this.activate(undefined);
    // A file of a shared extension has findings only while it is open as a diagram.
    const stillOpen = [...this.open].some((other) => other.document === diagram.document);
    if (diagram.type.claims.some((claim) => claim.shared) && !stillOpen) this.findings.clear(diagram.document.uri);
    if (!stillOpen) this.histories.delete(diagram.document.uri.toString());
  }

  activate(diagram: OpenTool | undefined): void {
    this.current = diagram;
    this.publishHistory();
    this.changed.fire();
  }

  /** Recomputes and sends what a diagram draws; called after every change of its document or options. */
  refresh(diagram: OpenTool): void {
    const source = diagram.source;
    // The document changed since the canvas was last sent a scene: a layout that runs on every change starts
    // from where the nodes are on screen, so that what the change did not touch moves little (DISL 10.4).
    const shown = diagram.lastView;
    if (shown && 'nodes' in shown && diagram.lastVersion !== diagram.document.version) diagram.options = { ...diagram.options, placed: placesOf(shown) };
    const computed = diagram.type.view(source, diagram.options);
    const view = diagram.readOnly ? { ...computed, readOnly: true } : computed;
    diagram.lastView = view;
    diagram.lastVersion = diagram.document.version;
    diagram.post({
      v: 2, type: 'view', origin: diagram.type.origin, kind: diagram.type.kind, view,
      actions: view.readOnly ? [] : diagram.type.actions(source, diagram.selection, diagram.options),
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

  private historyOf(diagram: OpenTool): LayoutHistory {
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
  private async writeRegistration(diagram: OpenTool, text: string | undefined): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    if (text === undefined) {
      edit.deleteFile(diagram.registrationUri, { ignoreIfNotExists: true });
    } else if (diagram.registration === undefined) {
      edit.createFile(diagram.registrationUri, { contents: new TextEncoder().encode(text), overwrite: true });
    } else {
      replaceRegistration(edit, await vscode.workspace.openTextDocument(diagram.registrationUri), text);
    }
    if (edit.size > 0) await vscode.workspace.applyEdit(edit);
    diagram.registration = text;
    const registration = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === diagram.registrationUri.toString());
    if (registration?.isDirty) await registration.save();
  }

  /**
   * Carries out one edit request on a diagram's document, as one undoable edit: of the document, of
   * the registration beside it, or of both together. A request made on an older version of the
   * document is cancelled rather than applied to text it was not computed from. A request that
   * changes only what this editor shows, such as a fold, writes nothing and is no undo step.
   */
  async perform(diagram: OpenTool, request: EditRequest, version?: number): Promise<Performed> {
    if (version !== undefined && version !== diagram.document.version) return { result: 'cancelled' };

    let outcome = diagram.type.edit(diagram.source, request, diagram.options, false);
    // A file that cannot be written takes no edit, which the tool type does not know. What changes
    // only this viewer's state, such as a fold, is still its to do.
    if (diagram.readOnly && !(outcome.kind === 'applied' && outcome.viewOptions !== undefined && outcome.splices.length === 0 && outcome.registration === undefined)) {
      return { result: 'cancelled' };
    }
    if (outcome.kind === 'confirm') {
      const answer = await vscode.window.showWarningMessage(outcome.message, { modal: true }, outcome.confirmLabel);
      if (answer !== outcome.confirmLabel) return { result: 'cancelled' };
      outcome = diagram.type.edit(diagram.source, request, diagram.options, true);
    }

    switch (outcome.kind) {
      case 'refused':
        return { result: 'refused', sentence: outcome.sentence };
      case 'editInPlace':
        diagram.post({ v: 2, type: 'reveal', id: outcome.id, editLabel: true, multiline: outcome.multiline });
        return { result: 'applied' };
      case 'showField':
        void vscode.commands.executeCommand('etalii.adp.properties.focus');
        return { result: 'applied' };
      case 'confirm':
        return { result: 'cancelled' };
      case 'pickPath': {
        // The user picks a file or a folder, and the answer is an edit like any other: one undo step.
        const picked = await pickLink(diagram.document.uri);
        if (picked === undefined) return { result: 'cancelled' };
        if ('refused' in picked) return { result: 'refused', sentence: picked.refused };
        return this.perform(diagram, { kind: 'setField', id: outcome.id, field: outcome.field, value: picked.value });
      }
      case 'open': {
        // An address is opened in the browser. A path, read against the document's folder when it is
        // relative, is shown in the Explorer and opened when it lies in the workspace; any other path
        // is shown, with why it was not opened and an offer to copy it (DISL 9.4).
        const link = outcome.path;
        if (linkKind(link).kind === 'uri') {
          await vscode.env.openExternal(vscode.Uri.parse(link));
          return { result: 'applied' };
        }
        const absolute = /^([A-Za-z]:[\\/]|[\\/])/.test(link);
        const target = absolute ? vscode.Uri.file(link) : vscode.Uri.joinPath(diagram.document.uri, '..', link);
        if (vscode.workspace.getWorkspaceFolder(target) === undefined) {
          const copy = 'Copy Path';
          const chosen = await vscode.window.showInformationMessage(`${target.fsPath} is outside this workspace, so it is not opened.`, copy);
          if (chosen === copy) await vscode.env.clipboard.writeText(target.fsPath);
          return { result: 'applied' };
        }
        try {
          const found = await vscode.workspace.fs.stat(target);
          await vscode.commands.executeCommand('revealInExplorer', target);
          if (found.type !== vscode.FileType.Directory) await vscode.commands.executeCommand('vscode.open', target);
        } catch {
          return { result: 'refused', sentence: `${target.fsPath} is not there, so it is not opened.` };
        }
        return { result: 'applied' };
      }
      case 'applied': {
        // Every splice of the gesture goes into one edit, so one gesture is one undo step. The
        // ranges are all of the text as it is before the edit (etalii.adp spec 027, research R5).
        const edit = new vscode.WorkspaceEdit();
        const documentChanges = outcome.splices.length > 0;
        // The request changed what this editor shows: the options it gives replace those held.
        if (outcome.viewOptions !== undefined) diagram.options = outcome.viewOptions;
        const registrationBefore = diagram.registration;
        const label = labelOf(diagram, request);
        const metadata = label === undefined ? undefined : { label, needsConfirmation: false };
        for (const splice of spliceRanges(diagram.document.getText(), outcome.splices)) {
          const range = new vscode.Range(splice.start.line, splice.start.character, splice.end.line, splice.end.character);
          edit.replace(diagram.document.uri, range, splice.text, metadata);
        }

        // The registration's new text, or undefined when the edit removes the file.
        const registrationAfter = outcome.registration ?? undefined;
        const registrationChanged = outcome.registration !== undefined && registrationAfter !== diagram.registration;
        if (registrationChanged) {
          if (registrationAfter === undefined) {
            edit.deleteFile(diagram.registrationUri, { ignoreIfNotExists: true });
          } else if (diagram.registration === undefined) {
            // The registration is written when there is first something to keep in it.
            edit.createFile(diagram.registrationUri, { contents: new TextEncoder().encode(registrationAfter), ignoreIfExists: false });
          } else {
            replaceRegistration(edit, await vscode.workspace.openTextDocument(diagram.registrationUri), registrationAfter);
          }
        }

        if (edit.size > 0 && !(await vscode.workspace.applyEdit(edit))) {
          return { result: 'refused', sentence: 'Visual Studio Code did not accept the edit; the file was not changed.' };
        }
        if (registrationChanged) {
          diagram.registration = registrationAfter;
          if (!documentChanges) {
            // The registration alone changed: the step is this history's to take back, in its turn.
            const history = this.historyOf(diagram);
            history.undo.push({ before: registrationBefore, after: registrationAfter, depth: history.depth });
            history.redo.length = 0;
            this.publishHistory();
          }
          // A change of the registration alone leaves the document clean, so nothing would save
          // the registration later: it is saved now. With the document changed too, it is saved
          // when the document is.
          const registration = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === diagram.registrationUri.toString());
          if (registration?.isDirty && !diagram.document.isDirty) await registration.save();
          this.refresh(diagram);
        } else if (outcome.viewOptions !== undefined && !documentChanges) {
          // Nothing was written, so no change of the document brings the view: it is sent now.
          this.refresh(diagram);
        }
        if (outcome.select !== undefined) {
          diagram.post({ v: 2, type: 'reveal', id: outcome.select, ...(outcome.editLabel ? { editLabel: true, multiline: outcome.multiline === true } : {}) });
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
export class ToolEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext, private readonly type: AnyToolType, private readonly tools: Tools) {}

  static register(context: vscode.ExtensionContext, type: AnyToolType, tools: Tools): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(viewTypeOf(type), new ToolEditorProvider(context, type, tools), {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    });
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    // A file of the type's extension that its binding's marker does not match is not this tool's.
    if (!this.type.claimed(document.fileName, document.getText())) {
      handBack(document.uri, viewTypeOf(this.type), panel);
      return;
    }
    const diagram = new OpenTool(this.type, document, panel);
    diagram.readOnly = await isReadOnly(document);
    diagram.registration = await readText(diagram.registrationUri);
    panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')] };
    panel.webview.html = webviewHtml(panel.webview, this.context.extensionUri, 'canvas', this.type.displayName);
    this.tools.add(diagram);

    const subscriptions: vscode.Disposable[] = [
      panel.webview.onDidReceiveMessage((message: FromCanvas) => void this.receive(diagram, message)),
      panel.onDidChangeViewState(() => {
        if (panel.active) this.tools.activate(diagram);
        else if (this.tools.active === diagram) this.tools.activate(undefined);
      }),
    ];
    panel.onDidDispose(() => {
      for (const subscription of subscriptions) subscription.dispose();
      this.tools.remove(diagram);
    });
  }

  private async receive(diagram: OpenTool, message: FromCanvas): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.tools.refresh(diagram);
        return;
      case 'viewOptions': {
        // The canvas holds no folds, and not where the nodes were before the last change: those this editor holds stay.
        const { collapsed, placed } = diagram.options;
        diagram.options = { ...message.options, ...(collapsed === undefined ? {} : { collapsed }), ...(placed === undefined ? {} : { placed }) };
        this.tools.refresh(diagram);
        return;
      }
      case 'selection':
        diagram.selection = message.ids;
        this.tools.refresh(diagram);
        return;
      case 'editing':
        void vscode.commands.executeCommand('setContext', 'etalii.adp.editingText', message.active);
        return;
      case 'edit': {
        // The request is the tool type's own; its `edit` refuses one it does not know.
        const performed = await this.tools.perform(diagram, message.request as EditRequest, message.version);
        diagram.post({ v: 2, type: 'outcome', seq: message.seq, ...performed });
        return;
      }
    }
  }
}
