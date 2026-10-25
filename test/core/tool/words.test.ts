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
const designerSchema = 'fixtures/tools/desl/desl.schema.json';

/**
 * A name of a definition that the folders may hold all the same, because it is not the tool type's
 * word there. `disl`: DISL's own schema has it as a property, a value or a definition, which this
 * test checks. `desl`: DESL's own schema has it, and DISL's has not, which this test checks too. `standard`: an identifier the DISL specification, or the layout of a definition's folder, defines for every tool type.
 * `english`: an ordinary word the interpreter uses in a sense of its own, which the reason states.
 */
interface Exempt {
  readonly name: string;
  readonly use: 'disl' | 'desl' | 'standard' | 'english';
  readonly reason: string;
}

const exempt: readonly Exempt[] = [
  { name: '.md', use: 'standard', reason: 'the extension of the companion document every definition has beside its specification (etalii.adp spec 027, contracts/definitions.md)' },
  { name: 'about', use: 'desl', reason: 'a property of Notes' },
  { name: 'action', use: 'disl', reason: 'a value of Plugin.provides' },
  { name: 'all', use: 'disl', reason: 'a value of BudgetWithhold.edits' },
  { name: 'any', use: 'disl', reason: 'a value of Filter.match.default' },
  { name: 'ascending', use: 'disl', reason: 'a value of Compartment.itemOrder.direction' },
  { name: 'at', use: 'disl', reason: 'a property of SnapRuleObject' },
  { name: 'average', use: 'disl', reason: 'a value of TextMetric.kind' },
  { name: 'bottom', use: 'disl', reason: 'a value of Budget.position' },
  { name: 'canvas', use: 'disl', reason: 'a property of Viewpoint' },
  { name: 'Cell', use: 'standard', reason: 'one crossing of a row and a column: the singular of `cells`, which DESL\'s surface names (DESL 7.2)' },
  { name: 'cells', use: 'desl', reason: 'a property of Surface' },
  { name: 'century', use: 'disl', reason: 'a value of TimeUnit' },
  { name: 'Check', use: 'english', reason: 'to check a model is to evaluate its constraints (DISL 8): `Constraints.check`, and the check of a gesture in a transaction' },
  { name: 'checkbox', use: 'disl', reason: 'a value of FormItem.widget' },
  { name: 'checked', use: 'english', reason: 'a change that is checked is held to the constraints of its gesture before it is applied (DISL 8.4)' },
  { name: 'Child', use: 'english', reason: 'a child is an element nested in another, or an item of a container: DISL\'s `children` and `parent`' },
  { name: 'collapsed', use: 'disl', reason: 'a property of Compartment' },
  { name: 'Colour', use: 'desl', reason: 'a property of Columns.options' },
  { name: 'Column', use: 'disl', reason: 'a property of SourceLocation' },
  { name: 'columns', use: 'disl', reason: 'a property of ContainerSpec' },
  { name: 'Composite', use: 'standard', reason: 'a word of the feature identifier `shape.composite` (DISL, Appendix B.8)' },
  { name: 'computed', use: 'disl', reason: 'a property of Canvas.legend' },
  { name: 'Condition', use: 'english', reason: 'a condition is an expression that holds or does not: an action\'s `when`, a rule\'s `rule`' },
  { name: 'conditions', use: 'disl', reason: 'a definition of the schema' },
  { name: 'container', use: 'disl', reason: 'a property of NodeNotation' },
  { name: 'count', use: 'disl', reason: 'a property of Budget' },
  { name: '.ded', use: 'standard', reason: 'DED, the language the documents of a designer are written in, whose envelope is read for the document of a designer (DED 2, 4): its key `ded`, its version and its sentences. A definition claims `.ded` after it for a document in JSON' },
  { name: 'date', use: 'disl', reason: 'a value of Attribute.writtenPrecision' },
  { name: 'dateTime', use: 'desl', reason: 'a value of ValueType.editor' },
  { name: 'decade', use: 'disl', reason: 'a value of TimeUnit' },
  { name: 'default', use: 'disl', reason: 'a property of Viewpoint' },
  { name: 'descending', use: 'disl', reason: 'a value of Compartment.itemOrder.direction' },
  { name: 'description', use: 'disl', reason: 'a property of Doc' },
  { name: 'designer', use: 'standard', reason: 'the kind of tool DESL specifies, as `docs/terminology.md` of etalii.adp has it: a tool type is a diagram or a designer' },
  { name: 'detail', use: 'desl', reason: 'a property of Notes' },
  { name: 'diagram', use: 'disl', reason: 'a value of Function.uses' },
  { name: 'Direction', use: 'disl', reason: 'a property of PortType' },
  { name: 'Do', use: 'disl', reason: 'a property of Action' },
  { name: 'duplicateId', use: 'standard', reason: 'a word of `std.duplicateId`, the built-in constraint for an id that two elements share (DISL 8.7)' },
  { name: 'earliest', use: 'english', reason: 'the earliest of several: the first row a layout may place an element in' },
  { name: 'Edge', use: 'disl', reason: 'a property of Notation' },
  { name: 'element', use: 'disl', reason: 'a property of ViewBind' },
  { name: 'elements', use: 'disl', reason: 'a property of Persistence.ordering' },
  { name: 'Environment', use: 'english', reason: 'the environment of the CEL library, in which every expression of a specification is parsed (DISL 12)' },
  { name: 'Fallback', use: 'disl', reason: 'a property of Plugin' },
  { name: 'filter', use: 'disl', reason: 'a property of Style' },
  { name: 'finished', use: 'disl', reason: 'a property of Simulation.notice' },
  { name: 'folded', use: 'english', reason: 'a folded node is one whose children are hidden: the scene\'s word for the state DISL calls `collapsed`, as `SceneNode.fold` gives it to a canvas' },
  { name: 'folder', use: 'standard', reason: 'the name of a built-in shape (DISL 6.7), and a folder of `definitions/`, which is one tool type (etalii.adp spec 027, contracts/definitions.md)' },
  { name: 'from', use: 'disl', reason: 'a property of Import' },
  { name: 'group', use: 'disl', reason: 'a property of ViewBind' },
  { name: 'groupBy', use: 'disl', reason: 'a property of Compartment' },
  { name: 'groups', use: 'disl', reason: 'a property of ToolGroup, and a value of ViewKind' },
  { name: 'height', use: 'disl', reason: 'a property of Placement' },
  { name: 'id', use: 'disl', reason: 'a property of Reason' },
  { name: 'item', use: 'standard', reason: 'the name `forEach` binds each item of its list to unless it names another (DISL 9.4, DESL 8.2)' },
  { name: 'json', use: 'disl', reason: 'a value of DataType.base' },
  { name: 'key', use: 'disl', reason: 'a property of Attribute' },
  { name: 'kind', use: 'disl', reason: 'a property of Axis' },
  { name: 'label', use: 'disl', reason: 'a property of Language' },
  { name: 'left', use: 'disl', reason: 'a value of Budget.position' },
  { name: 'level', use: 'disl', reason: 'a property of SnapRuleObject.ticks' },
  { name: 'Limit', use: 'english', reason: 'a limit of a relation type is what its ends allow (DISL 8.7), and of a reading how much of a body is read' },
  { name: 'link', use: 'disl', reason: 'a value of the widgets a form item names' },
  { name: 'Location', use: 'disl', reason: 'a property of Constraint' },
  { name: 'marks', use: 'standard', reason: 'the option of the `slider` widget that names the points marked along it (DISL 7, widgets)' },
  { name: 'Match', use: 'disl', reason: 'a property of Filter' },
  { name: 'max', use: 'disl', reason: 'a property of MinMax' },
  { name: 'min', use: 'disl', reason: 'a property of MinMax' },
  { name: 'mm', use: 'standard', reason: 'the letters of a month in an LDML pattern, as a ruler and a form write a year and a month (DISL 5.13)' },
  { name: 'month', use: 'disl', reason: 'a value of TimeUnit' },
  { name: 'name', use: 'disl', reason: 'a property of PluginCall' },
  { name: 'node', use: 'disl', reason: 'a property of Notation' },
  { name: 'nodes', use: 'disl', reason: 'a property of Viewpoint' },
  { name: 'note', use: 'disl', reason: 'a value of Tool.kind' },
  { name: 'notes', use: 'desl', reason: 'a property of Hierarchy' },
  { name: 'none', use: 'disl', reason: 'a value of Modifier' },
  { name: 'number', use: 'disl', reason: 'a value of DataType.base' },
  { name: 'one', use: 'english', reason: 'one of several: the value of one expression, one element of a selection' },
  { name: 'openLink', use: 'english', reason: 'to open a link is a gesture of the frame\'s contract (`EditRequest.kind`, etalii.adp spec 027, contracts/tool-type.md), whatever a definition calls the operation that does it' },
  { name: 'Option', use: 'english', reason: 'an option is one of the values a choice offers: of a form item (DISL 7), of a column (DESL 7.3)' },
  { name: 'options', use: 'disl', reason: 'a property of Filter' },
  { name: 'other', use: 'english', reason: 'the other of two things: the other end of an edge, another element of a list' },
  { name: 'Parallel', use: 'disl', reason: 'a property of EdgeNotation' },
  { name: 'parent', use: 'disl', reason: 'a value of Attribute.unique' },
  { name: 'pending', use: 'english', reason: 'a pending connection is a connect gesture that ended on an element and has no relation type yet (DISL 7.3)' },
  { name: 'Phase', use: 'disl', reason: 'a property of Hook' },
  { name: 'placement', use: 'disl', reason: 'a definition of the schema: where the coordinates of a node come from' },
  { name: 'placements', use: 'disl', reason: 'a property of Behavior' },
  { name: 'position', use: 'disl', reason: 'a property of Label' },
  { name: 'properties', use: 'english', reason: 'the properties of an object, and ADP Properties, the frame\'s view of a selection' },
  { name: 'Property', use: 'english', reason: 'a property of an object, and a column of a table as the frame\'s contract names one (`TableProperty`, etalii.adp spec 027, contracts/tool-type.md)' },
  { name: 'query', use: 'desl', reason: 'a property of Filters' },
  { name: 'range', use: 'standard', reason: 'a function of CEL\'s lists extension, which DISL requires (DISL 12.1)' },
  { name: 'relation', use: 'disl', reason: 'a value of Constraint.scope' },
  { name: 'resolved', use: 'desl', reason: 'a property of Notes' },
  { name: 'right', use: 'disl', reason: 'a value of Budget.position' },
  { name: 'row', use: 'disl', reason: 'a value of FormItem.kind' },
  { name: 'rowPacked', use: 'disl', reason: 'a property of LayoutConfig' },
  { name: 'rows', use: 'disl', reason: 'a property of LayoutConfig' },
  { name: 'selection', use: 'disl', reason: 'a property of Canvas' },
  { name: 'Side', use: 'disl', reason: 'a property of EndAnchor' },
  { name: 'Sort', use: 'desl', reason: 'a property of ValueType' },
  { name: 'Specification', use: 'disl', reason: 'the definition of the schema a specification file is' },
  { name: 'specifications', use: 'english', reason: 'the specification files of the folders of `definitions/`: DISL\'s own word for what a tool engineer writes' },
  { name: 'spread', use: 'disl', reason: 'a value of NeighbourBounds.absent' },
  { name: 'start', use: 'disl', reason: 'a property of Axis' },
  { name: 'state', use: 'disl', reason: 'a property of Simulation' },
  { name: 'std.atEnd', use: 'standard', reason: 'the id under which `behavior.messages` gives the sentence of `moveDown` at the last place (DISL 7.3, 9.1)' },
  { name: 'std.atStart', use: 'standard', reason: 'the id under which `behavior.messages` gives the sentence of `moveUp` at the first place (DISL 7.3, 9.1)' },
  { name: 'std.readOnly', use: 'standard', reason: 'the id under which `behavior.messages` gives the sentence of a diagram that cannot be edited (DISL 9.1)' },
  { name: 'sum', use: 'english', reason: 'the sum of several numbers, as a layout adds the sizes of what it places' },
  { name: 'table', use: 'disl', reason: 'a value of FormItem.widget' },
  { name: 'tags', use: 'disl', reason: 'a property of Doc' },
  { name: 'target', use: 'disl', reason: 'a property of RelationType' },
  { name: 'text', use: 'disl', reason: 'a property of Budget' },
  { name: 'time', use: 'disl', reason: 'a value of DataType.base' },
  { name: 'title', use: 'disl', reason: 'a property of Compartment' },
  { name: 'to', use: 'disl', reason: 'a property of AxisRange' },
  { name: 'top', use: 'disl', reason: 'a value of Budget.position' },
  { name: 'Trigger', use: 'disl', reason: 'a property of Layout' },
  { name: 'tree', use: 'disl', reason: 'a value of LayoutConfig.algorithm' },
  { name: 'type', use: 'disl', reason: 'a property of Function.params' },
  { name: 'uniqueName', use: 'standard', reason: 'a function of DESL\'s library (DESL 9.4)' },
  { name: 'unit', use: 'disl', reason: 'a property of Budget' },
  { name: 'Unreadable', use: 'disl', reason: 'a value of TypeMapEntry.as' },
  { name: 'value', use: 'disl', reason: 'a property of Doc' },
  { name: 'valueType', use: 'disl', reason: 'a property of Axis' },
  { name: 'version', use: 'disl', reason: 'a property of Language' },
  { name: 'view', use: 'disl', reason: 'a property of Persistence' },
  { name: 'views', use: 'desl', reason: 'a property of Surface' },
  { name: 'visible', use: 'disl', reason: 'a property of Ruler' },
  { name: 'warning', use: 'disl', reason: 'a value of Constraint.severity' },
  { name: 'width', use: 'disl', reason: 'a property of Placement' },
  { name: 'wrap', use: 'disl', reason: 'a property of Axis' },
  { name: 'x', use: 'disl', reason: 'a property of ViewBind' },
  { name: 'y', use: 'disl', reason: 'a property of ViewBind' },
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

/** Every property, value and definition name of a language's schema, by its words. */
function schemaWords(path = schema): Set<string> {
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
  walk(JSON.parse(readFileSync(path, 'utf8')));
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

  it('are exempt as a word of DESL only where DESL\'s schema has the word', () => {
    const inSchema = schemaWords(designerSchema);
    expect(inSchema.size).toBeGreaterThan(100);
    expect(exempt.filter((entry) => entry.use === 'desl' && !inSchema.has(words(entry.name))).map((entry) => entry.name)).toEqual([]);
    // A word DISL has not and DESL has is exempt as DESL's, and for no weaker reason.
    const inDisl = schemaWords();
    expect(exempt.filter((entry) => entry.use !== 'disl' && entry.use !== 'desl' && !inDisl.has(words(entry.name)) && inSchema.has(words(entry.name))).map((entry) => entry.name)).toEqual([]);
  });

  it('are the only names the exempt list holds', () => {
    expect(exempt.filter((entry) => !names.has(words(entry.name))).map((entry) => entry.name)).toEqual([]);
  });

  it('are not all exempt', () => {
    expect([...names.keys()].filter((name) => !exemptNames.has(name)).length).toBeGreaterThan(names.size / 2);
  });

  it('are read for in every folder that reads a definition', () => {
    expect(folders.filter((folder) => !existsSync(folder))).toEqual([]);
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
