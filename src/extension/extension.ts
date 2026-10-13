import * as vscode from 'vscode';
import { viewTypeOf } from '../core/frame/toolType';
import * as fbl from '../core/fbl';
import { registerCommands } from './commands';
import { Findings } from './findings';
import { claimantOf } from './opening';
import { PropertiesView } from './propertiesView';
import { RegistrationEditorProvider } from './registrationEditor';
import { watchReopening } from './reopening';
import { watchSuggestions } from './suggestions';
import { ToolboxView } from './toolboxView';
import { ToolEditorProvider, Tools } from './toolEditor';
import { toolTypesAt } from './toolTypes';

/** What activation hands back, so tests can see what was registered. */
export interface AdpApi {
  readonly viewTypes: readonly string[];
  /** The plug-in's FBL implementation (etalii.adp spec 009). */
  readonly fbl: typeof import('../core/fbl');
}

export function activate(context: vscode.ExtensionContext): AdpApi {
  // The tool types are the definitions the package ships, read once, now.
  const types = toolTypesAt(context.extensionPath);
  const findings = new Findings();
  const tools = new Tools(findings);
  context.subscriptions.push(findings, tools);

  for (const type of types) {
    context.subscriptions.push(ToolEditorProvider.register(context, type, tools));
  }
  context.subscriptions.push(ToolboxView.register(context, tools), PropertiesView.register(context, tools), RegistrationEditorProvider.register(types));
  watchSuggestions(context, types);
  watchReopening(context, types);

  // A registration is only a document's visualization: it is saved with its document, and a
  // change of it on disk is followed by the diagram it belongs to.
  const registrations = vscode.workspace.createFileSystemWatcher('**/*.adp');
  const follow = (uri: vscode.Uri): void => void tools.refreshRegistration(uri);
  context.subscriptions.push(
    registrations, registrations.onDidChange(follow), registrations.onDidCreate(follow), registrations.onDidDelete(follow),
    vscode.workspace.onDidSaveTextDocument((document) => void tools.saved(document)),
  );
  registerCommands(context, tools, types);

  // Findings follow the text, whoever changed it and whichever editor shows it. They are those of
  // the type that claims the file: a file that is a tool's only by choice, such as Markdown, has
  // none until it is opened in that tool, and a file no type claims has none at all.
  const show = (document: vscode.TextDocument): void => {
    const type = claimantOf(types, document.fileName, document.getText());
    if (type) findings.show(document, type);
  };
  vscode.workspace.textDocuments.forEach(show);
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(show),
    vscode.workspace.onDidChangeTextDocument((event) => {
      show(event.document);
      tools.documentChanged(event);
      tools.refreshDocument(event.document);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => findings.clear(document.uri)),
  );

  return { viewTypes: types.map(viewTypeOf), fbl };
}

export function deactivate(): void {
  // Nothing to release: every registration is disposed with the extension context.
}