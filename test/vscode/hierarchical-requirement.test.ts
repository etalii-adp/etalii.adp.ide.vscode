import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { closeAll, drawn, example, state, until, type HierarchyNode } from './support';

// The Hierarchical Requirement Designer in a real Visual Studio Code. The designer has no code of
// its own in the extension: it is the tool type read from `definitions/hierarchical-requirement/`,
// shown on the page of boxes. Its files share their extension with every other Markdown file, so a
// file opens as text first and is reopened in the designer when its first line names it; every
// other Markdown file stays text. A fold is kept in the registration beside the file, outside the
// history; every other edit is one undo step, of the Markdown and, when it writes it, the
// registration with it.

const viewType = 'etalii.adp.etalii.hierarchical-requirement';

const edit = (request: unknown): Thenable<{ result: string; sentence?: string } | undefined> => vscode.commands.executeCommand('etalii.adp.test.edit', request);
const next = (): Thenable<{ undo: boolean; redo: boolean }> => vscode.commands.executeCommand('etalii.adp.test.layoutSteps');
const folder = (): string => example('hierarchical-requirement-test').fsPath;
const tabsOn = (uri: vscode.Uri): vscode.Tab[] => vscode.window.tabGroups.all.flatMap((group) => group.tabs)
  .filter((tab) => (tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputCustom) && tab.input.uri.toString() === uri.toString());
const inDesigner = (uri: vscode.Uri): boolean => tabsOn(uri).some((tab) => tab.input instanceof vscode.TabInputCustom && tab.input.viewType === viewType);
/** Long enough for a claimed file to have been reopened: a tab that is still text after it stays text. */
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1500));
const all = (nodes: readonly HierarchyNode[]): HierarchyNode[] => nodes.flatMap((node) => [node, ...all(node.entries), ...all(node.levels)]);
const nodeOf = async (id: string): Promise<HierarchyNode | undefined> => all((await state())?.hierarchy?.roots ?? []).find((node) => node.id === id);
/** The registration as Visual Studio Code has it, saved or not. */
const registrationText = async (uri: vscode.Uri): Promise<string> => (await vscode.workspace.openTextDocument(uri)).getText();

let copies = 0;

// Each test works on a copy of the example, with its registration, in a folder of its own, so the
// registration's `body:` still names it and what one test writes is nobody else's.
function copied(): { uri: vscode.Uri; registration: vscode.Uri } {
  copies += 1;
  const uri = example('hierarchical-requirement-test', `${copies}`, 'web-shop.md');
  const registration = example('hierarchical-requirement-test', `${copies}`, 'web-shop.adp');
  fs.mkdirSync(example('hierarchical-requirement-test', `${copies}`).fsPath, { recursive: true });
  fs.copyFileSync(example('hierarchical-requirement', 'web-shop.md').fsPath, uri.fsPath);
  fs.copyFileSync(example('hierarchical-requirement', 'web-shop.adp').fsPath, registration.fsPath);
  return { uri, registration };
}

async function open(): Promise<{ uri: vscode.Uri; registration: vscode.Uri; document: vscode.TextDocument; original: string; bytes: Buffer; registrationBytes: Buffer }> {
  const { uri, registration } = copied();
  const bytes = fs.readFileSync(uri.fsPath);
  const registrationBytes = fs.readFileSync(registration.fsPath);
  await vscode.commands.executeCommand('vscode.open', uri);
  await until('the designer\'s tab', () => inDesigner(uri));
  await drawn();
  const document = await vscode.workspace.openTextDocument(uri);
  return { uri, registration, document, original: document.getText(), bytes, registrationBytes };
}

