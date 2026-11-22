import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { closeAll, drawn, example, until } from './support';

const viewType = 'etalii.adp.systems.causal-loop-diagram';
const edit = (request: unknown): Thenable<{ result: string; sentence?: string } | undefined> => vscode.commands.executeCommand('etalii.adp.test.edit', request);
interface Asked { title?: string; prompt?: string; value?: string; tried: Record<string, string | undefined> }
const inputBoxes = (script: { try?: string[]; answer?: string }[]): Thenable<Asked[]> => vscode.commands.executeCommand('etalii.adp.test.inputBoxes', script);
const asked = (): Thenable<Asked[]> => vscode.commands.executeCommand('etalii.adp.test.inputBoxesAsked');

suite('A causal loop diagram in Visual Studio Code', () => {
  teardown(closeAll);

  test('an operation with a form asks its value in an input box, refusing as it is typed what the form refuses, and is one undo step', async () => {
    const uri = example('causal-loop-diagram', 'on-call', 'on-call.cld');
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
    await drawn();
    const document = await vscode.workspace.openTextDocument(uri);
    const original = document.getText();

    await inputBoxes([{ try: ['nobody', 'mistakes'], answer: 'mistakes' }]);
    assert.deepStrictEqual(await edit({ kind: 'action', action: 'causal-loop.add-link', id: 'variable:toil' }), { result: 'applied' });

    const [box, ...more] = await asked();
    assert.strictEqual(more.length, 0, 'the form has one field, so one input box');
    assert.strictEqual(box.title, 'Add link');
    assert.strictEqual(box.prompt, 'To variable');
    // The form's own validation words it, as standalone's dialog does.
    assert.strictEqual(box.tried.nobody, '\'nobody\' is not a variable in this diagram.');
    assert.strictEqual(box.tried.mistakes, undefined);
    await until('the link to be written', () => document.getText().includes('link toil -> mistakes +'));

    await vscode.commands.executeCommand('undo');
    await until('the undo', () => document.getText() === original);
  });

  test('an input box cancelled changes nothing', async () => {
    const uri = example('causal-loop-diagram', 'on-call', 'on-call.cld');
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
    await drawn();
    const document = await vscode.workspace.openTextDocument(uri);
    const original = document.getText();

    await inputBoxes([{}]);
    assert.deepStrictEqual(await edit({ kind: 'action', action: 'causal-loop.add-link', id: 'variable:toil' }), { result: 'cancelled' });
    assert.strictEqual((await asked()).length, 1);
    assert.strictEqual(document.getText(), original);
    assert.strictEqual(document.isDirty, false);
  });

  test('with nothing selected, ADP Properties shows the diagram\'s own form, and a row of it writes the document', async () => {
    const uri = example('causal-loop-diagram', 'on-call', 'on-call.cld');
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
    const current = await drawn();
    const document = await vscode.workspace.openTextDocument(uri);
    const original = document.getText();
    assert.deepStrictEqual(current.selection, []);
    const title = current.fields.find((field) => field.label === 'Title');
    assert.ok(title, 'the diagram\'s Title row is shown');
    assert.deepStrictEqual(await edit({ kind: 'setField', id: '', field: title.id, value: 'Why on-call gets worse' }), { result: 'applied' });
    await until('the title to be written', () => document.getText().includes('title "Why on-call gets worse"'));
    await vscode.commands.executeCommand('undo');
    await until('the undo', () => document.getText() === original);
  });
});
