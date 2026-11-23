import * as vscode from 'vscode';
import type { Source, ViewOptions } from '../core/frame/toolType';
import { claimantOf } from './opening';
import type { AnyToolType } from './toolTypes';

// What a tool type exports of a document, written beside it (etalii.adp spec 082, research R5 and R6):
// the file is written, opened with the user's program for it, and named in a notification that can
// reveal it. Nothing of the document changes, so an export is no edit and no undo step.

/** Why a document that was never saved has no export: the file is written beside it. */
export const UNSAVED = 'Save the diagram first: the page is written beside its file.';

/** The command an export is reached by, from every place that offers it. */
export const exportCommand = (id: string): string => `etalii.adp.export.${id}`;
/** The context key that holds the extensions of the files whose tool type offers an export, with their dots. */
export const exportContext = (id: string): string => `etalii.adp.exports.${id}`;

/** A document to export, as the editor holds it where one is open on it. */
export interface Exporting {
  readonly type: AnyToolType;
  readonly uri: vscode.Uri;
  readonly source: Source;
  readonly options: ViewOptions;
}

/** The last file an export wrote, and whether it was opened; read by the tests. */
export const lastExport: { uri?: vscode.Uri; opened?: boolean } = {};

async function textOf(uri: vscode.Uri): Promise<string | undefined> {
  const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
  if (open) return open.getText();
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

/** The registration beside a document: the file of the same name with the extension `.adp`. */
function registrationOf(uri: vscode.Uri): vscode.Uri {
  const dot = uri.path.lastIndexOf('.');
  const slash = uri.path.lastIndexOf('/');
  return uri.with({ path: `${dot > slash ? uri.path.slice(0, dot) : uri.path}.adp` });
}

/** A file no editor of a tool holds: its text as open in a text editor, else as saved, and its registration likewise; its tool type is the one that claims it. */
export async function exportingOf(uri: vscode.Uri, types: readonly AnyToolType[]): Promise<Exporting | undefined> {
  const text = await textOf(uri);
  if (text === undefined) return undefined;
  const type = claimantOf(types, uri.path, text);
  if (!type) return undefined;
  const registration = await textOf(registrationOf(uri));
  return { type, uri, source: { fileName: uri.scheme === 'file' ? uri.fsPath : uri.path, text, ...(registration === undefined ? {} : { registration }) }, options: {} };
}

/** Writes the named export of a document beside it, opens it and says where; or says why not. */
export async function writeExport(exporting: Exporting, id: string): Promise<void> {
  const { type, uri } = exporting;
  if (uri.scheme === 'untitled') {
    void vscode.window.showWarningMessage(UNSAVED);
    return;
  }
  const written = type.exported?.(exporting.source, id, exporting.options, new Date());
  if (!written) return;
  const target = vscode.Uri.joinPath(uri, '..', written.name);
  try {
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(written.text));
  } catch (error) {
    void vscode.window.showErrorMessage(`${written.name} could not be written beside ${uri.path.slice(uri.path.lastIndexOf('/') + 1)}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  // Under test the file is not handed to a browser.
  const opened = process.env.ADP_TEST ? false : await vscode.env.openExternal(target).then((done) => done, () => false);
  lastExport.uri = target;
  lastExport.opened = opened;
  const reveal = 'Reveal in Explorer';
  const said = opened ? `Wrote ${written.name} beside the diagram and opened it.` : `Wrote ${written.name} beside the diagram.`;
  void vscode.window.showInformationMessage(said, reveal).then((choice) => {
    if (choice === reveal) void vscode.commands.executeCommand('revealInExplorer', target);
  });
}
