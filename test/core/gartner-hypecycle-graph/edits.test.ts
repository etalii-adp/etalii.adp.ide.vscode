import { describe, expect, it } from 'vitest';
import type { EditRequest, Source } from '../../../src/core/frame/toolType';
import { filesUnder, read } from '../files';
import { applied, fixture, sourceOf, spliced } from '../tool/support';
import { after, base, change, edit, nodeOf, sentenceOf, type } from './hypeCycle';

// Every edit of the hype cycle graph, as the request a gesture makes of the tool type and the lines
// it rewrites. Whatever is written uses the file's own line ending: `spliced` copies everything
// outside the splices byte for byte, and `linesChanged` proves every other line untouched.

/** A new id as the definition's persistence makes it: 25 characters of base 36. */
const minted = /^ {2}- id: [0-9a-z]{25}$/;
/** The x of the start of a year, in the fixture's diagram of years. */
const xOfYear = (year: number): number => (year - 1900) * 4;
const dropped = (source: Source, entry: string, x: number, y: number) => change(source, { kind: 'drop', entry, x, y });
const setField = (id: string, field: string, value: string): EditRequest => ({ kind: 'setField', id, field, value });

describe('renaming', () => {
  it('rewrites the one name line of a trend', () => {
    expect(change(base, { kind: 'rename', id: 'transistors', text: 'Solid state' })).toEqual({ removed: ['    name: Transistors'], added: ['    name: Solid state'] });
    // docs/disl-support.md, "A name with spaces around it": a trend's name is written as typed, quoted; a trigger's is trimmed.
    expect(change(base, { kind: 'rename', id: 'transistors', text: ' Solid state ' })).toEqual({ removed: ['    name: Transistors'], added: ['    name: " Solid state "'] });
    expect(change(base, { kind: 'rename', id: 'transistor-invented', text: ' Point contact ' }).added).toEqual(['    name: Point contact']);
  });

  it('quotes a name only where YAML needs it', () => {
    expect(change(base, { kind: 'rename', id: 'radio', text: 'Radio: the pocket kind' }).added).toEqual(['    name: "Radio: the pocket kind"']);
  });

  it('refuses a trend or a trigger without a name, and lets a note be emptied', () => {
    expect(sentenceOf(base, { kind: 'rename', id: 'transistors', text: '  ' })).toBe('A trend needs a name.');
    expect(sentenceOf(base, { kind: 'rename', id: 'transistor-invented', text: '' })).toBe('A trigger needs a name.');
    expect(change(base, { kind: 'rename', id: 'note-2', text: '' }).added).toEqual(['    text: ""']);
  });

  it('writes a note of several lines as a literal block, and one line as a scalar again', () => {
    const request = { kind: 'rename', id: 'note-2', text: 'First\n\nSecond' } as const;
    expect(change(base, request)).toEqual({ removed: ['    text: A one-line remark'], added: ['    text: |-', '      First', '', '      Second'] });
    expect(nodeOf(after(base, request), 'note-2').labels[0].editText).toBe('First\n\nSecond');
    expect(change(base, { kind: 'rename', id: 'note-1', text: 'Short' })).toEqual({ removed: ['    text: |-', '      Dates are illustrative.', '', '      See the readme.'], added: ['    text: Short'] });
  });

  it('says so when the element is gone', () => {
    // The host's own sentence: the definition states none for an element that is no longer there.
    expect(sentenceOf(base, { kind: 'rename', id: 'nobody', text: 'x' })).toBe('This text cannot be changed here.');
  });
});

