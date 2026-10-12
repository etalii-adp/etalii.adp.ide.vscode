import { describe, expect, it } from 'vitest';
import { decode, encode } from '../../../src/core/fbl/text/utf8';
import { fromHandCoded } from '../../../src/core/frame/handCoded';
import type { HandCodedDiagramType } from '../../../src/core/frame/handCoded';
import { protocolVersion } from '../../../src/core/frame/protocol';
import type { FromCanvas, ToCanvas } from '../../../src/core/frame/protocol';
import { viewTypeOf } from '../../../src/core/frame/toolType';
import type { Claim, DiagramType, EditOutcome, EditRequest, Source, TextSplice, ViewModel } from '../../../src/core/frame/toolType';

// The frame's contract (etalii.adp spec 027, contracts/tool-type.md). The shapes are checked by
// assignment, which the type check of the tests reads; the behaviour is checked by running it.

describe('viewTypeOf', () => {
  it('derives the identifier from the origin, as the language ids in etalii.adp are', () => {
    expect(viewTypeOf({ origin: 'gartner/hypecycle-graph' })).toBe('etalii.adp.gartner.hypecycle-graph');
    expect(viewTypeOf({ origin: 'etalii/agent-behavior-modelling' })).toBe('etalii.adp.etalii.agent-behavior-modelling');
  });
});

describe('the shapes of the contract', () => {
  it('has a claim, a source with its file name and a splice', () => {
    const claim: Claim = { extensions: ['mm'], shared: false, marker: true, registrationOnly: false };
    const source: Source = { fileName: 'plan.mm', text: '<map/>', registration: '{}' };
    const splice: TextSplice = { offset: 0, length: 6, text: '<map></map>' };
    expect([claim.extensions.length, source.fileName, splice.length]).toEqual([1, 'plan.mm', 6]);
  });

  it('has the requests for reparenting, folding, pinning and opening a link', () => {
    const requests: EditRequest[] = [
      { kind: 'reparent', id: 'n2', parent: 'n1' },
      { kind: 'reparent', id: 'n2', parent: 'n1', index: 0 },
      { kind: 'fold', id: 'n1', folded: true },
      { kind: 'pin', id: 'n1', pinned: false },
      { kind: 'openLink', id: 'n1' },
      // One of spec 006's requests, which keep their shapes.
      { kind: 'rename', id: 'n1', text: 'Plan' },
    ];
    expect(requests.map(request => request.kind)).toEqual(['reparent', 'reparent', 'fold', 'pin', 'openLink', 'rename']);
  });

  it('has an applied outcome that carries splices, and the open outcome', () => {
    const outcomes: EditOutcome[] = [
      { kind: 'applied', splices: [] },
      { kind: 'applied', splices: [{ offset: 4, length: 0, text: 'a' }], registration: null, select: 'n1', editLabel: true, multiline: false },
      { kind: 'open', path: 'docs/plan.md' },
      { kind: 'refused', sentence: 'No.' },
      { kind: 'confirm', title: 'Remove', message: 'Remove it?', confirmLabel: 'Remove', danger: true },
      { kind: 'editInPlace', id: 'n1', multiline: false },
      { kind: 'showField', field: 'label' },
    ];
    // @ts-expect-error An applied outcome no longer carries the whole new text.
    const whole: EditOutcome = { kind: 'applied', text: 'a' };
    expect(outcomes.map(outcome => outcome.kind)).toEqual(['applied', 'applied', 'open', 'refused', 'confirm', 'editInPlace', 'showField']);
    expect(whole.kind).toBe('applied');
  });
});

describe('the protocol', () => {
  it('is at version 2, with a view that says the kind of its tool', () => {
    const view: ToCanvas = { v: 2, type: 'view', origin: 'freeplane/mindmap', kind: 'diagram', view: { nodes: [] }, actions: [], version: 1 };
    const table: ToCanvas = { v: 2, type: 'view', origin: 'etalii/knowledge', kind: 'designer', view: { rows: [] }, actions: [], version: 1 };
    const edit: FromCanvas = { v: 2, type: 'edit', seq: 1, request: { kind: 'fold', id: 'n1', folded: true }, version: 1 };
    expect(protocolVersion).toBe(2);
    expect([view.v, table.v, edit.v]).toEqual([protocolVersion, protocolVersion, protocolVersion]);
  });
});

