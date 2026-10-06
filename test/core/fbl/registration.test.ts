import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeFiles } from '../../../src/core/fbl/files/nodeFiles';
import { locateBody } from '../../../src/core/fbl/registration/bodyLocator';
import { LegacySidecar } from '../../../src/core/fbl/registration/legacySidecar';
import { OpenRegistration } from '../../../src/core/fbl/registration/openRegistration';
import { RegistrationDocument } from '../../../src/core/fbl/registration/registrationDocument';
import { bindingOf } from './support/bindings';
import { textOf, utf8 } from './support/repository';
import { linkFolder, linkRefusal, withFolders } from './support/temporaryFolder';

// Finding the body (FBL 8.2), identities (FBL 8.6) and legacy sidecars (FBL 8.7). Counterparts of
// standalone's Registration/Registration.Tests.cs.
const timeline = () => bindingOf('timeline.fbl', 'timeline');
const registrationAt = (path: string): RegistrationDocument => RegistrationDocument.read(nodeFiles.read(path)!);

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
    const refused = linkRefusal();
    if (refused) context.skip(refused);
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
    sidecar.change((file) => file.planPlace('systemContext', 'a', 41.25, 60));
    sidecar.change((file) => file.planPlace('SystemContext', 'b', 10, 20.0004));
    // Numbers replaced in place, a new member written as the file writes them.
    expect(textOf(sidecar.bytes)).toBe('{\n  "SystemContext": {\n    "a": {\n      "x": 41.25,\n      "y": 60\n    },\n    "b": {\n      "x": 10,\n      "y": 20\n    }\n  }\n}\n');
    expect(sidecar.positions('SystemContext').get('b')).toEqual({ x: 10, y: 20 });
    expect(sidecar.undo()).toHaveProperty('done');
    expect(sidecar.undo()).toHaveProperty('done');
    expect(textOf(sidecar.bytes)).toBe(original);
  });

  it('legacy identities are read and written', () => {
    const sidecar = LegacySidecar.open(utf8('{\r\n  "Tea": "c1"\r\n}\r\n'));
    sidecar.change((file) => file.planIdentify('Cup', 'c2'));
    expect(textOf(sidecar.bytes)).toBe('{\r\n  "Tea": "c1",\r\n  "Cup": "c2"\r\n}\r\n');
    expect(sidecar.identities().get('Cup')).toBe('c2');
  });

  it('the sidecar path is beside the body with its base name', () => {
    // The library has no working directory, so the body's path is given whole (docs/fbl.md).
    const path = LegacySidecar.pathFor('{base}.layout.json', resolve('x', 'bottling-mes.dsl'));
    expect(path).toBe(join(resolve('x'), 'bottling-mes.layout.json'));
  });
});
