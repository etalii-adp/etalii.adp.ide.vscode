// Packages the plug-in as etalii-adp-<version>.vsix, the name every ADP host gives its download.
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, readdirSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
for (const file of readdirSync('.')) {
  if (file.endsWith('.vsix')) rmSync(file);
}
const file = `etalii-adp-${version}.vsix`;
const result = spawnSync('npx', ['vsce', 'package', '--no-dependencies', '--out', file], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);