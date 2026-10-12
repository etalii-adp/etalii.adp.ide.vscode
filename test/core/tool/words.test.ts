import { existsSync, readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { filesUnder } from '../files';

// Nothing that reads a definition names a tool type (etalii.adp spec 027, contracts/tool-type.md,
// "The layer rule"): no file under src/core/disl/, desl/, scene/ and tool/ holds a type, an
// attribute, a message id or any other name that only a copied definition has. The names come from
// every specification and binding under definitions/, as test/words.test.ts of the Notion add-ons
// reads them, so a tool type that is added is held to the rule without a change to this file.

const folders = ['src/core/disl', 'src/core/desl', 'src/core/scene', 'src/core/tool'];
const schema = 'fixtures/disl/disl.schema.json';

/**
 * A name of a definition that the folders may hold all the same, because it is not the tool type's
 * word there. `disl`: DISL's own schema has it as a property, a value or a definition, which this
 * test checks. `standard`: an identifier the DISL specification, or the layout of a definition's folder, defines for every tool type.
 * `english`: an ordinary word the interpreter uses in a sense of its own, which the reason states.
 */
interface Exempt {
  readonly name: string;
  readonly use: 'disl' | 'standard' | 'english';
  readonly reason: string;
}

const exempt: readonly Exempt[] = [
  { name: 'action', use: 'disl', reason: 'a value of Plugin.provides' },
  { name: 'at', use: 'disl', reason: 'a property of SnapRuleObject' },
  { name: 'bottom', use: 'disl', reason: 'a value of Budget.position' },
  { name: 'canvas', use: 'disl', reason: 'a property of Viewpoint' },
  { name: 'century', use: 'disl', reason: 'a value of TimeUnit' },
  { name: 'Check', use: 'english', reason: 'to check a model is to evaluate its constraints (DISL 8): `Constraints.check`, and the check of a gesture in a transaction' },
  { name: 'Child', use: 'english', reason: 'a child is an element nested in another, or an item of a container: DISL\'s `children` and `parent`' },
  { name: 'Composite', use: 'standard', reason: 'a word of the feature identifier `shape.composite` (DISL, Appendix B.8)' },
  { name: 'count', use: 'disl', reason: 'a property of Budget' },
  { name: 'date', use: 'disl', reason: 'a value of Attribute.writtenPrecision' },
  { name: 'decade', use: 'disl', reason: 'a value of TimeUnit' },
  { name: 'description', use: 'disl', reason: 'a property of Doc' },
  { name: 'Do', use: 'disl', reason: 'a property of Action' },
  { name: 'Edge', use: 'disl', reason: 'a property of Notation' },
  { name: 'Fallback', use: 'disl', reason: 'a property of Plugin' },
  { name: 'from', use: 'disl', reason: 'a property of Import' },
  { name: 'height', use: 'disl', reason: 'a property of Placement' },
  { name: 'id', use: 'disl', reason: 'a property of Reason' },
  { name: 'label', use: 'disl', reason: 'a property of Language' },
  { name: '.md', use: 'standard', reason: 'the extension of the companion document every definition has beside its specification (etalii.adp spec 027, contracts/definitions.md)' },
  { name: 'month', use: 'disl', reason: 'a value of TimeUnit' },
  { name: 'name', use: 'disl', reason: 'a property of PluginCall' },
  { name: 'node', use: 'disl', reason: 'a property of Notation' },
  { name: 'nodes', use: 'disl', reason: 'a property of Viewpoint' },
  { name: 'other', use: 'english', reason: 'the other of two things: the other end of an edge, another element of a list' },
  { name: 'Parallel', use: 'disl', reason: 'a property of EdgeNotation' },
  { name: 'Phase', use: 'disl', reason: 'a property of Hook' },
  { name: 'row', use: 'disl', reason: 'a value of FormItem.kind' },
  { name: 'rowPacked', use: 'disl', reason: 'a property of LayoutConfig' },
  { name: 'rows', use: 'disl', reason: 'a property of LayoutConfig' },
  { name: 'spread', use: 'disl', reason: 'a value of NeighbourBounds.absent' },
  { name: 'start', use: 'disl', reason: 'a property of Axis' },
  { name: 'std.readOnly', use: 'standard', reason: 'the id under which `behavior.messages` gives the sentence of a diagram that cannot be edited (DISL 9.1)' },
  { name: 'tags', use: 'disl', reason: 'a property of Doc' },
  { name: 'text', use: 'disl', reason: 'a property of Budget' },
  { name: 'time', use: 'disl', reason: 'a value of DataType.base' },
  { name: 'to', use: 'disl', reason: 'a property of AxisRange' },
  { name: 'top', use: 'disl', reason: 'a value of Budget.position' },
  { name: 'Trigger', use: 'disl', reason: 'a property of Layout' },
  { name: 'unit', use: 'disl', reason: 'a property of Budget' },
  { name: 'Unreadable', use: 'disl', reason: 'a value of TypeMapEntry.as' },
  { name: 'value', use: 'disl', reason: 'a property of Doc' },
  { name: 'version', use: 'disl', reason: 'a property of Language' },
  { name: 'width', use: 'disl', reason: 'a property of Placement' },
  { name: 'year', use: 'disl', reason: 'a value of TimeUnit' },
];

// A name whatever its spelling: `peak-end`, `peakEnd` and `PEAK_END` are all `peak end`.
const words = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/).filter(Boolean).join(' ').toLowerCase();

