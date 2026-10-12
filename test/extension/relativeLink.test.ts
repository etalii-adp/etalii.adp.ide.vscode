import { describe, expect, it } from 'vitest';
import { relativeLink } from '../../src/extension/relativeLink';

// What a mind map stores for a picked file or folder (definitions/mindmap/mindmap.md, section 8):
// the path relative to the map file, with forward slashes, and never one outside the project.
// Every path here is the path of a URI, so it has forward slashes on every platform.
describe('The link stored for a picked file or folder', () => {
  const root = '/c:/work/project';
  const map = '/c:/work/project/docs/maps/design.mm';

  it('is the name alone for a file beside the map', () => {
    expect(relativeLink(map, '/c:/work/project/docs/maps/notes.txt', root)).toBe('notes.txt');
  });

  it('goes down into a folder under the map\'s folder', () => {
    expect(relativeLink(map, '/c:/work/project/docs/maps/parts/a b.md', root)).toBe('parts/a b.md');
  });

  it('goes up to a file elsewhere in the project', () => {
    expect(relativeLink(map, '/c:/work/project/src/core/Engine.cs', root)).toBe('../../src/core/Engine.cs');
  });

  it('names a folder without a trailing slash, however it was given', () => {
    expect(relativeLink(map, '/c:/work/project/src/core/', root)).toBe('../../src/core');
    expect(relativeLink(map, '/c:/work/project/src/core', root)).toBe('../../src/core');
  });

  it('is a dot for the map\'s own folder, and the dots alone for the project\'s folder', () => {
    expect(relativeLink(map, '/c:/work/project/docs/maps', root)).toBe('.');
    expect(relativeLink(map, root, root)).toBe('../..');
  });

  it('is nothing for a file outside the project', () => {
    expect(relativeLink(map, '/c:/work/other/readme.md', root)).toBeUndefined();
    expect(relativeLink(map, '/d:/elsewhere/readme.md', root)).toBeUndefined();
    expect(relativeLink(map, '/c:/work/project-two/readme.md', root)).toBeUndefined();
  });

  it('takes the map\'s folder as the project when the map is in no workspace folder', () => {
    expect(relativeLink('/tmp/loose.mm', '/tmp/sub/file.txt', '/tmp')).toBe('sub/file.txt');
    expect(relativeLink('/tmp/loose.mm', '/home/file.txt', '/tmp')).toBeUndefined();
  });
});
