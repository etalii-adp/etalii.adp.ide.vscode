import * as vscode from 'vscode';
import type { Action, EditRequest, Field, Source, TextSplice, ViewOptions } from '../core/frame/toolType';
import { exportOf, LINKED_FROM, OPEN_LINKED, viewTypeOf } from '../core/frame/toolType';
import { lookupItems } from '../core/tool/linkActions';
import type { LinkIndex } from './linkIndex';
import type { FromCanvas, ToCanvas, ViewCause } from '../core/frame/protocol';
import { linkKind } from '../core/disl/metamodel';
import { placesOf, type Scene } from '../core/scene/scene';
import { spliceRanges } from '../core/tool/spliceRanges';
import type { HierarchyRequest, HierarchyView } from '../core/tool/hierarchyView';
import type { SectionsRequest, SectionsView } from '../core/tool/sectionsView';
import type { TableRequest, TableView } from '../core/tool/tableView';
import type { Findings } from './findings';
import { UNSAVED, writeExport } from './exports';
import { handBack } from './opening';
import { pickLink } from './projectLinkPicker';
import { movedName, relativePath } from '../core/tool/toolTypeFrom';
import { folderTexts } from './folderSubject';
import { RelatedFiles, relatedUri, textOf, ToolFiles } from './relatedFiles';
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
  lastView: Scene | TableView | HierarchyView | SectionsView | undefined;
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
  /** The files the document names that its tool type reads as well, where it reads any. */
  related: RelatedFiles | undefined;
  /** A row to select once the page has drawn its first view: one a link in another document opened. */
  selectOnReady: string | undefined;
  /** The other documents of its tool type in the workspace, as this one names them; undefined until they are found. */
  peers: readonly string[] | undefined;
  /** For a registration that opens a folder subject: the texts of the files the tool type reads in its folder. */
  folder: Readonly<Record<string, string>> | undefined;
  /** The workspace's index of documents that link to each other, for a tool type that takes part in links (FBL 17.3). */
  links: LinkIndex | undefined;

  constructor(readonly type: AnyToolType, readonly document: vscode.TextDocument, readonly panel: vscode.WebviewPanel) {
    this.registrationUri = registrationUriOf(document.uri);
  }

  get source(): Source {
    const source = { fileName: this.document.fileName, text: this.document.getText() };
    const related = this.related?.texts;
    return {
      ...source, ...(this.registration === undefined ? {} : { registration: this.registration }), ...(related === undefined ? {} : { related }),
      ...(this.peers === undefined ? {} : { peers: this.peers }),
      ...(this.folder === undefined ? {} : { folder: this.folder }),
      ...(this.links === undefined ? {} : this.links.sourceOf(this.document.uri)),
    };
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
function labelOf(tool: OpenTool, request: EditRequest | TableRequest | HierarchyRequest | SectionsRequest): string | undefined {
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

  constructor(private readonly findings: Findings, readonly links?: LinkIndex) {
    // A document that links to others is drawn again when they change: a name, a link that now resolves (FBL 17.4).
    let pending: ReturnType<typeof setTimeout> | undefined;
    this.linking = links?.onDidChange(() => {
      if (pending !== undefined) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = undefined;
        for (const diagram of this.open) if (diagram.links !== undefined) this.refresh(diagram);
      }, 200);
    });
  }

  private readonly linking: vscode.Disposable | undefined;

  get active(): OpenTool | undefined {
    return this.current;
  }

  dispose(): void {
    this.changed.dispose();
    this.linking?.dispose();
    for (const files of this.toolFiles.values()) files.dispose();
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
    // The files the document names now are read, and followed; the view comes again once they are.
    // The other documents of the tool type are read too: what deleting rows would leave naming nothing is counted in them (spec 080, FR-009).
    if (diagram.related && diagram.type.related) diagram.related.follow([...new Set([...diagram.type.related(source), ...(diagram.peers ?? [])])]);
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
      actions: this.actionsOf(diagram, view.readOnly === true),
      version: diagram.document.version, ...(cause === undefined ? {} : { cause }),
    });
    this.findings.show(diagram.document, diagram.type, {
      ...(source.related === undefined ? {} : { related: source.related }), ...(source.links === undefined ? {} : { links: source.links }), ...(source.linkPath === undefined ? {} : { linkPath: source.linkPath }),
    });
    if (diagram === this.current) this.changed.fire();
  }

  /**
   * What the menu of a diagram offers: in a document that cannot be edited only its exports, which change nothing of it;
   * and an export of a document never saved is offered disabled, since its file is written beside the document.
   */
  private actionsOf(diagram: OpenTool, readOnly: boolean): Action[] {
    // What changes nothing of the document stays: an export, and the host's entries for links (FBL 17.5).
    const actions = diagram.type.actions(diagram.source, diagram.selection, diagram.options).filter((action) => !readOnly || exportOf(action.id) !== undefined || action.id === OPEN_LINKED || action.id === LINKED_FROM);
    return diagram.document.isUntitled ? actions.map((action) => (exportOf(action.id) === undefined ? action : { ...action, enabled: false, disabledReason: UNSAVED })) : actions;
  }

  /** The editor open on a file, the active one first; none when no editor of a tool holds it. */
  editorOn(uri: vscode.Uri): OpenTool | undefined {
    const on = [...this.open].filter((diagram) => diagram.document.uri.toString() === uri.toString());
    return on.find((diagram) => diagram === this.current) ?? on[0];
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
      // A file the document names changed in its editor: what the document shows of it follows.
      if (diagram.document !== document && diagram.related?.documentChanged(document)) continue;
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

  /**
   * A registration file changed, appeared or went on disk. It is read in its turn among the registration's
   * writes, as the watcher may tell of a change long after it was made: a read begun before a write and
   * ended after it would otherwise give the diagram back the text the write replaced, and the next write
   * would start from that. A read the registration changed under is no news either.
   */
  async refreshRegistration(uri: vscode.Uri): Promise<void> {
    await Promise.all([...this.open].filter((diagram) => diagram.registrationUri.toString() === uri.toString()).map((diagram) => this.queued(diagram, async () => {
      const held = diagram.registration;
      const text = await readText(uri);
      if (diagram.registration !== held || !this.open.has(diagram)) return;
      // The file this editor saved is no change from outside.
      const cause = text === diagram.registration ? undefined : diagram.performing > 0 ? 'edit' : 'outside';
      diagram.registration = text;
      this.refresh(diagram, cause);
    })));
  }

  /**
   * The options a canvas or a page sent, and the view made with them. The canvas holds no folds, and
   * not where the nodes were before the last change: those this editor holds stay. The filter a page
   * of boxes applies and the level it narrows to are the page's own: they come with its options, as
   * `query` and `focus`, and are never written.
   */
  setOptions(diagram: OpenTool, options: ViewOptions): void {
    const { collapsed, placed } = diagram.options;
    diagram.options = { ...options, ...(collapsed === undefined ? {} : { collapsed }), ...(placed === undefined ? {} : { placed }) };
    this.refresh(diagram);
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
  private queued<T>(diagram: OpenTool, write: () => Promise<T>): Promise<T> {
    const done = diagram.registrationWrites.then(write);
    diagram.registrationWrites = done.then(() => undefined, () => undefined);
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
  async perform(diagram: OpenTool, request: EditRequest | TableRequest | HierarchyRequest | SectionsRequest, version?: number, seq?: number): Promise<Performed> {
    diagram.performing += 1;
    try {
      return await this.carryOut(diagram, request, version, seq);
    } finally {
      diagram.performing -= 1;
    }
  }

  // The question an edit asks first: on a page that asks in its own place, there, under the edit's
  // `seq`; otherwise in Visual Studio Code's own dialog. The page shows one question at a time, so
  // one still open when another is asked is answered no. While a question is open this editor makes
  // no edit: a change of its files meanwhile was made outside it.
  private async ask(diagram: OpenTool, question: { readonly title: string; readonly message: string; readonly confirmLabel: string; readonly danger: boolean }, seq: number | undefined): Promise<boolean> {
    diagram.performing -= 1;
    try {
      if (seq !== undefined && diagram.type.page === 'hierarchy') {
        for (const [open, answer] of [...diagram.confirming]) {
          diagram.confirming.delete(open);
          answer(false);
        }
        const answered = new Promise<boolean>((resolve) => diagram.confirming.set(seq, resolve));
        diagram.post({ v: 2, type: 'confirm', seq, title: question.title, message: question.message, confirmLabel: question.confirmLabel, danger: question.danger });
        return await answered;
      }
      const answer = await vscode.window.showWarningMessage(question.message, { modal: true }, question.confirmLabel);
      return answer === question.confirmLabel;
    } finally {
      diagram.performing += 1;
    }
  }

  // A request that changes the registration alone, carried out in its turn among the registration's
  // writes: the tool type makes it again from the registration as the write before it left it. Such a
  // change leaves the document clean, so nothing would save the registration later: it is saved now.
  private registrationOnly(diagram: OpenTool, request: EditRequest | TableRequest | HierarchyRequest | SectionsRequest, confirmed: boolean): Promise<Performed> {
    return this.queued(diagram, async (): Promise<Performed> => {
      const outcome = diagram.type.edit(diagram.source, request, diagram.options, confirmed);
      if (outcome.kind === 'refused') return { result: 'refused', sentence: outcome.sentence };
      // What the write before did changed what this request is: it is no longer made.
      if (outcome.kind !== 'applied' || outcome.splices.length > 0) return { result: 'cancelled' };
      if (outcome.viewOptions !== undefined) diagram.options = { ...diagram.options, ...outcome.viewOptions };
      const before = diagram.registration;
      const after = outcome.registration ?? undefined;
      if (outcome.registration !== undefined && after !== before) {
        await this.writing(diagram, after);
        if (outcome.history !== false) {
          // The step is this history's to take back, in its turn. What the registration keeps
          // outside the history (FBL 0.7 7.1), such as a fold, is no step.
          const history = this.historyOf(diagram);
          history.undo.push({ before, after, depth: history.depth });
          history.redo.length = 0;
          this.publishHistory();
        }
        this.refresh(diagram, 'edit');
      } else if (outcome.viewOptions !== undefined) {
        this.refresh(diagram);
      }
      if (outcome.select !== undefined) {
        diagram.post({ v: 2, type: 'reveal', id: outcome.select, ...(outcome.editLabel ? { editLabel: true, multiline: outcome.multiline === true } : {}) });
      } else if (outcome.show !== undefined) {
        diagram.post({ v: 2, type: 'reveal', id: outcome.show, keepSelection: true });
      }
      return { result: 'applied' };
    });
  }

  /**
   * A related row opened where it lives (etalii.adp spec 080, FR-002): its file in this tool, or
   * brought forward where it is open already, with the row selected.
   */
  private async follow(diagram: OpenTool, path: string, row: string): Promise<Performed> {
    const target = relatedUri(diagram.document.uri, path);
    const shown = [...this.open].find((other) => other.document.uri.toString() === target.toString() && other.type === diagram.type);
    if (shown) {
      shown.panel.reveal();
      shown.post({ v: 2, type: 'reveal', id: row });
      return { result: 'applied' };
    }
    try {
      await vscode.workspace.fs.stat(target);
    } catch {
      return { result: 'refused', sentence: `${path} is not there, so it is not opened.` };
    }
    this.selecting.set(target.toString(), row);
    await vscode.commands.executeCommand('vscode.openWith', target, viewTypeOf(diagram.type));
    return { result: 'applied' };
  }

  /**
   * The splices of another file a step writes, added to the edit of the document: refused for a file
   * outside the workspace or in a workspace that is not trusted (research R4), and for one that changed
   * since the step was planned on it.
   */
  private async otherSplices(diagram: OpenTool, other: { readonly file: string; readonly splices: readonly TextSplice[] }, edit: vscode.WorkspaceEdit, metadata: vscode.WorkspaceEditEntryMetadata | undefined): Promise<string | undefined> {
    const uri = relatedUri(diagram.document.uri, other.file);
    if (!vscode.workspace.isTrusted || vscode.workspace.getWorkspaceFolder(uri) === undefined) return `${other.file} is not in a trusted folder of this workspace, so neither file is changed.`;
    const planned = diagram.related?.texts?.[other.file]?.text;
    let document: vscode.TextDocument;
    try {
      document = await vscode.workspace.openTextDocument(uri);
    } catch {
      return `${other.file} cannot be opened, so neither file is changed.`;
    }
    if (planned === undefined || document.getText() !== planned) return `${other.file} changed meanwhile, so neither file is changed. Try again.`;
    for (const splice of spliceRanges(document.getText(), other.splices)) {
      edit.replace(uri, new vscode.Range(splice.start.line, splice.start.character, splice.end.line, splice.end.character), splice.text, metadata);
    }
    return undefined;
  }

  // The documents of each tool type that reads other files, by its origin.
  private readonly toolFiles = new Map<string, ToolFiles>();

  /** The documents of a tool type in the workspace, found once and followed. */
  private filesOf(type: AnyToolType): ToolFiles {
    let files = this.toolFiles.get(type.origin);
    if (!files) {
      files = new ToolFiles((fileName, text) => type.claimed(fileName, text), type.claims.flatMap((claim) => claim.extensions), () => {
        for (const other of this.open) if (other.type === type) void this.findPeers(other);
      });
      this.toolFiles.set(type.origin, files);
    }
    return files;
  }

  /** The other documents of a diagram's tool type in the workspace, as it names them: found, and found again when they change. */
  async findPeers(diagram: OpenTool): Promise<void> {
    const type = diagram.type;
    if (!type.related) return;
    const found = await this.filesOf(type).files();
    const own = diagram.document.uri.toString();
    diagram.peers = found.filter((uri) => uri.toString() !== own).map((uri) => relativePath(diagram.document.uri.path, uri.path));
    if (this.open.has(diagram)) this.refresh(diagram);
  }

  /**
   * Files or folders about to move (etalii.adp spec 080, FR-010, research R3): every document of a
   * tool type that names other files, and names one that moves or moves itself, has those names
   * rewritten in the same step as the move. Only a document in a trusted folder of the workspace is
   * written.
   */
  async retargetings(types: readonly AnyToolType[], files: readonly { readonly oldUri: vscode.Uri; readonly newUri: vscode.Uri }[]): Promise<vscode.WorkspaceEdit> {
    const edit = new vscode.WorkspaceEdit();
    if (!vscode.workspace.isTrusted) return edit;
    const moves = files.map((file) => ({ from: file.oldUri.path, to: file.newUri.path }));
    for (const type of types) {
      if (!type.retargeted) continue;
      // A rename is rare and must miss no document, so they are looked for again.
      for (const uri of await this.filesOf(type).files(true)) {
        if (vscode.workspace.getWorkspaceFolder(uri) === undefined) continue;
        const given = await textOf(uri);
        if (!given) continue;
        const splices = type.retargeted({ fileName: given.fileName, text: given.text }, movedName(uri.path, moves));
        for (const splice of spliceRanges(given.text, splices ?? [])) {
          edit.replace(uri, new vscode.Range(splice.start.line, splice.start.character, splice.end.line, splice.end.character), splice.text);
        }
      }
    }
    return edit;
  }

  /** How the lookup and the backlinks are picked from: Visual Studio Code's quick pick, which a test answers in its place. */
  quickPick: <T extends vscode.QuickPickItem>(items: readonly T[], options: vscode.QuickPickOptions) => Thenable<T | undefined> = (items, options) => vscode.window.showQuickPick(items, options);

  /**
   * Opens a document of the workspace a link leads to (FBL 17.5), by its path in the index: in the tool its type
   * names, brought to the front where an editor of it is open, with the element selected; a document no tool
   * of this plug-in claims, in Visual Studio Code's own editor.
   */
  private async openLinked(path: string, select: string | undefined): Promise<Performed> {
    const folder = vscode.workspace.workspaceFolders?.find((candidate) => path.startsWith(`${candidate.uri.path}/`));
    const target = folder ? folder.uri.with({ path }) : vscode.Uri.file(path);
    const shown = this.editorOn(target);
    if (shown) {
      shown.panel.reveal();
      if (select !== undefined) shown.post({ v: 2, type: 'reveal', id: select });
      return { result: 'applied' };
    }
    const type = this.links?.typeOf(path);
    try {
      await vscode.workspace.fs.stat(target);
    } catch {
      return { result: 'refused', sentence: `${target.fsPath} is not there, so it is not opened.` };
    }
    if (type === undefined) {
      await vscode.commands.executeCommand('vscode.open', target);
      return { result: 'applied' };
    }
    if (select !== undefined) this.selecting.set(target.toString(), select);
    await vscode.commands.executeCommand('vscode.openWith', target, viewTypeOf(type));
    return { result: 'applied' };
  }

  /** How an operation's form asks a value: Visual Studio Code's input box, which a test answers in its place. */
  inputBox: (options: vscode.InputBoxOptions) => Thenable<string | undefined> = (options) => vscode.window.showInputBox(options);

  /** The row each document opened by a link selects once its page is ready, by the document's address. */
  readonly selecting = new Map<string, string>();

  private async carryOut(diagram: OpenTool, request: EditRequest | TableRequest | HierarchyRequest | SectionsRequest, version: number | undefined, seq: number | undefined): Promise<Performed> {
    if (version !== undefined && version !== diagram.document.version) return { result: 'cancelled' };

    let confirmed = false;
    let outcome = diagram.type.edit(diagram.source, request, diagram.options, confirmed);
    // A file that cannot be written takes no edit, which the tool type does not know. What changes
    // only this viewer's state, such as a fold, is still its to do.
    if (diagram.readOnly && outcome.kind !== 'export' && outcome.kind !== 'openLinked' && outcome.kind !== 'backlinks' && !(outcome.kind === 'applied' && outcome.viewOptions !== undefined && outcome.splices.length === 0 && outcome.registration === undefined)) {
      return { result: 'cancelled' };
    }
    if (outcome.kind === 'confirm') {
      if (!(await this.ask(diagram, outcome, seq))) return { result: 'cancelled' };
      // The document may have changed while the question was open: the answer was to that question.
      if (version !== undefined && version !== diagram.document.version) return { result: 'cancelled' };
      confirmed = true;
      outcome = diagram.type.edit(diagram.source, request, diagram.options, confirmed);
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
      case 'ask': {
        // The operation's form, one input box a value, each checked as it is typed against the form's own validation.
        if (request.kind !== 'action' && request.kind !== 'drop') return { result: 'cancelled' };
        const params: Record<string, string> = {};
        for (const [index, field] of outcome.fields.entries()) {
          const answer = await this.inputBox({
            title: outcome.fields.length > 1 ? `${outcome.title} (${index + 1}/${outcome.fields.length})` : outcome.title,
            prompt: field.label, value: field.initial, valueSelection: [0, field.initial.length],
            validateInput: (value) => {
              const checked = diagram.type.edit(diagram.source, { ...request, params: { ...params, [field.param]: value }, check: true }, diagram.options, false);
              return checked.kind === 'refused' ? checked.sentence : undefined;
            },
          });
          if (answer === undefined) return { result: 'cancelled' };
          params[field.param] = answer;
        }
        if (version !== undefined && version !== diagram.document.version) return { result: 'cancelled' };
        return this.perform(diagram, { ...request, params });
      }
      case 'lookup': {
        // The workspace's elements, searched by name as the user types (DISL 9.4): picked, the operation runs again with the pick, as one undo step.
        if (request.kind !== 'action') return { result: 'cancelled' };
        const links = diagram.source.links;
        if (links === undefined) return { result: 'cancelled' };
        const origins = outcome.origins;
        const items = lookupItems(links, (path) => origins === undefined || origins.includes(this.links?.originOf(path) ?? ''));
        const picked = await this.quickPick(items.map((item) => ({ label: item.pick.name || '(unnamed)', description: item.document, detail: item.folder, item })), { title: 'Add from another document', placeHolder: 'Type to search the elements of the workspace by name', matchOnDescription: true });
        if (picked === undefined) return { result: 'cancelled' };
        if (version !== undefined && version !== diagram.document.version) return { result: 'cancelled' };
        return this.perform(diagram, { ...request, picked: picked.item.pick });
      }
      case 'openLinked':
        return this.openLinked(outcome.path, outcome.select);
      case 'backlinks': {
        // Linked from (N): each link by its document and the element that holds it; the one picked is opened with that element selected (FBL 17.5).
        const picked = await this.quickPick(outcome.backlinks.map((backlink) => ({ label: backlink.name, description: backlink.document, backlink })), { title: 'Linked from', placeHolder: 'Open the element that links here' });
        return picked === undefined ? { result: 'cancelled' } : this.openLinked(picked.backlink.path, picked.backlink.holder);
      }
      case 'export':
        // An export changes nothing of the document: the extension writes it beside the document, as the editor holds it.
        await writeExport({ type: diagram.type, uri: diagram.document.uri, source: diagram.source, options: diagram.options }, outcome.export);
        return { result: 'applied' };
      case 'pickPath': {
        // The user picks a file or a folder, and the answer is an edit like any other: one undo step.
        const picked = await pickLink(diagram.document.uri);
        if (picked === undefined) return { result: 'cancelled' };
        if ('refused' in picked) return { result: 'refused', sentence: picked.refused };
        return this.perform(diagram, { kind: 'setField', id: outcome.id, field: outcome.field, value: picked.value });
      }
      case 'open': {
        if (outcome.select !== undefined) return this.follow(diagram, outcome.path, outcome.select);
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
        // A change of the registration alone is made again in its turn among the registration's
        // writes, from its text as the write before left it: two such requests made at once, such as
        // the folds a reveal opens, each keep what the other wrote.
        if (outcome.splices.length === 0 && outcome.registration !== undefined) return this.registrationOnly(diagram, request, confirmed);
        // Every splice of the gesture goes into one edit, so one gesture is one undo step. The
        // ranges are all of the text as it is before the edit (etalii.adp spec 027, research R5).
        const edit = new vscode.WorkspaceEdit();
        const documentChanges = outcome.splices.length > 0 || (outcome.others ?? []).some((other) => other.splices.length > 0);
        // The request changed what this editor shows: the options it gives are taken over.
        if (outcome.viewOptions !== undefined) diagram.options = { ...diagram.options, ...outcome.viewOptions };
        const registrationBefore = diagram.registration;
        const label = labelOf(diagram, request);
        const metadata = label === undefined ? undefined : { label, needsConfirmation: false };
        for (const splice of spliceRanges(diagram.document.getText(), outcome.splices)) {
          const range = new vscode.Range(splice.start.line, splice.start.character, splice.end.line, splice.end.character);
          edit.replace(diagram.document.uri, range, splice.text, metadata);
        }
        // A step that writes two files (etalii.adp spec 080, research R2): the other file's splices go into
        // the same edit, so both are written or neither is, and one undo takes both back.
        for (const other of outcome.others ?? []) {
          const refusal = await this.otherSplices(diagram, other, edit, metadata);
          if (refusal !== undefined) return { result: 'refused', sentence: refusal };
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
        } else if (outcome.viewOptions !== undefined) {
          // Nothing was written, so no change of the document brings the view: it is sent now.
          this.refresh(diagram);
        }
        if (outcome.select !== undefined) {
          diagram.post({ v: 2, type: 'reveal', id: outcome.select, ...(outcome.editLabel ? { editLabel: true, multiline: outcome.multiline === true } : {}) });
        } else if (outcome.show !== undefined) {
          diagram.post({ v: 2, type: 'reveal', id: outcome.show, keepSelection: true });
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
    // A registration that opens a folder subject (FBL 10) draws the files of its folder, read-only.
    const folder = /\.adp$/i.test(document.uri.path) ? await folderTexts(this.type, document.uri) : undefined;
    // A file of the type's extension that its binding's marker does not match is not this tool's.
    if (folder === undefined && !this.type.claimed(document.fileName, document.getText())) {
      handBack(document.uri, viewTypeOf(this.type), panel);
      return;
    }
    const diagram = new OpenTool(this.type, document, panel);
    if (this.type.indexed !== undefined) diagram.links = this.tools.links;
    if (this.type.related) diagram.related = new RelatedFiles(document.uri, () => this.tools.refresh(diagram));
    diagram.selectOnReady = this.tools.selecting.get(document.uri.toString());
    this.tools.selecting.delete(document.uri.toString());
    diagram.folder = folder;
    diagram.readOnly = folder !== undefined || await isReadOnly(document);
    diagram.registration = await readText(diagram.registrationUri);
    panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')] };
    // A diagram is drawn on the canvas, a designer on its table, its page of boxes or its page of sections.
    panel.webview.html = webviewHtml(panel.webview, this.context.extensionUri, this.type.page, this.type.displayName);
    this.tools.add(diagram);
    void this.tools.findPeers(diagram);

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
      diagram.related?.dispose();
      this.tools.remove(diagram);
    });
  }

  private async receive(diagram: OpenTool, message: FromCanvas): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.tools.refresh(diagram);
        if (diagram.selectOnReady !== undefined) diagram.post({ v: 2, type: 'reveal', id: diagram.selectOnReady });
        diagram.selectOnReady = undefined;
        return;
      case 'viewOptions':
        this.tools.setOptions(diagram, message.options);
        return;
      case 'selection':
        diagram.selection = message.ids;
        this.tools.refresh(diagram);
        return;
      case 'editing':
        void vscode.commands.executeCommand('setContext', 'etalii.adp.editingText', message.active);
        return;
      case 'edit': {
        // The request is the tool type's own; its `edit` refuses one it does not know.
        const performed = await this.tools.perform(diagram, message.request as EditRequest | TableRequest | HierarchyRequest | SectionsRequest, message.version, message.seq);
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
