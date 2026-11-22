// How the causal loop diagram reads what its binding cannot state (etalii.adp spec 081, research R10),
// carried for the tool type of its origin, as the standalone module carries it beside its definition:
// a link's note read as `CausalLoopNote` reads it, the four sentences `CausalLoopUnreadable` gives
// for a statement no rule reads (the companion's gaps 1 and 2), a number shown in .NET's
// shortest form (the companion, Other differences: numbers), and the wavy underline (gap 4).

import type { ReadingLogic } from '../../tool/pluginRegistry';

/** A word of a statement: its text, without quotes. */
interface Word {
  readonly text: string;
  readonly quoted: boolean;
}

/** A statement's words: split at whitespace, a double-quoted run one word without its quotes, an unclosed quote running to the end. */
export function wordsOf(statement: string): Word[] {
  const words: Word[] = [];
  let index = 0;
  while (index < statement.length) {
    if (/\s/.test(statement[index])) { index++; continue; }
    if (statement[index] === '"') {
      const close = statement.indexOf('"', index + 1);
      if (close < 0) { words.push({ text: statement.slice(index + 1), quoted: true }); break; }
      words.push({ text: statement.slice(index + 1, close), quoted: true });
      index = close + 1;
      continue;
    }
    const start = index;
    while (index < statement.length && !/\s/.test(statement[index])) index++;
    words.push({ text: statement.slice(start, index), quoted: false });
  }
  return words;
}

const flags = new Set(['delayed', 'flipped', '+', 's', 'S', '-', 'o', 'O']);

/** The note of a link's statement as the tool reads it: the last word after the arrow that is no polarity, flag or weight; empty for none. */
export function noteOf(statement: string): string {
  const candidates = wordsOf(statement).slice(4).filter((word) => !flags.has(word.text) && !word.text.startsWith('weight='));
  return candidates.at(-1)?.text ?? '';
}

/** Whether a text reads as a number as .NET's `double.TryParse` with `NumberStyles.Float` reads it. */
const readsAsNumber = (text: string): boolean => /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(text) || /^\s*[+-]?(Infinity|∞)\s*$/.test(text) || /^\s*NaN\s*$/.test(text);

const LINK_SHAPE = "A link reads 'link <from> -> <to>', optionally followed by a polarity, 'delayed', 'flipped', a weight and a label.";

/** The sentence for a statement no rule reads, by what it starts like. */
export function unreadableSentence(statement: string): string {
  const words = wordsOf(statement).map((word) => word.text);
  const first = words[0] ?? statement.trim();
  if (first === 'variable' && words.length > 1 && words[1].length === 0) return 'A variable needs an id of at least one character.';
  if (first === 'link' && words.length >= 4 && words[2] === '->') {
    const weight = words.slice(4).find((word) => word.startsWith('weight=') && !readsAsNumber(word.slice('weight='.length)));
    return weight === undefined ? LINK_SHAPE : `'${weight}' does not read as a weight.`;
  }
  if (first === 'link') return LINK_SHAPE;
  return `'${first}' is not a statement this reading knows.`;
}

/** A number in .NET's shortest round-trip form: an exponent below -4 or from 15 up is written `1E+21`, `1E-07`. */
export function dotnetNumber(value: number): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? 'NaN' : value > 0 ? '∞' : '-∞';
  if (value === 0) return Object.is(value, -0) ? '-0' : '0';
  const [mantissa, power] = value.toExponential().split('e');
  const exponent = Number(power);
  if (exponent >= -5 && exponent < 15) return String(value);
  return `${mantissa}E${exponent < 0 ? '-' : '+'}${String(Math.abs(exponent)).padStart(2, '0')}`;
}

const LINK = 'Link';

export const cldReading: ReadingLogic = {
  id: 'systems/causal-loop-diagram',
  reread: (elements, text) => elements.map((element) => {
    if (element.type !== LINK) return element;
    const attributes: Record<string, unknown> = { ...element.attributes };
    const note = noteOf(text(element.ownSpan));
    if (note === '') delete attributes.note;
    else attributes.note = note;
    return { ...element, attributes };
  }),
  unreadable: unreadableSentence,
  numberText: dotnetNumber,
  // A loop whose label disagrees with its arrows is underlined wavy, as the owner ruled for the standalone host on 2026-10-14 (companion, gap 4).
  underlineStyle: 'wavy',
};
