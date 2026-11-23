import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { closeAll, drawn, example, until } from './support';

// The dependency graph in a real window (etalii.adp spec 088, task T025): ADP: Add Node asks for the label in an input
// box, with "New node" filled in, and places the node as the standalone host does, as one undo step.

const viewType = 'etalii.adp.generic.dependencies';
interface Asked { title?: string; prompt?: string; value?: string; tried: Record<string, string | undefined> }
const inputBoxes = (script: { try?: string[]; answer?: string }[]): Thenable<Asked[]> => vscode.commands.executeCommand('etalii.adp.test.inputBoxes', script);
const asked = (): Thenable<Asked[]> => vscode.commands.executeCommand('etalii.adp.test.inputBoxesAsked');

suite('A dependency graph in Visual Studio Code', () => {
  teardown(closeAll);

  test('ADP: Add Node asks for a label and puts the node at 0 on row 0 with nothing selected, as one undo step', async () => {
    const uri = example('dependency-graph', 'example-1', 'services.dgr');
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
    await drawn();
    const document = await vscode.workspace.openTextDocument(uri);
    const original = document.getText();

    await inputBoxes([{ answer: 'Search cache' }]);
    await vscode.commands.executeCommand('etalii.adp.addNode');
    const [box, ...more] = await asked();
    assert.strictEqual(more.length, 0);
    assert.strictEqual(box.title, 'Add node');
    assert.strictEqual(box.prompt, 'Label');
    assert.strictEqual(box.value, 'New node');
    await until('the node to be written', () => /label: Search cache\r?\n\s+x: 0\r?\n\s+row: 0/.test(document.getText()));

    await vscode.commands.executeCommand('undo');
    await until('the undo', () => document.getText() === original);
  });

  test('ADP: Add Node puts the node 240 to the right of the selected node, on its row', async () => {
    const uri = example('dependency-graph', 'example-1', 'services.dgr');
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
    await drawn();
    const document = await vscode.workspace.openTextDocument(uri);
    const original = document.getText();

    await vscode.commands.executeCommand('etalii.adp.test.select', ['order-service']);
    await inputBoxes([{ answer: 'Order archive' }]);
    await vscode.commands.executeCommand('etalii.adp.addNode');
    await until('the node to be written', () => /label: Order archive\r?\n\s+x: 760\r?\n\s+row: 2/.test(document.getText()));

    await vscode.commands.executeCommand('undo');
    await until('the undo', () => document.getText() === original);
  });
});
