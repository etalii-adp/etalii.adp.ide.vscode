import * as vscode from 'vscode';
import type { EditRequest, Field, Source, ViewOptions } from '../core/frame/toolType';
import { viewTypeOf } from '../core/frame/toolType';
import type { FromCanvas, ToCanvas, ViewCause } from '../core/frame/protocol';
import { linkKind } from '../core/disl/metamodel';
import { placesOf, type Scene } from '../core/scene/scene';
import { spliceRanges } from '../core/tool/spliceRanges';
import type { HierarchyRequest, HierarchyView } from '../core/tool/hierarchyView';
import type { TableRequest, TableView } from '../core/tool/tableView';
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
  lastView: Scene | TableView | HierarchyView | undefined;
  lastVersion: number | undefined;
  readOnly = false;
  /** The text of the registration beside the document, when there is one. */
  registration: string | undefined;
  readonly registrationUri: vscode.Uri;
  /** The writes of the registration, one after the other: each starts from what the one before left. */
  registrationWrites: Promise<void> = Promise.resolve();
  /** How many of this editor's own edits are being made: a change of its files meanwhile is its own. */
  performing = 0;
  /** What change of the document the view last sent followed, as the canvas was told. */
  lastCause: ViewCause | undefined;
  /** The questions the page asks in its own place, by the `seq` of the edit that asks, until it answers. */
  readonly confirming = new Map<number, (confirmed: boolean) => void>();

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

// A registration's new text, as an edit of its document as it is now. It is small and only a
// visualization, so it is replaced whole.
function replaceRegistration(edit: vscode.WorkspaceEdit, document: vscode.TextDocument, after: string): void {
  const now = document.getText();
  if (now === after) return;
  edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), document.positionAt(now.length)), after);
}

