import { describe, expect, it } from 'vitest';
import { elementaryCycles } from '../../../src/core/disl/cycles';

// The elementary cycles DISL 12.4's `diagram.cycles` and a plugin's cycle finder give (etalii.adp spec 081, T018, T020).

const graph = (edges: string): Map<string, string[]> => {
  const successors = new Map<string, string[]>();
  for (const [from, to] of edges.split(' ').map((edge) => edge.split('>'))) (successors.get(from) ?? successors.set(from, []).get(from)!).push(to);
  return successors;
};

describe('the elementary cycles of a graph', () => {
  it('finds each cycle once, from its earliest member, walking successors in the order given', () => {
    expect(elementaryCycles(['a', 'b', 'c'], graph('a>c a>b b>a c>a b>c c>b'), 100).cycles).toEqual([['a', 'c'], ['a', 'c', 'b'], ['a', 'b'], ['a', 'b', 'c'], ['b', 'c']]);
  });

  it('counts a vertex that is its own successor as a cycle of one, and a successor listed twice as one step', () => {
    expect(elementaryCycles(['a', 'b'], graph('a>a a>b a>b b>a'), 100).cycles).toEqual([['a'], ['a', 'b']]);
  });

  it('walks no successor outside the vertices', () => {
    expect(elementaryCycles(['a', 'b'], graph('a>ghost ghost>a a>b b>a'), 100).cycles).toEqual([['a', 'b']]);
  });

  it('stops at the bound and says that there were more, and not when there were exactly as many', () => {
    const complete = graph('a>b b>a b>c c>b a>c c>a');
    expect(elementaryCycles(['a', 'b', 'c'], complete, 2)).toEqual({ cycles: [['a', 'b'], ['a', 'b', 'c']], truncated: true });
    expect(elementaryCycles(['a', 'b', 'c'], complete, 5).truncated).toBe(false);
  });
});
