import { defineConfig } from 'vitest/config';

// Two of the three test levels: the core without Visual Studio Code, and the webview in a simulated
// browser. The third, the plug-in in a real Visual Studio Code, is `npm run test:vscode`.
export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: { junit: 'reports/unit.xml' },
    projects: [
      { test: { name: 'core', environment: 'node', include: ['test/core/**/*.test.ts', 'test/extension/**/*.test.ts'] } },
      { test: { name: 'webview', environment: 'jsdom', include: ['test/webview/**/*.test.ts'] } },
      // The repository's own commands, each run as a child process against temporary git repositories.
      { test: { name: 'scripts', environment: 'node', include: ['test/scripts/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 60_000 } },
    ],
  },
});
