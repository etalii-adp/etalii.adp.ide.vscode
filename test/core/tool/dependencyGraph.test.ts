import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EditOutcome, EditRequest, Source } from '../../../src/core/frame/toolType';
import { LinkWorkspace } from '../../../src/core/fbl/links/workspace';
import { plugins as registry } from '../../../src/core/plugins/index';
import { definitionOf, diagramOf, spliced } from './support';

// The dependency graph edited from its definition (etalii.adp spec 088, tasks T030 and T031), against
// what standalone's module answered for the same files: the edit sequence of its recorded transcript
// (`fixtures/tools/dependency-graph/dependency-graph.transcript.json`), each step a gesture, its answer,
// and the lines it changed. The steps are made as the requests this host's canvas, menus, input boxes
// and ADP Properties make, one after the other on the text the step before left. An id the tool mints
// is written `{minted-N}` in the transcript, numbered in the order the document's steps mint them.
// Where this host answers otherwise on purpose, the step is listed under `differences` with the reason,
// checked for this host's own answer, and the document is taken on as standalone left it.

const type = diagramOf(definitionOf('dependency-graph'), registry);

interface Step { readonly do: string; readonly answer: string; readonly hunks?: readonly string[]; readonly unchanged?: boolean }
interface Rows { readonly target: string; readonly rows: readonly string[]; readonly rowsReadOnly?: readonly string[] | 'same' }
interface Recorded { readonly document: string; readonly edits: readonly Step[]; readonly menus: readonly (readonly string[])[]; readonly targets: readonly string[]; readonly rows: readonly Rows[] }
const transcript = JSON.parse(readFileSync('fixtures/tools/dependency-graph/dependency-graph.transcript.json', 'utf8')) as { readonly toolbox: readonly string[]; readonly documents: readonly Recorded[] };

const fixtures = 'fixtures/tools/dependency-graph';
const inline = 'fixtures/tools/dependency-graph-inline';

/** A document of the transcript as a source, from the copy this repository holds. */
function sourceOf(recorded: string): Source {
  const written = /^inline\/(.+)$/.exec(recorded);
  if (written) return { fileName: `${written[1]}.dgr`, text: readFileSync(`${inline}/${written[1]}.dgr`, 'utf8') };
  const fixture = /\.Tests\/Fixtures\/([^/]+)\.dgr$/.exec(recorded);
  if (fixture) return { fileName: `${fixture[1]}.dgr`, text: readFileSync(`${fixtures}/${fixture[1]}.dgr`, 'utf8') };
  return { fileName: 'services.dgr', text: readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8') };
}

const documents = transcript.documents.filter((recorded) => (recorded.edits ?? []).length > 0).map((recorded) => ({ name: recorded.document.split('/').slice(-1)[0], source: sourceOf(recorded.document), recorded }));

/** The canvas units of a row (the definition's `rows` axis). */
const rowHeight = 60;

// ---- lines, as the transcript counts them ----

// Standalone's files end their lines with CRLF and this repository's copies with LF: lines are compared without their endings' CR.
const lf = (text: string): string => text.replace(/\r\n/g, '\n');
/** A hunk of the transcript with its lines' CRs taken out, as they are written in its JSON string. */
const lfHunk = (hunk: string): string => hunk.replace(/\\r\\n/g, '\\n');
const linesOf = (text: string): string[] => lf(text).split(/(?<=\n)/).filter((line) => line !== '');

/** The changes from one text to another as the transcript writes them: `@line -removed +"inserted"`, from a longest common subsequence of lines. */
function hunksOf(before: string, after: string): string[] {
  const x = linesOf(before);
  const y = linesOf(after);
  const common: number[][] = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) common[i][j] = x[i] === y[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
  const hunks: string[] = [];
  for (let i = 0, j = 0; i < x.length || j < y.length;) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      i++;
      j++;
      continue;
    }
    const at = i;
    let removed = 0;
    let inserted = '';
    while ((i < x.length || j < y.length) && !(i < x.length && j < y.length && x[i] === y[j])) {
      if (j < y.length && (i >= x.length || common[i][j + 1] >= common[i + 1][j])) inserted += y[j++];
      else {
        i++;
        removed++;
      }
    }
    hunks.push(`@${at + 1} -${removed} +${JSON.stringify(inserted)}`);
  }
  return hunks;
}

