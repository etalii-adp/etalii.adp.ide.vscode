import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeFiles } from '../../../src/core/fbl/files/nodeFiles';
import { findingCodes } from '../../../src/core/fbl/finding';
import { locateBody } from '../../../src/core/fbl/registration/bodyLocator';
import { LegacySidecar } from '../../../src/core/fbl/registration/legacySidecar';
import { OpenRegistration } from '../../../src/core/fbl/registration/openRegistration';
import { RegistrationDocument } from '../../../src/core/fbl/registration/registrationDocument';
import { bindingOf } from './support/bindings';
import { bytesOf, textOf, utf8 } from './support/repository';
import { linkFolder, skipWithoutLinks, withFolders } from './support/temporaryFolder';

// Finding the body (FBL 8.2), stale and ephemeral ids (FBL 8.5), identities (FBL 8.6) and legacy sidecars (FBL 8.7). Counterparts of
// standalone's Registration/Registration.Tests.cs.
const timeline = () => bindingOf('timeline.fbl', 'timeline');
const registrationAt = (path: string): RegistrationDocument => RegistrationDocument.read(nodeFiles.read(path)!);
/** A copied registration's bytes (fixtures/fbl/conformance/registrations). */
const copied = (name: string): Uint8Array => bytesOf('fixtures', 'fbl', 'conformance', 'registrations', name);

