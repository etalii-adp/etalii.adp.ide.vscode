import { describe, expect, it } from 'vitest';
import type { EditOutcome, ViewElement } from '../../../src/core/frame/diagramType';
import { viewTypeOf } from '../../../src/core/frame/diagramType';
import { attachmentPoint, bannerOf, boundaryLanding, evenFractions, nearestAttachment } from '../../../src/core/gartner-hypecycle-graph/geometry';
import { actionIds, fieldIds, gartnerHypecycleGraph as type } from '../../../src/core/gartner-hypecycle-graph/index';
import { filesUnder, read } from '../files';

const text = read('fixtures/gartner-hypecycle-graph/triggers-and-notes.ghg');
const source = { text };
const element = (id: string, options = {}): ViewElement => type.view(source, options).elements.find((candidate) => candidate.id === id)!;
const applied = (outcome: EditOutcome): string => {
  if (outcome.kind !== 'applied') throw new Error(`not applied: ${JSON.stringify(outcome)}`);
  return outcome.text;
};

describe('the hype cycle graph as a diagram type', () => {
  it('carries the names every ADP host uses', () => {
    expect(type.origin).toBe('gartner/hypecycle-graph');
    expect(type.displayName).toBe('Gartner hype cycle graph');
    expect(viewTypeOf(type)).toBe('etalii.adp.gartner.hypecycle-graph');
    expect(type.extensions).toEqual(['ghg']);
    expect(type.shared).toBe(false);
  });

  it('starts a new document that reads cleanly and takes a first trend', () => {
    const created = type.newDocument('anything');
    expect(created).toBe('gartner-hypecycle-graph: 1\r\ntrends: []\r\ninfluences: []\r\n');
    expect(type.findings({ text: created })).toEqual([]);
    const withTrend = applied(type.edit({ text: created }, { kind: 'drop', entry: actionIds.addTrend, x: 0, y: 16 }, {}, false));
    expect(withTrend).toContain('trends:\r\n  - id: ');
    expect(type.view({ text: withTrend }, {}).elements).toHaveLength(1);
  });
});

describe('what is drawn', () => {
  it('puts a trend at its start and row, as wide as its span, with its phases spread evenly', () => {
    expect(element('transistors')).toMatchObject({ type: 'trend', x: 200, y: 56, width: 160, height: 32, label: 'Transistors' });
    expect(element('transistors').data).toMatchObject({ phases: 4, boundaries: [0.25, 0.5, 0.75], phaseTooltips: ['Peak of Inflated Expectations', 'Trough of Disillusionment', 'Slope of Enlightenment', 'Plateau of Productivity'] });
    expect(element('radio').data.phases).toBe(3);
  });

  it('centres a trigger on the start of its step and the middle of its row, labelled with its date in the unit', () => {
    const trigger = element('transistor-invented');
    expect(trigger.x + 8).toBeCloseTo(((1947 * 12 + 11 - 22800) * 4) / 12, 9);
    expect(trigger).toMatchObject({ y: 56 + 16 - 8, width: 16, height: 16, label: 'Transistor invented', tooltip: 'Trigger: Transistor invented, 1947' });
    expect(trigger.data.labelText).toBe('Transistor invented · 1947');
  });

  it('draws a note at its date and row with its own size', () => {
    expect(element('note-1')).toMatchObject({ type: 'note', x: 200, y: 168, width: 160, height: 64 });
  });

  it('sends an influence from a trigger without a source attachment', () => {
    const relations = type.view(source, {}).relations;
    expect(relations.map((relation) => relation.id)).toEqual(['i-12', 'i-13']);
    expect(relations[0].data).toEqual({ source: undefined, target: { edge: 'top', region: 0, at: 0.2 }, hidden: false });
    expect(relations[1].data.source).toEqual({ edge: 'bottom', region: 2, at: 0.5 });
  });

  it('hides, and keeps, an influence attached to a phase its trend does not show', () => {
    const view = type.view({ text: read('fixtures/gartner-hypecycle-graph/rule-duplicate-hidden.ghg') }, {});
    expect(view.relations.map((relation) => [relation.id, relation.data.hidden])).toEqual([['ab', true], ['ab2', false]]);
  });

  it('shows only what the tag filter matches, with notes always, and no influence to a hidden element', () => {
    const any = type.view(source, { filterTags: ['ELECTRONICS', 'nothing'], filterMode: 'any' });
    expect(any.elements.map((candidate) => candidate.id)).toEqual(['transistor-invented', 'note-1', 'note-2']);
    expect(any.relations).toEqual([]);
    const all = type.view(source, { filterTags: ['electronics', 'nothing'], filterMode: 'all' });
    expect(all.elements.map((candidate) => candidate.id)).toEqual(['note-1', 'note-2']);
  });

  it('draws only what is in view, and both ends of an influence that crosses it', () => {
    const view = type.view(source, { viewport: { x: 215, y: 100, width: 10, height: 10 } });
    expect(view.elements.map((candidate) => candidate.id).sort()).toEqual(['radio', 'transistors']);
    expect(view.relations.map((relation) => relation.id)).toEqual(['i-13']);
  });

  it('declares its chrome: the unit, the ruler rungs a diagram of years can snap to, the tags in use and the legend', () => {
    const chrome = type.view(source, {}).chrome;
    expect(chrome).toMatchObject({ unit: 'year', compact: false, tags: ['electronics', 'invention'] });
    expect((chrome.ruler as { every: string }[]).map((rung) => rung.every)).toEqual(['year', 'decade', 'century', 'millennium']);
    expect((chrome.legend as { caption: string }[]).map((entry) => entry.caption)).toEqual(['Peak', 'Trough', 'Slope', 'Plateau']);
  });

  it('opens a document that is not YAML as an empty, read-only diagram that says why', () => {
    const view = type.view({ text: read('fixtures/gartner-hypecycle-graph/not-yaml.ghg') }, {});
    expect(view).toMatchObject({ elements: [], relations: [], readOnly: true, notice: 'The graph could not be read, so it cannot be edited.' });
    expect(type.actions({ text: read('fixtures/gartner-hypecycle-graph/not-yaml.ghg') }, [])).toEqual([]);
  });
});

