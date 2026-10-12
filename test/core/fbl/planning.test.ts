import { describe, expect, it } from 'vitest';
import { loadDocument } from '../../../src/core/fbl/documents/documentLoader';
import type { FblBinding } from '../../../src/core/fbl/documents/types';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import type { ModelChange } from '../../../src/core/fbl/planning/modelChange';
import type { PlanResult } from '../../../src/core/fbl/planning/plan';
import { bindingOf } from './support/bindings';
import { textOf, utf8 } from './support/repository';

// Planning a change as splices (FBL 5.2, 5.5, 6.2, 6.3, 11.2): where a new entry goes, the changes
// a declared binding refuses or plans as a removal and an insertion, the levels of a nested mapping
// created and removed with their entries, and the yaml values a new or changed entry is written
// with. Counterparts of standalone's Planning/InsertPlacement.Tests.cs,
// Plugins/PluginOnlyChanges.Tests.cs (its plugin body is in pluginBody.test.ts),
// Yaml/YamlLevels.Tests.cs and Yaml/YamlWriting.Tests.cs.

/** A binding `t` written in a test: its family, the FBL version it declares and its element rules as JSON. */
function load(family: string, version: string, elements: string, warningsAllowed = false): FblBinding {
  const json = `{ "fbl": "${version}", "bindings": { "t": { "claims": { "extensions": [".t"] }, "body": { "kind": "file", "family": "${family}" }, "reader": "declared", "elements": ${elements} } } }`;
  const { document, problems } = loadDocument(utf8(json));
  const blocking = warningsAllowed ? problems.filter((problem) => problem.severity === 'error') : problems;
  if (!document || blocking.length > 0) throw new Error(`The inline binding does not load: ${blocking.map((problem) => `${problem.pointer}: ${problem.message}`).join('; ')}`);
  return document.bindings.get('t')!;
}

/** The operations of a planned edit's splices, in body order; none for a refusal. */
const operationsOf = (result: PlanResult): string[] => ('planned' in result ? result.planned.splices.map((splice) => splice.operation) : []);

describe('placing a new entry', () => {
  // insert.place: {before: key} (FBL 5) is implemented by no family, so every family refuses it,
  // as the lines family always did, rather than putting the new entry somewhere else.
  const families: [string, string, string][] = [
    ['lines', String.raw`{ "name": "item", "type": "Item", "line": "^item\\s+(?<id>\\S+)$", "id": { "from": { "group": "id" } }, "insert": { "place": { "before": "item" }, "emit": "item {id}" } }`, 'item a\n'],
    ['yaml', '{ "name": "item", "type": "Item", "at": "/items/*", "id": { "from": { "key": "id" } }, "insert": { "place": { "before": "id" }, "container": "/items", "keys": ["id"] } }', 'items:\n  - id: a\n'],
    ['json', '{ "name": "item", "type": "Item", "at": "/items/*", "id": { "from": { "key": "id" } }, "insert": { "place": { "before": "id" }, "container": "/items", "keys": ["id"] } }', '{ "items": [ { "id": "a" } ] }\n'],
    ['xml', String.raw`{ "name": "item", "type": "Item", "at": "/items/item", "id": { "from": { "attribute": "id" } }, "insert": { "place": { "before": "item" }, "emit": "<item id=\"{id}\"/>" } }`, '<items>\n  <item id="a"/>\n</items>\n'],
  ];

  it.each(families)('placing a new entry before a key is refused: %s', (family, element, text) => {
    const body = OpenBody.open(utf8(text), load(family, '0.1', `[${element}]`));
    expect(body.model.elements).toHaveLength(1);
    const result = body.change({ kind: 'add', type: 'Item', id: 'b', attributes: {} });
    // Refused with the lines family's sentence, and the body is untouched.
    expect(result).toEqual({ refused: `A ${family} body cannot place a new entry 'before'.` });
    expect(textOf(body.bytes)).toBe(text);
  });
});

