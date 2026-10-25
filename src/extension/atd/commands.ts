// The commands of `.atd` tool descriptions (etalii.adp spec 035, T137, FR-060, FR-061, FR-063, research R22), all in
// the category "ADP" and all answered by the ADP tool language's server: *New Tool Description* writes the core's
// template, *Check Tool Description* puts the findings of every file of a description into the Problems panel, and
// *Validate Tool Description* replays the description's conformance cases, read here and handed to the server as
// content, and shows each difference at the construct that produced it. Each command takes its answers as an argument
// too, so a test runs it without the prompts.
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';

/** The three kinds of description (ATD §6). */
export const KINDS = ['diagram', 'designer', 'editor'] as const;
export type Kind = (typeof KINDS)[number];

/** `<vendor>/<type>`, the terminal `ORIGIN` of ATD §3. */
const ORIGIN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

export interface NewDescription {
  kind: Kind;
  origin: string;
  name: string;
  folder: vscode.Uri;
}

/** One finding of `atd/check`, `$defs/Finding`. */
interface Finding {
  code: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
}

interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

/** One difference of `atd/validate` (contracts/language-server.md). */
export interface Difference {
  step: number | null;
  part: string;
  expected: string;
  actual: string;
  at?: { uri: string; range: LspRange } | null;
}

export interface CaseResult {
  name: string;
  passed: boolean;
  differences: Difference[];
}

const severities: Record<Finding['severity'], vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

/** The `.atd` file a command acts on: the one it was given, else the active editor's. */
function descriptionFile(uri: unknown): vscode.Uri | undefined {
  const target = uri instanceof vscode.Uri ? uri : vscode.window.activeTextEditor?.document.uri;
  return target && target.fsPath.endsWith('.atd') ? target : undefined;
}

/** A finding's place, its 1-based lines and columns, as a range. */
function rangeOf(finding: Finding): vscode.Range {
  const start = new vscode.Position(Math.max(finding.line - 1, 0), Math.max(finding.column - 1, 0));
  const end = new vscode.Position(Math.max(finding.endLine - 1, 0), Math.max(finding.endColumn - 1, 0));
  return new vscode.Range(start, end.isBefore(start) ? start : end);
}

/** The step a difference belongs to, as the output channel and a diagnostic name it. */
const where = (difference: Difference): string => (difference.step === null ? 'read' : `step ${difference.step}`);

/** The folders `conformance/<type>/<case>/` beside the description whose fixture names it as its description. */
async function casesOf(root: vscode.Uri): Promise<{ name: string; folder: vscode.Uri }[]> {
  const conformance = vscode.Uri.joinPath(root, '..', 'conformance');
  const folders = async (folder: vscode.Uri): Promise<vscode.Uri[]> => {
    try {
      return (await vscode.workspace.fs.readDirectory(folder))
        .filter(([, type]) => type === vscode.FileType.Directory)
        .map(([name]) => vscode.Uri.joinPath(folder, name))
        .sort((a, b) => a.path.localeCompare(b.path));
    } catch {
      return [];
    }
  };
  const cases: { name: string; folder: vscode.Uri }[] = [];
  for (const type of await folders(conformance)) {
    for (const folder of await folders(type)) {
      let fixture: { description?: string };
      try {
        fixture = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, 'conformance.json'))));
      } catch {
        continue;
      }
      if (fixture.description && path.resolve(folder.fsPath, fixture.description) === path.resolve(root.fsPath)) {
        cases.push({ name: path.basename(folder.fsPath), folder });
      }
    }
  }
  return cases;
}

/** Every file of a case, in base64, by its name. */
async function filesOf(folder: vscode.Uri): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const [name, type] of await vscode.workspace.fs.readDirectory(folder)) {
    if (type === vscode.FileType.File) files[name] = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, name))).toString('base64');
  }
  return files;
}

