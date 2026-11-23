import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { closeAll, drawn, example, state, until } from './support';

// The SLO map's folder subject in a real Visual Studio Code (etalii.adp spec 090, T026): the
// registration in a folder of OpenSLO files, which names no document of its own, opens in the SLO
// map, which draws every object of the folder's files and edits none.

const viewType = 'etalii.adp.openslo.slo';
const inMap = (uri: vscode.Uri): boolean => vscode.window.tabGroups.all
  .flatMap((group) => group.tabs)
  .some((tab) => tab.input instanceof vscode.TabInputCustom && tab.input.viewType === viewType && tab.input.uri.toString() === uri.toString());

suite('The SLO map in Visual Studio Code', () => {
  suiteSetup(async () => {
    await vscode.extensions.getExtension('etalii.adp')?.activate();
  });
  teardown(closeAll);

  test('the registration in a folder of OpenSLO files opens the folder in the SLO map, every object drawn, read-only', async () => {
    const registration = example('fixtures', 'fbl', 'conformance', 'fixtures', 'openslo-slo-folder', 'shop', 'openslo.adp');
    await vscode.commands.executeCommand('vscode.open', registration);
    await until('the SLO map\'s tab', () => inMap(registration));
    await until('the SLO map to be the active tool', async () => (await state())?.uri === registration.toString());
    const scene = (await drawn()).scene;
    assert.ok(scene, 'the folder is drawn as a scene');
    const ids = scene.nodes.map((node) => node.id);
    for (const id of ['Service:web-shop', 'SLI:search-latency', 'SLO:search-slo']) assert.ok(ids.includes(id), `${id} is drawn`);
    assert.strictEqual(scene.readOnly, true);
  });
});
