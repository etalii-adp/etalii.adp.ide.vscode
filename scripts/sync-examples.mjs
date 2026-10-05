// Refreshes examples/ and fixtures/ from a checkout of etalii.adp.ide.standalone, byte for byte,
// and records the commit they were read at in examples/PROVENANCE.md.
//
//   node scripts/sync-examples.mjs <path to etalii.adp.ide.standalone> [<git ref>, default origin/develop]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [standalone, ref = 'origin/develop'] = process.argv.slice(2);
if (!standalone) {
  console.error('Usage: node scripts/sync-examples.mjs <path to etalii.adp.ide.standalone> [<git ref>]');
  process.exit(1);
}
const git = (...args) => execFileSync('git', ['-C', standalone, ...args], { maxBuffer: 1 << 28 });
const commit = git('rev-parse', ref).toString().trim();

// Source folder in standalone, destination here.
const copies = [
  ['src/diagrams/gartner-hype-cycle-graph/examples/', 'examples/gartner-hypecycle-graph/'],
  ['src/diagrams/agent-behavior-modelling/examples/', 'examples/agent-behavior-modelling/'],
  ['src/diagrams/gartner-hype-cycle-graph/backend/EtAlii.Adp.Diagram.GartnerHypeCycleGraph.Tests/Fixtures/', 'fixtures/gartner-hypecycle-graph/'],
  ['src/diagrams/gartner-hype-cycle-graph/scale-fixture.json', 'fixtures/gartner-hypecycle-graph/scale-fixture.json'],
];

let count = 0;
for (const [from, to] of copies) {
  if (to.endsWith('/')) rmSync(to, { recursive: true, force: true });
  const files = git('ls-tree', '-r', '--name-only', commit, '--', from).toString().split('\n').filter(Boolean);
  for (const file of files) {
    if (file.endsWith('.py')) continue;
    const target = to.endsWith('/') ? to + file.slice(from.length) : to;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, git('show', `${commit}:${file}`));
    count++;
  }
}

writeFileSync('examples/PROVENANCE.md', `# Where the examples and fixtures come from

The files under \`examples/\` and \`fixtures/\` are copied unchanged, byte for byte, from [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), which is licensed under the Apache License 2.0, as this repository is. They are what both hosts must agree on: every example opens and round-trips here as it does there, and every fixture yields the same findings.

- Commit: \`${commit}\`
- Refresh them with \`node scripts/sync-examples.mjs <path to a checkout of etalii.adp.ide.standalone>\`; do not edit them by hand.

| Here | There |
|---|---|
${copies.map(([from, to]) => `| \`${to}\` | \`${from}\` |`).join('\n')}
`);
console.log(`Copied ${count} files from ${commit}`);