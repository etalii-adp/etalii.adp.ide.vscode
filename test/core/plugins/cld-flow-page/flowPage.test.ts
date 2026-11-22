import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Source } from '../../../../src/core/frame/toolType';
import { htmlEscaped, jsonText, numberText, pageName } from '../../../../src/core/plugins/cld-flow-page/index';
import { TEMPLATE } from '../../../../src/core/plugins/cld-flow-page/template';
import { plugins as registry } from '../../../../src/core/plugins/index';
import { definitionOf, diagramOf } from '../../tool/support';

// The causal loop diagram's flow page (etalii.adp spec 082, tasks T001 to T004), held to the pages the
// desktop host's own generator wrote for the same documents (`fixtures/tools/causal-loop-diagram/flow-pages/`,
// whose readme says how): the same document gives the same bytes in both hosts (FR-007, SC-003).

const type = diagramOf(definitionOf('causal-loop-diagram'), registry);
const pages = 'fixtures/tools/causal-loop-diagram/flow-pages';
const moment = new Date(2026, 9, 31, 14, 5, 59);

/** A document and its registration, where it has one, as the editor reads them. */
function sourceOf(folder: string, name: string): Source {
  const registration = `${folder}/${name}.adp`;
  return { fileName: `${folder}/${name}.cld`, text: readFileSync(`${folder}/${name}.cld`, 'utf8'), ...(existsSync(registration) ? { registration: readFileSync(registration, 'utf8') } : {}) };
}

const pageOf = (source: Source): string => type.exported!(source, 'flowPage', {}, moment)!.text;
const desktopPage = (name: string): string => readFileSync(`${pages}/${name}.html`, 'utf8');
const dataOf = (page: string): { v: [string, string, number, number, number, number][] } & Record<string, unknown> =>
  JSON.parse(/^const DATA = (.*);$/m.exec(page)![1]) as { v: [string, string, number, number, number, number][] } & Record<string, unknown>;

/** Every variable's position in a page written as a mark, and the notes given, so the rest can be compared byte for byte. */
const withoutPositions = (page: string, notes: Readonly<Record<number, string>> = {}): string => {
  const data = dataOf(page) as ReturnType<typeof dataOf> & { l: unknown[][] };
  const links = data.l.map((link, index) => (Object.hasOwn(notes, index) ? [...link.slice(0, 4), notes[index], ...link.slice(5)] : link));
  return page.replace(/^const DATA = .*$/m, `const DATA = ${JSON.stringify({ ...data, l: links, v: data.v.map(([id, label, , , start, push]) => [id, label, 'x', 'y', start, push]) })};`);
};

/**
 * Where a host reads a document otherwise, its page shows what that host reads. A link's note is read in VS Code as
 * the standalone host reads it (spec 081, FR-008): a bare word is a note, and of two notes the last wins; the desktop
 * host reads the first quoted word. VS Code's `docs/parity.md` records it; by link, the note VS Code's page holds.
 */
const readOtherwise: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  'lenient-spellings': { 3: 'bareNote' },
  'two-notes': { 0: 'second note' },
};