describe('adding from the toolbox', () => {
  it('appends a trend after the last one: 12 steps of the unit, four phases, in the step and row of the drop', () => {
    const request = { kind: 'drop', entry: 'ghg.add.trend', x: xOfYear(1960) + 1, y: 56 * 4 + 16 } as const;
    const added = change(base, request);
    expect(added.removed).toEqual([]);
    expect(added.added[0]).toMatch(minted);
    expect(added.added.slice(1)).toEqual(['    name: New trend', '    start: 1960-01', '    stop: 1972-01', '    row: 4', '    phases: 4']);
    // After the last trend: the new entry ends where the list of triggers begins.
    const lines = after(base, request).text.split('\n');
    expect(lines.slice(lines.indexOf('triggers:') - 5, lines.indexOf('triggers:'))).toEqual(added.added.slice(1));
    const again = dropped(after(base, request), 'ghg.add.trend', xOfYear(1960) + 1, 0);
    expect(again.added[1]).toBe('    name: New trend 2');
  });

  it('appends a trigger and a note to the lists the document has', () => {
    expect(dropped(base, 'ghg.add.trigger', xOfYear(1970), 16).added.slice(1)).toEqual(['    name: Trigger', '    date: 1970-01', '    row: 0']);
    expect(dropped(base, 'ghg.add.note', xOfYear(1970), 60).added.slice(1)).toEqual(['    text: ""', '    at: 1970-01', '    row: 1', '    width: 160', '    height: 64']);
  });

  it('opens a triggers or notes list before the influences when the document has none', () => {
    const clean = fixture('rules-clean');
    expect(type.view(clean, {}).nodes.filter((node) => node.type === 'Trigger')).toHaveLength(0);
    const added = after(clean, { kind: 'drop', entry: 'ghg.add.trigger', x: 0, y: 0 });
    expect(dropped(clean, 'ghg.add.trigger', 0, 0).added[0]).toBe('triggers:');
    const lines = added.text.split('\r\n');
    expect(lines.indexOf('triggers:')).toBeGreaterThan(0);
    expect(lines.indexOf('triggers:')).toBeLessThan(lines.indexOf('influences:'));
    expect(type.findings(added)).toEqual([]);
  });

  it('mints an id when none is given', () => {
    const first = dropped(base, 'ghg.add.trend', 0, 0).added[0];
    expect(first).toMatch(minted);
    // No request carries an id, so every one is minted, and no two are the same.
    expect(dropped(base, 'ghg.add.trend', 0, 0).added[0]).not.toBe(first);
  });
});

describe('placing and sizing', () => {
  // A boundary is stored once its handle is dragged: the first of `transistors`, to 1960.
  const withBoundary = after(base, { kind: 'handle', id: 'transistors', handle: 0, x: xOfYear(1960) });

  it('moves a trend by rewriting its dates and row, shifting what it stores', () => {
    expect(change(base, { kind: 'handle', id: 'transistors', handle: 0, x: xOfYear(1960) })).toEqual({ removed: [], added: ['    peak-end: 1960-01'] });
    const moved = change(withBoundary, { kind: 'move', id: 'transistors', x: xOfYear(1955), y: 56 * 2 });
    expect(moved.added).toEqual(['    start: 1955-01', '    stop: 1995-01', '    row: 2', '    phases: 4', '    peak-end: 1965-01']);
  });

  it('rescales stored boundaries when a date is typed', () => {
    const resized = change(withBoundary, setField('transistors', 'ghg.stop', '1970-01'));
    expect(resized.added).toEqual(['    stop: 1970-01', '    row: 1', '    phases: 4', '    peak-end: 1955-01']);
    expect(resized.removed).toEqual(['    stop: 1990-01', '    row: 1', '    phases: 4', '    peak-end: 1960-01']);
  });

  it('refuses a span that is not a date, not after its start, or shorter than its phases', () => {
    expect(sentenceOf(base, setField('radio', 'ghg.stop', 'June'))).toBe("'June' is not a date; write it as YYYY-MM, such as 2007-06.");
    expect(sentenceOf(base, setField('radio', 'ghg.stop', '1954-01'))).toBe('A trend must stop after it starts, at least one month later.');
    expect(sentenceOf(base, setField('radio', 'ghg.stop', '1954-03'))).toBe('A trend showing 3 phases must be at least 3 months long, one per phase.');
    // The row of the phases takes one of its four values, so a count out of range is refused by the row's own sentence.
    expect(sentenceOf(base, setField('radio', 'ghg.phases', '5'))).toBe("'5' is not one of Peak, Peak and Trough, Peak, Trough and Slope, All four.");
  });

  it('moves a trigger by its centre and a note by its top-left', () => {
    const x = xOfYear(1950);
    expect(change(base, { kind: 'move', id: 'transistor-invented', x: x - 8, y: 56 * 2 + 8 }).added).toEqual(['    date: 1950-01', '    row: 2']);
    expect(change(base, { kind: 'move', id: 'note-2', x, y: 56 }).added).toEqual(['    at: 1950-01', '    row: 1']);
  });

  it('resizes a note in one edit, and reads the size the grid writes', () => {
    const resized = { kind: 'resize', id: 'note-2', side: 'corner', bounds: { x: xOfYear(1961), y: 56 * 6, width: 200.456, height: 80 } } as const;
    expect(change(base, resized).added).toEqual(['    at: 1961-01', '    row: 6', '    width: 200.46', '    height: 80']);
    // docs/disl-support.md, "A note's size typed as `200 x 80 at 1961-01 row 6`": the size is set, and the note is not moved.
    expect(change(base, setField('note-2', 'ghg.size', '200.456 x 80 at 1961-01 row 6'))).toEqual({ removed: ['    width: 120', '    height: 40'], added: ['    width: 200.46', '    height: 80'] });
    expect(type.fields(base, ['note-1']).find((field) => field.id === 'ghg.size')?.value).toBe('160 x 64');
    expect(sentenceOf(base, setField('note-2', 'ghg.size', 'big'))).toBe("'big' is not a size; write it as width x height, such as 160 x 64.");
  });
});

