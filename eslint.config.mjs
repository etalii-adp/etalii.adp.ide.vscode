import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'out', 'node_modules', 'reports', '.vscode-test', '.debug', 'examples', 'fixtures'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**/*.ts'],
    rules: {
      // The core knows files, models, rules and edits, and nothing of Visual Studio Code or a browser.
      'no-restricted-imports': ['error', { patterns: ['vscode', '**/extension/**', '**/webview/**'] }],
      'no-restricted-globals': ['error', 'document', 'window'],
    },
  },
  {
    files: ['src/webview/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['vscode', '**/extension/**'] }],
    },
  },
);
