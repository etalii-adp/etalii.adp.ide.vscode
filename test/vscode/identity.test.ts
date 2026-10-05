import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('The plug-in, installed', () => {
  test('carries the names the other hosts use', () => {
    const extension = vscode.extensions.getExtension('etalii.adp');
    assert.ok(extension, 'the plug-in is installed under the identifier etalii.adp');
    assert.strictEqual(extension.packageJSON.displayName, 'ADP: A Different Perspective');
  });

  test('activates', async () => {
    const extension = vscode.extensions.getExtension('etalii.adp');
    assert.ok(extension);
    const api = await extension.activate();
    assert.ok(Array.isArray(api.viewTypes));
  });
});