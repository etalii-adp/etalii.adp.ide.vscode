import type { FromToolbox, ToToolbox } from '../../core/frame/protocol';
import { Toolbox } from './toolbox';
import './toolbox.css';

// The ADP Toolbox view: the entries of the active diagram's type, and the messages between it and the extension.

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscode = acquireVsCodeApi();
const send = (message: FromToolbox): void => vscode.postMessage(message);
const toolbox = new Toolbox(document.body, (entry) => send({ v: 2, type: 'add', entry }));
window.addEventListener('message', (event: MessageEvent<ToToolbox>) => {
  if (event.data.type === 'entries') toolbox.show(event.data.entries, event.data.empty);
});
send({ v: 2, type: 'ready' });
