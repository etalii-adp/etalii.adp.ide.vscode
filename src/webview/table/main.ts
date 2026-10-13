import type { FromCanvas, ToCanvas } from '../../core/frame/protocol';
import './table.css';
import { Table } from './table';

// The entry point of a designer's webview: one table, and the messages between it and the extension.

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscode = acquireVsCodeApi();
const table = new Table(document.body, (message: FromCanvas) => vscode.postMessage(message));
window.addEventListener('message', (event: MessageEvent<ToCanvas>) => table.receive(event.data));
// While a text box has the focus, keys such as Delete and F2 are its own and not the designer's.
const typing = (target: EventTarget | null): boolean => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
document.addEventListener('focusin', (event) => {
  if (typing(event.target)) vscode.postMessage({ v: 2, type: 'editing', active: true } satisfies FromCanvas);
});
document.addEventListener('focusout', (event) => {
  if (typing(event.target)) vscode.postMessage({ v: 2, type: 'editing', active: false } satisfies FromCanvas);
});
vscode.postMessage({ v: 2, type: 'ready' } satisfies FromCanvas);
