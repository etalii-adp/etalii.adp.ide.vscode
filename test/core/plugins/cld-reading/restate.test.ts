import { describe, expect, it } from 'vitest';
import { restated } from '../../../../src/core/plugins/cld-reading/index';

// A link with more than one note: the tool reads the last as its note and writes the statement again in
// its own spelling, keeping the other quoted words before the note (standalone's CausalLoopNote, spec 081 T024).
describe('a link statement with two notes', () => {
  const statement = 'link a -> b + delayed flipped "first note" "second note"';

  it('writes a changed note over the last, keeping the first', () => {
    expect(restated(statement, { note: 'Parity note' })).toBe('link a -> b + delayed flipped "first note" "Parity note"');
  });

  it('writes a weight before the notes, and takes it away again', () => {
    const weighted = restated(statement, { weight: 1e21 })!;
    expect(weighted).toBe('link a -> b + delayed flipped weight=1e+21 "first note" "second note"');
    expect(restated(weighted, { weight: null })).toBe(statement);
  });

  it('writes the polarity and the flags in their canonical places', () => {
    expect(restated(statement, { polarity: null })).toBe('link a -> b delayed flipped "first note" "second note"');
    expect(restated(statement, { polarity: 'negative', delayed: false })).toBe('link a -> b - flipped "first note" "second note"');
  });

  it('leaves a statement with one note, or a change it does not know, to the binding', () => {
    expect(restated('link a -> b + "only note"', { note: 'x' })).toBeUndefined();
    expect(restated(statement, { from: 'c' })).toBeUndefined();
  });
});
