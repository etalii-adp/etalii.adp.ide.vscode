// Fetches the ADP tool language's server for Visual Studio Code (etalii.adp spec 035, T109): the WebAssembly build of
// `atd-lsp` with its JavaScript glue, and the walk with the examples it edits, from the desktop host's release that
// vendor/atd-lsp.lock names. Each file is checked against the SHA-256 the lock states before it is unpacked into
// vendor/atd-lsp/ and vendor/atd-walk/, which are not committed. `--if-missing` does nothing when that release is
// unpacked already. ATD_RELEASE_DIR takes the files from a folder instead of downloading them, for a build without
// network; they are checked all the same.
import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const lock = JSON.parse(readFileSync('vendor/atd-lsp.lock', 'utf8'));
const folders = { 'atd-lsp-wasm.zip': 'vendor/atd-lsp', 'atd-walk.zip': 'vendor/atd-walk' };
const stamp = 'vendor/atd-lsp/.release';

if (process.argv.includes('--if-missing') && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === lock.release) {
  process.exit(0);
}

for (const [file, expected] of Object.entries(lock.files)) {
  let bytes;
  if (process.env.ATD_RELEASE_DIR) {
    bytes = readFileSync(join(process.env.ATD_RELEASE_DIR, file));
  } else {
    const url = `https://github.com/${lock.repository}/releases/download/${lock.release}/${file}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`${url}: ${response.status} ${response.statusText}`);
      process.exit(1);
    }
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) {
    console.error(`${file} of ${lock.release} has SHA-256 ${actual}; vendor/atd-lsp.lock states ${expected}.`);
    process.exit(1);
  }
  const folder = folders[file];
  if (!folder) {
    console.error(`vendor/atd-lsp.lock names ${file}, which this script does not know where to put.`);
    process.exit(1);
  }
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  new AdmZip(bytes).extractAllTo(folder, true);
  console.log(`${file} of ${lock.release} verified and unpacked to ${folder}`);
}
writeFileSync(stamp, `${lock.release}\n`);
