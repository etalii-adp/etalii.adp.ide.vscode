import { describe, expect, it } from 'vitest';
import { fourDecimals } from '../../../../src/core/plugins/dependency-reading/index';

// The X row shows at most four decimals, as standalone's `DslNumber.Format` does with .NET's `0.####` (etalii.adp spec 088, FR-017).
describe('a number of the dependency graph, as its rows show it', () => {
  it('keeps a whole number and a short fraction as they are', () => {
    expect([140, -2, 0, 1234.5, 12.25].map(fourDecimals)).toEqual(['140', '-2', '0', '1234.5', '12.25']);
  });

  it('rounds to four decimals, half away from zero', () => {
    expect([0.12345, 0.00005, -0.00005, 2.99999, 1 / 3].map(fourDecimals)).toEqual(['0.1235', '0.0001', '-0.0001', '3', '0.3333']);
  });

  it('writes a small number as nothing, keeping its sign, and a large one without an exponent', () => {
    expect([0.00001, -0.00001, 1e21, 1.5e-7].map(fourDecimals)).toEqual(['0', '-0', '1000000000000000000000', '0']);
  });

  it('rounds to fifteen significant digits first, as a double is formatted', () => {
    expect([0.1 + 0.2, 1234567.123456789].map(fourDecimals)).toEqual(['0.3', '1234567.1235']);
  });
});
