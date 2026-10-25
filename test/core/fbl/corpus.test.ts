import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bytesOf, filesBelow, pathOf } from './support/repository';

interface Source {
  name: string;
  repository: string;
  commit: string;
  licence: string;
  to: string;
  files: Record<string, string>;
}

const manifest = JSON.parse(new TextDecoder().decode(bytesOf('fixtures/fbl/manifest.json'))) as { sources: Source[] };

// Hundreds of files are read; on a machine that scans each file as it is opened that takes a while.
const slow = 60_000;

describe('the copied FBL files', () => {
  // The last three are taken ahead of the rest of the corpus: for etalii.adp spec 033 into the
  // conformance folder, and for FBL 0.7's bullets family and declared blocks into the conformance
  // folder with the definitions their fixtures name.
  it('come from six sources, each with its commit and licence', () => {
    expect(manifest.sources.map((source) => source.name)).toEqual(['conformance', 'definitions', 'real-files', 'insert-constant', 'bullets', 'bullets-definitions']);
    for (const source of manifest.sources) {
      expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(source.licence).toBe('Apache-2.0');
      expect(Object.keys(source.files).length).toBeGreaterThan(0);
    }
  });

  // A copy that was edited, or saved with other line endings, has another digest. A folder two sources
  // copy into holds the files of both, and each file is listed by one of them.
  it.each(manifest.sources)('every file under a source\'s folder is listed and has the listed digest; nothing listed is missing ($name)', (source) => {
    const found = filesBelow(pathOf(source.to));
    const listed = Object.keys(source.files);
    const sharing = manifest.sources.filter((other) => other.to === source.to);
    expect(found.filter((file) => !sharing.some((other) => file in other.files)), 'files the manifest does not list').toEqual([]);
    expect(listed.filter((file) => sharing.some((other) => other !== source && file in other.files)), 'files two sources list').toEqual([]);
    expect(listed.filter((file) => !found.includes(file)), 'listed files that are missing').toEqual([]);
    const changed = listed.filter((file) => createHash('sha256').update(bytesOf(source.to + file)).digest('hex') !== source.files[file]);
    expect(changed, 'files whose bytes differ from the copy the manifest records').toEqual([]);
  }, slow);
});
