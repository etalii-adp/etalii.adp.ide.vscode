import { beforeEach, describe, expect, it } from 'vitest';
import type { FromCanvas } from '../../../src/core/frame/protocol';
import type { Source } from '../../../src/core/frame/toolType';
import type { HierarchyPage } from '../../../src/webview/hierarchy/page';
import { pointer } from '../support';
import { applied, dblclick, harness, key, requests, show, source, viewOf } from './pageSupport';

// The widths of the columns of levels (DESL 7.7.1, standalone #696, spec 036 User Story 7): the right
// edge of a level's box is dragged, every box of that depth following the pointer, and letting go
// keeps the width as the gesture the view names; a double click or Home gives the page's own width
// again, the arrow keys move a focused edge by 16 pixels, a refused gesture puts the column back,
// and a width the page cannot read keeps the page's own.

let page: HierarchyPage;
let sent: FromCanvas[];

beforeEach(() => {
  ({ page, sent } = harness());
});

const nl = source.text.includes('\r\n') ? '\r\n' : '\n';
/** The example with widths kept for its columns, as the registration's block writes them. */
const withWidths = (...lines: string[]): Source => ({ ...source, registration: `${source.registration!}widths:${nl}${lines.map((line) => `  ${line}${nl}`).join('')}` });
const levelBox = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-node="${id}"] > .hs-level-box`)!;
const widthOf = (id: string): string => levelBox(id).style.width;
const edge = (column: number): HTMLElement => document.querySelector<HTMLElement>(`.hs-column-edge[data-column="${column}"]`)!;
const node = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-node="${id}"]`)!;
const childrenIds = (id: string): string[] => [...(node(id).querySelector(':scope > .hs-level-content')?.children ?? [])].map((child) => (child as HTMLElement).dataset.node ?? '').filter((child) => child !== '');
const widen = (width: number): void => {
  Object.defineProperty(document.querySelector('.hs-page'), 'clientWidth', { value: width, configurable: true });
  window.dispatchEvent(new Event('resize'));
};
/** Answers the `index`th edit the page sent, the last by default, as the extension does after the view it makes. */
function answer(result: 'applied' | 'refused', index?: number): void {
  const edits = sent.filter((message) => message.type === 'edit') as Extract<FromCanvas, { type: 'edit' }>[];
  const edit = index === undefined ? edits.at(-1)! : edits[index];
  page.receive({ v: 2, type: 'outcome', seq: edit.seq, result, ...(result === 'refused' ? { sentence: 'The document already has `column/1`.' } : {}) });
}
/** Drags a column's edge by `by` pixels, letting it go unless `end` is false. */
function drag(column: number, by: number, end = true): void {
  pointer(edge(column), 'pointerdown', 500, 5);
  pointer(window, 'pointermove', 500 + by, 5);
  if (end) pointer(window, 'pointerup', 500 + by, 5);
}

