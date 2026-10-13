import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
// A page that shows the canvas, or the table of a designer, outside Visual Studio Code, on one example, for a look at the drawing.
// The tool type is the one read from definitions/, as in the plug-in.
await build({ entryPoints: ['src/extension/toolTypes.ts'], bundle: true, format: 'cjs', platform: 'node', outfile: '.debug/core.cjs', logLevel: 'error' });
const { toolTypesAt } = createRequire(import.meta.url)('../.debug/core.cjs');
const example = process.argv[2] ?? 'examples/gartner-hypecycle-graph/technology-trends/technology-trends.ghg';
const theme = process.argv[3] ?? 'light';
const text = readFileSync(example, 'utf8');
const type = toolTypesAt('.').find((candidate) => candidate.claimed(example, text) && candidate.claims.some((claim) => claim.extensions.some((extension) => example.endsWith('.' + extension))));
const registration = example.replace(/\.[^.]+$/, '.adp');
const source = { fileName: example, text: readFileSync(example, 'utf8'), ...(existsSync(registration) ? { registration: readFileSync(registration, 'utf8') } : {}) };
const message = { v: 2, type: 'view', origin: type.origin, kind: type.kind, view: type.view(source, {}), actions: type.kind === 'designer' ? type.actions(source, []) : [], version: 1 };
const bundle = type.kind === 'designer' ? 'table' : 'canvas';
const dark = theme === 'dark';
const vars = dark
  ? '--vscode-editor-background:#1f1f1f;--vscode-editor-foreground:#cccccc;--vscode-editorWidget-background:#252526;--vscode-editorWidget-border:#454545;--vscode-descriptionForeground:#9d9d9d;--vscode-focusBorder:#0078d4;'
  : '--vscode-editor-background:#ffffff;--vscode-editor-foreground:#3b3b3b;--vscode-editorWidget-background:#f8f8f8;--vscode-editorWidget-border:#c8c8c8;--vscode-descriptionForeground:#717171;--vscode-focusBorder:#005fb8;';
mkdirSync('.debug', { recursive: true });
writeFileSync('.debug/harness.html', `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>:root{${vars}--vscode-font-family:Segoe UI,sans-serif;--vscode-font-size:13px}</style>
<link rel="stylesheet" href="../dist/webview/${bundle}.css"></head><body class="vscode-${theme}">
<script>window.sent=[];window.acquireVsCodeApi=()=>({postMessage:(m)=>window.sent.push(m)});</script>
<script src="../dist/webview/${bundle}.js"></script>
<script>window.postMessage(${JSON.stringify(message)}, '*');</script></body></html>`);
const { view } = message;
console.log('wrote .debug/harness.html', (view.nodes ?? view.elements ?? view.rows).length, 'elements', (view.edges ?? view.relations ?? view.properties).length, type.kind === 'designer' ? 'columns' : 'relations');