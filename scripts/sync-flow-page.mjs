// Refreshes the template of the causal loop diagram's flow page (etalii.adp spec 082, research R1)
// from a checkout of etalii.adp.ide.desktop, byte for byte, read from a git object, never from a
// working tree. The page is written as one string into src/core/plugins/cld-flow-page/template.ts,
// and its repository, path, commit and SHA-256 into PROVENANCE.md beside it.
//
//   node scripts/sync-flow-page.mjs <path to etalii.adp.ide.desktop> [<git ref>, default origin/develop]
//   node scripts/sync-flow-page.mjs --check
//
// `--check` copies nothing and reads no other repository: it exits with 1 when the string in
// template.ts is not the page the record names.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const folder = 'src/core/plugins/cld-flow-page';
const templateFile = `${folder}/template.ts`;
const record = `${folder}/PROVENANCE.md`;
const repository = 'etalii.adp.ide.desktop';
const path = 'modules/diagrams/causal-loop-diagram/src/flow_page.html';
const sha256 = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

/** The page the template module holds. */
function heldPage() {
  const source = readFileSync(templateFile, 'utf8');
  const literal = /^export const TEMPLATE = (".*");$/m.exec(source);
  if (!literal) throw new Error(`${templateFile} holds no TEMPLATE string.`);
  return JSON.parse(literal[1]);
}

if (process.argv[2] === '--check') {
  const row = /^\| `flow_page\.html` \| `[^`]+` \| `[^`]+` \| `([0-9a-f]{40})` \| `([0-9a-f]{64})` \|$/m.exec(readFileSync(record, 'utf8'));
  if (!row) {
    console.error(`${record} records no copy.`);
    process.exit(1);
  }
  const actual = sha256(heldPage());
  if (actual !== row[2]) {
    console.error(`${templateFile} holds a page whose SHA-256 is ${actual}, not the ${row[2]} ${record} records. Refresh it with node scripts/sync-flow-page.mjs <path to ${repository}>.`);
    process.exit(1);
  }
  console.log(`${templateFile}: the page of ${repository} at ${row[1].slice(0, 7)}, as recorded.`);
  process.exit(0);
}

const [desktop, ref = 'origin/develop'] = process.argv.slice(2);
if (!desktop) {
  console.error('Usage: node scripts/sync-flow-page.mjs <path to etalii.adp.ide.desktop> [<git ref>] | --check');
  process.exit(1);
}
const commit = execFileSync('git', ['-C', desktop, 'rev-parse', `${ref}^{commit}`], { encoding: 'utf8' }).trim();
const page = execFileSync('git', ['-C', desktop, 'show', `${commit}:${path}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

writeFileSync(templateFile, [
  '// The causal loop diagram\'s flow page, copied unchanged from etalii.adp.ide.desktop by',
  '// scripts/sync-flow-page.mjs, as PROVENANCE.md records. Do not edit it: a correction goes to the',
  '// desktop host and arrives with a newer copy (etalii.adp spec 082, FR-014).',
  '',
  `export const TEMPLATE = ${JSON.stringify(page)};`,
  '',
].join('\n'));
writeFileSync(record, [
  '# Where the template comes from',
  '',
  `\`template.ts\` holds the flow page of the causal loop diagram (etalii.adp spec 074), copied unchanged, byte for byte, from [etalii-adp/${repository}](https://github.com/etalii-adp/${repository}), licensed under the Apache License 2.0, as this repository is. It is the prototype the maintainer accepted, changed only at spec 074's FR-035 places, with the markers the generator fills. Do not edit it, or this file, by hand: a correction goes to the desktop host and arrives with a newer copy.`,
  '',
  `- Refresh it with \`node scripts/sync-flow-page.mjs <path to ${repository}> [<git ref>]\`; the ref defaults to \`origin/develop\`.`,
  '- Check the copy against this record with `node scripts/sync-flow-page.mjs --check`.',
  '',
  '| File | Repository | Path | Commit | SHA-256 |',
  '|---|---|---|---|---|',
  `| \`flow_page.html\` | \`${repository}\` | \`${path}\` | \`${commit}\` | \`${sha256(page)}\` |`,
  '',
].join('\n'));
console.log(`${templateFile}: the page of ${repository} at ${commit.slice(0, 7)}.`);
