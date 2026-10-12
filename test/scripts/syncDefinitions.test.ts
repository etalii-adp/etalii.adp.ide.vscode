import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// scripts/sync-definitions.mjs, run as the command it is (etalii.adp spec 027, contracts/definitions.md):
// against two temporary git repositories that stand in for etalii.adp and etalii.adp.ide.standalone,
// from a temporary folder that stands in for the plug-in, with its package.json and its definitions/.
const script = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'sync-definitions.mjs');

const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
const crlf = (text: string): string => text.replace(/\n/g, '\r\n');
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const specification = (key: 'disl' | 'desl', origin: string, label: string, persistence: object): string =>
  json({ [key]: '0.3', language: { origin, label }, persistence: { format: 'fbl', ...persistence } });
const binding = (bindings: Record<string, object>): string =>
  json({ fbl: '0.4', bindings: Object.fromEntries(Object.entries(bindings).map(([name, rest]) => [name, { body: { kind: 'file', family: 'yaml' }, ...rest }])) });

const standaloneUrl = 'https://raw.githubusercontent.com/etalii-adp/etalii.adp.ide.standalone/develop/';

// What etalii.adp holds. Four tool types, whose folders' order (alpha, beta, delta, gamma) is not
// the order of their origins, and one whose binding is nowhere.
const adpFiles: Record<string, string | Buffer> = {
  // A relative reference with its file beside it; the binding has CRLF line endings.
  'definitions/diagrams/alpha.dis': specification('disl', 'acme/alpha', 'Alpha chart', { binding: 'alpha.fbl#a' }),
  'definitions/diagrams/alpha.fbl': crlf(binding({ a: { claims: { extensions: ['.alp'] }, template: { text: 'alpha: 1\r\n' } } })),
  // Bytes that are not UTF-8: a copy made through a string would change them.
  'definitions/diagrams/alpha.md': Buffer.concat([Buffer.from('# Alpha chart éè →\r\n'), Buffer.from([0xff, 0xfe, 0x0a])]),
  // A relative reference with no file beside it: found by name in standalone.
  'definitions/diagrams/beta.dis': specification('disl', 'acme/beta-notes', 'Beta notes', { binding: 'beta.fbl#b' }),
  'definitions/diagrams/beta.md': '# Beta notes\n',
  // A URL into standalone.
  'definitions/diagrams/gamma.dis': specification('disl', 'other/gamma', 'Gamma graph', { binding: `${standaloneUrl}src/diagrams/gamma/backend/gamma.fbl#g` }),
  'definitions/diagrams/gamma.md': '# Gamma graph\n',
  // A designer with two bindings in one file, both of shared extensions with a marker.
  'definitions/designers/delta.des': specification('desl', 'zeta/delta', 'Delta table', { bindings: ['delta.fbl#yaml', 'delta.fbl#json'] }),
  'definitions/designers/delta.fbl': binding({
    yaml: { claims: { extensions: ['.yaml', '.yml'], shared: true, marker: { rootKey: 'designer', value: 'zeta/delta' } }, template: { text: 'designer: zeta/delta\r\n' } },
    json: { claims: { extensions: ['.json'], shared: true, marker: { rootKey: 'designer', value: 'zeta/delta' } } },
  }),
  'definitions/designers/delta.md': '# Delta table\n',
  'definitions/diagrams/broken.dis': specification('disl', 'acme/broken', 'Broken', { binding: 'missing.fbl#m' }),
  'definitions/diagrams/broken.md': '# Broken\n',
};

const standaloneFiles: Record<string, string> = {
  // An extension written without its dot, claimed for the registration only; a template too.
  'src/tools/beta/beta.fbl': binding({ b: { claims: { extensions: ['md'], shared: true, registrationOnly: true, suggest: { contains: ['## Behavior'] } }, template: { text: '# {base}\r\n' } } }),
  // No template and nothing shared: a custom editor and no command.
  'src/diagrams/gamma/backend/gamma.fbl': binding({ g: { claims: { extensions: ['.gam'] } } }),
};

