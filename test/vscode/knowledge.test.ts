import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { closeAll, drawn, example, until } from './support';

// The Knowledge designer in a real Visual Studio Code (etalii.adp spec 027, User Story 3). The
// designer has no code of its own in the extension: it is the tool type read from
// `definitions/knowledge/`, shown on the table surface. Its files share their extensions with every
// other YAML, JSON and XML file, so a file opens as text first and is reopened in the designer when
// its envelope names it; every other tab stays what it was.

const viewType = 'etalii.adp.etalii.knowledge';

const edit = (request: unknown): Thenable<{ result: string; sentence?: string } | undefined> => vscode.commands.executeCommand('etalii.adp.test.edit', request);
const folder = (): string => example('knowledge-test').fsPath;
const exampleText = (name: string): string => fs.readFileSync(example('knowledge', name).fsPath, 'utf8');
const tabsOn = (uri: vscode.Uri): vscode.Tab[] => vscode.window.tabGroups.all.flatMap((group) => group.tabs)
  .filter((tab) => (tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputCustom) && tab.input.uri.toString() === uri.toString());
const inDesigner = (uri: vscode.Uri): boolean => tabsOn(uri).some((tab) => tab.input instanceof vscode.TabInputCustom && tab.input.viewType === viewType);
/** Long enough for a claimed file to have been reopened: a tab that is still text after it stays text. */
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1500));

let copies = 0;

// Each test works on a file of its own, so the copied examples stay as they were.
function written(text: string, extension = 'yaml'): vscode.Uri {
  copies += 1;
  const uri = example('knowledge-test', `work-${copies}.${extension}`);
  fs.writeFileSync(uri.fsPath, text);
  return uri;
}

async function open(text = exampleText('cities.yaml'), extension = 'yaml'): Promise<{ uri: vscode.Uri; document: vscode.TextDocument; original: string }> {
  const uri = written(text, extension);
  await vscode.commands.executeCommand('vscode.open', uri);
  await until('the designer\'s tab', () => inDesigner(uri));
  await drawn();
  const document = await vscode.workspace.openTextDocument(uri);
  return { uri, document, original: document.getText() };
}

