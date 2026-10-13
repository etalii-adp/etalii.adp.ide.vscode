import { describe, expect, it } from 'vitest';
import { loadDocument } from '../../../src/core/fbl/documents/documentLoader';
import type { FblBinding } from '../../../src/core/fbl/documents/types';
import { encode } from '../../../src/core/fbl/text/utf8';
import { claimingBinding, claimsOf, suggests } from '../../../src/core/tool/claims';
import { behaviorModelFolder, definitionOf, hypeCycleFolder } from './support';

// Which file is a tool type's (etalii.adp spec 027, FR-008, research R6; data-model.md, "Binding
// and claim"). The bindings are FBL documents written here and loaded by the library, so a claim is
// read as a copied binding's would be.

const rules = { body: { kind: 'file', family: 'yaml' }, reader: 'declared', elements: [{ name: 'item', type: 'Item', at: '/items/*' }] };
const envelope = (value: string) => ({ rootKey: 'tool', value });

function bindingsOf(bindings: Record<string, unknown>): FblBinding[] {
  const loaded = loadDocument(encode(JSON.stringify({ fbl: '0.6', bindings })));
  if (!loaded.document) throw new Error(loaded.problems.map((problem) => `${problem.pointer}: ${problem.message}`).join('\n'));
  return [...loaded.document.bindings.values()];
}

// The three kinds of claim of the data model, one binding each.
const own = bindingsOf({ own: { ...rules, claims: { extensions: ['.own'] } } });
const marked = bindingsOf({ marked: { ...rules, claims: { extensions: ['.yaml', '.yml'], shared: true, marker: envelope('example/board'), suggest: { contains: ['tool: example/board'] } } } });
const byRegistration = bindingsOf({
  chosen: { claims: { extensions: ['.md'], shared: true, registrationOnly: true, suggest: { contains: ['## Behavior'] } }, body: { kind: 'file', family: 'lines' }, reader: { plugin: 'org.example.reader' } },
});

const claimed = (bindings: readonly FblBinding[], fileName: string, text: string): boolean => claimingBinding(bindings, fileName, text) !== undefined;

describe('the claims of a tool type', () => {
  it('are one for each binding, with the extensions written without their dot', () => {
    expect(claimsOf(own)).toEqual([{ extensions: ['own'], shared: false, marker: false, registrationOnly: false }]);
    expect(claimsOf(marked)).toEqual([{ extensions: ['yaml', 'yml'], shared: true, marker: true, registrationOnly: false }]);
    expect(claimsOf(byRegistration)).toEqual([{ extensions: ['md'], shared: true, marker: false, registrationOnly: true }]);
    expect(claimsOf([...own, ...marked, ...byRegistration])).toHaveLength(3);
  });

  it('are those of the copied bindings: an extension of its own, and Markdown by registration only', () => {
    expect(claimsOf(definitionOf(hypeCycleFolder).bindings)).toEqual([{ extensions: ['ghg'], shared: false, marker: false, registrationOnly: false }]);
    expect(claimsOf(definitionOf(behaviorModelFolder).bindings)).toEqual([{ extensions: ['md'], shared: true, marker: false, registrationOnly: true }]);
  });
});

describe('a file is claimed by its extension and its marker both', () => {
  it('by the extension alone where the binding has no marker, whatever the folder and the case', () => {
    expect(claimed(own, 'C:\\work\\plan.own', '')).toBe(true);
    expect(claimed(own, '/work/PLAN.OWN', 'anything at all')).toBe(true);
    expect(claimed(own, '/work/plan.yaml', '')).toBe(false);
    expect(claimed(own, '/work/own', '')).toBe(false);
    expect(claimed(own, '/work/plan.own.txt', '')).toBe(false);
  });

  it('only with the marker where the binding has one', () => {
    expect(claimed(marked, '/work/board.yaml', 'tool: example/board\nitems: []\n')).toBe(true);
    expect(claimed(marked, '/work/board.yml', 'tool: example/board\n')).toBe(true);
    // The extension without the marker: any other YAML file of the workspace.
    expect(claimed(marked, '/work/compose.yaml', 'services: {}\n')).toBe(false);
    expect(claimed(marked, '/work/other.yaml', 'tool: example/other\n')).toBe(false);
    // The marker without the extension.
    expect(claimed(marked, '/work/board.txt', 'tool: example/board\n')).toBe(false);
    // A body that cannot be read has no marker.
    expect(claimed(marked, '/work/broken.yaml', 'tool: [example/board\n')).toBe(false);
  });

  it('has a marker hand a file of an extension of its own back, too', () => {
    const strict = bindingsOf({ strict: { ...rules, claims: { extensions: ['.own'], marker: envelope('example/own') } } });
    expect(claimsOf(strict)).toEqual([{ extensions: ['own'], shared: false, marker: true, registrationOnly: false }]);
    expect(claimed(strict, '/work/plan.own', 'tool: example/own\n')).toBe(true);
    expect(claimed(strict, '/work/plan.own', 'something else\n')).toBe(false);
  });

  it('by the extension where the claim is for a registration only: such a file is opened by choice', () => {
    expect(claimed(byRegistration, '/work/agent.md', '# Agent\n')).toBe(true);
    expect(claimed(byRegistration, '/work/agent.txt', '# Agent\n')).toBe(false);
  });
});

describe('two bindings on one extension', () => {
  const both = bindingsOf({
    boards: { ...rules, body: { kind: 'file', family: 'json' }, claims: { extensions: ['.json'], shared: true, marker: envelope('example/board') } },
    lists: { ...rules, body: { kind: 'file', family: 'json' }, claims: { extensions: ['.json', '.list'], shared: true, marker: envelope('example/list') } },
  });

  it('send each file to the binding whose marker it matches', () => {
    expect(claimingBinding(both, '/work/a.json', '{ "tool": "example/board" }')?.name).toBe('boards');
    expect(claimingBinding(both, '/work/b.json', '{ "tool": "example/list" }')?.name).toBe('lists');
    expect(claimingBinding(both, '/work/c.list', '{ "tool": "example/list" }')?.name).toBe('lists');
  });

  it('send a file to none when no marker matches', () => {
    expect(claimingBinding(both, '/work/package.json', '{ "name": "package" }')).toBeUndefined();
    expect(claimingBinding(both, '/work/c.list', '{ "tool": "example/board" }')).toBeUndefined();
  });
});

describe('a file is suggested from the binding\'s `claims.suggest`', () => {
  it('when its text holds one of the texts the binding names', () => {
    expect(suggests(byRegistration, '/work/agent.md', '# Agent\n\n## Behavior\n\n- Do: answer\n')).toBe(true);
    expect(suggests(byRegistration, '/work/notes.md', '# Notes\n')).toBe(false);
    expect(suggests(marked, '/work/board.yaml', 'tool: example/board\n')).toBe(true);
  });

  it('never for a file of another extension, nor by a binding that names no such text', () => {
    expect(suggests(byRegistration, '/work/agent.txt', '## Behavior\n')).toBe(false);
    expect(suggests(own, '/work/plan.own', '## Behavior\n')).toBe(false);
  });
});
