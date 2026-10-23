import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { closeAll, example, until } from './support';

// `.atd` tool descriptions in the packaged plug-in (etalii.adp spec 035, T111, T113): the 30-step walk of SC-005,
// shipped with the server's release and fetched into vendor/atd-walk/, run through Visual Studio Code's own commands
// on a copy of its files, each step expecting what the walk states; then SC-006's latency over WebAssembly on a
// description of 5,000 lines.

const repository = path.join(__dirname, '..', '..', '..');
const walkFolder = path.join(repository, 'vendor', 'atd-walk');

interface Step {
  id: number;
  file: string;
  line: number;
  column: number;
  utf16: number;
  request: string;
  doc: string;
  newName?: string;
  edit?: { text: string; endLine?: number; endColumn?: number };
  expect: {
    exactly?: string[];
    includes?: string[];
    excludes?: string[];
    contains?: string;
    file?: string;
    line?: number;
    utf16?: number;
    count?: number;
    files?: Record<string, number>;
    codes?: string[];
    diagnostics?: { code: string }[];
  };
}

const folder = (): string => example('atd').fsPath;
const uriOf = (file: string): vscode.Uri => vscode.Uri.file(path.join(folder(), file));

function code(diagnostic: vscode.Diagnostic): string {
  const value = diagnostic.code;
  return String(typeof value === 'object' ? value.value : value);
}

/** The name of the description a file belongs to: a root `<name>.atd` and its parts `<name>.<part>.atd` (ATD §5). */
const descriptionOf = (file: string): string => path.basename(file).split('.')[0];

/** The codes of the diagnostics of every file of the description `file` belongs to, sorted, as the walk counts them. */
function codes(file: string): string[] {
  return vscode.languages
    .getDiagnostics()
    .filter(([uri]) => path.dirname(uri.fsPath) === folder() && uri.fsPath.endsWith('.atd') && descriptionOf(uri.fsPath) === descriptionOf(file))
    .flatMap(([, diagnostics]) => diagnostics.map(code))
    .sort();
}

/** Waits until the diagnostics are `want`, giving the last ones seen when they never are. */
async function settle(file: string, want: string[]): Promise<string[]> {
  const deadline = Date.now() + 5000;
  let seen = codes(file);
  while (JSON.stringify(seen) !== JSON.stringify(want) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    seen = codes(file);
  }
  return seen;
}

function label(item: vscode.CompletionItem): string {
  return typeof item.label === 'string' ? item.label : item.label.label;
}

function hoverText(hovers: vscode.Hover[]): string {
  return hovers
    .flatMap((hover) => hover.contents)
    .map((content) => (typeof content === 'string' ? content : 'value' in content ? content.value : ''))
    .join('\n');
}

