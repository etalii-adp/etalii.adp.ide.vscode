import { describe, expect, it } from 'vitest';
import { loadDocument } from '../../../src/core/fbl/documents/documentLoader';
import type { FblBinding } from '../../../src/core/fbl/documents/types';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import type { FblOptions } from '../../../src/core/fbl/model';
import { render } from '../../../src/core/fbl/planning/newText';
import { textOf, utf8 } from './support/repository';

// The bullets family (FBL 0.7 4.8, 6.3) on the cases the conformance fixtures do not hold: the kinds
// of line that are not items, columns counted with tabs, sections, and the line ending and
// indentation an edit writes. Counterparts of standalone's Bullets/BulletsFamily.Tests.cs, and of
// what its library gained for the bullets binding: the header line, unreadable types, many-valued
// word slots and a transaction of several changes.

function bindingOf(json: string, name: string): FblBinding {
  const { document, problems } = loadDocument(utf8(json));
  expect(problems.filter((problem) => problem.severity === 'error')).toEqual([]);
  return document!.bindings.get(name)!;
}

const topics = bindingOf(String.raw`{ "fbl": "0.7", "bindings": { "topics": {
  "claims": { "registrationOnly": true }, "body": { "kind": "file", "family": "bullets" }, "reader": "declared",
  "sections": [ { "name": "topics", "heading": "^Topics$" } ],
  "elements": [ {
    "name": "topic", "type": "Topic", "within": [ "topics" ], "line": "^\\[(?<id>[a-z0-9]+)\\] (?<title>.+)$",
    "id": { "from": { "group": "id" } }, "parent": { "rules": [ "topic" ], "slot": "children" },
    "attributes": { "title": { "group": "title" }, "notes": { "continuation": true } },
    "insert": { "place": "after-last", "container": "topics", "emit": "\\[{id}\\] {title}" }, "remove": {}
  } ]
} } }`, 'topics');

const open = (text: string, binding = topics, options: FblOptions = { fileName: 'plan.md' }): OpenBody => OpenBody.open(utf8(text), binding, options);

const ids = (body: OpenBody): string[] => body.model.elements.map((element) => element.id);

