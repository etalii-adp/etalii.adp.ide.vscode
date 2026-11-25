import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

// The page's loop list in a simulated browser (etalii.adp spec 074, FR-035 (j)): a loop pinned in the right column can be
// let go, and is seen to be let go even while the pointer is still on its row. The page is one of the desktop host's own
// exports, which this host's pages are held to byte for byte; the canvas draws nothing here, since only the list's state
// is asked about.
const PAGE = readFileSync('fixtures/tools/causal-loop-diagram/flow-pages/mental-health.html', 'utf8');

class Ignored {
  observe(): void {}
}

/** A 2D context whose every call does nothing and whose every measure is zero. */
function silentContext(): unknown {
  const handler: ProxyHandler<object> = {
    get: (_, key) => (key === 'measureText' ? () => ({ width: 0 }) : key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => undefined),
    set: () => true,
  };
  return new Proxy({}, handler);
}

function open(): { window: JSDOM['window']; state: (expression: string) => unknown; rows: () => HTMLElement[] } {
  const dom = new JSDOM(PAGE, {
    runScripts: 'dangerously',
    pretendToBeVisual: false,
    beforeParse(window) {
      Object.assign(window, { ResizeObserver: Ignored, requestAnimationFrame: () => 0 });
      window.HTMLCanvasElement.prototype.getContext = (() => silentContext()) as never;
    },
  });
  const { window } = dom;
  return {
    window,
    // The page's state is the script's own lexical bindings, which an eval in its window reads.
    state: (expression) => window.eval(expression) as unknown,
    rows: () => [...window.document.querySelectorAll<HTMLElement>('#loops .loop')],
  };
}

function hoverAndClick(window: JSDOM['window'], row: HTMLElement): void {
  row.dispatchEvent(new window.MouseEvent('mouseenter'));
  row.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

describe('a loop pinned on the flow page', () => {
  it('is let go by a second click, and no longer traced while the pointer stays on its row', () => {
    const { window, state, rows } = open();
    const row = rows()[0];
    hoverAndClick(window, row);
    expect(state('pinnedLoop === loops[0] && activeLoop() === loops[0]')).toBe(true);
    expect(row.classList.contains('on')).toBe(true);

    row.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(state('pinnedLoop')).toBeNull();
    expect(state('activeLoop()')).toBeNull();
    expect(row.classList.contains('on')).toBe(false);
  });

  it('is let go by the Clear button, which shows only while a loop is pinned', () => {
    const { window, state, rows } = open();
    const clear = window.document.getElementById('loopsClear') as HTMLButtonElement;
    expect(clear.hidden).toBe(true);
    hoverAndClick(window, rows()[1]);
    expect(clear.hidden).toBe(false);
    clear.click();
    expect(state('pinnedLoop === null && activeLoop() === null')).toBe(true);
    expect(clear.hidden).toBe(true);
  });

  it('is let go by Esc', () => {
    const { window, state, rows } = open();
    hoverAndClick(window, rows()[0]);
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(state('pinnedLoop')).toBeNull();
  });

  it('moves with a click on another loop', () => {
    const { window, state, rows } = open();
    hoverAndClick(window, rows()[0]);
    hoverAndClick(window, rows()[1]);
    expect(state('pinnedLoop === loops[1]')).toBe(true);
    expect(rows().map((row) => row.classList.contains('on'))).toEqual(rows().map((_, k) => k === 1));
  });
});
