import { describe, expect, it } from 'vitest';
import { encode } from '../../../src/core/fbl/text/utf8';
import { viewTypeOf, type Action, type EditOutcome, type EditRequest, type Field, type Source } from '../../../src/core/frame/toolType';
import { readDefinitionFolder } from '../../../src/core/tool/definitionFolder';
import { pluginRegistry } from '../../../src/core/tool/pluginRegistry';
import { toolTypesFrom } from '../../../src/core/tool/toolTypeFrom';
import {
  allFolders, altered, applied, array, at, bindingsOf, definitionOf, diagramOf, example, exampleNames, fileText, fixture, folderFiles, hypeCycleFolder, linesChanged,
  noPlugins, object, placeDifferences, refusal, sourceOf, specificationOf, spliced, viewing, withFile, type Json,
} from './support';

// A tool type made from its definition (etalii.adp spec 027, contracts/tool-type.md, "Obligations
// on a tool type"). The definition is the hype cycle graph's, read from definitions/ as the
// extension reads it; what a test expects of it is read from the same files, so a sentence, a label
// or an id is the definition's and is typed here only where it is the bytes of a document.

const folder = definitionOf(hypeCycleFolder);
const type = diagramOf(folder);
const specification = specificationOf(hypeCycleFolder);
const definitionText = fileText(hypeCycleFolder, 'dis');
const binding = at(bindingsOf(hypeCycleFolder), 'bindings', 'ghg');

const base = fixture('triggers-and-notes');
// What the canvas shows while a request is made; an operation that needs a point is given its centre.
const inView = { viewport: { x: 0, y: 0, width: 500, height: 600 } };

const edit = (source: Source, request: EditRequest, confirmed = false): EditOutcome => type.edit(source, request, inView, confirmed);
/** The source after a request that is applied. */
const after = (source: Source, request: EditRequest, confirmed = false): Source => ({ ...source, text: spliced(source.text, applied(edit(source, request, confirmed)).splices) });
/** The lines a request takes out and puts in. */
const change = (source: Source, request: EditRequest) => linesChanged(source.text, after(source, request).text);
const nodeOf = (source: Source, id: string) => type.view(source, {}).nodes.find((node) => node.id === id)!;
/** A new id as the definition's persistence makes it: 25 characters of base 36. */
const minted = /^ {2}- id: [0-9a-z]{25}$/;

/** Whether a sentence is a text of the definition: a message as it is written, or a text one of its expressions holds. */
const stated = (sentence: string): boolean => definitionText.includes(JSON.stringify(sentence)) || definitionText.includes(`'${sentence}'`);

describe('the tool type of a definition', () => {
  it('carries the origin, the kind and the one display name the definition gives', () => {
    expect(type.origin).toBe(at(specification, 'language', 'origin'));
    expect(type.displayName).toBe(at(specification, 'language', 'label'));
    expect(type.kind).toBe('diagram');
    expect(viewTypeOf(type)).toBe('etalii.adp.gartner.hypecycle-graph');
  });

  it('claims what its binding claims', () => {
    expect(type.claims).toEqual([{ extensions: ['ghg'], shared: false, marker: false, registrationOnly: false }]);
    expect(type.claimed('C:\\work\\trends.ghg', '')).toBe(true);
    expect(type.claimed('/work/trends.md', base.text)).toBe(false);
    expect(type.suggests('/work/trends.ghg', base.text)).toBe(false);
  });

  it('starts a new document from the binding\'s template, which reads cleanly and takes a first element', () => {
    const created = type.newDocument('anything');
    expect(created).toBe(at(binding, 'template', 'text'));
    const source = sourceOf(created);
    expect(type.findings(source)).toEqual([]);
    expect(type.view(source, {})).toMatchObject({ nodes: [], edges: [], readOnly: false });
    const tool = type.toolbox(source)[0];
    const withOne = after(source, { kind: 'drop', entry: tool.id, x: 0, y: 16 });
    expect(withOne.text).toContain('trends:\r\n  - id: ');
    expect(type.view(withOne, {}).nodes).toHaveLength(1);
  });
});

describe('each example', () => {
  it('is one of nine', () => expect(exampleNames()).toHaveLength(9));

  describe.each(exampleNames())('%s', (name) => {
    const source = example(name);
    const scene = type.view(source, {});

    it('opens to a scene with the places recorded for it', () => {
      expect(placeDifferences(name, scene)).toEqual({ nodes: [], parts: [], edges: [] });
      expect(scene.findings).toEqual([]);
    });

    it('opens editable, in the default viewpoint, without a notice', () => {
      expect(scene.readOnly).toBe(false);
      expect(scene.notice).toBeUndefined();
      expect(scene.viewpoint).toBe(Object.entries(object(specification.viewpoints)).find(([, viewpoint]) => at(viewpoint, 'default') === true)?.[0]);
    });

    it('is left untouched when nothing is edited: the same scene again, and a text that is entered as it stands is no splice', () => {
      const text = source.text;
      type.findings(source);
      type.toolbox(source);
      expect(type.view(source, {})).toEqual(scene);
      for (const node of scene.nodes.slice(0, 3)) {
        expect(type.fields(source, [node.id]).length).toBeGreaterThan(0);
        expect(edit(source, { kind: 'rename', id: node.id, text: node.labels[0].editText })).toEqual({ kind: 'applied', splices: [] });
      }
      expect(source.text).toBe(text);
    });
  });
});

