// Refreshes fixtures/fbl/ from two clones, byte for byte: FBL's bindings, fixtures and registrations
// from etalii.adp, and the real files standalone's FBL tests read from etalii.adp.ide.standalone.
// Every file is read from a git object, never from a working tree, so no line ending is converted.
// It writes fixtures/fbl/manifest.json (every copied file with its SHA-256) and
// fixtures/fbl/PROVENANCE.md.
//
//   node scripts/sync-fbl.mjs <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]
//
// Both refs default to origin/develop.
//
// A few files are taken from a later etalii.adp commit than the rest, each pinned below with the commit
// and the reason, and copied into the same folder; once the etalii.adp ref has them, they are copied
// with the rest and the pinned source is left out.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [adp, standalone, adpRef = 'origin/develop', standaloneRef = 'origin/develop'] = process.argv.slice(2);

// The files of a feature whose conformance this library takes up before the whole corpus is copied again.
// insert-constant: etalii.adp spec 033, the insert constant of FBL 0.8, at the merge of etalii.adp #427.
const pinned = [
  {
    name: 'insert-constant',
    commit: '59e2117738fb0e254f961d093b25038c90af78fe',
    why: 'the insert constant of FBL 0.8, etalii.adp spec 033',
    files: (file) => /^specifications\/fbl\/(fixtures\/insert-constant-[^/]+\/|refused\/[^/]+\.fbl$)/.test(file),
  },
  // bullets: FBL 0.7's bullets family and declared registration blocks, with the fixtures of the
  // Hierarchical Requirement Designer that read and write through them. The definitions these
  // fixtures name come from the same commit, into fixtures/fbl/definitions/.
  {
    name: 'bullets',
    commit: '2f3c7aab69cd58a61d69d9365bec0b3f131c7230',
    why: 'the bullets family and declared registration blocks of FBL 0.7, and the Hierarchical Requirement Designer',
    files: (file) => /^specifications\/fbl\/(fixtures\/(bullets-[^/]+|behavior-tree-read|registration-blocks|hierarchical-requirement-[^/]+)\/|behavior-tree\.fbl$|registrations\/requirements\.adp$)/.test(file),
  },
];
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
  return (!relative.includes('/') && relative.endsWith('.fbl')) || relative.startsWith('fixtures/') || relative.startsWith('registrations/') || (relative.startsWith('refused/') && relative.endsWith('.fbl'));
});
console.log(`etalii.adp at ${adpCommit}`);
count('bindings', conformance.filter((file) => file.endsWith('.fbl')).length, 1);
count('fixtures', conformance.filter((file) => file.endsWith('/fixture.json')).length, 1);
count('registrations (conformance)', conformance.filter((file) => file.startsWith(`${fbl}registrations/`)).length, 1);
const conformanceDigests = copy(adpGit, adpCommit, conformance, fbl, 'fixtures/fbl/conformance/');

// The pinned files the etalii.adp ref does not have yet, beside the rest and without clearing them.
const pinnedSources = [];
for (const source of pinned) {
  const files = list(adpGit, source.commit, fbl).filter((file) => source.files(file) && !(file.slice(fbl.length) in conformanceDigests));
  if (files.length === 0) continue;
  const digests = {};
  for (const file of files.sort()) {
    const bytes = adpGit('show', `${source.commit}:${file}`);
    const relative = file.slice(fbl.length);
    mkdirSync(dirname('fixtures/fbl/conformance/' + relative), { recursive: true });
    writeFileSync('fixtures/fbl/conformance/' + relative, bytes);
    digests[relative] = createHash('sha256').update(bytes).digest('hex');
  }
  count(`pinned ${source.name}`, files.length);
  pinnedSources.push({ ...source, digests });
}

// ---- definitions: the files under definitions/ a fixture names, and the specification beside each binding ----

