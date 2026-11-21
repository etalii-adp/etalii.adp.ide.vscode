import * as vscode from 'vscode';
import type { RelatedFile } from '../core/frame/toolType';

// The files a document names that its tool type reads as well (etalii.adp spec 080, FR-004,
// research R1): a relation's target, read for its rows' titles. The core is given their text and
// reads them itself; this gathers the text, from the editor that has a file open, unsaved changes
// and all, or else from disk, and says when one changes, so that what the document shows follows.

/** Where a file a document names lies: read against the document's folder. */
export const relatedUri = (document: vscode.Uri, path: string): vscode.Uri => vscode.Uri.joinPath(document, '..', path);

/** The text of one file a document names, or null when it cannot be read. */
async function textOf(uri: vscode.Uri): Promise<RelatedFile | null> {
  const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
  if (open) return { fileName: open.fileName, text: open.getText() };
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
