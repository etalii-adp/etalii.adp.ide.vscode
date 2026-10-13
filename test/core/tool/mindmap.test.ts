import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decode, encode } from '../../../src/core/fbl/text/utf8';
import { viewTypeOf, type Action, type DiagramToolType, type EditOutcome, type EditRequest, type Field, type Source, type TextSplice, type ViewOptions } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import type { Scene } from '../../../src/core/scene/scene';
import { altered, applied, array, at, definitionOf, diagramOf, linesChanged, object, refusal, specificationOf, spliced, type Json } from './support';

// The mind map as a tool type made from its definition (etalii.adp spec 027, task T067), against
// what standalone's hand-written module answered for the same files: its recorded transcript,
// `fixtures/tools/mindmap/mindmap.transcript.json` (standalone 5756a07,
// `EtAlii.Adp.Diagram.Mindmap.Tests/Parity/MindmapTranscript.cs`). The transcript names a tool, an
// action and a property row by standalone's wire ids; the definition maps its own names to them in
// `x-mindmap`, which this test reads to translate. What a test expects is the transcript's or the
// definition's, and is typed here only where it is the bytes of a document.

const folder = 'mindmap';
const specification = specificationOf(folder);
const read = definitionOf(folder);

// The registry is the one the plug-in starts with: the three plugins the definition names are in it.
const type = diagramOf(read, registry);

// ---- the transcript ----

interface Step { readonly do: string; readonly answer: string; readonly hunks?: readonly string[]; readonly unchanged?: boolean; readonly sha256?: string }
interface Recorded {
  readonly document: string; readonly sha256: string;
  readonly menus: readonly (readonly string[])[]; readonly targets: readonly string[];
  readonly rows: readonly { readonly target: string; readonly rows: readonly string[] }[];
  readonly findings: readonly string[]; readonly payloads: readonly string[]; readonly edits: readonly Step[]; readonly undoAll: string;
}
const transcript = JSON.parse(readFileSync('fixtures/tools/mindmap/mindmap.transcript.json', 'utf8')) as { readonly toolbox: readonly string[]; readonly documents: readonly Recorded[] };
const recorded = (document: string): Recorded => {
  const found = transcript.documents.find((candidate) => candidate.document.endsWith(document) && 'edits' in candidate);
  if (!found) throw new Error(`The transcript has no document ${document}.`);
  return found;
};
const sha256 = (text: string): string => createHash('sha256').update(encode(text)).digest('hex');

// The transcript's ids, by the definition's names.
const inverse = (map: unknown): Map<string, string> => new Map(Object.entries(object(map)).map(([name, wire]) => [String(wire), name]));
const actionIds = inverse(at(specification, 'x-mindmap', 'actions'));
const rowIds = inverse(at(specification, 'x-mindmap', 'properties'));
const toolWire = object(at(specification, 'x-mindmap', 'tools'));

// The documents of the transcript this repository holds: the fixture, and the module's two examples.
const documents: readonly { readonly name: string; readonly path: string; readonly record: string }[] = [
  { name: 'architecture.mm', path: 'fixtures/tools/mindmap/architecture.mm', record: 'Fixtures/architecture.mm' },
  { name: 'design.mm', path: 'examples/mindmap/example 1/design.mm', record: 'diagrams/mindmap/examples/example 1/design.mm' },
  { name: 'mindmap.mm', path: 'examples/mindmap/example 1/mindmap.mm', record: 'diagrams/mindmap/examples/example 1/mindmap.mm' },
];
/** A document as the frame hands it over: its bytes as they are on disk, mixed line endings included. */
const sourceOf = (path: string, name: string): Source => ({ fileName: name, text: readFileSync(path, 'utf8') });
const architecture = sourceOf(documents[0].path, documents[0].name);

// ---- a menu, a row and a placed node, as the transcript writes them ----

/** `g1 mindmap.add-child | Add child | mdi-subdirectory-arrow-right | Insert | on`. The group is not carried by the frame's `Action`. */
function actionOf(line: string): Action {
  const [first, label, icon, shortcut, available] = line.split(' | ');
  const wire = first.slice(first.indexOf(' ') + 1);
  return {
    id: actionIds.get(wire) ?? wire, label, icon,
    // Standalone sends the space bar as the key " "; the definition writes it "Space" (mindmap.md 7.1).
    ...(shortcut === '-' ? {} : { shortcut: shortcut === ' ' ? 'Space' : shortcut }),
    enabled: available.startsWith('on'),
  };
}

