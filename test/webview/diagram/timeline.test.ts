import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Source } from '../../../src/core/frame/toolType';
import { Canvas } from '../../../src/webview/diagram/canvas';
import { diagram } from '../support';

// The host test of etalii.adp spec 091, task T031, found the overview example's last row under the time ruler when it was
// first shown: the document was placed a margin down at a readable zoom, though it all but fitted the room above the ruler.

const type = diagram('timeline');
const source: Source = { fileName: 'marvel-universe-overview.tml', text: readFileSync('examples/timeline/marvel-universe-overview/marvel-universe-overview.tml', 'utf8') };

describe('a timeline\'s canvas, first shown', () => {
  const sizes = ['clientWidth', 'clientHeight'].map((name) => [name, Object.getOwnPropertyDescriptor(Element.prototype, name)] as const);
  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 800 });
  });
  afterAll(() => {
    for (const [name, descriptor] of sizes) if (descriptor) Object.defineProperty(Element.prototype, name, descriptor);
  });

  it('keeps the last row of a document that all but fits clear of the time ruler', () => {
    document.body.replaceChildren();
    const canvas = new Canvas(document.body, () => undefined);
    const view = type.view(source, { scales: type.fittedScales!(source) });
    canvas.receive({ v: 2, type: 'view', origin: type.origin, kind: 'diagram', view, actions: [], version: 1 });
    const [, ty, scale] = /translate\(\S+ (\S+)\) scale\((\S+)\)/.exec(document.querySelector('.adp-world')!.getAttribute('transform')!)!.map(Number);
    const lowest = Math.max(...view.nodes.map((node) => node.box.y + node.box.height));
    expect(ty + view.nodes.reduce((top, node) => Math.min(top, node.box.y), Infinity) * scale).toBeGreaterThanOrEqual(0);
    expect(ty + lowest * scale).toBeLessThanOrEqual(800 - 23);
  });
});