// The plug-in's manifest before the first run: entries of a tool type that is no longer there
// (old/thing), which the script owns, between entries it does not own.
const manifest = {
  name: 'adp',
  contributes: {
    customEditors: [
      { viewType: 'etalii.adp.old.thing', displayName: 'Old thing', selector: [{ filenamePattern: '*.old' }], priority: 'default' },
      { viewType: 'etalii.adp.registration', displayName: 'ADP registration', selector: [{ filenamePattern: '*.adp' }], priority: 'default' },
    ],
    commands: [
      { command: 'etalii.adp.new.old.thing', title: 'New Old Thing', category: 'ADP' },
      { command: 'etalii.adp.openAsText', title: 'Open as Text', category: 'ADP', icon: '$(go-to-file)' },
      { command: 'etalii.adp.openAs.old.thing', title: 'Open as Old Thing', category: 'ADP' },
      { command: 'etalii.adp.rename', title: 'Rename', category: 'ADP' },
    ],
    menus: {
      'editor/title': [
        { command: 'etalii.adp.openAsText', when: 'activeCustomEditorId =~ /^etalii\\.adp\\./', group: 'navigation' },
        { command: 'etalii.adp.openAs.old.thing', when: 'resourceLangId == markdown', group: 'navigation' },
      ],
      'file/newFile': [{ command: 'etalii.adp.new.old.thing' }],
      commandPalette: [
        { command: 'etalii.adp.openAs.old.thing', when: 'resourceLangId == markdown' },
        { command: 'etalii.adp.rename', when: 'activeCustomEditorId =~ /^etalii\\.adp\\./' },
      ],
    },
    keybindings: [{ command: 'etalii.adp.rename', key: 'f2' }],
  },
  scripts: { 'sync-definitions': 'node scripts/sync-definitions.mjs' },
};

// What the script makes of it for alpha, beta, delta and gamma: the entries it does not own first,
// as they were, then its own in the order of the folders' names.
const extension = (...extensions: string[]): string => `resourceExtname =~ /^\\.(${extensions.join('|')})$/`;
const suggested = 'resourcePath in etalii.adp.suggested';
const contributions = {
  customEditors: [
    manifest.contributes.customEditors[1],
    { viewType: 'etalii.adp.acme.alpha', displayName: 'Alpha chart', selector: [{ filenamePattern: '*.alp' }], priority: 'default' },
    { viewType: 'etalii.adp.acme.beta-notes', displayName: 'Beta notes', selector: [{ filenamePattern: '*.md' }], priority: 'option' },
    { viewType: 'etalii.adp.zeta.delta', displayName: 'Delta table', selector: [{ filenamePattern: '*.yaml' }, { filenamePattern: '*.yml' }, { filenamePattern: '*.json' }], priority: 'option' },
    { viewType: 'etalii.adp.other.gamma', displayName: 'Gamma graph', selector: [{ filenamePattern: '*.gam' }], priority: 'default' },
  ],
  commands: [
    manifest.contributes.commands[1],
    manifest.contributes.commands[3],
    { command: 'etalii.adp.new.acme.alpha', title: 'New Alpha chart', category: 'ADP' },
    { command: 'etalii.adp.new.acme.beta-notes', title: 'New Beta notes', category: 'ADP' },
    { command: 'etalii.adp.openAs.acme.beta-notes', title: 'Open as Beta notes', category: 'ADP' },
    { command: 'etalii.adp.new.zeta.delta', title: 'New Delta table', category: 'ADP' },
    { command: 'etalii.adp.openAs.zeta.delta', title: 'Open as Delta table', category: 'ADP' },
  ],
  menus: {
    'editor/title': [
      manifest.contributes.menus['editor/title'][0],
      { command: 'etalii.adp.openAs.acme.beta-notes', when: `${extension('md')} && !activeCustomEditorId && ${suggested}`, group: 'navigation' },
      { command: 'etalii.adp.openAs.zeta.delta', when: `${extension('yaml', 'yml', 'json')} && !activeCustomEditorId && ${suggested}`, group: 'navigation' },
    ],
    'file/newFile': [{ command: 'etalii.adp.new.acme.alpha' }, { command: 'etalii.adp.new.acme.beta-notes' }, { command: 'etalii.adp.new.zeta.delta' }],
    commandPalette: [
      manifest.contributes.menus.commandPalette[1],
      { command: 'etalii.adp.openAs.acme.beta-notes', when: extension('md') },
      { command: 'etalii.adp.openAs.zeta.delta', when: extension('yaml', 'yml', 'json') },
    ],
    'explorer/context': [
      { command: 'etalii.adp.openAs.acme.beta-notes', when: `${extension('md')} && ${suggested}`, group: 'navigation@90' },
      { command: 'etalii.adp.openAs.zeta.delta', when: `${extension('yaml', 'yml', 'json')} && ${suggested}`, group: 'navigation@90' },
    ],
  },
  keybindings: manifest.contributes.keybindings,
};

let temporary: string;
let adp: string;
let standalone: string;
/** etalii.adp's first commit, its second (alpha.dis changed) and standalone's one. */
let adpFirst: string;
let adpSecond: string;
let standaloneCommit: string;
/** The committed bytes of every file, by repository and path: what a copy has to be. */
const committed = new Map<string, Buffer>();

