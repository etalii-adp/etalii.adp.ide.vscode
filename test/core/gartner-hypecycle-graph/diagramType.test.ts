import { describe, expect, it } from 'vitest';
import { viewTypeOf } from '../../../src/core/frame/toolType';
import type { SceneNode } from '../../../src/core/scene/scene';
import { filesUnder, read } from '../files';
import { applied, fixture, linesChanged, sourceOf, spliced, viewing } from '../tool/support';
import { after, base, change, edit, graph, nodeOf, oneTrend, type, written } from './hypeCycle';

describe('the hype cycle graph as a diagram type', () => {
  it('carries the names every ADP host uses', () => {
    expect(type.origin).toBe('gartner/hypecycle-graph');
    expect(type.displayName).toBe('Gartner hype cycle graph');
    expect(type.kind).toBe('diagram');
    expect(viewTypeOf(type)).toBe('etalii.adp.gartner.hypecycle-graph');
    expect(type.claims).toEqual([{ extensions: ['ghg'], shared: false, marker: false, registrationOnly: false }]);
  });

  it('starts a new document that reads cleanly and takes a first trend', () => {
    const created = type.newDocument('anything');
    expect(created).toBe('gartner-hypecycle-graph: 1\r\ntrends: []\r\ninfluences: []\r\n');
    expect(type.findings(sourceOf(created))).toEqual([]);
    const withTrend = after(sourceOf(created), { kind: 'drop', entry: 'ghg.add.trend', x: 0, y: 16 });
    expect(withTrend.text).toContain('trends:\r\n  - id: ');
    expect(type.view(withTrend, {}).nodes).toHaveLength(1);
  });
});

describe('what is drawn', () => {
  it('puts a trend at its start and row, as wide as its span, with its phases spread evenly', () => {
    const trend = nodeOf(base, 'transistors');
    expect(trend).toMatchObject({ type: 'Trend', box: { x: 200, y: 56, width: 160, height: 32 } });
    expect(trend.labels[0]).toMatchObject({ text: 'Transistors', editText: 'Transistors' });
    // The phases a trend shows, and where each ends as a fraction of its span.
    expect(trend.params).toEqual({ count: 4, b1: 0.25, b2: 0.5, b3: 0.75 });
    expect(trend.parts.filter((part) => part.hit).map((part) => part.tooltip)).toEqual(['Peak of Inflated Expectations', 'Trough of Disillusionment', 'Slope of Enlightenment', 'Plateau of Productivity']);
    expect(nodeOf(base, 'radio').params.count).toBe(3);
    expect(nodeOf(base, 'radio').parts.filter((part) => part.hit)).toHaveLength(3);
  });

  it('centres a trigger on the start of its step and the middle of its row, labelled with its date in the unit', () => {
    const trigger = nodeOf(base, 'transistor-invented');
    expect(trigger.box.x + 8).toBeCloseTo(((1947 * 12 + 11 - 22800) * 4) / 12, 9);
    expect(trigger).toMatchObject({ type: 'Trigger', box: { y: 56 + 16 - 8, width: 16, height: 16 }, tooltip: 'Trigger: Transistor invented, 1947' });
    expect(trigger.labels[0]).toMatchObject({ editText: 'Transistor invented', text: 'Transistor invented · 1947' });
  });

  it('draws a note at its date and row with its own size', () => {
    expect(nodeOf(base, 'note-1')).toMatchObject({ type: 'Note', box: { x: 200, y: 168, width: 160, height: 64 } });
  });

  it('sends an influence from a trigger without a source attachment', () => {
    const edges = type.view(base, {}).edges;
    expect(edges.map((edge) => edge.id)).toEqual(['i-12', 'i-13']);
    // docs/disl-support.md, "An end on a trigger": it is drawn from the outline, and names no part.
    expect(edges[0].from).toMatchObject({ node: 'transistor-invented' });
    expect(edges[0].from?.part).toBeUndefined();
    expect(edges[0].to).toMatchObject({ node: 'transistors', part: 'peak', side: 'top', at: 0.2 });
    expect(edges[0].hidden).toBeUndefined();
    expect(edges[1].from).toMatchObject({ node: 'transistors', part: 'slope', side: 'bottom', at: 0.5 });
  });

  it('hides, and keeps, an influence attached to a phase its trend does not show', () => {
    const scene = type.view(fixture('rule-duplicate-hidden'), {});
    expect(scene.edges.map((edge) => [edge.id, edge.hidden])).toEqual([['ab', 'part'], ['ab2', undefined]]);
  });

  // The hand-coded diagram drew only what was in view. A scene holds every element: the part in view bounds the ticks of the ruler alone.
  it('draws every element whatever is in view, and both ends of each influence', () => {
    const whole = type.view(base, {});
    const scene = type.view(base, { viewport: { x: 215, y: 100, width: 10, height: 10 } });
    expect(scene.nodes.map((node) => node.id)).toEqual(['transistors', 'radio', 'transistor-invented', 'note-1', 'note-2']);
    expect(scene.nodes).toEqual(whole.nodes);
    expect(scene.edges).toEqual(whole.edges);
    expect(scene.chrome!.rulers[0].levels[0].ticks.map((tick) => tick.label)).toEqual(['1954', '1955', '1956']);
  });

  it('declares its chrome: the unit, the ruler rungs a diagram of years can snap to, the tags in use and the legend', () => {
    const chrome = type.view(base, {}).chrome!;
    // A diagram of years: a tick each year, decade, century and millennium, and none for a month.
    expect(chrome.rulers[0].levels.map((level) => level.spacing)).toEqual([4, 40, 400, 4000]);
    expect(chrome.rulers[0].levels[1].ticks.map((tick) => tick.label)).toEqual(['1950', '1960', '1970', '1980', '1990']);
    expect(chrome.toggles).toEqual([{ viewpoint: 'compact', label: 'Compact', on: false }]);
    expect(chrome.filters.map((filter) => [filter.id, filter.options])).toEqual([['tags', ['electronics', 'invention']]]);
    expect(chrome.legend.map((entry) => entry.label)).toEqual(['Peak', 'Trough', 'Slope', 'Plateau']);
  });

  it('opens a document that is not YAML as an empty, read-only diagram that says why', () => {
    const broken = fixture('not-yaml');
    expect(type.view(broken, {})).toMatchObject({ nodes: [], edges: [], readOnly: true, notice: 'The graph could not be read, so it cannot be edited.' });
    expect(type.actions(broken, [])).toEqual([]);
  });
});

