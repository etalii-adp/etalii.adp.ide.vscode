import { describe, expect, it } from 'vitest';
import { findingCodes } from '../../../src/core/fbl/finding';
import { driftUndo } from '../../../src/core/fbl/history/splicedFile';
import type { ModelChange } from '../../../src/core/fbl/planning/modelChange';
import { PluginBody } from '../../../src/core/fbl/plugins/pluginBody';
import { bindingOf } from './support/bindings';
import { textOf, utf8 } from './support/repository';
import { RecordingPlugin, TestPlugin } from './support/testPlugin';

// The host side of the plugin contract (FBL 11.3, 15.1), proved with a plugin written for the
// tests, since no plugin is part of the library. Counterparts of standalone's Plugins/PluginBody.Tests.cs
// and, for the changes a plugin body hands on, of its Plugins/PluginOnlyChanges.Tests.cs.
const turtleId = 'net.etalii.adp.w3c.turtle';
const turtle = () => bindingOf('w3c-turtle.fbl', 'turtle');

/**
 * The changes a plugin is handed as they were made (FBL 11.2): a move among siblings, a move to
 * another parent, a type change, and an add at a position among its siblings.
 */
const changes: Record<string, ModelChange> = {
  'move': { kind: 'move', id: 'a', position: { index: 0 } },
  'move to another parent': { kind: 'move', id: 'a', parent: 'a', position: { index: 0 } },
  'retype': { kind: 'retype', id: 'a', type: 'Period', attributes: { end: '2026-02-01' } },
  'add at an index': { kind: 'add', type: 'Moment', id: 'b', attributes: { label: 'Beta', start: '2026-02-01' }, position: { index: 0 } },
};

describe('a body read by a persistence plugin', () => {
  it('a missing plugin opens the body read only with a finding', () => {
    const body = PluginBody.open(utf8('ex:a ex:b ex:c .\n'), turtle(), undefined, 'a.ttl');
    expect(body.isReadOnly).toBe(true);
    expect(body.model.findings).toHaveLength(1);
    expect(body.model.findings[0].code).toBe(findingCodes.pluginMissing);
    expect(body.model.findings[0].message).toContain(turtleId);
    expect(body.change({ kind: 'remove', id: 'x' })).toHaveProperty('refused');
    expect(() => body.save(() => expect.unreachable('A read-only body is never written.'))).toThrow();
  });

  it('a plugin with another id counts as missing', () => {
    const body = PluginBody.open(utf8('x\n'), turtle(), new TestPlugin('net.example.other'));
    expect(body.isReadOnly).toBe(true);
    expect(body.model.findings.map((finding) => finding.code)).toEqual([findingCodes.pluginMissing]);
  });

  it('the plugins splices are applied recorded and undone', () => {
    const original = utf8('label a\nlabel b\n');
    const body = PluginBody.open(original, turtle(), new TestPlugin(turtleId));
    const result = body.change({ kind: 'set', id: 'line1', attributes: { label: 'renamed' } });
    // The host applied the plugin's splice and read again through the plugin.
    expect(result).toHaveProperty('planned');
    expect(textOf(body.bytes)).toBe('label renamed\nlabel b\n');
    expect(body.model.find('line1')!.attributes.label).toBe('renamed');
    expect(body.undo(utf8('drifted'))).toEqual({ refused: driftUndo });
    expect(body.undo()).toHaveProperty('done');
    expect(body.bytes).toEqual(original);
  });

  it('a plugins refusal writes nothing', () => {
    const original = utf8('label a\n');
    const body = PluginBody.open(original, turtle(), new TestPlugin(turtleId));
    const result = body.change({ kind: 'remove', id: 'line1' });
    expect(result).toEqual({ refused: 'The fake plugin removes nothing.' });
    expect(body.bytes).toEqual(original);
  });

  it('a read only bindings plugin is never asked to plan', () => {
    // The chart binding is read-only.
    const plugin = new TestPlugin('net.etalii.adp.helm.chartFolder');
    const body = PluginBody.open(utf8('label a\n'), bindingOf('helm-chart.fbl', 'chart'), plugin);
    const result = body.change({ kind: 'set', id: 'line1', attributes: { label: 'x' } });
    expect(result).toHaveProperty('refused');
    expect(plugin.plans).toBe(0);
  });

  it.each(Object.keys(changes))('a plugin body, hands the change to its plugin, as it was made: %s', (name) => {
    const plugin = new RecordingPlugin(turtleId);
    const body = PluginBody.open(utf8('label a\n'), turtle(), plugin);
    const change = changes[name];
    const result = body.plan(change);
    expect(result).toHaveProperty('planned');
    expect(plugin.received).toBe(change);
  });

  it('a plugin is asked without the args of its binding', () => {
    // FBL 11.2 gives `read` the files and `plan` the files, the last reading and the change, and nothing else.
    const plugin = new RecordingPlugin(turtleId);
    const body = PluginBody.open(utf8('label a\n'), turtle(), plugin);
    body.plan({ kind: 'remove', id: 'line1' });
    expect(Object.keys(plugin.readRequest!)).toEqual(['files']);
    expect(Object.keys(plugin.planRequest!).sort()).toEqual(['change', 'files', 'last']);
  });
});
