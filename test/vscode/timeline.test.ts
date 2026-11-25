import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { closeAll, drawn, example, until } from './support';

// The timeline in a real window (etalii.adp spec 091, tasks T011 and T023): each of its four examples opens in the
// timeline and is drawn, every element of it a node; a drop, a move and Arrange diagram are each one step of undo.

const viewType = 'etalii.adp.generic.timeline';
const edit = (request: unknown): Thenable<{ result: string; sentence?: string } | undefined> => vscode.commands.executeCommand('etalii.adp.test.edit', request);
// 20 canvas units a day from 1970 (the definition's time axis).
const canvasOf = (date: string): number => (Date.parse(`${date}T00:00:00Z`) / 86_400_000) * 20;
const examples: readonly [string, string, number][] = [
  ['example-1', 'roadmap.tml', 11],
  ['example-2', 'roadmap.tml', 29],
  ['marvel-universe-overview', 'marvel-universe-overview.tml', 47],
  ['marvel-universe', 'marvel-universe.tml', 428],
];

suite('A timeline in Visual Studio Code', () => {
  teardown(closeAll);

  for (const [folder, file, least] of examples) {
    test(`opens ${folder}/${file} and draws its elements`, async () => {
      await vscode.commands.executeCommand('vscode.openWith', example('timeline', folder, file), viewType);
      const state = await drawn();
      assert.strictEqual(state.origin, 'generic/timeline');
      assert.ok((state.scene?.nodes.length ?? 0) >= least, `${state.scene?.nodes.length} elements drawn, at least ${least} expected`);
    });
  }

  const gestures: readonly [string, unknown, RegExp][] = [
    ['a drop of an element', { kind: 'drop', entry: 'element', x: canvasOf('2026-09-21') + 7, y: 15 }, /label: New element\r?\n\s+begin: 2026-09-21\r?\n\s+end: 2026-10-05/],
    ['a move', { kind: 'move', id: 'launch', x: canvasOf('2026-03-03'), y: 2 * 60 + 0.3 * 60 - 9 }, /id: launch\r?\n\s+label: [^\r\n]*\r?\n\s+begin: 2026-03-03/],
    ['Arrange diagram', { kind: 'action', action: 'arrange' }, /row: 0/],
  ];
  for (const [what, request, written] of gestures) {
    test(`takes back ${what} with one undo`, async () => {
      const uri = example('timeline', 'example-1', 'roadmap.tml');
      await vscode.commands.executeCommand('vscode.openWith', uri, viewType);
      await drawn();
      const document = await vscode.workspace.openTextDocument(uri);
      const original = document.getText();

      assert.deepStrictEqual(await edit(request), { result: 'applied' });
      await until(`${what} to be written`, () => written.test(document.getText()) && document.getText() !== original);
      await vscode.commands.executeCommand('undo');
      await until('the undo', () => document.getText() === original);
    });
  }
});
