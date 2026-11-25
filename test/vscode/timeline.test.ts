import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { closeAll, drawn, example } from './support';

// The timeline in a real window (etalii.adp spec 091, task T011): each of its four examples opens in the timeline
// and is drawn, every element of it a node.

const viewType = 'etalii.adp.generic.timeline';
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
});
