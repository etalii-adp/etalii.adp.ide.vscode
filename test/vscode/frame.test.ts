import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { closeAll, drawn, example, until } from './support';

const viewType = 'etalii.adp.gartner.hypecycle-graph';

suite('A hype cycle graph in Visual Studio Code', () => {
  teardown(closeAll);

  test('opens in the diagram by default, drawn from the file, and is not modified by being opened', async () => {
    const uri = example('gartner-hypecycle-graph', 'technology-trends', 'technology-trends.ghg');
    await vscode.commands.executeCommand('vscode.open', uri);
    const tab = await until('the diagram tab', () => vscode.window.tabGroups.activeTabGroup.activeTab);
    assert.ok(tab.input instanceof vscode.TabInputCustom, 'a .ghg file opens in a custom editor');
    assert.strictEqual(tab.input.viewType, viewType);

    const state = await drawn();
    assert.strictEqual(state.origin, 'gartner/hypecycle-graph');
    assert.ok(state.view!.elements.length > 0, 'the example\'s trends are drawn');
    assert.strictEqual(state.view!.readOnly, false);
    assert.strictEqual(tab.isDirty, false);
  });

  test('follows the text: an edit in the text document reaches the canvas, and one undo takes it back', async () => {
    const uri = example('fixtures', 'gartner-hypecycle-graph', 'triggers-and-notes.ghg');
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
    const before = await drawn();
    const document = await vscode.workspace.openTextDocument(uri);
    const original = document.getText();

    const line = document.getText().split(/\r?\n/).indexOf('    name: Transistors');
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, document.lineAt(line).range, '    name: Solid state');
    assert.ok(await vscode.workspace.applyEdit(edit));

    const after = await drawn(before.version + 1);
    assert.strictEqual(after.view!.elements.find((element) => element.id === 'transistors')?.label, 'Solid state');

    await vscode.commands.executeCommand('undo');
    await until('the undo to reach the document', () => document.getText() === original);
  });

  test('shows the same document as text beside it', async () => {
    const uri = example('fixtures', 'gartner-hypecycle-graph', 'rules-clean.ghg');
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
    await drawn();
    await vscode.commands.executeCommand('etalii.adp.openAsText');
    const editor = await until('the text editor', () => vscode.window.visibleTextEditors.find((candidate) => candidate.document.uri.toString() === uri.toString()));
    assert.strictEqual(editor.document.languageId, 'ghg');
  });

  test('lists a rule finding in the Problems panel with its rule and line', async () => {
    const uri = example('fixtures', 'gartner-hypecycle-graph', 'rule-phase-count.ghg');
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
    await drawn();
    const diagnostics = await until('the finding', () => {
      const found = vscode.languages.getDiagnostics(uri).filter((diagnostic) => diagnostic.code === 'ghg.phase-count');
      return found.length > 0 ? found : undefined;
    });
    assert.strictEqual(diagnostics[0].source, 'ADP');
    assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Warning);
    const document = await vscode.workspace.openTextDocument(uri);
    assert.ok(document.lineAt(diagnostics[0].range.start.line).text.trimStart().startsWith('- id:'));
  });

  test('opens a file that is not YAML as an empty, read-only diagram that says why', async () => {
    const uri = example('fixtures', 'gartner-hypecycle-graph', 'not-yaml.ghg');
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
    const state = await drawn();
    assert.deepStrictEqual(state.view!.elements, []);
    assert.strictEqual(state.view!.readOnly, true);
    assert.strictEqual(state.view!.notice, 'The graph could not be read, so it cannot be edited.');
  });
});