describe('Compact', () => {
  it.each(filesUnder('examples/gartner-hypecycle-graph', '.ghg'))('packs %s along its rows without overlap, in start order, with causes left of effects', (path) => {
    const example = { text: read(path) };
    const trueTime = type.view(example, {});
    const compact = type.view(example, { compact: true });
    expect(compact.chrome).toMatchObject({ compact: true, ruler: [] });
    expect(compact.elements.map((candidate) => candidate.id)).toEqual(trueTime.elements.map((candidate) => candidate.id));

    const byId = new Map(compact.elements.map((candidate) => [candidate.id, candidate]));
    for (const candidate of compact.elements) {
      // Every element keeps its row; only a trend takes the compact width, a share per phase.
      expect(candidate.y).toBe(trueTime.elements.find((other) => other.id === candidate.id)!.y);
      if (candidate.type === 'trend') expect(candidate.width).toBe(24 * (candidate.data.phases as number));
      expect(candidate.data.movable).toBe(false);
    }
    const sameRow = (a: ViewElement, b: ViewElement): boolean => a.y < b.y + b.height && b.y < a.y + a.height;
    for (const a of compact.elements) {
      for (const b of compact.elements) {
        if (a.id < b.id && sameRow(a, b)) {
          expect(a.x + a.width <= b.x || b.x + b.width <= a.x, `${a.id} and ${b.id} overlap`).toBe(true);
        }
      }
    }
    for (const relation of compact.relations) {
      const from = byId.get(relation.from)!;
      const to = byId.get(relation.to)!;
      const fromStart = trueTime.elements.find((other) => other.id === relation.from)!.x;
      const toStart = trueTime.elements.find((other) => other.id === relation.to)!.x;
      // A target that starts after its source is placed after the middle of it.
      if (toStart > fromStart) expect(to.x).toBeGreaterThan(from.x + from.width / 2);
    }
  });
});

