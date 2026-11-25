import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EditRequest, Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import { applied, definitionOf, diagramOf, spliced } from './support';

// The ATD conformance fixture `roadmap` of the timeline (etalii.adp `definitions/diagrams/conformance/timeline/`,
// spec 091, task T026), replayed step by step: each step's request as VS Code makes it, and the file it writes
// compared byte for byte with the one the fixture records. The fixture counts time in seconds since 1970 and the
// canvas in its own units; a gesture is given here where VS Code's canvas draws it, 20 units a day and 60 a row.
// Undo and redo are Visual Studio Code's own, held by `test/vscode/timeline.test.ts`: here they go back to the file
// the fixture records, which is the one before.

type Json = Readonly<Record<string, unknown>>;
interface Step extends Json { readonly expectFile: string; readonly select?: readonly string[]; readonly ids?: readonly string[] }

const folder = 'fixtures/tools/timeline/roadmap';
const type = diagramOf(definitionOf('timeline'), registry);
const conformance = JSON.parse(readFileSync(`${folder}/conformance.json`, 'utf8')) as { readonly inputs: { readonly body: string }; readonly steps: readonly Step[] };
const fixture = (name: string): string => readFileSync(`${folder}/${name}`, 'utf8');
const canvasOf = (seconds: number): number => (seconds / 86_400) * 20;
const source = (text: string): Source => ({ fileName: 'roadmap.tml', text });
const boxOf = (text: string, id: string): { x: number; y: number; width: number; height: number } =>
  (type.view(source(text), {}).nodes.find((node) => node.id === id)!.shape as { box: { x: number; y: number; width: number; height: number } }).box;
const rowOf = (text: string, id: string): number => Number(new RegExp(`id: ${id}\\r?\\n(?:\\s+\\w+: [^\\r\\n]*\\r?\\n)*?\\s+row: (-?\\d+)`).exec(text)?.[1] ?? 0);
const beginOf = (text: string, id: string): number => Date.parse(`${new RegExp(`id: ${id}\\r?\\n(?:\\s+\\w+: [^\\r\\n]*\\r?\\n)*?\\s+begin: (\\S+)`).exec(text)![1]}T00:00:00Z`.replace(/T(\d\d:.*)T00:00:00Z$/, 'T$1')) / 1000;

// The ids a host makes are its own: each new one, in the order it was written, takes the fixture's.
const named = (before: string, after: string, ids: readonly string[]): string => {
  const known = new Set([...before.matchAll(/id: (\S+)/g)].map((match) => match[1]));
  const made = [...after.matchAll(/id: (\S+)/g)].map((match) => match[1]).filter((id) => !known.has(id));
  return made.reduce((text, id, index) => (index < ids.length ? text.replace(`id: ${id}\r\n`, `id: ${ids[index]}\r\n`).replaceAll(`: ${id}\r\n`, `: ${ids[index]}\r\n`) : text), after);
};

// The step as VS Code is asked it, on the selection the steps before left.
function requestOf(step: Step, text: string, selected: string | undefined): { readonly request: EditRequest; readonly confirmed: boolean } {
  const id = step.select?.[0] ?? selected!;
  const action = step.action as string | undefined;
  const value = (step.args as Json | undefined)?.value as string | undefined;
  const confirmed = (step.args as Json | undefined)?.confirm === true;
  if (action === 'timeline.rename' || action === 'timeline.relabel') return { request: { kind: 'rename', id, text: value! }, confirmed };
  if (action === 'timeline.remove' || action === 'timeline.disconnect') return { request: { kind: 'action', action: 'delete', id }, confirmed };
  if (action === 'timeline.give-end') return { request: { kind: 'action', action: 'giveEnd', id, params: { end: value! } }, confirmed };
  if (action === 'timeline.remove-end') return { request: { kind: 'action', action: 'removeEnd', id }, confirmed };
  if (action === 'timeline.add-after') return { request: { kind: 'action', action: 'addAfter', id }, confirmed };
  if (action === 'timeline.add-below') return { request: { kind: 'action', action: 'addBelow', id }, confirmed };
  if (action === 'timeline.arrange') return { request: { kind: 'action', action: 'arrange' }, confirmed };
  const property = step.property as Json | undefined;
  if (property) return { request: { kind: 'setField', id: (property.element as string | undefined) ?? id, field: (property.attribute as string).replace(/^timeline\./, ''), value: property.value as string }, confirmed };
  const move = step.move as Json | undefined;
  if (move) {
    // Where the element is drawn, kept as it is placed within its day and its row.
    const element = move.element as string;
    const box = boxOf(text, element);
    const x = typeof move.dx === 'number' ? box.x + canvasOf(move.dx) : box.x - canvasOf(beginOf(text, element)) + canvasOf(move.x as number);
    const y = typeof move.dy === 'number' ? box.y + move.dy : box.y - rowOf(text, element) * 60 + (move.y as number);
    return { request: { kind: 'move', id: element, x, y }, confirmed };
  }
  const create = step.create as Json | undefined;
  if (create) {
    const at = create.at as { x: number; y: number };
    return { request: { kind: 'drop', entry: (create.type as string).replace(/^timeline\.toolbox\./, ''), x: canvasOf(at.x), y: at.y }, confirmed };
  }
  const connect = step.connect as Json | undefined;
  if (connect) return { request: { kind: 'connect', from: connect.source as string, to: connect.target as string }, confirmed };
  throw new Error(`A step this replay does not know: ${JSON.stringify(step)}`);
}