describe('an edit is splices, and nothing outside them changes', () => {
  it('replaces the bytes of one value for one value', () => {
    const outcome = applied(edit(base, { kind: 'rename', id: 'transistors', text: 'Solid state' }));
    const offset = encode(base.text.slice(0, base.text.indexOf('Transistors'))).length;
    expect(outcome.splices).toEqual([{ offset, length: 'Transistors'.length, text: 'Solid state' }]);
    expect(spliced(base.text, outcome.splices)).toBe(base.text.replace('name: Transistors', 'name: Solid state'));
  });

  it('gives every splice of one gesture in one outcome, in the order of the body and not overlapping', () => {
    const moved = applied(edit(base, { kind: 'move', id: 'transistors', x: 220, y: 112 }));
    expect(moved.splices.map((splice) => splice.text)).toEqual(['1955-01', '1995-01', '2']);
    // `spliced` refuses splices that are out of order, overlap or leave the text.
    expect(linesChanged(base.text, spliced(base.text, moved.splices))).toEqual({
      removed: ['    start: 1950-01', '    stop: 1990-01', '    row: 1'], added: ['    start: 1955-01', '    stop: 1995-01', '    row: 2'],
    });
  });

  it('gives the changes of several elements in one outcome too', () => {
    const arranged = after(base, { kind: 'action', action: 'arrange' });
    const before = base.text.split('\n');
    const lines = arranged.text.split('\n');
    expect(lines).toHaveLength(before.length);
    const differing = lines.filter((line, index) => line !== before[index]);
    expect(differing.length).toBeGreaterThan(1);
    expect(differing.filter((line) => !/^ {4}row: -?\d+$/.test(line))).toEqual([]);
  });

  it('writes with the line ending the document has', () => {
    const crlf = fixture('rules-clean');
    expect(crlf.text).toContain('\r\n');
    const added = after(crlf, { kind: 'drop', entry: 'trend', x: 0, y: 0 });
    expect(added.text.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    expect(after(base, { kind: 'drop', entry: 'trend', x: 0, y: 0 }).text).not.toContain('\r');
  });

  it('keeps a document without a final newline without one', () => {
    const open = fixture('no-trailing-newline');
    expect(open.text.endsWith('\n')).toBe(false);
    const node = type.view(open, {}).nodes[0];
    const renamed = after(open, { kind: 'rename', id: node.id, text: 'Renamed' });
    expect(renamed.text.endsWith('\n')).toBe(false);
    expect(linesChanged(open.text, renamed.text).added).toHaveLength(1);
  });
});

// The bytes test/core/gartner-hypecycle-graph/ states for the hand-coded type, through the tool
// type made from the definition.
describe('the bytes of an edit are those the hand-coded diagram writes', () => {
  it('adds from the toolbox after the last of its kind: in the step and the row of the drop', () => {
    const added = change(base, { kind: 'drop', entry: 'trend', x: 241, y: 56 * 4 + 16 });
    expect(added.removed).toEqual([]);
    expect(added.added[0]).toMatch(minted);
    expect(added.added.slice(1)).toEqual(['    name: New trend', '    start: 1960-01', '    stop: 1972-01', '    row: 4', '    phases: 4']);
    const again = change(after(base, { kind: 'drop', entry: 'trend', x: 241, y: 56 * 4 + 16 }), { kind: 'drop', entry: 'trend', x: 241, y: 0 });
    expect(again.added[1]).toBe('    name: New trend 2');

    expect(change(base, { kind: 'drop', entry: 'trigger', x: 280, y: 16 }).added.slice(1)).toEqual(['    name: Trigger', '    date: 1970-01', '    row: 0']);
    expect(change(base, { kind: 'drop', entry: 'note', x: 280, y: 60 }).added.slice(1)).toEqual(['    text: ""', '    at: 1970-01', '    row: 1', '    width: 160', '    height: 64']);
  });

  it('opens a list the document does not have yet where the binding says', () => {
    const clean = fixture('rules-clean');
    const added = after(clean, { kind: 'drop', entry: 'trigger', x: 0, y: 0 });
    expect(linesChanged(clean.text, added.text).added[0]).toBe('triggers:');
    const keys = added.text.split('\r\n').filter((line) => /^[a-z]/.test(line));
    expect(keys.indexOf('triggers:')).toBeLessThan(keys.indexOf('influences:'));
    expect(type.findings(added)).toEqual([]);
  });

  it('renames by rewriting the one line, quoted only where YAML needs it', () => {
    expect(change(base, { kind: 'rename', id: 'transistors', text: 'Solid state' })).toEqual({ removed: ['    name: Transistors'], added: ['    name: Solid state'] });
    expect(change(base, { kind: 'rename', id: 'radio', text: 'Radio: the pocket kind' }).added).toEqual(['    name: "Radio: the pocket kind"']);
    expect(change(base, { kind: 'rename', id: 'note-2', text: '' }).added).toEqual(['    text: ""']);
  });

  it('writes a text of several lines as a literal block, and one line as a scalar again', () => {
    expect(change(base, { kind: 'rename', id: 'note-2', text: 'First\n\nSecond' })).toEqual({ removed: ['    text: A one-line remark'], added: ['    text: |-', '      First', '', '      Second'] });
    expect(change(base, { kind: 'rename', id: 'note-1', text: 'Short' })).toEqual({ removed: ['    text: |-', '      Dates are illustrative.', '', '      See the readme.'], added: ['    text: Short'] });
  });

  it('moves by rewriting what places the element, and what follows from it', () => {
    // A trigger is placed by its centre and a note by its top-left; the request names the top-left of both.
    expect(change(base, { kind: 'move', id: 'transistor-invented', x: 200 - 8, y: 56 * 2 + 8 }).added).toEqual(['    date: 1950-01', '    row: 2']);
    expect(change(base, { kind: 'move', id: 'note-2', x: 200, y: 56 }).added).toEqual(['    at: 1950-01', '    row: 1']);
    // A stored boundary moves with its trend.
    const dragged = after(base, { kind: 'handle', id: 'transistors', handle: 0, x: 240 });
    expect(linesChanged(base.text, dragged.text)).toEqual({ removed: [], added: ['    peak-end: 1960-01'] });
    expect(change(dragged, { kind: 'move', id: 'transistors', x: 220, y: 56 * 2 }).added).toEqual(['    start: 1955-01', '    stop: 1995-01', '    row: 2', '    phases: 4', '    peak-end: 1965-01']);
  });

  it('resizes to the date of the edge that moved, or to the size', () => {
    expect(after(base, { kind: 'resize', id: 'radio', side: 'right', bounds: { x: 216, y: 112, width: 100, height: 32 } }).text).toContain('    stop: 1979-01\n');
    const note = after(base, { kind: 'resize', id: 'note-2', side: 'corner', bounds: { x: 240, y: 280, width: 130.5, height: 44 } });
    expect(note.text).toContain('    at: 1960-01\n    row: 5\n    width: 130.5\n    height: 44\n');
  });

  it('removes an element with what goes with it, after asking with the definition\'s words', () => {
    const request = { kind: 'action', action: 'delete', id: 'transistor-invented' } as const;
    const asked = at(specification, 'behavior', 'deletion', 'Trigger', 'confirm');
    expect(edit(base, request)).toEqual({
      kind: 'confirm', title: at(asked, 'title'), message: 'Removing this trigger also removes the 1 influence to or from it.', confirmLabel: at(asked, 'confirmLabel'), danger: at(asked, 'danger'),
    });
    expect(String(at(asked, 'message', 'cel'))).toContain('\'Removing this trigger also removes the \'');
    const removed = after(base, request, true);
    expect(removed.text).not.toContain('transistor-invented');
    expect(type.view(removed, {}).edges.map((edge) => edge.id)).toEqual(['i-13']);
    expect(type.findings(removed)).toEqual([]);
  });

  it('removes at once what nothing goes with', () => {
    expect(change(base, { kind: 'action', action: 'delete', id: 'note-2' })).toEqual({
      removed: ['  - id: note-2', '    text: A one-line remark', '    at: 1960-01', '    row: 5', '    width: 120', '    height: 40'], added: [],
    });
    expect(change(base, { kind: 'action', action: 'delete', id: 'i-12' }).removed[0]).toBe('  - id: i-12');
  });

  it('sets a field of ADP Properties as the one line it is, and removes the key of one that is emptied', () => {
    expect(after(base, { kind: 'setField', id: 'transistors', field: 'phases', value: 'Peak and Trough' }).text).toContain('    phases: 2\n');
    expect(change(base, { kind: 'setField', id: 'transistors', field: 'tags', value: ' semiconductors, a,b , semiconductors ' }).added).toEqual(['    tags: [semiconductors, a, b]']);
    expect(change(base, { kind: 'setField', id: 'transistor-invented', field: 'tags', value: '' })).toEqual({ removed: ['    tags: [electronics, invention]'], added: [] });
    expect(change(base, { kind: 'setField', id: 'i-13', field: 'description', value: 'Cheap, small receivers' }).added).toEqual(['    description: Cheap, small receivers']);
  });

  it('draws a relation with the ends it is given, or with the notation\'s defaults', () => {
    const drawn = after(base, { kind: 'connect', from: 'radio', to: 'transistors', fromEnd: 'peak/top/0.25', toEnd: 'plateau/bottom/0.75' });
    expect(drawn.text).toContain('    from-phase: peak\n    from-edge: top\n    from-at: 0.25\n    to: transistors\n    to-phase: plateau\n    to-edge: bottom\n    to-at: 0.75\n');
    expect(change(base, { kind: 'connect', from: 'radio', to: 'transistors' }).added.slice(1)).toEqual([
      '    from: radio', '    from-phase: slope', '    from-edge: bottom', '    from-at: 0.5', '    to: transistors', '    to-phase: peak', '    to-edge: top', '    to-at: 0.5',
    ]);
    expect(change(base, { kind: 'connect', from: 'transistor-invented', to: 'radio' }).added.slice(1)).toEqual(['    from: transistor-invented', '    to: radio', '    to-phase: peak', '    to-edge: top', '    to-at: 0.5']);
    expect(change(base, { kind: 'moveEnd', id: 'i-13', end: 'to', value: 'trough/bottom/0.333' }).added).toEqual(['    to-phase: trough', '    to-edge: bottom', '    to-at: 0.33']);
  });
});

// The graph every offer is made on: triggers and notes beside two trends, one with a boundary that
// was dragged, so that what is offered only for a stored boundary is offered too.
const prepared = after(base, { kind: 'handle', id: 'transistors', handle: 0, x: 240 });
// One element of each type, the first in the document, and none for the diagram itself.
const targets: Readonly<Record<string, string | undefined>> = { diagram: undefined, Trend: 'transistors', Trigger: 'transistor-invented', Note: 'note-1', Influence: 'i-12' };

describe('what is offered is what the definition offers', () => {
  it('in the toolbox: every tool of its groups, with the definition\'s label, icon and description', () => {
    const tools = array(at(specification, 'toolbox', 'groups')).flatMap((group) => array(at(group, 'tools')));
    expect(tools).toHaveLength(3);
    expect(type.toolbox(prepared)).toEqual(tools.map((tool) => ({ id: at(tool, 'id'), label: at(tool, 'label'), icon: at(tool, 'icon'), description: at(tool, 'doc') })));
  });

  it.each(Object.keys(targets))('as actions on %s: the entries of its context menu, in their order', (target) => {
    const menu = array(at(specification, 'toolbox', 'contextMenus')).find((set) => array(at(set, 'for')).includes(target));
    const declared = array(at(menu, 'tools')).map((entry) => ({ id: at(entry, 'operation') ?? at(entry, 'kind'), label: at(entry, 'label'), icon: at(entry, 'icon'), shortcut: at(entry, 'shortcut') }));
    expect(declared.length).toBeGreaterThan(1);
    const offered = type.actions(prepared, targets[target] === undefined ? [] : [targets[target]]);
    expect(offered.map(({ id, label, icon, shortcut }) => ({ id, label, icon, shortcut }))).toEqual(declared);
    expect(offered.filter((action) => !action.enabled)).toEqual([]);
  });

  it('leaves out an entry the definition shows only on a condition, until the condition holds', () => {
    const ids = (source: Source): string[] => type.actions(source, ['transistors']).map((action) => action.id);
    expect(ids(base)).not.toContain('evenPhases');
    expect(ids(prepared)).toContain('evenPhases');
  });

  it('as fields: the rows of the definition\'s form, each in the section it is in, with what it shows', () => {
    const fields = type.fields(prepared, ['transistors']);
    expect(fields.map((field) => `${field.group}/${field.label}`)).toEqual([
      'Identity/Name', 'Identity/Description', 'Identity/Tags', 'Time/Start', 'Time/Stop', 'Phases/Phases', 'Phases/Peak ends', 'Phases/Trough ends', 'Phases/Slope ends',
      'Peak/Influence', 'Peak/Influenced by', 'Trough/Influence', 'Trough/Influenced by', 'Slope/Influence', 'Slope/Influenced by', 'Plateau/Influence', 'Plateau/Influenced by',
    ]);
    const byId = new Map(fields.map((field) => [field.id, field]));
    const marks = array(at(specification, 'forms', 'trend', 'items')).flatMap((section) => array(at(section, 'items'))).find((item) => at(item, 'attribute') === 'phases');
    expect(byId.get('name')).toEqual({ id: 'name', label: 'Name', group: 'Identity', control: 'text', value: 'Transistors' });
    expect(byId.get('description')).toMatchObject({ control: 'multiline', value: '' });
    expect(byId.get('tags')).toMatchObject({ control: 'tags', value: '', options: ['electronics', 'invention'] });
    expect(byId.get('phases')).toMatchObject({ control: 'slider', value: 'All four', options: array(at(marks, 'widgetOptions', 'marks')).map((mark) => at(mark, 'label')) });
    expect(byId.get('peakEnd')?.value).toBe('1960-01');
    // A computed row is shown and not edited, with the definition's reason.
    const reason = String(array(at(array(at(specification, 'forms', 'trend', 'items')).flatMap((section) => array(at(section, 'items'))).find((item) => at(item, 'id') === 'peakInfluencedBy'), 'readOnlyReasons'))[0]);
    expect(byId.get('peakInfluencedBy')).toMatchObject({ control: 'multiline', value: 'Transistor invented', readOnly: reason });
    expect(byId.get('slopeInfluences')?.value).toBe('Transistor radio · Peak');
  });

  it('as fields of one selected element only', () => {
    expect(type.fields(prepared, ['transistor-invented']).map((field) => field.label)).toEqual(['Name', 'Description', 'Tags', 'Date']);
    expect(type.fields(prepared, ['note-1']).map((field) => [field.label, field.value])).toEqual([['Text', 'Dates are illustrative.\n\nSee the readme.'], ['Size', '160 x 64']]);
    expect(type.fields(prepared, ['i-13']).map((field) => [field.label, field.value])).toEqual([
      ['Description', ''], ['From', 'Transistors · Slope'], ['To', 'Transistor radio · Peak'], ['From attachment', 'slope/bottom/0.5'], ['To attachment', 'peak/top/0.1'],
    ]);
    expect(type.fields(prepared, [])).toEqual([]);
    expect(type.fields(prepared, ['transistors', 'radio'])).toEqual([]);
    expect(type.fields(prepared, ['nobody'])).toEqual([]);
  });
});

// The value each row of ADP Properties is given, by the type of its element. A row that is added to a form needs one here.
const entered: Readonly<Record<string, string>> = {
  'Trend/name': 'Valves', 'Trend/description': 'Before the transistor.', 'Trend/tags': 'a, b', 'Trend/start': '1951-01', 'Trend/stop': '1991-01',
  'Trend/phases': 'Peak and Trough', 'Trend/peakEnd': '1961-01', 'Trend/troughEnd': '1971-01', 'Trend/slopeEnd': '1981-01',
  'Trigger/name': 'Point contact', 'Trigger/description': 'At Bell Labs.', 'Trigger/tags': 'physics', 'Trigger/date': '1948-01',
  'Note/text': 'Changed', 'Note/Size': '200 x 80',
  'Influence/description': 'Cheap receivers.', 'Influence/From attachment': 'plateau/bottom/0.3', 'Influence/To attachment': 'trough/top/0.25',
};

describe('every offer can be made', () => {
  /** A request as an edit of the prepared graph: the splices change it, and break no rule that held. */
  const made = (request: EditRequest, confirmed = false): void => {
    const outcome = applied(edit(prepared, request, confirmed));
    expect(outcome.splices.length).toBeGreaterThan(0);
    const text = spliced(prepared.text, outcome.splices);
    expect(text).not.toBe(prepared.text);
    expect(type.findings({ ...prepared, text })).toEqual([]);
  };

  it('starts from a graph without a finding', () => expect(type.findings(prepared)).toEqual([]));

  it.each(type.toolbox(prepared).map((tool) => tool.id))('the tool %s, dropped on the canvas', (entry) => made({ kind: 'drop', entry, x: 250, y: 300 }));

  it('and what follows a drop is the definition\'s to say: the text of a new note is edited at once', () => {
    const tools = array(at(specification, 'toolbox', 'groups')).flatMap((group) => array(at(group, 'tools')));
    for (const tool of tools) {
      const outcome = applied(edit(prepared, { kind: 'drop', entry: String(at(tool, 'id')), x: 250, y: 300 }));
      const editing = at(tool, 'after') === 'editLabel';
      expect(outcome.editLabel === true).toBe(editing);
      if (editing) {
        expect(outcome.multiline).toBe(true);
        expect(spliced(prepared.text, outcome.splices)).toContain(`  - id: ${outcome.select}\n`);
      }
    }
  });

  const offers = Object.entries(targets).flatMap(([target, id]) => type.actions(prepared, id === undefined ? [] : [id]).map((action: Action) => ({ target, id, action: action.id })));

  it.each(offers)('the action $action on $target', ({ id, action }) => {
    const request: EditRequest = { kind: 'action', action, ...(id === undefined ? {} : { id }) };
    const first = edit(prepared, request);
    if (first.kind === 'editInPlace') {
      // The text is then edited over the element's own label: several lines where the label takes them.
      expect(first).toEqual({ kind: 'editInPlace', id, multiline: nodeOf(prepared, id!).labels[0].editable === 'multiline' });
      return;
    }
    // What the definition asks about first is asked, and carried out once it is confirmed.
    if (first.kind === 'confirm') expect(first.message).not.toBe('');
    made(request, first.kind === 'confirm');
  });

  const rows = Object.entries(targets).flatMap(([target, id]) => (id === undefined ? [] : type.fields(prepared, [id]).filter((field: Field) => field.readOnly === undefined).map((field) => ({ target, id, field: field.id }))));

  it('are, in ADP Properties, 18 rows that can be edited', () => expect(rows.map((row) => `${row.target}/${row.field}`).sort()).toEqual(Object.keys(entered).sort()));

  it.each(rows)('the field $field of $target', ({ target, id, field }) => made({ kind: 'setField', id, field, value: entered[`${target}/${field}`] }));

  const scene = type.view(prepared, {});

  it.each(scene.nodes.filter((node) => node.movable.x || node.movable.y).map((node) => node.id))('moving %s', (id) => {
    const { box } = nodeOf(prepared, id);
    made({ kind: 'move', id, x: box.x + 8, y: box.y + 56 });
  });

  it.each(scene.nodes.filter((node) => node.resizable.x || node.resizable.y).map((node) => node.id))('resizing %s', (id) => {
    const { box } = nodeOf(prepared, id);
    made({ kind: 'resize', id, side: 'right', bounds: { ...box, width: box.width + 8 } });
  });

  // A handle is named by its place among the handles of its node, and dragged to an x of the canvas.
  const handles = scene.nodes.flatMap((node) => node.handles.map((handle, index) => ({ id: node.id, index, handle })).filter(({ handle }) => handle.visible));

  it.each(handles)('dragging the handle $index of $id', ({ id, index, handle }) => made({ kind: 'handle', id, handle: index, x: handle.x + 0.05 * nodeOf(prepared, id).box.width }));

  it('are five handles that are shown, and none that is not', () => {
    expect(handles).toHaveLength(5);
    const hidden = scene.nodes.flatMap((node) => node.handles.map((handle, index) => ({ id: node.id, index, handle })).filter(({ handle }) => !handle.visible));
    expect(hidden).toHaveLength(1);
    expect(edit(prepared, { kind: 'handle', id: hidden[0].id, handle: hidden[0].index, x: hidden[0].handle.x }).kind).toBe('refused');
  });

  // An end is moved where it is on a part of its element: to another part, another side and another place along it.
  const ends = scene.edges.flatMap((edge) => (['from', 'to'] as const).filter((end) => edge[end]?.part !== undefined).map((end) => ({ id: edge.id, end })));

  it.each(ends)('moving the $end end of $id', ({ id, end }) => made({ kind: 'moveEnd', id, end, value: 'trough/bottom/0.75' }));

  it('drawing a relation from one element to another', () => made({ kind: 'connect', from: 'radio', to: 'transistors' }));
});

describe('a refusal carries the definition\'s sentence, and nothing is written', () => {
  it('of an operation that is not available', () => {
    const even = at(specification, 'behavior', 'operations', 'evenPhases', 'unavailable');
    expect(edit(base, { kind: 'action', action: 'evenPhases', id: 'transistors' })).toEqual({ kind: 'refused', sentence: at(array(even)[0], 'message') });
  });

  it('of an operation that would change nothing', () => {
    const arranged = after(base, { kind: 'action', action: 'arrange' });
    const layout = at(array(at(specification, 'behavior', 'operations', 'arrange', 'actions'))[0], 'layout');
    expect(edit(arranged, { kind: 'action', action: 'arrange' })).toEqual({ kind: 'refused', sentence: at(layout, 'refusals', 'unchanged') });
  });

  it('of an action that is offered disabled, with the same sentence as its reason', () => {
    const empty = sourceOf(type.newDocument('empty'));
    const sentence = at(array(at(specification, 'behavior', 'operations', 'arrange', 'unavailable'))[0], 'message');
    expect(type.actions(empty, []).find((action) => action.id === 'arrange')).toMatchObject({ enabled: false, disabledReason: sentence });
    expect(edit(empty, { kind: 'action', action: 'arrange' })).toEqual({ kind: 'refused', sentence });
  });

  it.each([
    ['a relation to its own source', { kind: 'connect', from: 'radio', to: 'radio' }],
    ['a second relation between the same two', { kind: 'connect', from: 'transistors', to: 'radio' }],
    ['a relation to an element that takes none', { kind: 'connect', from: 'radio', to: 'transistor-invented' }],
    ['a relation from an element that gives none', { kind: 'connect', from: 'note-1', to: 'radio' }],
    ['a name that is emptied', { kind: 'rename', id: 'transistors', text: '  ' }],
    ['a name that is emptied in ADP Properties', { kind: 'setField', id: 'transistor-invented', field: 'name', value: '' }],
  ] as const)('of %s', (_name, request) => {
    const sentence = refusal(edit(base, request));
    expect(sentence).not.toBe('');
    expect(stated(sentence), sentence).toBe(true);
  });

  it('of a value a field does not take, worded by the field\'s own rule', () => {
    const phases = refusal(edit(base, { kind: 'setField', id: 'transistors', field: 'phases', value: 'Summit' }));
    expect(phases).toBe('\'Summit\' is not one of Peak, Peak and Trough, Peak, Trough and Slope, All four.');
    expect(definitionText).toContain(phases.slice(phases.indexOf(' is not one of')));
    const date = refusal(edit(base, { kind: 'setField', id: 'radio', field: 'stop', value: 'June' }));
    expect(date).toBe('\'June\' is not a date; write it as YYYY-MM, such as 2007-06.');
    expect(definitionText).toContain(date.slice(date.indexOf(' is not a date')));
  });

  it('of a request the view would not have offered', () => {
    // Each names something the document or the definition does not have, or a field that is only shown.
    const requests: EditRequest[] = [
      { kind: 'action', action: 'evenPhases', id: 'transistor-invented' },
      { kind: 'action', action: 'nothing' },
      { kind: 'action', action: 'delete', id: 'nobody' },
      { kind: 'drop', entry: 'nothing', x: 0, y: 0 },
      { kind: 'rename', id: 'nobody', text: 'Somebody' },
      { kind: 'move', id: 'nobody', x: 0, y: 0 },
      { kind: 'setField', id: 'transistors', field: 'date', value: '1950-01' },
      { kind: 'setField', id: 'transistors', field: 'peakInfluencedBy', value: 'Radio' },
      { kind: 'moveEnd', id: 'i-12', end: 'from', value: 'peak/top/0.5' },
      { kind: 'moveEnd', id: 'i-13', end: 'to', value: 'nowhere' },
      { kind: 'handle', id: 'transistors', handle: 7, x: 240 },
    ];
    for (const request of requests) expect(refusal(edit(base, request)), JSON.stringify(request)).not.toBe('');
  });

  it('of a field that is only shown, with the reason the field gives', () => {
    const field = type.fields(base, ['transistors']).find((candidate) => candidate.id === 'peakInfluencedBy')!;
    expect(refusal(edit(base, { kind: 'setField', id: 'transistors', field: field.id, value: 'Radio' }))).toBe(field.readOnly);
  });
});

describe('an unreadable body', () => {
  const broken = fixture('not-yaml');
  const sentence = at(specification, 'behavior', 'messages', 'std.readOnly');

  it('opens empty and read-only, with the reader\'s finding as its notice', () => {
    const found = type.findings(broken);
    expect(found).toHaveLength(1);
    // The code and the severity the definition gives the reader's finding, on the line the reader names.
    expect(found[0]).toMatchObject({ rule: at(specification, 'constraints', 'builtIn', 'std.unparseable', 'code'), severity: at(specification, 'constraints', 'builtIn', 'std.unparseable', 'severity'), line: 3 });
    expect(found[0].message).toMatch(/^The document could not be read as YAML: ./);
    const scene = type.view(broken, {});
    expect(scene).toMatchObject({ nodes: [], edges: [], readOnly: true, notice: found[0].message });
  });

  it('offers nothing that edits', () => {
    expect(type.toolbox(broken)).toEqual([]);
    expect(type.actions(broken, [])).toEqual([]);
    expect(type.fields(broken, ['broken'])).toEqual([]);
  });

  it('refuses every request with the definition\'s sentence for it', () => {
    expect(sentence).toBe('The graph could not be read, so it cannot be edited.');
    const requests: EditRequest[] = [
      { kind: 'drop', entry: 'trend', x: 0, y: 0 }, { kind: 'rename', id: 'broken', text: 'Mended' }, { kind: 'action', action: 'arrange' },
      { kind: 'setField', id: 'broken', field: 'name', value: 'Mended' }, { kind: 'action', action: 'delete', id: 'broken' },
    ];
    for (const request of requests) expect(type.edit(broken, request, {}, true)).toEqual({ kind: 'refused', sentence });
  });

  it('is editable again once its text is', () => {
    const mended = sourceOf(broken.text.replace('   bad-indent: [unclosed', '    name: Mended'));
    expect(type.view(mended, {})).toMatchObject({ readOnly: false });
    expect(type.view(mended, {}).notice).toBeUndefined();
  });
});

describe('the findings of a document', () => {
  it('are none for a document that breaks no rule', () => {
    expect(type.findings(fixture('rules-clean'))).toEqual([]);
    expect(type.findings(base)).toEqual([]);
  });

  it('are those of the definition\'s rules, each with the definition\'s code and severity, on the zero-based line of its cause', () => {
    const rule = array(at(specification, 'constraints', 'rules')).find((candidate) => at(candidate, 'id') === 'stopAfterStart');
    const found = type.findings(fixture('rule-stop-before-start'));
    expect(found).toEqual([{ rule: at(rule, 'code'), severity: at(specification, 'constraints', 'defaults', 'severity'), message: '`a` stops at 1900-01, not after it starts at 1920-01; a trend is at least a month long.', line: 2 }]);
  });

  it('are those of the reader, as the definition words them', () => {
    const found = type.findings(fixture('rule-duplicate-id'));
    expect(found.map((finding) => finding.rule)).toEqual([at(specification, 'constraints', 'builtIn', 'std.duplicateId', 'code')]);
    expect(found[0].line).toBeGreaterThan(0);
  });

  it('have one of the frame\'s four severities each', () => {
    const fixtures = ['rule-bad-attachment', 'rule-boundary-order', 'rule-dangling-reference', 'rule-duplicate-influence', 'rule-phase-count', 'malformed-entries'];
    const found = fixtures.flatMap((name) => type.findings(fixture(name)));
    expect(found.length).toBeGreaterThanOrEqual(fixtures.length);
    expect(found.filter((finding) => !['error', 'warning', 'information', 'hint'].includes(finding.severity))).toEqual([]);
    expect(found.filter((finding) => !Number.isInteger(finding.line) || finding.line < 0 || finding.message === '')).toEqual([]);
  });
});

describe('a construct the interpreter does not support', () => {
  const requiring = (requires: Json) => diagramOf({ ...folder, definition: altered(folder.definition, (read) => ({ ...read, language: { ...object(read.language), requires: { ...object(at(read, 'language', 'requires')), ...requires } } })) });

  it('is no finding of the definition as it is copied', () => {
    expect(array(at(specification, 'language', 'requires', 'features')).length).toBeGreaterThan(0);
    expect(type.findings(base).filter((finding) => finding.rule.startsWith('disl.'))).toEqual([]);
  });

  it('gives `disl.unsupported-feature` for a feature the definition requires, and the document still opens', () => {
    const features = [...array(at(specification, 'language', 'requires', 'features')), 'layout.tidyTree'];
    const asking = requiring({ features });
    const found = asking.findings(base);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'disl.unsupported-feature', severity: 'warning', line: 0 });
    expect(found[0].message).toContain('`layout.tidyTree`');
    expect(asking.view(base, {})).toMatchObject({ readOnly: false });
    expect(asking.view(base, {}).nodes.map((node) => node.id)).toEqual(type.view(base, {}).nodes.map((node) => node.id));
    expect(asking.edit(base, { kind: 'rename', id: 'radio', text: 'Wireless' }, {}, false).kind).toBe('applied');
  });

  it('gives `disl.unsupported-conformance` for a higher conformance class', () => {
    expect(requiring({ conformance: 'full' }).findings(base)).toMatchObject([{ rule: 'disl.unsupported-conformance', severity: 'warning', line: 0 }]);
  });
});