function repository(name: string, files: Record<string, string | Buffer>): string {
  const folder = join(temporary, name);
  mkdirSync(folder);
  const git = (...args: string[]): string => execFileSync('git', ['-C', folder, '-c', 'user.name=Test', '-c', 'user.email=test@example.org', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet');
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), content);
    committed.set(`${name}:${path}`, Buffer.from(content));
  }
  git('add', '--all');
  git('commit', '--quiet', '--message', 'first');
  return folder;
}

const commitOf = (folder: string): string => execFileSync('git', ['-C', folder, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

beforeAll(() => {
  temporary = mkdtempSync(join(tmpdir(), 'sync-definitions-'));
  adp = repository('etalii.adp', adpFiles);
  standalone = repository('etalii.adp.ide.standalone', standaloneFiles);
  adpFirst = commitOf(adp);
  standaloneCommit = commitOf(standalone);
  // A second commit in etalii.adp, which a refresh at HEAD takes up.
  writeFileSync(join(adp, 'definitions/diagrams/alpha.dis'), specification('disl', 'acme/alpha', 'Alpha chart, renamed', { binding: 'alpha.fbl#a' }));
  execFileSync('git', ['-C', adp, '-c', 'user.name=Test', '-c', 'user.email=test@example.org', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', 'commit', '--quiet', '--all', '--message', 'second']);
  adpSecond = commitOf(adp);
  // Both working trees now differ from every commit: a script that read them would copy this.
  for (const path of Object.keys(adpFiles)) appendFileSync(join(adp, path), 'not committed\n');
  for (const path of Object.keys(standaloneFiles)) appendFileSync(join(standalone, path), 'not committed\n');
});

afterAll(() => rmSync(temporary, { recursive: true, force: true }));

/** A new folder that stands in for the plug-in: its manifest and an empty definitions/. */
function plugin(): string {
  const folder = mkdtempSync(join(temporary, 'plugin-'));
  writeFileSync(join(folder, 'package.json'), json(manifest));
  mkdirSync(join(folder, 'definitions'));
  return folder;
}

const run = (folder: string, ...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd: folder, encoding: 'utf8' });
const add = (...names: string[]): string[] => names.flatMap((name) => ['--add', `definitions/${name === 'delta' ? 'designers' : 'diagrams'}/${name}.${name === 'delta' ? 'des' : 'dis'}`]);

/** A plug-in with alpha, beta, delta and gamma copied from etalii.adp's first commit. */
function synced(): string {
  const folder = plugin();
  const result = run(folder, adp, standalone, adpFirst, 'HEAD', ...add('alpha', 'beta', 'delta', 'gamma'));
  expect(result.status, result.stderr).toBe(0);
  return folder;
}

const bytesIn = (folder: string, path: string): Buffer => readFileSync(join(folder, ...path.split('/')));
const contributes = (folder: string): unknown => JSON.parse(bytesIn(folder, 'package.json').toString('utf8')).contributes;

/** Every file under definitions/ with its bytes, by its `/`-separated path. */
function definitions(folder: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const tool of readdirSync(join(folder, 'definitions')).sort()) {
    for (const file of readdirSync(join(folder, 'definitions', tool)).sort()) found[`${tool}/${file}`] = bytesIn(folder, `definitions/${tool}/${file}`).toString('base64');
  }
  return found;
}

/** The rows of a folder's PROVENANCE.md, with the table's header as the first. */
function record(folder: string, tool: string): string[][] {
  return bytesIn(folder, `definitions/${tool}/PROVENANCE.md`).toString('utf8').split(/\r?\n/)
    .filter((line) => line.startsWith('|') && !/^\|[-| ]+\|$/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, '')));
}

