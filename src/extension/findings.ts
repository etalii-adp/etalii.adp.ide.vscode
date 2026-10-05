import * as vscode from 'vscode';
import type { DiagramType, Finding, Severity } from '../core/frame/diagramType';

const severities: Record<Severity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

/**
 * Findings in the Problems panel: one collection, "ADP", set per document from its diagram type's
 * findings, with the rule id as the code and the entry's line as the range.
 */
export class Findings implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('ADP');

  show(document: vscode.TextDocument, type: DiagramType): void {
    this.collection.set(document.uri, type.findings({ text: document.getText() }).map((finding) => this.diagnostic(document, finding)));
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