describe('what a scene carries beside its nodes and edges', () => {
  const scene = type.view(base, { viewport: { x: 200, y: 0, width: 160, height: 300 } });

  it('the theme tokens of the definition, each with its value for `light` and for `dark`', () => {
    const tokens = object(at(specification, 'notation', 'theme', 'tokens'));
    const dark = object(at(specification, 'notation', 'theme', 'modes', 'dark'));
    const light = object(at(specification, 'notation', 'theme', 'modes', 'light'));
    expect(Object.keys(tokens).length).toBeGreaterThan(0);
    expect(scene.tokens).toEqual(Object.fromEntries(Object.keys(tokens).map((token) => [token, { light: light[token] ?? tokens[token], dark: dark[token] ?? tokens[token] }])));
    // A paint of the scene names a token of that list; its colour is the webview's to choose by the theme kind.
    const fills = scene.nodes.flatMap((node) => [node.style.fill, ...node.parts.map((part) => part.style.fill)]).flatMap((fill) => (typeof fill === 'object' && fill !== null && 'token' in fill ? [fill.token] : []));
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.filter((token) => !Object.hasOwn(scene.tokens ?? {}, token))).toEqual([]);
  });

  it('leaves a mode out for a token the definition gives no value in it', () => {
    const partial = diagramOf({ ...folder, definition: altered(folder.definition, (read) => ({ ...read, notation: { ...object(read.notation), theme: { tokens: {}, modes: { dark: { 'example.ink': '#ffffff' } } } } })) });
    expect(partial.view(base, {}).tokens).toEqual({ 'example.ink': { dark: '#ffffff' } });
  });

  it('the ruler of an axis that has one, with a row for each level and its ticks in the part in view', () => {
    const ruler = object(at(specification, 'coordinates', 'axes', 'time', 'ruler'));
    expect(scene.chrome?.rulers).toHaveLength(1);
    const [drawn] = scene.chrome!.rulers;
    expect(drawn).toMatchObject({ axis: 'x', position: ruler.position, attach: ruler.attach });
    // The document counts in years, and a level finer than its unit is never shown: four of the six are left.
    expect(drawn.levels.map((level) => level.spacing)).toEqual([4, 40, 400, 4000]);
    expect(drawn.levels.map((level) => level.minSpacing)).toEqual([64, 64, 64, 64]);
    expect(drawn.levels[0].ticks).toHaveLength(41);
    expect(drawn.levels[0].ticks[0].label).toBe('1950');
    expect(drawn.levels[0].ticks[0].at).toBeCloseTo(200, 6);
    expect(drawn.levels[1].ticks.map((tick) => tick.label)).toEqual(['1950', '1960', '1970', '1980', '1990']);
  });

  it('the filters of the canvas, each with what it offers and the value in use', () => {
    const declared = object(at(specification, 'notation', 'canvas', 'filters', 'tags'));
    expect(scene.chrome?.filters).toEqual([{ id: 'tags', label: declared.label, control: declared.control, options: ['electronics', 'invention'], value: [], match: 'any', matchToggle: true }]);
    expect(scene.filtered).toEqual([]);
  });

  it('applies a filter the view options keep, and says so', () => {
    const any = type.view(base, viewing({ filters: { tags: { value: ['ELECTRONICS', 'nothing'], match: 'any' } } }));
    expect(any.nodes.map((node) => node.id)).toEqual(['transistor-invented', 'note-1', 'note-2']);
    expect(any.filtered).toEqual(['transistors', 'radio']);
    expect(any.edges.filter((edge) => edge.hidden === undefined)).toEqual([]);
    expect(any.chrome?.filters[0]).toMatchObject({ value: ['ELECTRONICS', 'nothing'], match: 'any' });
    const all = type.view(base, viewing({ filters: { tags: { value: ['electronics', 'nothing'], match: 'all' } } }));
    expect(all.nodes.map((node) => node.id)).toEqual(['note-1', 'note-2']);
    expect(all.chrome?.filters[0]).toMatchObject({ match: 'all' });
  });

  it('a toggle for each variant of the viewpoint, and the variant when the view options ask for it', () => {
    const variant = object(at(specification, 'viewpoints', 'compact'));
    expect(scene.chrome?.toggles).toEqual([{ viewpoint: 'compact', label: at(variant, 'toggle', 'label'), on: false }]);
    const compact = type.view(base, viewing({ viewpoint: 'compact' }));
    expect(compact.viewpoint).toBe('compact');
    expect(compact.chrome?.toggles).toEqual([{ viewpoint: 'compact', label: at(variant, 'toggle', 'label'), on: true }]);
    // The variant packs along an axis without a ruler, and nothing in it is moved.
    expect(compact.chrome?.rulers).toEqual([]);
    expect(compact.nodes.map((node) => node.id)).toEqual(scene.nodes.map((node) => node.id));
    expect(compact.nodes.filter((node) => node.movable.x || node.movable.y)).toEqual([]);
    expect(type.view(base, viewing({ viewpoint: 'nowhere' })).viewpoint).toBe(scene.viewpoint);
  });

  it('the legend the canvas declares: one entry for each value of the enum it names, in the value\'s colour', () => {
    const values = object(at(specification, 'metamodel', 'enums', 'Phase', 'values'));
    expect(scene.chrome?.legend).toEqual(Object.entries(values).map(([key, value]) => ({ id: `Phase.${key}`, label: at(value, 'label'), fill: at(value, 'color') })));
  });

  it('the parts of a node an end of an edge may be anchored on, which are not the parts a pointer hits', () => {
    const anchors = (id: string): string[] => scene.nodes.find((node) => node.id === id)!.parts.filter((part) => part.anchor === true).map((part) => part.id);
    // The values of the enum the end's part is bound to, for as far as the node draws them.
    const phases = Object.keys(object(at(specification, 'metamodel', 'enums', 'Phase', 'values')));
    expect(anchors('transistors')).toEqual(phases);
    expect(anchors('radio')).toEqual(phases.slice(0, 3));
    expect(anchors('note-1')).toEqual([]);
    const named = scene.edges.flatMap((edge) => [edge.from, edge.to]).flatMap((end) => (end?.part === undefined ? [] : [[end.node, end.part]]));
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter(([node, part]) => !anchors(node).includes(part))).toEqual([]);
  });

  it('no background where the definition states none', () => expect(scene.chrome?.background).toBeUndefined());

  it('is plain data: what crosses to the webview as JSON', () => {
    const plain = (value: unknown): boolean =>
      value === null || ['string', 'boolean', 'undefined'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))
      || (Array.isArray(value) ? value.every(plain) : typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype && Object.values(value as object).every(plain));
    expect(plain(scene)).toBe(true);
    expect(plain(type.view(base, viewing({ viewpoint: 'compact' })))).toBe(true);
  });
});

