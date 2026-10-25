import tseslint from 'typescript-eslint';

// The layer rule (etalii.adp spec 027, contracts/tool-type.md): what each of the three layers may import.

// The core knows files, models, rules and edits, and nothing of Visual Studio Code or a browser.
const editor = { group: ['vscode', '**/extension/**', '**/webview/**'], message: 'src/core imports neither vscode, src/extension nor src/webview.' };
// The core runs wherever the plug-in's two halves run; Node's own modules are for two files of it.
const node = { group: ['node:*', 'node:*/**'], message: 'In src/core only fbl/files/nodeFiles.ts and fbl/history/digest.ts import a node: module.' };
const dom = ['error', 'document', 'window'];

// A webview draws what it is sent. Of the core it sees the frame, the scene, the table view and the hierarchy view, and nothing that reads a definition.
const webview = [
  { group: ['vscode', '**/extension/**'], message: 'src/webview imports neither vscode nor src/extension.' },
  {
    group: [
      '**/core/*',
      '!**/core/frame',
      '!**/core/scene',
      '!**/core/tool',
    ],
    message: 'src/webview imports only src/core/frame and src/core/scene, so nothing that reads a definition.',
  },
  // geometry.ts is arithmetic on points and paths, and tidyTree.ts on the boxes of a tree: they read nothing, so the webview may call them.
  { group: ['**/core/tool/*', '!**/core/tool/tableView', '!**/core/tool/hierarchyView'], message: 'Of src/core/tool a webview imports the types of tableView.ts and hierarchyView.ts only: what a table and a page of boxes draw and ask.' },
  { group: ['**/core/frame/**', '**/core/scene/**', '**/core/tool/tableView', '**/core/tool/hierarchyView', '!**/core/scene/geometry', '!**/core/scene/tidyTree'], allowTypeImports: true, message: 'src/webview imports only types from src/core/frame and src/core/scene, and the functions of src/core/scene/geometry and tidyTree.' },
];

export default tseslint.config(
  { ignores: ['dist', 'out', 'node_modules', 'reports', '.vscode-test', '.debug', 'examples', 'fixtures', 'vendor'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/fbl/files/nodeFiles.ts', 'src/core/fbl/history/digest.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [editor, node] }],
      'no-restricted-globals': dom,
    },
  },
  {
    files: ['src/core/fbl/files/nodeFiles.ts', 'src/core/fbl/history/digest.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [editor] }],
      'no-restricted-globals': dom,
    },
  },
  {
    files: ['src/extension/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/webview/**'], message: 'src/extension does not import src/webview.' }] }],
      'no-restricted-globals': dom,
    },
  },
  {
    files: ['src/webview/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: webview }],
    },
  },
);