/** A text with the transcript's hunks applied, the last first, so that each line number is the one before any of them. */
function withHunks(text: string, hunks: readonly string[]): string {
  const lines = linesOf(text);
  for (const hunk of [...hunks].reverse()) {
    const [, line, removed, inserted] = /^@(\d+) -(\d+) \+(".*")$/s.exec(hunk)!;
    lines.splice(Number(line) - 1, Number(removed), ...linesOf(JSON.parse(inserted) as string));
  }
  return lines.join('');
}

// ---- the steps, as requests ----

/** A step this host answers otherwise on purpose: why, and what it answers instead. */
interface Difference { readonly reason: string; readonly answers: (outcome: EditOutcome, step: Step) => string | undefined }

const refusedAtAll = (outcome: EditOutcome): string | undefined => (outcome.kind === 'refused' ? undefined : `The outcome is ${JSON.stringify(outcome)}, not a refusal.`);

/** What an id names in a document: a node, a dependency, or nothing this host reads as either, by the menu it offers. */
const kindOf = (source: Source, id: string): 'node' | 'dependency' | 'none' => {
  const offered = type.actions(source, [id]).map((action) => action.id);
  return offered.includes('dependencies.rename') ? 'node' : offered.includes('dependencies.relabel') ? 'dependency' : 'none';
};
/** The ids a step names: its element, or the two ends of a connection. */
const namedBy = (step: Step): readonly string[] => {
  const connect = /^execute \S+ on rel:(.*)->(.*)$/.exec(step.do);
  if (connect) return [connect[1], connect[2]].filter((end) => !end.startsWith('new:'));
  const on = /^(?:execute|commit|validate) \S+ on (\S+)/.exec(step.do) ?? /^(?:set|command move) (\S+)/.exec(step.do);
  return on && !on[1].startsWith('new:') ? [on[1]] : [];
};
const nodeEntries = ['dependencies.rename', 'dependencies.remove', 'dependencies.add-after', 'dependencies.add-below'];
const dependencyEntries = ['dependencies.relabel', 'dependencies.disconnect'];
const nodeRows = ['dependencies.x', 'dependencies.row'];
const dependencyRows = ['dependencies.from', 'dependencies.to'];

/** The node and the dependency `b16-merge-key-and-flow-entry` writes as flow mappings. */
const flowWritten = ['bbb', 'flow-dependency'];

