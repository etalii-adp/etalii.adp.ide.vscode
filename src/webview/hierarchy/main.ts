import type { FromCanvas, ToCanvas } from '../../core/frame/protocol';
import './hierarchy.css';
import { HierarchyPage } from './page';

// The entry point of the webview of a designer of the `hierarchy` kind: one page of boxes, and the
// messages between it and the extension.

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscode = acquireVsCodeApi();
const page = new HierarchyPage(document.body, (message: FromCanvas) => vscode.postMessage(message));
window.addEventListener('message', (event: MessageEvent<ToCanvas>) => page.receive(event.data));
vscode.postMessage({ v: 2, type: 'ready' } satisfies FromCanvas);
