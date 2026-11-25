import * as vscode from 'vscode';
import { LinkWorkspace } from '../core/fbl/links/workspace';
import type { Source } from '../core/frame/toolType';
import type { AnyToolType } from './toolTypes';

/** A file larger than this is no document the index reads: what a tool type's files are is far smaller. */
const LARGEST = 5_000_000;

/** What a document of a workspace folder is given to resolve its links by (FBL 17.3): the folder's index and its own path in it. */
export type LinkSource = Pick<Source, 'links' | 'linkPath'>;

/**
 * The index of the documents of each workspace folder whose tool type takes part in links (FBL 17.3; etalii.adp
 * spec 089): read when the plug-in starts, and kept by following the files of those tool types as they are
 * created, changed, deleted and edited. A document is indexed by its address's path, with forward slashes on
 * every platform, and a folder's index is a new value whenever it changes, so that what was read of it before is
 * not taken for what it is now.
 */
export class LinkIndex implements vscode.Disposable {
  private readonly folders = new Map<string, LinkWorkspace>();
  /** The tool type of each indexed document, by its path: what a lookup's `origins` narrows by. */
  private readonly origins = new Map<string, string>();
  /** Every file of the glob this index has read, a tool type's or not: what catching up leaves alone. */
  private readonly read = new Set<string>();
  private catching: Promise<void> | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly types: readonly AnyToolType[];
  private readonly glob: string | undefined;
  /** Fires when an index changes. */
  readonly onDidChange = this.changed.event;
  /** Settles once every folder was read. */
  readonly ready: Promise<void>;

  constructor(types: readonly AnyToolType[]) {
    this.types = types.filter((type) => type.indexed !== undefined);
    const extensions = [...new Set(this.types.flatMap((type) => type.claims.flatMap((claim) => claim.extensions)))];
    this.glob = extensions.length === 0 ? undefined : `**/*.{${extensions.join(',')}}`;
    if (this.glob !== undefined) {
      const watcher = vscode.workspace.createFileSystemWatcher(this.glob);
      const read = (uri: vscode.Uri): void => void this.readFile(uri);
      this.subscriptions.push(
        // A deletion is read too: its event can come after the file was written again, and only what is there is taken out.
        watcher, watcher.onDidCreate(read), watcher.onDidChange(read), watcher.onDidDelete((uri) => void this.deleted(uri)),
        // What an editor holds is what the document is, saved or not.
        vscode.workspace.onDidChangeTextDocument((event) => { if (event.contentChanges.length > 0) this.put(event.document.uri, event.document.getText()); }),
        vscode.workspace.onDidChangeWorkspaceFolders(() => void this.readAll()),
      );
    }
    this.ready = this.readAll();
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
    this.changed.dispose();
  }

  /** What a document is given to resolve its links by: none for one outside every folder of the workspace. */
  sourceOf(uri: vscode.Uri): LinkSource {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const links = folder === undefined ? undefined : this.folders.get(folder.uri.toString());
    return links === undefined ? {} : { links, linkPath: uri.path };
  }

  /** The origin of the tool type of the indexed document at `path`. */
  originOf(path: string): string | undefined {
    return this.origins.get(path);
  }

  /** The tool type of the indexed document at `path`. */
  typeOf(path: string): AnyToolType | undefined {
    const origin = this.origins.get(path);
    return origin === undefined ? undefined : this.types.find((type) => type.origin === origin);
  }

  /**
   * Reads the files of the workspace this index has not read yet. A file watcher can miss a file created in a folder
   * made a moment before (inotify sets its watch on the folder after the file is there), so an editor of a tool type
   * that takes part in links asks for this when it opens: a document it links to is then found however it came.
   */
  catchUp(): Promise<void> {
    if (this.glob === undefined) return Promise.resolve();
    this.catching ??= (async () => {
      try {
        const found = await vscode.workspace.findFiles(this.glob!, '**/node_modules/**', 5000);
        const missed = found.filter((uri) => !this.read.has(uri.toString()));
        await Promise.all(missed.map((uri) => this.readFile(uri, false)));
        if (missed.length > 0) this.changed.fire();
      } finally {
        this.catching = undefined;
      }
    })();
    return this.catching;
  }

  private async readAll(): Promise<void> {
    this.folders.clear();
    this.origins.clear();
    this.read.clear();
    for (const folder of vscode.workspace.workspaceFolders ?? []) this.folders.set(folder.uri.toString(), new LinkWorkspace(folder.uri.path));
    if (this.glob === undefined) return;
    const found = await vscode.workspace.findFiles(this.glob, '**/node_modules/**', 5000);
    await Promise.all(found.map((uri) => this.readFile(uri, false)));
    this.changed.fire();
  }

  /** A file reported deleted is taken out, unless it is there again by now. */
  private async deleted(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      this.read.delete(uri.toString());
      return this.remove(uri);
    }
    return this.readFile(uri);
  }

  private async readFile(uri: vscode.Uri, announce = true): Promise<void> {
    this.read.add(uri.toString());
    const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
    if (open) return this.put(uri, open.getText(), announce);
    try {
      if ((await vscode.workspace.fs.stat(uri)).size > LARGEST) return this.remove(uri, announce);
      this.put(uri, new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)), announce);
    } catch {
      this.remove(uri, announce);
    }
  }

  /** Reads one document into its folder's index, or takes it out when no tool type that takes part in links claims it. */
  private put(uri: vscode.Uri, text: string, announce = true): void {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const links = folder === undefined ? undefined : this.folders.get(folder.uri.toString());
    if (folder === undefined || links === undefined) return;
    const type = this.types.find((candidate) => candidate.claimed(uri.fsPath, text));
    const indexed = type?.indexed?.({ fileName: uri.fsPath, text, linkPath: uri.path });
    if (!type || !indexed) return this.remove(uri, announce);
    this.origins.set(uri.path, type.origin);
    this.folders.set(folder.uri.toString(), new LinkWorkspace(links.root, [...links.documents.filter((document) => document.path !== uri.path), indexed]));
    if (announce) this.changed.fire();
  }

  private remove(uri: vscode.Uri, announce = true): void {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const links = folder === undefined ? undefined : this.folders.get(folder.uri.toString());
    if (folder === undefined || links?.document(uri.path) === undefined) return;
    this.origins.delete(uri.path);
    this.folders.set(folder.uri.toString(), new LinkWorkspace(links.root, links.documents.filter((document) => document.path !== uri.path)));
    if (announce) this.changed.fire();
  }
}