describe('a registration and its body', () => {
  it('the body is the sibling with the registrations base name', () => {
    withFolders(1, (folder) => {
      const registration = folder.write('plan.adp', 'generic/timeline\n');
      const body = folder.write('plan.tml', 'elements: []\n');
      const location = locateBody(registration, registrationAt(registration), timeline(), folder.path, nodeFiles);
      expect(location.path).toBe(body);
      expect(location.exists).toBe(true);
    });
  });

  it('a missing body opens as missing', () => {
    withFolders(1, (folder) => {
      const registration = folder.write('plan.adp', 'generic/timeline\nbody: gone.tml\n');
      const location = locateBody(registration, registrationAt(registration), timeline(), folder.path, nodeFiles);
      expect(location.isMissing).toBe(true);
      // Reported on the body header that names it (FBL 7.4, 8.2).
      expect(location.findings).toHaveLength(1);
      const finding = location.findings[0];
      expect(finding.code).toBe(findingCodes.missingBody);
      expect(finding.severity).toBe('error');
      expect([finding.location.file, finding.location.line, finding.location.column]).toEqual(['plan.adp', 2, 1]);
    });
  });

  it('a missing sibling body is reported on the origin line', () => {
    withFolders(1, (folder) => {
      const registration = folder.write('plan.adp', 'generic/timeline\n');
      const location = locateBody(registration, registrationAt(registration), timeline(), folder.path, nodeFiles);
      expect(location.isMissing).toBe(true);
      expect(location.findings).toHaveLength(1);
      expect(location.findings[0].code).toBe(findingCodes.missingBody);
      expect(location.findings[0].location.line).toBe(1);
    });
  });

  it('an existing body has no finding', () => {
    withFolders(1, (folder) => {
      const registration = folder.write('plan.adp', 'generic/timeline\n');
      folder.write('plan.tml', 'elements: []\n');
      const location = locateBody(registration, registrationAt(registration), timeline(), folder.path, nodeFiles);
      expect(location.findings).toEqual([]);
    });
  });

  it.each([['body: ../outside.tml\n'], ['body: /etc/passwd\n']])('a body outside the workspace is refused: %j', (header) => {
    withFolders(1, (folder) => {
      const registration = folder.write('workspace/plan.adp', `generic/timeline\n${header}`);
      const location = locateBody(registration, registrationAt(registration), timeline(), join(folder.path, 'workspace'), nodeFiles);
      expect(location.refusal).toBeDefined();
      expect(location.path).toBeUndefined();
    });
  });

  // Needs a symbolic link, which some systems refuse to make; the test is then skipped with that reason.
  it('a body reached through a link is refused', (context) => {
    skipWithoutLinks(context);
    withFolders(2, (folder, outside) => {
      outside.write('plan.tml', 'elements: []\n');
      expect(linkFolder(outside.path, join(folder.path, 'linked'))).toBeUndefined();
      const registration = folder.write('plan.adp', 'generic/timeline\nbody: linked/plan.tml\n');
      const location = locateBody(registration, registrationAt(registration), timeline(), folder.path, nodeFiles);
      expect(location.refusal).toBeDefined();
    });
  });

  it('an identity is stored in order after the layout', () => {
    const registration = OpenRegistration.open(utf8('wardley/map\r\nlayout:\r\n  a: 1 2\r\n'));
    registration.change({ kind: 'identify', key: 'Tea', id: 'c2' });
    registration.change({ kind: 'identify', key: 'Cup', id: 'c1' });
    registration.change({ kind: 'identify', key: 'Tea', id: 'c3' });
    expect(textOf(registration.bytes)).toBe('wardley/map\r\nlayout:\r\n  a: 1 2\r\nidentities:\r\n  Cup: c1\r\n  Tea: c3\r\n');
    expect(registration.document.identityMap().get('Tea')).toBe('c3');
  });

  it('a legacy layout is read for its view ignoring case', () => {
    const sidecar = LegacySidecar.open(utf8('{\n  "SystemContext": {\n    "a": { "x": 40, "y": 60.5 }\n  }\n}\n'));
    expect(sidecar.positions('systemcontext').get('a')).toEqual({ x: 40, y: 60.5 });
    expect(sidecar.positions('Containers').size).toBe(0);
  });

  it('a legacy layout is written by splices and undone', () => {
    const original = '{\n  "SystemContext": {\n    "a": {\n      "x": 40,\n      "y": 60\n    }\n  }\n}\n';
    const sidecar = LegacySidecar.open(utf8(original));
    const moved = sidecar.change((file) => file.planPlace('systemContext', 'a', 41.25, 60));
    const added = sidecar.change((file) => file.planPlace('SystemContext', 'b', 10, 20.0004));
    expect(moved).toHaveProperty('planned');
    expect(added).toHaveProperty('planned');
    // Numbers replaced in place, a new member written as the file writes them.
    expect(textOf(sidecar.bytes)).toBe('{\n  "SystemContext": {\n    "a": {\n      "x": 41.25,\n      "y": 60\n    },\n    "b": {\n      "x": 10,\n      "y": 20\n    }\n  }\n}\n');
    expect(sidecar.positions('SystemContext').get('b')).toEqual({ x: 10, y: 20 });
    expect(sidecar.undo()).toHaveProperty('done');
    expect(sidecar.undo()).toHaveProperty('done');
    expect(textOf(sidecar.bytes)).toBe(original);
  });

  it('legacy identities are read and written', () => {
    const sidecar = LegacySidecar.open(utf8('{\r\n  "Tea": "c1"\r\n}\r\n'));
    const result = sidecar.change((file) => file.planIdentify('Cup', 'c2'));
    expect(result).toHaveProperty('planned');
    expect(textOf(sidecar.bytes)).toBe('{\r\n  "Tea": "c1",\r\n  "Cup": "c2"\r\n}\r\n');
    expect(sidecar.identities().get('Cup')).toBe('c2');
  });

  it('an unreadable sidecar refuses a change and is not written', () => {
    const original = '[ "not an object" ]\n';
    const sidecar = LegacySidecar.open(utf8(original));
    const result = sidecar.change((file) => file.planPlace('SystemContext', 'a', 1, 2));
    // The refusal is the sentence a host shows (FBL 8.7).
    expect(result).toEqual({ refused: 'The layout file could not be read, so it is not written.' });
    expect(textOf(sidecar.bytes)).toBe(original);
  });

  it('the sidecar path is beside the body with its base name', () => {
    // The library has no working directory, so the body's path is given whole (docs/fbl.md).
    const path = LegacySidecar.pathFor('{base}.layout.json', resolve('x', 'bottling-mes.dsl'));
    expect(path).toBe(join(resolve('x'), 'bottling-mes.layout.json'));
  });

  it('a block is read with its name', () => {
    // Two copied registrations, one with an identities block and one with a layout block.
    const growth = RegistrationDocument.read(copied('growth.adp'));
    const roadmap = RegistrationDocument.read(copied('roadmap.adp'));
    expect(growth.identities!.name).toBe('identities');
    expect(growth.layout).toBeUndefined();
    expect(roadmap.layout!.name).toBe('layout');
    expect(roadmap.identities).toBeUndefined();
  });

  it('an ephemeral elements position is not stored', () => {
    // A copied registration with a layout block, and a reading that marks one id ephemeral.
    const bytes = copied('roadmap.adp');
    const registration = OpenRegistration.open(bytes);
    registration.isEphemeral = (id) => id === 'discovery';
    const ephemeral = registration.change({ kind: 'place', id: 'discovery', x: 130, y: 70 });
    // Refused and nothing written, while another id is still placed.
    expect(ephemeral).toHaveProperty('refused', expect.stringContaining("'discovery'"));
    expect(registration.bytes).toEqual(bytes);
    expect(registration.change({ kind: 'place', id: 'launch', x: 650, y: 120 })).toHaveProperty('planned');
    expect(textOf(registration.bytes)).toBe('generic/timeline\r\nbody: roadmap.tml\r\nlayout:\r\n  discovery: 120 60\r\n  launch: 650 120\r\n');
  });

  it('an identity the reading no longer has is removed at the next store', () => {
    // A copied registration with two identities, of which the reading still knows one.
    const registration = OpenRegistration.open(copied('growth.adp'));
    registration.knownKeys = new Set(['component Customer', 'component Tea']);
    const result = registration.change({ kind: 'identify', key: 'component Tea', id: 't1' });
    // The stale "component Web shop" entry goes in the same edit (FBL 8.6).
    expect(result).toHaveProperty('planned');
    expect(textOf(registration.bytes)).toBe('wardley/map\r\nbody: growth.owm\r\nidentities:\r\n  component Customer: 3k2m9x0q1v7b8n4c5d6f7g8h9\r\n  component Tea: t1\r\n');
    expect(registration.document.identityMap().has('component Web shop')).toBe(false);
  });
});
