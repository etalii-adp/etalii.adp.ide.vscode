import { describe, expect, it } from 'vitest';
import { apply, parseNoteSize, removalConfirmation, uniqueName, type Edit } from '../../../src/core/gartner-hypecycle-graph/edits';
import { parse } from '../../../src/core/gartner-hypecycle-graph/parser';
import { findingsOf } from '../../../src/core/gartner-hypecycle-graph/rules';
import { parseMonth, xOf } from '../../../src/core/gartner-hypecycle-graph/scale';
import { timeUnitNamed } from '../../../src/core/gartner-hypecycle-graph/model';
import { LineDocument } from '../../../src/core/text/lineDocument';
import { spliceBetween } from '../../../src/core/text/splice';
import { filesUnder, read } from '../files';

const base = read('fixtures/gartner-hypecycle-graph/triggers-and-notes.ghg');
const year = timeUnitNamed('year')!;

/** The lines an edit took out and put in, and nothing else: every other line is proven untouched. */
function change(text: string, edit: Edit): { removed: string[]; added: string[]; text: string } {
  const outcome = apply(text, edit);
  if (outcome.refusal !== undefined) throw new Error(`refused: ${outcome.refusal}`);
  const splice = spliceBetween(text, outcome.text);
  if (!splice) return { removed: [], added: [], text: outcome.text };
  const lines = LineDocument.parse(text).lines.map((line) => line.text);
  const added = splice.text.length === 0 ? [] : splice.text.replace(/\r?\n$/, '').split(/\r?\n/);
  // Whatever was written uses the file's own line ending.
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  expect(splice.text.replaceAll(eol, '')).not.toMatch(/[\r\n]/);
  return { removed: lines.slice(splice.startLine, splice.endLine), added, text: outcome.text };
}

const refusal = (text: string, edit: Edit): string | undefined => apply(text, edit).refusal;

describe('renaming', () => {
  it('rewrites the one name line of a trend', () => {
    expect(change(base, { kind: 'rename', id: 'transistors', name: ' Solid state ' })).toMatchObject({ removed: ['    name: Transistors'], added: ['    name: Solid state'] });
  });

  it('quotes a name only where YAML needs it', () => {
    expect(change(base, { kind: 'rename', id: 'radio', name: 'Radio: the pocket kind' }).added).toEqual(['    name: "Radio: the pocket kind"']);
  });

  it('refuses a trend or a trigger without a name, and lets a note be emptied', () => {
    expect(refusal(base, { kind: 'rename', id: 'transistors', name: '  ' })).toBe('A trend needs a name.');
    expect(refusal(base, { kind: 'rename', id: 'transistor-invented', name: '' })).toBe('A trigger needs a name.');
    expect(change(base, { kind: 'rename', id: 'note-2', name: '' }).added).toEqual(['    text: ""']);
  });

  it('writes a note of several lines as a literal block, and one line as a scalar again', () => {
    const block = change(base, { kind: 'rename', id: 'note-2', name: 'First\n\nSecond' });
    expect(block).toMatchObject({ removed: ['    text: A one-line remark'], added: ['    text: |-', '      First', '', '      Second'] });
    expect(parse(LineDocument.parse(block.text)).notes[1].text).toBe('First\n\nSecond');
    const scalar = change(base, { kind: 'rename', id: 'note-1', name: 'Short' });
    expect(scalar).toMatchObject({ removed: ['    text: |-', '      Dates are illustrative.', '', '      See the readme.'], added: ['    text: Short'] });
  });

  it('says so when the element is gone', () => {
    expect(refusal(base, { kind: 'rename', id: 'nobody', name: 'x' })).toBe('That is no longer in this graph.');
  });
});

describe('adding from the toolbox', () => {
  it('appends a trend after the last one: 12 steps of the unit, four phases, in the step and row of the drop', () => {
    const x = xOf(parseMonth('1960-01')!, year) + 1;
    const added = change(base, { kind: 'addTrend', x, y: 56 * 4 + 16, id: 'new' });
    expect(added).toMatchObject({ removed: [], added: ['  - id: new', '    name: New trend', '    start: 1960-01', '    stop: 1972-01', '    row: 4', '    phases: 4'] });
    const again = change(added.text, { kind: 'addTrend', x, y: 0, id: 'newer' });
    expect(again.added[1]).toBe('    name: New trend 2');
  });

  it('appends a trigger and a note to the lists the document has', () => {
    const x = xOf(parseMonth('1970-01')!, year);
    expect(change(base, { kind: 'addTrigger', x, y: 16, id: 't2' }).added).toEqual(['  - id: t2', '    name: Trigger', '    date: 1970-01', '    row: 0']);
    expect(change(base, { kind: 'addNote', x, y: 60, id: 'n3' }).added).toEqual(['  - id: n3', '    text: ""', '    at: 1970-01', '    row: 1', '    width: 160', '    height: 64']);
  });

  it('opens a triggers or notes list before the influences when the document has none', () => {
    const clean = read('fixtures/gartner-hypecycle-graph/rules-clean.ghg');
    const model = parse(LineDocument.parse(clean));
    expect(model.triggers).toHaveLength(0);
    const added = change(clean, { kind: 'addTrigger', x: 0, y: 0, id: 't1' });
    expect(added.added[0]).toBe('triggers:');
    const lines = LineDocument.parse(added.text).lines.map((line) => line.text);
    expect(lines.indexOf('triggers:')).toBeLessThan(lines.indexOf('influences:'));
    expect(findingsOf(parse(LineDocument.parse(added.text)))).toEqual([]);
  });

  it('refuses an id that is already used, across all four lists', () => {
    expect(refusal(base, { kind: 'addTrend', x: 0, y: 0, id: 'note-1' })).toBe('That id is already used in this graph.');
  });

  it('mints an id when none is given', () => {
    const added = change(base, { kind: 'addTrend', x: 0, y: 0 });
    expect(added.added[0]).toMatch(/^ {2}- id: [0-9a-z]{25}$/);
  });
});

