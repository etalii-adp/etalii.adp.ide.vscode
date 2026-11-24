import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Source } from '../../../src/core/frame/toolType';
import { plugins as registry } from '../../../src/core/plugins/index';
import type { TableRequest } from '../../../src/core/tool/tableView';
import { applied, definitionOf, designerOf, refusal, spliced } from './support';

// A gesture of the table surface that is more than one operation of its definition is one `steps`
// request (etalii.adp spec 079, research R2): its steps run one after another on what the one
// before left, and are written as one edit, so one undo takes the whole gesture back.

const type = designerOf(definitionOf('knowledge'), registry);
const example = (name: string): Source => ({ fileName: name, text: readFileSync(`examples/knowledge/${name}`, 'utf8') });
const operation = (name: string, on: readonly string[] = [], args: Readonly<Record<string, string | number | boolean>> = {}): TableRequest => ({ kind: 'operation', operation: name, on, args });
const textOf = (source: Source, request: TableRequest): string => spliced(source.text, applied(type.edit(source, request, {}, true)).splices);

describe('a gesture of several steps', () => {
  const source = example('cities.yaml');

  it('makes a new option and gives it to a row, as one edit', () => {
    const steps: TableRequest = { kind: 'steps', steps: [operation('addOption', ['p2'], { name: 'Luxembourg', colour: 'green' }), operation('setOption', ['r2'], { property: 'p2', value: '$created:0' })] };
    const text = textOf(source, steps);
    const added = textOf(source, operation('addOption', ['p2'], { name: 'Luxembourg', colour: 'green' }));
    const id = /(?<![0-9a-z])[0-9a-z]{8}(?![0-9a-z])/g;
    const known = new Set(source.text.match(id));
    const made = added.match(id)?.find((found) => !known.has(found));
    expect(made).toBeDefined();
    // The same bytes as the two operations one after the other, but for the new id.
    const twice = textOf({ ...source, text: added }, operation('setOption', ['r2'], { property: 'p2', value: made! }));
    const madeHere = text.match(id)?.find((found) => !known.has(found));
    expect(text).toBe(twice.replaceAll(made!, madeHere!));
  });

  it('refuses as a whole when a step is refused, and writes nothing', () => {
    const steps: TableRequest = { kind: 'steps', steps: [operation('setText', ['r1'], { property: 'p1', value: 'Mokum' }), operation('deleteProperty', ['p1'])] };
    expect(refusal(type.edit(source, steps, {}, true))).toBe('The title property cannot be deleted.');
  });

  it('asks the question of a step that asks before it writes anything', () => {
    const steps: TableRequest = { kind: 'steps', steps: [operation('setText', ['r1'], { property: 'p1', value: 'Mokum' }), operation('deleteProperty', ['p3'])] };
    expect(type.edit(source, steps, {}, false)).toMatchObject({ kind: 'confirm' });
    expect(textOf(source, steps)).toBe(textOf({ ...source, text: textOf(source, steps.steps[0]) }, steps.steps[1]));
  });

  it('edits cells and items in the same step', () => {
    const steps: TableRequest = { kind: 'steps', steps: [{ kind: 'cell', row: 'r2', property: 'p3', value: 536079 }, { kind: 'item', row: 'r2', property: 'p4', value: 'o4', present: true }] };
    const one = textOf(source, steps.steps[0]);
    expect(textOf(source, steps)).toBe(textOf({ ...source, text: one }, steps.steps[1]));
  });
});
