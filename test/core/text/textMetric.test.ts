import { describe, expect, it } from 'vitest';
import { newShortGuid } from '../../../src/core/text/shortGuid';
import { averageAdvance, defaultFontSize, widthOfText } from '../../../src/core/text/textMetric';

describe('the text metric every ADP host shares', () => {
  it('is characters times font size times the average advance, a character being a UTF-16 code unit', () => {
    expect(averageAdvance).toBe(0.55);
    expect(defaultFontSize).toBe(14);
    expect(widthOfText('')).toBe(0);
    expect(widthOfText('Customer')).toBeCloseTo(61.6, 9);
    expect(widthOfText('Order service', 12)).toBeCloseTo(85.8, 9);
    expect(widthOfText('🙂')).toBeCloseTo(15.4, 9);
  });
});

describe('a new id', () => {
  it('is 25 characters of base 36, and not the same twice', () => {
    expect(newShortGuid()).toMatch(/^[0-9a-z]{25}$/);
    expect(newShortGuid()).not.toBe(newShortGuid());
  });
});