import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Source } from '../../../src/core/frame/toolType';
import { harness, show, type } from './pageSupport';

// The page draws a large document in time: the controls of NIST SP 800-53, 1,034 items and 1,582
// requirements, as the extension sends them, within the four seconds the standalone host holds
// opening it to (its NistControlsTests), in the simulated browser. Opened as its registration
// leaves it, its twenty families collapsed, and with every one of them expanded, all 2,616 boxes;
// drawn again for the next view, which builds again only the boxes whose content changed.

const folder = 'examples/hierarchical-requirement/nist-sp-800-53';
const source: Source = {
  fileName: 'C:/work/nist-sp-800-53.md',
  text: readFileSync(`${folder}/nist-sp-800-53.md`, 'utf8'),
  registration: readFileSync(`${folder}/nist-sp-800-53.adp`, 'utf8'),
};
const limit = 4000;

describe('the controls of NIST SP 800-53 on the page', () => {
  it.each([
    ['as opened, every family collapsed', source, 20],
    ['with every family expanded', { ...source, registration: source.registration!.replace(/collapsed:[\s\S]*?(?=filters:)/, '') }, 2616],
  ])('are drawn %s, and drawn again, each within four seconds', (_name, from, boxes) => {
    const view = type.view(from, {});
    const { page } = harness();
    const first = performance.now();
    show(page, view, 1);
    const drawn = performance.now() - first;
    expect(document.querySelectorAll('.hs-box')).toHaveLength(boxes);
    expect(drawn, `Drawing took ${drawn.toFixed(0)} ms.`).toBeLessThan(limit);

    const changed = type.view({ ...from, text: from.text.replaceAll('REQ-1582 ', 'REQ-1582 Changed by an agent: ') }, {});
    const again = performance.now();
    show(page, changed, 2);
    const redrawn = performance.now() - again;
    expect(redrawn, `Drawing the change took ${redrawn.toFixed(0)} ms.`).toBeLessThan(limit);
  }, 30_000);
});
