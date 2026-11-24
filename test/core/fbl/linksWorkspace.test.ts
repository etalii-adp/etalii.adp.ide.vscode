import { describe, expect, it } from 'vitest';
import { linkText } from '../../../src/core/fbl/links/link';
import { conformance, root, theWorkspace } from './support/linksWorkspace';

// The conformance fixture of FBL 0.23 section 17, `specifications/fbl/fixtures/links-workspace/` of etalii.adp
// (spec 089): its folder is one workspace, and every link its documents hold resolves, or is reported, and is
// rewritten by load-time validation as `conformance.json` says. The counterpart of the desktop host's
// `adp-links/tests/links_workspace.rs`.

describe('the links workspace (FBL 17)', () => {
  it('reads as documents without an id only those the fixture lists', () => {
    const workspace = theWorkspace();
    const without = workspace.documents.filter((document) => document.documentId === undefined).map((document) => workspace.display(document.path));
    expect(without.sort()).toEqual([...conformance.withoutId].sort());
  });

  it('holds every link the fixture lists, and no other', () => {
    const workspace = theWorkspace();
    const held = workspace.documents.flatMap((document) => document.links.map((link) => `${workspace.display(document.path)} at ${link.holder}: ${link.text}`));
    const listed = conformance.links.map((entry) => `${entry.in} at ${entry.at}: ${entry.link}`);
    expect([...new Set(held)].sort()).toEqual([...new Set(listed)].sort());
  });

  it.each(conformance.links.map((entry) => [`${entry.in} at ${entry.at}: ${entry.case}`, entry] as const))('%s', (_, entry) => {
    const workspace = theWorkspace();
    const { resolved, finding } = workspace.resolve(entry.link);
    if (entry.finding !== undefined) {
      expect(finding?.code).toBe(entry.finding);
      if (entry.candidates) expect(finding?.candidates.map((path) => workspace.display(path))).toEqual(entry.candidates);
    } else {
      expect(finding).toBeUndefined();
      expect(workspace.display(resolved!.path)).toBe(entry.target);
      expect(resolved!.link.element?.id).toBe(entry.element);
      expect(linkText(resolved!.refreshed)).toBe(entry.after);
    }
  });

  it('finds the backlinks of a row in every kind of document', () => {
    const workspace = theWorkspace();
    const from = new Set(workspace.backlinks(`${root}/knowledge/provinces.yaml`, 'nh').map((backlink) => workspace.display(backlink.path)));
    expect(from.has('plan/release.tml')).toBe(true);
    expect(from.has('teams/services.dgr')).toBe(true);
    expect([...from].some((path) => path.startsWith('knowledge/'))).toBe(true);
  });
});