const differences: readonly { readonly when: (step: Step, source: Source) => boolean; readonly difference: Difference }[] = [
  {
    when: (step, source) => /^execute parity\.no-such-action /.test(step.do) || namedBy(step).some((id) => kindOf(source, id) === 'none'),
    difference: { reason: 'A request that names nothing this host reads as a node or a dependency, or an action no tool type has, which no canvas, menu or row here can make: refused, in this host\'s words.', answers: refusedAtAll },
  },
  {
    when: (step, source) => {
      const entry = /^(?:execute|commit) (\S+) on (\S+)/.exec(step.do);
      const kind = entry ? kindOf(source, entry[2]) : undefined;
      return entry !== null && ((kind === 'dependency' && nodeEntries.includes(entry[1])) || (kind === 'node' && dependencyEntries.includes(entry[1])));
    },
    difference: {
      reason: 'An entry of the other kind of element\'s menu, which no menu here offers on this one: this host runs the entry of the same kind that this element\'s menu holds (Rename and Relabel, Remove and Remove dependency), where standalone refuses or changes nothing.',
      answers: () => undefined,
    },
  },
  {
    when: (step, source) => {
      const row = /^set (\S+) (\S+) = /.exec(step.do);
      const kind = row ? kindOf(source, row[1]) : undefined;
      return row !== null && ((kind === 'dependency' && nodeRows.includes(row[2])) || (kind === 'node' && dependencyRows.includes(row[2])));
    },
    difference: { reason: 'A row ADP Properties does not show for this element: refused, in this host\'s words, where standalone names the row.', answers: refusedAtAll },
  },
  {
    when: (step, source) => source.fileName === 'relations-before-elements.dgr' && /^(command move|set) shared /.test(step.do),
    difference: {
      reason: 'A node and a dependency that share an id, the dependency written first: the id names the dependency here and the node in standalone (etalii.adp #791).',
      answers: () => undefined,
    },
  },
  {
    when: (step, source) => ['b16-merge-key-and-flow-entry.dgr', 'unreadable-values.dgr'].includes(source.fileName) && step.do === 'set aaa dependencies.x = "1234.5"',
    difference: {
      reason: 'An X set in a node whose Row is reached through a merge key, or does not read: this host writes the X alone (FBL 3.4: only a slot reached through the merge is read-only), where standalone writes X and Row together, and refuses for a merged Row or writes the unreadable one as 0.',
      answers: (outcome) => (outcome.kind === 'applied' ? undefined : `The outcome is ${JSON.stringify(outcome)}, not applied.`),
    },
  },
  {
    // The steps that name them, and the two whose answer depends on `bbb` being a node: an add without a point is placed beside the nodes there are, and removing `aaa` counts and removes its dependency on `bbb` too.
    when: (step, source) => source.fileName === 'b16-merge-key-and-flow-entry.dgr' && (namedBy(step).some((id) => flowWritten.includes(id)) || step.do === 'commit dependencies.add-element on  = ""' || /^(execute|commit) dependencies\.remove on aaa/.test(step.do)),
    difference: {
      reason: 'A node and a dependency written as flow mappings: this host reads them with their members (FBL 4.3), so they are a node and a dependency it offers menus for, removes by their line and refuses a change of one value of with FBL\'s sentence, since a flow mapping is written only whole; standalone reads them without members, as nothing (etalii.adp #812).',
      answers: (outcome) => (outcome.kind === 'refused' && !/flow mapping|no longer|must be nodes|does not apply|cannot be edited/.test(outcome.sentence) ? `The refusal ${JSON.stringify(outcome.sentence)} is not one of this host's.` : undefined),
    },
  },
];

interface Ran { readonly index: number; readonly step: Step; readonly problems: readonly string[]; readonly reason?: string }

/** The end of a connection the transcript names: a node, or a point of the canvas, `new:<x>,<row>`. */
const endOf = (written: string): { readonly id: string } | { readonly x: number; readonly y: number } => {
  const point = /^new:(-?[\d.]+),(-?\d+)$/.exec(written);
  return point ? { x: Number(point[1]), y: Number(point[2]) * rowHeight } : { id: written };
};

/**
 * A step on the id '' is, in standalone, on the first node the file writes with no id or an empty one, where there is one. Such a node
 * has an id of this host's making, which a selection on the canvas carries, so the step is taken on that id.
 */
function onAnonymous(source: Source, text: string): string {
  const named = /^((?:execute|commit|validate) \S+ on )((?: = .*)?)$/s.exec(text);
  if (!named) return text;
  const anonymous = type.view(source, {}).nodes.find((node) => idWrittenAt(source.text, node.id) === '')?.id;
  return anonymous === undefined ? text : `${named[1]}${anonymous}${named[2]}`;
}

