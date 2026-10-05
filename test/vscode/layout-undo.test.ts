import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { closeAll, drawn, example, state, until } from './support';

const agent = (name: string, extension: string): vscode.Uri => example('agent-behavior-modelling', name, `${name}.${extension}`);
const edit = (request: unknown): Thenable<{ result: string; sentence?: string } | undefined> => vscode.commands.executeCommand('etalii.adp.test.edit', request);
// The registration as Visual Studio Code has it, saved or not: a registration changed together
// with its Markdown is saved when the Markdown is.
const texts = new Map<string, vscode.TextDocument>();
const onDisk = (uri: vscode.Uri): string => texts.get(uri.toString())?.getText() ?? fs.readFileSync(uri.fsPath, 'utf8');
const next = (): Thenable<{ undo: boolean; redo: boolean }> => vscode.commands.executeCommand('etalii.adp.test.layoutSteps');
const yOf = async (id: string): Promise<number | undefined> => (await state())?.view?.elements.find((element) => element.id === id)?.y;

let copies = 0;

// Each test works on its own copy of an example, with a registration that keeps nothing yet, so
// what it drags and arranges is nobody else's.
async function openModel(name: string): Promise<{ document: vscode.TextDocument; original: string; registration: vscode.Uri; before: string }> {
  copies += 1;
  const uri = example('agent-behavior-modelling', name, `undo-${copies}.md`);
  const registration = example('agent-behavior-modelling', name, `undo-${copies}.adp`);
  fs.copyFileSync(agent(name, 'md').fsPath, uri.fsPath);
  fs.writeFileSync(registration.fsPath, 'etalii/agent-behavior-modelling\n');
  await vscode.commands.executeCommand('etalii.adp.openAs.etalii.agent-behavior-modelling', uri);
  await drawn();
  const document = await vscode.workspace.openTextDocument(uri);
  texts.set(registration.toString(), await vscode.workspace.openTextDocument(registration));
  return { document, original: document.getText(), registration, before: onDisk(registration) };
}
suite('Undo in a behavior model', () => {
  teardown(closeAll);

  test('takes back a drag that only moved a row, and Redo moves it again, with the Markdown untouched throughout', async () => {
    const { document, original, registration, before } = await openModel('bug-fixer');
    const y = (await yOf('1.1'))!;
    const x = (await drawn()).view!.elements.find((element) => element.id === '1.1')!.x;
    assert.deepStrictEqual(await next(), { undo: false, redo: false });

    assert.deepStrictEqual(await edit({ kind: 'move', id: '1.1', x, y: y + 40 }), { result: 'applied' });
    await until('the row to be lower', async () => (await yOf('1.1')) === y + 40);
    const dragged = onDisk(registration);
    assert.notStrictEqual(dragged, before);
    assert.deepStrictEqual(await next(), { undo: true, redo: false });

    await vscode.commands.executeCommand('etalii.adp.undoLayout');
    await until('the row to be back', async () => (await yOf('1.1')) === y);
    assert.strictEqual(onDisk(registration), before);
    assert.deepStrictEqual(await next(), { undo: false, redo: true });

    await vscode.commands.executeCommand('etalii.adp.redoLayout');
    await until('the row to be lower again', async () => (await yOf('1.1')) === y + 40);
    assert.strictEqual(onDisk(registration), dragged);

    assert.strictEqual(document.getText(), original);
    assert.strictEqual(document.isDirty, false);
  });

  test('takes back Arrange Diagram, putting every dragged position back', async () => {
    const { registration } = await openModel('customer-support');
    const view = (await drawn()).view!;
    const node = view.elements.find((element) => element.id === '1.1')!;
    await edit({ kind: 'move', id: '1.1', x: node.x, y: node.y + 30 });
    await until('the drag to be stored', () => onDisk(registration).includes('layout:'));
    const dragged = onDisk(registration);

    assert.deepStrictEqual(await edit({ kind: 'action', action: 'abm.arrange' }), { result: 'applied' });
    await until('the layout to be forgotten', () => !onDisk(registration).includes('layout:'));
    await vscode.commands.executeCommand('etalii.adp.undoLayout');
    await until('the layout to be back', () => onDisk(registration) === dragged);
    assert.strictEqual(await yOf('1.1'), node.y + 30);
  });

  test('keeps its turn among edits of the Markdown: the last thing done is the first undone', async () => {
    const { document, original, registration, before } = await openModel('pull-request-reviewer');
    const node = (await drawn()).view!.elements.find((element) => element.id === '1.1')!;

    // First an edit of the Markdown, then a row drag, then another edit of the Markdown.
    await edit({ kind: 'rename', id: '1', text: 'First edit' });
    await edit({ kind: 'move', id: '1.1', x: node.x, y: node.y + 40 });
    await until('the drag to be stored', () => onDisk(registration).includes('layout:'));
    const dragged = onDisk(registration);
    await edit({ kind: 'rename', id: '1', text: 'Second edit' });
    await until('the second edit', () => document.getText().includes('Second edit'));

    // The second edit is the document's own to undo; the drag is not next yet.
    assert.deepStrictEqual(await next(), { undo: false, redo: false });
    await vscode.commands.executeCommand('undo');
    await until('the second edit to be undone', () => document.getText().includes('First edit'));
    assert.strictEqual(onDisk(registration), dragged);

    // Now the drag is next, and after it the first edit.
    assert.deepStrictEqual(await next(), { undo: true, redo: false });
    await vscode.commands.executeCommand('etalii.adp.undoLayout');
    await until('the drag to be undone', () => onDisk(registration) === before);
    assert.ok(document.getText().includes('First edit'));
    assert.deepStrictEqual(await next(), { undo: false, redo: true });
    await vscode.commands.executeCommand('undo');
    await until('the first edit to be undone', () => document.getText() === original);

    // Redo runs the other way: the first edit, then the drag, then the second edit.
    assert.deepStrictEqual(await next(), { undo: false, redo: false });
    await vscode.commands.executeCommand('redo');
    await until('the first edit to be redone', () => document.getText().includes('First edit'));
    assert.deepStrictEqual(await next(), { undo: false, redo: true });
    await vscode.commands.executeCommand('etalii.adp.redoLayout');
    await until('the drag to be redone', () => onDisk(registration) === dragged);
    await vscode.commands.executeCommand('redo');
    await until('the second edit to be redone', () => document.getText().includes('Second edit'));
  });

  test('a new edit of the Markdown ends what could be redone', async () => {
    const { document, registration, before } = await openModel('research-assistant');
    const node = (await drawn()).view!.elements.find((element) => element.id === '1.1')!;
    await edit({ kind: 'move', id: '1.1', x: node.x, y: node.y + 40 });
    await until('the drag to be stored', () => onDisk(registration).includes('layout:'));
    await vscode.commands.executeCommand('etalii.adp.undoLayout');
    await until('the drag to be undone', () => onDisk(registration) === before);
    assert.deepStrictEqual(await next(), { undo: false, redo: true });
    await edit({ kind: 'rename', id: '1', text: 'Something new' });
    await until('the edit', () => document.getText().includes('Something new'));
    assert.deepStrictEqual(await next(), { undo: false, redo: false });
  });
});