describe('the bullets family', () => {
  it('nests items by their marker\'s column, a tab counting four columns, with every marker', () => {
    // b's tab puts its marker at column 4, so c's at column 2 closes b and stands in a.
    const model = open('## Topics\n\n- [a] A\n\t* [b] B\n  + [c] C\n').model;
    expect(model.elements.map((element) => element.id)).toEqual(['a', 'b', 'c']);
    expect(model.find('a')!.parentId).toBeUndefined();
    expect(model.find('b')!.parentId).toBe('a');
    expect(model.find('c')!.parentId).toBe('a');
  });

  it('reads an item line inside a fence as no item', () => {
    expect(ids(open('## Topics\n\n```\n- [x] X\n```\n- [a] A\n'))).toEqual(['a']);
  });

  it('reads a line underlined with = as no heading, so the section is missing', () => {
    expect(ids(open('Topics\n======\n\n- [a] A\n'))).toEqual([]);
  });

  it('runs a section to the next heading of its level or higher, past deeper ones', () => {
    expect(ids(open('## Topics\n- [a] A\n### Detail\n- [b] B\n## Other\n- [c] C\n'))).toEqual(['a', 'b']);
  });

  it('does not look into an item nested in an item no rule reads', () => {
    expect(ids(open('## Topics\n- not a topic\n  - [b] B\n- [c] C\n'))).toEqual(['c']);
  });

  it('takes the columns before the content column off the continuation, a tab it cuts into leaving its rest', () => {
    // The content column is 2; the tab spans columns 0 to 4, so two of its columns remain as spaces.
    expect(open('## Topics\n- [a] A\n\t  indented\n  plain\n').model.find('a')!.attributes.notes).toBe('    indented\nplain');
  });

  it('writes a new item with the line ending of the line it lands on', () => {
    const body = open('## Topics\r\n\r\n- [a] A\r\n');
    expect(body.change({ kind: 'add', type: 'Topic', id: 'b', attributes: { title: 'B' } })).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('## Topics\r\n\r\n- [a] A\r\n- [b] B\r\n');
  });

  it('shifts every line that is not blank of an item moved into another by the difference in depth', () => {
    const body = open('## Topics\n- [a] A\n- [b] B\n  note\n\n  more\n');
    // b becomes a's first child, its marker at a's content column 2; the blank line stays blank.
    expect(body.change({ kind: 'move', id: 'b', parent: 'a', position: { index: 0 } })).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('## Topics\n- [a] A\n  - [b] B\n    note\n\n    more\n');
    expect(body.model.find('b')!.parentId).toBe('a');
  });

  it('refuses a move into the item\'s own descendant, and writes nothing', () => {
    const input = '## Topics\n- [a] A\n  - [b] B\n';
    const body = open(input);
    expect(body.change({ kind: 'move', id: 'a', parent: 'b', position: { index: 0 } })).toHaveProperty('refused');
    expect(textOf(body.bytes)).toBe(input);
  });

  it('plans no splice for a move to where the item stands already', () => {
    const body = open('## Topics\n- [a] A\n- [b] B\n');
    expect(body.change({ kind: 'move', id: 'b', position: { after: 'a' } })).toEqual({ planned: { splices: [] } });
  });

  describe('a move in a body whose last line has no line ending (FBL 6.3)', () => {
    const moves = (input: string, change: Parameters<OpenBody['change']>[0], output: string): void => {
      const body = open(input);
      expect(body.change(change)).toHaveProperty('planned');
      expect(textOf(body.bytes)).toBe(output);
      expect(body.undo()).toHaveProperty('done');
      expect(textOf(body.bytes)).toBe(input);
    };

    it('writes the line break before an item moved to the end, and none after it', () => {
      moves('## Topics\n- [a] A\n- [b] B', { kind: 'move', id: 'a', position: { index: 1 } }, '## Topics\n- [b] B\n- [a] A');
    });

    it('gives the last item moved away a line ending, and takes the one of the line before it', () => {
      moves('## Topics\n- [a] A\n- [b] B', { kind: 'move', id: 'b', position: { index: 0 } }, '## Topics\n- [b] B\n- [a] A');
    });

    it('keeps CRLF', () => {
      moves('## Topics\r\n- [a] A\r\n- [b] B', { kind: 'move', id: 'a', position: { index: 1 } }, '## Topics\r\n- [b] B\r\n- [a] A');
      moves('## Topics\r\n- [a] A\r\n- [b] B', { kind: 'move', id: 'b', position: { index: 0 } }, '## Topics\r\n- [b] B\r\n- [a] A');
    });

    it('moves the last item, with its continuation, across depths', () => {
      // Into the item before it, then out of it again: it stays the last item, without a final newline.
      moves('## Topics\n- [a] A\n- [b] B\n  note', { kind: 'move', id: 'b', parent: 'a', position: { index: 0 } }, '## Topics\n- [a] A\n  - [b] B\n    note');
      moves('## Topics\n- [a] A\n  - [b] B\n    note', { kind: 'move', id: 'b', position: { index: 1 } }, '## Topics\n- [a] A\n- [b] B\n  note');
      // Out of its parent to the front, and an item to the end, inside another.
      moves('## Topics\n- [a] A\n  - [b] B', { kind: 'move', id: 'b', position: { index: 0 } }, '## Topics\n- [b] B\n- [a] A');
      moves('## Topics\n- [a] A\n- [c] C\n- [b] B', { kind: 'move', id: 'a', parent: 'b', position: { index: 0 } }, '## Topics\n- [c] C\n- [b] B\n  - [a] A');
    });
  });

  it('adds an item at a position among its siblings, before the one at the index', () => {
    const body = open('## Topics\n- [a] A\n- [c] C\n');
    expect(body.change({ kind: 'add', type: 'Topic', id: 'b', attributes: { title: 'B' }, position: { before: 'c' } })).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('## Topics\n- [a] A\n- [b] B\n- [c] C\n');
  });

  it('writes a section that is missing at the end of a body without a final newline, keeping it without one', () => {
    const body = open('# Plan');
    expect(body.change({ kind: 'add', type: 'Topic', id: 'a', attributes: { title: 'A' } })).toHaveProperty('refused');
    const withCreate = bindingOf(JSON.stringify({
      fbl: '0.7',
      bindings: {
        topics: {
          claims: { registrationOnly: true }, body: { kind: 'file', family: 'bullets' }, reader: 'declared',
          sections: [{ name: 'topics', heading: '^Topics$' }],
          elements: [{
            name: 'topic', type: 'Topic', within: ['topics'], line: '^(?<id>[a-z]+): (?<title>.+)$', id: { from: { group: 'id' } },
            attributes: { title: { group: 'title' } },
            insert: { place: 'end', container: 'topics', emit: '{id}: {title}', create: { at: 'end-of-document', text: '## Topics' } },
          }],
        },
      },
    }), 'topics');
    const created = open('# Plan', withCreate);
    expect(created.change({ kind: 'add', type: 'Topic', id: 'a', attributes: { title: 'A' } })).toHaveProperty('planned');
    expect(textOf(created.bytes)).toBe('# Plan\n\n## Topics\n\n- a: A');
  });
});

