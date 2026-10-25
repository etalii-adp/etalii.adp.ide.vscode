// How a box's controls stand, as the standalone host decides it (its `iconsLayout.ts`): one list of
// icons, in a row at the end of the first line when that line and every icon fit side by side,
// otherwise in a column at the box's right.

/** The size of a box's controls: every icon of its list, and its delete. */
export const ICON_SIZE = 20;
/** The space between a box's border and what it holds, on every side, and between its text and its controls. */
export const BOX_SPACING = 6;
/** The space between the parts of a box's first line: the grip, the collapse control, the number and the title. */
export const HEADER_GAP = 4;
/** The width of the grip a box is dragged by. */
export const GRIP_WIDTH = 14;

export type IconsLayout = 'row' | 'column';

/** What the first line of a box holds, to see whether it fits on one line beside the controls. */
export interface BoxHeader {
  readonly grip: boolean;
  readonly number: string;
  readonly title: string;
}

/** The width of a box's first line on one line, given the width of a text in the number's and the title's font. */
export function headerWidth(header: BoxHeader, numberWidth: number, titleWidth: number): number {
  return (header.grip ? GRIP_WIDTH + HEADER_GAP : 0) + ICON_SIZE + HEADER_GAP + (header.number === '' ? 0 : numberWidth + HEADER_GAP) + titleWidth;
}

/**
 * Whether the controls stand in a row beside the first line or in a column at the box's right. The
 * row is taken only when the first line and every control fit side by side in the box, with the
 * space between them; a box not yet measured takes the column, which never stands over its text.
 */
export function iconsLayoutOf(boxWidth: number | undefined, header: number | undefined, icons: number): IconsLayout {
  if (boxWidth === undefined || header === undefined || boxWidth <= 0) return 'column';
  return header + BOX_SPACING + icons * ICON_SIZE <= boxWidth - 2 * BOX_SPACING ? 'row' : 'column';
}

/** How far the first line keeps clear of a row of controls standing over its end; 0 in a column. */
export function headerEnd(layout: IconsLayout, icons: number, side: boolean): number {
  return layout === 'row' ? Math.max(0, BOX_SPACING + icons * ICON_SIZE - (side ? ICON_SIZE + BOX_SPACING : 0)) : 0;
}

let context: CanvasRenderingContext2D | null | undefined;

/** The width `text` takes in `font`, or undefined where nothing can measure it. */
export function textWidth(text: string, font: string): number | undefined {
  if (context === undefined) context = document.createElement('canvas').getContext('2d');
  if (!context) return undefined;
  context.font = font;
  return context.measureText(text).width;
}