/** `mindmap.text | Text | "ADP architecture" | Line | editable | group `. */
function fieldOf(line: string): Field {
  const match = /^(\S+) \| (.*?) \| ("(?:[^"\\]|\\.)*") \| (Line|Text) \| (editable|read-only \((.*)\)) \| group (.*)$/s.exec(line);
  if (!match) throw new Error(`not a row: ${line}`);
  return {
    id: rowIds.get(match[1]) ?? match[1], label: match[2], group: match[7], control: match[4] === 'Text' ? 'multiline' : 'text', value: JSON.parse(match[3]) as string,
    ...(match[6] === undefined ? {} : { readOnly: match[6] }),
  };
}

interface Payload {
  readonly id: string; readonly type: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly text: string; readonly notes: string; readonly link: string; readonly hasChildren: boolean; readonly parentId?: string;
}
/** `ID_411002937 | freeplane/mindmap+node | 156.55, -102.14 | MindmapNodePayload { ... }`: the centre of the box, and its size. */
function payloadOf(line: string): Payload {
  const match = /^(\S+) \| (\S+) \| (\S+), (\S+) \| MindmapNodePayload (\{.*\})$/s.exec(line);
  if (!match) throw new Error(`not a payload: ${line}`);
  const payload = JSON.parse(match[5]) as { text?: string; notes?: string; hasChildren?: boolean; link?: { raw?: string }; parentId?: string; width: number; height: number };
  return {
    id: match[1], type: match[2], x: Number(match[3]), y: Number(match[4]), width: payload.width, height: payload.height,
    text: payload.text ?? '', notes: payload.notes ?? '', link: payload.link?.raw ?? '', hasChildren: payload.hasChildren === true, parentId: payload.parentId,
  };
}

/** Where a scene differs from the placed nodes of the transcript. A place is the same within a hundredth: the transcript rounds to two decimals. */
function placeDifferences(scene: Scene, payloads: readonly Payload[]): string[] {
  const differences: string[] = [];
  const said = (id: string, what: string, here: unknown, there: unknown): void => void differences.push(`${id}: ${what} is ${JSON.stringify(here)} here and ${JSON.stringify(there)} in the transcript`);
  const near = (here: number, there: number): boolean => Math.abs(here - there) < 0.011;
  if (scene.nodes.map((node) => node.id).join() !== payloads.map((payload) => payload.id).join()) said('scene', 'the nodes drawn, in order', scene.nodes.map((node) => node.id), payloads.map((payload) => payload.id));
  for (const payload of payloads) {
    const node = scene.nodes.find((candidate) => candidate.id === payload.id);
    if (!node) continue;
    const { box } = node;
    if (`${type.origin}+${String(at(specification, 'x-mindmap', 'types', node.type))}` !== payload.type) said(payload.id, 'type', node.type, payload.type);
    if (!near(box.x + box.width / 2, payload.x) || !near(box.y + box.height / 2, payload.y)) said(payload.id, 'centre', [box.x + box.width / 2, box.y + box.height / 2], [payload.x, payload.y]);
    if (!near(box.width, payload.width) || !near(box.height, payload.height)) said(payload.id, 'size', [box.width, box.height], [payload.width, payload.height]);
    const text = node.labels.find((label) => label.id === 'text')?.text;
    if (text !== payload.text) said(payload.id, 'text', text, payload.text);
    if ((node.fold !== undefined) !== payload.hasChildren) said(payload.id, 'can be folded', node.fold, payload.hasChildren);
    const parents = scene.edges.filter((edge) => edge.target === payload.id).map((edge) => edge.source);
    if (parents.join() !== (payload.parentId ?? '')) said(payload.id, 'parent', parents, payload.parentId);
    // The corner glyphs, as the definition's `indicators` joins them.
    const glyphs = [payload.notes !== '' ? '\u2022' : '', payload.link !== '' ? '\u2197' : '', node.fold === 'folded' ? '\u2295' : ''].join(' ').trim();
    const drawn = node.labels.find((label) => label.id === 'indicators')?.text ?? '';
    if (drawn !== glyphs) said(payload.id, 'glyphs', drawn, glyphs);
  }
  return differences;
}

