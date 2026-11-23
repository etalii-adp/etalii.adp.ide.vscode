// How the dependency graph reads what its definition cannot state (etalii.adp spec 088, research R2 and R5),
// carried for the tool type of its origin, as the standalone module carries it beside its definition: the
// order of the findings (the companion, section 3), and a number shown as .NET's `0.####`, as the module's
// `DslNumber.Format` shows the X row (the companion, section 4).

import type { ConstraintFinding } from '../../disl/constraints';
import type { Model } from '../../disl/model';
import type { ReadingLogic } from '../../tool/pluginRegistry';

/** The codes of the first pass: the ids, interleaved in declaration order. */
const IDS = new Set(['dependencies.missing-id', 'dependencies.duplicate-id']);

/**
 * The findings in the tool's two passes: first every missing and duplicate id, interleaved in declaration order,
 * nodes before dependencies whatever the file's order; then, per dependency in declaration order, its findings in
 * the order of the rules that raised them. A finding of neither, such as a file that is not YAML, keeps its place
 * at the front.
 */
export function inPasses<T extends Pick<ConstraintFinding, 'code'> & { readonly element?: string }>(findings: readonly T[], model: Model): T[] {
  const place = new Map([...model.elements, ...model.relations].map((element, index) => [element.id, index]));
  const at = (finding: T): number => place.get(finding.element ?? '') ?? -1;
  const pass = (finding: T): number => (finding.element === undefined || !place.has(finding.element) ? 0 : IDS.has(finding.code) ? 1 : 2);
  // The sort is stable, so the findings of one element keep the order of the rules that raised them.
  return [...findings].sort((a, b) => pass(a) - pass(b) || at(a) - at(b));
}

/**
 * A number as .NET formats a double with `0.####`: rounded to fifteen significant digits, then to at most four
 * decimals away from zero, with no exponent and no trailing zero; a negative number that rounds to nothing is `-0`.
 */
export function fourDecimals(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  const sign = value < 0 || Object.is(value, -0) ? '-' : '';
  if (value === 0) return sign + '0';
  const [mantissa, power] = Math.abs(value).toExponential(14).split('e');
  const digits = mantissa.replace('.', '');
  const point = Number(power) + 1;
  // The digits as a whole number of ten-thousandths, rounded half away from zero at the fifth decimal.
  const scaled = point + 4;
  const kept = scaled <= 0 ? '0' : (digits + '0'.repeat(Math.max(0, scaled - digits.length))).slice(0, scaled);
  const next = scaled < 0 ? 0 : Number(digits[scaled] ?? '0');
  const units = BigInt(kept) + (next >= 5 ? 1n : 0n);
  const whole = units / 10000n;
  const fraction = String(units % 10000n).padStart(4, '0').replace(/0+$/, '');
  return sign + String(whole) + (fraction === '' ? '' : `.${fraction}`);
}

export const dependencyReading: ReadingLogic = {
  id: 'generic/dependencies',
  numberText: fourDecimals,
  order: (findings, model) => inPasses(findings, model),
};