describe('Compact', () => {
  it.each(filesUnder('examples/gartner-hypecycle-graph', '.ghg'))('packs %s along its rows without overlap, in start order, with causes left of effects', (path) => {
    const example = sourceOf(read(path), path);
    const trueTime = type.view(example, {});
    const compact = type.view(example, viewing({ viewpoint: 'compact' }));
    expect(compact.chrome).toMatchObject({ toggles: [{ viewpoint: 'compact', on: true }], rulers: [] });
    expect(compact.nodes.map((candidate) => candidate.id)).toEqual(trueTime.nodes.map((candidate) => candidate.id));

    const trueBox = new Map(trueTime.nodes.map((candidate) => [candidate.id, candidate.box]));
    const byId = new Map(compact.nodes.map((candidate) => [candidate.id, candidate.box]));
    for (const candidate of compact.nodes) {
      // Every element keeps its row; only a trend takes the compact width, a share per phase.
      expect(candidate.box.y).toBe(trueBox.get(candidate.id)!.y);
      if (candidate.type === 'Trend') expect(candidate.box.width).toBe(24 * (candidate.params.count as number));
      expect(candidate.movable).toEqual({ x: false, y: false });
    }
    const sameRow = (a: SceneNode, b: SceneNode): boolean => a.box.y < b.box.y + b.box.height && b.box.y < a.box.y + a.box.height;
    for (const a of compact.nodes) {
      for (const b of compact.nodes) {
        if (a.id < b.id && sameRow(a, b)) {
          expect(a.box.x + a.box.width <= b.box.x || b.box.x + b.box.width <= a.box.x, `${a.id} and ${b.id} overlap`).toBe(true);
        }
      }
    }
    for (const edge of compact.edges) {
      const from = byId.get(edge.source)!;
      const to = byId.get(edge.target)!;
      // A target that starts after its source is placed at the middle of it or after it (`targetAfter: "sourceMiddle"`).
      // The hand-coded diagram put it a gap and the width of its label further.
      if (trueBox.get(edge.target)!.x > trueBox.get(edge.source)!.x) expect(to.x, `${edge.source} to ${edge.target}`).toBeGreaterThanOrEqual(from.x + from.width / 2);
    }
  });
});