// ---- splices and their inverse ----

/** The splices that undo an applied outcome: of the text after it, each putting back the bytes its splice took out. This is what undo in the editor does. */
function inverseOf(before: string, splices: readonly TextSplice[]): TextSplice[] {
  const bytes = encode(before);
  let shift = 0;
  return splices.map((splice) => {
    const written = encode(splice.text).length;
    const back = { offset: splice.offset + shift, length: written, text: decode(bytes.subarray(splice.offset, splice.offset + splice.length)) };
    shift += written - splice.length;
    return back;
  });
}

// ---- the 41 edits of a document, each as the request this host makes of it ----

interface Ran {
  readonly index: number;
  readonly step: Step;
  /** What differs from the transcript; empty when the step is met. */
  readonly problems: readonly string[];
}

/**
 * Runs a document's recorded edit sequence. Each step is one request to `edit`, but for the two
 * that standalone commits through a dialog this host does not have (see `requestsOf`). After each
 * step the text is compared with the transcript's hash of it, with the ids this run made written as
 * the transcript writes them (`ID_new1`, `ID_new2`, ... in the order they first appear).
 */
function run(start: Source, record: Recorded): { readonly steps: readonly Ran[]; readonly undone: string; readonly end: string } {
  const written = new Set([...start.text.matchAll(/ID="([^"]*)"/g)].map((match) => match[1]));
  const masks = new Map<string, string>();
  const learn = (text: string): void => {
    for (const match of text.matchAll(/ID="([^"]*)"/g)) if (!written.has(match[1]) && !masks.has(match[1])) masks.set(match[1], `ID_new${masks.size + 1}`);
  };
  const masked = (text: string): string => [...masks].reduce((result, [id, mask]) => result.replaceAll(id, mask), text);
  const real = (id: string): string => [...masks].find(([, mask]) => mask === id)?.[0] ?? id;

  let source = start;
  let options: ViewOptions = {};
  const history: { readonly before: string; readonly after: string; readonly inverse: readonly TextSplice[] }[] = [];
  const steps: Ran[] = [];

  for (const [index, step] of record.edits.entries()) {
    const problems: string[] = [];
    const before = source.text;
    const send = (request: EditRequest, confirmed = false): EditOutcome => {
      const outcome = type.edit(source, request, options, confirmed);
      if (outcome.kind === 'applied') {
        const from = source.text;
        const after = spliced(from, outcome.splices);
        const inverse = inverseOf(from, outcome.splices);
        if (spliced(after, inverse) !== from) problems.push('The inverse of the splices does not give the bytes before back.');
        if (outcome.splices.length > 0) history.push({ before: from, after, inverse });
        source = { ...source, text: after };
        if (outcome.viewOptions) options = outcome.viewOptions;
        learn(after);
      }
      return outcome;
    };
    const expectKind = (outcome: EditOutcome, kind: EditOutcome['kind']): void => {
      if (outcome.kind !== kind) problems.push(`The outcome is ${JSON.stringify(outcome)}, not ${kind}.`);
    };
    const same = (outcome: EditOutcome, expected: EditOutcome): void => {
      if (JSON.stringify(outcome) !== JSON.stringify(expected)) problems.push(`The outcome is ${JSON.stringify(outcome)}, not ${JSON.stringify(expected)}.`);
    };

    try {
      const last = requestsOf(step, real, send, problems);
      const { answer } = step;
      if (answer.startsWith('refused: ')) expectKind(last, 'refused');
      else if (answer === 'ok') {
        expectKind(last, 'applied');
        if (step.do.includes('mindmap.toggle-fold') && last.kind === 'applied' && (last.splices.length > 0 || last.viewOptions?.collapsed === undefined)) problems.push(`A fold is this viewer's and no splice: ${JSON.stringify(last)}`);
      } else if (answer.startsWith('confirms: ')) {
        const question = /Title = (.*), Icon = .*?, Message = (.*), ConfirmLabel = (.*), Danger = (True|False) \}$/s.exec(answer)!;
        same(last, { kind: 'confirm', title: question[1], message: question[2], confirmLabel: question[3], danger: question[4] === 'True' });
      } else if (answer.startsWith('chooses: ')) {
        // Standalone offers a tree of the project's files; this host answers with the platform's dialog, which the extension shows.
        same(last, { kind: 'pickPath', id: real(step.do.slice(step.do.lastIndexOf(' ') + 1)), field: 'link' });
      } else if (answer.startsWith('asks: ')) {
        const asked = /InlineLabelElementId = (\S*), CommitActionId = (\S*) \}$/.exec(answer)!;
        if (asked[2] !== '') {
          // A node was added and its text is asked in place: the new node is selected and its label opened.
          if (last.kind !== 'applied' || last.select === undefined || masked(last.select) !== asked[1] || last.editLabel !== true || last.multiline === true) problems.push(`The outcome is ${JSON.stringify(last)}, not the new node ${asked[1]} selected with its text opened in place.`);
        } else if (asked[1] !== '') same(last, { kind: 'editInPlace', id: real(asked[1]), multiline: false });
        // Standalone asks the notes in a dialog; this host answers in ADP Properties, at the row of the notes.
        else same(last, { kind: 'showField', field: 'notes' });
      } else problems.push(`An answer this test does not read: ${answer}`);
    } catch (error) {
      problems.push(`It threw: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (step.unchanged === true) {
      if (source.text !== before) problems.push('The text changed, and the transcript says it does not.');
    } else if (sha256(masked(source.text)) !== step.sha256) {
      const { removed, added } = linesChanged(before, source.text);
      problems.push(`The text is not the transcript's. The transcript: ${JSON.stringify(step.hunks)}. Here, taken out: ${JSON.stringify(removed.map(masked))}, put in: ${JSON.stringify(added.map(masked))}.`);
    }
    steps.push({ index: index + 1, step, problems });
  }

  // Everything undone, the latest first: each inverse applied to the text its edit left.
  const end = source.text;
  let text = end;
  for (const entry of history.reverse()) text = text === entry.after ? spliced(text, entry.inverse) : text;
  return { steps, undone: text, end };
}

