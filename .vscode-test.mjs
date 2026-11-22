// The third test level: the packaged plug-in in a real Visual Studio Code.
// `npm run test:vscode` packages the .vsix, unpacks it to .vscode-test/plugin and compiles the tests
// to out/ first, so what runs here is the plug-in as a user installs it.
import { defineConfig } from '@vscode/test-cli';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// The reporter runs inside Visual Studio Code, whose working directory is not this one.
mkdirSync('reports', { recursive: true });

export default defineConfig({
  files: 'out/test/vscode/**/*.test.js',
  extensionDevelopmentPath: '.vscode-test/plugin/extension',
  workspaceFolder: '.vscode-test/examples',
  env: { ADP_TEST: '1' },
  launchArgs: ['--disable-extensions'],
  mocha: {
    ui: 'tdd',
    timeout: 60000,
    reporter: 'xunit',
    reporterOptions: { output: resolve('reports/vscode.xml') },
  },
});
