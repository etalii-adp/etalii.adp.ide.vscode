import tseslint from 'typescript-eslint';

// The core knows files, models, rules and edits, and nothing of Visual Studio Code or a browser.
const editor = { group: ['vscode', '**/extension/**', '**/webview/**'] };
// The core runs wherever the plug-in's two halves run; Node's own modules are for two files of it.
const node = { group: ['node:*', 'node:*/**'], message: 'In src/core only fbl/files/nodeFiles.ts and fbl/history/digest.ts import a node: module.' };
// The plug-in's FBL implementation is reached at one place, what `activate` returns (etalii.adp spec 009).
const fbl = { group: ['**/fbl', '**/fbl/**'], message: 'Only src/extension/extension.ts and the tests import the FBL implementation.' };

export default tseslint.config(
  { ignores: ['dist', 'out', 'node_modules', 'reports', '.vscode-test', '.debug', 'examples', 'fixtures'] },
  ...tseslint.configs.recommended,
  {
    ignores: ['src/core/**', 'src/webview/**', 'src/extension/extension.ts', 'test/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [fbl] }],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/fbl/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [editor, node, fbl] }],
      'no-restricted-globals': ['error', 'document', 'window'],
    },
  },
  {
    files: ['src/core/fbl/**/*.ts'],
    ignores: ['src/core/fbl/files/nodeFiles.ts', 'src/core/fbl/history/digest.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [editor, node] }],
      'no-restricted-globals': ['error', 'document', 'window'],
    },
  },
  {
    files: ['src/core/fbl/files/nodeFiles.ts', 'src/core/fbl/history/digest.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [editor] }],
      'no-restricted-globals': ['error', 'document', 'window'],
    },
  },
  {
    files: ['src/webview/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['vscode', '**/extension/**'] }, fbl] }],
    },
  },
);
