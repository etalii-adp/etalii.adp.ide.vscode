import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { closeAll, drawn, example, until } from './support';

// An agent activity diagram in a real Visual Studio Code (etalii.adp spec 027, User Story 2). The
// diagram has no code of its own in the extension: it is the tool type read from
// `definitions/agent-activity-diagram/`, so what its canvas is sent is a scene. What the user
// arranges is kept in the file itself, in its `view` mapping, so a lock is an edit like any other.

const viewType = 'etalii.adp.etalii.agent-activity-diagram';

const edit = (request: unknown): Thenable<{ result: string; sentence?: string } | undefined> => vscode.commands.executeCommand('etalii.adp.test.edit', request);
const folder = (): string => example('agent-activity-diagram-test').fsPath;
const fixtureText = (...parts: string[]): string => fs.readFileSync(example('fixtures', 'tools', 'agent-activity-diagram', ...parts).fsPath, 'utf8');

let copies = 0;

// Each test works on a file of its own, so the copied examples and fixtures stay as they were.
function written(text: string): vscode.Uri {
  copies += 1;
  const uri = example('agent-activity-diagram-test', `work-${copies}.aad`);
  fs.writeFileSync(uri.fsPath, text);
  return uri;
}

async function open(text = fixtureText('one-day.aad')): Promise<{ uri: vscode.Uri; document: vscode.TextDocument; original: string }> {
  const uri = written(text);
  await vscode.commands.executeCommand('vscode.open', uri);
  await drawn();
  const document = await vscode.workspace.openTextDocument(uri);
  return { uri, document, original: document.getText() };
}