describe('the widths of the columns', () => {
  it('draws each level\'s box at its column\'s kept width, and the page\'s own where none is kept, or one that is no number or outside the range', () => {
    show(page, viewOf({}, withWidths('2: 400')));
    expect([widthOf('ITEM-0001'), widthOf('ITEM-0004'), widthOf('ITEM-0002'), widthOf('ITEM-0003')]).toEqual(['240px', '240px', '400px', '240px']);
    expect(levelBox('ITEM-0002').style.flex).toBe('0 0 400px');
    show(page, viewOf({}, withWidths('1: wide', '2: 50', '3: 2001')), 2);
    expect([widthOf('ITEM-0001'), widthOf('ITEM-0002'), widthOf('ITEM-0003')]).toEqual(['240px', '240px', '240px']);
  });

  it('is a separator with its name, its width and its range, which the keys reach', () => {
    show(page, viewOf({}, withWidths('2: 400')));
    const second = edge(2);
    expect(second.parentElement).toBe(levelBox('ITEM-0002'));
    expect([second.getAttribute('role'), second.getAttribute('aria-orientation'), second.getAttribute('aria-label'), second.getAttribute('tabindex')]).toEqual(['separator', 'vertical', 'Width of column 2', '0']);
    expect([second.getAttribute('aria-valuenow'), second.getAttribute('aria-valuemin'), second.getAttribute('aria-valuemax')]).toEqual(['400', '120', '2000']);
    expect(edge(1).getAttribute('aria-valuenow')).toBe('240');
    // Every level of the first column has its edge.
    expect(document.querySelectorAll('.hs-column-edge[data-column="1"]')).toHaveLength(3);
  });

  it('follows a drag of a column\'s edge in every box of that depth, and keeps the width when it is let go, as one gesture', () => {
    show(page, viewOf());
    drag(1, 60, false);
    expect([widthOf('ITEM-0001'), widthOf('ITEM-0004'), widthOf('ITEM-0006'), widthOf('ITEM-0002')]).toEqual(['300px', '300px', '300px', '240px']);
    expect(edge(1).getAttribute('aria-valuenow')).toBe('300');
    expect(requests(sent)).toEqual([]);
    pointer(window, 'pointerup', 560, 5);
    expect(requests(sent)).toEqual([{ kind: 'operation', operation: 'addColumnWidth', args: { level: '1', width: 300 } }]);
    expect(widthOf('ITEM-0001')).toBe('300px');

    // The view that follows keeps it; the registration holds it as the standalone host writes it.
    const after = applied(source, requests(sent)[0]);
    expect(after.registration).toBe(`${source.registration!}widths:${nl}  1: 300${nl}`);
    show(page, viewOf({}, after), 2);
    expect(widthOf('ITEM-0004')).toBe('300px');
  });

  it('changes a kept width by its column, holds a width to the range, and sends nothing for a press that moved nothing', () => {
    show(page, viewOf({}, withWidths('2: 400')));
    const column = viewOf({}, withWidths('2: 400')).widths[0].id;
    drag(2, 2000);
    drag(1, 0);
    drag(1, -500);
    expect(requests(sent)).toEqual([
      { kind: 'operation', operation: 'setColumnWidth', on: [column], args: { width: 2000 } },
      { kind: 'operation', operation: 'addColumnWidth', args: { level: '1', width: 120 } },
    ]);
  });

  it('gives a kept column the page\'s own width again on a double click or Home, and the arrow keys move a focused edge by 16 pixels', () => {
    show(page, viewOf({}, withWidths('2: 400')));
    const column = viewOf({}, withWidths('2: 400')).widths[0].id;
    dblclick(edge(1));
    dblclick(edge(2));
    expect(widthOf('ITEM-0002')).toBe('240px');
    key(edge(1), { key: 'ArrowRight' });
    key(edge(1), { key: 'Home' });
    expect(key(edge(2), { key: 'Home' })).toBe(false);
    edge(3).focus();
    key(edge(3), { key: 'ArrowLeft' });
    // The first column keeps no width: a double click on it sends nothing. Home on a column whose width is on its way waits for its answer.
    expect(requests(sent)).toEqual([
      { kind: 'operation', operation: 'resetColumnWidth', on: [column] },
      { kind: 'operation', operation: 'addColumnWidth', args: { level: '1', width: 256 } },
      { kind: 'operation', operation: 'addColumnWidth', args: { level: '3', width: 224 } },
    ]);
    // The edge keeps the focus while the page is drawn again.
    expect(document.activeElement).toBe(edge(3));
  });

  it('puts a column back when its gesture is refused, and shows the width the next view brings', () => {
    show(page, viewOf());
    drag(1, 100);
    expect(widthOf('ITEM-0001')).toBe('340px');
    const seq = (sent.filter((message) => message.type === 'edit').at(-1) as Extract<FromCanvas, { type: 'edit' }>).seq;
    page.receive({ v: 2, type: 'outcome', seq, result: 'refused', sentence: 'The file changed.' });
    expect(widthOf('ITEM-0001')).toBe('240px');
    show(page, viewOf({}, withWidths('1: 500')), 2);
    expect(widthOf('ITEM-0001')).toBe('500px');
  });

  it('asks for one width of a column at a time: two quick presses on a new column add it, then set the last width once the first is answered', () => {
    show(page, viewOf());
    key(edge(1), { key: 'ArrowRight' });
    key(edge(1), { key: 'ArrowRight' });
    expect(requests(sent)).toEqual([{ kind: 'operation', operation: 'addColumnWidth', args: { level: '1', width: 256 } }]);
    expect(widthOf('ITEM-0001')).toBe('272px');
    // The view of the first comes before its answer: the column still shows the width wanted.
    const after = applied(source, requests(sent)[0]);
    show(page, viewOf({}, after), 2);
    expect(widthOf('ITEM-0001')).toBe('272px');
    expect(requests(sent)).toHaveLength(1);
    answer('applied');
    const column = viewOf({}, after).widths[0].id;
    expect(requests(sent)).toEqual([
      { kind: 'operation', operation: 'addColumnWidth', args: { level: '1', width: 256 } },
      { kind: 'operation', operation: 'setColumnWidth', on: [column], args: { width: 272 } },
    ]);
    show(page, viewOf({}, applied(after, requests(sent)[1])), 3);
    answer('applied');
    expect(widthOf('ITEM-0001')).toBe('272px');
    expect(requests(sent)).toHaveLength(2);
  });

  it('gives a column the page\'s own width, then adds the next width once the removal is answered', () => {
    const kept = withWidths('1: 400');
    show(page, viewOf({}, kept));
    const column = viewOf({}, kept).widths[0].id;
    key(edge(1), { key: 'Home' });
    key(edge(1), { key: 'ArrowRight' });
    expect(requests(sent)).toEqual([{ kind: 'operation', operation: 'resetColumnWidth', on: [column] }]);
    expect(widthOf('ITEM-0001')).toBe('256px');
    show(page, viewOf({}, applied(kept, requests(sent)[0])), 2);
    answer('applied');
    expect(requests(sent)).toEqual([
      { kind: 'operation', operation: 'resetColumnWidth', on: [column] },
      { kind: 'operation', operation: 'addColumnWidth', args: { level: '1', width: 256 } },
    ]);
  });

  it('keeps every press of a held key on a kept column, with one width on its way at a time', () => {
    let kept = withWidths('1: 400');
    show(page, viewOf({}, kept));
    const column = viewOf({}, kept).widths[0].id;
    for (let press = 0; press < 5; press += 1) key(edge(1), { key: 'ArrowRight' });
    expect(widthOf('ITEM-0001')).toBe('480px');
    expect(requests(sent)).toEqual([{ kind: 'operation', operation: 'setColumnWidth', on: [column], args: { width: 416 } }]);
    kept = applied(kept, requests(sent)[0]);
    show(page, viewOf({}, kept), 2);
    expect(widthOf('ITEM-0001')).toBe('480px');
    answer('applied');
    expect(requests(sent)).toEqual([
      { kind: 'operation', operation: 'setColumnWidth', on: [column], args: { width: 416 } },
      { kind: 'operation', operation: 'setColumnWidth', on: [column], args: { width: 480 } },
    ]);
    kept = applied(kept, requests(sent)[1]);
    show(page, viewOf({}, kept), 3);
    answer('applied');
    expect(requests(sent)).toHaveLength(2);
    expect(kept.registration).toContain('1: 480');
    expect(widthOf('ITEM-0001')).toBe('480px');
  });

  it('loses no press of a held key while the answers come between them', () => {
    let kept = withWidths('1: 400');
    show(page, viewOf({}, kept));
    let version = 1;
    let answered = 0;
    const answerNext = (): void => {
      kept = applied(kept, requests(sent)[answered]);
      show(page, viewOf({}, kept), (version += 1));
      answer('applied', answered);
      answered += 1;
    };
    for (let press = 0; press < 5; press += 1) {
      key(edge(1), { key: 'ArrowRight' });
      // No more than one width is on its way; the host answers every other press, the view first.
      expect(requests(sent).length - answered).toBeLessThanOrEqual(1);
      if (press % 2 === 1) answerNext();
      expect(widthOf('ITEM-0001')).toBe(`${400 + (press + 1) * 16}px`);
    }
    while (requests(sent).length > answered) answerNext();
    expect(requests(sent).map((request) => (request as { args?: { width?: number } }).args?.width)).toEqual([416, 432, 464, 480]);
    expect(kept.registration).toContain('1: 480');
    expect(widthOf('ITEM-0001')).toBe('480px');
  });

  it('puts a column back to the width it keeps when its gesture is refused, dropping what was wanted meanwhile', () => {
    show(page, viewOf({}, withWidths('1: 400')));
    key(edge(1), { key: 'ArrowRight' });
    key(edge(1), { key: 'ArrowRight' });
    expect(widthOf('ITEM-0001')).toBe('432px');
    answer('refused');
    expect(widthOf('ITEM-0001')).toBe('400px');
    expect(requests(sent)).toHaveLength(1);
    // The next press is asked for at once.
    key(edge(1), { key: 'ArrowLeft' });
    expect(requests(sent)).toHaveLength(2);
    expect(widthOf('ITEM-0001')).toBe('384px');
  });

  it('counts the kept widths in the levels that fit', () => {
    show(page, viewOf());
    // Room for two columns of levels beside the entries of the deepest.
    widen(280 + 2 * 240);
    expect(childrenIds('ITEM-0001')).toContain('ITEM-0002');
    show(page, viewOf({}, withWidths('1: 400')), 2);
    expect(childrenIds('ITEM-0001')).not.toContain('ITEM-0002');
    expect(document.querySelector('[data-node="ITEM-0001"] .hs-hidden-levels')).not.toBeNull();
    // Narrowed to the second level, the column at the left is the second's.
    show(page, viewOf({}, withWidths('2: 600')), 3);
    page.receive({ v: 2, type: 'reveal', id: 'ITEM-0002' });
    document.querySelector<HTMLButtonElement>('[data-node="ITEM-0002"] .hs-focus')!.click();
    expect(childrenIds('ITEM-0002')).not.toContain('ITEM-0003');
  });

  it('offers no edge on a document that cannot be changed', () => {
    show(page, viewOf({}, { ...source, text: source.text.replace('<!-- ded: 0.2 ', '<!-- ded: 0.3 ') }));
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(0);
  });
});
