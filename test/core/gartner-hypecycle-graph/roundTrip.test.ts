import { describe, expect, it } from 'vitest';
import { parse } from '../../../src/core/gartner-hypecycle-graph/parser';
import { findingsOf } from '../../../src/core/gartner-hypecycle-graph/rules';
import { LineDocument } from '../../../src/core/text/lineDocument';
import { filesUnder, read } from '../files';

const examples = filesUnder('examples/gartner-hypecycle-graph', '.ghg');
const fixtures = filesUnder('fixtures/gartner-hypecycle-graph', '.ghg');

describe('every hype cycle example and fixture', () => {
  it('is there to be read', () => {
    expect(examples).toHaveLength(9);
    expect(fixtures.length).toBeGreaterThan(20);
  });

  it.each([...examples, ...fixtures])('%s is read and given back byte for byte', (path) => {
    const text = read(path);
    const document = LineDocument.parse(text);
    expect(() => parse(document)).not.toThrow();
    expect(document.text).toBe(text);
  });

  it.each(examples)('%s breaks no rule and has every entry within its own lines', (path) => {
    const document = LineDocument.parse(read(path));
    const model = parse(document);
    expect(model.readable).toBe(true);
    expect(findingsOf(model)).toEqual([]);
    const entries = [...model.trends, ...model.triggers, ...model.notes, ...model.influences];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(document.lines[entry.range.start].text.trimStart().startsWith('- ')).toBe(true);
      expect(document.lines[entry.range.end].text.trim()).not.toBe('');
    }
    // No two entries share a line, and they come in document order.
    const ranges = entries.map((entry) => entry.range).sort((a, b) => a.start - b.start);
    for (let index = 1; index < ranges.length; index++) {
      expect(ranges[index].start).toBeGreaterThan(ranges[index - 1].end);
    }
  });
});

describe('a document that is not YAML', () => {
  it('opens as an empty model that is not readable, with the problem and its line', () => {
    const model = parse(LineDocument.parse(read('fixtures/gartner-hypecycle-graph/not-yaml.ghg')));
    expect(model.readable).toBe(false);
    expect(model.trends).toEqual([]);
    expect(model.problems).toHaveLength(1);
    expect(model.problems[0].message).toMatch(/^The document could not be read as YAML: /);
  });
});

describe('a document with entries that cannot be read', () => {
  const model = parse(LineDocument.parse(read('fixtures/gartner-hypecycle-graph/malformed-entries.ghg')));

  it('keeps every entry that is a mapping, with whatever could be read', () => {
    expect(model.readable).toBe(true);
    expect(model.trends.map((trend) => trend.id)).toEqual(['good', 'odd']);
    expect(model.trends[1]).toMatchObject({ start: undefined, row: 0, phases: 4 });
    expect(model.influences).toHaveLength(1);
  });

  it('reports each thing it passed over, with its line', () => {
    expect(model.problems).toEqual([
      { line: 14, message: '`colour` is not a key this module reads on a trend; the line is kept.' },
      { line: 10, message: '`start: 19xx-01` is not a date written as YYYY-MM.' },
      { line: 12, message: '`row: two` is not a whole number; 0 was used.' },
      { line: 13, message: '`phases: many` is not a whole number; 4 was used.' },
      { line: 15, message: 'A trend entry is not a mapping and was passed over.' },
      { line: 26, message: '`weight` is not a key this module reads on a influence; the line is kept.' },
    ]);
  });
});

describe('triggers and notes', () => {
  const document = LineDocument.parse(read('fixtures/gartner-hypecycle-graph/triggers-and-notes.ghg'));
  const model = parse(document);

  it('are read with their unit, dates and sizes', () => {
    expect(model.unit.name).toBe('year');
    expect(model.triggers[0]).toMatchObject({ id: 'transistor-invented', date: 1947 * 12 + 11, row: 1, tags: ['electronics', 'invention'] });
    expect(model.notes[0]).toMatchObject({ id: 'note-1', text: 'Dates are illustrative.\n\nSee the readme.', width: 160, height: 64 });
    expect(model.notes[1].text).toBe('A one-line remark');
  });

  it('give a note with a block of text every line of that block', () => {
    const range = model.notes[0].range;
    expect(document.lines[range.start].text).toBe('  - id: note-1');
    expect(document.lines[range.end].text).toBe('    height: 64');
  });

  it('read an influence from a trigger as having no from end', () => {
    expect(model.influences[0].fromEnd).toEqual({ phase: '', edge: '', at: undefined });
    expect(findingsOf(model)).toEqual([]);
  });
});