/**
 * The requests of one recorded step, sent in order; the outcome of the last one. Standalone has
 * four ways in: a property row set, an action executed, an action committed with a value, and a
 * drag's move.
 */
function requestsOf(step: Step, real: (id: string) => string, send: (request: EditRequest, confirmed?: boolean) => EditOutcome, problems: string[]): EditOutcome {
  const set = /^set (\S+) (\S+) = (.*)$/s.exec(step.do);
  if (set) return send({ kind: 'setField', id: real(set[1]), field: rowIds.get(set[2]) ?? set[2], value: JSON.parse(set[3]) as string });

  const move = /^move (\S+) under (\S+) at (-?\d+)$/.exec(step.do);
  // Standalone's -1 is "after the last child", which is a request without an index.
  if (move) return send({ kind: 'reparent', id: real(move[1]), parent: real(move[2]), ...(Number(move[3]) < 0 ? {} : { index: Number(move[3]) }) });

  const execute = /^execute (\S+) on (\S+)$/.exec(step.do);
  if (execute) return send({ kind: 'action', action: actionIds.get(execute[1]) ?? execute[1], id: real(execute[2]) });

  const commit = /^commit (\S+) on (\S+) = (.*)$/s.exec(step.do);
  if (!commit) throw new Error(`a step this test does not read: ${step.do}`);
  const id = real(commit[2]);
  const value = JSON.parse(commit[3]) as string;
  switch (actionIds.get(commit[1])) {
    case 'editLabel': return send({ kind: 'rename', id, text: value });
    case 'delete': return send({ kind: 'action', action: 'delete', id }, true);
    // The value of the dialog standalone asked the notes in, and of its picker: here the row of ADP Properties, and what the extension sends when a path is picked.
    case 'editNotes': return send({ kind: 'setField', id, field: 'notes', value });
    case 'link': return send({ kind: 'setField', id, field: 'link', value });
    case 'addChild': case 'addSibling': {
      // Standalone can add a node under a name asked beforehand, in one step. This host always adds
      // it under the name its siblings give and opens that name in place, so the same end is two
      // requests, and two undo steps: the add, then the rename.
      const added = send({ kind: 'action', action: actionIds.get(commit[1])!, id });
      if (added.kind !== 'applied') return added;
      if (added.select === undefined) {
        problems.push(`The added node is not selected: ${JSON.stringify(added)}`);
        return added;
      }
      return send({ kind: 'rename', id: added.select, text: value });
    }
    default: throw new Error(`a commit this test does not read: ${step.do}`);
  }
}