const definitionsFolder = 'definitions/';
// The definitions the fixtures of one commit name, with the specification beside each binding.
function definitionsNamed(commit, fixtures) {
  const adpFiles = new Set(list(adpGit, commit, definitionsFolder));
  const named = new Set();
  for (const fixture of fixtures) {
    const text = adpGit('show', `${commit}:${fixture}`).toString('utf8');
    for (const [, reference] of text.matchAll(/"((?:\.\.\/)+definitions\/[^"#]+)/g)) {
      const segments = fixture.split('/').slice(0, -1);
      for (const segment of reference.split('/')) {
        if (segment === '..') segments.pop();
        else segments.push(segment);
      }
      const file = segments.join('/');
      if (!adpFiles.has(file)) continue;
      named.add(file);
      if (!file.endsWith('.fbl')) continue;
      for (const specification of ['.dis', '.des']) {
        if (adpFiles.has(file.slice(0, -4) + specification)) named.add(file.slice(0, -4) + specification);
      }
    }
  }
  return named;
}
const definitions = definitionsNamed(adpCommit, conformance.filter((file) => file.endsWith('/fixture.json')));
count('definitions fixtures name', definitions.size);
const definitionsDigests = copy(adpGit, adpCommit, definitions, definitionsFolder, 'fixtures/fbl/definitions/');

// The definitions a pinned source's fixtures name that the etalii.adp ref does not have, beside the rest.
for (const source of pinnedSources) {
  const fixtures = Object.keys(source.digests).filter((file) => file.endsWith('/fixture.json')).map((file) => fbl + file);
  const named = [...definitionsNamed(source.commit, fixtures)].filter((file) => !(file.slice(definitionsFolder.length) in definitionsDigests));
  if (named.length === 0) continue;
  source.definitions = {};
  for (const file of named.sort()) {
    const bytes = adpGit('show', `${source.commit}:${file}`);
    const relative = file.slice(definitionsFolder.length);
    mkdirSync(dirname('fixtures/fbl/definitions/' + relative), { recursive: true });
    writeFileSync('fixtures/fbl/definitions/' + relative, bytes);
    source.definitions[relative] = createHash('sha256').update(bytes).digest('hex');
  }
  count(`pinned ${source.name} definitions`, named.length);
}

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
  { name: 'definitions', repository: 'https://github.com/etalii-adp/etalii.adp', commit: adpCommit, licence: 'Apache-2.0', from: definitionsFolder, to: 'fixtures/fbl/definitions/', files: definitionsDigests },
  { name: 'real-files', repository: 'https://github.com/etalii-adp/etalii.adp.ide.standalone', commit: standaloneCommit, licence: 'Apache-2.0', from: '', to: 'fixtures/fbl/real-files/', files: realDigests },
  ...pinnedSources.flatMap((source) => [
    { name: source.name, repository: 'https://github.com/etalii-adp/etalii.adp', commit: source.commit, licence: 'Apache-2.0', from: fbl, to: 'fixtures/fbl/conformance/', files: source.digests },
    ...(source.definitions === undefined ? [] : [{ name: `${source.name}-definitions`, repository: 'https://github.com/etalii-adp/etalii.adp', commit: source.commit, licence: 'Apache-2.0', from: definitionsFolder, to: 'fixtures/fbl/definitions/', files: source.definitions }]),
  ]),
];
writeFileSync('fixtures/fbl/manifest.json', JSON.stringify({ sources }, null, 2) + '\n');
writeFileSync('fixtures/fbl/PROVENANCE.md', `# Where the files under fixtures/fbl/ come from

They are copied unchanged, byte for byte, from two repositories, both licensed under the Apache License 2.0, as this repository is. The tests of the plug-in's FBL implementation (\`test/core/fbl\`, \`test/vscode/fbl.test.ts\`) read them, and \`test/core/fbl/corpus.test.ts\` checks every one against the SHA-256 that \`manifest.json\` records, so a copy that was edited or saved with other line endings is noticed.

| Here | From | Commit | Licence |
|---|---|---|---|
| \`fixtures/fbl/conformance/\` | [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp), \`specifications/fbl/\`: the example bindings (\`*.fbl\`), \`fixtures/\` and \`registrations/\` | \`${adpCommit}\` | Apache-2.0 |
| \`fixtures/fbl/definitions/\` | [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp), \`definitions/\`: the bindings and inputs a fixture names, and the specification beside each such binding | \`${adpCommit}\` | Apache-2.0 |
| \`fixtures/fbl/real-files/\` | [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), the files under \`src/\` its FBL tests read, under the paths they have there | \`${standaloneCommit}\` | Apache-2.0 |
${pinnedSources.map((source) => `| \`fixtures/fbl/conformance/\`: ${Object.keys(source.digests).map((file) => `\`${file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : file}\``).filter((folder, index, all) => all.indexOf(folder) === index).join(', ')} | [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp), \`specifications/fbl/\`, taken ahead of the rest for ${source.why} | \`${source.commit}\` | Apache-2.0 |\n${source.definitions === undefined ? '' : `| \`fixtures/fbl/definitions/\`: ${Object.keys(source.definitions).map((file) => `\`${file}\``).join(', ')} | [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp), \`definitions/\`: what those fixtures name | \`${source.commit}\` | Apache-2.0 |\n`}`).join('')}
## Third-party notices

Some of the real files came to standalone from elsewhere. The notice standalone keeps beside them is copied with them:

${notices.length === 0 ? 'None.' : [...notices].sort().map((file) => `- \`fixtures/fbl/real-files/${file}\``).join('\n')}

## Refreshing

Run \`npm run sync-fbl -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]\` and commit what it writes; both refs default to \`origin/develop\`. Do not edit a file under \`fixtures/fbl/\` by hand: a difference from its source is taken up by copying at a newer commit.
`);
console.log(`Copied ${Object.keys(conformanceDigests).length} conformance files, ${Object.keys(definitionsDigests).length} definitions and ${Object.keys(realDigests).length} real files.`);
