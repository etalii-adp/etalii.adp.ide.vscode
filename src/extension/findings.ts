import * as vscode from 'vscode';
import type { Finding, Severity, Source } from '../core/frame/toolType';
import type { AnyToolType } from './toolTypes';

const severities: Record<Severity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

/**
 * Findings in the Problems panel: one collection, "ADP", set per document from its tool type's
 * findings, with the rule id as the code and the entry's line as the range.
 */
export class Findings implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('ADP');

  /**
   * `more` holds the text of the files the document names, where an editor of it has read them, and the
   * workspace's index its links are resolved against (FBL 17.3), where it takes part in links.
   */
  show(document: vscode.TextDocument, type: AnyToolType, more: Pick<Source, 'related' | 'links' | 'linkPath'> = {}): void {
    const source: Source = { fileName: document.fileName, text: document.getText(), ...more };
    this.collection.set(document.uri, type.findings(source).map((finding) => this.diagnostic(document, finding)));
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }

  private diagnostic(document: vscode.TextDocument, finding: Finding): vscode.Diagnostic {
    const line = Math.min(Math.max(finding.line, 0), Math.max(0, document.lineCount - 1));
    const diagnostic = new vscode.Diagnostic(document.lineAt(line).range, finding.message, severities[finding.severity]);
    diagnostic.source = 'ADP';
    diagnostic.code = finding.rule;
    return diagnostic;
  }
}