// ---- the tests ----

describe('the mind map, a tool type from its definition', () => {
  it('carries the origin, the kind and the one display name the definition gives', () => {
    expect(type.origin).toBe(at(specification, 'language', 'origin'));
    expect(type.displayName).toBe(at(specification, 'language', 'label'));
    expect(type.kind).toBe('diagram');
    expect(viewTypeOf(type)).toBe('etalii.adp.freeplane.mindmap');
  });

  it('claims what its binding claims: every file of its extension, with no marker', () => {
    expect(type.claims).toEqual([{ extensions: ['mm'], shared: false, marker: false, registrationOnly: false }]);
    expect(type.claimed('C:\\work\\plans.MM', '')).toBe(true);
    expect(type.claimed('/work/plans.md', architecture.text)).toBe(false);
  });

  it('names no plugin the registry lacks', () => {
    expect(type.findings(architecture).filter((finding) => finding.rule === 'std.pluginMissing')).toEqual([]);
    expect(type.view(architecture, {})).toMatchObject({ readOnly: false });
    expect(type.view(architecture, {}).notice).toBeUndefined();
  });

  it('offers the toolbox the transcript records', () => {
    expect(type.toolbox(architecture).map((entry) => `${String(object(toolWire[entry.id]).id)} | ${entry.label} | ${entry.icon} | drops ${String(object(toolWire[entry.id]).drop)} | ${entry.description}`)).toEqual(transcript.toolbox);
  });

  it('starts a new document as one central topic named after the file, which reads cleanly', () => {
    const created = type.newDocument('plans');
    expect(created).toMatch(/^<map version="freeplane 1\.11\.5">\n<node TEXT="plans" ID="ID_[0-9a-z]{25}"\/>\n<\/map>\n?$/);
    const source: Source = { fileName: 'plans.mm', text: created };
    expect(type.findings(source)).toEqual([]);
    expect(type.view(source, {}).nodes.map((node) => node.labels[0].text)).toEqual(['plans']);
  });
});

describe.each(documents)('$name', ({ name, path, record }) => {
  const source = sourceOf(path, name);
  const expected = recorded(record);
  const payloads = expected.payloads.map(payloadOf);
  const targets = expected.targets.map((line) => /^("(?:[^"\\]|\\.)*") => menu #(\d+), flipped folds #(\d+)$/.exec(line)!).map((match) => ({ id: JSON.parse(match[1]) as string, menu: Number(match[2]), flipped: Number(match[3]) }));
  const scene = type.view(source, {});

  it('is the document the transcript was recorded from, byte for byte', () => {
    expect(sha256(source.text)).toBe(expected.sha256);
  });

  describe('opened', () => {
    it('has the findings the transcript records', () => {
      expect(type.findings(source).map((finding) => `${finding.severity} | ${finding.rule} | ${finding.message}`)).toEqual(expected.findings);
    });

    it('places every node where the transcript does, at its size, under its parent, with its text and its glyphs', () => {
      expect(placeDifferences(scene, payloads)).toEqual([]);
      expect(scene.edges).toHaveLength(payloads.length - 1);
      expect(scene.findings).toEqual([]);
    });

    it('is editable, with no notice', () => {
      expect(scene.readOnly).toBe(false);
      expect(scene.notice).toBeUndefined();
    });

    it('is left untouched when nothing is edited: the same scene again, and a text entered as it stands is no splice', () => {
      type.findings(source);
      type.toolbox(source);
      for (const node of scene.nodes) {
        type.fields(source, [node.id]);
        type.actions(source, [node.id]);
      }
      expect(type.view(source, {})).toEqual(scene);
      for (const node of scene.nodes.slice(0, 5)) {
        expect(applied(type.edit(source, { kind: 'rename', id: node.id, text: node.labels[0].editText }, {}, false)).splices).toEqual([]);
        expect(applied(type.edit(source, { kind: 'setField', id: node.id, field: 'text', value: node.labels[0].editText }, {}, false)).splices).toEqual([]);
      }
    });
  });

  describe('its menus', () => {
    // A view with the fold of every branch flipped: what the file leaves open is folded, what it folds is open.
    const flipped: ViewOptions = {
      collapsed: Object.fromEntries(targets.flatMap(({ id }) => {
        const row = type.fields(source, [id]).find((field) => field.id === 'folded');
        return row ? [[id, row.value === 'No']] : [];
      })),
    };

    it.each(targets)('of $id, as the file folds it and with every fold flipped', ({ id, menu, flipped: other }) => {
      const selection = id === '' ? [] : [id];
      expect(type.actions(source, selection, {})).toEqual(expected.menus[menu].map(actionOf));
      expect(type.actions(source, selection, flipped)).toEqual(expected.menus[other].map(actionOf));
    });
  });

  describe('its property rows', () => {
    it.each(targets)('of $id', ({ id }) => {
      expect(type.fields(source, id === '' ? [] : [id])).toEqual((expected.rows.find((rows) => rows.target === id)?.rows ?? []).map(fieldOf));
    });
  });

  describe('its edits', () => {
    const ran = run(source, expected);

    it('are the 41 of the transcript', () => expect(ran.steps).toHaveLength(41));

    it.each(ran.steps)('$index: $step.do', ({ problems }) => {
      expect(problems).toEqual([]);
    });

    it('are undone one by one to the bytes the document had', () => {
      expect(ran.end).not.toBe(source.text);
      expect(ran.undone).toBe(source.text);
    });
  });
});