// The strings at a path of a document: `*` is every child, `**` every descendant, `#` the keys.
function pick(node: unknown, path: readonly string[]): string[] {
  if (node === null || node === undefined) return [];
  const [step, ...rest] = path;
  if (step === undefined) return typeof node === 'string' ? [node] : Array.isArray(node) ? node.filter((item) => typeof item === 'string') : [];
  if (typeof node !== 'object') return [];
  if (step === '#') return Array.isArray(node) ? pick(node, []) : Object.keys(node);
  if (step === '*') return Object.values(node).flatMap((child) => pick(child, rest));
  if (step === '**') return [...pick(node, rest), ...Object.values(node).flatMap((child) => pick(child, path))];
  return pick((node as Record<string, unknown>)[step], rest);
}

// What a specification names, in DISL and in DESL, which shares the metamodel, the forms and the behavior.
const specificationNames = [
  'language.id', 'language.fileExtension', 'language.origin', 'functions.#',
  'metamodel.diagram.attributes.#', 'metamodel.dataTypes.#', 'metamodel.dataTypes.*.fields.#',
  'metamodel.enums.#', 'metamodel.enums.*.values.#',
  'metamodel.types.#', 'metamodel.types.*.attributes.#', 'metamodel.types.*.ports.#',
  'metamodel.relations.#', 'metamodel.relations.*.attributes.#',
  'coordinates.axes.#', 'coordinates.systems.#', 'coordinates.snapProfiles.#',
  'notation.theme.tokens.#', 'notation.styles.#', 'notation.markers.#', 'notation.icons.#',
  'notation.shapes.#', 'notation.shapes.*.params.#', 'notation.shapes.*.parts.*.id', 'notation.canvas.filters.#',
  'toolbox.tools.#', 'toolbox.templates.#', 'toolbox.groups.*.id', 'toolbox.groups.*.tools.*.id',
  'forms.#', 'forms.**.id',
  'constraints.groups.#', 'constraints.rules.*.id', 'constraints.rules.*.code', 'constraints.builtIn.*.code',
  'behavior.operations.#', 'behavior.placements.#', 'behavior.reasons.#', 'behavior.messages.#', 'behavior.hooks.*.id',
  'layout.algorithms.#', 'viewpoints.#', 'plugins.#',
];
const rule = ['name', 'type', 'attributes.#', 'attributes.*.key', 'insert.keys'];
const bindingNames = [
  'bindings.#', 'bindings.*.claims.extensions', 'bindings.*.claims.origins', 'bindings.*.header.key', 'bindings.*.reader.plugin',
  ...['blocks', 'elements', 'relations'].flatMap((rules) => rule.map((path) => `bindings.*.${rules}.*.${path}`)),
];
// A selector names the keys of the file it reads, one in each step.
const bindingSelectors = ['elements', 'relations'].flatMap((rules) => [`bindings.*.${rules}.*.at`, `bindings.*.${rules}.*.insert.container`]);

/** Every name the copied definitions declare, by its words, with the spelling it was first found in. */
function declaredNames(): Map<string, string> {
  const names = new Map<string, string>();
  for (const file of filesUnder('definitions', '.dis', '.des', '.fbl')) {
    const document: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const at = (paths: string[]) => paths.flatMap((path) => pick(document, path.split('.')));
    const found = file.endsWith('.fbl') ? [...at(bindingNames), ...at(bindingSelectors).flatMap((selector) => selector.split('/'))] : at(specificationNames);
    for (const name of found) if (/[A-Za-z]/.test(name) && !names.has(words(name))) names.set(words(name), name);
  }
  return names;
}

