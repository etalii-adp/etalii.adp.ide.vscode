// Refreshes examples/ and fixtures/ from a checkout of etalii.adp.ide.standalone and, for DESL's
// smallest example, one of etalii.adp, byte for byte, and records the commit each was read at in
// examples/PROVENANCE.md. Every file is read from a git object, never from a working tree.
//
//   node scripts/sync-examples.mjs <path to etalii.adp.ide.standalone> [<git ref>, default origin/develop] [<path to etalii.adp> [<git ref>, default origin/develop]]
//
// Without a path to etalii.adp, what came from it is left as it is, with the commit it was read at.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [standalone, ref = 'origin/develop', adp, adpRef = 'origin/develop'] = process.argv.slice(2);
if (!standalone) {
  console.error('Usage: node scripts/sync-examples.mjs <path to etalii.adp.ide.standalone> [<git ref>] [<path to etalii.adp> [<git ref>]]');
  process.exit(1);
}
const standaloneName = 'etalii.adp.ide.standalone';
const adpName = 'etalii.adp';
const provenance = 'examples/PROVENANCE.md';

// Source in its repository, destination here; a folder ends with a slash. A tool type's examples are
// under the name its folder has in definitions/, and what only the tests read is under fixtures/tools/.
const mindmap = 'src/diagrams/mindmap/';
const activity = 'src/diagrams/agent-activity-diagram/';
const copies = [
  [standaloneName, 'src/diagrams/gartner-hype-cycle-graph/examples/', 'examples/gartner-hypecycle-graph/'],
  [standaloneName, 'src/diagrams/agent-behavior-modelling/examples/', 'examples/agent-behavior-modelling/'],
  [standaloneName, 'src/diagrams/gartner-hype-cycle-graph/backend/EtAlii.Adp.Diagram.GartnerHypeCycleGraph.Tests/Fixtures/', 'fixtures/gartner-hypecycle-graph/'],
  [standaloneName, 'src/diagrams/gartner-hype-cycle-graph/scale-fixture.json', 'fixtures/gartner-hypecycle-graph/scale-fixture.json'],
  // etalii.adp spec 027, FR-014: what the modules of the three further tool types publish.
  [standaloneName, `${mindmap}examples/`, 'examples/mindmap/'],
  [standaloneName, `${mindmap}backend/EtAlii.Adp.Diagram.Mindmap.Tests/Fixtures/architecture.mm`, 'fixtures/tools/mindmap/architecture.mm'],
  [standaloneName, `${mindmap}backend/EtAlii.Adp.Diagram.Mindmap.Tests/Parity/mindmap.transcript.json`, 'fixtures/tools/mindmap/mindmap.transcript.json'],
  [standaloneName, `${activity}examples/`, 'examples/agent-activity-diagram/'],
  [standaloneName, `${activity}backend/EtAlii.Adp.Diagram.AgentActivityDiagram.Tests/Fixtures/`, 'fixtures/tools/agent-activity-diagram/'],
  [standaloneName, 'src/designers/knowledge/examples/', 'examples/knowledge/'],
  // DESL's smallest example and its binding: the tool type a test adds to a temporary definitions folder.
  [adpName, 'specifications/desl/minimal-table.des', 'fixtures/tools/desl/minimal-table.des'],
  [adpName, 'specifications/desl/minimal-table.fbl', 'fixtures/tools/desl/minimal-table.fbl'],
  // DESL's own schema: what a test reads for the words that are DESL's.
  [adpName, 'specifications/desl/desl.schema.json', 'fixtures/tools/desl/desl.schema.json'],
  // DISL 0.6, etalii.adp spec 034: the example of inherited relation flags, its definition and findings, and the
  // three specifications that must be refused.
  ...['service-calls.dis', 'service-calls.did', 'service-calls.findings.json'].map((name) => [adpName, `specifications/disl/${name}`, `fixtures/disl/flag-inheritance/${name}`]),
  ...['relation-flag-widened.dis', 'relation-flag-directed.dis', 'relation-flag-conflict.dis'].map((name) => [adpName, `specifications/disl/refused/${name}`, `fixtures/disl/flag-inheritance/${name}`]),
];

const clone = (path, gitRef) => {
  const git = (...args) => execFileSync('git', ['-C', path, ...args], { maxBuffer: 1 << 28 });
  return { git, commit: git('rev-parse', gitRef).toString().trim() };
};
const clones = { [standaloneName]: clone(standalone, ref) };
if (adp) clones[adpName] = clone(adp, adpRef);
// The commit a repository's copies were read at: now, or as the record has it when they are left alone.
const recorded = existsSync(provenance) ? readFileSync(provenance, 'utf8') : '';
const commitOf = (repository) => clones[repository]?.commit ?? new RegExp(`\| \`${repository.replaceAll('.', '\.')}\` \| [^|]+ \| \`([0-9a-f]{40})\` \|`).exec(recorded)?.[1];

let count = 0;
for (const [repository, from, to] of copies) {
  if (!clones[repository]) continue;
  const { git, commit } = clones[repository];
  if (to.endsWith('/')) rmSync(to, { recursive: true, force: true });
  const files = git('ls-tree', '-r', '-z', '--name-only', commit, '--', from).toString().split('\0').filter(Boolean);
  if (files.length === 0) {
    console.error(`${repository} has no ${from} at ${commit}`);
    process.exit(1);
  }
  for (const file of files) {
    if (file.endsWith('.py')) continue;
    const target = to.endsWith('/') ? to + file.slice(from.length) : to;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, git('show', `${commit}:${file}`));
    count++;
  }
}

writeFileSync(provenance, `# Where the examples and fixtures come from

The files under \`examples/\` and \`fixtures/\` are copied unchanged, byte for byte, from [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone) and, for DESL's smallest example and DISL's example of inherited relation flags, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp), both licensed under the Apache License 2.0, as this repository is. They are what both hosts must agree on: every example opens and round-trips here as it does there, and every fixture yields the same findings. This record covers the folders of its table; \`fixtures/fbl/\` has a record of its own.

- Refresh them with \`node scripts/sync-examples.mjs <path to a checkout of etalii.adp.ide.standalone> [<git ref>] [<path to a checkout of etalii.adp> [<git ref>]]\`; do not edit them by hand.

| Here | Repository | Path | Commit |
|---|---|---|---|
${copies.filter(([repository]) => commitOf(repository)).map(([repository, from, to]) => `| \`${to}\` | \`${repository}\` | \`${from}\` | \`${commitOf(repository)}\` |`).join('\n')}
`);
console.log(`Copied ${count} files from ${Object.entries(clones).map(([repository, { commit }]) => `${repository} at ${commit}`).join(' and ')}`);
