import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { closeAll, drawn, example, until } from './support';

// A mind map in a real Visual Studio Code (etalii.adp spec 027, User Story 1). The mind map has no
// code of its own in the extension: it is the tool type read from `definitions/mindmap/`, so what
// its canvas is sent is a scene.

const viewType = 'etalii.adp.freeplane.mindmap';
const suiteName = 'A mind map in Visual Studio Code';
const unclaimedName = 'a .mm file that is no mind map opens as text, with nothing reported';
// Scenario 5 cannot hold while the mind map's binding has no marker: every `.mm` file is claimed.
const unclaimedReason = 'the binding of the mind map has no marker yet: etalii-adp/etalii.adp issue 140';

// Two nodes of the example, by the ids its file gives them.
const root = 'ID_5eb2r180uk2p4ys1q0tkiwil6';
const sceneGraph = 'ID_1guw8w5hp34usdnp25phle3s4';
// A node with nodes under it, and the first of those.
const layout = 'ID_cfszit7hnta23frsv88kmqg1z';
const measurePass = 'ID_56kq0gezao11kk77h11qmd35j';

const duplicateId = [
  '<map version="freeplane 1.11.5">',
  '<node TEXT="Root" ID="ID_root">',
  '<node TEXT="First" ID="ID_same"/>',
  '<node TEXT="Second" ID="ID_same"/>',
  '</node>',
  '</map>',
].join('\n');

const edit = (request: unknown): Thenable<{ result: string; sentence?: string } | undefined> => vscode.commands.executeCommand('etalii.adp.test.edit', request);
const folder = (): string => example('mindmap-test').fsPath;
const nodesIn = (text: string): number => text.split('<node ').length - 1;

let copies = 0;

// Each test works on a file of its own, so the copied examples stay as they were.
function written(text: string): vscode.Uri {
  copies += 1;
  const uri = example('mindmap-test', `map-${copies}.mm`);
  fs.writeFileSync(uri.fsPath, text);
  return uri;
}

async function open(text = fs.readFileSync(example('mindmap', 'example 1', 'mindmap.mm').fsPath, 'utf8')): Promise<{ uri: vscode.Uri; document: vscode.TextDocument; original: string }> {
  const uri = written(text);
  await vscode.commands.executeCommand('vscode.open', uri);
  await drawn();
  const document = await vscode.workspace.openTextDocument(uri);
  return { uri, document, original: document.getText() };
}

