import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { closeAll, drawn, example, state, until } from './support';

// Links between documents in a real Visual Studio Code (etalii.adp spec 089; FBL 0.23 section 17; DISL 0.12,
// 4.12 and 9.4): the workspace's index follows the maps of the workspace, a linked node shows its target's name,
// a link that does not resolve is in the Problems panel, a map is given its document id with its first edit, and
// the menu opens a linked node's target, lists a node's backlinks, and adds a linked node picked in the lookup.

const edit = (request: unknown): Thenable<{ result: string; sentence?: string } | undefined> => vscode.commands.executeCommand('etalii.adp.test.edit', request);
const select = (ids: string[]): Thenable<void> => vscode.commands.executeCommand('etalii.adp.test.select', ids);
const quickPicks = (answers: (string | undefined)[]): Thenable<unknown> => vscode.commands.executeCommand('etalii.adp.test.quickPicks', answers);
const offered = (): Thenable<{ title?: string; items: { label: string; description?: string; detail?: string }[] }[]> => vscode.commands.executeCommand('etalii.adp.test.quickPicksOffered');
const folder = (): string => example('links-test').fsPath;

const target = [
  '<map version="freeplane 1.11.5">',
  '<node TEXT="Targets" ID="ID_t1">',
  '<attribute NAME="adp-id" VALUE="tgt00001"/>',
  '<node TEXT="Target" ID="ID_t2"/>',
  '</node>',
  '</map>',
].join('\n');

const consumer = [
  '<map version="freeplane 1.11.5">',
  '<node TEXT="Consumer" ID="ID_c1">',
  '<attribute NAME="adp-id" VALUE="cns00001"/>',
  '<node TEXT="Old name" ID="ID_c2">',
  '<attribute NAME="adp-link" VALUE="$tgt00001@target.mm#ID_t2.text=Old name"/>',
  '</node>',
  '<node TEXT="Gone" ID="ID_c3">',
  '<attribute NAME="adp-link" VALUE="$tgt00001@target.mm#ID_gone=Gone"/>',
  '</node>',
  '</node>',
  '</map>',
].join('\n');

function write(name: string, text: string): vscode.Uri {
  const uri = example('links-test', name);
  fs.writeFileSync(uri.fsPath, text);
  return uri;
}

async function open(uri: vscode.Uri): Promise<vscode.TextDocument> {
  await vscode.commands.executeCommand('vscode.open', uri);
  await until('the map to be active', async () => (await state())?.uri === uri.toString());
  await drawn();
  return vscode.workspace.openTextDocument(uri);
}

const labelOf = async (id: string): Promise<string | undefined> => (await state())?.scene?.nodes.find((node) => node.id === id)?.labels[0]?.text;

