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
vscode.postMessage({ v: 1, type: 'ready' } satisfies FromCanvas);