describe('phase boundaries', () => {
  it('can be moved only between two visible phases', () => {
    expect(sentenceOf(base, { kind: 'handle', id: 'radio', handle: 2, x: xOfYear(1970) })).toBe('Only a boundary between two visible phases can be moved.');
  });

  it('are forgotten by Even phases, which refuses when none is stored', () => {
    expect(sentenceOf(base, { kind: 'action', action: 'ghg.even-phases', id: 'transistors' })).toBe("This trend's phases are already even.");
    const dragged = after(base, setField('transistors', 'ghg.trough-end', '1975-06'));
    expect(change(base, setField('transistors', 'ghg.trough-end', '1975-06'))).toEqual({ removed: [], added: ['    trough-end: 1975-06'] });
    expect(change(dragged, { kind: 'action', action: 'ghg.even-phases', id: 'transistors' })).toEqual({ removed: ['    trough-end: 1975-06'], added: [] });
  });
});

describe('influences', () => {
  it('are drawn once in each direction, from a trend or a trigger, to a trend', () => {
    expect(sentenceOf(base, { kind: 'connect', from: 'transistors', to: 'radio' })).toBe('This trend already influences that one; a trend influences another once in each direction.');
    expect(sentenceOf(base, { kind: 'connect', from: 'radio', to: 'radio' })).toBe('A trend cannot influence itself.');
    expect(sentenceOf(base, { kind: 'connect', from: 'radio', to: 'transistor-invented' })).toBe('An influence cannot end at a trigger.');
    expect(sentenceOf(base, { kind: 'connect', from: 'note-1', to: 'radio' })).toBe('An influence is drawn from one trend to another.');
  });

  it('leave the last visible phase at the bottom and arrive at the Peak on top when no end is given', () => {
    const added = change(base, { kind: 'connect', from: 'radio', to: 'transistors' }).added;
    expect(added[0]).toMatch(minted);
    expect(added.slice(1)).toEqual([
      '    from: radio', '    from-phase: slope', '    from-edge: bottom', '    from-at: 0.5',
      '    to: transistors', '    to-phase: peak', '    to-edge: top', '    to-at: 0.5',
    ]);
  });

  it('state no from end when they leave a trigger', () => {
    expect(change(base, { kind: 'connect', from: 'transistor-invented', to: 'radio' }).added.slice(1)).toEqual([
      '    from: transistor-invented', '    to: radio', '    to-phase: peak', '    to-edge: top', '    to-at: 0.5',
    ]);
  });

  it('have each end moved as phase/edge/at, two decimals at most', () => {
    expect(change(base, { kind: 'moveEnd', id: 'i-13', end: 'to', value: 'trough/bottom/0.333' }).added).toEqual(['    to-phase: trough', '    to-edge: bottom', '    to-at: 0.33']);
    expect(change(base, setField('i-13', 'ghg.to-attachment', 'trough/bottom/0.333')).added).toEqual(['    to-phase: trough', '    to-edge: bottom', '    to-at: 0.33']);
  });

  // The sentence is the host's own: the definition has words for an end typed in ADP Properties, and none for one a gesture asks.
  it('refuse an end that names no phase, or a fraction outside 0 to 1', () => {
    expect(edit(base, { kind: 'moveEnd', id: 'i-13', end: 'to', value: 'summit/top/0.5' }).kind).toBe('refused');
    expect(edit(base, { kind: 'moveEnd', id: 'i-13', end: 'to', value: 'peak/top/1.5' }).kind).toBe('refused');
  });
});

