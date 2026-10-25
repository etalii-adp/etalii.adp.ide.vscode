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
    // The server is up once it gives a file's outline.
    await until('the server to answer', async () => {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uriOf(walk.files[0]));
      return symbols?.length ? true : undefined;
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

// The three commands of story 5 (etalii.adp spec 035, T136, FR-060, FR-061, FR-063), each run with its answers as an
// argument in place of its prompts: a new description of each kind opens with nothing in the Problems panel; an
// import of a second file with an error shows both files' findings; the mind map's cases validate as the desktop host's
// `atd validate` did, a seeded difference shows as one more, and nothing of a case is opened or written.

interface Difference {
  step: number | null;
  part: string;
  expected: string;
  actual: string;
  at?: { uri: string; range: { start: { line: number } } } | null;
}
interface CaseResult {
  name: string;
  passed: boolean;
  differences: Difference[];
}

/** The codes of a file's diagnostics, once they have stayed the same for half a second. */
async function steady(uri: vscode.Uri): Promise<string[]> {
  let seen = '';
  let since = Date.now();
  const deadline = Date.now() + 10000;
  for (;;) {
    const now = JSON.stringify(vscode.languages.getDiagnostics(uri).map(code).sort());
    if (now !== seen) {
      seen = now;
      since = Date.now();
    }
    if (Date.now() - since >= 500 || Date.now() > deadline) return JSON.parse(seen) as string[];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Every file under a folder with the time it was last written. */
function written(folder: string): Record<string, number> {
  const times: Record<string, number> = {};
  for (const entry of fs.readdirSync(folder, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const file = path.join(entry.parentPath, entry.name);
      times[file] = fs.statSync(file).mtimeMs;
    }
  }
  return times;
}

suite('.atd tool description commands', () => {
  const created = (): string => example('atd-new').fsPath;

  suiteSetup(async () => {
    fs.rmSync(created(), { recursive: true, force: true });
    fs.mkdirSync(created(), { recursive: true });
    await vscode.extensions.getExtension('etalii.adp')?.activate();
  });
  suiteTeardown(async () => {
    await closeAll();
    fs.rmSync(created(), { recursive: true, force: true });
    fs.rmSync(example('atd-seeded').fsPath, { recursive: true, force: true });
  });

  test('New Tool Description writes each kind, which opens with an empty Problems panel', async () => {
    for (const kind of ['diagram', 'designer', 'editor']) {
      const folder = vscode.Uri.file(path.join(created(), kind));
      fs.mkdirSync(folder.fsPath, { recursive: true });

      const file = await vscode.commands.executeCommand<vscode.Uri | undefined>('etalii.adp.newToolDescription', { kind, origin: 'acme/widgets', name: 'Widgets', folder });

      assert.ok(file, `${kind}: a file was written`);
      assert.strictEqual(path.basename(file.fsPath), 'widgets.atd');
      const text = fs.readFileSync(file.fsPath, 'utf8');
      assert.ok(text.includes(`${kind} acme/widgets version`), `${kind}: ${text.slice(0, 120)}`);
      assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, file.fsPath, `${kind}: the new file is opened`);
      await until('the server to answer', async () => {
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', file);
        return symbols?.length ? true : undefined;
      });
      assert.deepStrictEqual(await steady(file), [], `${kind}: the Problems panel is empty`);
      assert.strictEqual(await vscode.commands.executeCommand<number>('etalii.adp.checkToolDescription', file), 0, `${kind}: Check finds nothing`);

      // A second run never writes over the file.
      const again = await vscode.commands.executeCommand<vscode.Uri | undefined>('etalii.adp.newToolDescription', { kind, origin: 'acme/widgets', name: 'Other', folder });
      assert.strictEqual(again, undefined);
      assert.strictEqual(fs.readFileSync(file.fsPath, 'utf8'), text);
    }
  });

  test('an import of a second file with an error shows both files\' findings', async () => {
    const root = vscode.Uri.file(path.join(created(), 'diagram', 'widgets.atd'));
    const part = vscode.Uri.file(path.join(created(), 'diagram', 'widgets.extra.atd'));
    fs.writeFileSync(part.fsPath, 'atd 0.1\n\npart of acme/widgets\n\nconstraint named for Missing {\n  rule self.name != ""\n  severity warning\n  message "A node needs a name."\n}\n');
    const document = await vscode.workspace.openTextDocument(root);
    await vscode.window.showTextDocument(document);
    const text = document.getText();
    const edit = new vscode.WorkspaceEdit();
    const label = text.indexOf('  label "Widgets"\n') + '  label "Widgets"\n'.length;
    edit.insert(root, document.positionAt(label), '  import "widgets.extra.atd"\n');
    const relation = text.indexOf('to Node\n');
    edit.replace(root, new vscode.Range(document.positionAt(relation + 3), document.positionAt(relation + 7)), 'Nowhere');
    await vscode.workspace.applyEdit(edit);

    // The root's finding, as soon as the edit is checked, and the part's, which no editor holds open.
    const both = (): boolean | undefined =>
      JSON.stringify(vscode.languages.getDiagnostics(root).map(code)) === '["ATD2002"]' && JSON.stringify(vscode.languages.getDiagnostics(part).map(code)) === '["ATD2002"]'
        ? true
        : undefined;
    await until('the findings of both files', both);
    await document.save();
    assert.strictEqual(await vscode.commands.executeCommand<number>('etalii.adp.checkToolDescription', root), 2);
    assert.deepStrictEqual(vscode.languages.getDiagnostics(part).map(code), ['ATD2002'], 'the part\'s finding is in the Problems panel');
  });

  test('Validate Tool Description gives the desktop host\'s result, then the seeded difference, and opens or writes nothing of a case', async () => {
    const fixtures = example('fixtures', 'atd').fsPath;
    const desktop = JSON.parse(fs.readFileSync(path.join(fixtures, 'mindmap.validate.json'), 'utf8')) as {
      cases: { name: string; passed: boolean; differences: (Omit<Difference, 'at'> & { at?: { file: string; line: number } })[] }[];
    };
    const place = (file: string, line: number): string => `${path.basename(file)}:${line}`;
    const fromDesktop = desktop.cases.map((c) => ({
      name: c.name,
      passed: c.passed,
      differences: c.differences.map((d) => ({ step: d.step, part: d.part, expected: d.expected, actual: d.actual, at: d.at ? place(d.at.file, d.at.line) : null })),
    }));
    const fromHere = (cases: CaseResult[]): typeof fromDesktop =>
      cases.map((c) => ({
        name: c.name,
        passed: c.passed,
        differences: c.differences.map((d) => ({ step: d.step, part: d.part, expected: d.expected, actual: d.actual, at: d.at ? place(vscode.Uri.parse(d.at.uri).fsPath, d.at.range.start.line + 1) : null })),
      }));
    const before = written(fixtures);
    const root = vscode.Uri.file(path.join(fixtures, 'diagrams', 'mindmap.atd'));

    const result = await vscode.commands.executeCommand<CaseResult[]>('etalii.adp.validateToolDescription', root);

    assert.deepStrictEqual(fromHere(result), fromDesktop);
    assert.ok(vscode.languages.getDiagnostics().some(([, diagnostics]) => diagnostics.some((d) => d.source === 'ADP: Validate Tool Description')), 'the differences are diagnostics');

    // The same description with one message changed: the case `unnamed-root` gives one more difference, its finding.
    const seeded = example('atd-seeded').fsPath;
    fs.rmSync(seeded, { recursive: true, force: true });
    fs.cpSync(path.join(fixtures, 'diagrams'), seeded, { recursive: true });
    const description = path.join(seeded, 'mindmap.atd');
    const original = fs.readFileSync(description, 'utf8');
    fs.writeFileSync(description, original.replace('has an unnamed central topic.', 'has a nameless central topic.'));
    const again = await vscode.commands.executeCommand<CaseResult[]>('etalii.adp.validateToolDescription', vscode.Uri.file(description));
    const unnamed = (cases: CaseResult[]): CaseResult => cases.find((c) => c.name === 'unnamed-root')!;
    assert.strictEqual(unnamed(again).differences.length, unnamed(result).differences.length + 1);
    const finding = unnamed(again).differences.find((d) => d.part === 'findings');
    assert.ok(finding && finding.expected.includes('has an unnamed central topic.') && finding.actual.includes('has a nameless central topic.'), JSON.stringify(finding));

    // Validation reads the cases and the description through the file system and hands them over: nothing is opened
    // or written.
    assert.deepStrictEqual(
      vscode.workspace.textDocuments.filter((d) => d.uri.fsPath.startsWith(fixtures) || d.uri.fsPath.startsWith(seeded)).map((d) => d.uri.fsPath),
      [],
    );
    assert.deepStrictEqual(written(fixtures), before);
  });
});
