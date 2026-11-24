import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DiagramToolType, Source } from '../../../src/core/frame/toolType';
import { plugins } from '../../../src/core/plugins/index';
import { toolTypeFrom } from '../../../src/core/tool/toolTypeFrom';
import { allFolders, definitionOf } from './support';

// A document made by a "New ..." command takes its first change: a tool type that keeps its view data only
// in a registration it does not create gets one with the new document, and so does one that claims a file
// only when it is registered (FBL 8.4). A new causal loop diagram refused every variable placed on it
// before, with "'untitled.cld' has no registration, and its tool type keeps its view data only in one".
const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { contributes: { commands: { command: string }[] } };
const offered = new Set(manifest.contributes.commands.map((entry) => entry.command));
const types = [...allFolders().keys()].map((folder) => {
  const read = definitionOf(folder);
  return { folder, read, type: toolTypeFrom(read.definition, read.bindings, plugins) };
}).filter(({ type }) => offered.has(`etalii.adp.new.${type.origin.replace('/', '.')}`));
const fileNameOf = (type: (typeof types)[number]['type']): string => `untitled.${type.claims.flatMap((claim) => claim.extensions)[0]}`;
const newSource = (type: (typeof types)[number]['type']): Source => {
  const fileName = fileNameOf(type);
  const text = type.newDocument(fileName);
  const registration = type.newRegistration(text, fileName);
  return { fileName, text, ...(registration === undefined ? {} : { registration }) };
};
const unkept = /has no registration, and its tool type keeps its view data only in one/;

describe('a document made by a "New ..." command', () => {
  it('is offered for the tool types this test reads', () => {
    expect(types.map(({ folder }) => folder)).toContain('causal-loop-diagram');
  });

  it.each(types.filter(({ type }) => type.kind === 'diagram').map(({ folder, type }) => [folder, type as DiagramToolType] as const))('of %s takes every element its toolbox drops on an empty spot, and a move of each element it starts with', (_folder, type) => {
    const source = newSource(type);
    for (const entry of type.toolbox(source)) {
      const outcome = type.edit(source, { kind: 'drop', entry: entry.id, x: 40, y: 40 }, {}, false);
      if (outcome.kind === 'refused') expect(outcome.sentence).not.toMatch(unkept);
    }
    for (const node of type.view(source, {}).nodes) {
      const outcome = type.edit(source, { kind: 'move', id: node.id, x: node.box.x + 40, y: node.box.y + 40 }, {}, false);
      if (outcome.kind === 'refused') expect(outcome.sentence).not.toMatch(unkept);
    }
  });

  it('of a causal loop diagram comes with its registration, in the body\'s line ending, and a variable placed on it is kept there', () => {
    const { type } = types.find(({ folder }) => folder === 'causal-loop-diagram')!;
    const source = newSource(type);
    expect(source.registration).toBe(`${type.origin}\r\n`);
    const variable = (type as DiagramToolType).edit(source, { kind: 'drop', entry: 'causal-loop.add-variable', x: 40, y: 40 }, {}, false);
    expect(variable).toMatchObject({ kind: 'applied' });
    expect(variable.kind === 'applied' && variable.registration).toMatch(/^systems\/causal-loop-diagram\r\nlayout:\r\n {2}\S+: /);
  });

  it.each(types.filter(({ read }) => read.bindings[0].claims.registrationOnly).map(({ folder, read, type }) => [folder, read, type] as const))('of %s, whose files are its own only when registered (FBL 12.3), comes with the registration that makes it one', (_folder, _read, type) => {
    const source = newSource(type);
    expect(source.registration?.split(/\r?\n/)[0]).toBe(type.origin);
  });

  it.each(types.filter(({ read }) => !read.bindings[0].claims.registrationOnly && read.bindings[0].registration.createOnFirstPlacement).map(({ folder, type }) => [folder, type] as const))('of %s, whose binding creates its registration with the first change, comes without one', (_folder, type) => {
    expect(newSource(type).registration).toBeUndefined();
  });
});