describe('the flow page of a causal loop diagram', () => {
  it('is named for its file and the minute of the export, in local time', () => {
    expect(pageName('mental-health', moment)).toBe('mental-health {2026-10-31 14.05}.html');
    expect(pageName('a b.c é', moment)).toBe('a b.c é {2026-10-31 14.05}.html');
    expect(pageName('x', new Date(2026, 0, 2, 3, 4))).toBe('x {2026-01-02 03.04}.html');
    expect(type.exported!(sourceOf('examples/causal-loop-diagram/on-call', 'on-call'), 'flowPage', {}, moment)!.name).toBe('on-call {2026-10-31 14.05}.html');
  });

  it('writes a number as Rust writes an f64: its shortest digits, never an exponent, and -0', () => {
    expect([3, 1.2, 0.5, -233.639456, 7.105427357601002e-15, 1e21, 1.5e300, -1e-7, 1e-6, 123456789012345680000].map(numberText))
      .toEqual(['3', '1.2', '0.5', '-233.639456', '0.000000000000007105427357601002', '1000000000000000000000', `15${'0'.repeat(299)}`, '-0.0000001', '0.000001', '123456789012345680000']);
    expect(numberText(-0)).toBe('-0');
  });

  it('writes text as JSON safe in a script, and as HTML text', () => {
    expect(jsonText('a "b" \\ </script> & \u2028\u2029\n\t😀')).toBe('"a \\"b\\" \\\\ \\u003c/script\\u003e \\u0026 \\u2028\\u2029\\u000a\\u0009😀"');
    expect(htmlEscaped('<b>&</b> "x" \'y\'')).toBe('&lt;b&gt;&amp;&lt;/b&gt; &quot;x&quot; &#39;y&#39;');
  });

  it('is the template the record names, filled only at its markers', () => {
    const record = readFileSync('src/core/plugins/cld-flow-page/PROVENANCE.md', 'utf8');
    expect(record).toContain(createHash('sha256').update(TEMPLATE, 'utf8').digest('hex'));
    const page = pageOf(sourceOf('examples/causal-loop-diagram/on-call', 'on-call'));
    const [head, rest] = TEMPLATE.split('/*FLOW_PAGE_TITLE*/');
    expect(page.startsWith(head)).toBe(true);
    expect(page).not.toContain('/*FLOW_PAGE_');
    expect(page.endsWith(TEMPLATE.slice(TEMPLATE.indexOf('/*FLOW_PAGE_DATA*/') + '/*FLOW_PAGE_DATA*/'.length))).toBe(true);
    expect(rest.length).toBeGreaterThan(0);
  });

  // The examples and the document that sets every flow property keep a position for each variable in their registration: their pages are the desktop host's, byte for byte.
  const registered = [
    ...['business-philosophy', 'life-insurance', 'mental-health', 'uk-cod-population'].map((name) => ({ name, folder: `examples/causal-loop-diagram/${name}`, page: name })),
    { name: 'flow-properties', folder: 'fixtures/tools/causal-loop-diagram/flow-page-sources/flow-properties', page: 'flow-properties' },
  ];
  it.each(registered)('of $name is the desktop host\'s page, byte for byte', ({ name, folder, page }) => {
    expect(pageOf(sourceOf(folder, name))).toBe(desktopPage(page));
  });

  // A document without positions opens on a ring each host computes: the centres agree to the scene's six decimals, and the rest of the page byte for byte.
  const ringed = [
    ...['on-call', 'reference'].map((name) => ({ name, source: sourceOf(`examples/causal-loop-diagram/${name}`, name), page: name })),
    ...readdirSync(pages).filter((file) => file.startsWith('fixture-')).map((file) => {
      const name = file.slice('fixture-'.length, -'.html'.length);
      return { name, source: { fileName: `${name}.cld`, text: readFileSync(`fixtures/tools/causal-loop-diagram/${name}.cld`, 'utf8') }, page: file.slice(0, -'.html'.length) };
    }),
  ];
  it.each(ringed)('of $name is the desktop host\'s page, its ring\'s positions to six decimals', ({ name, source, page }) => {
    const ours = pageOf(source);
    const theirs = desktopPage(page);
    expect(withoutPositions(ours)).toBe(withoutPositions(theirs, readOtherwise[name]));
    const [mine, desktop] = [dataOf(ours).v, dataOf(theirs).v];
    expect(mine.length).toBe(desktop.length);
    mine.forEach(([, , x, y], index) => {
      expect(Math.abs(x - desktop[index][2])).toBeLessThan(1e-6);
      expect(Math.abs(y - desktop[index][3])).toBeLessThan(1e-6);
    });
  });

  it('holds every variable, link and loop of each example, and no text as markup', () => {
    for (const name of ['business-philosophy', 'life-insurance', 'mental-health', 'on-call', 'reference', 'uk-cod-population']) {
      const source = sourceOf(`examples/causal-loop-diagram/${name}`, name);
      const data = dataOf(pageOf(source)) as unknown as { v: unknown[]; l: unknown[]; o: unknown[] };
      const statements = (word: string): number => source.text.split(/\r?\n/).filter((line) => line.startsWith(`${word} `)).length;
      expect([data.v.length, data.l.length, data.o.length]).toEqual([statements('variable'), statements('link'), statements('loop')]);
    }
    const page = pageOf(sourceOf('fixtures/tools/causal-loop-diagram/flow-page-sources/flow-properties', 'flow-properties'));
    expect(page).not.toContain('<script>alert(1)</script>');
    expect(page).toContain('<title>Markup &lt;b&gt;&amp;&lt;/b&gt; &#39;quotes&#39;</title>');
  });
});
