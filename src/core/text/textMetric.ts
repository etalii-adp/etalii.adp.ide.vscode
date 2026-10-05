// The one way every ADP host estimates a text's width, so a box sized in one place fits the text
// drawn in another: characters times font size times an average advance. A character is a UTF-16
// code unit. Checked against the hosts' shared text-metric fixture.

export const defaultFontSize = 14;
export const averageAdvance = 0.55;

export function widthOfText(text: string, fontSize: number = defaultFontSize): number {
  return text.length * fontSize * averageAdvance;
}