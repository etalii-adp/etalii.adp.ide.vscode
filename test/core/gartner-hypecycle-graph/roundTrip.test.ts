import { describe, expect, it } from 'vitest';
import { filesUnder, read } from '../files';
import { applied, fixture, sourceOf } from '../tool/support';
import { base, change, edit, nodeOf, type } from './hypeCycle';

const examples = filesUnder('examples/gartner-hypecycle-graph', '.ghg');
const fixtures = filesUnder('fixtures/gartner-hypecycle-graph', '.ghg');

describe('every hype cycle example and fixture', () => {
  it('is there to be read', () => {
    expect(examples).toHaveLength(9);
    expect(fixtures.length).toBeGreaterThan(20);
  });

  it.each([...examples, ...fixtures])('%s is read and given back byte for byte', (path) => {
    const text = read(path);
    const source = sourceOf(text, path);
    expect(() => type.findings(source)).not.toThrow();
    const scene = type.view(source, {});
    // What is read is written back as it stands: a text entered as it is gives no splice, so not a byte changes.
    for (const node of scene.nodes.slice(0, 5)) expect(applied(edit(source, { kind: 'rename', id: node.id, text: node.labels[0].editText })).splices).toEqual([]);
    expect(source.text).toBe(text);
  });

  it.each(examples)('%s breaks no rule and has every entry within its own lines', (path) => {
    const source = sourceOf(read(path), path);
    const scene = type.view(source, {});
    expect(scene.readOnly).toBe(false);
    expect(type.findings(source)).toEqual([]);
    expect(scene.nodes.length + scene.edges.length).toBeGreaterThan(0);
    // An entry is the lines its removal takes out: they start at its `- id:`, end on a line that is not empty, and hold no other entry.
    const lines = source.text.split(/\r?\n/);
    const starts: number[] = [];
    const some = <T>(list: readonly T[]): T[] => [...new Set([...list.slice(0, 4), ...list.slice(-2)])];
    const alone = some(scene.nodes.filter((node) => !scene.edges.some((edge) => edge.source === node.id || edge.target === node.id))).map((node) => ({ id: node.id, action: 'ghg.remove' }));
    for (const { id, action } of [...alone, ...some(scene.edges).map((edge) => ({ id: edge.id, action: 'ghg.disconnect' }))]) {
      const { removed, added } = change(source, { kind: 'action', action, id });
      expect(added).toEqual([]);
      expect(removed[0].trimStart()).toMatch(new RegExp(`^- id: "?${id}"?$`));
      expect(removed[removed.length - 1].trim()).not.toBe('');
      expect(removed.filter((line) => line.trimStart().startsWith('- '))).toHaveLength(1);
      starts.push(lines.indexOf(removed[0]));
    }
    // No two entries share a line.
    expect(new Set(starts).size).toBe(starts.length);
  });
});

describe('a document that is not YAML', () => {
  it('opens as an empty model that is not readable, with the problem and its line', () => {
    const broken = fixture('not-yaml');
    const scene = type.view(broken, {});
    expect(scene.readOnly).toBe(true);
    expect(scene.nodes).toEqual([]);
    const found = type.findings(broken);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'ghg.unreadable-entry', severity: 'warning', line: 3 });
    expect(found[0].message).toMatch(/^The document could not be read as YAML: /);
  });
});

describe('a document with entries that cannot be read', () => {
  const malformed = fixture('malformed-entries');

  it('keeps every entry that is a mapping, with whatever could be read', () => {
    expect(type.view(malformed, {}).readOnly).toBe(false);
    // `good` is drawn. `odd` is read with what could be read of it, and not drawn for want of a start; the influence to it is not drawn either.
    expect(type.view(malformed, {}).nodes.map((node) => node.id)).toEqual(['good']);
    const odd = new Map(type.fields(malformed, ['odd']).map((field) => [field.id, field.value]));
    expect(odd.get('ghg.name')).toBe('Odd');
    expect(odd.get('ghg.start')).toBe('');
    expect(odd.get('ghg.stop')).toBe('1910-01');
    expect(odd.get('ghg.phases')).toBe('All four');
    expect(odd.get('ghg.peak-influenced-by')).toBe('Good · Peak');
    expect(type.fields(malformed, ['link']).map((field) => [field.label, field.value]).slice(1, 3)).toEqual([['From', 'Good · Peak'], ['To', 'Odd · Peak']]);
  });

  it('reports each thing it passed over, with its line', () => {
    // docs/disl-support.md, "A key the binding does not read" and "A malformed value, the wording of a reader's sentence":
    // `colour` and `weight` are kept and give no finding, and a value that cannot be read is found on the first line of its entry.
    expect(type.findings(malformed)).toEqual([
      { rule: 'ghg.unreadable-entry', severity: 'warning', line: 8, message: '`start` of `odd` is not a value of the type `yearMonth`, so it is not read: 19xx-01' },
      { rule: 'ghg.unreadable-entry', severity: 'warning', line: 8, message: '`row` of `odd` is not a value of the type `int`, so it is not read: two' },
      { rule: 'ghg.unreadable-entry', severity: 'warning', line: 8, message: '`phases` of `odd` is not a value of the type `int`, so it is not read: many' },
      { rule: 'ghg.unreadable-entry', severity: 'warning', line: 15, message: 'This entry is not a mapping, so it is kept as it is.' },
    ]);
    // The lines that give no finding are kept through an edit.
    const renamed = change(malformed, { kind: 'rename', id: 'good', text: 'Better' });
    expect(renamed).toEqual({ removed: ['    name: Good'], added: ['    name: Better'] });
  });
});

describe('triggers and notes', () => {
  it('are read with their unit, dates and sizes', () => {
    // A diagram of years: a year is four units wide, and a trigger is centred on its month's place in its year.
    const trigger = nodeOf(base, 'transistor-invented');
    expect(trigger.box.x + 8).toBeCloseTo(((1947 * 12 + 11 - 1900 * 12) * 4) / 12, 9);
    expect(trigger.box.y + 8).toBe(56 + 16);
    const rows = new Map(type.fields(base, ['transistor-invented']).map((field) => [field.id, field.value]));
    expect(rows.get('ghg.date')).toBe('1947-12');
    expect(rows.get('ghg.tags')).toBe('electronics, invention');
    const note = nodeOf(base, 'note-1');
    expect(note.labels[0].editText).toBe('Dates are illustrative.\n\nSee the readme.');
    expect(note.box).toMatchObject({ width: 160, height: 64 });
    expect(nodeOf(base, 'note-2').labels[0].editText).toBe('A one-line remark');
  });

  it('give a note with a block of text every line of that block', () => {
    const { removed } = change(base, { kind: 'action', action: 'ghg.remove', id: 'note-1' });
    expect(removed[0]).toBe('  - id: note-1');
    expect(removed).toContain('      See the readme.');
    expect(removed[removed.length - 1]).toBe('    height: 64');
    expect(removed).toHaveLength(9);
  });

  it('read an influence from a trigger as having no from end', () => {
    const [fromTrigger] = type.view(base, {}).edges;
    expect(fromTrigger).toMatchObject({ id: 'i-12', source: 'transistor-invented' });
    expect(fromTrigger.from?.part).toBeUndefined();
    expect(fromTrigger.from?.at).toBeUndefined();
    expect(type.fields(base, ['i-12']).find((field) => field.id === 'ghg.from-attachment')?.value).toBe('//');
    expect(type.findings(base)).toEqual([]);
  });
});