describe('ADP Properties', () => {
  it('shows a trend its identity, time, phases and each phase\'s influences', () => {
    const fields = type.fields(base, ['transistors']);
    expect(fields.map((field) => `${field.group}/${field.label}`)).toEqual([
      'Identity/Name', 'Identity/Description', 'Identity/Tags', 'Time/Start', 'Time/Stop', 'Phases/Phases',
      'Phases/Peak ends', 'Phases/Trough ends', 'Phases/Slope ends',
      'Peak/Influence', 'Peak/Influenced by', 'Trough/Influence', 'Trough/Influenced by', 'Slope/Influence', 'Slope/Influenced by', 'Plateau/Influence', 'Plateau/Influenced by',
    ]);
    const byId = new Map(fields.map((field) => [field.id, field]));
    expect(byId.get('ghg.phases')).toMatchObject({ control: 'slider', value: 'All four', options: ['Peak', 'Peak and Trough', 'Peak, Trough and Slope', 'All four'] });
    expect(byId.get('ghg.tags')).toMatchObject({ control: 'tags', value: '', options: ['electronics', 'invention'] });
    // A boundary that is not stored is shown where it is drawn.
    expect(byId.get('ghg.peak-end')?.value).toBe('1960-01');
    expect(byId.get('ghg.peak-influenced-by')).toMatchObject({ value: 'Transistor invented', readOnly: 'Draw, reattach or delete an influence on the canvas.' });
    expect(byId.get('ghg.slope-influences')?.value).toBe('Transistor radio · Peak');
    expect(byId.get('ghg.plateau-influences')?.value).toBe('None');
  });

  it('edits through the same edits the canvas makes, and refuses with a sentence at the field', () => {
    expect(after(base, { kind: 'setField', id: 'transistors', field: 'ghg.phases', value: 'Peak and Trough' }).text).toContain('    phases: 2\n');
    expect(edit(base, { kind: 'setField', id: 'transistors', field: 'ghg.phases', value: 'Summit' }))
      .toEqual({ kind: 'refused', sentence: "'Summit' is not one of Peak, Peak and Trough, Peak, Trough and Slope, All four." });
    expect(edit(base, { kind: 'setField', id: 'i-13', field: 'ghg.to-attachment', value: 'nowhere' }))
      .toEqual({ kind: 'refused', sentence: "'nowhere' is not an attachment; write it as phase/edge/at, such as plateau/bottom/0.3." });
    // A row the selection does not have: the host's own sentence, where the hand-coded diagram named the row.
    expect(edit(base, { kind: 'setField', id: 'note-1', field: 'ghg.start', value: '1950-01' })).toEqual({ kind: 'refused', sentence: 'This value cannot be changed here.' });
  });
});

describe('actions and gestures', () => {
  it('offers each kind of element what the definition gives it', () => {
    const labels = (id?: string): string[] => type.actions(base, id ? [id] : []).map((action) => `${action.label}${action.shortcut ? ` (${action.shortcut})` : ''}`);
    expect(labels('transistors')).toEqual(['Rename… (F2)', 'Remove (Delete)', 'Arrange diagram']);
    expect(labels('note-1')).toEqual(['Edit text… (F2)', 'Remove (Delete)', 'Arrange diagram']);
    expect(labels('i-12')).toEqual(['Remove influence (Delete)', 'Arrange diagram']);
    // docs/disl-support.md, "The empty canvas": the definition offers the three additions before "Arrange diagram".
    expect(labels()).toEqual(['Add trend here', 'Add trigger here', 'Add note here', 'Arrange diagram']);
    expect(type.actions(base, ['transistors']).map((action) => action.id)).toEqual(['ghg.rename', 'ghg.remove', 'ghg.arrange']);
    expect(type.actions(base, ['i-12']).map((action) => action.id)).toEqual(['ghg.disconnect', 'ghg.arrange']);
    const dragged = after(base, { kind: 'handle', id: 'transistors', handle: 0, x: 240 });
    expect(dragged.text).toContain('    peak-end: 1960-01\n');
    expect(type.actions(base, ['transistors']).map((action) => action.label)).not.toContain('Even phases');
    expect(type.actions(dragged, ['transistors']).map((action) => action.label)).toContain('Even phases');
  });

  it('asks before removing something with influences, and removes at once when confirmed or when there are none', () => {
    const request = { kind: 'action', action: 'ghg.remove', id: 'transistor-invented' } as const;
    expect(edit(base, request)).toEqual({
      kind: 'confirm', title: 'Remove', message: 'Removing this trigger also removes the 1 influence to or from it.', confirmLabel: 'Remove', danger: true,
    });
    expect(after(base, request, {}, true).text).not.toContain('transistor-invented');
    expect(edit(base, { kind: 'action', action: 'ghg.remove', id: 'note-2' }).kind).toBe('applied');
  });

  it('renames in place: one line for a trend or trigger, several for a note', () => {
    expect(edit(base, { kind: 'action', action: 'ghg.rename', id: 'radio' })).toEqual({ kind: 'editInPlace', id: 'radio', multiline: false });
    expect(edit(base, { kind: 'action', action: 'ghg.rename', id: 'note-1' })).toEqual({ kind: 'editInPlace', id: 'note-1', multiline: true });
  });

  it('opens a dropped note\'s editor at once, and selects it', () => {
    const request = { kind: 'drop', entry: 'ghg.add.note', x: 200, y: 400 } as const;
    const note = applied(edit(base, request));
    expect(note).toMatchObject({ editLabel: true, multiline: true });
    expect(linesChanged(base.text, spliced(base.text, note.splices)).added[0]).toBe(`  - id: ${note.select}`);
    // docs/disl-support.md, "After a trend or a trigger is dropped" and "After an influence is drawn": nothing is selected.
    expect(applied(edit(base, { kind: 'drop', entry: 'ghg.add.trend', x: 200, y: 400 })).select).toBeUndefined();
    const drawn = { kind: 'connect', from: 'radio', to: 'transistors', fromEnd: 'peak/top/0.25', toEnd: 'plateau/bottom/0.75' } as const;
    expect(after(base, drawn).text).toContain('    from-phase: peak\n    from-edge: top\n    from-at: 0.25\n    to: transistors\n    to-phase: plateau\n    to-edge: bottom\n    to-at: 0.75\n');
    expect(applied(edit(base, drawn)).select).toBeUndefined();
  });
});

