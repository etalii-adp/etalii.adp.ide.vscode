import type { FromCanvas, ToCanvas } from '../../core/frame/protocol';
import { gartnerHypecycleGraphNotation } from '../gartner-hypecycle-graph/notation';
import { Canvas } from './canvas';
import './canvas.css';
import { registerNotation } from './notation';

// The entry point of a diagram's webview: every notation this plug-in brings, one canvas, and the
// messages between it and the extension.

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

registerNotation(gartnerHypecycleGraphNotation);

const vscode = acquireVsCodeApi();
const canvas = new Canvas(document.body, (message: FromCanvas) => vscode.postMessage(message));
window.addEventListener('message', (event: MessageEvent<ToCanvas>) => canvas.receive(event.data));
// While a text box has the focus, keys such as Delete and F2 are its own and not the diagram's.
const typing = (target: EventTarget | null): boolean => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
document.addEventListener('focusin', (event) => {
  if (typing(event.target)) vscode.postMessage({ v: 1, type: 'editing', active: true } satisfies FromCanvas);
});
document.addEventListener('focusout', (event) => {
  if (typing(event.target)) vscode.postMessage({ v: 1, type: 'editing', active: false } satisfies FromCanvas);
});
vscode.postMessage({ v: 1, type: 'ready' } satisfies FromCanvas);