/** Every property, value and definition name of DISL's schema, by its words. */
function schemaWords(): Set<string> {
  const found = new Set<string>();
  const walk = (node: unknown, key?: string): void => {
    if (Array.isArray(node)) {
      if (key === 'enum') for (const item of node) if (typeof item === 'string') found.add(words(item));
      for (const item of node) walk(item);
    } else if (typeof node === 'object' && node !== null) {
      for (const [name, value] of Object.entries(node)) {
        if (key === 'properties' || key === '$defs') found.add(words(name));
        walk(value, name);
      }
    } else if (key === 'const' && typeof node === 'string') found.add(words(node));
  };
  walk(JSON.parse(readFileSync(schema, 'utf8')));
  return found;
}

interface Held {
  readonly name: string;
  readonly at: number;
}

// The names in a text whose words are parted by `-`, `.` or `_`: every run of whole words is tried.
function heldInText(text: string, names: ReadonlyMap<string, string>): Held[] {
  const held: Held[] = [];
  for (const run of text.matchAll(/[A-Za-z0-9]+(?:[-._][A-Za-z0-9]+)*/g)) {
    const parts = [...run[0].matchAll(/[A-Za-z0-9]+/g)];
    for (let first = 0; first < parts.length; first++) {
      for (let last = first; last < parts.length; last++) {
        const name = parts.slice(first, last + 1).map((part) => words(part[0])).join(' ');
        if (names.has(name)) held.push({ name, at: run.index + parts[first].index });
      }
    }
  }
  return held;
}

// Identifiers, and the texts of string literals and templates.
function heldInTypeScript(source: string, names: ReadonlyMap<string, string>): Held[] {
  const file = ts.createSourceFile('file.ts', source, ts.ScriptTarget.Latest, true);
  const held: Held[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      if (names.has(words(node.text))) held.push({ name: words(node.text), at: node.getStart() });
    } else if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      for (const found of heldInText(node.text, names)) held.push({ name: found.name, at: node.getStart() + 1 + found.at });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return held;
}

describe('the words of a tool type', () => {
  const names = declaredNames();
  const exemptNames = new Set(exempt.map((entry) => words(entry.name)));

  it('are declared by the specifications and bindings under definitions/', () => {
    expect(names.size).toBeGreaterThan(100);
    // One of each kind of file, by a name only it has.
    expect([...names.values()]).toEqual(expect.arrayContaining(['gartner/hypecycle-graph', 'peakEnd', 'trend-not-a-mapping', 'etalii/agent-behavior-modelling']));
  });

  it('are exempt only with a reason', () => {
    expect(exempt.filter((entry) => entry.reason.trim() === '').map((entry) => entry.name)).toEqual([]);
    expect(exempt.filter((entry, index) => exempt.findIndex((other) => words(other.name) === words(entry.name)) !== index).map((entry) => entry.name)).toEqual([]);
  });

  it('are exempt as a word of DISL only where DISL\'s schema has the word', () => {
    const inSchema = schemaWords();
    expect(inSchema.size).toBeGreaterThan(300);
    expect(exempt.filter((entry) => entry.use === 'disl' && !inSchema.has(words(entry.name))).map((entry) => entry.name)).toEqual([]);
    // A word the schema has is exempt as DISL's, and for no weaker reason.
    expect(exempt.filter((entry) => entry.use !== 'disl' && inSchema.has(words(entry.name))).map((entry) => entry.name)).toEqual([]);
  });

  it('are the only names the exempt list holds', () => {
    expect(exempt.filter((entry) => !names.has(words(entry.name))).map((entry) => entry.name)).toEqual([]);
  });

  it('are not all exempt', () => {
    expect([...names.keys()].filter((name) => !exemptNames.has(name)).length).toBeGreaterThan(names.size / 2);
  });

  it('are read for in every folder that reads a definition', () => {
    // src/core/desl/ arrives with the first designer; the three others are here from this change on.
    expect(folders.filter((folder) => folder !== 'src/core/desl' && !existsSync(folder))).toEqual([]);
    expect(filesUnder('src/core/tool', '.ts').length).toBeGreaterThan(0);
  });

  it('are in no file of those folders', () => {
    const open = new Map([...names].filter(([name]) => !exemptNames.has(name)));
    const violations: string[] = [];
    for (const folder of folders.filter((candidate) => existsSync(candidate))) {
      for (const path of readdirSync(folder, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.ts')).map((file) => `${folder}/${file.replaceAll('\\', '/')}`).sort()) {
        const source = readFileSync(path, 'utf8');
        for (const { name, at } of heldInTypeScript(source, open)) violations.push(`${path}:${source.slice(0, at).split('\n').length} ${open.get(name)}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
