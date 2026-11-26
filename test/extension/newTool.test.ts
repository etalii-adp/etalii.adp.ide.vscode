import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { folderOfResource, newToolChoices } from '../../src/extension/newTool';

// "New ADP Tool…" in the Explorer's context menu (etalii.adp spec 092, T034's new-user check): a new user right-clicks
// where the document should go, and finds no ADP tool there unless the menu offers one.

interface Entry { readonly command?: string; readonly group?: string; readonly title?: string }
const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { contributes: { commands: Entry[]; menus: Record<string, Entry[]> } };

describe('New ADP Tool in the Explorer', () => {
  it('is in the Explorer\'s context menu, beside New File and New Folder', () => {
    expect(manifest.contributes.menus['explorer/context']).toContainEqual({ command: 'etalii.adp.newTool', group: 'navigation@10' });
    expect(manifest.contributes.commands).toContainEqual({ command: 'etalii.adp.newTool', title: 'New ADP Tool…', category: 'ADP' });
  });

  it('makes the document in the folder that was right-clicked, or in the folder of the file that was', () => {
    expect(folderOfResource('/work/plans', true)).toBe('/work/plans');
    expect(folderOfResource('/work/plans/roadmap.tml', false)).toBe('/work/plans');
    expect(folderOfResource('/roadmap.tml', false)).toBe('/');
  });

  it('offers the tool types by the name the user reads, in alphabetical order', () => {
    const choices = newToolChoices([
      { displayName: 'Timeline', command: 'etalii.adp.new.generic.timeline', extension: 'tml' },
      { displayName: 'Knowledge', command: 'etalii.adp.new.etalii.knowledge', extension: 'yaml' },
    ]);
    expect(choices.map((choice) => choice.label)).toEqual(['Knowledge', 'Timeline']);
  });
});