/** Registers the three commands; each says so when the package carries no language server. */
export function registerAtdCommands(context: vscode.ExtensionContext, client: LanguageClient | undefined): void {
  const checked = vscode.languages.createDiagnosticCollection('atd-check');
  const validated = vscode.languages.createDiagnosticCollection('atd-validate');
  const output = vscode.window.createOutputChannel('ADP: Validate Tool Description');
  context.subscriptions.push(checked, validated, output);

  const server = async (): Promise<LanguageClient | undefined> => {
    if (!client) {
      void vscode.window.showErrorMessage('The ADP tool language server is not in this package, so tool descriptions cannot be created, checked or validated.');
      return undefined;
    }
    if (client.needsStart()) await client.start();
    return client;
  };

  const register = (command: string, run: (...args: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(command, run));
  };

  // New Tool Description: the kind, the origin and the name are asked, then the folder; the text is the server's
  // template, so it checks clean. Gives the file it wrote.
  register('etalii.adp.newToolDescription', async (given?: unknown): Promise<vscode.Uri | undefined> => {
    const answers = (given ?? {}) as Partial<NewDescription>;
    const kind = answers.kind ?? ((await vscode.window.showQuickPick([...KINDS], { title: 'New Tool Description', placeHolder: 'The kind of tool' })) as Kind | undefined);
    if (!kind) return undefined;
    const origin =
      answers.origin ??
      (await vscode.window.showInputBox({
        title: 'New Tool Description',
        prompt: 'The origin of the tool type, as <vendor>/<type>',
        placeHolder: 'acme/widgets',
        validateInput: (value) => (ORIGIN.test(value) ? undefined : 'An origin is <vendor>/<type>: letters, digits, _, . and -, each part starting with a letter, a digit or _.'),
      }));
    if (!origin) return undefined;
    const name = answers.name ?? (await vscode.window.showInputBox({ title: 'New Tool Description', prompt: 'The name the tool type is shown with', placeHolder: 'Widgets' }));
    if (!name) return undefined;
    const folder =
      answers.folder ??
      (await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Create Here', title: 'The folder of the new description' }))?.[0];
    if (!folder) return undefined;
    const lsp = await server();
    if (!lsp) return undefined;
    let text: string;
    try {
      ({ text } = await lsp.sendRequest<{ text: string }>('atd/newDescription', { kind, origin, name }));
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return undefined;
    }
    const file = vscode.Uri.joinPath(folder, `${origin.split('/')[1]}.atd`);
    try {
      await vscode.workspace.fs.stat(file);
      void vscode.window.showErrorMessage(`${file.fsPath} exists already; a new tool description is never written over a file.`);
      return undefined;
    } catch {
      // There is no such file: write it.
    }
    await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(text));
    await vscode.window.showTextDocument(file);
    return file;
  });

  // Check Tool Description: the findings of every file of the description, opened or not, into the Problems panel.
  register('etalii.adp.checkToolDescription', async (uri?: unknown): Promise<number | undefined> => {
    const file = descriptionFile(uri);
    if (!file) {
      void vscode.window.showInformationMessage('Open a tool description (.atd) to check it.');
      return undefined;
    }
    const lsp = await server();
    if (!lsp) return undefined;
    const answer = await lsp.sendRequest<{ findings: Finding[] }>('atd/check', { uri: file.toString() });
    checked.clear();
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const finding of answer.findings) {
      const target = path.isAbsolute(finding.file) ? finding.file : path.join(path.dirname(file.fsPath), finding.file);
      const diagnostic = new vscode.Diagnostic(rangeOf(finding), finding.message, severities[finding.severity] ?? vscode.DiagnosticSeverity.Error);
      diagnostic.code = finding.code;
      diagnostic.source = 'ADP: Check Tool Description';
      byFile.set(target, [...(byFile.get(target) ?? []), diagnostic]);
    }
    // What the server has published already is not shown twice.
    for (const [target, diagnostics] of byFile) {
      const uri = vscode.Uri.file(target);
      const shown = vscode.languages.getDiagnostics(uri).map((d) => `${String(typeof d.code === 'object' ? d.code.value : d.code)} ${d.range.start.line} ${d.message}`);
      const fresh = diagnostics.filter((d) => !shown.includes(`${String(d.code)} ${d.range.start.line} ${d.message}`));
      if (fresh.length) checked.set(uri, fresh);
    }
    const errors = answer.findings.filter((finding) => finding.severity === 'error').length;
    void vscode.window.showInformationMessage(
      answer.findings.length === 0 ? 'The tool description has no findings.' : `The tool description has ${answer.findings.length} finding(s), ${errors} of them error(s).`,
    );
    return answer.findings.length;
  });

  // Validate Tool Description: the conformance cases beside the description, read through the workspace's file
  // system and handed to the server as content; nothing of them is opened or written. Gives the cases' results.
  register('etalii.adp.validateToolDescription', async (uri?: unknown): Promise<CaseResult[] | undefined> => {
    const root = descriptionFile(uri);
    if (!root) {
      void vscode.window.showInformationMessage('Open the root file of a tool description (.atd) to validate it.');
      return undefined;
    }
    const found = await casesOf(root);
    if (found.length === 0) {
      void vscode.window.showInformationMessage(`${path.basename(root.fsPath)} has no conformance cases in conformance/<type>/<case>/ beside it.`);
      return undefined;
    }
    const lsp = await server();
    if (!lsp) return undefined;
    const cases = [];
    for (const { name, folder } of found) cases.push({ name, files: await filesOf(folder) });
    let result: { cases: CaseResult[] };
    try {
      result = await lsp.sendRequest<{ cases: CaseResult[] }>('atd/validate', { root: root.toString(), cases });
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return undefined;
    }
    validated.clear();
    output.clear();
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const outcome of result.cases) {
      output.appendLine(`${outcome.passed ? 'passed' : 'failed'}  ${outcome.name}`);
      for (const difference of outcome.differences) {
        const sentence = `case '${outcome.name}', ${where(difference)}, ${difference.part}: expected ${difference.expected}, got ${difference.actual}`;
        output.appendLine(`  ${where(difference)}, ${difference.part}`);
        output.appendLine(`    expected ${difference.expected}`);
        output.appendLine(`    got      ${difference.actual}`);
        if (!difference.at) continue;
        const { start, end } = difference.at.range;
        const diagnostic = new vscode.Diagnostic(new vscode.Range(start.line, start.character, end.line, end.character), sentence, vscode.DiagnosticSeverity.Error);
        diagnostic.code = 'ATD9001';
        diagnostic.source = 'ADP: Validate Tool Description';
        byFile.set(difference.at.uri, [...(byFile.get(difference.at.uri) ?? []), diagnostic]);
      }
    }
    for (const [target, diagnostics] of byFile) validated.set(vscode.Uri.parse(target), diagnostics);
    const passed = result.cases.filter((outcome) => outcome.passed).length;
    output.appendLine(`${passed} of ${result.cases.length} case(s) passed.`);
    output.show(true);
    void vscode.window.showInformationMessage(`${passed} of ${result.cases.length} conformance case(s) of ${path.basename(root.fsPath)} passed.`);
    return result.cases;
  });
}
