// Unpacks the packaged plug-in to .vscode-test/plugin and copies the examples beside it, so the
// tests in a real Visual Studio Code run what a user installs and never edit the vendored examples.
import AdmZip from 'adm-zip';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

const vsix = readdirSync('.').find((file) => /^etalii-adp-.*\.vsix$/.test(file));
if (!vsix) {
  console.error('No etalii-adp-<version>.vsix found; run `npm run package` first.');
  process.exit(1);
}
rmSync('.vscode-test/plugin', { recursive: true, force: true });
rmSync('.vscode-test/examples', { recursive: true, force: true });
mkdirSync('.vscode-test/plugin', { recursive: true });
new AdmZip(vsix).extractAllTo('.vscode-test/plugin', true);
cpSync('examples', '.vscode-test/examples', { recursive: true });
cpSync('fixtures', '.vscode-test/examples/fixtures', { recursive: true });
console.log(`Unpacked ${vsix} to .vscode-test/plugin`);