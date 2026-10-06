import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allBindings } from './support/bindings';
import { filesBelow, pathOf } from './support/repository';

// The library is generic (etalii.adp spec 009, FR-001): it reads any binding, so it names none.
// Nothing under src/core/fbl names an origin, a tool type's document or a binding of the copied
// corpus, and nothing there imports Visual Studio Code, the diagrams' text primitives, the existing
// registration reader or a diagram type.
const library = pathOf('src/core/fbl');
const sources = filesBelow(library).filter((file) => file.endsWith('.ts')).map((file) => ({ file, text: readFileSync(join(library, ...file.split('/')), 'utf8') }));
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const corpus = allBindings();
// What identifies a tool type or a binding: an origin, a binding's document, its plugin, and its name where code would use it.
const origins = [...new Set(corpus.flatMap(({ binding }) => binding.claims.origins))];
const documents = [...new Set(corpus.map(({ document }) => document.replace(/\.fbl$/, '')))];
const plugins = [...new Set(corpus.flatMap(({ binding }) => binding.plugin?.plugin ?? []))];
const names = corpus.map(({ binding }) => binding.name);

function occurrences(pattern: (name: string) => RegExp, list: readonly string[]): string[] {
  return sources.flatMap(({ file, text }) => list.filter((name) => pattern(name).test(text)).map((name) => `${file} names ${name}`));
}

describe('the FBL implementation is generic', () => {
  it('has sources and names to look for', () => {
    expect(sources.length).toBeGreaterThanOrEqual(30);
    expect(origins.length).toBeGreaterThanOrEqual(14);
    expect(documents).toHaveLength(8);
    expect(names).toHaveLength(8);
    expect(plugins).toHaveLength(2);
  });

  it('names no origin, no document and no plugin of the corpus', () => {
    expect(occurrences((name) => new RegExp(escaped(name), 'i'), origins)).toEqual([]);
    expect(occurrences((name) => new RegExp(`\\b${escaped(name)}\\b`, 'i'), documents)).toEqual([]);
    expect(occurrences((name) => new RegExp(escaped(name), 'i'), plugins)).toEqual([]);
  });

  it('names no binding of the corpus', () => {
    // As code would name one: a string, or the name after a reference's #.
    expect(occurrences((name) => new RegExp(`(['"\`#])${escaped(name)}\\1|#${escaped(name)}\\b`), names)).toEqual([]);
  });

  it('imports nothing but itself, the YAML parser, and Node in two files', () => {
    const unexpected: string[] = [];
    for (const { file, text } of sources) {
      // `import ... from 'x'`, `export ... from 'x'`, and a type's `import('x')`.
      for (const [, imported, inline] of text.matchAll(/^(?:import|export)\s[^;'"]*?from\s+['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
        const specifier = imported ?? inline;
        if (specifier === 'yaml') continue;
        if (specifier.startsWith('node:')) {
          if (file !== 'files/nodeFiles.ts' && file !== 'history/digest.ts') unexpected.push(`${file} imports ${specifier}`);
          continue;
        }
        const target = specifier.startsWith('.') ? relative(library, resolve(dirname(join(library, ...file.split('/'))), specifier)) : undefined;
        if (target === undefined || target.startsWith('..')) unexpected.push(`${file} imports ${specifier}`);
      }
    }
    expect(unexpected).toEqual([]);
  });
});
