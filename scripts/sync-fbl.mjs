// Refreshes fixtures/fbl/ from two clones, byte for byte: FBL's bindings, fixtures and registrations
// from etalii.adp, and the real files standalone's FBL tests read from etalii.adp.ide.standalone.
// Every file is read from a git object, never from a working tree, so no line ending is converted.
// It writes fixtures/fbl/manifest.json (every copied file with its SHA-256) and
// fixtures/fbl/PROVENANCE.md.
//
//   node scripts/sync-fbl.mjs <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]
//
// Both refs default to origin/develop.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [adp, standalone, adpRef = 'origin/develop', standaloneRef = 'origin/develop'] = process.argv.slice(2);
if (!adp || !standalone) {
  console.error('Usage: node scripts/sync-fbl.mjs <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]');
  process.exit(1);
}

// The recorded minimums, which the tests read too: a kind with fewer files fails the copy, so a
// folder that moved in standalone is noticed here and not as a silently smaller test run.
const minimums = JSON.parse(readFileSync('test/core/fbl/realFiles/minimums.json', 'utf8'));
const gitIn = (clone) => (...args) => execFileSync('git', ['-C', clone, ...args], { maxBuffer: 1 << 28 });
const list = (git, commit, folder) => git('ls-tree', '-r', '-z', '--name-only', commit, '--', folder).toString().split('\0').filter(Boolean);
const lower = (path) => path.toLowerCase();
const failures = [];

function copy(git, commit, files, from, to) {
  rmSync(to, { recursive: true, force: true });
  const digests = {};
  for (const file of [...files].sort()) {
    const bytes = git('show', `${commit}:${file}`);
    const relative = file.slice(from.length);
    mkdirSync(dirname(to + relative), { recursive: true });
    writeFileSync(to + relative, bytes);
    digests[relative] = createHash('sha256').update(bytes).digest('hex');
  }
  return digests;
}

function count(kind, found, minimum) {
  console.log(`${kind}: ${found}`);
  if (minimum !== undefined && found < minimum) failures.push(`${kind}: ${found} copied, at least ${minimum} expected`);
}

// ---- conformance: every *.fbl of specifications/fbl/, and everything under its fixtures/ and registrations/ ----

const adpGit = gitIn(adp);
const adpCommit = adpGit('rev-parse', adpRef).toString().trim();
const fbl = 'specifications/fbl/';
const conformance = list(adpGit, adpCommit, fbl).filter((file) => {
  const relative = file.slice(fbl.length);
  return (!relative.includes('/') && relative.endsWith('.fbl')) || relative.startsWith('fixtures/') || relative.startsWith('registrations/');
});
console.log(`etalii.adp at ${adpCommit}`);
count('bindings', conformance.filter((file) => file.endsWith('.fbl')).length, 1);
count('fixtures', conformance.filter((file) => file.endsWith('/fixture.json')).length, 1);
count('registrations (conformance)', conformance.filter((file) => file.startsWith(`${fbl}registrations/`)).length, 1);
const conformanceDigests = copy(adpGit, adpCommit, conformance, fbl, 'fixtures/fbl/conformance/');

// ---- real files: what standalone's real-file tests read, under the paths they have there ----

const standaloneGit = gitIn(standalone);
const standaloneCommit = standaloneGit('rev-parse', standaloneRef).toString().trim();
const excluded = new Set(['conformance', 'node_modules', 'bin', 'obj']);
const source = list(standaloneGit, standaloneCommit, 'src/').filter((file) => !file.split('/').some((segment) => excluded.has(lower(segment))));
const has = (file, ...extensions) => extensions.some((extension) => lower(file).endsWith(extension));
const content = new Map();
const contains = (file, text) => {
  if (!content.has(file)) content.set(file, standaloneGit('show', `${standaloneCommit}:${file}`).toString('utf8'));
  return content.get(file).includes(text);
};