describe('removing', () => {
  it('takes a trigger and the influences from it in one edit, and asks first with their number', () => {
    const request = { kind: 'action', action: 'ghg.remove', id: 'transistor-invented' } as const;
    expect(edit(base, request)).toMatchObject({ kind: 'confirm', title: 'Remove', message: 'Removing this trigger also removes the 1 influence to or from it.' });
    expect(edit(base, { kind: 'action', action: 'ghg.remove', id: 'transistors' })).toMatchObject({ kind: 'confirm', message: 'Removing this trend also removes the 2 influences to or from it.' });
    expect(edit(base, { kind: 'action', action: 'ghg.remove', id: 'note-1' }).kind).toBe('applied');
    const removed = after(base, request, {}, true);
    const scene = type.view(removed, {});
    expect(scene.nodes.filter((node) => node.type === 'Trigger')).toHaveLength(0);
    expect(scene.edges.map((edge) => edge.id)).toEqual(['i-13']);
    expect(type.findings(removed)).toEqual([]);
    // docs/disl-support.md, "Removing the last trigger or note": the list's key stays.
    expect(removed.text).toContain('triggers:\nnotes:\n');
  });

  it('takes a note or an influence alone', () => {
    expect(change(base, { kind: 'action', action: 'ghg.remove', id: 'note-2' })).toEqual({ removed: ['  - id: note-2', '    text: A one-line remark', '    at: 1960-01', '    row: 5', '    width: 120', '    height: 40'], added: [] });
    const influence = change(base, { kind: 'action', action: 'ghg.disconnect', id: 'i-12' });
    expect(influence).toEqual({ removed: ['  - id: i-12', '    from: transistor-invented', '    to: transistors', '    to-phase: peak', '    to-edge: top', '    to-at: 0.2'], added: [] });
  });
});

describe('tags and descriptions', () => {
  it('are one line each, and an empty one removes its key', () => {
    expect(change(base, setField('transistors', 'ghg.tags', ' semiconductors, a,b , semiconductors ')).added).toEqual(['    tags: [semiconductors, a, b]']);
    expect(change(base, setField('transistor-invented', 'ghg.tags', ''))).toEqual({ removed: ['    tags: [electronics, invention]'], added: [] });
    expect(change(base, setField('i-13', 'ghg.description', 'Cheap, small receivers')).added).toEqual(['    description: Cheap, small receivers']);
    expect(change(base, setField('transistor-invented', 'ghg.description', ''))).toEqual({ removed: ['    description: Bardeen, Brattain and Shockley at Bell Labs.'], added: [] });
    // docs/disl-support.md, "A description of spaces only": it is written, where the hand-coded diagram removed the key.
    expect(change(base, setField('transistor-invented', 'ghg.description', ' ')).added).toEqual(['    description: " "']);
  });
});

describe('Arrange diagram', () => {
  // The largest example, technology-trends with 223 elements, takes about nine seconds to arrange through the tool type, where the
  // hand-coded diagram took a tenth of a second: the case is given two minutes, and the time is no part of what it holds.
  it.each(filesUnder('examples/gartner-hypecycle-graph', '.ghg'))('changes only row lines in %s, breaks no rule, and then has nothing left to do', (path) => {
    const source = sourceOf(read(path), path);
    const request = { kind: 'action', action: 'ghg.arrange' } as const;
    const first = edit(source, request);
    if (first.kind === 'refused') {
      expect(first.sentence).toBe('This graph is already arranged.');
      return;
    }
    expect(first.kind).toBe('applied');
    const arranged = { ...source, text: spliced(source.text, applied(first).splices) };
    const unplaced = (text: string): string[] => text.split(/\r?\n/).filter((line) => !/^\s+row: -?\d+$/.test(line));
    expect(unplaced(arranged.text)).toEqual(unplaced(source.text));
    expect(arranged.text).not.toBe(source.text);
    expect(type.findings(arranged)).toEqual([]);
    expect(edit(arranged, request)).toEqual({ kind: 'refused', sentence: 'This graph is already arranged.' });
  }, 120_000);
});

describe('a graph that cannot be read', () => {
  it('refuses every edit', () => {
    expect(sentenceOf(fixture('not-yaml'), { kind: 'action', action: 'ghg.arrange' })).toBe('The graph could not be read, so it cannot be edited.');
    expect(sentenceOf(fixture('not-yaml'), { kind: 'drop', entry: 'ghg.add.trend', x: 0, y: 0 })).toBe('The graph could not be read, so it cannot be edited.');
  });
});

describe('names', () => {
  it('are numbered from 2 when taken', () => {
    const names: string[] = [];
    let source = base;
    for (let index = 0; index < 3; index++) {
      names.push(dropped(source, 'ghg.add.trend', 0, 0).added[1]);
      source = after(source, { kind: 'drop', entry: 'ghg.add.trend', x: 0, y: 0 });
    }
    expect(names).toEqual(['    name: New trend', '    name: New trend 2', '    name: New trend 3']);
    expect(dropped(base, 'ghg.add.trigger', 0, 0).added[1]).toBe('    name: Trigger');
    expect(dropped(after(base, { kind: 'drop', entry: 'ghg.add.trigger', x: 0, y: 0 }), 'ghg.add.trigger', 0, 0).added[1]).toBe('    name: Trigger 2');
  });
});