/**
 * The steps that FBL cannot write as the fixture records, each by the issue of etalii.adp it is raised in (`docs/disl-support.md`,
 * "Differences raised and not settled here"). They run, and are expected to fail until the issue is settled.
 */
const raised: Readonly<Record<number, number>> = {
  // Give it an end and Remove its end retype an element between two rules of one entry, which FBL plans as a remove and an add.
  6: 846,
  7: 846,
};

describe('the timeline, replaying the roadmap conformance fixture', () => {
  let text = fixture(conformance.inputs.body);
  let selected: string | undefined;
  conformance.steps.forEach((step, index) => {
    const title = `step ${index + 1}: ${JSON.stringify({ ...step, drawing: undefined, findings: undefined, doc: undefined })}`;
    (Object.hasOwn(raised, index + 1) ? it.fails : it)(Object.hasOwn(raised, index + 1) ? `${title}, raised in etalii.adp #${raised[index + 1]}, does not pass yet` : title, () => {
      const expected = fixture(step.expectFile);
      // Each step starts from the file the fixture records before it, so that one difference is reported where it is.
      const prior = text;
      text = expected;
      if (step.undo === true || step.redo === true) {
        // Visual Studio Code's undo and redo give back the file as it was; this replay takes the fixture's.
        return;
      }
      // A step that names no element works on the one selected last, as the standalone host keeps it.
      const { request, confirmed } = requestOf(step, prior, selected);
      selected = step.select?.[0] ?? selected;
      const outcome = applied(type.edit(source(prior), request, {}, confirmed));
      expect(named(prior, spliced(prior, outcome.splices), step.ids ?? [])).toBe(expected);
      // What the file the step leaves reports: nothing, in every step of this fixture.
      expect(type.findings(source(expected)).map((found) => found.rule)).toEqual(((step.findings ?? []) as readonly { rule: string }[]).map((found) => found.rule));
    });
  });
});

// The ATD conformance fixture `findings` of the timeline (spec 091, task T026): what reading `findings.tml` reports,
// rule, element and sentence, in the order the fixture records. The fixture leaves out the findings about ids, which
// the companion says are reported and VS Code reports ahead of the rest (etalii.adp #848): they are set apart here,
// and the whole list is expected to differ until that is settled.
describe('the timeline, reading the findings conformance fixture', () => {
  const findingsFolder = 'fixtures/tools/timeline/findings';
  const recorded = JSON.parse(readFileSync(`${findingsFolder}/conformance.json`, 'utf8')) as {
    readonly read: { readonly findings: readonly { readonly rule: string; readonly severity: string; readonly element: string; readonly message: string }[] };
  };
  const reported = type.findings({ fileName: 'findings.tml', text: readFileSync(`${findingsFolder}/findings.tml`, 'utf8') })
    .map((found) => ({ rule: found.rule, severity: found.severity, element: found.element, message: found.message }));
  const aboutIds = ['timeline.duplicate-id', 'timeline.missing-id'];

  it('reports what the fixture records, the findings about ids set apart', () => {
    expect(reported.filter((found) => !aboutIds.includes(found.rule))).toEqual(recorded.read.findings);
  });

  it('reports an id written twice and the entries without one, first, as the companion says', () => {
    expect(reported.slice(0, 3).map((found) => [found.rule, found.element])).toEqual([
      ['timeline.duplicate-id', 'moment@42'], ['timeline.missing-id', 'moment@46'], ['timeline.missing-id', 'connection@56'],
    ]);
  });

  // Raised in etalii.adp #848.
  it.fails('reports exactly what the fixture records', () => {
    expect(reported).toEqual(recorded.read.findings);
  });
});
