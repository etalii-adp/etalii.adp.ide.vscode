import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { closeAll, drawn, example, state, until } from './support';

const viewType = 'etalii.adp.gartner.hypecycle-graph';

async function open(...parts: string[]): Promise<{ uri: vscode.Uri; document: vscode.TextDocument; original: string }> {
  const uri = example(...parts);
  await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
  await drawn();
  const document = await vscode.workspace.openTextDocument(uri);
  return { uri, document, original: document.getText() };
}

const edit = (request: unknown): Thenable<{ result: string; sentence?: string } | undefined> => vscode.commands.executeCommand('etalii.adp.test.edit', request);
const select = (...ids: string[]): Thenable<void> => vscode.commands.executeCommand('etalii.adp.test.select', ids);

suite('Editing a hype cycle graph in Visual Studio Code', () => {
  teardown(closeAll);

  test('an edit from the canvas changes only its lines, marks the file modified, and one undo takes it back', async () => {
    const { document, original } = await open('fixtures', 'gartner-hypecycle-graph', 'triggers-and-notes.ghg');
    assert.deepStrictEqual(await edit({ kind: 'rename', id: 'radio', text: 'Pocket radio' }), { result: 'applied' });

    const changed = document.getText().split(/\r?\n/);
    const before = original.split(/\r?\n/);
    const different = changed.map((line, index) => (line === before[index] ? undefined : line)).filter((line) => line !== undefined);
    assert.deepStrictEqual(different, ['    name: Pocket radio']);
    assert.strictEqual(document.isDirty, true);
    assert.strictEqual((await drawn(document.version)).view!.elements.find((element) => element.id === 'radio')?.label, 'Pocket radio');

    await vscode.commands.executeCommand('undo');
    await until('the undo', () => document.getText() === original);
    await vscode.commands.executeCommand('redo');
    await until('the redo', () => document.getText().includes('name: Pocket radio'));
  });

  test('a refused edit leaves the file as it was and answers with the definition\'s sentence', async () => {
    const { document, original } = await open('fixtures', 'gartner-hypecycle-graph', 'triggers-and-notes.ghg');
    assert.deepStrictEqual(await edit({ kind: 'connect', from: 'radio', to: 'radio' }), { result: 'refused', sentence: 'A trend cannot influence itself.' });
    assert.strictEqual(document.getText(), original);
    assert.strictEqual(document.isDirty, false);
  });

  test('ADP Properties shows the selection\'s rows, and an edit there is the same edit of the file', async () => {
    const { document } = await open('fixtures', 'gartner-hypecycle-graph', 'triggers-and-notes.ghg');
    await select('transistors');
    const rows = (await state())!.fields;
    assert.deepStrictEqual(rows.slice(0, 6).map((row) => row.label), ['Name', 'Description', 'Tags', 'Start', 'Stop', 'Phases']);
    assert.strictEqual(rows.find((row) => row.id === 'ghg.phases')?.value, 'All four');

    assert.deepStrictEqual(await edit({ kind: 'setField', id: 'transistors', field: 'ghg.phases', value: 'Peak and Trough' }), { result: 'applied' });
    assert.ok(document.getText().includes('    phases: 2'));
    const after = await until('the rows to follow', async () => {
      const current = await state();
      return current?.fields.find((row) => row.id === 'ghg.phases')?.value === 'Peak and Trough' ? current : undefined;
    });
    assert.ok(!after.fields.some((row) => row.id === 'ghg.slope-end'));
  });

  test('the Remove command removes the selection, and Arrange Diagram arranges once and then says there is nothing to do', async () => {
    const { document } = await open('fixtures', 'gartner-hypecycle-graph', 'triggers-and-notes.ghg');
    await select('note-2');
    await vscode.commands.executeCommand('etalii.adp.remove');
    await until('the note to go', () => !document.getText().includes('note-2'));

    const arranged = await edit({ kind: 'action', action: 'ghg.arrange' });
    if (arranged?.result === 'applied') {
      assert.deepStrictEqual(await edit({ kind: 'action', action: 'ghg.arrange' }), { result: 'refused', sentence: 'This graph is already arranged.' });
    } else {
      assert.deepStrictEqual(arranged, { result: 'refused', sentence: 'This graph is already arranged.' });
    }
  });

  test('saving after an edit writes the file with its own line endings and nothing else changed', async () => {
    const { uri, document } = await open('fixtures', 'gartner-hypecycle-graph', 'crlf-line-endings.ghg');
    const onDisk = fs.readFileSync(uri.fsPath, 'utf8');
    assert.ok(onDisk.includes('\r\n'), 'the fixture has CRLF line endings');
    const id = (await drawn()).view!.elements.find((element) => element.type === 'trend')!.id;
    assert.deepStrictEqual(await edit({ kind: 'setField', id, field: 'ghg.tags', value: 'saved' }), { result: 'applied' });
    assert.ok(await document.save());

    const saved = fs.readFileSync(uri.fsPath, 'utf8');
    assert.ok(!/[^\r]\n/.test(saved), 'every line still ends in CRLF');
    // The trend's one tags line was rewritten in place; every other byte is as it was.
    assert.strictEqual(saved, onDisk.replace('    tags: [energy, industry]', '    tags: [saved]'));
  });

  test('the ADP Toolbox view lists the diagram\'s entries, and still does once it has the focus', async () => {
    await open('fixtures', 'gartner-hypecycle-graph', 'rules-clean.ghg');
    const labels = async (): Promise<string[]> => ((await vscode.commands.executeCommand<{ entries: { label: string }[] }>('etalii.adp.test.toolbox')).entries.map((entry) => entry.label));
    assert.deepStrictEqual(await labels(), ['Trend', 'Trigger', 'Note']);
    await vscode.commands.executeCommand('etalii.adp.focusToolbox');
    // An entry activated in the view is added to the diagram that had the focus before it.
    await until('the diagram to stay active', async () => (await state())?.origin === 'gartner/hypecycle-graph');
    assert.deepStrictEqual(await labels(), ['Trend', 'Trigger', 'Note']);
  });

  test('a new element dropped from the toolbox is added to the file and selected', async () => {
    const { document } = await open('fixtures', 'gartner-hypecycle-graph', 'rules-clean.ghg');
    const before = (await drawn()).view!.elements.length;
    assert.deepStrictEqual(await edit({ kind: 'drop', entry: 'ghg.add.trend', x: 0, y: 16 }), { result: 'applied' });
    const after = await drawn(document.version);
    assert.strictEqual(after.view!.elements.length, before + 1);
    assert.ok(document.getText().includes('name: New trend'));
  });
});