describe('a refusal, in the definition\'s words', () => {
  const edit = (request: EditRequest, confirmed = false): EditOutcome => type.edit(architecture, request, {}, confirmed);
  const root = 'ID_1730044821';
  const branch = 'ID_411002937';
  const within = 'ID_88117420';
  const rules = array(at(specification, 'constraints', 'rules')).map(object);
  const sentenceOf = (id: string): string => String(rules.find((rule) => rule.id === id)?.message);

  it('the central topic is not moved, and a node not into its own branch', () => {
    expect(refusal(edit({ kind: 'reparent', id: root, parent: branch }))).toBe(sentenceOf('reparentWithinTree'));
    expect(refusal(edit({ kind: 'reparent', id: branch, parent: within }))).toBe(sentenceOf('reparentWithinTree'));
    expect(refusal(edit({ kind: 'reparent', id: branch, parent: branch }))).toBe(sentenceOf('reparentWithinTree'));
  });

  it('the central topic is not removed', () => {
    expect(refusal(edit({ kind: 'action', action: 'delete', id: root }))).toBe(sentenceOf('keepCentralTopic'));
    expect(refusal(edit({ kind: 'action', action: 'delete', id: root }, true))).toBe(sentenceOf('keepCentralTopic'));
  });

  it('a row that is shown and not edited says why', () => {
    for (const field of type.fields(architecture, [root]).filter((row) => row.readOnly !== undefined)) {
      expect(refusal(edit({ kind: 'setField', id: root, field: field.id, value: 'Yes' }))).toBe(field.readOnly);
    }
    expect(type.fields(architecture, [root]).filter((row) => row.readOnly !== undefined).map((row) => row.id)).toEqual(['folded', 'identifier']);
  });
});