describe('ADP Properties', () => {
  it('shows a trend its identity, time, phases and each phase\'s influences', () => {
    const fields = type.fields(source, ['transistors']);
    expect(fields.map((field) => `${field.group}/${field.label}`)).toEqual([
      'Identity/Name', 'Identity/Description', 'Identity/Tags', 'Time/Start', 'Time/Stop', 'Phases/Phases',
      'Phases/Peak ends', 'Phases/Trough ends', 'Phases/Slope ends',
      'Peak/Influence', 'Peak/Influenced by', 'Trough/Influence', 'Trough/Influenced by', 'Slope/Influence', 'Slope/Influenced by', 'Plateau/Influence', 'Plateau/Influenced by',
    ]);
    const byId = new Map(fields.map((field) => [field.id, field]));
    expect(byId.get(fieldIds.phases)).toMatchObject({ control: 'slider', value: 'All four', options: ['Peak', 'Peak and Trough', 'Peak, Trough and Slope', 'All four'] });
    expect(byId.get(fieldIds.tags)).toMatchObject({ control: 'tags', value: '', options: ['electronics', 'invention'] });
    expect(byId.get(fieldIds.boundaries[0])?.value).toBe('1960-01');
    expect(byId.get('ghg.peak-influenced-by')).toMatchObject({ value: 'Transistor invented', readOnly: 'Draw, reattach or delete an influence on the canvas.' });
    expect(byId.get('ghg.slope-influences')?.value).toBe('Transistor radio · Peak');
    expect(byId.get('ghg.plateau-influences')?.value).toBe('None');
  });

  it('shows a trigger, a note and an influence the rows each has', () => {
    expect(type.fields(source, ['transistor-invented']).map((field) => field.label)).toEqual(['Name', 'Description', 'Tags', 'Date']);
    expect(type.fields(source, ['note-1']).map((field) => [field.label, field.value])).toEqual([['Text', 'Dates are illustrative.\n\nSee the readme.'], ['Size', '160 x 64']]);
    expect(type.fields(source, ['i-13']).map((field) => [field.label, field.value])).toEqual([
      ['Description', ''], ['From', 'Transistors · Slope'], ['To', 'Transistor radio · Peak'], ['From attachment', 'slope/bottom/0.5'], ['To attachment', 'peak/top/0.1'],
    ]);
    expect(type.fields(source, [])).toEqual([]);
  });

  it('edits through the same edits the canvas makes, and refuses with a sentence at the field', () => {
    const fewer = applied(type.edit(source, { kind: 'setField', id: 'transistors', field: fieldIds.phases, value: 'Peak and Trough' }, {}, false));
    expect(fewer).toContain('    phases: 2\n');
    expect(type.edit(source, { kind: 'setField', id: 'transistors', field: fieldIds.phases, value: 'Summit' }, {}, false))
      .toEqual({ kind: 'refused', sentence: "'Summit' is not one of Peak, Peak and Trough, Peak, Trough and Slope, All four." });
    expect(type.edit(source, { kind: 'setField', id: 'i-13', field: fieldIds.toAttachment, value: 'nowhere' }, {}, false))
      .toEqual({ kind: 'refused', sentence: "'nowhere' is not an attachment; write it as phase/edge/at, such as plateau/bottom/0.3." });
    expect(type.edit(source, { kind: 'setField', id: 'note-1', field: fieldIds.start, value: '1950-01' }, {}, false))
      .toEqual({ kind: 'refused', sentence: "'ghg.start' cannot be edited on this selection." });
  });
});

