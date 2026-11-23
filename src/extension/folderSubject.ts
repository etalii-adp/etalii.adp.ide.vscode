import * as vscode from 'vscode';
import type { AnyToolType } from './toolTypes';

// A folder subject (FBL 10), opened through the registration in it: the folder is listed, the tool
// type says which of its files it reads, and those are read. Read-only, and read once when opened:
// watching a folder and settling (FBL 10.3) is not built.

/** How many entries are listed at most, so that a registration in a large tree does not walk it all. */
const LIMIT = 5000;

/** Every entry under a folder, `/`-separated and relative to it, a folder's ending in `/`; links are not followed. */
async function entriesOf(folder: vscode.Uri): Promise<string[]> {
  const found: string[] = [];
  const walk = async (directory: vscode.Uri, prefix: string): Promise<void> => {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(directory);
    } catch {
      return;
    }
    for (const [name, kind] of entries) {
      if (found.length >= LIMIT || (kind & vscode.FileType.SymbolicLink) !== 0) continue;
      if (kind === vscode.FileType.Directory) {
        found.push(`${prefix}${name}/`);
        await walk(vscode.Uri.joinPath(directory, name), `${prefix}${name}/`);
      } else if (kind === vscode.FileType.File) {
        found.push(`${prefix}${name}`);
      }
    }
  };
  await walk(folder, '');
  return found;
}

/** The folder a registration stands in. */
export const folderOf = (registration: vscode.Uri): vscode.Uri => registration.with({ path: registration.path.slice(0, registration.path.lastIndexOf('/')) || '/' });

/**
 * The texts of the files a tool type reads of the folder a registration stands in, by their paths
 * relative to it, or undefined when the tool type reads no folder or does not recognise this one.
 */
export async function folderTexts(type: AnyToolType, registration: vscode.Uri): Promise<Record<string, string> | undefined> {
  if (!type.folderFiles) return undefined;
  const folder = folderOf(registration);
  const selected = type.folderFiles(await entriesOf(folder));
  if (selected.length === 0) return undefined;
  const texts: Record<string, string> = {};
  for (const path of selected) {
    const uri = vscode.Uri.joinPath(folder, ...path.split('/'));
    const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
    try {
      texts[path] = open ? open.getText() : new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    } catch {
      // A file that cannot be read is left out; the rest is read (FBL 10.2).
    }
  }
  return texts;
}
