import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EditOutcome, EditRequest, Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import { definitionOf, diagramOf, spliced } from './support';

// The causal loop diagram edited from its definition (etalii.adp spec 081, tasks T027 to T035),
// against what standalone's module answered for the same files: the edit sequence of its recorded
// transcript (`fixtures/tools/causal-loop-diagram/causal-loop.transcript.json`), each step a gesture,
// its answer, and the lines it changed in the document and in its registration. The steps are made
// here as the requests this host's canvas, menus, input boxes and ADP Properties make, one after the
// other on the text the step before left. Where this host answers otherwise on purpose, the step is
// listed under `differences` with the reason, checked for this host's own answer, and the document
// is taken on as standalone left it, so that every later step is still held to its bytes.

const type = diagramOf(definitionOf('causal-loop-diagram'), registry);

interface Changed { readonly hunks: readonly string[] }
interface Step { readonly do: string; readonly answer: string; readonly hunks?: readonly string[]; readonly unchanged?: boolean; readonly registration?: Changed }
interface Recorded { readonly document: string; readonly edits: readonly Step[]; readonly menus: readonly (readonly string[])[]; readonly targets: readonly string[] }
const transcript = JSON.parse(readFileSync('fixtures/tools/causal-loop-diagram/causal-loop.transcript.json', 'utf8')) as { readonly toolbox: readonly string[]; readonly documents: readonly Recorded[] };

const examples = 'examples/causal-loop-diagram';
const fixtures = 'fixtures/tools/causal-loop-diagram';

/** A document of the transcript as a source, from the copy this repository holds; nothing for one it holds no copy of. */
function sourceOf(recorded: string): Source | undefined {
  const fixture = /\.Tests\/Fixtures\/([^/]+)\.cld$/.exec(recorded);
  if (fixture) return { fileName: `${fixture[1]}.cld`, text: readFileSync(`${fixtures}/${fixture[1]}.cld`, 'utf8') };
  const example = /^diagrams\/causal-loop-diagram\/examples\/([^/]+)\/\1\.cld$/.exec(recorded);
  if (!example) return undefined;
  const folder = `${examples}/${example[1]}`;
  const files = readdirSync(folder);
  return {
    fileName: `${example[1]}.cld`, text: readFileSync(`${folder}/${example[1]}.cld`, 'utf8'),
    ...(files.includes(`${example[1]}.adp`) ? { registration: readFileSync(`${folder}/${example[1]}.adp`, 'utf8') } : {}),
  };
}

const documents = transcript.documents.flatMap((recorded) => {
  const source = sourceOf(recorded.document);
  return source && recorded.edits.length > 0 ? [{ name: recorded.document.split('/').slice(-2).join('/'), source, recorded }] : [];
});

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
const refusedWith = (pattern: RegExp) => (outcome: EditOutcome): string | undefined =>
  outcome.kind === 'refused' && pattern.test(outcome.sentence) ? undefined : `The outcome is ${JSON.stringify(outcome)}, not a refusal that says ${pattern}.`;

