import { describe, expect, it } from 'vitest';
import { protocolVersion } from '../../../src/core/frame/protocol';
import type { FromCanvas, ToCanvas } from '../../../src/core/frame/protocol';
import { viewTypeOf } from '../../../src/core/frame/toolType';
import type { Claim, EditOutcome, EditRequest, Source, TextSplice } from '../../../src/core/frame/toolType';

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