describe('placing and sizing', () => {
  it('moves a trend by rewriting its dates and row, shifting what it stores', () => {
    const withBoundary = change(base, { kind: 'setBoundary', id: 'transistors', index: 0, month: '1960-01' });
    expect(withBoundary).toMatchObject({ removed: [], added: ['    peak-end: 1960-01'] });
    const moved = change(withBoundary.text, { kind: 'setPlacement', id: 'transistors', x: xOf(parseMonth('1955-01')!, year), y: 56 * 2 });
    expect(moved.added).toEqual(['    start: 1955-01', '    stop: 1995-01', '    row: 2', '    phases: 4', '    peak-end: 1965-01']);
  });

  it('rescales stored boundaries when a date is typed', () => {
    const withBoundary = change(base, { kind: 'setBoundary', id: 'transistors', index: 0, month: '1960-01' }).text;
    const resized = change(withBoundary, { kind: 'setSpan', id: 'transistors', stop: '1970-01' });
    expect(resized.added).toEqual(['    stop: 1970-01', '    row: 1', '    phases: 4', '    peak-end: 1955-01']);
  });

  it('refuses a span that is not a date, not after its start, or shorter than its phases', () => {
    expect(refusal(base, { kind: 'setSpan', id: 'radio', stop: 'June' })).toBe("'June' is not a date; write it as YYYY-MM, such as 2007-06.");
    expect(refusal(base, { kind: 'setSpan', id: 'radio', stop: '1954-01' })).toBe('A trend must stop after it starts, at least one month later.');
    expect(refusal(base, { kind: 'setSpan', id: 'radio', stop: '1954-03' })).toBe('A trend showing 3 phases must be at least 3 months long, one per phase.');
    expect(refusal(base, { kind: 'setPhases', id: 'radio', phases: 5 })).toBe('A trend shows 1 to 4 phases.');
  });

  it('moves a trigger by its centre and a note by its top-left', () => {
    const x = xOf(parseMonth('1950-01')!, year);
    expect(change(base, { kind: 'setPlacement', id: 'transistor-invented', x: x - 8, y: 56 * 2 + 8 }).added).toEqual(['    date: 1950-01', '    row: 2']);
    expect(change(base, { kind: 'setPlacement', id: 'note-2', x, y: 56 }).added).toEqual(['    at: 1950-01', '    row: 1']);
  });

  it('resizes a note in one edit, and reads the size the grid writes', () => {
    expect(change(base, { kind: 'setNoteSize', id: 'note-2', size: '200.456 x 80 at 1961-01 row 6' }).added).toEqual(['    at: 1961-01', '    row: 6', '    width: 200.46', '    height: 80']);
    expect(parseNoteSize('160 x 64')).toEqual({ width: 160, height: 64 });
    expect(refusal(base, { kind: 'setNoteSize', id: 'note-2', size: 'big' })).toBe("'big' is not a size; write it as width x height, such as 160 x 64.");
  });
});

describe('phase boundaries', () => {
  it('can be moved only between two visible phases', () => {
    expect(refusal(base, { kind: 'setBoundary', id: 'radio', index: 2, month: '1970-01' })).toBe('Only a boundary between two visible phases can be moved.');
  });

  it('are forgotten by Even phases, which refuses when none is stored', () => {
    expect(refusal(base, { kind: 'clearBoundaries', id: 'transistors' })).toBe("This trend's phases are already even.");
    const dragged = change(base, { kind: 'setBoundary', id: 'transistors', index: 1, month: '1975-06' }).text;
    expect(change(dragged, { kind: 'clearBoundaries', id: 'transistors' })).toMatchObject({ removed: ['    trough-end: 1975-06'], added: [] });
  });
});

