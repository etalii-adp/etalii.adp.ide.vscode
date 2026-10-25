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

const edit = (request: unknown, seq?: number): Thenable<{ result: string; sentence?: string } | undefined> => vscode.commands.executeCommand('etalii.adp.test.edit', request, seq);
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

  test('two folds asked for at once, as a reveal asks for the levels above an entry, are both written', async () => {
    const { registration, document, original } = await open();
    const fold = (id: string): Thenable<unknown> => edit({ kind: 'operation', operation: 'toggleCollapsed', on: [id] });
    // ITEM-0003 and REQ-0002 are collapsed: both expanded at once.
    assert.deepStrictEqual(await Promise.all([fold('ITEM-0003'), fold('REQ-0002')]), [{ result: 'applied' }, { result: 'applied' }]);
    await until('both to be expanded in the registration', async () => !/ITEM-0003: yes|REQ-0002: yes/.test(await registrationText(registration)));
    assert.strictEqual((await nodeOf('ITEM-0003'))?.collapsed, false);
    assert.strictEqual((await nodeOf('REQ-0002'))?.collapsed, false);
    // And two collapsed at once.
    assert.deepStrictEqual(await Promise.all([fold('REQ-0001'), fold('REQ-0003')]), [{ result: 'applied' }, { result: 'applied' }]);
    await until('both to be collapsed in the registration', async () => {
      const text = await registrationText(registration);
      return /^ {2}REQ-0001: yes\r?$/m.test(text) && /^ {2}REQ-0003: yes\r?$/m.test(text);
    });
    assert.strictEqual(fs.readFileSync(registration.fsPath, 'utf8'), await registrationText(registration), 'the registration is saved');
    assert.strictEqual(document.getText(), original);
    assert.strictEqual((await nodeOf('REQ-0001'))?.collapsed, true);
    assert.strictEqual((await nodeOf('REQ-0003'))?.collapsed, true);
    assert.deepStrictEqual(await next(), { undo: false, redo: false });
  });

  test('a question the page asks is answered no when another comes and when the designer closes, and a change from outside meanwhile is told as such', async () => {
    const { uri, document, original } = await open();
    const remove = { kind: 'operation', operation: 'deleteEntry', on: ['ITEM-0002'] };
    const first = edit(remove, 101);
    // The question is open: a change made meanwhile was made outside the designer.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const change = new vscode.WorkspaceEdit();
    change.insert(uri, document.lineAt(document.lineCount - 1).range.end, '\n');
    assert.ok(await vscode.workspace.applyEdit(change));
    await until('the page to follow the change from outside', async () => (await state())?.cause === 'outside');

    // The second question answers the first no; closing the designer answers the second.
    const second = edit(remove, 102);
    assert.deepStrictEqual(await first, { result: 'cancelled' });
    await closeAll();
    assert.deepStrictEqual(await second, { result: 'cancelled' });
    assert.strictEqual((await vscode.workspace.openTextDocument(uri)).getText().includes('ITEM-0002 Checkout'), true, 'nothing was deleted');
    assert.notStrictEqual(original, undefined);
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

  test('a column\'s edge let go writes its width in the registration\'s widths block as one undo step, and Undo removes it', async () => {
    const { uri, registration, document, original, bytes, registrationBytes } = await open();
    const before = await registrationText(registration);
    const nl = before.includes('\r\n') ? '\r\n' : '\n';
    // What the page asks when the first column's edge is let go 60 pixels to the right of the page's own width.
    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'addColumnWidth', args: { level: '1', width: 300 } }), { result: 'applied' });
    const widened = `${before}widths:${nl}  1: 300${nl}`;
    await until('the width to be written', async () => (await registrationText(registration)) === widened);
    await until('the page to keep it', async () => (await state())?.hierarchy?.widths.some((column) => column.level === '1' && column.width === 300) === true);
    assert.strictEqual(fs.readFileSync(registration.fsPath, 'utf8'), widened, 'the registration is saved at once');
    assert.strictEqual(document.getText(), original, 'the Markdown is not edited');
    assert.deepStrictEqual(await next(), { undo: true, redo: false }, 'the width is one step of the history');

    // Ctrl+Z in the designer, while this step is next in line.
    await vscode.commands.executeCommand('etalii.adp.undoLayout');
    await until('the width to be removed', async () => (await registrationText(registration)) === before);
    await until('the registration to be saved', () => fs.readFileSync(registration.fsPath).equals(registrationBytes));
    await until('the page to give the column its own width again', async () => (await state())?.hierarchy?.widths.length === 0);
    assert.deepStrictEqual(await next(), { undo: false, redo: true });
    assert.ok(fs.readFileSync(uri.fsPath).equals(bytes), 'the Markdown\'s bytes are as they were');

    await vscode.commands.executeCommand('etalii.adp.redoLayout');
    await until('the width to be written again', async () => (await registrationText(registration)) === widened);
  });

  test('two quick widths of a new column: asked together the second is not made; asked as the page does, one after the answer of the other, both are', async () => {
    const { registration } = await open();
    const before = await registrationText(registration);
    const nl = before.includes('\r\n') ? '\r\n' : '\n';
    // Two additions of the same column on their way at once: the second finds it already kept.
    const together = await Promise.all([
      edit({ kind: 'operation', operation: 'addColumnWidth', args: { level: '1', width: 256 } }),
      edit({ kind: 'operation', operation: 'addColumnWidth', args: { level: '1', width: 272 } }),
    ]);
    assert.deepStrictEqual(together.map((outcome) => outcome?.result === 'applied'), [true, false], JSON.stringify(together));
    await until('the first width to be written', async () => (await registrationText(registration)) === `${before}widths:${nl}  1: 256${nl}`);

    // What the page sends instead: the second press waits for the first's answer, and is then a change of the width kept.
    await until('the page to keep it', async () => (await state())?.hierarchy?.widths.some((column) => column.level === '1' && column.width === 256) === true);
    const column = (await state())?.hierarchy?.widths.find((kept) => kept.level === '1')?.id;
    assert.ok(column);
    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'setColumnWidth', on: [column], args: { width: 272 } }), { result: 'applied' });
    await until('the last width to be written', async () => (await registrationText(registration)) === `${before}widths:${nl}  1: 272${nl}`);
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

  test('an add, then its title typed, is one undo step each: Undo takes back the title, then the entry', async () => {
    const { document, original } = await open();
    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'addRequirement', on: ['ITEM-0006'] }), { result: 'applied' });
    await until('the entry', () => /^ {2}- REQ-0014 New requirement\r?$/m.test(document.getText()));
    const added = document.getText();
    await until('the page to follow', async () => (await nodeOf('REQ-0014'))?.title === 'New requirement');
    assert.strictEqual((await state())?.cause, 'edit', 'the view follows the designer\'s own edit');

    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'setTitle', on: ['REQ-0014'], args: { title: 'Orders are archived after a year.' } }), { result: 'applied' });
    await until('the title', () => /^ {2}- REQ-0014 Orders are archived after a year\.\r?$/m.test(document.getText()));

    await vscode.commands.executeCommand('undo');
    await until('the title to be taken back', () => document.getText() === added);
    await vscode.commands.executeCommand('undo');
    await until('the entry to be taken back', () => document.getText() === original);
  });

  test('a move of an item into another re-indents it with what it holds, as one undo step', async () => {
    const { document, original } = await open();
    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'moveItem', on: ['ITEM-0005'], args: { item: 'ITEM-0002' } }), { result: 'applied' });
    await until('the move', () => /^ {4}[-*+] ITEM-0005 Mail\r?\n {6}[-*+] REQ-0008 Mail goes through one provider/m.test(document.getText()));
    assert.ok(!/^ {2}- ITEM-0005 Mail/m.test(document.getText()), 'it left its place under ITEM-0004');
    await until('the page to follow', async () => (await nodeOf('ITEM-0002'))?.levels.some((level) => level.id === 'ITEM-0005') === true);

    await vscode.commands.executeCommand('undo');
    await until('the move to be taken back', () => document.getText() === original);
  });

  test('a note added from its box is written as one step, and resolving it changes one byte', async () => {
    const { document } = await open();
    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'addAssessment', on: ['REQ-0001'], args: { kind: 'remark', text: 'Which search engine?' } }), { result: 'applied' });
    await until('the note', () => /^- \[ \] Remark REQ-0001: Which search engine\?\r?$/m.test(document.getText()));
    const note = await until('the page to list it', async () => (await state())?.hierarchy?.notes.find((candidate) => candidate.aboutId === 'REQ-0001'));
    assert.strictEqual(note.resolved, false);
    const before = document.getText();
    assert.deepStrictEqual(await edit({ kind: 'operation', operation: 'resolveAssessment', on: [note.id] }), { result: 'applied' });
    await until('the note to be resolved', () => document.getText() !== before);
    const after = document.getText();
    assert.strictEqual(after.length, before.length);
    assert.deepStrictEqual([...after].flatMap((character, at) => (character === before[at] ? [] : [`${before[at]}>${character}`])), [' >x'], 'one byte changes');
    await until('the page to follow', async () => (await state())?.hierarchy?.notes.find((candidate) => candidate.id === note.id)?.resolved === true);
  });

  test('a tag added from the page by the gesture the view names writes the Markdown and the tag list', async () => {
    const { document, registration } = await open();
    const add = (await state())?.hierarchy?.lists.find((list) => list.label === 'tags')?.gestures.add;
    assert.ok(add, 'the page offers to add a tag');
    assert.deepStrictEqual(await edit({ kind: 'operation', operation: add.operation, on: ['REQ-0003'], args: { [add.params.value]: 'checkout' } }), { result: 'applied' });
    await until('the tag in the Markdown', () => /REQ-0003 A customer pays by card, iDEAL or PayPal\. #checkout category:functional state:accepted/.test(document.getText()));
    await until('the tag in the list', async () => (await registrationText(registration)).includes('  checkout: default'));
  });

  test('a filter typed narrows the page and writes nothing', async () => {
    const { uri, registration, document, bytes, registrationBytes } = await open();
    const version = document.version;
    await vscode.commands.executeCommand('etalii.adp.test.viewOptions', { query: '#security' });
    const narrowed = await until('the page to be narrowed', async () => {
      const shown = (await state())?.hierarchy;
      return shown?.applied?.query === '#security' ? shown : undefined;
    });
    assert.deepStrictEqual(narrowed.roots.map((node) => [node.id, node.entries.map((entry) => entry.id)]), [['ITEM-0004', ['REQ-0006', 'REQ-0007']]]);
    assert.strictEqual(narrowed.applied?.shown, 3);
    assert.strictEqual(document.version, version);
    assert.strictEqual(document.isDirty, false);
    assert.ok(fs.readFileSync(uri.fsPath).equals(bytes));
    assert.ok(fs.readFileSync(registration.fsPath).equals(registrationBytes));
    assert.deepStrictEqual(await next(), { undo: false, redo: false });
  });

  test('a Requirement from ADP Toolbox dropped onto an item is written there, as one undo step', async () => {
    const { document, original } = await open();
    const toolbox = await vscode.commands.executeCommand<{ entries: { id: string }[] }>('etalii.adp.test.toolbox');
    assert.deepStrictEqual(toolbox.entries.map((entry) => entry.id), ['Item', 'Requirement']);
    assert.deepStrictEqual(await edit({ kind: 'drop', entry: 'Requirement', parent: 'ITEM-0006' }), { result: 'applied' });
    await until('the requirement', () => /REQ-0010 Personal data is removed on request within 30 days\. #legal #privacy category:non-functional\r?\n {2}- REQ-0014 New requirement\r?$/m.test(document.getText()));
    await until('the page to show it in the item', async () => (await nodeOf('ITEM-0006'))?.entries.some((entry) => entry.id === 'REQ-0014') === true);
    await vscode.commands.executeCommand('undo');
    await until('the drop to be taken back', () => document.getText() === original);
  });

  test('ADP Properties shows the selected requirement, and a title typed there edits the Markdown', async () => {
    const { document } = await open();
    await vscode.commands.executeCommand('etalii.adp.test.select', ['REQ-0001']);
    const rows = await until('the rows', async () => {
      const fields = (await state())?.fields ?? [];
      return fields.length > 0 ? fields : undefined;
    });
    assert.deepStrictEqual(rows.map((row) => [row.id, row.value]), [
      ['id', 'REQ-0001'], ['title', 'A customer finds a product by its name or its description.'], ['description', ''], ['tags', 'search'], ['category', 'functional'], ['state', 'accepted'],
    ]);
    assert.deepStrictEqual(await edit({ kind: 'setField', id: 'REQ-0001', field: 'title', value: 'A customer finds a product.' }), { result: 'applied' });
    await until('the title in the Markdown', () => /^ {2}[-*+] REQ-0001 A customer finds a product\. #search category:functional state:accepted\r?$/m.test(document.getText()));
    await until('the row to follow', async () => (await state())?.fields.find((row) => row.id === 'title')?.value === 'A customer finds a product.');
  });

  test('a change of the document made outside the designer is told to the page as such', async () => {
    const { uri, document } = await open();
    const change = new vscode.WorkspaceEdit();
    change.insert(uri, document.lineAt(document.lineCount - 1).range.end, '\n');
    assert.ok(await vscode.workspace.applyEdit(change));
    await until('the page to follow the change from outside', async () => (await state())?.cause === 'outside');
  });
});
