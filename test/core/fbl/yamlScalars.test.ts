import { describe, expect, it } from 'vitest';
import { doubleQuoted, isPlainSafe, singleQuoted } from '../../../src/core/fbl/families/yaml/yamlScalars';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import { inlineBinding } from './support/bindings';
import { textOf, utf8 } from './support/repository';

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

// FBL 6.3, yaml scalars (FBL 0.5): "A value written for a slot read as text MUST read back through
// the same binding as the same text. The plain-safe test above still holds for it, so the text yes
// or 1.0 is written quoted, and a file another tool reads keeps its meaning there; an attribute
// whose style is plain is written plain whenever YAML's syntax allows it, for a format whose every
// reader takes the written text."
describe('a yaml scalar written for a slot read as text', () => {
  const binding = (options = '') =>
    inlineBinding(`[{ "name": "item", "type": "Item", "at": "/items/*", "id": { "from": { "key": "id" } }, "attributes": { "value": { "key": "value", "read": "text"${options} } } }]`);

  /** Sets the one entry's value, and gives the line it is written as and what it then reads as. */
  const written = (value: string, options = ''): { line: string; read: unknown } => {
    const body = OpenBody.open(utf8('items:\n  - id: a\n    value: old\n'), binding(options), { fileName: 'plan.t' });
    expect(body.change({ kind: 'set', id: 'a', attributes: { value } })).toHaveProperty('planned');
    return { line: textOf(body.bytes).split('\n')[2], read: body.model.find('a')!.attributes.value };
  };

  it.each([
    ['yes', '    value: "yes"'],
    ['1.0', '    value: "1.0"'],
    ['007', '    value: "007"'],
    ['null', '    value: "null"'],
    ['~', '    value: "~"'],
    ['2026-10-01', '    value: "2026-10-01"'],
    ['Discovery', '    value: Discovery'],
  ])('a text that would read as another type is written quoted and reads back as the same text: %s', (value, line) => {
    expect(written(value)).toEqual({ line, read: value });
  });

  it.each([
    ['yes', '    value: yes'],
    ['1.0', '    value: 1.0'],
    ['007', '    value: 007'],
    ['null', '    value: null'],
    ['2026-10-01', '    value: 2026-10-01'],
  ])('an attribute whose style is plain is written plain whenever the syntax allows it: %s', (value, line) => {
    expect(written(value, ', "style": "plain"')).toEqual({ line, read: value });
  });

  it.each([
    ['key: value', '    value: "key: value"'],
    ['- item', '    value: "- item"'],
    ['text #comment', '    value: "text #comment"'],
    [' lead', '    value: " lead"'],
    ['#x', '    value: "#x"'],
  ])('an attribute whose style is plain is quoted where the syntax does not allow plain: %s', (value, line) => {
    expect(written(value, ', "style": "plain"')).toEqual({ line, read: value });
  });
});
