import * as vscode from 'vscode';
import type { DiagramType } from '../core/frame/diagramType';
import { viewTypeOf } from '../core/frame/diagramType';
import { registerCommands } from './commands';
import { DiagramEditorProvider, Diagrams } from './diagramEditor';
import { diagramTypes } from './diagramTypes';
import { Findings } from './findings';
import { PropertiesView } from './propertiesView';

/** What activation hands back, so tests can see what was registered. */
export interface AdpApi {
  readonly viewTypes: readonly string[];
}

// The type whose own extension a document has; a shared extension, such as Markdown, names none,
// because such a file is a diagram only when the user opens it as one.
function typeOwning(document: vscode.TextDocument): DiagramType | undefined {
  const path = document.uri.path.toLowerCase();
  return diagramTypes.find((type) => !type.shared && type.extensions.some((extension) => path.endsWith(`.${extension}`)));
}

export function activate(context: vscode.ExtensionContext): AdpApi {
  const findings = new Findings();
  const diagrams = new Diagrams(findings);
  context.subscriptions.push(findings, diagrams);

  for (const type of diagramTypes) {
    context.subscriptions.push(DiagramEditorProvider.register(context, type, diagrams));
  }
  context.subscriptions.push(PropertiesView.register(context, diagrams));
  registerCommands(context, diagrams, diagramTypes);

  // Findings follow the text, whoever changed it and whichever editor shows it.
  const show = (document: vscode.TextDocument): void => {
    const type = typeOwning(document);
    if (type) findings.show(document, type);
  };
  vscode.workspace.textDocuments.forEach(show);
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(show),
    vscode.workspace.onDidChangeTextDocument((event) => {
      show(event.document);
      diagrams.refreshDocument(event.document);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => findings.clear(document.uri)),
  );

  return { viewTypes: diagramTypes.map(viewTypeOf) };
}

export function deactivate(): void {
  // Nothing to release: every registration is disposed with the extension context.
}