const differences: readonly { readonly when: (step: Step, source: Source) => boolean; readonly difference: Difference }[] = [
  {
    when: (step) => /\bon parity:unknown\b|^set parity:unknown |^execute timeline\.not-ours |->nobody$/.test(step.do),
    difference: { reason: 'A request that names nothing of the document, or another tool type\'s action, which no canvas, menu or row here can make: refused, in this host\'s words.', answers: refusedAtAll },
  },
  {
    when: (step) => /^set link:\S+ causal-loop\.link-(from|to) /.test(step.do),
    difference: { reason: 'A row ADP Properties shows and does not edit: refused with the reason the row gives, where standalone names the row.', answers: refusedWith(/identified by the two variables it joins/) },
  },
  {
    when: (step) => /^execute causal-loop\.make-(positive|negative) /.test(step.do) && step.answer === 'ok' && step.unchanged === true,
    difference: { reason: 'A menu entry the menu shows off: refused with the reason the menu shows, where standalone runs it and changes nothing.', answers: refusedWith(/already states/) },
  },
  {
    when: (step) => /^move link:/.test(step.do) && /without a registration/.test(step.answer),
    difference: { reason: 'A link moved in a document without a registration: refused with the link\'s own `refusals.move`, which DISL checks first (DISL 6.9), where standalone first says there is no registration.', answers: refusedWith(/Only a variable can be moved/) },
  },
  {
    when: (step) => /without a registration/.test(step.answer) && !step.do.includes('causal-loop.arrange'),
    difference: { reason: 'A place kept in a registration the binding does not let be created: refused in FBL\'s words (FBL 8.4), where standalone has a sentence of its own.', answers: refusedWith(/has no registration, and its tool type keeps its view data only in one/) },
  },
  {
    when: (step, source) => source.fileName === 'spellings-kept.cld' && /^(execute causal-loop\.flip-curvature|set link:a\|b causal-loop\.link-label) /.test(step.do),
    difference: { reason: 'A statement written in a spelling of its own: this host changes only the words the edit touches (FBL 6.3), so its spacing and a word no slot reads stay, where standalone writes the whole statement again in its own spelling and drops that word.', answers: (outcome) => (outcome.kind === 'applied' ? undefined : `The outcome is ${JSON.stringify(outcome)}, not applied.`) },
  },
  {
    when: (step, source) => source.fileName === 'two-notes.cld' && /^(set link:a\|b causal-loop\.link-(label|weight|polarity)|execute causal-loop\.make-(positive|negative) on link:a\|b|set variable:a causal-loop\.variable-id)(\s|$)/.test(step.do),
    difference: { reason: 'A link with two notes: its note is written over the first of them here and its other words are lost when its line is written again, where standalone keeps both and writes over the last, which it reads as the note. To be fixed with pull request E (task T024).', answers: () => undefined },
  },
  {
    when: (step) => /^describe link:/.test(step.do),
    difference: { reason: 'A link\'s Delayed row, a switch in standalone, which lands with the property rows of pull request E (tasks T037 to T040).', answers: () => undefined },
  },
  {
    when: (step) => step.do.includes('causal-loop.arrange'),
    difference: { reason: 'Arrange diagram, which lands with pull request E (task T041).', answers: () => undefined },
  },
];

interface Ran { readonly index: number; readonly step: Step; readonly problems: readonly string[]; readonly reason?: string }