suite('The Hierarchical Requirement Designer in Visual Studio Code', () => {
  suiteSetup(async () => {
    fs.mkdirSync(folder(), { recursive: true });
    await vscode.extensions.getExtension('etalii.adp')?.activate();
  });
  // The editor may still hold a file of the folder for a moment after its tab is closed.
  suiteTeardown(() => fs.rmSync(folder(), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  teardown(closeAll);

  test('the web-shop example opens in the designer, as an outline of its levels and entries, is not modified by being opened, and its finding is in Problems', async () => {
    const uri = example('hierarchical-requirement', 'web-shop.md');
    const bytes = fs.readFileSync(uri.fsPath);
    await vscode.commands.executeCommand('vscode.open', uri);
    await until('the designer\'s tab', () => inDesigner(uri));
    assert.strictEqual(tabsOn(uri).length, 1, 'the tool took the place of the text tab');

    const current = await drawn();
    assert.strictEqual(current.origin, 'etalii/hierarchical-requirement');
    assert.strictEqual(current.kind, 'designer');
    assert.ok(current.hierarchy, 'the designer shows a page of boxes');
    assert.strictEqual(current.table, undefined);
    assert.strictEqual(current.hierarchy.name, 'web-shop');
    assert.strictEqual(current.hierarchy.readOnly, false);
    assert.deepStrictEqual(current.hierarchy.roots.map((node) => node.id), ['ITEM-0001', 'ITEM-0004', 'ITEM-0006']);
    assert.strictEqual(current.hierarchy.roots[0].title, 'Storefront');
    assert.strictEqual((await nodeOf('ITEM-0003'))?.collapsed, true, 'the registration\'s fold is drawn');

    assert.strictEqual(tabsOn(uri)[0].isDirty, false);
    assert.ok(fs.readFileSync(uri.fsPath).equals(bytes));
    const diagnostics = await until('the finding', () => {
      const found = vscode.languages.getDiagnostics(uri);
      return found.length > 0 ? found : undefined;
    });
    assert.deepStrictEqual(diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.range.start.line, diagnostic.severity]), [['std.missingId', 43, vscode.DiagnosticSeverity.Warning]]);
  });

  test('a Markdown file whose first line does not name the designer opens as text, and Agent Behavior Modelling is still offered for it', async () => {
    const uri = example('hierarchical-requirement-test', 'notes.md');
    fs.writeFileSync(uri.fsPath, '# Notes\n\n- one\n- two\n');
    await vscode.commands.executeCommand('vscode.open', uri);
    await until('the text editor', () => vscode.window.activeTextEditor?.document.uri.toString() === uri.toString());
    await settled();
    assert.strictEqual(inDesigner(uri), false);
    assert.ok(tabsOn(uri).every((tab) => tab.input instanceof vscode.TabInputText));
    assert.deepStrictEqual(vscode.languages.getDiagnostics(uri), []);

    const editors = (vscode.extensions.getExtension('etalii.adp')?.packageJSON as { contributes: { customEditors: { viewType: string; priority: string; selector: { filenamePattern: string }[] }[] } }).contributes.customEditors;
    for (const offered of [viewType, 'etalii.adp.etalii.agent-behavior-modelling']) {
      const entry = editors.find((candidate) => candidate.viewType === offered);
      assert.deepStrictEqual([entry?.priority, entry?.selector], ['option', [{ filenamePattern: '*.md' }]], `${offered} is offered under "Open With" for Markdown`);
    }
  });

  test('"Open as Text" opens the text editor on a requirement document, and it stays text for the session', async () => {
    const { uri } = await open();
    await vscode.commands.executeCommand('etalii.adp.openAsText');
    await until('the text editor', () => vscode.window.visibleTextEditors.find((candidate) => candidate.document.uri.toString() === uri.toString()));
    await settled();
    assert.ok(tabsOn(uri).some((tab) => tab.input instanceof vscode.TabInputText), 'the text tab was not reopened in the designer');
  });

  test('a fold writes only the registration, at once, and is no undo step', async () => {
    const { uri, registration, document, original, bytes } = await open();
    const version = document.version;
    assert.strictEqual((await nodeOf('REQ-0001'))?.collapsed, false);
    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'toggleCollapsed', on: ['REQ-0001'] }), { result: 'applied' });

    await until('the fold to be drawn', async () => (await nodeOf('REQ-0001'))?.collapsed === true);
    await until('the registration to be saved', () => /^ {2}REQ-0001: yes\r?$/m.test(fs.readFileSync(registration.fsPath, 'utf8')));
    assert.strictEqual(document.getText(), original);
    assert.strictEqual(document.version, version, 'the Markdown was not edited');
    assert.strictEqual(document.isDirty, false);
    assert.ok(fs.readFileSync(uri.fsPath).equals(bytes));
    assert.strictEqual((await vscode.workspace.openTextDocument(registration)).isDirty, false, 'the registration is saved at once');
    assert.deepStrictEqual(await next(), { undo: false, redo: false }, 'a fold is no step of the history');
  });

  test('a change of a title edits the Markdown as one undo step, and Undo gives back its bytes', async () => {
    const { uri, registration, document, original, bytes, registrationBytes } = await open();
    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'setTitle', on: ['REQ-0001'], args: { title: 'A customer finds a product.' } }), { result: 'applied' });
    await until('the edit', () => document.getText().includes('REQ-0001 A customer finds a product. #search'));
    const changed = document.getText();
    // The first edit that writes the file also numbers its placeholder, in the same step.
    assert.ok(changed.includes('+ REQ-0013 A guest'));
    assert.strictEqual(document.isDirty, true);
    await until('the outline to follow', async () => (await nodeOf('REQ-0001'))?.title === 'A customer finds a product.');

    await vscode.commands.executeCommand('undo');
    await until('the undo', () => document.getText() === original);
    await until('the Markdown to be unmodified', () => !document.isDirty);
    await document.save();
    assert.ok(fs.readFileSync(uri.fsPath).equals(bytes), 'Undo gives back the bytes');
    assert.ok(fs.readFileSync(registration.fsPath).equals(registrationBytes), 'the registration was not written');

    await vscode.commands.executeCommand('redo');
    await until('the redo', () => document.getText() === changed);
  });

  test('a rename of a tag edits the Markdown and the registration, and one Undo gives back both, and Redo writes both again', async () => {
    const { uri, registration, document, original, bytes, registrationBytes } = await open();
    const before = await registrationText(registration);
    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'renameTag', on: ['tag/security'], args: { name: 'safety' } }), { result: 'applied' });
    await until('the Markdown to be edited', () => document.getText().includes('#safety'));
    const changed = document.getText();
    assert.ok(!changed.includes('#security'));
    await until('the registration to be written', async () => (await registrationText(registration)).includes('  safety: red'));
    const renamed = await registrationText(registration);
    assert.strictEqual(renamed, before.replace('  security: red', '  safety: red'));

    await vscode.commands.executeCommand('undo');
    await until('the Markdown to be given back', () => document.getText() === original);
    await until('the registration to be given back', async () => (await registrationText(registration)) === before);
    await until('both to be unmodified', async () => !document.isDirty && !(await vscode.workspace.openTextDocument(registration)).isDirty);
    assert.ok(fs.readFileSync(uri.fsPath).equals(bytes), 'the Markdown\'s bytes are back');
    assert.ok(fs.readFileSync(registration.fsPath).equals(registrationBytes), 'the registration\'s bytes are back');
    assert.deepStrictEqual(await next(), { undo: false, redo: false });

    await vscode.commands.executeCommand('redo');
    await until('the Markdown to be edited again', () => document.getText() === changed);
    await until('the registration to be written again', async () => (await registrationText(registration)) === renamed);
  });

  test('a fold made after a step is kept when the step is undone and redone, and two quick Undos and Redos keep it too', async () => {
    const { registration, document, original } = await open();
    const before = await registrationText(registration);
    /** The registration with REQ-0001 folded, in the ordinal order of the collapsed block. */
    const eol = before.includes('\r\n') ? '\r\n' : '\n';
    const folded = (text: string): string => text.replace(`  ITEM-0003: yes${eol}`, `  ITEM-0003: yes${eol}  REQ-0001: yes${eol}`);
    assert.notStrictEqual(folded(before), before);

    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'renameTag', on: ['tag/security'], args: { name: 'safety' } }), { result: 'applied' });
    await until('the rename', async () => document.getText().includes('#safety') && (await registrationText(registration)).includes('  safety: red'));
    const renamed = await registrationText(registration);
    const renamedText = document.getText();
    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'toggleCollapsed', on: ['REQ-0001'] }), { result: 'applied' });
    await until('the fold to be written', async () => (await registrationText(registration)) === folded(renamed));

    await vscode.commands.executeCommand('undo');
    await until('the Markdown to be given back', () => document.getText() === original);
    await until('the registration before the rename, with the fold', async () => (await registrationText(registration)) === folded(before));
    assert.strictEqual((await nodeOf('REQ-0001'))?.collapsed, true);
    await vscode.commands.executeCommand('redo');
    await until('the Markdown to be edited again', () => document.getText() === renamedText);
    await until('the registration after the rename, with the fold', async () => (await registrationText(registration)) === folded(renamed));

    // A second step that writes both files, then two Undos and two Redos, each pair without waiting between them.
    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'addTag', on: ['REQ-0002'], args: { name: 'brand-new' } }), { result: 'applied' });
    await until('the tag', async () => document.getText().includes('#brand-new') && (await registrationText(registration)).includes('  brand-new: default'));
    const tagged = await registrationText(registration);
    const taggedText = document.getText();
    assert.strictEqual(tagged, folded(renamed).replace(`  privacy: pink${eol}`, `  privacy: pink${eol}  brand-new: default${eol}`));
    await Promise.all([vscode.commands.executeCommand('undo'), vscode.commands.executeCommand('undo')]);
    await until('both steps to be undone', () => document.getText() === original);
    await until('the first registration, with the fold', async () => (await registrationText(registration)) === folded(before));
    await Promise.all([vscode.commands.executeCommand('redo'), vscode.commands.executeCommand('redo')]);
    await until('both steps to be redone', () => document.getText() === taggedText);
    await until('the last registration, with the fold', async () => (await registrationText(registration)) === tagged);
  });
});
