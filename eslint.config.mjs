import tseslint from 'typescript-eslint';

// The layer rule (etalii.adp spec 027, contracts/tool-type.md): what each of the three layers may import.

// The core knows files, models, rules and edits, and nothing of Visual Studio Code or a browser.
const editor = { group: ['vscode', '**/extension/**', '**/webview/**'], message: 'src/core imports neither vscode, src/extension nor src/webview.' };
// The core runs wherever the plug-in's two halves run; Node's own modules are for two files of it.
const node = { group: ['node:*', 'node:*/**'], message: 'In src/core only fbl/files/nodeFiles.ts and fbl/history/digest.ts import a node: module.' };
const dom = ['error', 'document', 'window'];

// A webview draws what it is sent. Of the core it sees the frame and the scene, and nothing that reads a definition.
const webview = [
  { group: ['vscode', '**/extension/**'], message: 'src/webview imports neither vscode nor src/extension.' },
  {
    group: [
      '**/core/*',
      '!**/core/frame',
      '!**/core/scene',
      // The hand-coded diagrams draw from their own core folders; User Story 4 of spec 027 removes these three.
      '!**/core/diagram',
      '!**/core/gartner-hypecycle-graph',
      '!**/core/agent-behavior-modelling',
    ],
    message: 'src/webview imports only src/core/frame and src/core/scene, so nothing that reads a definition.',
  },
  { group: ['**/core/frame/**', '**/core/scene/**'], allowTypeImports: true, message: 'src/webview imports only types from src/core/frame and src/core/scene.' },
];

export default tseslint.config(
  { ignores: ['dist', 'out', 'node_modules', 'reports', '.vscode-test', '.debug', 'examples', 'fixtures'] },
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
