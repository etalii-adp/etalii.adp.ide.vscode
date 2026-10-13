// Refreshes definitions/ from two clones, byte for byte: each tool type's specification and companion
// from etalii.adp, and its FBL binding from etalii.adp or etalii.adp.ide.standalone. Every file is read
// from a git object, never from a working tree, so no line ending is converted. It writes one
// PROVENANCE.md per folder and, from the copies, the custom editors, commands and menu entries of
// package.json (etalii.adp spec 027, contracts/definitions.md).
//
//   node scripts/sync-definitions.mjs <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>] [--add <path of a specification in etalii.adp>]...
//   node scripts/sync-definitions.mjs --check
//
// Both refs default to origin/develop. A tool type is added with --add and removed by deleting its
// folder. --check reads no clone and writes nothing: it holds the copies to their records and
// package.json to the copies.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const adpName = 'etalii.adp';
const standaloneName = 'etalii.adp.ide.standalone';
const record = 'PROVENANCE.md';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const nameOf = (path) => path.slice(path.lastIndexOf('/') + 1);
const folderOf = (path) => path.slice(0, path.lastIndexOf('/') + 1);
const withoutExtension = (name) => name.slice(0, name.lastIndexOf('.'));
const ordinal = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** The tool types' folders, in the order everything is written in. */
const folders = () => (existsSync('definitions') ? readdirSync('definitions', { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(ordinal) : []);
/** The rows of a folder's record: file, repository, path, commit and SHA-256. */
const rowsOf = (tool) => (existsSync(`definitions/${tool}/${record}`) ? readFileSync(`definitions/${tool}/${record}`, 'utf8').split(/\r?\n/) : [])
  .filter((line) => line.startsWith('|') && !/^\|[-| ]+\|$/.test(line))
  .slice(1)
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, '')));

// ---- the manifest's contributions, from the copies ----

/** What the files of one folder say of its tool type, as the manifest needs it. */
function toolTypeIn(tool) {
  const folder = `definitions/${tool}/`;
  const specification = JSON.parse(readFileSync(folder + readdirSync(folder).find((file) => /\.(dis|des)$/.test(file)), 'utf8'));
  const { binding, bindings = binding ? [binding] : [] } = specification.persistence ?? {};
  // A reference is resolved to the copied file of its name, whatever form it has in the specification.
  const claimed = bindings.map((reference) => {
    const [file, name] = reference.split('#');
    return JSON.parse(readFileSync(folder + nameOf(file), 'utf8')).bindings[name];
  });
  const extensions = (shared) => [...new Set(claimed.filter((one) => (one.claims.shared === true) === shared).flatMap((one) => one.claims.extensions ?? []).map((extension) => extension.replace(/^\./, '')))];
  return {
    id: specification.language.origin.replaceAll('/', '.'),
    label: specification.language.label,
    own: extensions(false),
    shared: extensions(true),
    // FBL 13: a new body comes from the binding's template or from the `template` operation of its plugin.
    template: claimed.some((one) => one.template || one.reader?.plugin),
  };
}

// The script owns the entries that carry a tool type's <vendor>.<type>, also those of a tool type whose
// folder is gone. etalii.adp.registration and etalii.adp.openAsText have no second part and are not its.
const ownsEditor = (entry) => /^etalii\.adp\.[^.]+\../.test(entry.viewType ?? '');
const ownsCommand = (entry) => /^etalii\.adp\.(new|openAs)\../.test(entry.command ?? '');

