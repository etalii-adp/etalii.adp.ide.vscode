// What the tests of the webviews share: the tool types read from `definitions/`, as the extension
// reads them, and the pointer of a simulated browser. There is no layout there, so a surface is at
// the origin at a zoom of one and a pointer position in pixels is the same position in canvas units.
import type { FromCanvas } from '../../src/core/frame/protocol';
import type { DiagramToolType, EditRequest } from '../../src/core/frame/toolType';
import { plugins } from '../../src/core/plugins/index';
import { definitionOf, diagramOf } from '../core/tool/support';

/** The diagram of a folder of `definitions/`, with the plugins this host carries. */
export const diagram = (folder: string): DiagramToolType => diagramOf(definitionOf(folder), plugins);

export const requestsOf = (sent: readonly FromCanvas[]): EditRequest[] =>
  sent.filter((message) => message.type === 'edit').map((message) => (message as Extract<FromCanvas, { type: 'edit' }>).request as EditRequest);

export const group = (id: string): Element => document.querySelector(`.adp-content [data-id="${id}"]`)!;

export const pointer = (target: EventTarget, kind: string, x: number, y: number, button = 0): void => {
  target.dispatchEvent(new MouseEvent(kind, { bubbles: true, cancelable: true, clientX: x, clientY: y, button }));
};