// A trend of forty months in a diagram of months: 160 wide at the origin, so its numbers are the banner's own.
describe('the banner a trend is drawn as', () => {
  const banner = oneTrend('1900-01', '1903-05', 4);
  const trend = nodeOf(banner, 'a');

  it('ends its body 16 short of the right and its point at the full width', () => {
    expect(trend.box).toEqual({ x: 0, y: 0, width: 160, height: 32 });
    expect(trend.outline).toEqual({ kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 160, y: 16 }, { x: 144, y: 32 }, { x: 0, y: 32 }] });
    // A boundary is where its chevron points to, and where its handle is.
    expect(trend.handles.map((handle) => [handle.x, handle.y, handle.visible])).toEqual([[40, 16, true], [80, 16, true], [120, 16, true]]);
    const chevron = trend.parts.find((part) => part.id === 'chevron1')!.shape;
    expect(chevron.kind === 'path' && chevron.commands).toEqual([{ op: 'M', x: 24, y: 0 }, { op: 'L', x: 40, y: 16 }, { op: 'L', x: 24, y: 32 }]);
    // The stretch of the edge each phase has, which an end of an influence is anchored on.
    expect(trend.parts.filter((part) => part.anchor === true).map((part) => [part.id, part.box.x, part.box.x + part.box.width])).toEqual([['peak', 0, 24], ['trough', 24, 64], ['slope', 64, 104], ['plateau', 104, 144]]);
  });

  it('places an attachment along its phase\'s stretch of the edge', () => {
    const two = graph(
      'trends:', '  - id: a', '    name: A', '    start: 1900-01', '    stop: 1903-05', '    row: 0', '    phases: 4', '  - id: b', '    name: B', '    start: 1900-01', '    stop: 1903-05', '    row: 2', '    phases: 4',
      'influences:', '  - id: ba', '    from: b', '    from-phase: plateau', '    from-edge: top', '    from-at: 1', '    to: a', '    to-phase: trough', '    to-edge: bottom', '    to-at: 0.5',
    );
    const [edge] = type.view(two, {}).edges;
    expect(edge.to).toMatchObject({ node: 'a', part: 'trough', side: 'bottom', at: 0.5, x: 44, y: 32 });
    expect(edge.from).toMatchObject({ node: 'b', part: 'plateau', side: 'top', at: 1, x: 144, y: 112 });
  });

  it('lands a dragged boundary on a step, at least one step from its neighbours', () => {
    const landed = (x: number): string | undefined => written(change(banner, { kind: 'handle', id: 'a', handle: 0, x }).added, 'peak-end');
    // A step is a month, four units wide: 21.9 lands on 20, and a drag past a neighbour stops a step short of it, at 4 and at 76.
    expect(landed(21.9)).toBe('1900-06');
    expect(landed(-50)).toBe('1900-02');
    expect(landed(500)).toBe('1901-08');
  });
});
