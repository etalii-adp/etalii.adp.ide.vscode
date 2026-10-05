import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { closeAll, drawn, example, state, until } from './support';

const viewType = 'etalii.adp.etalii.agent-behavior-modelling';
const agent = (name: string, extension: string): vscode.Uri => example('agent-behavior-modelling', name, `${name}.${extension}`);
const edit = (request: unknown): Thenable<{ result: string; sentence?: string } | undefined> => vscode.commands.executeCommand('etalii.adp.test.edit', request);
const onDisk = (uri: vscode.Uri): string => fs.readFileSync(uri.fsPath, 'utf8');

async function openModel(name: string): Promise<{ uri: vscode.Uri; document: vscode.TextDocument; original: string }> {
  const uri = agent(name, 'md');
  await vscode.commands.executeCommand('etalii.adp.openAs.etalii.agent-behavior-modelling', uri);
  await drawn();
  const document = await vscode.workspace.openTextDocument(uri);
  return { uri, document, original: document.getText() };
}

suite('A behavior model in Visual Studio Code', () => {
  teardown(closeAll);

  test('a Markdown file opens as text, as before the plug-in was installed', async () => {
    await vscode.commands.executeCommand('vscode.open', agent('research-assistant', 'md'));
    const tab = await until('the tab', () => vscode.window.tabGroups.activeTabGroup.activeTab);
    assert.ok(tab.input instanceof vscode.TabInputText, 'Markdown opens in the text editor by default');
  });

  test('opened as a behavior model, its tree is drawn with the rows where its registration keeps them', async () => {
    await openModel('research-assistant');
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab!;
    assert.ok(tab.input instanceof vscode.TabInputCustom);
    assert.strictEqual(tab.input.viewType, viewType);
    const current = await drawn();
    assert.strictEqual(current.origin, 'etalii/agent-behavior-modelling');
    assert.strictEqual(current.view!.elements.length, 13);
    // The example's registration lowers the second row to 160.
    assert.strictEqual(current.view!.elements.find((element) => element.id === '1.2')?.y, 160);
    assert.strictEqual(tab.isDirty, false);
  });

  test('an edit rewrites the list line in the Markdown, and one undo takes it back', async () => {
    const { document, original } = await openModel('customer-support');
    assert.deepStrictEqual(await edit({ kind: 'rename', id: '1', text: 'Help the customer today' }), { result: 'applied' });
    const changed = document.getText().split(/\r?\n/).filter((line, index) => line !== original.split(/\r?\n/)[index]);
    assert.strictEqual(changed.length, 1);
    assert.ok(changed[0].endsWith(':** Help the customer today'));
    await vscode.commands.executeCommand('undo');
    await until('the undo', () => document.getText() === original);
  });

  test('a rule finding is listed in the Problems panel while the file is open as a model, and not after', async () => {
    const { uri, document, original } = await openModel('customer-support');
    // A Check with a child: a leaf holds no children.
    const leaf = (await drawn()).view!.elements.find((element) => element.type === 'check')!;
    const line = original.split(/\r?\n/).findIndex((text) => text.includes(`:** ${leaf.label}`));
    const indent = /^\s*/.exec(document.lineAt(line).text)![0];
    const change = new vscode.WorkspaceEdit();
    change.insert(uri, new vscode.Position(line + 1, 0), `${indent}  - **Do:** Something under a check\n`);
    assert.ok(await vscode.workspace.applyEdit(change));
    const found = await until('the finding', () => vscode.languages.getDiagnostics(uri).find((diagnostic) => diagnostic.code === 'abm.leaf-with-children'));
    assert.strictEqual(found.severity, vscode.DiagnosticSeverity.Error);
    assert.strictEqual(found.range.start.line, line);

    await closeAll();
    await until('the findings to go with the diagram', () => vscode.languages.getDiagnostics(uri).length === 0);
  });

  test('dragging a row is kept in the registration beside the Markdown, which is left untouched', async () => {
    const { uri, document, original } = await openModel('bug-fixer');
    const registration = agent('bug-fixer', 'adp');
    const node = (await drawn()).view!.elements.find((element) => element.id === '1.1')!;
    assert.deepStrictEqual(await edit({ kind: 'move', id: '1.1', x: node.x, y: node.y + 40 }), { result: 'applied' });

    assert.strictEqual(document.getText(), original);
    assert.strictEqual(document.isDirty, false);
    await until('the registration to be written', () => onDisk(registration).includes('layout:'));
    assert.ok(onDisk(registration).startsWith('etalii/agent-behavior-modelling\nlayout:\n  1.1: '));
    const after = await until('the row to be drawn lower', async () => {
      const current = await state();
      return current?.view?.elements.find((element) => element.id === '1.1')?.y === node.y + 40 ? current : undefined;
    });
    assert.strictEqual(after.view!.elements.find((element) => element.id === '1.2')?.y, node.y + 40);
    assert.strictEqual(onDisk(uri), original.replace(/\r?\n/g, original.includes('\r\n') ? '\r\n' : '\n'));
  });

  test('Arrange Diagram forgets the dragged positions and says so when there are none', async () => {
    await openModel('research-assistant');
    const registration = agent('research-assistant', 'adp');
    assert.deepStrictEqual(await edit({ kind: 'action', action: 'abm.arrange' }), { result: 'applied' });
    await until('the layout block to go', () => !onDisk(registration).includes('layout:'));
    assert.strictEqual(onDisk(registration), 'etalii/agent-behavior-modelling\n');
    assert.deepStrictEqual(await edit({ kind: 'action', action: 'abm.arrange' }), { result: 'refused', sentence: 'This behavior model is already arranged.' });
  });

  test('a drag past a sibling reorders the Markdown and moves the stored positions with it, as one edit', async () => {
    const { document, original } = await openModel('pull-request-reviewer');
    const registration = agent('pull-request-reviewer', 'adp');
    const before = onDisk(registration);
    const view = (await drawn()).view!;
    const first = view.elements.find((element) => element.id === '1.1')!;
    const second = view.elements.find((element) => element.id === '1.2')!;
    assert.deepStrictEqual(await edit({ kind: 'move', id: '1.1', x: second.x + 10, y: first.y + 30 }), { result: 'applied' });
    assert.notStrictEqual(document.getText(), original);
    const reordered = await until('the reordered tree', async () => {
      const current = await state();
      return current?.view?.elements.find((element) => element.id === '1.1')?.label === second.label ? current : undefined;
    });
    assert.strictEqual(reordered.view!.elements.find((element) => element.id === '1.2')?.label, first.label);

    // One undo puts both files back: Visual Studio Code undoes an edit across two files as one step.
    await vscode.commands.executeCommand('undo');
    await until('the Markdown to be put back', () => document.getText() === original);
    const registrationDocument = await vscode.workspace.openTextDocument(registration);
    await until('the registration to be put back', () => registrationDocument.getText() === before);
  });

  test('opening a registration opens the diagram it registers', async () => {
    await vscode.commands.executeCommand('vscode.open', agent('customer-support', 'adp'));
    const tab = await until('the diagram tab', () => {
      const active = vscode.window.tabGroups.activeTabGroup.activeTab;
      return active?.input instanceof vscode.TabInputCustom && active.input.viewType === viewType ? active : undefined;
    });
    assert.ok((tab.input as vscode.TabInputCustom).uri.path.endsWith('/customer-support.md'));
    assert.strictEqual((await drawn()).origin, 'etalii/agent-behavior-modelling');
  });
});
