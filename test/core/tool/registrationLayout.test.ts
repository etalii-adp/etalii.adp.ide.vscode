import { describe, expect, it } from 'vitest';
import { layoutOf, newRegistration, withLayout } from '../../../src/core/tool/registrationLayout';
import { filesUnder, read } from '../files';

// The layout a registration keeps beside a document (FBL 8.3): the corners a user placed, read
// with `layoutOf` and written with `withLayout`.

describe('the registration', () => {
  it('is read with its layout, and every example\'s is given back byte for byte when its layout is written unchanged', () => {
    const registrations = filesUnder('examples', '.adp');
    expect(registrations.length).toBeGreaterThan(10);
    for (const path of registrations) {
      const text = read(path);
      expect(withLayout(text, layoutOf(text)), path).toBe(text);
    }
    expect(layoutOf(read('examples/agent-behavior-modelling/research-assistant/research-assistant.adp'))).toEqual({ '1.2': { x: 360, y: 160 } });
  });

  it('keeps everything above and below the block, writes entries in order, and removes an empty block', () => {
    const text = 'etalii/agent-behavior-modelling\r\nbody: agent.md\r\n\r\nlayout:\r\n  1.2: 360 160\r\n  mangled\r\nnotes: kept\r\n';
    expect(Object.entries(layoutOf(text))).toEqual([['1.2', { x: 360, y: 160 }]]);
    const written = withLayout(text, { 2: { x: 1.23456, y: 7 }, '1.10': { x: 0, y: 0 } });
    expect(written).toBe('etalii/agent-behavior-modelling\r\nbody: agent.md\r\n\r\nlayout:\r\n  1.10: 0 0\r\n  2: 1.235 7\r\n  mangled\r\nnotes: kept\r\n');
    expect(withLayout('gartner/hypecycle-graph\nbody: a.ghg\n', { x: { x: 1, y: 2 } })).toBe('gartner/hypecycle-graph\nbody: a.ghg\nlayout:\n  x: 1 2\n');
    expect(withLayout('etalii/agent-behavior-modelling\nlayout:\n  1: 0 0\n', {})).toBe('etalii/agent-behavior-modelling\n');
  });

  it('has no corner without a registration or without a block', () => {
    expect(layoutOf(undefined)).toEqual({});
    expect(layoutOf('etalii/agent-behavior-modelling\n')).toEqual({});
    expect(withLayout('etalii/agent-behavior-modelling\n', {})).toBe('etalii/agent-behavior-modelling\n');
  });

  it('starts a new registration with its origin line, and a block after a last line without an ending ends that line first', () => {
    expect(newRegistration('etalii/agent-behavior-modelling')).toBe('etalii/agent-behavior-modelling\n');
    expect(withLayout(newRegistration('etalii/agent-behavior-modelling'), { '1.1': { x: 114, y: 146 } })).toBe('etalii/agent-behavior-modelling\nlayout:\n  1.1: 114 146\n');
    expect(withLayout('gartner/hypecycle-graph\nbody: a.ghg', { x: { x: 1, y: 2 } })).toBe('gartner/hypecycle-graph\nbody: a.ghg\nlayout:\n  x: 1 2\n');
  });

  it('writes the ids in their ordinal order, numbers of three decimals at most, and what lies below a removed block is kept', () => {
    const written = withLayout('a/b\n', { '1.2': { x: 1, y: 1 }, '1.10': { x: 2, y: 2 }, '1.1.1': { x: 3, y: 3 }, 1: { x: -0.5, y: 0.0001 } });
    expect(written).toBe('a/b\nlayout:\n  1: -0.5 0\n  1.1.1: 3 3\n  1.10: 2 2\n  1.2: 1 1\n');
    expect(layoutOf(written)).toEqual({ 1: { x: -0.5, y: 0 }, '1.1.1': { x: 3, y: 3 }, '1.10': { x: 2, y: 2 }, '1.2': { x: 1, y: 1 } });
    expect(withLayout('etalii/agent-behavior-modelling\nlayout:\n  1: 0 0\nnotes: kept\n', {})).toBe('etalii/agent-behavior-modelling\nnotes: kept\n');
  });
});