describe('a bullets binding with a header, unreadable types and many-valued words', () => {
  const requirements = bindingOf(String.raw`{ "fbl": "0.7", "bindings": { "r": {
    "claims": { "registrationOnly": true }, "body": { "kind": "file", "family": "bullets" }, "reader": "declared",
    "header": { "line": "^<!-- r -->$", "required": true },
    "sections": [ { "name": "list", "heading": "^List$", "caseInsensitive": true } ],
    "elements": [
      { "name": "mark", "type": "Mark", "line": "^<!-- last: (?<last>\\S+) -->$", "attributes": { "last": { "group": "last" } },
        "insert": { "place": "after-header", "emit": "<!-- last: {last} -->" } },
      { "name": "entry", "type": "Entry", "within": [ "list" ], "line": "^(?<id>E\\d+) (?<title>.*?)(?<words>(?:[ \\t]+#\\S+)*)$",
        "id": { "from": { "group": "id" } }, "parent": { "rules": [ "entry" ] },
        "attributes": { "title": { "group": "title" }, "tags": { "group": "words", "word": "^#(?<value>\\S+)$", "empty": "remove" } },
        "insert": { "place": "end", "container": "list", "emit": "{id} {title}" }, "remove": {} },
      { "name": "other", "type": "Other", "within": [ "list" ], "line": "^.*$" }
    ]
  } } }`, 'r');
  const options: FblOptions = { fileName: 'r.md', many: (type, attribute) => type === 'Entry' && attribute === 'tags', unreadableTypes: new Set(['Other']) };
  const input = '<!-- r -->\n# List\n- E1 One #a #b\n- something else\n  - E2 Hidden\n- E3 Three\n';

  it('makes a body whose line 1 does not match a required header unreadable, and a save of it writes nothing', () => {
    const body = open(input.slice(input.indexOf('\n') + 1), requirements, options);
    expect(body.model.unreadable).toBe(true);
    expect(body.change({ kind: 'save' })).toEqual({ planned: { splices: [] } });
  });

  it('reads an entry of a type mapped as unreadable as an unreadable entry, and nothing nested in it', () => {
    const model = open(input, requirements, options).model;
    expect(model.elements.map((element) => element.id)).toEqual(['E1', 'E3']);
    expect(model.findings.map((finding) => `${finding.code}@${finding.location.line}`)).toEqual(['std.unreadableEntry@4']);
  });

  it('reads every matching word of a many-valued word slot, and writes the difference of a new list', () => {
    const body = open(input, requirements, options);
    expect(body.model.find('E1')!.attributes.tags).toEqual(['a', 'b']);
    const result = body.change({ kind: 'set', id: 'E1', attributes: { tags: ['b', 'c'] } });
    expect(result).toEqual({ planned: { splices: [
      { operation: 'remove-key', start: 26, end: 29, text: '' },
      { operation: 'insert-key', start: 32, end: 32, text: ' #c' },
    ] } });
    expect(textOf(body.bytes)).toBe('<!-- r -->\n# List\n- E1 One #b #c\n- something else\n  - E2 Hidden\n- E3 Three\n');
  });

  it('plans the changes of one transaction against the body before it, as one edit and one undo step', () => {
    const body = open(input, requirements, options);
    const result = body.changeAll([
      { kind: 'add', type: 'Mark', attributes: { last: 'E4' } },
      { kind: 'add', type: 'Entry', id: 'E4', attributes: { title: 'Four' } },
      { kind: 'set', id: 'E3', attributes: { title: 'Third' } },
    ]);
    expect(result).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('<!-- r -->\n<!-- last: E4 -->\n# List\n- E1 One #a #b\n- something else\n  - E2 Hidden\n- E3 Third\n- E4 Four\n');
    expect(body.undo()).toHaveProperty('done');
    expect(textOf(body.bytes)).toBe(input);
  });
});

