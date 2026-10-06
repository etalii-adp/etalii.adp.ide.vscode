import { describe, expect, it } from 'vitest';
import { doubleQuoted, isPlainSafe, singleQuoted } from '../../../src/core/fbl/families/yaml/yamlScalars';

// FBL 6.3, yaml scalars: "A string is plain-safe when it is not empty; has no leading or trailing
// whitespace; contains no line break or control character; does not start with any of
// - ? : , [ ] { } # & * ! | > ' " % @ `; contains neither ': ' nor ' #' and does not end with ':';
// and would be read back as the same string under the YAML 1.2 core schema and as a string under
// YAML 1.1 (so not null, ~, true, false, yes, no, on, off, y, n in any case, a number, or a date or
// date-time), unless the attribute's DISL type is the type it would read as." Counterparts of
// standalone's Yaml/YamlScalars.Tests.cs.
describe('a yaml scalar', () => {
  it.each<[string, boolean]>([
    ['Discovery', true],
    ['Plan the launch', true],
    ['a-b:c', true],
    ['', false],
    [' lead', false],
    ['trail ', false],
    ['two\nlines', false],
    [`bell${String.fromCharCode(7)}`, false],
    ['- item', false],
    ['?q', false],
    [':x', false],
    [',x', false],
    ['[x', false],
    [']x', false],
    ['{x', false],
    ['}x', false],
    ['#x', false],
    ['&x', false],
    ['*x', false],
    ['!x', false],
    ['|x', false],
    ['>x', false],
    ['\'x', false],
    ['"x', false],
    ['%x', false],
    ['@x', false],
    ['`x', false],
    ['key: value', false],
    ['text #comment', false],
    ['ends:', false],
    ['null', false],
    ['~', false],
    ['True', false],
    ['FALSE', false],
    ['yes', false],
    ['No', false],
    ['on', false],
    ['OFF', false],
    ['y', false],
    ['N', false],
    ['42', false],
    ['-1.5e3', false],
    ['0x1F', false],
    ['1_000', false],
    ['12:30', false],
    ['2026-10-01', false],
    ['2026-10-01T09:00:00', false],
  ])('a plain safe string is written plain: %j is %s', (value, safe) => {
    expect(isPlainSafe(value, false)).toBe(safe);
  });

  it.each([['2026-10-01'], ['2026-10-01T09:00:00']])('a date is plain safe when the attribute is a date: %s', (value) => {
    // "unless the attribute's DISL type is the type it would read as".
    expect(isPlainSafe(value, true)).toBe(true);
  });

  it.each([
    ['a"b\\c\n', '"a\\"b\\\\c\\n"'],
    ['tab\t', '"tab\\t"'],
  ])('a double quoted string escapes backslash quote and control characters: %j', (value, written) => {
    expect(doubleQuoted(value)).toBe(written);
  });

  it('a single quoted string doubles its quotes', () => {
    expect(singleQuoted('it\'s')).toBe('\'it\'\'s\'');
  });
});