suite(suiteName, () => {
  suiteSetup(() => {
    fs.mkdirSync(folder(), { recursive: true });
    // The report of this run keeps no reason for a skipped test: scripts/skipped-tests.mjs reads it
    // from here, beside the report, which is three folders up from the compiled test.
    const reports = path.resolve(__dirname, '..', '..', '..', 'reports');
    fs.mkdirSync(reports, { recursive: true });
    fs.appendFileSync(path.join(reports, 'skip-reasons.jsonl'), `${JSON.stringify({ file: suiteName, name: unclaimedName, reason: unclaimedReason })}\n`);
  });
  suiteTeardown(() => fs.rmSync(folder(), { recursive: true, force: true }));
  teardown(closeAll);

  test('a .mm file opens in the mind map, drawn from the file, and is not modified by being opened', async () => {
    const uri = example('mindmap', 'example 1', 'design.mm');
    await vscode.commands.executeCommand('vscode.open', uri);
    const tab = await until('the mind map\'s tab', () => vscode.window.tabGroups.activeTabGroup.activeTab);
    assert.ok(tab.input instanceof vscode.TabInputCustom, 'a .mm file opens in a custom editor');
    assert.strictEqual(tab.input.viewType, viewType);

    const state = await drawn();
    assert.strictEqual(state.origin, 'freeplane/mindmap');
    assert.strictEqual(state.kind, 'diagram');
    assert.ok(state.scene, 'a tool type read from its definition shows a scene');
    // The example folds nothing, so every node of the file is drawn.
    assert.strictEqual(state.scene.nodes.length, nodesIn(fs.readFileSync(uri.fsPath, 'utf8')), 'every node of the file is drawn');
    assert.notStrictEqual(state.scene.readOnly, true);
    assert.strictEqual(tab.isDirty, false);
  });

  test('"Open as Text" shows the same file in the text editor', async () => {
    const { uri } = await open();
    await vscode.commands.executeCommand('etalii.adp.openAsText');
    const editor = await until('the text editor', () => vscode.window.visibleTextEditors.find((candidate) => candidate.document.uri.toString() === uri.toString()));
    assert.strictEqual(editor.document.getText(), fs.readFileSync(uri.fsPath, 'utf8'));
    const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
    assert.ok(tabs.some((tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString()), 'the file has a text tab');
    assert.ok(tabs.some((tab) => tab.input instanceof vscode.TabInputCustom && tab.input.uri.toString() === uri.toString()), 'and it is still open in the mind map');
  });

  test('a rename changes only the node\'s text, as one undo step', async () => {
    const { document, original } = await open();
    assert.ok((await drawn()).scene!.nodes.some((node) => node.id === sceneGraph), 'a node has the id its file gives it');
    assert.deepStrictEqual(await edit({ kind: 'rename', id: sceneGraph, text: 'Scene tree' }), { result: 'applied' });

    const renamed = original.replace('TEXT="Scene graph"', 'TEXT="Scene tree"');
    assert.strictEqual(document.getText(), renamed, 'nothing but the node\'s text changed');
    assert.strictEqual(document.isDirty, true);
    const state = await drawn(document.version);
    assert.ok(state.scene!.nodes.find((node) => node.id === sceneGraph)?.labels.some((label) => label.text === 'Scene tree'), 'the canvas follows');

    await vscode.commands.executeCommand('undo');
    await until('the undo', () => document.getText() === original);
    await vscode.commands.executeCommand('redo');
    await until('the redo', () => document.getText() === renamed);
  });

  test('adding a child is one undo step, and everything else in the file stays as it was', async () => {
    const { document, original } = await open();
    const before = (await drawn()).scene!.nodes.length;
    // The new node is named by the definition; the canvas is then told to open its text in place.
    assert.deepStrictEqual(await edit({ kind: 'action', action: 'addChild', id: root }), { result: 'applied' });

    await until('the child in the document', () => nodesIn(document.getText()) === nodesIn(original) + 1);
    const added = document.getText();
    // Every line of the file as it was is still there, in its order: the edit only added to it.
    const lines = added.split('\n');
    let at = 0;
    for (const line of original.split('\n')) {
      at = lines.indexOf(line, at) + 1;
      assert.ok(at > 0, `the line ${line} is as it was`);
    }
    assert.strictEqual((await drawn(document.version)).scene!.nodes.length, before + 1);

    await vscode.commands.executeCommand('undo');
    await until('the undo', () => document.getText() === original);
    await vscode.commands.executeCommand('redo');
    await until('the redo', () => document.getText() === added);
  });

  test('folding a node hides what is under it for this viewer, and writes nothing', async () => {
    const { document, original } = await open();
    const before = (await drawn()).scene!.nodes;
    assert.strictEqual(before.find((node) => node.id === layout)?.fold, 'unfolded');
    assert.ok(before.some((node) => node.id === measurePass));

    assert.deepStrictEqual(await edit({ kind: 'fold', id: layout, folded: true }), { result: 'applied' });
    const folded = await until('the folded scene', async () => {
      const current = await drawn();
      return current.scene!.nodes.find((node) => node.id === layout)?.fold === 'folded' ? current : undefined;
    });
    assert.ok(!folded.scene!.nodes.some((node) => node.id === measurePass), 'what is under the node is not drawn');
    assert.ok(folded.scene!.nodes.length < before.length);
    assert.strictEqual(folded.options.collapsed?.[layout], true);
    // A fold is the viewer's: the file does not change, and there is nothing to save or to undo.
    assert.strictEqual(document.getText(), original);
    assert.strictEqual(document.isDirty, false);
    assert.strictEqual(folded.version, document.version);

    assert.deepStrictEqual(await edit({ kind: 'fold', id: layout, folded: false }), { result: 'applied' });
    await until('the unfolded scene', async () => (await drawn()).scene!.nodes.length === before.length);
    assert.strictEqual(document.getText(), original);
    assert.strictEqual(document.isDirty, false);
  });

  test('a save without an edit leaves the file byte for byte what it was', async () => {
    const { uri, document } = await open();
    const bytes = fs.readFileSync(uri.fsPath);
    assert.strictEqual(await document.save(), true);
    assert.ok(fs.readFileSync(uri.fsPath).equals(bytes));
    assert.strictEqual(document.isDirty, false);
  });

  test('a save after an edit writes exactly the document\'s text', async () => {
    const { uri, document, original } = await open();
    assert.deepStrictEqual(await edit({ kind: 'rename', id: sceneGraph, text: 'Scene tree' }), { result: 'applied' });
    await until('the edit', () => document.getText() !== original);
    assert.strictEqual(await document.save(), true);
    assert.ok(fs.readFileSync(uri.fsPath).equals(Buffer.from(original.replace('TEXT="Scene graph"', 'TEXT="Scene tree"'), 'utf8')));
    assert.strictEqual(document.isDirty, false);
  });

  test('lists a rule finding in the Problems panel with its rule and line', async () => {
    const { uri, document } = await open(duplicateId);
    const diagnostics = await until('the finding', () => {
      const found = vscode.languages.getDiagnostics(uri).filter((diagnostic) => diagnostic.code === 'mindmap.duplicate-id');
      return found.length > 0 ? found : undefined;
    });
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].source, 'ADP');
    assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Error);
    assert.strictEqual(diagnostics[0].message, 'Two nodes share the id \'ID_same\' (\'First\' and \'Second\').');
    assert.strictEqual(document.lineAt(diagnostics[0].range.start.line).text, '<node TEXT="Second" ID="ID_same"/>');
    // A map that breaks a rule still opens, and can be edited.
    assert.notStrictEqual((await drawn()).scene!.readOnly, true);
  });

  test('opens a file that is no readable map empty and read-only, with its one finding', async () => {
    const { uri } = await open('<map version="freeplane 1.11.5">\n<node TEXT="Root" ID="ID_root">\n</map>\n');
    const state = await drawn();
    assert.deepStrictEqual(state.scene!.nodes, []);
    assert.strictEqual(state.scene!.readOnly, true);
    const diagnostics = await until('the finding', () => {
      const found = vscode.languages.getDiagnostics(uri);
      return found.length > 0 ? found : undefined;
    });
    assert.deepStrictEqual(diagnostics.map((diagnostic) => diagnostic.code), ['mindmap.not-a-map']);
    assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Error);
    assert.strictEqual(state.scene!.notice, diagnostics[0].message);
    assert.deepStrictEqual((await edit({ kind: 'rename', id: 'ID_root', text: 'Other' }))?.result, 'refused');
  });

  // Skipped: see `unclaimedReason`. When the binding states its marker, this is scenario 5.
  test.skip(unclaimedName, async () => {
    const uri = written('<?xml version="1.0" encoding="UTF-8"?>\n<notes>\n  <note>No map here.</note>\n</notes>\n');
    await vscode.commands.executeCommand('vscode.open', uri);
    await until('the text editor', () => vscode.window.activeTextEditor?.document.uri.toString() === uri.toString());
    const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs)
      .filter((tab) => (tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputCustom) && tab.input.uri.toString() === uri.toString());
    assert.strictEqual(tabs.length, 1, 'the file has one tab');
    assert.ok(tabs[0].input instanceof vscode.TabInputText, 'the file is in the text editor, not in the mind map');
    assert.deepStrictEqual(vscode.languages.getDiagnostics(uri).map((diagnostic) => `${diagnostic.source}: ${diagnostic.message}`), []);
  });
});