// A hand-coded diagram type in the shape of spec 006: a rename gives its text as the whole new document.
const emptyView: ViewModel = { elements: [], relations: [], readOnly: false, chrome: {} };

function handCoded(extensions: readonly string[], shared: boolean): HandCodedDiagramType {
  return {
    origin: 'vendor/sample',
    displayName: 'Sample',
    extensions,
    shared,
    suggests: text => text.includes('## Behavior'),
    findings: source => [{ rule: 'sample.rule', severity: 'warning', message: source.text, line: 0 }],
    view: () => emptyView,
    toolbox: () => [{ id: 'entry', label: 'Entry', icon: 'plus', description: '' }],
    fields: () => [],
    actions: () => [],
    edit: (source, request) => {
      if (request.kind === 'rename') return { kind: 'applied', text: request.text, registration: null, select: request.id, editLabel: true, multiline: false };
      if (request.kind === 'setField') return { kind: 'applied', text: source.text };
      return { kind: 'refused', sentence: 'Not here.' };
    },
    newDocument: name => `# ${name}`,
  };
}

describe('a hand-coded diagram type as a tool type', () => {
  const own: DiagramType = fromHandCoded(handCoded(['ghg'], false));
  const shared: DiagramType = fromHandCoded(handCoded(['md', 'markdown'], true));

  it('is a diagram with the origin and the name it had', () => {
    expect([own.kind, own.origin, own.displayName]).toEqual(['diagram', 'vendor/sample', 'Sample']);
  });

  it('claims its extensions in one claim without a marker', () => {
    expect(own.claims).toEqual([{ extensions: ['ghg'], shared: false, marker: false, registrationOnly: false }]);
  });

  it('claims a shared extension for its registration only', () => {
    expect(shared.claims).toEqual([{ extensions: ['md', 'markdown'], shared: true, marker: false, registrationOnly: true }]);
  });

  it('has a file claimed when its extension is one of the claim', () => {
    expect(own.claimed('C:\\work\\trends.ghg', '')).toBe(true);
    expect(own.claimed('/work/trends.ghg', 'anything')).toBe(true);
    expect(own.claimed('/work/trends.md', '')).toBe(false);
    expect(own.claimed('/work/ghg', '')).toBe(false);
    expect(own.claimed('/work/trends.ghg.txt', '')).toBe(false);
    expect(shared.claimed('/work/notes.markdown', '')).toBe(true);
  });

  it('suggests a file by its text, as the hand-coded type did', () => {
    expect(shared.suggests('/work/notes.md', '# Agent\n\n## Behavior\n')).toBe(true);
    expect(shared.suggests('/work/notes.md', '# Notes\n')).toBe(false);
  });

  it('passes everything but an applied outcome through', () => {
    const source: Source = { fileName: 'a.ghg', text: 'body' };
    expect(own.findings(source)).toEqual([{ rule: 'sample.rule', severity: 'warning', message: 'body', line: 0 }]);
    expect(own.view(source, {})).toBe(emptyView);
    expect(own.toolbox(source)).toHaveLength(1);
    expect(own.newDocument('Plan')).toBe('# Plan');
    expect(own.edit(source, { kind: 'action', action: 'remove' }, {}, false)).toEqual({ kind: 'refused', sentence: 'Not here.' });
  });

  /** The outcome of replacing the whole text through the adapter, which has to be an applied one. */
  function applied(from: string, to: string): Extract<EditOutcome, { kind: 'applied' }> {
    const outcome = own.edit({ fileName: 'a.ghg', text: from }, { kind: 'rename', id: 'n1', text: to }, {}, false);
    if (outcome.kind !== 'applied') throw new Error(`Expected an applied outcome, got ${outcome.kind}.`);
    return outcome;
  }

  /** The splices applied to the UTF-8 bytes of a text, last first, as the extension applies them. */
  function spliced(text: string, splices: readonly TextSplice[]): string {
    let bytes = encode(text);
    for (const splice of [...splices].sort((a, b) => b.offset - a.offset)) {
      bytes = Uint8Array.from([...bytes.subarray(0, splice.offset), ...encode(splice.text), ...bytes.subarray(splice.offset + splice.length)]);
    }
    return decode(bytes);
  }

  it('keeps what an applied outcome carried beside its text', () => {
    expect(applied('one', 'two')).toMatchObject({ kind: 'applied', registration: null, select: 'n1', editLabel: true, multiline: false });
    expect(applied('one', 'two')).not.toHaveProperty('text');
  });

  it('gives an insert as one splice of no length', () => {
    const { splices } = applied('trends: []\n', 'trends: []\ninfluences: []\n');
    expect(splices).toEqual([{ offset: 11, length: 0, text: 'influences: []\n' }]);
    expect(spliced('trends: []\n', splices)).toBe('trends: []\ninfluences: []\n');
  });

  it('gives a removal as one splice of no text', () => {
    const { splices } = applied('one two three', 'one three');
    expect(splices).toHaveLength(1);
    expect(splices[0]).toMatchObject({ length: 4, text: '' });
    expect(spliced('one two three', splices)).toBe('one three');
  });

  it('gives a replacement as the one range that differs', () => {
    const { splices } = applied('name: Alpha\nx: 1\n', 'name: Beta\nx: 1\n');
    expect(splices).toEqual([{ offset: 6, length: 5, text: 'Beta' }]);
    expect(spliced('name: Alpha\nx: 1\n', splices)).toBe('name: Beta\nx: 1\n');
  });

  it('gives no splice for an unchanged text', () => {
    expect(applied('same\r\n', 'same\r\n').splices).toEqual([]);
    const outcome = own.edit({ fileName: 'a.ghg', text: 'same' }, { kind: 'setField', id: 'n1', field: 'f', value: 'v' }, {}, false);
    expect(outcome).toEqual({ kind: 'applied', splices: [] });
  });

  it('counts its offsets in UTF-8 bytes', () => {
    const from = 'naïve café: 1\n';
    const to = 'naïve café: 22\n';
    const { splices } = applied(from, to);
    // "naïve café: " is twelve characters and fourteen bytes.
    expect(splices).toEqual([{ offset: 14, length: 1, text: '22' }]);
    expect(spliced(from, splices)).toBe(to);
  });

  it('never cuts inside a character of more than one byte', () => {
    // é and è share their first byte, and the two faces share three bytes and a surrogate.
    expect(applied('café', 'cafè').splices).toEqual([{ offset: 3, length: 2, text: 'è' }]);
    expect(applied('a😀b', 'a😁b').splices).toEqual([{ offset: 1, length: 4, text: '😁' }]);
    expect(spliced('a😀b', applied('a😀b', 'a😁b').splices)).toBe('a😁b');
    expect(spliced('😀😀', applied('😀😀', '😀').splices)).toBe('😀');
    expect(spliced('日本語', applied('日本語', '日本人語').splices)).toBe('日本人語');
  });

  it('keeps the line endings of a text with CRLF', () => {
    const from = 'a: 1\r\nb: 2\r\nc: 3\r\n';
    for (const to of ['a: 1\r\nb: 20\r\nc: 3\r\n', 'a: 1\r\nc: 3\r\n', 'a: 1\r\nb: 2\r\nb2: 4\r\nc: 3\r\n', 'a: 1\r\nb: 2\r\nc: 3', 'a: 1\nb: 2\nc: 3\n']) {
      const { splices } = applied(from, to);
      expect(splices.length).toBeLessThanOrEqual(1);
      expect(spliced(from, splices)).toBe(to);
    }
  });
});