const selected = new Set();
const take = (kind, files, minimum) => {
  for (const file of files) selected.add(file);
  count(kind, files.length, minimum);
};
console.log(`etalii.adp.ide.standalone at ${standaloneCommit}`);
for (const binding of minimums.bindings) {
  take(binding.key, source.filter((file) => has(file, ...binding.extensions) && (!binding.contains || contains(file, binding.contains))), binding.minimum);
}
const registrations = source.filter((file) => has(file, '.adp'));
take('registrations', registrations, minimums.registrations);
// The body a registration names in its `body` header, which the registration tests open, whatever its kind.
const inSource = new Set(source);
const named = new Set();
for (const registration of registrations) {
  const header = /^body: (.+?)\s*$/m.exec(standaloneGit('show', `${standaloneCommit}:${registration}`).toString('utf8').split(/^(?:layout|identities):/m)[0]);
  if (!header) continue;
  const segments = registration.split('/').slice(0, -1);
  for (const segment of header[1].split('/')) {
    if (segment === '..') segments.pop();
    else if (segment !== '.' && segment !== '') segments.push(segment);
  }
  if (inSource.has(segments.join('/'))) named.add(segments.join('/'));
}
take('bodies registrations name', [...named].filter((file) => !selected.has(file)));
take('legacy sidecars', source.filter((file) => has(file, '.layout.json', '.identities.json')));
take('Turtle and N-Triples', source.filter((file) => has(file, '.ttl', '.nt')), minimums.turtle);
const chartFolders = source.filter((file) => file.endsWith('/Chart.yaml')).map((file) => file.slice(0, -'Chart.yaml'.length));
count('chart folders', chartFolders.length, minimums.chartFolders);
take('chart files', source.filter((file) => chartFolders.some((folder) => file.startsWith(folder))));

// A notice standalone keeps beside files that came from elsewhere is copied with them.
const isNotice = (file) => /^(licen[sc]e|notice|copying)(\.[a-z]+)?$/i.test(file.slice(file.lastIndexOf('/') + 1));
const chosen = [...selected];
const notices = source.filter((file) => isNotice(file) && chosen.some((other) => other.startsWith(file.slice(0, file.lastIndexOf('/') + 1))));
take('third-party notices', notices);

const realDigests = copy(standaloneGit, standaloneCommit, selected, '', 'fixtures/fbl/real-files/');

if (failures.length > 0) {
  console.error(['Fewer files than the recorded minimums (test/core/fbl/realFiles/minimums.json):', ...failures.map((line) => `- ${line}`)].join('\n'));
  process.exit(1);
}

// ---- the manifest and the provenance, last ----

const sources = [
  { name: 'conformance', repository: 'https://github.com/etalii-adp/etalii.adp', commit: adpCommit, licence: 'Apache-2.0', from: fbl, to: 'fixtures/fbl/conformance/', files: conformanceDigests },
  { name: 'real-files', repository: 'https://github.com/etalii-adp/etalii.adp.ide.standalone', commit: standaloneCommit, licence: 'Apache-2.0', from: '', to: 'fixtures/fbl/real-files/', files: realDigests },
];
writeFileSync('fixtures/fbl/manifest.json', JSON.stringify({ sources }, null, 2) + '\n');
writeFileSync('fixtures/fbl/PROVENANCE.md', `# Where the files under fixtures/fbl/ come from

They are copied unchanged, byte for byte, from two repositories, both licensed under the Apache License 2.0, as this repository is. The tests of the plug-in's FBL implementation (\`test/core/fbl\`, \`test/vscode/fbl.test.ts\`) read them, and \`test/core/fbl/corpus.test.ts\` checks every one against the SHA-256 that \`manifest.json\` records, so a copy that was edited or saved with other line endings is noticed.

| Here | From | Commit | Licence |
|---|---|---|---|
| \`fixtures/fbl/conformance/\` | [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp), \`specifications/fbl/\`: the example bindings (\`*.fbl\`), \`fixtures/\` and \`registrations/\` | \`${adpCommit}\` | Apache-2.0 |
| \`fixtures/fbl/real-files/\` | [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), the files under \`src/\` its FBL tests read, under the paths they have there | \`${standaloneCommit}\` | Apache-2.0 |

## Third-party notices

Some of the real files came to standalone from elsewhere. The notice standalone keeps beside them is copied with them:

${notices.length === 0 ? 'None.' : [...notices].sort().map((file) => `- \`fixtures/fbl/real-files/${file}\``).join('\n')}

## Refreshing

Run \`npm run sync-fbl -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]\` and commit what it writes; both refs default to \`origin/develop\`. Do not edit a file under \`fixtures/fbl/\` by hand: a difference from its source is taken up by copying at a newer commit.
`);
console.log(`Copied ${Object.keys(conformanceDigests).length} conformance files and ${Object.keys(realDigests).length} real files.`);
