import * as vscode from 'vscode';
import type { RelatedFile } from '../core/frame/toolType';

// The files a document names that its tool type reads as well (etalii.adp spec 080, FR-004,
// research R1): a relation's target, read for its rows' titles. The core is given their text and
// reads them itself; this gathers the text, from the editor that has a file open with unsaved
// changes, or else from disk, and says when one changes, so that what the document shows follows.

/** Where a file a document names lies: read against the document's folder. */
export const relatedUri = (document: vscode.Uri, path: string): vscode.Uri => vscode.Uri.joinPath(document, '..', path);

/** The text of one file a document names, or null when it cannot be read. */
export async function textOf(uri: vscode.Uri): Promise<RelatedFile | null> {
  // An editor's unsaved changes are what the file holds for now; without any, the file on disk is, which may have gone.
  const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
  if (open?.isDirty) return { fileName: open.fileName, text: open.getText() };
  try {
    return { fileName: uri.fsPath, text: new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)) };
  } catch {
    return null;
  }
}

/**
 * The files one open document names, as it names them, with their text: gathered again when the
 * names change, and followed in an open editor and on disk until the document is closed.
 */
export class RelatedFiles implements vscode.Disposable {
  /** What the core is given: each file by the name the document gives it; undefined until they are first read. */
  texts: Readonly<Record<string, RelatedFile | null>> | undefined;
  private names: readonly string[] = [];
  private watchers: vscode.Disposable[] = [];
  private gathering = 0;

  /** `changed` is called whenever a file's text is new. */
  constructor(private readonly document: vscode.Uri, private readonly changed: () => void) {}

  /** Whether the document's own changes named other files: they are gathered, and `changed` follows. */
  follow(names: readonly string[]): void {
    if (names.length === this.names.length && names.every((name, index) => name === this.names[index])) return;
    this.names = [...names];
    this.watch();
    void this.gather();
  }

  /** A text document changed: when it is one of the files, its new text is taken. Says whether it was. */
  documentChanged(document: vscode.TextDocument): boolean {
    const name = this.nameOf(document.uri);
    if (name === undefined) return false;
    this.texts = { ...this.texts, [name]: { fileName: document.fileName, text: document.getText() } };
    this.changed();
    return true;
  }

  dispose(): void {
    for (const watcher of this.watchers) watcher.dispose();
    this.watchers = [];
  }

  private nameOf(uri: vscode.Uri): string | undefined {
    return this.names.find((name) => relatedUri(this.document, name).toString() === uri.toString());
  }

  /** Each file read once more; a later gathering wins over an earlier one still under way. */
  private async gather(): Promise<void> {
    const turn = ++this.gathering;
    const names = this.names;
    const texts = await Promise.all(names.map((name) => textOf(relatedUri(this.document, name))));
    if (turn !== this.gathering) return;
    this.texts = Object.fromEntries(names.map((name, index) => [name, texts[index]]));
    this.changed();
  }

  /** A watcher per file on disk: one that is created, changed or deleted there is read again, unless an editor has it open. */
  private watch(): void {
    this.dispose();
    for (const name of this.names) {
      const uri = relatedUri(this.document, name);
      const folder = vscode.Uri.joinPath(uri, '..');
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, uri.path.slice(uri.path.lastIndexOf('/') + 1)));
      const reread = (): void => {
        if (vscode.workspace.textDocuments.some((document) => document.uri.toString() === uri.toString() && document.isDirty)) return;
        void textOf(uri).then((text) => {
          if (!this.names.includes(name)) return;
          this.texts = { ...this.texts, [name]: text };
          this.changed();
        });
      };
      this.watchers.push(watcher, watcher.onDidChange(reread), watcher.onDidCreate(reread), watcher.onDidDelete(reread));
    }
  }
}

/** The largest file read to see whether it is a document of a tool type: anything larger is not offered as one. */
const LARGEST = 5_000_000;

/**
 * The documents of one tool type in the workspace (etalii.adp spec 080, FR-006, research R3): the
 * files of its extensions that it claims, found once and found again when a file of those
 * extensions is created or deleted. `changed` is called then.
 */
export class ToolFiles implements vscode.Disposable {
  private found: Promise<vscode.Uri[]> | undefined;
  private readonly glob: string;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly claimed: (fileName: string, text: string) => boolean, extensions: readonly string[], changed: () => void) {
    this.glob = `**/*.{${[...new Set(extensions)].join(',')}}`;
    const watcher = vscode.workspace.createFileSystemWatcher(this.glob, false, true, false);
    const again = (): void => {
      this.found = undefined;
      changed();
    };
    this.subscriptions.push(watcher, watcher.onDidCreate(again), watcher.onDidDelete(again));
  }

  /** The documents, by their address: found again when `fresh`, so that a file made a moment ago is among them. */
  files(fresh = false): Promise<vscode.Uri[]> {
    if (fresh) this.found = undefined;
    this.found ??= this.find();
    return this.found;
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  private async find(): Promise<vscode.Uri[]> {
    const candidates = await vscode.workspace.findFiles(this.glob, '**/node_modules/**', 2000);
    const claimed = await Promise.all(candidates.map(async (uri) => {
      try {
        const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
        if (open) return this.claimed(open.fileName, open.getText()) ? uri : undefined;
        if ((await vscode.workspace.fs.stat(uri)).size > LARGEST) return undefined;
        return this.claimed(uri.fsPath, new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))) ? uri : undefined;
      } catch {
        return undefined;
      }
    }));
    return claimed.filter((uri): uri is vscode.Uri => uri !== undefined).sort((a, b) => a.path.localeCompare(b.path));
  }
}
