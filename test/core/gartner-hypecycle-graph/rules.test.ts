import { describe, expect, it } from 'vitest';
import { parse } from '../../../src/core/gartner-hypecycle-graph/parser';
import { findingsOf } from '../../../src/core/gartner-hypecycle-graph/rules';
import { LineDocument } from '../../../src/core/text/lineDocument';
import { read } from '../files';

const findingsIn = (fixture: string) => findingsOf(parse(LineDocument.parse(read(`fixtures/gartner-hypecycle-graph/${fixture}.ghg`))));

describe('the hype cycle rules', () => {
  it('find nothing in a clean document', () => {
    expect(findingsIn('rules-clean')).toEqual([]);
  });

  it.each([
    'bad-attachment', 'boundary-order', 'dangling-reference', 'duplicate-id', 'duplicate-influence', 'influence-into-trigger',
    'note-position', 'phase-count', 'self-influence', 'stop-before-start', 'trigger-date', 'unreadable-entry',
  ])('report ghg.%s for its fixture, as a warning with a line', (rule) => {
    const findings = findingsIn(`rule-${rule}`).filter((finding) => finding.rule === `ghg.${rule}`);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.severity).toBe('warning');
      expect(finding.line).toBeGreaterThanOrEqual(0);
      expect(finding.message.length).toBeGreaterThan(0);
    }
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