describe('the changes only a persistence plugin can write', () => {
  // A move to another parent, a type change and an add at a position among its siblings: a
  // declared binding refuses each with a sentence, writing nothing. A move among the siblings of
  // one parent is not one of them: it is planned as a removal and an insertion of the entry's own
  // bytes (FBL 5.5).
  const timeline = 'elements:\n  - id: a\n    label: Alpha\n    start: 2026-01-01\n';
  const open = (text: string): OpenBody => OpenBody.open(utf8(text), bindingOf('timeline.fbl', 'timeline'), { fileName: 'plan.tml' });

  // An index is FBL's: counted among the new parent's children after the element was taken out (FBL 11.2).
  const pluginOnly: [string, ModelChange][] = [
    ['move to another parent', { kind: 'move', id: 'a', parent: 'a', position: { index: 0 } }],
    ['retype', { kind: 'retype', id: 'a', type: 'Period', attributes: { end: '2026-02-01' } }],
    ['add at an index', { kind: 'add', type: 'Moment', id: 'b', attributes: { label: 'Beta', start: '2026-02-01' }, position: { index: 0 } }],
  ];

  it.each(pluginOnly)('a declared binding, refuses the change, and writes nothing: %s', (_name, change) => {
    const original = utf8(timeline);
    const body = open(timeline);
    const result = body.change(change);
    expect(result).toHaveProperty('refused');
    expect((result as { refused: string }).refused).toContain('only a persistence plugin can');
    expect(body.bytes).toEqual(original);
  });

  it('a declared binding, moves an element among its siblings, carrying its bytes', () => {
    // Two moments, the second with a comment of its own above it.
    const body = open('elements:\n  - id: a\n    label: Alpha\n    start: 2026-01-01\n  # kept with b\n  - id: b\n    label: Beta\n    start: 2026-02-01\n');
    // b becomes the first: index 0 once b is taken out, as it was before.
    const result = body.change({ kind: 'move', id: 'b', position: { index: 0 } });
    // One removal and one insertion, and b's comment went with it.
    expect(result).toHaveProperty('planned');
    expect(operationsOf(result)).toEqual(['insert-entry', 'remove-entry']);
    expect(textOf(body.bytes)).toBe('elements:\n  # kept with b\n  - id: b\n    label: Beta\n    start: 2026-02-01\n  - id: a\n    label: Alpha\n    start: 2026-01-01\n');
  });

  it('a declared binding, moving an element to where it is, writes nothing', () => {
    const original = utf8(timeline);
    const body = open(timeline);
    // The only element, to the place it already has.
    const result = body.change({ kind: 'move', id: 'a', position: { index: 0 } });
    expect(result).toHaveProperty('planned');
    expect(operationsOf(result)).toEqual([]);
    expect(body.bytes).toEqual(original);
  });

  it('a declared binding, still adds without an index', () => {
    const body = open(timeline);
    const result = body.change({ kind: 'add', type: 'Moment', id: 'b', attributes: { label: 'Beta', start: '2026-02-01' } });
    expect(result).toHaveProperty('planned');
    expect(textOf(body.bytes)).toContain('Beta');
  });
});

describe('the levels of a nested mapping', () => {
  // FBL 0.4 for the cases the conformance fixtures do not reach: a key written into a child
  // mapping that exists (FBL 5.2), a level that is there with nothing under it, a level emptied by
  // a value that is removed, and a missing level that a * names (FBL 6.2).
  const binding = (): FblBinding => load('yaml', '0.4', `[{
      "name": "doc", "type": "Doc", "at": "/",
      "attributes": {
        "shown": { "key": "shown", "child": "view", "create": { "at": "end" } },
        "mode": { "key": "mode", "child": "view/options", "empty": "remove", "create": { "at": "end" } }
      }
    },
    {
      "name": "pin", "type": "Pin", "at": "/view/pins/*", "id": { "from": { "key": "id" } },
      "insert": { "place": "after-last", "container": "/view/pins", "create": { "at": "end" }, "keys": ["id"] },
      "remove": { "container": "remove-empty-levels" }
    },
    {
      "name": "mark", "type": "Mark", "at": "/groups/*/marks/*", "id": { "from": { "key": "id" } },
      "insert": { "place": "after-last", "container": "/groups/*/marks", "create": { "at": "end" }, "keys": ["id"] }
    }]`, true);

  const open = (text: string): OpenBody => OpenBody.open(utf8(text), binding());

  function set(body: OpenBody, attribute: string, value: unknown): PlanResult {
    const documents = body.model.elements.filter((element) => element.type === 'Doc');
    expect(documents).toHaveLength(1);
    return body.change({ kind: 'set', id: documents[0].id, attributes: { [attribute]: value } });
  }

  it('a key the rule binds nothing before, becomes the first key of a mapping that exists', () => {
    const body = open('title: x\nview:\n  pins:\n    - id: a\n');
    const result = set(body, 'shown', true);
    expect(result).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('title: x\nview:\n  shown: true\n  pins:\n    - id: a\n');
  });

  it('a level that is there with nothing under it, takes the key one step deeper', () => {
    const body = open('title: x\nview:\n');
    const result = set(body, 'shown', true);
    expect(result).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('title: x\nview:\n  shown: true\n');
  });

  it('every missing level of a child, is created outermost first, and goes again with its last key', () => {
    const body = open('title: x\n');
    const written = set(body, 'mode', 'wide');
    const text = textOf(body.bytes);
    const cleared = set(body, 'mode', '');
    // Both levels created with the value, and both gone with it.
    expect(written).toHaveProperty('planned');
    expect(text).toBe('title: x\nview:\n  options:\n    mode: wide\n');
    expect(cleared).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('title: x\n');
  });

  it('a level that still holds something, stays when the level under it goes', () => {
    const body = open('title: x\nview:\n  shown: true\n  pins:\n    - id: a\n');
    const result = body.change({ kind: 'remove', id: 'a' });
    // pins goes with its last entry; view keeps its other key.
    expect(result).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('title: x\nview:\n  shown: true\n');
  });

  it('a missing level a star names, gives no key to write, so the insert is refused', () => {
    const body = open('title: x\n');
    const result = body.change({ kind: 'add', type: 'Mark', id: 'm', attributes: {} });
    expect(result).toHaveProperty('refused');
    expect(textOf(body.bytes)).toBe('title: x\n');
  });
});

