import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { example } from './support';

// The plug-in carries an FBL implementation that no tool uses yet (etalii.adp spec 009). It is
// reached at one place, what `activate` returns, and this test walks one of FBL's round-trip
// fixtures through it there: in a real Visual Studio Code, from the packaged plug-in, with nothing
// else installed. The same fixture, and the seven others, are walked in test/core/fbl.

interface Splice { operation: string; start: number; end: number; text: string }
type Planned = { planned: { splices: Splice[] } } | { refused: string };
type Undone = { done: Splice[] } | { refused: string };
interface Body {
  readonly bytes: Uint8Array;
  readonly model: { unreadable: boolean; elements: { id: string; type: string }[] };
  change(change: unknown): Planned;
  undo(): Undone;
}
interface Fbl {
  nodeFiles: unknown;
  loadDocumentAt(path: string, files: unknown): { document?: { bindings: Map<string, unknown> }; problems: { severity: string; message: string }[] };
  OpenBody: { open(bytes: Uint8Array, binding: unknown, options: { fileName: string }): Body };
}
interface Step {
  edit?: { save?: boolean; set?: { element: string; attributes: Record<string, unknown> }; add?: { type: string; id?: string; attributes?: Record<string, unknown>; parent?: string } };
  undo?: boolean;
  splices: Splice[];
  expect: string;
}

const conformance = (...parts: string[]): string => example('fixtures', 'fbl', 'conformance', ...parts).fsPath;

/** A fixture's value as the model has it: an integer is an int, any other number a double. */
const valueOf = (value: unknown): unknown => (typeof value === 'number' && Number.isInteger(value) ? BigInt(value) : value);
const attributesOf = (attributes: Record<string, unknown> = {}): Record<string, unknown> =>
  Object.fromEntries(Object.entries(attributes).map(([name, value]) => [name, valueOf(value)]));

function changeOf(edit: NonNullable<Step['edit']>): unknown {
  if (edit.save) return { kind: 'save' };
  if (edit.set) return { kind: 'set', id: edit.set.element, attributes: attributesOf(edit.set.attributes) };
  if (edit.add) return { kind: 'add', type: edit.add.type, id: edit.add.id, attributes: attributesOf(edit.add.attributes), parent: edit.add.parent };
  return assert.fail(`The fixture has an edit this test does not know: ${JSON.stringify(edit)}.`);
}

suite('The plug-in\'s FBL implementation', () => {
  test('walks a round-trip fixture of FBL', async () => {
    const extension = vscode.extensions.getExtension('etalii.adp');
    assert.ok(extension);
    const fbl: Fbl | undefined = (await extension.activate()).fbl;
    assert.ok(fbl, 'what the plug-in returns on activation has the FBL implementation as its member fbl');

    const loaded = fbl.loadDocumentAt(conformance('timeline.fbl'), fbl.nodeFiles);
    assert.deepStrictEqual(loaded.problems.filter((problem) => problem.severity === 'error'), []);
    const binding = loaded.document?.bindings.get('timeline');
    assert.ok(binding, 'timeline.fbl has the binding timeline');

    const fixture = JSON.parse(fs.readFileSync(conformance('fixtures', 'timeline-edits', 'fixture.json'), 'utf8')) as { input: string; read: { elements: { id: string; type: string }[] }; steps: Step[] };
    const input = new Uint8Array(fs.readFileSync(conformance('fixtures', 'timeline-edits', fixture.input)));
    const body = fbl.OpenBody.open(input, binding, { fileName: fixture.input });
    assert.strictEqual(body.model.unreadable, false);
    for (const element of fixture.read.elements) {
      assert.ok(body.model.elements.some((read) => read.id === element.id && read.type === element.type), `the reading has ${element.id} (${element.type})`);
    }

    // A save, edits and undos: after each, the splices the fixture gives and the document it gives.
    assert.ok(fixture.steps.length >= 10 && fixture.steps.some((step) => step.undo) && fixture.steps.some((step) => step.edit?.save));
    fixture.steps.forEach((step, index) => {
      const label = `step ${index + 1}`;
      let splices: Splice[];
      if (step.undo) {
        const undone = body.undo();
        assert.ok('done' in undone, `${label}: the undo was refused`);
        splices = undone.done;
      } else {
        const result = body.change(changeOf(step.edit!));
        assert.ok('planned' in result, `${label}: the change was refused`);
        splices = result.planned.splices;
      }
      assert.deepStrictEqual(splices, step.splices, `${label}: the splices`);
      assert.strictEqual(Buffer.from(body.bytes).toString('utf8'), step.expect, `${label}: the document`);
    });
  });
});
