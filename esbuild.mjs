// Bundles the plug-in: one script for the extension host and one per webview.
// `--watch` rebuilds on change, `--production` minifies. Source maps are always written, so
// breakpoints bind in the original source in both halves.
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  sourcemap: true,
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions[]} */
const builds = [
  {
    ...shared,
    entryPoints: ['src/extension/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['vscode'],
  },
  {
    ...shared,
    entryPoints: { canvas: 'src/webview/canvas/main.ts' },
    outdir: 'dist/webview',
    platform: 'browser',
    target: 'es2022',
    format: 'iife',
  },
];

if (watch) {
  const contexts = await Promise.all(builds.map((build) => esbuild.context(build)));
  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all(builds.map((build) => esbuild.build(build)));
}