suite('An agent activity diagram in Visual Studio Code', () => {
  suiteSetup(() => fs.mkdirSync(folder(), { recursive: true }));
  suiteTeardown(() => fs.rmSync(folder(), { recursive: true, force: true }));
  teardown(closeAll);

  test('an .aad file opens in the agent activity diagram by default, drawn from the file, and is not modified by being opened', async () => {
    const uri = example('agent-activity-diagram', 'every-state', 'every-state.aad');
    const bytes = fs.readFileSync(uri.fsPath);
    const registration = fs.readFileSync(example('agent-activity-diagram', 'every-state', 'every-state.adp').fsPath);
    await vscode.commands.executeCommand('vscode.open', uri);
    const tab = await until('the diagram\'s tab', () => vscode.window.tabGroups.activeTabGroup.activeTab);
    assert.ok(tab.input instanceof vscode.TabInputCustom, 'an .aad file opens in a custom editor');
    assert.strictEqual(tab.input.viewType, viewType);

    const state = await drawn();
    assert.strictEqual(state.origin, 'etalii/agent-activity-diagram');
    assert.strictEqual(state.kind, 'diagram');
    assert.ok(state.scene, 'a tool type read from its definition shows a scene');
    // The example shows its archived specification, so every element of its five lists is drawn; tasks and pull requests are listed inside them.
    const text = fs.readFileSync(uri.fsPath, 'utf8');
    const elements = text.split('\r\n').filter((line) => /^ {2}- id: /.test(line)).map((line) => line.slice(8));
    assert.deepStrictEqual(state.scene.nodes.map((node) => node.id).sort(), [...elements].sort());
    assert.ok(state.scene.edges.length > 0, 'a key that names an element is drawn as a line');
    assert.notStrictEqual(state.scene.readOnly, true);
    assert.strictEqual(tab.isDirty, false);
    assert.ok(fs.readFileSync(uri.fsPath).equals(bytes));
    assert.ok(fs.readFileSync(example('agent-activity-diagram', 'every-state', 'every-state.adp').fsPath).equals(registration));
  });

  test('a rename changes only the element\'s name, as one undo step', async () => {
    const { document, original } = await open();
    assert.deepStrictEqual(await edit({ kind: 'rename', id: 's-knowledge', text: 'Knowledge base designer' }), { result: 'applied' });

    const renamed = original.replace('name: Knowledge designer', 'name: Knowledge base designer');
    assert.strictEqual(document.getText(), renamed, 'nothing but the name changed');
    assert.strictEqual(document.isDirty, true);
    const state = await drawn(document.version);
    assert.ok(state.scene!.nodes.find((node) => node.id === 's-knowledge')?.labels.some((label) => label.text === 'Knowledge base designer'), 'the canvas follows');

    await vscode.commands.executeCommand('undo');
    await until('the undo', () => document.getText() === original);
    await vscode.commands.executeCommand('redo');
    await until('the redo', () => document.getText() === renamed);
  });

  test('dragging an element locks it where it is dropped, in the file\'s view mapping, as one undo step', async () => {
    const { uri, document, original } = await open();
    assert.deepStrictEqual(await edit({ kind: 'move', id: 'l-kd', x: 520, y: 40 }), { result: 'applied' });

    const locked = original.replace('      y: -80\r\n', '      y: -80\r\n    - element: l-kd\r\n      x: 520\r\n      y: 40\r\n');
    assert.strictEqual(document.getText(), locked, 'the placement is an entry of view.placements, and nothing else changed');
    const state = await drawn(document.version);
    assert.strictEqual((state.scene!.nodes.find((node) => node.id === 'l-kd') as { pinned?: boolean } | undefined)?.pinned, true);
    // Nothing of it is kept beside the file: no registration is written for a lock.
    assert.strictEqual(fs.existsSync(uri.fsPath.replace(/\.aad$/, '.adp')), false);

    await vscode.commands.executeCommand('undo');
    await until('the undo', () => document.getText() === original);
    await vscode.commands.executeCommand('redo');
    await until('the redo', () => document.getText() === locked);
  });

  test('folding a group and turning on the switch are edits of the file too, each one undo step', async () => {
    const { document, original } = await open();
    assert.deepStrictEqual(await edit({ kind: 'fold', id: 's-knowledge', group: 'progressing', folded: true }), { result: 'applied' });
    const folded = original.replace('      collapsed: false\r\n', '      collapsed: false\r\n    - element: s-knowledge\r\n      group: progressing\r\n      collapsed: true\r\n');
    assert.strictEqual(document.getText(), folded);

    assert.deepStrictEqual(await edit({ kind: 'filter', id: 'archived', value: true }), { result: 'applied' });
    assert.strictEqual(document.getText(), folded.replace('showArchived: false', 'showArchived: true'));
    const state = await drawn(document.version);
    assert.ok(state.scene!.nodes.some((node) => node.id === 's-rider'), 'the archived specification is drawn');

    await vscode.commands.executeCommand('undo');
    await until('the first undo', () => document.getText() === folded);
    await vscode.commands.executeCommand('undo');
    await until('the second undo', () => document.getText() === original);
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
    assert.deepStrictEqual(await edit({ kind: 'action', action: 'delete', id: 't-k6' }), { result: 'applied' });
    await until('the edit', () => document.getText() !== original);
    assert.strictEqual(await document.save(), true);
    assert.ok(fs.readFileSync(uri.fsPath).equals(Buffer.from(document.getText(), 'utf8')));
    assert.ok(!document.getText().includes('t-k6'));
    assert.strictEqual(document.isDirty, false);
  });

  test('lists a finding of a rule the definition states in the Problems panel, with its rule and its line', async () => {
    const { uri, document } = await open(fixtureText('findings', 'link-not-openable.aad'));
    const diagnostics = await until('the finding', () => {
      const found = vscode.languages.getDiagnostics(uri).filter((diagnostic) => diagnostic.code === 'aad.link-not-openable');
      return found.length > 0 ? found : undefined;
    });
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].source, 'ADP');
    assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Warning);
    assert.strictEqual(diagnostics[0].message, 'The link "ftp://example.org/project" is neither an http or https address nor a path, so it is kept and not opened.');
    assert.strictEqual(document.lineAt(diagnostics[0].range.start.line).text, '  - id: p');
    // A file that breaks a rule still opens, and can be edited.
    assert.notStrictEqual((await drawn()).scene!.readOnly, true);
  });

  test('a refused edit writes nothing and answers with the definition\'s sentence', async () => {
    const { document, original } = await open();
    assert.deepStrictEqual(await edit({ kind: 'connect', from: 's-rider', to: 'a-dev2' }), {
      result: 'refused', sentence: '"Developer 2" already works on "Knowledge designer". Remove that line first: an agent works on one specification at a time.',
    });
    assert.deepStrictEqual(await edit({ kind: 'action', action: 'openLink', id: 'p-adp' }), { result: 'refused', sentence: 'It has no link. Add one in the property grid.' });
    assert.strictEqual(document.getText(), original);
    assert.strictEqual(document.isDirty, false);
  });

  test('opens a file that cannot be read empty and read-only, with its one finding', async () => {
    const { uri } = await open('agent-activity-diagram: 1\r\nprojects: [\r\n');
    const state = await drawn();
    assert.deepStrictEqual(state.scene!.nodes, []);
    assert.strictEqual(state.scene!.readOnly, true);
    const diagnostics = await until('the finding', () => {
      const found = vscode.languages.getDiagnostics(uri);
      return found.length > 0 ? found : undefined;
    });
    assert.deepStrictEqual(diagnostics.map((diagnostic) => diagnostic.code), ['std.unparseable']);
    assert.strictEqual(state.scene!.notice, diagnostics[0].message);
    assert.deepStrictEqual((await edit({ kind: 'rename', id: 'p', text: 'Other' }))?.result, 'refused');
  });
});
