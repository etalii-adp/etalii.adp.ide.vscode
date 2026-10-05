import type { Field } from '../../core/frame/diagramType';
import type { FromProperties, ToProperties } from '../../core/frame/protocol';
import { html } from '../canvas/dom';
import { gridOf } from './controls';
import './properties.css';

// ADP Properties: the rows the active diagram's type gives for its selection, grouped, each with
// the control the definition asks for. An edit is sent to the extension, which makes the same
// undoable change to the file a gesture on the canvas would; a refusal is shown at its field.

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscode = acquireVsCodeApi();
const send = (message: FromProperties): void => vscode.postMessage(message);

const root = html('div', { class: 'adp-properties' });
document.body.append(root);

let target: string | undefined;
let shown = '';
/** The last refusal, kept at its field while the same element stays selected. */
let refusal: { field: string; sentence: string } | undefined;

function showRefusal(): void {
  for (const row of root.querySelectorAll('[data-field]')) {
    const line = row.querySelector('.adp-field-refusal') as HTMLElement | null;
    if (!line) continue;
    const mine = refusal !== undefined && row.getAttribute('data-field') === refusal.field;
    line.textContent = mine ? refusal!.sentence : '';
    line.hidden = !mine;
  }
}

function show(fields: readonly Field[], empty: string | undefined, force: boolean): void {
  // What is being typed is kept when the same rows arrive again with the same values.
  const key = JSON.stringify([target, fields, empty]);
  if (key !== shown || force) {
    shown = key;
    root.replaceChildren(...gridOf(fields, empty, (field, value) => {
      if (target !== undefined) send({ v: 1, type: 'setField', target, field, value });
    }));
  }
  showRefusal();
}

let pendingForce = false;
window.addEventListener('message', (event: MessageEvent<ToProperties>) => {
  const message = event.data;
  if (message.type === 'fields') {
    if (message.target !== target) refusal = undefined;
    target = message.target;
    show(message.fields, message.empty, pendingForce);
    pendingForce = false;
  } else if (message.type === 'fieldOutcome') {
    refusal = message.refused === undefined ? undefined : { field: message.field, sentence: message.refused };
    // A refused edit leaves the file as it was, so the rows that follow show what the file says again.
    pendingForce = message.refused !== undefined;
    showRefusal();
  }
});
send({ v: 1, type: 'ready' });
