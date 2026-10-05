import { describe, expect, it } from 'vitest';
import { viewTypeOf } from '../../../src/core/frame/diagramType';

describe('viewTypeOf', () => {
  it('derives the identifier from the origin, as the language ids in etalii.adp are', () => {
    expect(viewTypeOf({ origin: 'gartner/hypecycle-graph' })).toBe('etalii.adp.gartner.hypecycle-graph');
    expect(viewTypeOf({ origin: 'etalii/agent-behavior-modelling' })).toBe('etalii.adp.etalii.agent-behavior-modelling');
  });
});