// The name of what a request does, for the undo step: the label of the action it invokes.
function labelOf(tool: OpenTool, request: EditRequest | TableRequest | HierarchyRequest): string | undefined {
  if (request.kind === 'operation') return tool.type.actions(tool.source, request.on ?? [], tool.options).find((action) => action.id === request.operation)?.label;
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

/**
 * The layout steps of one document, beside how deep its own undo history is since it was opened, and
 * the registration's text before and after each edit of the document that also changed it.
 */
class LayoutHistory {
  depth = 0;
  readonly undo: LayoutStep[] = [];
  readonly redo: LayoutStep[] = [];
  /**
   * The registration's change made with an edit of the document, by the depth that edit brought the
   * document's history to: when that edit is undone the registration is given back its text before,
   * and when it is redone its text after, so one Undo takes back both files.
   */
  readonly withDocument = new Map<number, LayoutStep>();

  /** Whether the next thing to undo is a layout step rather than an edit of the document. */
  get canUndo(): boolean {
    return this.undo.length > 0 && this.undo[this.undo.length - 1].depth === this.depth;
  }

  /** Whether the next thing to redo is a layout step: it was made before any edit that can be redone. */
  get canRedo(): boolean {
    return this.redo.length > 0 && this.redo[this.redo.length - 1].depth === this.depth;
  }

  /**
   * The document changed: by an undo, a redo, or a new edit, which ends what could be redone. An undo
   * or a redo of an edit that also changed the registration gives the text the registration goes
   * back, or on, to: undefined when that is no file.
   */
  documentChanged(reason: vscode.TextDocumentChangeReason | undefined): { readonly registration: string | undefined } | undefined {
    if (reason === vscode.TextDocumentChangeReason.Undo) {
      const step = this.withDocument.get(this.depth);
      this.depth -= 1;
      return step && { registration: step.before };
    }
    if (reason === vscode.TextDocumentChangeReason.Redo) {
      this.depth += 1;
      const step = this.withDocument.get(this.depth);
      return step && { registration: step.after };
    }
    this.depth += 1;
    this.redo.length = 0;
    this.forgetFrom(this.depth);
    return undefined;
  }

  /** What edits of the document from this depth on did to the registration can no longer be redone. */
  forgetFrom(depth: number): void {
    for (const at of [...this.withDocument.keys()]) if (at >= depth) this.withDocument.delete(at);
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

  /**
   * Recomputes and sends what a diagram draws; called after every change of its document or options,
   * with what made the change when it follows one.
   */
  refresh(diagram: OpenTool, cause?: ViewCause): void {
    const source = diagram.source;
    // The document changed since the canvas was last sent a scene: a layout that runs on every change starts
    // from where the nodes are on screen, so that what the change did not touch moves little (DISL 10.4).
    const shown = diagram.lastView;
    if (shown && 'nodes' in shown && diagram.lastVersion !== diagram.document.version) diagram.options = { ...diagram.options, placed: placesOf(shown) };
    const computed = diagram.type.view(source, diagram.options);
    const view = diagram.readOnly ? { ...computed, readOnly: true } : computed;
    diagram.lastView = view;
    diagram.lastVersion = diagram.document.version;
    diagram.lastCause = cause;
    diagram.post({
      v: 2, type: 'view', origin: diagram.type.origin, kind: diagram.type.kind, view,
      actions: view.readOnly ? [] : diagram.type.actions(source, diagram.selection, diagram.options),
      version: diagram.document.version, ...(cause === undefined ? {} : { cause }),
    });
    this.findings.show(diagram.document, diagram.type);
    if (diagram === this.current) this.changed.fire();
  }

  /**
   * A text document changed: every diagram on it, or on the document it is the registration of,
   * follows. `changed` is false when only its modified state changed, which changes nothing it
   * draws. A change made while the diagram makes an edit of its own is that edit's; any other was
   * made outside it.
   */
  refreshDocument(document: vscode.TextDocument, changed = true): void {
    if (!changed) return;
    const uri = document.uri.toString();
    const causeOf = (diagram: OpenTool): ViewCause => (diagram.performing > 0 ? 'edit' : 'outside');
    for (const diagram of this.open) {
      if (diagram.document === document) {
        this.refresh(diagram, causeOf(diagram));
      } else if (diagram.registrationUri.toString() === uri) {
        const text = document.getText();
        // The registration as this editor wrote it, now in its document, is no change from outside.
        const cause = text === diagram.registration ? undefined : causeOf(diagram);
        diagram.registration = text;
        this.refresh(diagram, cause);
      }
    }
  }

  /** A registration file changed, appeared or went on disk. */
  async refreshRegistration(uri: vscode.Uri): Promise<void> {
    for (const diagram of this.open) {
      if (diagram.registrationUri.toString() !== uri.toString()) continue;
      const text = await readText(uri);
      // The file this editor saved is no change from outside.
      const cause = text === diagram.registration ? undefined : diagram.performing > 0 ? 'edit' : 'outside';
      diagram.registration = text;
      this.refresh(diagram, cause);
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
    const back = history.documentChanged(event.reason);
    this.publishHistory();
    const diagram = [...this.open].find((candidate) => candidate.document === event.document);
    if (back && diagram) void this.restoreRegistration(diagram, back.registration);
  }

  // An edit of the document that also changed the registration was undone or redone: the
  // registration follows, saved when the document is no longer modified. What it keeps outside the
  // history is carried over (FBL 0.7 7.1), from its text when the write is made.
  private restoreRegistration(diagram: OpenTool, text: string | undefined): Promise<void> {
    return this.queued(diagram, async () => {
      const restored = diagram.type.restoreRegistration(text, diagram.registration);
      if (diagram.registration === restored) return;
      await this.writing(diagram, restored, false);
      this.refresh(diagram, 'outside');
    });
  }

  // A write of a diagram's registration, after every write of it asked for before.
  private queued(diagram: OpenTool, write: () => Promise<void>): Promise<void> {
    const done = diagram.registrationWrites.then(write);
    diagram.registrationWrites = done.catch(() => undefined);
    return done;
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
    // What the registration keeps outside the history is carried over the step (FBL 0.7 7.1).
    await this.queued(diagram, () => this.writing(diagram, diagram.type.restoreRegistration(direction === 'undo' ? step.before : step.after, diagram.registration)));
    (direction === 'undo' ? history.redo : history.undo).push(step);
    this.refresh(diagram);
    this.publishHistory();
    return true;
  }

  // Writes a registration's text, creating or removing the file as the text asks, and saves it:
  // it is only its document's visualization and is never left modified by itself. Written with an
  // edit of the document (`now` false), it is saved when the document is, or at once when the
  // document is not modified.
  private writeRegistration(diagram: OpenTool, text: string | undefined, now = true): Promise<void> {
    return this.queued(diagram, () => this.writing(diagram, text, now));
  }

  // The write itself, made in its turn: the edit is built from the registration's text when it is applied.
  private async writing(diagram: OpenTool, text: string | undefined, now = true): Promise<void> {
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
    if (registration?.isDirty && (now || !diagram.document.isDirty)) await registration.save();
  }

  /**
   * Carries out one edit request on a diagram's document, as one undoable edit: of the document, of
   * the registration beside it, or of both together. A request made on an older version of the
   * document is cancelled rather than applied to text it was not computed from. A request that
   * changes only what this editor shows, such as a fold, writes nothing and is no undo step; one
   * that changes only what the registration keeps outside the history is written at once and is no
   * undo step either.
   */
  async perform(diagram: OpenTool, request: EditRequest | TableRequest | HierarchyRequest, version?: number, seq?: number): Promise<Performed> {
    diagram.performing += 1;
    try {
      return await this.carryOut(diagram, request, version, seq);
    } finally {
      diagram.performing -= 1;
    }
  }

  // The question an edit asks first: on a page that asks in its own place, there, under the edit's
  // `seq`; otherwise in Visual Studio Code's own dialog.
  private async ask(diagram: OpenTool, question: { readonly title: string; readonly message: string; readonly confirmLabel: string; readonly danger: boolean }, seq: number | undefined): Promise<boolean> {
    if (seq !== undefined && diagram.type.page === 'hierarchy') {
      const answered = new Promise<boolean>((resolve) => diagram.confirming.set(seq, resolve));
      diagram.post({ v: 2, type: 'confirm', seq, title: question.title, message: question.message, confirmLabel: question.confirmLabel, danger: question.danger });
      return answered;
    }
    const answer = await vscode.window.showWarningMessage(question.message, { modal: true }, question.confirmLabel);
    return answer === question.confirmLabel;
  }

  private async carryOut(diagram: OpenTool, request: EditRequest | TableRequest | HierarchyRequest, version: number | undefined, seq: number | undefined): Promise<Performed> {
    if (version !== undefined && version !== diagram.document.version) return { result: 'cancelled' };

    let outcome = diagram.type.edit(diagram.source, request, diagram.options, false);
    // A file that cannot be written takes no edit, which the tool type does not know. What changes
    // only this viewer's state, such as a fold, is still its to do.
    if (diagram.readOnly && !(outcome.kind === 'applied' && outcome.viewOptions !== undefined && outcome.splices.length === 0 && outcome.registration === undefined)) {
      return { result: 'cancelled' };
    }
    if (outcome.kind === 'confirm') {
      if (!(await this.ask(diagram, outcome, seq))) return { result: 'cancelled' };
      // The document may have changed while the question was open: the answer was to that question.
      if (version !== undefined && version !== diagram.document.version) return { result: 'cancelled' };
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
        // The request changed what this editor shows: the options it gives are taken over.
        if (outcome.viewOptions !== undefined) diagram.options = { ...diagram.options, ...outcome.viewOptions };
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
        const history = this.historyOf(diagram);

        if (documentChanges) {
          // A new edit ends what could be redone, of the registration too.
          history.forgetFrom(history.depth + 1);
          if (!(await vscode.workspace.applyEdit(edit))) {
            return { result: 'refused', sentence: 'Visual Studio Code did not accept the edit; the file was not changed.' };
          }
          if (registrationChanged) {
            // The registration is written after the document, and its change is that edit's: Undo
            // of the edit gives the registration back its text before, and Redo its text after (see
            // `documentChanged`), so one undo step takes back both files. It is saved with the document.
            history.withDocument.set(history.depth, { before: registrationBefore, after: registrationAfter, depth: history.depth });
            await this.writeRegistration(diagram, registrationAfter, false);
            this.refresh(diagram, 'edit');
          }
        } else if (registrationChanged) {
          // A change of the registration alone leaves the document clean, so nothing would save the
          // registration later: it is saved now.
          await this.writeRegistration(diagram, registrationAfter);
          if (outcome.history !== false) {
            // The step is this history's to take back, in its turn. What the registration keeps
            // outside the history (FBL 0.7 7.1), such as a fold, is no step.
            history.undo.push({ before: registrationBefore, after: registrationAfter, depth: history.depth });
            history.redo.length = 0;
            this.publishHistory();
          }
          this.refresh(diagram, 'edit');
        } else if (outcome.viewOptions !== undefined) {
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
    // A diagram is drawn on the canvas, a designer on its table or its page of boxes.
    panel.webview.html = webviewHtml(panel.webview, this.context.extensionUri, this.type.page, this.type.displayName);
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
      // A question the page can no longer answer is answered no.
      for (const answer of diagram.confirming.values()) answer(false);
      diagram.confirming.clear();
      this.tools.remove(diagram);
    });
  }

  private async receive(diagram: OpenTool, message: FromCanvas): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.tools.refresh(diagram);
        return;
      case 'viewOptions': {
        // The canvas holds no folds, and not where the nodes were before the last change: those this
        // editor holds stay. The filter a page of boxes applies and the level it narrows to are the
        // page's own: they come with its options, as `query` and `focus`, and the view is made with them.
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
        const performed = await this.tools.perform(diagram, message.request as EditRequest | TableRequest | HierarchyRequest, message.version, message.seq);
        diagram.post({ v: 2, type: 'outcome', seq: message.seq, ...performed });
        return;
      }
      case 'confirmed':
        diagram.confirming.get(message.seq)?.(message.confirmed);
        diagram.confirming.delete(message.seq);
        return;
    }
  }
}
