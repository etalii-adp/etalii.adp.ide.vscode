import * as vscode from 'vscode';
import type { DiagramType } from '../core/frame/diagramType';

const maximumFiles = 2000;
const maximumBytes = 512 * 1024;

/**
 * Keeps the context key `etalii.adp.suggested` up to date: the files of a shared extension that
 * look like one of this plug-in's diagram types, by path. The Explorer's context menu offers
 * "Open as ..." for exactly those files, so a Markdown file without a Behavior heading is not
 * offered as a behavior model, while every Markdown file can still be opened as one through
 * "Open With" and the Command Palette.
 */
export function watchSuggestions(context: vscode.ExtensionContext, types: readonly DiagramType[]): void {
  const shared = types.filter((type) => type.shared);
  if (shared.length === 0) return;
  const extensions = [...new Set(shared.flatMap((type) => type.extensions))];
  const pattern = extensions.length === 1 ? `**/*.${extensions[0]}` : `**/*.{${extensions.join(',')}}`;
  const suggested = new Map<string, boolean>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const publish = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      const paths = Object.fromEntries([...suggested].filter(([, looks]) => looks).map(([path]) => [path, true]));
      void vscode.commands.executeCommand('setContext', 'etalii.adp.suggested', paths);
    }, 50);
  };

  const looksLikeOne = (text: string): boolean => shared.some((type) => type.suggests(text));

  const check = async (uri: vscode.Uri): Promise<void> => {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      const text = stat.size > maximumBytes ? '' : new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
      suggested.set(uri.fsPath, looksLikeOne(text));
    } catch {
      suggested.delete(uri.fsPath);
    }
    publish();
  };

  void vscode.workspace.findFiles(pattern, '**/node_modules/**', maximumFiles).then((files) => Promise.all(files.map(check)));

  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(check),
    watcher.onDidChange(check),
    watcher.onDidDelete((uri) => {
      suggested.delete(uri.fsPath);
      publish();
    }),
    // What is being typed counts before it is saved.
    vscode.workspace.onDidChangeTextDocument((event) => {
      const path = event.document.uri.path.toLowerCase();
      if (!extensions.some((extension) => path.endsWith(`.${extension}`))) return;
      suggested.set(event.document.uri.fsPath, looksLikeOne(event.document.getText()));
      publish();
    }),
  );
}