describe('writing yaml values', () => {
  // FBL 6.3 for values a graph of dated items writes: a flow list whose items need quoting in a
  // flow collection, a multi-line string in a new entry nested in a sequence, a string that starts
  // with - written plain where it can be, an empty value an attribute keeps, and a container
  // created before a key that is not there.
  const binding = (): FblBinding => load('yaml', '0.1', `[{
      "name": "item", "type": "Item", "at": "/items/*", "id": { "from": { "key": "id" } },
      "attributes": {
        "tags": { "key": "tags", "style": "flow" },
        "text": { "key": "text", "style": "literal" },
        "note": { "key": "note", "empty": "keep" },
        "month": { "key": "month", "style": "plain" }
      },
      "insert": { "place": "after-last", "container": "/items", "keys": ["id", "text", "note", "month", "tags"] },
      "remove": {}
    },
    {
      "name": "other", "type": "Other", "at": "/others/*", "id": { "from": { "key": "id" } },
      "insert": { "place": "after-last", "container": "/others", "create": { "at": { "before": "items" } }, "keys": ["id"] }
    }]`);

  const open = (text: string): OpenBody => OpenBody.open(utf8(text), binding());

  it('a flow list item that a flow collection would split is quoted', () => {
    const body = open('items:\n  - id: a\n    tags: [x]\n');
    const result = body.change({ kind: 'set', id: 'a', attributes: { tags: ['energy', 'a, b', 'c:d', '[x]'] } });
    // Written, and read back as the same four tags rather than as more, fewer or other ones.
    expect(result).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('items:\n  - id: a\n    tags: [energy, "a, b", "c:d", "[x]"]\n');
    expect(body.model.elements[0].attributes.tags).toEqual(['energy', 'a, b', 'c:d', '[x]']);
  });

  it('a multi line string in a new nested entry is indented under its key', () => {
    const body = open('items:\n  - id: a\n    text: one\n');
    const result = body.change({ kind: 'add', type: 'Item', id: 'b', attributes: { text: 'Two\nlines' } });
    // The block's lines sit one step deeper than "text", so the body still reads.
    expect(result).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('items:\n  - id: a\n    text: one\n  - id: b\n    text: |-\n      Two\n      lines\n');
    expect(body.model.unreadable).toBe(false);
    expect(body.model.elements[1].attributes.text).toBe('Two\nlines');
  });

  it('a value starting with a dash keeps its plain style', () => {
    const body = open('items:\n  - id: a\n    text: -100-01\n');
    const result = body.change({ kind: 'set', id: 'a', attributes: { text: '-3200-01' } });
    // "-3200-01" reads back as that string in plain style, so the style it had is kept.
    expect(result).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('items:\n  - id: a\n    text: -3200-01\n');
    expect(body.model.elements[0].attributes.text).toBe('-3200-01');
  });

  it('a value starting with a dash is written plain when the attribute asks for plain', () => {
    const body = open('items:\n  - id: a\n');
    const result = body.change({ kind: 'set', id: 'a', attributes: { month: '-3200-01' } });
    expect(result).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('items:\n  - id: a\n    month: -3200-01\n');
    expect(body.model.elements[0].attributes.month).toBe('-3200-01');
  });

  it('a value that a dash would make a list item is still quoted', () => {
    const body = open('items:\n  - id: a\n');
    const result = body.change({ kind: 'set', id: 'a', attributes: { month: '- 5' } });
    expect(result).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('items:\n  - id: a\n    month: "- 5"\n');
  });

  it('an empty value that the attribute keeps is written in a new entry', () => {
    const body = open('items:\n  - id: a\n');
    const result = body.change({ kind: 'add', type: 'Item', id: 'b', attributes: { note: '', text: '' } });
    // "note" says keep, and "text" says nothing, which keeps a string too (FBL 0.6, section 6.2:
    // an insert follows a set's defaults, as the insert-empty-yaml fixture's `undeclared` does).
    // Standalone's test, written before FBL 0.6, has "text" left out.
    expect(result).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('items:\n  - id: a\n  - id: b\n    text: ""\n    note: ""\n');
  });

  it('a container created before a key that is not there is created at the end', () => {
    const body = open('top: 1\n');
    const result = body.change({ kind: 'add', type: 'Other', id: 'o', attributes: {} });
    expect(result).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('top: 1\nothers:\n  - id: o\n');
  });

  it('removing the last entry of a body without a final newline keeps it without', () => {
    const body = open('items:\n  - id: a\n  - id: b');
    const result = body.change({ kind: 'remove', id: 'b' });
    expect(result).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('items:\n  - id: a');
  });
});