suite('.atd tool descriptions', () => {
  suiteSetup(async () => {
    fs.rmSync(folder(), { recursive: true, force: true });
    fs.mkdirSync(folder(), { recursive: true });
    for (const name of fs.readdirSync(walkFolder)) fs.copyFileSync(path.join(walkFolder, name), path.join(folder(), name));
    await vscode.extensions.getExtension('etalii.adp')?.activate();
  });
  suiteTeardown(async () => {
    await closeAll();
    fs.rmSync(folder(), { recursive: true, force: true });
  });

  test('the package ships the language server and the grammar', () => {
    const extension = vscode.extensions.getExtension('etalii.adp');
    assert.ok(extension);
    for (const file of ['vendor/atd-lsp/adp_atd_lsp.js', 'vendor/atd-lsp/adp_atd_lsp_bg.wasm', 'dist/atd-worker.js', 'syntaxes/atd.tmLanguage.json']) {
      assert.ok(fs.existsSync(path.join(extension.extensionPath, file)), `the package has ${file}`);
    }
  });

  test('the walk gives its expected results', async () => {
    const walk = JSON.parse(fs.readFileSync(path.join(folder(), 'walk.json'), 'utf8')) as { files: string[]; steps: Step[] };
    for (const file of walk.files) {
      const document = await vscode.workspace.openTextDocument(uriOf(file));
      assert.strictEqual(document.languageId, 'atd', `${file} opens as ATD`);
    }
    // The server is up once the examples' diagnostics, none, have been published for the files opened.
    await until('the server to answer', async () => {
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', uriOf(walk.files[0]), new vscode.Position(0, 0));
      return hovers !== undefined ? true : undefined;
    });

    const failures: string[] = [];
    for (const step of walk.steps) {
      const uri = uriOf(step.file);
      const position = new vscode.Position(step.line - 1, step.utf16);
      const expect = step.expect;
      let problem: string | undefined;
      switch (step.request) {
        case 'completion': {
          const list = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', uri, position);
          const got = [...new Set(list.items.map(label))].sort();
          if (expect.exactly) {
            const want = [...expect.exactly].sort();
            if (JSON.stringify(got) !== JSON.stringify(want)) problem = `completion ${JSON.stringify(got)}, expected exactly ${JSON.stringify(want)}`;
          } else {
            const missing = (expect.includes ?? []).filter((e) => !got.includes(e));
            const unwanted = (expect.excludes ?? []).filter((e) => got.includes(e));
            if (missing.length || unwanted.length) problem = `completion lacks ${JSON.stringify(missing)}, has ${JSON.stringify(unwanted)}`;
          }
          break;
        }
        case 'hover': {
          const text = hoverText(await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', uri, position));
          if (!text.includes(expect.contains ?? '')) problem = `hover ${JSON.stringify(text)} lacks ${JSON.stringify(expect.contains)}`;
          break;
        }
        case 'definition': {
          const found = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>('vscode.executeDefinitionProvider', uri, position);
          const first = found[0];
          const target = first && ('targetUri' in first ? { uri: first.targetUri, range: first.targetSelectionRange ?? first.targetRange } : first);
          const ok = target && target.uri.fsPath.endsWith(expect.file ?? '') && target.range.start.line === (expect.line ?? 0) - 1 && target.range.start.character === expect.utf16;
          if (!ok) problem = `definition ${JSON.stringify(target)}, expected ${JSON.stringify(expect)}`;
          break;
        }
        case 'references': {
          const found = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', uri, position);
          if (found.length !== expect.count) problem = `${found.length} references, expected ${expect.count}`;
          break;
        }
        case 'rename': {
          const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>('vscode.executeDocumentRenameProvider', uri, position, step.newName);
          const counts: Record<string, number> = {};
          for (const [file, edits] of edit.entries()) counts[path.basename(file.fsPath)] = edits.length;
          if (JSON.stringify(Object.entries(counts).sort()) !== JSON.stringify(Object.entries(expect.files ?? {}).sort())) {
            problem = `rename edits ${JSON.stringify(counts)}, expected ${JSON.stringify(expect.files)}`;
          }
          break;
        }
        case 'format': {
          const options = { tabSize: 2, insertSpaces: true };
          const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', uri, options);
          if (edits?.length) {
            const apply = new vscode.WorkspaceEdit();
            apply.set(uri, edits);
            await vscode.workspace.applyEdit(apply);
          }
          const again = await vscode.commands.executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', uri, options);
          if (again?.length) problem = `the second formatting changed the file: ${JSON.stringify(again)}`;
          break;
        }
        case 'diagnostics': {
          const want = [...(expect.codes ?? [])].sort();
          const got = await settle(step.file, want);
          if (JSON.stringify(got) !== JSON.stringify(want)) problem = `diagnostics ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`;
          break;
        }
        case 'edit': {
          const document = await vscode.workspace.openTextDocument(uri);
          const end =
            step.edit?.endLine !== undefined
              ? new vscode.Position(step.edit.endLine - 1, [...document.lineAt(step.edit.endLine - 1).text].slice(0, (step.edit.endColumn ?? 1) - 1).join('').length)
              : position;
          const apply = new vscode.WorkspaceEdit();
          apply.replace(uri, new vscode.Range(position, end), step.edit?.text ?? '');
          await vscode.workspace.applyEdit(apply);
          const want = (expect.diagnostics ?? []).map((d) => d.code).sort();
          const got = await settle(step.file, want);
          if (JSON.stringify(got) !== JSON.stringify(want)) problem = `diagnostics after the edit ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`;
          break;
        }
        default:
          problem = `an unknown request ${step.request}`;
      }
      if (problem) failures.push(`step ${step.id} (${step.doc}): ${problem}`);
    }
    assert.deepStrictEqual(failures, [], `${failures.length} of ${walk.steps.length} steps failed`);
  });

  // SC-006 over WebAssembly: diagnostics after a keystroke within 1 s and completion within 0.5 s, on a description of
  // 5,000 lines made from the mind map example's constructs; the slowest of five is printed and held to its bound.
  test('the language server keeps up with a description of 5,000 lines', async () => {
    const base = fs.readFileSync(path.join(walkFolder, 'mindmap.atd'), 'utf8');
    let elements = '';
    let operations = '';
    for (let i = 1; base.split('\n').length + elements.split('\n').length + operations.split('\n').length < 5000; i++) {
      elements += `    /// Generated topic ${i}.\n    element Topic${i} {\n      label "Topic ${i}"\n      attribute text: string default "" { label: "Text" order: 1 }\n      attribute notes: text default "" { markup: plain label: "Notes" order: 2 }\n      attribute flagged: bool default false { label: "Flagged" order: 3 }\n      contains Node ordered\n      labelAttribute: text\n    }\n\n`;
      operations += `  operation grow${i} "Grow ${i}" for Node {\n    doc "Adds node ${i} under this one."\n    enabled self.parent != null && self.children.size() < ${i}\n    create Node { text: siblingName(self, "Node ${i}") } in self as added\n    select added\n  }\n\n`;
    }
    const text = base.replace('  model {\n', `  model {\n${elements}`).replace('  reason atStart', `${operations}  reason atStart`);
    const large = example('atd-large');
    fs.mkdirSync(large.fsPath, { recursive: true });
    fs.copyFileSync(path.join(walkFolder, 'mindmap.notation.atd'), path.join(large.fsPath, 'mindmap.notation.atd'));
    const uri = vscode.Uri.file(path.join(large.fsPath, 'mindmap.atd'));
    fs.writeFileSync(uri.fsPath, text);
    const lines = text.split('\n').length;
    assert.ok(lines >= 5000, `${lines} lines`);

    const document = await vscode.workspace.openTextDocument(uri);
    await until('the large description to be checked', () => (vscode.languages.getDiagnostics(uri) !== undefined ? true : undefined));
    const comment = text.split('\n').findIndex((line) => line.includes('/// Generated topic 1.'));
    const inside = text.split('\n').findIndex((line) => line.trim() === 'labelAttribute: text');
    let slowestDiagnostics = 0;
    let slowestCompletion = 0;
    for (let round = 0; round < 5; round++) {
      const published = new Promise<number>((resolve) => {
        const started = Date.now();
        const listener = vscode.languages.onDidChangeDiagnostics((event) => {
          if (event.uris.some((changed) => changed.toString() === uri.toString())) {
            listener.dispose();
            resolve(Date.now() - started);
          }
        });
      });
      const keystroke = new vscode.WorkspaceEdit();
      keystroke.insert(uri, new vscode.Position(comment, document.lineAt(comment).text.length), 'x');
      await vscode.workspace.applyEdit(keystroke);
      slowestDiagnostics = Math.max(slowestDiagnostics, await published);

      const another = new vscode.WorkspaceEdit();
      another.insert(uri, new vscode.Position(comment, document.lineAt(comment).text.length), 'y');
      await vscode.workspace.applyEdit(another);
      const started = Date.now();
      const list = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', uri, new vscode.Position(inside, 6));
      slowestCompletion = Math.max(slowestCompletion, Date.now() - started);
      assert.ok(list.items.length > 0, 'completion offers items');
    }
    console.log(`SC-006 over WebAssembly on ${lines} lines (slowest of 5): diagnostics after a keystroke ${slowestDiagnostics} ms (bound 1000), completion ${slowestCompletion} ms (bound 500)`);
    assert.ok(slowestDiagnostics < 1000, `diagnostics took ${slowestDiagnostics} ms`);
    assert.ok(slowestCompletion < 500, `completion took ${slowestCompletion} ms`);
    fs.rmSync(large.fsPath, { recursive: true, force: true });
  });
});