suite('Links between documents in Visual Studio Code', () => {
  let targetUri: vscode.Uri;
  let consumerUri: vscode.Uri;

  setup(() => {
    fs.mkdirSync(folder(), { recursive: true });
    targetUri = write('target.mm', target);
    consumerUri = write('consumer.mm', consumer);
  });
  teardown(async () => {
    await closeAll();
    fs.rmSync(folder(), { recursive: true, force: true });
  });

  test('a linked node shows its target\'s name, and a link that does not resolve is in the Problems panel', async () => {
    await open(consumerUri);
    await until('the target\'s name', async () => (await labelOf('ID_c2')) === 'Target');
    const broken = await until('the broken link', () => vscode.languages.getDiagnostics(consumerUri).find((diagnostic) => diagnostic.code === 'link.broken-element'));
    assert.match(broken.message, /'Gone' is no longer in 'target\.mm'/);
    assert.strictEqual(vscode.languages.getDiagnostics(consumerUri).filter((diagnostic) => String(diagnostic.code).startsWith('link.')).length, 1);
  });

  test('the first edit writes what the load-time check finds, in the same undo step', async () => {
    const document = await open(consumerUri);
    await until('the target\'s name', async () => (await labelOf('ID_c2')) === 'Target');
    assert.deepStrictEqual(await edit({ kind: 'rename', id: 'ID_c1', text: 'Consumers' }), { result: 'applied' });
    const after = await until('the edit', () => (document.getText() !== consumer ? document.getText() : undefined));
    assert.strictEqual(after, consumer
      .replace('TEXT="Consumer"', 'TEXT="Consumers"')
      .replace('<node TEXT="Old name" ID="ID_c2">', '<node TEXT="Target" ID="ID_c2">')
      .replace('ID_t2.text=Old name', 'ID_t2.text=Target'));
    await vscode.commands.executeCommand('undo');
    await until('the undo', () => document.getText() === consumer);
  });

  test('a map without a document id is given one with its first edit', async () => {
    const plain = '<map version="freeplane 1.11.5">\n<node TEXT="Plain" ID="ID_p1">\n<node TEXT="Child" ID="ID_p2"/>\n</node>\n</map>';
    const document = await open(write('plain.mm', plain));
    assert.deepStrictEqual(await edit({ kind: 'rename', id: 'ID_p2', text: 'Kid' }), { result: 'applied' });
    const after = await until('the edit', () => (document.getText() !== plain ? document.getText() : undefined));
    assert.match(after, /^<map version="freeplane 1\.11\.5">\n<node TEXT="Plain" ID="ID_p1">\n<attribute NAME="adp-id" VALUE="[0-9a-z]{8}"\/>\n<node TEXT="Kid" ID="ID_p2"\/>\n<\/node>\n<\/map>$/);
  });

  test('Open linked element opens the target in its own tool', async () => {
    await open(consumerUri);
    await select(['ID_c2']);
    const actions = await until('the entry', async () => (await state())?.actions?.find((action) => action.id === 'link:open'));
    assert.strictEqual(actions.label, 'Open linked element');
    assert.deepStrictEqual(await edit({ kind: 'action', action: 'link:open', id: 'ID_c2' }), { result: 'applied' });
    await until('the target to be open', async () => (await state())?.uri === targetUri.toString());
  });

  test('Linked from (N) lists the links to a node, and opens the one picked', async () => {
    await open(targetUri);
    await select(['ID_t2']);
    const entry = await until('the entry', async () => (await state())?.actions?.find((action) => action.id === 'link:backlinks'));
    assert.strictEqual(entry.label, 'Linked from (1)');
    await quickPicks(['Old name']);
    assert.deepStrictEqual(await edit({ kind: 'action', action: 'link:backlinks', id: 'ID_t2' }), { result: 'applied' });
    const [list] = await offered();
    assert.deepStrictEqual(list.items.map((item) => [item.label, item.description]), [['Old name', 'consumer.mm']]);
    await until('the consuming map to be open', async () => (await state())?.uri === consumerUri.toString());
  });

  test('Add from another document adds a linked node for the element picked in the lookup', async () => {
    const document = await open(consumerUri);
    await until('the target\'s name', async () => (await labelOf('ID_c2')) === 'Target');
    await quickPicks(['Target']);
    assert.deepStrictEqual(await edit({ kind: 'action', action: 'addLinked', id: 'ID_c1' }), { result: 'applied' });
    const [lookup] = await offered();
    assert.ok(lookup.items.some((item) => item.label === 'Target' && item.description === 'target.mm' && item.detail === 'links-test'), 'the lookup offers the target with its document and folder');
    const after = await until('the linked node', () => (/<attribute NAME="adp-link" VALUE="\$tgt00001@target\.mm#ID_t2\.text=Target"\/>\n<\/node>\n<\/node>\n<\/map>$/.test(document.getText()) ? document.getText() : undefined));
    assert.match(after, /<node TEXT="Target" ID="ID_[0-9a-z]{8}">\n<attribute NAME="adp-link"/);
  });
});