/** package.json as it should be: what the script does not own first, as it was, then its own in the folders' order. */
function manifestText() {
  const text = readFileSync('package.json', 'utf8');
  const manifest = JSON.parse(text);
  const contributes = (manifest.contributes ??= {});
  const editors = [];
  const commands = [];
  const menus = { 'file/newFile': [], 'editor/title': [], commandPalette: [], 'explorer/context': [] };
  for (const tool of folders()) {
    const type = toolTypeIn(tool);
    const editor = (extensions, priority) => ({ viewType: `etalii.adp.${type.id}`, displayName: type.label, selector: extensions.map((extension) => ({ filenamePattern: `*.${extension}` })), priority });
    if (type.own.length > 0) editors.push(editor(type.own, 'default'));
    if (type.shared.length > 0) editors.push(editor(type.shared, 'option'));
    if (type.template) {
      commands.push({ command: `etalii.adp.new.${type.id}`, title: `New ${type.label}`, category: 'ADP' });
      menus['file/newFile'].push({ command: `etalii.adp.new.${type.id}` });
    }
    if (type.shared.length > 0) {
      const command = `etalii.adp.openAs.${type.id}`;
      const extension = `resourceExtname =~ /^\\.(${type.shared.join('|')})$/`;
      commands.push({ command, title: `Open as ${type.label}`, category: 'ADP' });
      menus['editor/title'].push({ command, when: `${extension} && !activeCustomEditorId && resourcePath in etalii.adp.suggested`, group: 'navigation' });
      menus.commandPalette.push({ command, when: extension });
      menus['explorer/context'].push({ command, when: `${extension} && resourcePath in etalii.adp.suggested`, group: 'navigation@90' });
    }
  }
  contributes.customEditors = [...(contributes.customEditors ?? []).filter((entry) => !ownsEditor(entry)), ...editors];
  contributes.commands = [...(contributes.commands ?? []).filter((entry) => !ownsCommand(entry)), ...commands];
  contributes.menus ??= {};
  for (const menu of new Set([...Object.keys(contributes.menus), ...Object.keys(menus)])) {
    const entries = [...(contributes.menus[menu] ?? []).filter((entry) => !ownsCommand(entry)), ...(menus[menu] ?? [])];
    if (menu in contributes.menus || entries.length > 0) contributes.menus[menu] = entries;
  }
  // A checkout may have given the file CRLF line endings (.gitattributes, text=auto); it keeps the ones it has.
  return (JSON.stringify(manifest, null, 2) + '\n').replaceAll('\n', text.includes('\r\n') ? '\r\n' : '\n');
}

// ---- --check ----

const args = process.argv.slice(2);
if (args.includes('--check')) {
  const concerned = [];
  for (const tool of folders()) {
    const rows = new Map(rowsOf(tool).map((row) => [row[0], row[4]]));
    const files = readdirSync(`definitions/${tool}`).filter((file) => file !== record).sort(ordinal);
    if (rows.size === 0) concerned.push(`definitions/${tool}/${record}: no record of the folder's files`);
    for (const file of files) {
      if (!rows.has(file)) concerned.push(`definitions/${tool}/${file}: in the folder and not in its record`);
      else if (sha256(readFileSync(`definitions/${tool}/${file}`)) !== rows.get(file)) concerned.push(`definitions/${tool}/${file}: its SHA-256 is not the one its record has`);
    }
    for (const file of rows.keys()) {
      if (!files.includes(file)) concerned.push(`definitions/${tool}/${file}: in the record and not in the folder`);
    }
  }
  // A copy that no longer reads as JSON is already named above, and says nothing of the manifest.
  let expected;
  try {
    expected = manifestText();
  } catch {
    expected = undefined;
  }
  if (expected !== undefined && readFileSync('package.json', 'utf8') !== expected) concerned.push('package.json: its custom editors, commands or menus differ from what the copied definitions give');
  if (concerned.length > 0) {
    console.error(['The copied definitions differ from their record (npm run sync-definitions refreshes them):', ...concerned.map((line) => `- ${line}`)].join('\n'));
    process.exit(1);
  }
  console.log(`${folders().length} tool types match their records and package.json.`);
  process.exit(0);
}

// ---- copying ----

const positional = [];
const added = [];
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--add') added.push(args[++index]);
  else positional.push(args[index]);
}
const [adp, standalone, adpRef = 'origin/develop', standaloneRef = 'origin/develop'] = positional;
if (!adp || !standalone || added.includes(undefined)) {
  console.error('Usage: node scripts/sync-definitions.mjs <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>] [--add <path of a specification in etalii.adp>]...\n       node scripts/sync-definitions.mjs --check');
  process.exit(1);
}