describe('folding, which is this viewer\'s own', () => {
  const branch = 'ID_411002937';
  const foldedInFile = 'ID_88117425';
  const fold = (id: string, folded: boolean, options: ViewOptions = {}) => applied(type.edit(architecture, { kind: 'fold', id, folded }, options, false));

  it('writes nothing and gives the view options with the fold', () => {
    const outcome = fold(branch, true, { viewport: { x: 0, y: 0, width: 10, height: 10 } });
    expect(outcome.splices).toEqual([]);
    expect(outcome.viewOptions).toEqual({ viewport: { x: 0, y: 0, width: 10, height: 10 }, collapsed: { [branch]: true } });
  });

  it('hides what is under the folded node and lays out the rest again', () => {
    const open = type.view(architecture, {});
    const closed = type.view(architecture, fold(branch, true).viewOptions!);
    const under = open.edges.filter((edge) => edge.source === branch).map((edge) => edge.target);
    expect(under.length).toBeGreaterThan(0);
    expect(closed.nodes.find((node) => node.id === branch)?.fold).toBe('folded');
    expect(closed.nodes.map((node) => node.id).filter((id) => under.includes(id))).toEqual([]);
    expect(closed.edges.filter((edge) => edge.source === branch)).toEqual([]);
    expect(closed.nodes.length).toBeLessThan(open.nodes.length);
    // The branch below it moved up into the room.
    const sibling = 'ID_411002938';
    expect(closed.nodes.find((node) => node.id === sibling)!.box.y).toBeLessThan(open.nodes.find((node) => node.id === sibling)!.box.y);
  });

  it('starts as the file folds a node, and the viewer\'s own state wins from then on', () => {
    expect(type.view(architecture, {}).nodes.find((node) => node.id === foldedInFile)?.fold).toBe('folded');
    const opened = type.view(architecture, fold(foldedInFile, false).viewOptions!);
    expect(opened.nodes.find((node) => node.id === foldedInFile)?.fold).toBe('unfolded');
    expect(opened.nodes.length).toBe(type.view(architecture, {}).nodes.length + 3);
    expect(architecture.text).toContain('FOLDED="true"');
  });

  it('is refused for a leaf and for a node that is not there', () => {
    expect(type.edit(architecture, { kind: 'fold', id: 'ID_88117420', folded: true }, {}, false).kind).toBe('refused');
    expect(type.edit(architecture, { kind: 'fold', id: 'ID_nowhere', folded: true }, {}, false).kind).toBe('refused');
  });

  it('opens a folded node that a child is added to, so that the new node is seen', () => {
    const outcome = applied(type.edit(architecture, { kind: 'action', action: 'addChild', id: foldedInFile }, {}, false));
    expect(outcome.select).toMatch(/^ID_[0-9a-z]{25}$/);
    expect(outcome.viewOptions?.collapsed).toEqual({ [foldedInFile]: false });
  });
});

describe('the gestures the transcript has no step for', () => {
  const root = 'ID_1730044821';
  const linked = 'ID_88117420';
  const edit = (request: EditRequest, source: Source = architecture): EditOutcome => type.edit(source, request, {}, false);
  const boxOf = (id: string) => type.view(architecture, {}).nodes.find((node) => node.id === id)!.box;

  it('the toolbox entry dropped on a node adds a child under it, as "Add child" does', () => {
    const entry = type.toolbox(architecture)[0];
    const box = boxOf(linked);
    const dropped = applied(edit({ kind: 'drop', entry: entry.id, x: box.x + box.width / 2, y: box.y + box.height / 2 }));
    const added = linesChanged(architecture.text, spliced(architecture.text, dropped.splices)).added.join('\n');
    expect(added).toMatch(/<node TEXT="Node" ID="ID_[0-9a-z]{25}"\/>/);
    expect(dropped).toMatchObject({ editLabel: true, select: expect.stringMatching(/^ID_/) as unknown });
    expect(type.view({ ...architecture, text: spliced(architecture.text, dropped.splices) }, {}).edges.find((edge) => edge.target === dropped.select)?.source).toBe(linked);
  });

  it('the toolbox entry dropped on the empty canvas does nothing', () => {
    expect(applied(edit({ kind: 'drop', entry: type.toolbox(architecture)[0].id, x: 100000, y: 100000 })).splices).toEqual([]);
  });

  it('a node dragged onto its own parent at a place among the children goes there', () => {
    const parent = 'ID_88117421';
    const last = 'ID_88117424';
    const moved = { ...architecture, text: spliced(architecture.text, applied(edit({ kind: 'reparent', id: last, parent, index: 0 })).splices) };
    expect(type.view(moved, {}).edges.filter((edge) => edge.source === parent).map((edge) => edge.target)).toEqual([last, 'ID_88117422', 'ID_88117423']);
    expect(moved.text.length).toBe(architecture.text.length);
    expect(type.findings(moved)).toEqual([]);
  });

  it('a link is not followed: the definition states no operation that opens one', () => {
    expect(edit({ kind: 'openLink', id: linked }).kind).toBe('refused');
  });

  it('a link is followed where a definition states an operation that opens it', () => {
    const opening = diagramOf({ ...read, definition: altered(read.definition, (written: Json) => ({
      ...written,
      behavior: { ...object(written.behavior), operations: { ...object(at(written, 'behavior', 'operations')), follow: { label: 'Open link', for: ['Node'], enabled: 'has(self.link)', actions: [{ open: 'self.link' }] } } },
    })) }, registry);
    expect(opening.edit(architecture, { kind: 'openLink', id: linked }, {}, false)).toEqual({ kind: 'open', path: '../../../../backend/EtAlii.Adp.Backend/Context/ContextServiceImpl.cs' });
    expect(opening.edit(architecture, { kind: 'openLink', id: root }, {}, false).kind).toBe('refused');
  });

  it('a label a definition edits in a form is answered in ADP Properties, not in place', () => {
    const inForm: DiagramToolType = diagramOf({ ...read, definition: altered(read.definition, (written: Json) => {
      const nodes = object(at(written, 'notation', 'nodes'));
      const node = object(nodes.Node);
      const labels = array(node.labels).map((label, index) => (index === 0 ? { ...object(label), editable: 'form' } : label));
      return { ...written, notation: { ...object(written.notation), nodes: { ...nodes, Node: { ...node, labels } } } };
    }) }, registry);
    expect(inForm.edit(architecture, { kind: 'action', action: 'editLabel', id: root }, {}, false)).toEqual({ kind: 'showField', field: 'text' });
  });
});