/** The id the entry of a node this host names by its line (`<type>@<line>`) is written with: '' where it has none, or an empty one. */
function idWrittenAt(text: string, id: string): string | undefined {
  const line = /@(\d+)$/.exec(id);
  if (!line) return undefined;
  const lines = text.split(/\r?\n/);
  const first = Number(line[1]) - 1;
  const indent = /^(\s*)-/.exec(lines[first] ?? '')?.[1].length ?? 0;
  for (let at = first; at < lines.length && (at === first || ((/^(\s*)/.exec(lines[at])?.[1].length ?? 0) > indent && !/^\s*$/.test(lines[at]))); at++) {
    const written = /^\s*(?:-\s*)?id:\s*(.*?)\s*$/.exec(lines[at]);
    if (written) return written[1].replace(/^(["'])(.*)\1$/, '$2');
  }
  return '';
}

/** The step's own request. */
function requestOf(step: Step, send: (request: EditRequest, confirmed?: boolean) => EditOutcome): { request: EditRequest; confirmed: boolean; check: boolean } {
  const connect = /^execute \S+ on rel:(.*)->(.*)$/.exec(step.do);
  if (connect) {
    // Standalone's gesture is drawn from the right anchor of the dependent, or from the left anchor of the dependency when the dependent is a point.
    const [from, to] = [endOf(connect[1]), endOf(connect[2])];
    if ('id' in from) return { request: { kind: 'connect', from: from.id, fromAnchor: 'right', ...('id' in to ? { to: to.id } : { to: '', toPoint: to }) }, confirmed: false, check: false };
    return { request: { kind: 'connect', from: 'id' in to ? to.id : '', fromAnchor: 'left', to: '', toPoint: from }, confirmed: false, check: false };
  }
  const at = /^execute (\S+) on new:(-?[\d.]+),(-?\d+)$/.exec(step.do);
  if (at) return { request: { kind: 'action', action: at[1], x: Number(at[2]), y: Number(at[3]) * rowHeight }, confirmed: false, check: false };
  const execute = /^execute (\S+) on (\S*)$/.exec(step.do);
  if (execute) return { request: { kind: 'action', action: execute[1], ...(execute[2] === '' ? {} : { id: execute[2] }) }, confirmed: false, check: false };
  const set = /^set (\S+) (\S+) = (.*)$/s.exec(step.do);
  if (set) return { request: { kind: 'setField', id: set[1], field: set[2], value: JSON.parse(set[3]) as string }, confirmed: false, check: false };
  const move = /^command move (\S+) to \((-?[\d.]+), (-?\d+)\)$/.exec(step.do);
  if (move) return { request: { kind: 'move', id: move[1], x: Number(move[2]), y: Number(move[3]) * rowHeight }, confirmed: false, check: false };
  const answered = /^(validate|commit) (\S+) on (\S*) = (.*)$/s.exec(step.do);
  if (!answered) throw new Error(`A step this test does not read: ${step.do}`);
  const [, how, action, id, raw] = answered;
  const value = JSON.parse(raw) as string;
  const check = how === 'validate';
  // Rename and Relabel are edited in place; Remove is a confirmation, with no value.
  if (action === 'dependencies.rename' || action === 'dependencies.relabel') return { request: { kind: 'rename', id, text: value }, confirmed: false, check };
  if (action === 'dependencies.remove') return { request: { kind: 'action', action, id }, confirmed: true, check };
  // An operation with a form of its own: the input box answers its one field, by the parameter the `ask` names.
  const asked = send({ kind: 'action', action, ...(id === '' ? {} : { id }) });
  const param = asked.kind === 'ask' ? asked.fields[0].param : 'value';
  return { request: { kind: 'action', action, ...(id === '' ? {} : { id }), params: { [param]: value }, ...(check ? { check: true } : {}) }, confirmed: false, check };
}

/** What the step's answer says of the outcome, or why it does not. */
function answered(step: Step, outcome: EditOutcome, check: boolean): string | undefined {
  const { answer } = step;
  const shown = JSON.stringify(outcome);
  if (check) {
    if (answer === 'accepted') return outcome.kind === 'applied' ? undefined : `The outcome is ${shown}, not accepted.`;
    return outcome.kind === 'refused' && `rejected: ${outcome.sentence}` === answer ? undefined : `The outcome is ${shown}, not ${answer}.`;
  }
  // Standalone answers ok to a request that changes nothing; this host answers with no splice.
  if (answer === 'ok') return outcome.kind === 'applied' ? undefined : `The outcome is ${shown}, not applied.`;
  if (answer.startsWith('refused: ')) return outcome.kind === 'refused' && outcome.sentence === answer.slice('refused: '.length) ? undefined : `The outcome is ${shown}, not ${answer}.`;
  const confirm = /^confirms: ContextConfirmationRequest \{ Title = (.*), Icon = .*?, Message = (.*), ConfirmLabel = (.*), Danger = (True|False) \}$/s.exec(answer);
  if (confirm) {
    const expected = { kind: 'confirm', title: confirm[1], message: confirm[2], confirmLabel: confirm[3], danger: confirm[4] === 'True' };
    return shown === JSON.stringify(expected) ? undefined : `The outcome is ${shown}, not ${JSON.stringify(expected)}.`;
  }
  const ask = /^asks: ContextInputRequest \{ Title = (.*), Icon = (.*), FieldLabel = (.*), InitialValue = (.*), ConfirmLabel = (.*), InlineLabelElementId = (\S*), CommitActionId = \S* \}$/s.exec(answer);
  if (ask) {
    // A label edited in place is opened there; any other value is asked in an input box with the form's title, icon, label, first value and button.
    const expected = ask[6] !== ''
      ? { kind: 'editInPlace', id: ask[6], multiline: false }
      : { kind: 'ask', title: ask[1], icon: ask[2], confirmLabel: ask[5], fields: [{ param: outcome.kind === 'ask' ? outcome.fields[0]?.param : '', label: ask[3], initial: ask[4] }] };
    return shown === JSON.stringify(expected) ? undefined : `The outcome is ${shown}, not ${JSON.stringify(expected)}.`;
  }
  return `An answer this test does not read: ${answer}`;
}

/** The ids a document holds, as its `id:` keys write them. */
const idsOf = (text: string): Set<string> => new Set([...text.matchAll(/^\s*-?\s*id:\s*(\S+)\s*$/gm)].map((found) => found[1]));

/** Runs a document's recorded edit sequence, each step on the text the one before left. */
function run(start: Source, record: Recorded): readonly Ran[] {
  let source = start;
  // The ids this host minted, by the name the transcript gives them, and the reverse.
  const minted = new Map<string, string>();
  const named = new Map<string, string>();
  const asTranscript = (text: string): string => text.replace(/[\w-]+/g, (word) => named.get(word) ?? word);
  const asHere = (text: string): string => text.replace(/\{minted-\d+\}/g, (name) => {
    // An id standalone minted in a step taken on as it left the document is written here as the name without its braces.
    if (!minted.has(name)) {
      minted.set(name, name.replace(/[{}-]/g, ''));
      named.set(name.replace(/[{}-]/g, ''), name);
    }
    return minted.get(name)!;
  });
  return record.edits.map((step, index) => {
    const problems: string[] = [];
    const before = source;
    const send = (request: EditRequest, confirmed = false): EditOutcome => type.edit(source, request, {}, confirmed);
    const known = differences.find((candidate) => candidate.when(step, source))?.difference;
    try {
      const { request, confirmed, check } = requestOf({ ...step, do: onAnonymous(source, asHere(step.do)) }, send);
      const outcome = send(request, confirmed);
      const wrong = known ? known.answers(outcome, step) : answered(step, outcome, check);
      if (wrong) problems.push(wrong);
      if (!known && !check && outcome.kind === 'applied') source = { ...source, text: spliced(source.text, outcome.splices) };
    } catch (error) {
      problems.push(`It threw: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (known) {
      // Standalone's document is taken on, so that the steps after this one are held to its bytes.
      source = { ...before, text: asHere(withHunks(before.text, step.hunks ?? [])) };
      return { index: index + 1, step, problems, reason: known.reason };
    }
    // The ids this step minted take the names the transcript gives the ids its step minted, in their order.
    const had = idsOf(before.text);
    const names = [...new Set((step.hunks ?? []).flatMap((hunk) => [...hunk.matchAll(/\{minted-\d+\}/g)].map((found) => found[0])))].filter((name) => !minted.has(name));
    for (const id of idsOf(source.text)) {
      if (had.has(id) || named.has(id)) continue;
      const name = names.shift() ?? `{minted-here-${named.size + 1}}`;
      minted.set(name, id);
      named.set(id, name);
    }
    const body = hunksOf(before.text, source.text).map(asTranscript);
    const expected = (step.hunks ?? []).map(lfHunk);
    // Two ways of writing one change can be cut into hunks differently: the text they leave is what counts.
    const same = lf(asTranscript(source.text)) === lf(asTranscript(asHere(withHunks(before.text, step.hunks ?? []))));
    if (!same && JSON.stringify(body) !== JSON.stringify(expected)) problems.push(`The document's lines are not the transcript's. The transcript: ${JSON.stringify(expected)}. Here: ${JSON.stringify(body)}.`);
    // A step that went otherwise leaves standalone's document, so that each later step is held on its own.
    if (problems.length > 0) source = { ...before, text: asHere(withHunks(before.text, step.hunks ?? [])) };
    return { index: index + 1, step, problems };
  });
}

// ---- the tests ----

// The control of a row, as standalone names it.
const controls: Readonly<Record<string, string>> = { text: 'Line', multiline: 'Text', number: 'Number', choice: 'Choice', slider: 'Slider', tags: 'Tags', toggle: 'Toggle' };

/** The rows of ADP Properties for an element, as the transcript writes them. */
const rowsOf = (source: Source, id: string): readonly string[] =>
  type.fields(source, [id]).map((field) => `${field.id} | ${field.label} | ${JSON.stringify(field.value)} | ${controls[field.control]} | ${field.readOnly === undefined ? 'editable' : `read-only (${field.readOnly})`} | group ${field.group}`);

describe('the dependency graph\'s toolbox', () => {
  it('offers the transcript\'s entries, with their labels, icons and descriptions', () => {
    const entries = type.toolbox(documents[0].source).map((entry) => `${entry.label} | ${entry.icon} | ${entry.description}`);
    expect(entries).toEqual(transcript.toolbox.map((line) => { const [, label, icon, , description] = line.split(' | '); return `${label} | ${icon} | ${description}`; }));
  });
});

describe.each(documents)('$name', { timeout: 60_000 }, ({ source, recorded }) => {
  it('offers the menus the transcript records, for every node and dependency it names', () => {
    for (const line of recorded.targets) {
      const [, target, menu] = /^"(.*)" => menu #(\d+)/.exec(line)!;
      // The canvas's own menu is asked at a point and a drawn dependency by its gesture; an id that names nothing is no selection here.
      if (target.startsWith('rel:') || target.startsWith('parity:') || target.startsWith('new:') || target === '' || kindOf(source, target) === 'none') continue;
      // A node and a dependency that share an id, the dependency written first: the id names the dependency here and the node in standalone (etalii.adp #791).
      if (source.fileName === 'relations-before-elements.dgr' && target === 'shared') continue;
      // An entry written as a flow mapping is read with its members here (FBL 4.3) and without them in standalone, which offers it no menu (etalii.adp #812).
      if (source.fileName === 'b16-merge-key-and-flow-entry.dgr' && flowWritten.includes(target)) continue;
      // The menu's groups are separators of the webview's, which an action does not carry: the entries and their order are compared.
      const expected = recorded.menus[Number(menu)].map((entry) => entry.replace(/^g\d+ /, '').replace(/ \| on \(.*\)$/, ' | on'));
      const offered = type.actions(source, [target]).map((action) => `${action.id} | ${action.label} | ${action.icon ?? '-'} | ${action.shortcut ?? '-'} | ${action.enabled ? 'on' : `off (${action.disabledReason})`}`);
      expect(offered, target).toEqual(expected);
    }
  });

  it('shows the rows the transcript records, for every node and dependency it names', () => {
    for (const { target, rows } of recorded.rows) {
      if (kindOf(source, target) === 'none') continue;
      // A node and a dependency that share an id, the dependency written first: the id names the dependency here and the node in standalone (etalii.adp #791).
      if (source.fileName === 'relations-before-elements.dgr' && target === 'shared') continue;
      // `Infinity` and `NaN`, which YAML reads as text and .NET's parse as numbers: standalone places the node at them, this host reads no number and places it at 0 (etalii.adp #802).
      if (source.fileName === 'b2-numbers-read-otherwise.dgr' && (target === 'infinity' || target === 'nan')) continue;
      // X and Row are VS Code's number box, where standalone has a line of text; what is typed in either is validated as typed (docs/parity.md).
      const shown = rowsOf(source, target).map((row) => (/^dependencies\.(x|row) \|/.test(row) ? row.replace(' | Number | ', ' | Line | ') : row));
      expect(shown, target).toEqual(rows);
    }
  });

  describe('its edits', () => {
    const ran = run(source, recorded);

    it.each(ran.filter((step) => step.reason === undefined))('$index: $step.do', ({ problems }) => {
      expect(problems).toEqual([]);
    });

    it.each(ran.filter((step) => step.reason !== undefined))('$index: $step.do, which this host answers otherwise: $reason', ({ problems }) => {
      expect(problems).toEqual([]);
    });
  });
});

describe('a node made by a gesture that selects nothing', () => {
  const source: Source = { fileName: 'services.dgr', text: readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8') };

  it('is brought into view without being selected, so that a user sees what the gesture made', () => {
    const outcome = type.edit(source, { kind: 'connect', from: 'checkout-web', fromAnchor: 'right', to: '', toPoint: { x: 4000, y: 3000 } }, {}, false);
    expect(outcome.kind).toBe('applied');
    if (outcome.kind !== 'applied') return;
    const had = idsOf(source.text);
    const made = [...idsOf(spliced(source.text, outcome.splices))].filter((id) => !had.has(id));
    expect(outcome.select).toBeUndefined();
    // The gesture makes a node and the dependency on it; the node is the one shown.
    const after = spliced(source.text, outcome.splices);
    const nodes = made.filter((id) => new RegExp(`id: ${id}\\r?\\n\\s+label:`).test(after));
    expect(nodes).toHaveLength(1);
    expect(outcome.show).toBe(nodes[0]);
  });
});

// This host's binding of the dependency graph keeps no document id yet (FBL 17.2): in a workspace, its first edit is made
// without one, rather than refused for the id the load-time step would write (spec 089).
describe('a dependency graph in a workspace', () => {
  it('takes its first edit without a document id, which its binding cannot keep', () => {
    const text = readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8');
    const plain: Source = { fileName: '/w/services.dgr', text, linkPath: '/w/services.dgr' };
    const source: Source = { ...plain, links: new LinkWorkspace('/w', [type.indexed!(plain)!]) };
    const action = type.toolbox(source)[0].id;
    const outcome = type.edit(source, { kind: 'action', action, params: { label: 'Search cache' } }, {}, false);
    expect(outcome.kind).toBe('applied');
    const after = spliced(text, outcome.kind === 'applied' ? outcome.splices : []);
    expect(after).toMatch(/label: Search cache\r?\n\s+x: 0\r?\n\s+row: 0/);
    expect(after.startsWith(text.slice(0, 200))).toBe(true);
  });
});