describe('a folder of definitions/', () => {
  const files = folderFiles(hypeCycleFolder);
  const name = (extension: string): string => `${hypeCycleFolder}.${extension}`;
  const reasonOf = (changed: ReadonlyMap<string, Uint8Array>): string => {
    const read = readDefinitionFolder(hypeCycleFolder, changed);
    return 'reason' in read ? read.reason : '';
  };
  const text = (value: unknown): Uint8Array => encode(JSON.stringify(value));

  it('is a definition with its bindings when it is whole', () => {
    const read = readDefinitionFolder(hypeCycleFolder, files);
    if ('reason' in read) throw new Error(read.reason);
    expect(read.definition).toMatchObject({ name: hypeCycleFolder, kind: 'diagram', specification });
    expect(read.definition.companion).toBe(fileText(hypeCycleFolder, 'md'));
    // The definition names its binding by an address; it is the copied file of that name, and the binding after the `#`.
    expect(String(at(specification, 'persistence', 'binding'))).toMatch(/^https:\/\/.*\/gartner-hype-cycle-graph\.fbl#ghg$/);
    expect(read.bindings.map((found) => found.name)).toEqual(['ghg']);
  });

  it.each(['dis', 'fbl', 'md'])('is no tool type without its .%s file, and says which file it lacks', (extension) => {
    expect(reasonOf(withFile(files, name(extension)))).toContain(extension === 'dis' ? '.dis' : name(extension));
  });

  it('is no tool type without the record of where its files come from', () => {
    expect(reasonOf(withFile(files, 'PROVENANCE.md'))).toContain('PROVENANCE.md');
  });

  it('is no tool type when its definition is not on FBL', () => {
    const onJson = { ...specification, persistence: { ...object(specification.persistence), format: 'json' } };
    expect(reasonOf(withFile(files, name('dis'), text(onJson)))).toContain('FBL');
  });

  it('is no tool type when its binding cannot be loaded, or is not in the file the definition names', () => {
    expect(reasonOf(withFile(files, name('fbl'), encode('{ "fbl": "0.1" ')))).toContain(name('fbl'));
    const other = { ...specification, persistence: { ...object(specification.persistence), binding: `${name('fbl')}#other` } };
    expect(reasonOf(withFile(files, name('dis'), text(other)))).toContain('`other`');
    const elsewhere = { ...specification, persistence: { ...object(specification.persistence), binding: '../elsewhere/other.fbl#ghg' } };
    expect(reasonOf(withFile(files, name('dis'), text(elsewhere)))).toContain('other.fbl');
  });

  it('is no tool type when its specification cannot be read', () => {
    expect(reasonOf(withFile(files, name('dis'), encode('not JSON')))).toContain(name('dis'));
  });

  it('resolves a relative reference to the copied file of that name as well', () => {
    const relative = { ...specification, persistence: { ...object(specification.persistence), binding: `${name('fbl')}#ghg` } };
    expect(reasonOf(withFile(files, name('dis'), text(relative)))).toBe('');
  });
});

describe('the tool types of the folders of definitions/', () => {
  const registry = pluginRegistry(noPlugins);
  const all = toolTypesFrom(allFolders(), registry);

  it('are one for each folder that is whole, in the order of the folders\' names', () => {
    expect(all.skipped).toEqual([]);
    expect(all.types.map((found) => found.origin)).toEqual([...allFolders().keys()].sort().map((name) => at(specificationOf(name), 'language', 'origin')));
    expect(all.types.map((found) => found.origin)).toContain(type.origin);
  });

  it('lose a type when its folder is removed, and nothing else', () => {
    const folders = allFolders();
    folders.delete(hypeCycleFolder);
    const without = toolTypesFrom(folders, registry);
    expect(without.types.map((found) => found.origin)).toEqual(all.types.map((found) => found.origin).filter((origin) => origin !== type.origin));
    expect(without.skipped).toEqual([]);
  });

  it('leave a folder that is no tool type out, with the reason', () => {
    const folders = allFolders();
    folders.set(hypeCycleFolder, withFile(folders.get(hypeCycleFolder)!, `${hypeCycleFolder}.fbl`));
    const broken = toolTypesFrom(folders, registry);
    expect(broken.types.map((found) => found.origin)).not.toContain(type.origin);
    expect(broken.skipped).toMatchObject([{ folder: hypeCycleFolder }]);
    expect(broken.skipped[0].reason).toContain(`${hypeCycleFolder}.fbl`);
  });
});