// The transcript's inline documents are not in this repository as files: their text is in
// standalone's `Parity/MindmapCorpus.cs`. Four of them are typed here, each held to the transcript
// by its hash, for the rules of the definition. A finding names the map by its file: here always the
// `.mm` itself, where the transcript's validator was given a registration beside it and names that.
describe('the rules of the definition', () => {
  const inline = (name: string, text: string): Source => {
    expect(sha256(text)).toBe(recorded(`inline/${name}`).sha256);
    return { fileName: name, text };
  };
  const found = (source: Source): string[] => type.findings(source).map((finding) => `${finding.severity} | ${finding.rule} | ${finding.message}`);

  it('a map with two roots is not readable: one finding, an empty read-only view, and nothing to edit with', () => {
    const source = inline('two-roots.mm', '<map version="freeplane 1.12.15">\n<node TEXT="one" ID="ID_1"/>\n<node TEXT="two" ID="ID_2"/>\n</map>\n');
    const sentence = "'two-roots.mm' is not a readable mind map: A map has exactly one root node; this one has 2.";
    expect(found(source)).toEqual([`error | mindmap.not-a-map | ${sentence}`]);
    expect(type.view(source, {})).toMatchObject({ nodes: [], edges: [], readOnly: true, notice: sentence });
    expect(type.toolbox(source)).toEqual([]);
    expect(type.edit(source, { kind: 'rename', id: 'ID_1', text: 'x' }, {}, false).kind).toBe('refused');
  });

  it('a central topic without text is a warning, and the map is still edited', () => {
    const source = inline('unnamed-root.mm', '<map version="freeplane 1.12.15"><node TEXT="" ID="ID_1"><node TEXT="a child" ID="ID_2"/></node></map>');
    expect(found(source)).toEqual(["warning | mindmap.unnamed-root | The map 'unnamed-root.mm' has an unnamed central topic."]);
    expect(type.view(source, {}).readOnly).toBe(false);
    const named = { ...source, text: spliced(source.text, applied(type.edit(source, { kind: 'rename', id: 'ID_1', text: 'Named' }, {}, false)).splices) };
    expect(found(named)).toEqual([]);
  });

  it('an ordinary node without text is no finding', () => {
    expect(found(inline('empty-ordinary-node.mm', '<map version="freeplane 1.12.15"><node TEXT="root" ID="ID_1"><node TEXT="" ID="ID_2"/></node></map>'))).toEqual([]);
  });

  // The transcript has "Two nodes share the id 'ID_2' ('first' and 'second')." here. The definition's rule
  // asks `diagram.elementById(self.id) == self`, and its binding reads the later holder under an id of
  // its own, so the rule as it is written holds for it and nothing is found (etalii.adp issue 152).
  it('two nodes with one id are both drawn, and the rule as the definition writes it finds nothing', () => {
    const source = inline('duplicate-id.mm', '<map version="freeplane 1.12.15"><node TEXT="root" ID="ID_1"><node TEXT="first" ID="ID_2"/><node TEXT="second" ID="ID_2"/></node></map>');
    expect(found(source)).toEqual([]);
    const scene = type.view(source, {});
    expect(scene.nodes.map((node) => node.labels[0].text)).toEqual(['root', 'first', 'second']);
    expect(new Set(scene.nodes.map((node) => node.id)).size).toBe(3);
  });
});