describe('copying the definitions', () => {
  it('every copy has the bytes of the git object, whatever its line endings and whatever the working tree holds', () => {
    const folder = synced();
    const sources: Record<string, string> = {
      'alpha/alpha.dis': 'etalii.adp:definitions/diagrams/alpha.dis',
      'alpha/alpha.fbl': 'etalii.adp:definitions/diagrams/alpha.fbl',
      'alpha/alpha.md': 'etalii.adp:definitions/diagrams/alpha.md',
      'beta/beta.dis': 'etalii.adp:definitions/diagrams/beta.dis',
      'beta/beta.fbl': 'etalii.adp.ide.standalone:src/tools/beta/beta.fbl',
      'beta/beta.md': 'etalii.adp:definitions/diagrams/beta.md',
      'delta/delta.des': 'etalii.adp:definitions/designers/delta.des',
      'delta/delta.fbl': 'etalii.adp:definitions/designers/delta.fbl',
      'delta/delta.md': 'etalii.adp:definitions/designers/delta.md',
      'gamma/gamma.dis': 'etalii.adp:definitions/diagrams/gamma.dis',
      'gamma/gamma.fbl': 'etalii.adp.ide.standalone:src/diagrams/gamma/backend/gamma.fbl',
      'gamma/gamma.md': 'etalii.adp:definitions/diagrams/gamma.md',
    };
    const copies = definitions(folder);
    // A folder holds its three files and the record, and nothing else.
    expect(Object.keys(copies).filter((path) => !path.endsWith('/PROVENANCE.md'))).toEqual(Object.keys(sources));
    expect(Object.keys(copies).filter((path) => path.endsWith('/PROVENANCE.md'))).toHaveLength(4);
    for (const [path, source] of Object.entries(sources)) expect(copies[path], path).toBe(committed.get(source)!.toString('base64'));
  });

  it('PROVENANCE.md has one row per file: its name, repository, path, full commit and SHA-256', () => {
    const folder = synced();
    const digest = (source: string): string => sha256(committed.get(source)!);
    expect(record(folder, 'alpha')).toEqual([
      ['File', 'Repository', 'Path', 'Commit', 'SHA-256'],
      ['alpha.dis', 'etalii.adp', 'definitions/diagrams/alpha.dis', adpFirst, digest('etalii.adp:definitions/diagrams/alpha.dis')],
      ['alpha.fbl', 'etalii.adp', 'definitions/diagrams/alpha.fbl', adpFirst, digest('etalii.adp:definitions/diagrams/alpha.fbl')],
      ['alpha.md', 'etalii.adp', 'definitions/diagrams/alpha.md', adpFirst, digest('etalii.adp:definitions/diagrams/alpha.md')],
    ]);
    // The text above the table says what the files are and names the two commands.
    const text = bytesIn(folder, 'definitions/alpha/PROVENANCE.md').toString('utf8');
    expect(text).toContain('npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone>');
    expect(text).toContain('npm run sync-definitions -- --check');
  });

  it('a binding is the file beside the specification, the path of a URL into standalone, or the file of that name in standalone, which is said', () => {
    const folder = plugin();
    const result = run(folder, adp, standalone, adpFirst, 'HEAD', ...add('alpha', 'beta', 'gamma'));
    expect(result.status, result.stderr).toBe(0);
    const bindingRow = (tool: string): string[] => record(folder, tool).find((row) => row[0] === `${tool}.fbl`)!.slice(1, 4);
    expect(bindingRow('alpha')).toEqual(['etalii.adp', 'definitions/diagrams/alpha.fbl', adpFirst]);
    expect(bindingRow('gamma')).toEqual(['etalii.adp.ide.standalone', 'src/diagrams/gamma/backend/gamma.fbl', standaloneCommit]);
    expect(bindingRow('beta')).toEqual(['etalii.adp.ide.standalone', 'src/tools/beta/beta.fbl', standaloneCommit]);
    // Only the one found by name is reported, on one line, with where it was found.
    const said = result.stdout.split(/\r?\n/).filter((line) => line.includes('by name'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('beta.fbl');
    expect(said[0]).toContain('src/tools/beta/beta.fbl');
  });

  it('a run without --add refreshes the folders that are there, at the commit of the ref', () => {
    const folder = synced();
    expect(run(folder, adp, standalone, 'HEAD', 'HEAD').status).toBe(0);
    expect(readdirSync(join(folder, 'definitions')).sort()).toEqual(['alpha', 'beta', 'delta', 'gamma']);
    const renamed = execFileSync('git', ['-C', adp, 'show', `${adpSecond}:definitions/diagrams/alpha.dis`]);
    expect(bytesIn(folder, 'definitions/alpha/alpha.dis').equals(renamed)).toBe(true);
    expect(record(folder, 'alpha')[1]).toEqual(['alpha.dis', 'etalii.adp', 'definitions/diagrams/alpha.dis', adpSecond, sha256(renamed)]);
    expect(record(folder, 'delta')[1][3]).toBe(adpSecond);
    expect(record(folder, 'gamma').find((row) => row[0] === 'gamma.fbl')![3]).toBe(standaloneCommit);
  });

  it('--add adds a tool type, and a deleted folder removes one', () => {
    const folder = plugin();
    expect(run(folder, adp, standalone, adpFirst, 'HEAD', ...add('alpha', 'gamma')).status).toBe(0);
    expect(run(folder, adp, standalone, adpFirst, 'HEAD', ...add('delta')).status).toBe(0);
    expect(readdirSync(join(folder, 'definitions')).sort()).toEqual(['alpha', 'delta', 'gamma']);
    const viewTypes = (): string[] => (contributes(folder) as typeof contributions).customEditors.map((entry) => entry.viewType);
    expect(viewTypes()).toEqual(['etalii.adp.registration', 'etalii.adp.acme.alpha', 'etalii.adp.zeta.delta', 'etalii.adp.other.gamma']);

    rmSync(join(folder, 'definitions', 'delta'), { recursive: true });
    expect(run(folder, adp, standalone, adpFirst, 'HEAD').status).toBe(0);
    expect(readdirSync(join(folder, 'definitions')).sort()).toEqual(['alpha', 'gamma']);
    expect(viewTypes()).toEqual(['etalii.adp.registration', 'etalii.adp.acme.alpha', 'etalii.adp.other.gamma']);
    expect(bytesIn(folder, 'package.json').toString('utf8')).not.toContain('zeta.delta');
  });

  it('exits 1, having written nothing, when a file a specification names cannot be found', () => {
    const folder = synced();
    const before = [definitions(folder), bytesIn(folder, 'package.json').toString('utf8')];
    // At etalii.adp's second commit, so a script that wrote before it looked would have changed alpha.
    const result = run(folder, adp, standalone, 'HEAD', 'HEAD', ...add('broken'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing.fbl');
    expect(result.stderr).toContain('definitions/diagrams/broken.dis');
    expect([definitions(folder), bytesIn(folder, 'package.json').toString('utf8')]).toEqual(before);
  });
});

describe('the manifest\'s contributions', () => {
  it('are written in the order of the folders\' names, and what the script does not own is left as it is', () => {
    const folder = synced();
    expect(contributes(folder)).toEqual(contributions);
    // Nothing outside `contributes` changes, and the file keeps its two spaces and its final newline.
    expect(bytesIn(folder, 'package.json').toString('utf8')).toBe(json({ ...manifest, contributes: contributions }));
  });

  it('two runs on the same copies write the same files', () => {
    const folder = synced();
    const first = [definitions(folder), bytesIn(folder, 'package.json').toString('utf8')];
    expect(run(folder, adp, standalone, adpFirst, 'HEAD').status).toBe(0);
    expect([definitions(folder), bytesIn(folder, 'package.json').toString('utf8')]).toEqual(first);
  });
});

describe('--check', () => {
  // One difference each, and the file the command has to name for it.
  const differences: { name: string; names: string; change(folder: string): void }[] = [
    { name: 'a changed byte', names: 'definitions/alpha/alpha.fbl', change: (folder) => appendFileSync(join(folder, 'definitions/alpha/alpha.fbl'), ' ') },
    { name: 'a file without a row', names: 'definitions/beta/notes.txt', change: (folder) => writeFileSync(join(folder, 'definitions/beta/notes.txt'), 'by hand') },
    { name: 'a row without a file', names: 'definitions/gamma/gamma.md', change: (folder) => rmSync(join(folder, 'definitions/gamma/gamma.md')) },
    {
      name: 'a contribution that differs',
      names: 'package.json',
      change: (folder) => writeFileSync(join(folder, 'package.json'), bytesIn(folder, 'package.json').toString('utf8').replace('"Alpha chart"', '"Alpha Chart"')),
    },
  ];

  it('exits 0 on what the command wrote, reading no clone and writing nothing', () => {
    const folder = synced();
    const before = [definitions(folder), bytesIn(folder, 'package.json').toString('utf8')];
    const result = run(folder, '--check');
    expect(result.status, result.stderr).toBe(0);
    expect([definitions(folder), bytesIn(folder, 'package.json').toString('utf8')]).toEqual(before);
  });

  it.each(differences)('exits 1 on $name, naming the file', ({ names, change }) => {
    const folder = synced();
    change(folder);
    const result = run(folder, '--check');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(names);
    // Only the file concerned is named.
    for (const other of differences) if (other.names !== names) expect(result.stderr).not.toContain(other.names);
  });

  it('names every file concerned at once, and changes none of them', () => {
    const folder = synced();
    for (const difference of differences) difference.change(folder);
    const before = [definitions(folder), bytesIn(folder, 'package.json').toString('utf8')];
    const result = run(folder, '--check');
    expect(result.status).toBe(1);
    for (const difference of differences) expect(result.stderr).toContain(difference.names);
    expect([definitions(folder), bytesIn(folder, 'package.json').toString('utf8')]).toEqual(before);
    expect(existsSync(join(folder, 'definitions/gamma/gamma.md'))).toBe(false);
  });
});
