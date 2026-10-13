import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { closeAll, drawn, example, until } from './support';

// Which file opens in which editor (etalii.adp spec 027, FR-008 and SC-003): the tool types are the
// copied definitions the package ships, and a file of a shared extension that no binding claims
// opens as it did before the plug-in read any definition.

// Four files no binding claims: none has a marker, and none has what a binding's `claims.suggest`
// looks for. Each is well formed, so nothing else has a reason to report on it either.
const unclaimed: Record<string, string> = {
  'notes.md': '# Notes\n\nA plain Markdown file.\n',
  'settings.yaml': 'name: settings\nitems:\n  - one\n  - two\n',
  'settings.json': '{\n  "name": "settings",\n  "items": ["one", "two"]\n}\n',
  'settings.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<settings name="settings">\n  <item>one</item>\n</settings>\n',
};

const folder = (): string => example('unclaimed').fsPath;
const tabsOn = (uri: vscode.Uri): vscode.Tab[] => vscode.window.tabGroups.all
  .flatMap((group) => group.tabs)
  .filter((tab) => (tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputCustom) && tab.input.uri.toString() === uri.toString());

suite('Opening a file in Visual Studio Code', () => {
  suiteSetup(async () => {
    // The files are written by the test, into the copy of the examples it runs on.
    fs.mkdirSync(folder(), { recursive: true });
    for (const [name, text] of Object.entries(unclaimed)) fs.writeFileSync(path.join(folder(), name), text);
    await vscode.extensions.getExtension('etalii.adp')?.activate();
  });
  suiteTeardown(() => fs.rmSync(folder(), { recursive: true, force: true }));
  teardown(closeAll);

  test('the package ships the copied definitions', () => {
    const extension = vscode.extensions.getExtension('etalii.adp');
    assert.ok(extension);
    for (const [tool, kind] of [['gartner-hype-cycle-graph', 'dis'], ['agent-behavior-modelling', 'dis'], ['knowledge', 'des']]) {
      for (const file of [`${tool}.${kind}`, `${tool}.fbl`, `${tool}.md`, 'PROVENANCE.md']) {
        assert.ok(fs.existsSync(path.join(extension.extensionPath, 'definitions', tool, file)), `the package has definitions/${tool}/${file}`);
      }
    }
  });

  for (const name of Object.keys(unclaimed)) {
    test(`a file nothing claims, ${name}, opens as text with nothing reported`, async () => {
      const uri = example('unclaimed', name);
      await vscode.commands.executeCommand('vscode.open', uri);
      await until('the text editor', () => vscode.window.activeTextEditor?.document.uri.toString() === uri.toString());

      // A claimed file is reopened in its tool after its text tab shows, so the tab is given the
      // time that would take before it is looked at.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const tabs = tabsOn(uri);
      assert.strictEqual(tabs.length, 1, 'the file has one tab');
      assert.ok(tabs[0].input instanceof vscode.TabInputText, 'the file is in the text editor, not in a tool');
      assert.strictEqual(vscode.window.activeTextEditor?.document.getText(), unclaimed[name]);
      assert.strictEqual(tabs[0].isDirty, false);
      assert.deepStrictEqual(vscode.languages.getDiagnostics(uri).map((diagnostic) => `${diagnostic.source}: ${diagnostic.message}`), []);
    });
  }

  test('"Open as Text" opens the text editor on the file a tool shows', async () => {
    const uri = example('gartner-hypecycle-graph', 'electric-vehicles', 'electric-vehicles.ghg');
    await vscode.commands.executeCommand('vscode.open', uri);
    await drawn();
    assert.ok(vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputCustom, 'the example opens in its diagram');

    await vscode.commands.executeCommand('etalii.adp.openAsText');
    const editor = await until('the text editor', () => vscode.window.visibleTextEditors.find((candidate) => candidate.document.uri.toString() === uri.toString()));
    assert.ok(tabsOn(uri).some((tab) => tab.input instanceof vscode.TabInputText), 'the file has a text tab');
    assert.strictEqual(editor.document.isDirty, false);
  });
});