describe('actions and gestures', () => {
  it('offers each kind of element what the definition gives it', () => {
    const labels = (id?: string): string[] => type.actions(source, id ? [id] : []).map((action) => `${action.label}${action.shortcut ? ` (${action.shortcut})` : ''}`);
    expect(labels('transistors')).toEqual(['Rename… (F2)', 'Remove (Delete)', 'Arrange diagram']);
    expect(labels('note-1')).toEqual(['Edit text… (F2)', 'Remove (Delete)', 'Arrange diagram']);
    expect(labels('i-12')).toEqual(['Remove influence (Delete)', 'Arrange diagram']);
    expect(labels()).toEqual(['Arrange diagram']);
    const dragged = applied(type.edit(source, { kind: 'handle', id: 'transistors', handle: 0, x: 240 }, {}, false));
    expect(dragged).toContain('    peak-end: 1960-01\n');
    expect(type.actions({ text: dragged }, ['transistors']).map((action) => action.label)).toContain('Even phases');
  });

  it('asks before removing something with influences, and removes at once when confirmed or when there are none', () => {
    const request = { kind: 'action', action: actionIds.remove, id: 'transistor-invented' } as const;
    expect(type.edit(source, request, {}, false)).toEqual({
      kind: 'confirm', title: 'Remove', message: 'Removing this trigger also removes the 1 influence to or from it.', confirmLabel: 'Remove', danger: true,
    });
    expect(applied(type.edit(source, request, {}, true))).not.toContain('transistor-invented');
    expect(type.edit(source, { kind: 'action', action: actionIds.remove, id: 'note-2' }, {}, false).kind).toBe('applied');
  });

  it('renames in place: one line for a trend or trigger, several for a note', () => {
    expect(type.edit(source, { kind: 'action', action: actionIds.rename, id: 'radio' }, {}, false)).toEqual({ kind: 'editInPlace', id: 'radio', multiline: false });
    expect(type.edit(source, { kind: 'action', action: actionIds.rename, id: 'note-1' }, {}, false)).toEqual({ kind: 'editInPlace', id: 'note-1', multiline: true });
  });

  it('opens a dropped note\'s editor at once, and selects whatever was dropped or drawn', () => {
    const note = type.edit(source, { kind: 'drop', entry: actionIds.addNote, x: 200, y: 400 }, {}, false);
    expect(note).toMatchObject({ kind: 'applied', editLabel: true });
    const drawn = type.edit(source, { kind: 'connect', from: 'radio', to: 'transistors', fromEnd: 'peak/top/0.25', toEnd: 'plateau/bottom/0.75' }, {}, false);
    expect(applied(drawn)).toContain('    from-phase: peak\n    from-edge: top\n    from-at: 0.25\n    to: transistors\n    to-phase: plateau\n    to-edge: bottom\n    to-at: 0.75\n');
    expect(drawn).toHaveProperty('select');
  });

  it('turns a resize into the date of the edge that moved, and a note\'s into its size and place', () => {
    const right = applied(type.edit(source, { kind: 'resize', id: 'radio', side: 'right', bounds: { x: 216, y: 112, width: 100, height: 32 } }, {}, false));
    expect(right).toContain('    stop: 1979-01\n');
    const note = applied(type.edit(source, { kind: 'resize', id: 'note-2', side: 'corner', bounds: { x: 240, y: 280, width: 130.5, height: 44 } }, {}, false));
    expect(note).toContain('    at: 1960-01\n    row: 5\n    width: 130.5\n    height: 44\n');
  });
});

describe('the banner a trend is drawn as', () => {
  const bounds = { x: 0, y: 0, width: 160, height: 32 };
  const banner = bannerOf(bounds, 4, evenFractions(4));

  it('ends its body 16 short of the right and its point at the full width', () => {
    expect(banner.outline).toEqual([{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 160, y: 16 }, { x: 144, y: 32 }, { x: 0, y: 32 }]);
    expect(banner.dividers.map((divider) => divider.x)).toEqual([40, 80, 120]);
    expect(banner.dividers[0].points).toEqual([{ x: 24, y: 0 }, { x: 40, y: 16 }, { x: 24, y: 32 }]);
    expect(banner.segments.map((segment) => [segment.from, segment.to])).toEqual([[0, 24], [24, 64], [64, 104], [104, 144]]);
  });

  it('places an attachment along its phase\'s stretch of the edge, and finds the nearest one for a point', () => {
    expect(attachmentPoint({ edge: 'bottom', region: 1, at: 0.5 }, bounds, banner)).toEqual({ x: 44, y: 32 });
    expect(nearestAttachment({ x: 44, y: 30 }, bounds, banner)).toEqual({ edge: 'bottom', region: 1, at: 0.5 });
    expect(nearestAttachment({ x: 500, y: -5 }, bounds, banner)).toEqual({ edge: 'top', region: 3, at: 1 });
  });

  it('lands a dragged boundary on a step, at least one step from its neighbours', () => {
    expect(boundaryLanding(banner, bounds, 0, 21.9, 4)).toBe(20);
    expect(boundaryLanding(banner, bounds, 0, -50, 4)).toBe(4);
    expect(boundaryLanding(banner, bounds, 0, 500, 4)).toBe(76);
  });
});