suite('The Knowledge designer in Visual Studio Code', () => {
  suiteSetup(async () => {
    fs.mkdirSync(folder(), { recursive: true });
    await vscode.extensions.getExtension('etalii.adp')?.activate();
  });
  // The editor may still hold a file of the folder for a moment after its tab is closed.
  suiteTeardown(() => fs.rmSync(folder(), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  teardown(closeAll);

  for (const name of ['cities.yaml', 'cities.json', 'cities.xml']) {
    test(`a knowledge file, ${name}, is reopened in the designer, shown as its table, and is not modified by being opened`, async () => {
      const uri = example('knowledge', name);
      const bytes = fs.readFileSync(uri.fsPath);
      await vscode.commands.executeCommand('vscode.open', uri);
      await until('the designer\'s tab', () => inDesigner(uri));
      assert.strictEqual(tabsOn(uri).length, 1, 'the tool took the place of the text tab');

      const state = await drawn();
      assert.strictEqual(state.origin, 'etalii/knowledge');
      assert.strictEqual(state.kind, 'designer');
      assert.ok(state.table, 'a designer shows a table');
      assert.strictEqual(state.table.name, 'Cities');
      assert.deepStrictEqual(state.table.views.map((tab) => [tab.name, tab.active]), [['All cities', true], ['Map', false]]);
      assert.deepStrictEqual(state.table.rows.map((row) => row.title), ['Amsterdam', 'Sevenum', 'Venlo']);
      assert.notStrictEqual(state.table.readOnly, true);
      assert.strictEqual(tabsOn(uri)[0].isDirty, false);
      assert.ok(fs.readFileSync(uri.fsPath).equals(bytes));
      assert.deepStrictEqual(vscode.languages.getDiagnostics(uri), []);
    });
  }

  test('a file without the envelope is handed back to the text editor when the designer is chosen for it under "Open With"', async () => {
    const uri = written('name: settings\nitems:\n  - one\n');
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
    await until('the text editor', () => vscode.window.activeTextEditor?.document.uri.toString() === uri.toString());
    await settled();
    assert.strictEqual(inDesigner(uri), false);
    assert.ok(tabsOn(uri).every((tab) => tab.input instanceof vscode.TabInputText));
    assert.deepStrictEqual(vscode.languages.getDiagnostics(uri), []);
  });

  test('a diff of a knowledge file is never reopened', async () => {
    const [left, right] = [written(exampleText('cities.yaml')), written(exampleText('cities.yaml').replace('Amsterdam', 'Mokum'))];
    await vscode.commands.executeCommand('vscode.diff', left, right);
    await until('the diff', () => vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputTextDiff);
    await settled();
    assert.ok(vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputTextDiff);
    assert.strictEqual(inDesigner(left) || inDesigner(right), false);
  });

  test('an untitled document that reads as a knowledge file is never reopened', async () => {
    const document = await vscode.workspace.openTextDocument({ language: 'yaml', content: exampleText('cities.yaml') });
    await vscode.window.showTextDocument(document);
    await settled();
    assert.ok(vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText);
    assert.strictEqual(vscode.window.activeTextEditor?.document, document);
  });

  test('a knowledge file that is no file of the workspace, as one from version control is not, is never reopened', async () => {
    // A document of another scheme stands in for one of `git:`: it has a knowledge file's name and text, and is no file.
    const provider = vscode.workspace.registerTextDocumentContentProvider('adp-test', { provideTextDocumentContent: () => exampleText('cities.yaml') });
    try {
      const uri = vscode.Uri.parse('adp-test:/cities.yaml');
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
      await settled();
      assert.ok(vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText);
    } finally {
      provider.dispose();
    }
  });

  test('"Open as Text" opens the text editor on a knowledge file, and the file stays text for the session', async () => {
    const { uri } = await open();
    await vscode.commands.executeCommand('etalii.adp.openAsText');
    await until('the text editor', () => vscode.window.visibleTextEditors.find((candidate) => candidate.document.uri.toString() === uri.toString()));
    await settled();
    assert.ok(tabsOn(uri).some((tab) => tab.input instanceof vscode.TabInputText), 'the text tab was not reopened in the designer');

    // Opened again later in the session, the file is text.
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('vscode.open', uri);
    await until('the text editor', () => vscode.window.activeTextEditor?.document.uri.toString() === uri.toString());
    await settled();
    assert.strictEqual(inDesigner(uri), false);
  });

  test('an edit of a cell changes only that value, as one undo step, and save writes it', async () => {
    const { uri, document, original } = await open();
    assert.deepStrictEqual(await edit({ kind: 'cell', row: 'r1', property: 'p1', value: 'Mokum' }), { result: 'applied' });

    const changed = original.replace('text: Amsterdam', 'text: Mokum');
    assert.strictEqual(document.getText(), changed, 'nothing but the value changed');
    assert.strictEqual(document.isDirty, true);
    const state = await drawn(document.version);
    assert.strictEqual(state.table!.rows.find((row) => row.id === 'r1')?.title, 'Mokum', 'the table follows');

    await vscode.commands.executeCommand('undo');
    await until('the undo', () => document.getText() === original);
    await vscode.commands.executeCommand('redo');
    await until('the redo', () => document.getText() === changed);
    await document.save();
    assert.strictEqual(fs.readFileSync(uri.fsPath, 'utf8'), changed);
  });

  test('an operation of the definition is one undo step, named as the definition names it', async () => {
    const { document, original } = await open();
    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'addRow' }), { result: 'applied' });
    const added = document.getText();
    assert.match(added.slice(original.length), /^ {2}- id: [0-9a-z]{25}\r\n$/, 'a row is appended, and nothing else changes');
    assert.ok(added.startsWith(original));
    await vscode.commands.executeCommand('undo');
    await until('the undo', () => document.getText() === original);
  });

  test('a refusal shows the definition\'s sentence and writes nothing', async () => {
    const { document, original } = await open();
    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'renameProperty', on: ['p3'], args: { name: 'Name' } }), { result: 'refused', sentence: 'A property named `Name` already exists.' });
    assert.strictEqual(document.getText(), original);
    assert.strictEqual(document.isDirty, false);
  });

  test('the operations for what is selected are offered, and the cells of a selected row are the rows of ADP Properties', async () => {
    await open();
    await vscode.commands.executeCommand('etalii.adp.test.select', ['p1']);
    const column = await until('the column\'s operations', async () => {
      const state = await drawn();
      return state.selection[0] === 'p1' ? state : undefined;
    });
    assert.deepStrictEqual(column.actions?.find((action) => action.label === 'Delete'), { id: 'deleteProperty', label: 'Delete', enabled: false, disabledReason: 'The title property cannot be deleted.' });
    await vscode.commands.executeCommand('etalii.adp.test.select', ['r2']);
    const row = await until('the row\'s fields', async () => {
      const state = await drawn();
      return state.selection[0] === 'r2' ? state : undefined;
    });
    assert.deepStrictEqual(row.fields.slice(0, 2).map((field) => [field.label, field.value]), [['Name', 'Antwerp'], ['Country', 'Belgium']]);
  });

  test('a rule of the definition that a file breaks is in Problems, on the line of its cause', async () => {
    const { uri } = await open(exampleText('cities.yaml').replace('    name: Country\r\n', '    name: Name\r\n'));
    const diagnostics = await until('the finding', () => {
      const found = vscode.languages.getDiagnostics(uri);
      return found.length > 0 ? found : undefined;
    });
    assert.deepStrictEqual(diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.message, diagnostic.range.start.line, diagnostic.severity]), [
      ['knowledge.duplicate-property-name', 'A property named `Name` already exists.', 10, vscode.DiagnosticSeverity.Error],
    ]);
  });

  test('a new knowledge file has one column, one view and no row', async () => {
    const uri = example('knowledge-test', 'new.json');
    const extension = vscode.extensions.getExtension('etalii.adp');
    assert.ok((extension?.packageJSON as { contributes: { commands: { command: string }[] } }).contributes.commands.some((entry) => entry.command === 'etalii.adp.new.etalii.knowledge'));
    // The command asks where to save with the platform's dialog; the file it would write is the binding's template.
    fs.writeFileSync(uri.fsPath, '{\r\n  "ded": "0.1",\r\n  "designer": "etalii/knowledge",\r\n  "name": "new",\r\n  "properties": [\r\n    { "id": "p1", "name": "Name", "type": "text", "title": true }\r\n  ],\r\n  "views": [\r\n    { "id": "v1", "name": "Table" }\r\n  ],\r\n  "rows": []\r\n}\r\n');
    await vscode.commands.executeCommand('vscode.open', uri);
    await until('the designer\'s tab', () => inDesigner(uri));
    const state = await drawn();
    assert.deepStrictEqual([state.table!.properties.map((property) => property.name), state.table!.views.map((tab) => tab.name), state.table!.rows.length], [['Name'], ['Table'], 0]);
  });
});