function clone(name, path, ref) {
  const git = (...gitArgs) => execFileSync('git', ['-C', path, ...gitArgs], { maxBuffer: 1 << 28 });
  const commit = git('rev-parse', `${ref}^{commit}`).toString().trim();
  const files = git('ls-tree', '-r', '-z', '--name-only', commit).toString().split('\0').filter(Boolean);
  return { name, commit, files, has: new Set(files), bytes: (file) => git('show', `${commit}:${file}`) };
}
const fromAdp = clone(adpName, adp, adpRef);
const fromStandalone = clone(standaloneName, standalone, standaloneRef);
console.log(`${adpName} at ${fromAdp.commit}\n${standaloneName} at ${fromStandalone.commit}`);

// Every folder that is there is refreshed from the path its record has; --add names a further one.
const specifications = new Map();
for (const tool of folders()) {
  const row = rowsOf(tool).find(([file]) => /\.(dis|des)$/.test(file));
  if (row) specifications.set(tool, row[2]);
  else console.log(`definitions/${tool}/ has no record of a specification and is left as it is.`);
}
for (const path of added) specifications.set(withoutExtension(nameOf(path)), path.replaceAll('\\', '/'));

// Everything is read before anything is written, so a file that cannot be found leaves the copies as they were.
const failures = [];
const copies = new Map();
for (const [tool, path] of [...specifications].sort(([a], [b]) => ordinal(a, b))) {
  if (!fromAdp.has.has(path)) {
    failures.push(`${path}: no such specification in ${adpName} at ${fromAdp.commit}`);
    continue;
  }
  const files = [{ from: fromAdp, path }];
  const companion = `${withoutExtension(path)}.md`;
  if (fromAdp.has.has(companion)) files.push({ from: fromAdp, path: companion });
  const { binding, bindings = binding ? [binding] : [] } = JSON.parse(fromAdp.bytes(path).toString('utf8')).persistence ?? {};
  for (const reference of new Set(bindings.map((one) => one.split('#')[0]))) {
    const url = /^https?:\/\/[^/]+\/etalii-adp\/etalii\.adp\.ide\.standalone\/[^/]+\/(.+)$/.exec(reference);
    const beside = folderOf(path) + reference;
    const named = fromStandalone.files.filter((file) => nameOf(file) === reference);
    if (url) {
      if (fromStandalone.has.has(url[1])) files.push({ from: fromStandalone, path: url[1] });
      else failures.push(`${path} names ${reference}: no ${url[1]} in ${standaloneName} at ${fromStandalone.commit}`);
    } else if (fromAdp.has.has(beside)) {
      files.push({ from: fromAdp, path: beside });
    } else if (named.length === 1) {
      // etalii.adp spec 027, research R14, item 3: the reference is relative and its file is in standalone.
      console.log(`${reference}: not beside ${path}, found by name in ${standaloneName} at ${named[0]}`);
      files.push({ from: fromStandalone, path: named[0] });
    } else {
      failures.push(`${path} names ${reference}: ${named.length === 0 ? `no such file beside it, and none of that name in ${standaloneName}` : `no such file beside it, and ${named.length} of that name in ${standaloneName} (${named.join(', ')})`}`);
    }
  }
  copies.set(tool, files.map((file) => ({ ...file, name: nameOf(file.path), bytes: file.from.bytes(file.path) })).sort((a, b) => ordinal(a.name, b.name)));
}
if (failures.length > 0) {
  console.error(['Nothing was written. A file a specification names cannot be found:', ...failures.map((line) => `- ${line}`)].join('\n'));
  process.exit(1);
}

for (const [tool, files] of copies) {
  const folder = `definitions/${tool}/`;
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  for (const file of files) writeFileSync(folder + file.name, file.bytes);
  writeFileSync(folder + record, `# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with \`npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]\`; both refs default to \`origin/develop\`.
- Check the copies against this record, and \`package.json\` against the copies, with \`npm run sync-definitions -- --check\`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
${files.map((file) => `| \`${file.name}\` | \`${file.from.name}\` | \`${file.path}\` | \`${file.from.commit}\` | \`${sha256(file.bytes)}\` |`).join('\n')}
`);
}
writeFileSync('package.json', manifestText());
console.log(`Copied ${[...copies.values()].flat().length} files of ${copies.size} tool types, and wrote the contributions of ${folders().length} to package.json.`);
