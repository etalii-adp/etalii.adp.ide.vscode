import { describe, expect, it } from 'vitest';
import { CelException, compileCel, type CelContext } from '../../../src/core/fbl/expressions/cel';
import { BoundedRegex } from '../../../src/core/fbl/expressions/regexMatcher';
import { checkRegex } from '../../../src/core/fbl/expressions/regexSubset';

// The regular expression subset (FBL 2.5) and the CEL subset (FBL 2.4). Counterparts of
// standalone's Expressions/Expressions.Tests.cs.
describe('the expressions of a binding', () => {
  it.each([
    ['(a)\\1', 'backreference'],
    ['(?<n>a)\\k<n>', 'named backreference'],
    ['\\p{L}', 'Unicode property'],
    ['(?<=a)b', 'Lookbehind'],
    ['a(?=b)', 'Lookahead'],
    ['(?>a)', 'Atomic'],
    ['(?i)a', 'Inline flags'],
    ['a++', 'Possessive'],
    ['[a', 'not closed'],
  ])('a construct outside the subset is rejected by name: %s', (expression, named) => {
    const problem = checkRegex(expression);
    expect(problem).toBeDefined();
    expect(problem).toContain(named);
  });

  it.each([
    ['^(?<name>[A-Za-z_]\\w*)\\s*->\\s*"(?<label>[^"]*)"$'],
    ['^\\d{4}-\\d{2}-\\d{2}$'],
    ['^(?:a|b)*?c$'],
  ])('an expression in the subset is accepted: %s', (expression) => {
    expect(checkRegex(expression)).toBeUndefined();
  });

  it('digits and word characters are ASCII only', () => {
    const regex = new BoundedRegex('^\\d\\w$', false);
    // An Arabic-Indic digit and a letter with a diacritic are outside \d and \w, as in RE2.
    expect(regex.isMatch('1a')).toBe(true);
    expect(regex.isMatch('١a')).toBe(false);
    expect(regex.isMatch('1é')).toBe(false);
  });

  it.each<[string, unknown]>([
    ['has(entry.end)', true],
    ['!has(entry.missing)', true],
    ['entry.kind == \'task\' && size(entry.tags) == 2', true],
    ['entry.tags.exists(t, t.startsWith(\'b\'))', true],
    ['entry.tags.all(t, t.matches(\'^[a-z]+$\'))', true],
    ['entry.count > 2 ? \'many\' : \'few\'', 'many'],
    ['entry.tags.map(t, t.upperAscii())', 'A,B'],
    ['\'b\' in entry.tags', true],
    ['int(entry.count) + 1', 4n],
  ])('a CEL expression evaluates on an entry: %s', (expression, expected) => {
    const entry = new Map<string, unknown>([['end', '2026-10-01'], ['kind', 'task'], ['count', 3n], ['tags', ['a', 'b']]]);
    const program = compileCel(expression, 'tree');
    const value = program.evaluate({ entry });
    expect(Array.isArray(value) ? value.join(',') : value).toEqual(expected);
  });

  it.each<[string, CelContext, string]>([
    ['groups.name == \'x\'', 'tree', '\'groups\' is not a variable here'],
    ['entry.x.y.z()', 'tree', ''],
    ['timestamp(\'2026-01-01\')', 'tree', ''],
  ])('an expression outside the subset fails to compile: %s', (expression, context, message) => {
    let refused: unknown;
    try {
      compileCel(expression, context);
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(CelException);
    expect((refused as CelException).message).toContain(message);
  });
});