describe('a transaction whose changes touch the same text (FBL 6.4)', () => {
  it('makes the sets of one element one set, the later value winning', () => {
    const body = open('## Topics\n- [a] A\n');
    const result = body.changeAll([
      { kind: 'set', id: 'a', attributes: { title: 'X' } },
      { kind: 'set', id: 'a', attributes: { title: 'Y' } },
    ]);
    expect(result).toEqual({ planned: { splices: [{ operation: 'replace-value', start: 16, end: 17, text: 'Y' }] } });
    expect(textOf(body.bytes)).toBe('## Topics\n- [a] Y\n');
  });

  it('refuses a set and a move of one item, whose splices overlap, and writes nothing', () => {
    const input = '## Topics\n- [a] A\n- [b] B\n';
    const body = open(input);
    const result = body.changeAll([
      { kind: 'set', id: 'a', attributes: { title: 'X' } },
      { kind: 'move', id: 'a', position: { index: 1 } },
    ]);
    expect(result).toEqual({ refused: 'Two changes of this edit rewrite the same text, so they cannot be made together.' });
    expect(textOf(body.bytes)).toBe(input);
    expect(body.undo()).toHaveProperty('refused');
  });
});

describe('an emit (FBL 0.7 6.2)', () => {
  it('writes \\[ and \\] as literal brackets, outside and inside an optional segment', () => {
    expect(render('\\[{done}\\] {text}[ \\[{tag}\\]]', (name) => ({ done: 'x', text: 'Task', tag: 'a' })[name])).toBe('[x] Task [a]');
    expect(render('\\[{done}\\] {text}[ \\[{tag}\\]]', (name) => ({ done: ' ', text: 'Task' })[name])).toBe('[ ] Task');
  });
});