describe('influences', () => {
  it('are drawn once in each direction, from a trend or a trigger, to a trend', () => {
    expect(refusal(base, { kind: 'addInfluence', from: 'transistors', to: 'radio' })).toBe('This trend already influences that one; a trend influences another once in each direction.');
    expect(refusal(base, { kind: 'addInfluence', from: 'radio', to: 'radio' })).toBe('A trend cannot influence itself.');
    expect(refusal(base, { kind: 'addInfluence', from: 'radio', to: 'transistor-invented' })).toBe('An influence cannot end at a trigger.');
    expect(refusal(base, { kind: 'addInfluence', from: 'note-1', to: 'radio' })).toBe('An influence is drawn from one trend to another.');
  });

  it('leave the last visible phase at the bottom and arrive at the Peak on top when no end is given', () => {
    expect(change(base, { kind: 'addInfluence', from: 'radio', to: 'transistors', id: 'back' }).added).toEqual([
      '  - id: back', '    from: radio', '    from-phase: slope', '    from-edge: bottom', '    from-at: 0.5',
      '    to: transistors', '    to-phase: peak', '    to-edge: top', '    to-at: 0.5',
    ]);
  });

  it('state no from end when they leave a trigger', () => {
    expect(change(base, { kind: 'addInfluence', from: 'transistor-invented', to: 'radio', id: 'spark' }).added).toEqual([
      '  - id: spark', '    from: transistor-invented', '    to: radio', '    to-phase: peak', '    to-edge: top', '    to-at: 0.5',
    ]);
  });

  it('have each end moved as phase/edge/at, two decimals at most', () => {
    expect(change(base, { kind: 'setAttachment', id: 'i-13', side: 'to', end: 'trough/bottom/0.333' }).added).toEqual(['    to-phase: trough', '    to-edge: bottom', '    to-at: 0.33']);
    expect(refusal(base, { kind: 'setAttachment', id: 'i-13', side: 'to', end: 'summit/top/0.5' })).toBe('An influence attaches to a phase, on its top or bottom edge, at a fraction from 0 to 1.');
  });
});

describe('removing', () => {
  it('takes a trigger and the influences from it in one edit, and asks first with their number', () => {
    const model = parse(LineDocument.parse(base));
    expect(removalConfirmation(model, 'transistor-invented')).toEqual({ title: 'Remove', message: 'Removing this trigger also removes the 1 influence to or from it.' });
    expect(removalConfirmation(model, 'transistors')?.message).toBe('Removing this trend also removes the 2 influences to or from it.');
    expect(removalConfirmation(model, 'note-1')).toBeUndefined();
    const after = parse(LineDocument.parse(change(base, { kind: 'remove', id: 'transistor-invented' }).text));
    expect(after.triggers).toHaveLength(0);
    expect(after.influences.map((influence) => influence.id)).toEqual(['i-13']);
    expect(findingsOf(after)).toEqual([]);
  });

  it('takes a note or an influence alone', () => {
    expect(change(base, { kind: 'remove', id: 'note-2' }).removed).toEqual(['  - id: note-2', '    text: A one-line remark', '    at: 1960-01', '    row: 5', '    width: 120', '    height: 40']);
    expect(change(base, { kind: 'removeInfluence', id: 'i-12' }).removed[0]).toBe('  - id: i-12');
  });
});

describe('tags and descriptions', () => {
  it('are one line each, and an empty one removes its key', () => {
    expect(change(base, { kind: 'setTags', id: 'transistors', tags: ' semiconductors, a,b , semiconductors ' }).added).toEqual(['    tags: [semiconductors, a, b]']);
    expect(change(base, { kind: 'setTags', id: 'transistor-invented', tags: '' })).toMatchObject({ removed: ['    tags: [electronics, invention]'], added: [] });
    expect(change(base, { kind: 'setDescription', id: 'i-13', description: 'Cheap, small receivers' }).added).toEqual(['    description: Cheap, small receivers']);
    expect(change(base, { kind: 'setDescription', id: 'transistor-invented', description: ' ' }).removed).toEqual(['    description: Bardeen, Brattain and Shockley at Bell Labs.']);
  });
});

describe('Arrange diagram', () => {
  it.each(filesUnder('examples/gartner-hypecycle-graph', '.ghg'))('changes only row lines in %s, breaks no rule, and then has nothing left to do', (path) => {
    const text = read(path);
    const first = apply(text, { kind: 'arrange' });
    if (first.refusal !== undefined) {
      expect(first.refusal).toBe('This graph is already arranged.');
      return;
    }
    const before = LineDocument.parse(text).lines.map((line) => line.text).filter((line) => !/^\s+row: -?\d+$/.test(line));
    const after = LineDocument.parse(first.text).lines.map((line) => line.text).filter((line) => !/^\s+row: -?\d+$/.test(line));
    expect(after).toEqual(before);
    expect(findingsOf(parse(LineDocument.parse(first.text)))).toEqual([]);
    expect(apply(first.text, { kind: 'arrange' }).refusal).toBe('This graph is already arranged.');
  });
});

describe('a graph that cannot be read', () => {
  it('refuses every edit', () => {
    expect(refusal(read('fixtures/gartner-hypecycle-graph/not-yaml.ghg'), { kind: 'arrange' })).toBe('The graph could not be read, so it cannot be edited.');
  });
});

describe('names', () => {
  it('are numbered from 2 when taken', () => {
    expect(uniqueName(['New trend', 'New trend 2'], 'New trend')).toBe('New trend 3');
    expect(uniqueName([], 'Trigger')).toBe('Trigger');
  });
});