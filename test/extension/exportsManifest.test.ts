import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { carried } from '../../src/core/plugins/index';

// Every export a tool type carries is one ADP command, offered in every place Peter asked for on
// 2026-11-22 (etalii.adp spec 082, task T008, FR-002 to FR-003c): the Command Palette, the Explorer,
// the editor tab and the ADP menu of the editor title bar; and nothing is offered that no tool type carries.

interface Entry { readonly command?: string; readonly submenu?: string; readonly when?: string; readonly title?: string; readonly category?: string }
const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { contributes: { commands: Entry[]; menus: Record<string, Entry[]>; submenus?: { id: string; label: string }[] } };
const { commands, menus, submenus } = manifest.contributes;
const ids = (carried.exports ?? []).flatMap((logic) => logic.exports.map((offer) => offer.id));
const exportCommands = (entries: readonly Entry[]): string[] => entries.flatMap((entry) => (entry.command?.startsWith('etalii.adp.export.') ? [entry.command] : []));

describe('the commands of the exports', () => {
  it('are one ADP command per export carried, and no more', () => {
    expect(ids).toEqual(['flowPage']);
    expect(commands.filter((entry) => entry.command?.startsWith('etalii.adp.export.')).map((entry) => [entry.command, entry.title, entry.category]))
      .toEqual([['etalii.adp.export.flowPage', 'Export Flow Page', 'ADP']]);
  });

  it.each(['commandPalette', 'explorer/context', 'editor/title/context', 'etalii.adp.menu'])('are offered in %s for the files whose tool type offers them', (menu) => {
    expect(exportCommands(menus[menu] ?? [])).toEqual(ids.map((id) => `etalii.adp.export.${id}`));
    for (const entry of menus[menu].filter((candidate) => candidate.command?.startsWith('etalii.adp.export.'))) {
      expect(entry.when).toBe(`resourceExtname in etalii.adp.exports.${entry.command!.slice('etalii.adp.export.'.length)}`);
    }
  });

  it('are in the ADP menu of the title bar of every tool\'s editor', () => {
    expect(submenus).toEqual([{ id: 'etalii.adp.menu', label: 'ADP', icon: '$(layers)' }]);
    expect(menus['editor/title'].filter((entry) => entry.submenu === 'etalii.adp.menu').map((entry) => entry.when)).toEqual(['activeCustomEditorId =~ /^etalii\\.adp\\./']);
  });
});
