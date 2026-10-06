import { describe, expect, it } from 'vitest';
import { findingCodes } from '../../../src/core/fbl/finding';
import { driftUndo } from '../../../src/core/fbl/history/splicedFile';
import { PluginBody } from '../../../src/core/fbl/plugins/pluginBody';
import { bindingOf } from './support/bindings';
import { textOf, utf8 } from './support/repository';
import { TestPlugin } from './support/testPlugin';

// The host side of the plugin contract (FBL 11.3, 15.1), proved with a plugin written for the
// tests, since no plugin is part of the library. Counterparts of standalone's Plugins/PluginBody.Tests.cs.
const turtleId = 'net.etalii.adp.w3c.turtle';
const turtle = () => bindingOf('w3c-turtle.fbl', 'turtle');

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
});
