import { describe, expect, it } from 'vitest';
import type { Finding } from '../../../src/core/frame/toolType';
import { fixture } from '../tool/support';
import { type } from './hypeCycle';

const findingsIn = (name: string): Finding[] => type.findings(fixture(name));

describe('the hype cycle rules', () => {
  it('find nothing in a clean document', () => {
    expect(findingsIn('rules-clean')).toEqual([]);
  });

  it.each([
    'bad-attachment', 'boundary-order', 'dangling-reference', 'duplicate-id', 'duplicate-influence', 'influence-into-trigger',
    'note-position', 'phase-count', 'self-influence', 'stop-before-start', 'trigger-date',
  ])('report ghg.%s for its fixture, as a warning with a line', (rule) => {
    const findings = findingsIn(`rule-${rule}`).filter((finding) => finding.rule === `ghg.${rule}`);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.severity).toBe('warning');
      expect(finding.line).toBeGreaterThanOrEqual(0);
      expect(finding.message.length).toBeGreaterThan(0);
    }
  });

  it('report each with the sentence that names what is wrong', () => {
    expect(findingsIn('rule-stop-before-start')).toEqual([{ rule: 'ghg.stop-before-start', severity: 'warning', line: 2, message: '`a` stops at 1900-01, not after it starts at 1920-01; a trend is at least a month long.' }]);
    expect(findingsIn('rule-phase-count')).toEqual([{ rule: 'ghg.phase-count', severity: 'warning', line: 2, message: '`a` shows 7 phases; a trend shows 1 to 4.' }]);
    expect(findingsIn('rule-self-influence')).toEqual([{ rule: 'ghg.self-influence', severity: 'warning', line: 15, message: '`aa` has `a` influence itself; a trend cannot.' }]);
    expect(findingsIn('rule-duplicate-id')).toEqual([{ rule: 'ghg.duplicate-id', severity: 'warning', line: 14, message: '`a` is declared 2 times; an id names one entry.' }]);
  });

  it('report no ghg.unreadable-entry for a key the binding does not read, and one for a value that cannot be read', () => {
    // docs/disl-support.md, "A key the binding does not read": it is kept, and gives no finding, where the hand-coded diagram reported it.
    expect(findingsIn('rule-unreadable-entry')).toEqual([]);
    expect(findingsIn('rule-trigger-date').map((finding) => [finding.rule, finding.line])).toEqual([['ghg.unreadable-entry', 9], ['ghg.trigger-date', 9]]);
  });

  it('count an influence a phase count hides: a second one in the same direction is still a duplicate', () => {
    const findings = findingsIn('rule-duplicate-hidden');
    expect(findings).toEqual([
      { rule: 'ghg.duplicate-influence', severity: 'warning', line: 24, message: '`a` influences `b` 2 times; a trend influences another once in each direction.' },
    ]);
  });

  it('allow one influence in each direction between two trends', () => {
    expect(findingsIn('rule-opposite-directions')).toEqual([]);
  });
});
