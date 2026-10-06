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

describe('the copied FBL files', () => {
  it('come from two sources, each with its commit and licence', () => {
    expect(manifest.sources.map((source) => source.name)).toEqual(['conformance', 'real-files']);
    for (const source of manifest.sources) {
      expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(source.licence).toBe('Apache-2.0');
      expect(Object.keys(source.files).length).toBeGreaterThan(0);
    }
  });

  // A copy that was edited, or saved with other line endings, has another digest.
  it.each(manifest.sources)('every file under a source\'s folder is listed and has the listed digest; nothing listed is missing ($name)', (source) => {
    const found = filesBelow(pathOf(source.to));
    const listed = Object.keys(source.files);
    expect(found.filter((file) => !(file in source.files)), 'files the manifest does not list').toEqual([]);
    expect(listed.filter((file) => !found.includes(file)), 'listed files that are missing').toEqual([]);
    const changed = listed.filter((file) => createHash('sha256').update(bytesOf(source.to + file)).digest('hex') !== source.files[file]);
    expect(changed, 'files whose bytes differ from the copy the manifest records').toEqual([]);
  });
});