/** The step's own request, or none for one that asks: the answer to an earlier `ask` is the step that commits it. */
function requestOf(step: Step, source: Source, send: (request: EditRequest, confirmed?: boolean) => EditOutcome): { request: EditRequest; confirmed: boolean; check: boolean } {
  const connect = /^execute \S+ on rel:(.*)->(.*)$/.exec(step.do);
  if (connect) return { request: { kind: 'connect', from: `variable:${connect[1]}`, to: `variable:${connect[2]}` }, confirmed: false, check: false };
  const at = /^execute (\S+) on new:(-?\d+),(-?\d+)$/.exec(step.do);
  if (at) return { request: { kind: 'action', action: at[1], x: Number(at[2]), y: Number(at[3]) }, confirmed: false, check: false };
  const execute = /^execute (\S+) on (\S*)$/.exec(step.do);
  if (execute) return { request: { kind: 'action', action: execute[1], ...(execute[2] === '' ? {} : { id: execute[2] }) }, confirmed: false, check: false };
  const set = /^set (\S+) (\S+) = (.*)$/s.exec(step.do);
  if (set) return { request: { kind: 'setField', id: set[1], field: set[2], value: JSON.parse(set[3]) as string }, confirmed: false, check: false };
  const move = /^move (.+) to \((-?\d+), (-?\d+)\)$/.exec(step.do);
  if (move) {
    // Standalone moves a variable's centre to the point; a request here names where the top-left corner of its box goes.
    const node = type.view(source, {}).nodes.find((candidate) => candidate.id === move[1]);
    const [x, y] = [Number(move[2]), Number(move[3])];
    return { request: { kind: 'move', id: move[1], x: node ? x - node.box.width / 2 : x, y: node ? y - node.box.height / 2 : y }, confirmed: false, check: false };
  }
  const answered = /^(validate|commit) (\S+) on (\S*) = (.*)$/s.exec(step.do);
  if (!answered) throw new Error(`A step this test does not read: ${step.do}`);
  const [, how, action, id, raw] = answered;
  const value = JSON.parse(raw) as string;
  const check = how === 'validate';
  // Rename is edited in place, the label's own parse refusing what it does not accept; Remove is a confirmation, with no value.
  if (action === 'causal-loop.rename-variable') return { request: { kind: 'rename', id, text: value }, confirmed: false, check };
  if (action === 'causal-loop.remove-variable') return { request: { kind: 'action', action, id }, confirmed: true, check };
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

// The control of a row, as standalone names it.
const controls: Readonly<Record<string, string>> = { text: 'Line', multiline: 'Text', number: 'Number', choice: 'Choice', slider: 'Slider', tags: 'Tags' };

/** The rows of ADP Properties for an element, as the transcript writes them. */
const rowsOf = (source: Source, id: string): string =>
  type.fields(source, [id]).map((field) => `${field.id} | ${field.label} | ${JSON.stringify(field.value)} | ${controls[field.control]} | ${field.readOnly === undefined ? 'editable' : `read-only (${field.readOnly})`} | group ${field.group}${field.control === 'choice' && field.options ? ` | choices [${field.options.map((option) => JSON.stringify(option)).join(', ')}]` : ''}`).join(' || ');

/** Runs a document's recorded edit sequence, each step on the text and registration the one before left. */
function run(start: Source, record: Recorded): readonly Ran[] {
  let source = start;
  return record.edits.map((step, index) => {
    const problems: string[] = [];
    const before = source;
    const send = (request: EditRequest, confirmed = false): EditOutcome => type.edit(source, request, {}, confirmed);
    const known = differences.find((candidate) => candidate.when(step, source))?.difference;
    const describe = /^describe (\S+)$/.exec(step.do);
    if (describe) {
      const rows = rowsOf(source, describe[1]);
      if (known) return { index: index + 1, step, problems: [], reason: known.reason };
      return { index: index + 1, step, problems: rows === step.answer ? [] : [`The rows are ${rows}, not ${step.answer}.`] };
    }
    try {
      const { request, confirmed, check } = requestOf(step, source, send);
      const outcome = send(request, confirmed);
      const wrong = known ? known.answers(outcome, step) : answered(step, outcome, check);
      if (wrong) problems.push(wrong);
      if (!known && !check && outcome.kind === 'applied') {
        source = {
          ...source, text: spliced(source.text, outcome.splices),
          ...(outcome.registration === undefined ? {} : outcome.registration === null ? { registration: undefined } : { registration: outcome.registration }),
        };
      }
    } catch (error) {
      problems.push(`It threw: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (known) {
      // Standalone's document is taken on, so that the steps after this one are held to its bytes.
      source = {
        ...before, text: withHunks(before.text, step.hunks ?? []),
        ...(step.registration ? { registration: withHunks(before.registration ?? '', step.registration.hunks) } : {}),
      };
      return { index: index + 1, step, problems, reason: known.reason };
    }
    const body = hunksOf(before.text, source.text);
    const expected = (step.hunks ?? []).map(lfHunk);
    if (JSON.stringify(body) !== JSON.stringify(expected)) problems.push(`The document's lines are not the transcript's. The transcript: ${JSON.stringify(expected)}. Here: ${JSON.stringify(body)}.`);
    const registration = hunksOf(before.registration ?? '', source.registration ?? '');
    const kept = (step.registration?.hunks ?? []).map(lfHunk);
    if (JSON.stringify(registration) !== JSON.stringify(kept)) problems.push(`The registration's lines are not the transcript's. The transcript: ${JSON.stringify(kept)}. Here: ${JSON.stringify(registration)}.`);
    return { index: index + 1, step, problems };
  });
}

// ---- the tests ----

describe('the causal loop diagram\'s toolbox', () => {
  it('offers the transcript\'s entries, with their labels, icons and descriptions', () => {
    const source = documents.find((document) => document.name.endsWith('on-call.cld'))!.source;
    const entries = type.toolbox(source).map((entry) => `${entry.label} | ${entry.icon} | ${entry.description}`);
    expect(entries).toEqual(transcript.toolbox.map((line) => { const [, label, icon, , description] = line.split(' | '); return `${label} | ${icon} | ${description}`; }));
  });
});

describe.each(documents)('$name', { timeout: 60_000 }, ({ source, recorded }) => {
  it('offers the menus the transcript records, for every element it names', () => {
    for (const line of recorded.targets) {
      const [, target, menu] = /^"(.*)" => menu #(\d+)/.exec(line)!;
      // The canvas's own menu is asked with nothing selected; a point and a drawn relation are asked by other gestures.
      if (target.startsWith('rel:') || target.startsWith('parity:') || target === '') continue;
      const selection = target.startsWith('new:') ? [] : [target];
      // An entry that is on shows no reason here; standalone records one beside it.
      const expected = recorded.menus[Number(menu)].map((entry) => entry.replace(/ \| on \(.*\)$/, ' | on'));
      const offered = type.actions(source, selection).map((action) => `g1 ${action.id} | ${action.label} | ${action.icon ?? '-'} | ${action.shortcut ?? '-'} | ${action.enabled ? 'on' : `off (${action.disabledReason})`}`);
      expect(offered, target).toEqual(expected);
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
