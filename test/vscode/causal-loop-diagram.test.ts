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

  test('a link dropped onto a variable asks where it goes in an input box, and one dropped elsewhere is refused in the definition\'s words', async () => {
    const uri = example('causal-loop-diagram', 'on-call', 'on-call.cld');
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
    const current = await drawn();
    const document = await vscode.workspace.openTextDocument(uri);
    const toil = current.view?.elements.find((element) => element.id === 'variable:toil');
    assert.ok(toil, 'the variable toil is drawn');

    assert.deepStrictEqual(await edit({ kind: 'drop', entry: 'causal-loop.add-link', x: toil.x - 400, y: toil.y - 400 }), { result: 'refused', sentence: 'Drop a link or a loop onto a variable.' });
    await inputBoxes([{ answer: 'mistakes' }]);
    assert.deepStrictEqual(await edit({ kind: 'drop', entry: 'causal-loop.add-link', x: toil.x + toil.width / 2, y: toil.y + 10 }), { result: 'applied' });
    assert.strictEqual((await asked())[0]?.title, 'Add link');
    await until('the link to be written', () => document.getText().includes('link toil -> mistakes +'));
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

  // etalii.adp spec 082: the flow page written beside the file, of the diagram as the editor holds it, and nothing of the document changed.
  const exported = async (): Promise<vscode.Uri> => {
    const last = await until('a page to be written', async () => (await vscode.commands.executeCommand<{ uri?: string }>('etalii.adp.test.lastExport'))?.uri);
    return vscode.Uri.parse(last);
  };

  test('Export flow page on the diagram writes its page beside it, unsaved edits included, and leaves the document as it was', async () => {
    const uri = example('causal-loop-diagram', 'on-call', 'on-call.cld');
    await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
    await drawn();
    const document = await vscode.workspace.openTextDocument(uri);
    const unsaved = new vscode.WorkspaceEdit();
    unsaved.insert(uri, new vscode.Position(document.lineCount, 0), '\nvariable sleep "Sleep"\n');
    await vscode.workspace.applyEdit(unsaved);
    const before = document.getText();
    const version = document.version;

    assert.deepStrictEqual(await edit({ kind: 'action', action: 'export:flowPage' }), { result: 'applied' });
    const page = await exported();
    try {
      assert.match(page.path, /\/on-call \{\d{4}-\d{2}-\d{2} \d{2}\.\d{2}\}\.html$/);
      const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(page));
      assert.ok(text.startsWith('<!doctype html>'));
      assert.ok(text.includes('["sleep","Sleep",'), 'the unsaved variable is in the page');
      assert.strictEqual(document.getText(), before);
      assert.strictEqual(document.version, version, 'an export is no edit');
      assert.ok(document.isDirty, 'the document is still unsaved');
    } finally {
      await vscode.workspace.fs.delete(page);
    }
  });

  test('Export Flow Page from the Explorer writes the page of a file no editor holds', async () => {
    const uri = example('causal-loop-diagram', 'reference', 'reference.cld');
    await vscode.commands.executeCommand('etalii.adp.export.flowPage', uri);
    const page = await until('the page of reference.cld', async () => {
      const last = await vscode.commands.executeCommand<{ uri?: string }>('etalii.adp.test.lastExport');
      return last?.uri?.includes('/reference%20%7B') || last?.uri?.includes('/reference {') ? vscode.Uri.parse(last.uri) : undefined;
    });
    try {
      const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(page));
      assert.ok(text.includes('"o":[["R1","Births beget births"'), 'the page holds the file\'s loops');
    } finally {
      await vscode.workspace.fs.delete(page);
    }
  });
});
