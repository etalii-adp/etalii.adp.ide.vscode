// Installs the build's dependencies when they are not there, or are older than package-lock.json,
// so building, testing and starting a debug session work from a fresh clone without a step before
// them. It uses nothing but Node itself, since it runs before anything is installed.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

const installed = 'node_modules/.package-lock.json';
const upToDate = existsSync(installed) && statSync(installed).mtimeMs >= statSync('package-lock.json').mtimeMs;
if (!upToDate) {
  console.log(existsSync('node_modules') ? 'The dependencies are older than package-lock.json; installing them again.' : 'The dependencies are not installed yet; installing them.');
  const result = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error('The dependencies could not be installed. Run `npm ci` in this folder to see why.');
    process.exit(result.status ?? 1);
  }
}
