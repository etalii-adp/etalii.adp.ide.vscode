import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
// A page that shows the canvas outside Visual Studio Code, on one example, for a look at the drawing.
await build({ entryPoints: ['src/core/gartner-hypecycle-graph/index.ts'], bundle: true, format: 'cjs', platform: 'node', outfile: '.debug/core.cjs', logLevel: 'error' });
const { gartnerHypecycleGraph: type } = createRequire(import.meta.url)('../.debug/core.cjs');
const example = process.argv[2] ?? 'examples/gartner-hypecycle-graph/technology-trends/technology-trends.ghg';
const theme = process.argv[3] ?? 'light';
const source = { text: readFileSync(example, 'utf8') };
const message = { v: 1, type: 'view', origin: type.origin, view: type.view(source, {}), toolbox: type.toolbox(source), actions: [], version: 1 };
const dark = theme === 'dark';
const vars = dark
  ? '--vscode-editor-background:#1f1f1f;--vscode-editor-foreground:#cccccc;--vscode-editorWidget-background:#252526;--vscode-editorWidget-border:#454545;--vscode-descriptionForeground:#9d9d9d;--vscode-focusBorder:#0078d4;'
  : '--vscode-editor-background:#ffffff;--vscode-editor-foreground:#3b3b3b;--vscode-editorWidget-background:#f8f8f8;--vscode-editorWidget-border:#c8c8c8;--vscode-descriptionForeground:#717171;--vscode-focusBorder:#005fb8;';
mkdirSync('.debug', { recursive: true });
writeFileSync('.debug/harness.html', `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>:root{${vars}--vscode-font-family:Segoe UI,sans-serif;--vscode-font-size:13px}</style>
<link rel="stylesheet" href="../dist/webview/canvas.css"></head><body class="vscode-${theme}">
<script>window.sent=[];window.acquireVsCodeApi=()=>({postMessage:(m)=>window.sent.push(m)});</script>
<script src="../dist/webview/canvas.js"></script>
<script>window.postMessage(${JSON.stringify(message)}, '*');</script></body></html>`);
console.log('wrote .debug/harness.html', message.view.elements.length, 'elements', message.view.relations.length, 'relations');