describe('a retype in bullets (FBL 0.7 6.4)', () => {
  // A topic and a task are items of one section, each nested in either; a task is written with a
  // checkbox, and a decision has no emit.
  const plan = bindingOf(String.raw`{ "fbl": "0.7", "bindings": { "plan": {
    "claims": { "registrationOnly": true }, "body": { "kind": "file", "family": "bullets" }, "reader": "declared",
    "sections": [ { "name": "plan", "heading": "^Plan$" } ],
    "elements": [
      { "name": "task", "type": "Task", "within": [ "plan" ], "line": "^\\[(?<done>[ x])\\] (?<id>[a-z0-9]+): (?<title>.+)$",
        "id": { "from": { "group": "id" } }, "parent": { "rules": [ "topic", "task" ], "slot": "children" },
        "attributes": { "title": { "group": "title" }, "done": { "group": "done", "default": " " }, "notes": { "continuation": true } },
        "insert": { "place": "end", "container": "plan", "emit": "\\[{done}\\] {id}: {title}" }, "remove": {} },
      { "name": "topic", "type": "Topic", "within": [ "plan" ], "line": "^(?<id>[a-z0-9]+): (?<title>.+)$",
        "id": { "from": { "group": "id" } }, "parent": { "rules": [ "topic", "task" ], "slot": "children" },
        "attributes": { "title": { "group": "title" }, "notes": { "continuation": true } },
        "insert": { "place": "end", "container": "plan", "emit": "{id}: {title}" }, "remove": {} },
      { "name": "decision", "type": "Decision", "within": [ "plan" ], "line": "^! (?<id>[a-z0-9]+)$",
        "id": { "from": { "group": "id" } }, "insert": { "place": "end", "container": "plan" }, "remove": {} }
    ]
  } } }`, 'plan');
  const input = '## Plan\n\n- a: Alpha\n  why it matters\n  - b: Beta\n- c: Gamma\n';

  it('is one re-emit-line of the item\'s text from the new rule\'s emit, keeping its continuation and nested items', () => {
    const body = open(input, plan);
    const result = body.change({ kind: 'retype', id: 'a', type: 'Task', attributes: { title: 'Alpha', done: 'x' } });

    // Only the text after the marker is written again; the note and b stay where they are, and b stays a's child.
    expect(result).toEqual({ planned: { splices: [{ operation: 're-emit-line', start: 11, end: 19, text: '[x] a: Alpha' }] } });
    expect(textOf(body.bytes)).toBe('## Plan\n\n- [x] a: Alpha\n  why it matters\n  - b: Beta\n- c: Gamma\n');
    expect(body.model.find('a')!.type).toBe('Task');
    expect(body.model.find('a')!.attributes.notes).toBe('why it matters');
    expect(body.model.find('b')!.parentId).toBe('a');
    expect(body.model.findings).toEqual([]);

    // It is one step of the history.
    expect(body.undo()).toEqual({ done: [{ operation: 're-emit-line', start: 11, end: 23, text: 'a: Alpha' }] });
    expect(textOf(body.bytes)).toBe(input);
  });

  it('writes an attribute the retype does not give by its default, and the item\'s own id', () => {
    const body = open(input, plan);
    expect(body.change({ kind: 'retype', id: 'c', type: 'Task', attributes: { title: 'Gamma' } })).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('## Plan\n\n- a: Alpha\n  why it matters\n  - b: Beta\n- [ ] c: Gamma\n');
  });

  it('is refused, writing nothing, when the new type\'s rule has no emit', () => {
    const body = open(input, plan);
    const result = body.change({ kind: 'retype', id: 'c', type: 'Decision', attributes: {} });
    expect(result).toEqual({ refused: 'This file\'s binding cannot change an element\'s type; only a persistence plugin can.' });
    expect(textOf(body.bytes)).toBe(input);
  });

  it('is refused when no rule of the new type can stand in the item\'s parent', () => {
    const body = open(input, plan);
    expect(body.change({ kind: 'retype', id: 'b', type: 'Decision', attributes: {} })).toHaveProperty('refused');
    expect(textOf(body.bytes)).toBe(input);
  });
});

describe('a map in a rule with caseInsensitive (FBL 0.7 5.2)', () => {
  const notes = bindingOf(String.raw`{ "fbl": "0.7", "bindings": { "notes": {
    "claims": { "registrationOnly": true }, "body": { "kind": "file", "family": "bullets" }, "reader": "declared",
    "sections": [ { "name": "notes", "heading": "^Notes$" } ],
    "elements": [ { "name": "note", "type": "Note", "within": [ "notes" ], "caseInsensitive": true,
      "line": "^(?<id>n\\d+) (?<kind>question|idea): (?<text>.+)$", "id": { "from": { "group": "id" } },
      "attributes": { "kind": { "group": "kind", "map": { "Question": "Question", "Idea": "Idea" } }, "text": { "group": "text" } },
      "insert": { "place": "end", "container": "notes", "emit": "{id} {kind}: {text}" }, "remove": {} } ]
  } } }`, 'notes');
  const input = '## Notes\n- n1 question: Why?\n';

  it('matches a wire value to a key ignoring case, and keeps it as written when the value does not change', () => {
    const body = open(input, notes);
    expect(body.model.find('n1')!.attributes.kind).toBe('Question');
    expect(body.change({ kind: 'set', id: 'n1', attributes: { kind: 'Question', text: 'How?' } })).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('## Notes\n- n1 question: How?\n');
  });

  it('writes the first key of a new value', () => {
    const body = open(input, notes);
    expect(body.change({ kind: 'set', id: 'n1', attributes: { kind: 'Idea' } })).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('## Notes\n- n1 Idea: Why?\n');
  });
});
