import { describe, expect, it } from 'vitest';
import { untitledName } from '../../src/extension/untitledName';

// The host test of etalii.adp spec 091, task T031: a second "New Timeline diagram" offered untitled.tml again and asked
// to overwrite the first (vscode #131).
describe('the name a new document is offered under', () => {
  const takenOf = (names: string[]) => (name: string) => Promise.resolve(names.includes(name));

  it('is untitled with the tool type\'s extension in an empty folder', async () => {
    expect(await untitledName('tml', takenOf([]))).toBe('untitled.tml');
  });

  it('is the first free numbered name when untitled is taken', async () => {
    expect(await untitledName('tml', takenOf(['untitled.tml']))).toBe('untitled-2.tml');
    expect(await untitledName('tml', takenOf(['untitled.tml', 'untitled-2.tml', 'untitled-4.tml']))).toBe('untitled-3.tml');
  });
});
