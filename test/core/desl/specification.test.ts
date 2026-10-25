import { describe, expect, it } from 'vitest';
import { expressionsOf, loadDesigner } from '../../../src/core/desl/specification';
import { interpretSurface } from '../../../src/core/desl/surface';
import { interpretMetamodel } from '../../../src/core/disl/metamodel';
import { cities, hierarchySpecification, interpreted, knowledgeSpecification, knowledgeYaml, minimalSpecification, modelOf, object, type Json } from './support';

// DESL as this host reads it (etalii.adp spec 027, task T101): a `.des` file with its metamodel,
// its persistence, its `table` surface and the CEL of DESL section 9, on the metamodel and the
// expressions of `src/core/disl/`. What a test expects is counted from the specification file it
// reads, so a definition that changes is still held to itself.

const keys = (value: unknown): string[] => Object.keys(object(value));

describe('a DESL specification', () => {
  const knowledge = knowledgeSpecification();
  const minimal = minimalSpecification();

  it.each([['knowledge.des', knowledge], ['minimal-table.des', minimal]])('%s is read with nothing found', (_name, json) => {
    expect(interpreted(json).findings.map((found) => `${found.code}: ${found.message}`)).toEqual([]);
  });

  it('gives its language, its metamodel and its persistence as they are written', () => {
    const loaded = loadDesigner(knowledge).value;
    const language = object(knowledge.language);
    expect(loaded.interpreted.language).toMatchObject({ id: language.id, origin: language.origin, label: language.label });
    const metamodel = interpretMetamodel(loaded.interpreted).value;
    expect(Object.keys(metamodel.types)).toEqual(keys(object(knowledge.metamodel).types));
    expect(Object.keys(metamodel.enums)).toEqual(keys(object(knowledge.metamodel).enums));
    // The attributes of the document are those of the table as a whole (DESL 4.1).
    expect(Object.keys(metamodel.diagram)).toEqual(keys(object(object(knowledge.metamodel).document).attributes));
    expect(loaded.bindings).toEqual(object(knowledge.persistence).bindings);
    expect(loaded.persistence.ids).toMatchObject({ strategy: 'uuid-v4', encoding: 'base36', missing: 'assign' });
    expect(keys(loaded.persistence.ids.types)).toEqual(keys(object(object(knowledge.persistence).ids).types));
  });

  it('reads a binding type that `typeMap` maps to the document as the document', () => {
    const parts = interpreted(knowledge);
    const model = modelOf(parts, knowledgeYaml(), cities());
    expect(model.diagram).toMatchObject({ name: 'Cities', activeView: 'v1' });
    // The envelope is the binding's, and no attribute of the model (DESL 5.2, `hostAttributes`).
    expect(Object.keys(model.diagram).sort()).toEqual(['activeView', 'name']);
  });

  it('is refused when it is of another major version, and read with a warning when of a newer minor one', () => {
    const major = loadDesigner({ ...knowledge, desl: '1.0' });
    expect(major.findings.map((found) => [found.code, found.severity])).toEqual([['desl.specification', 'error']]);
    expect(interpretSurface(major.value.surface, interpretMetamodel(major.value.interpreted).value).value).toBeUndefined();
    const minor = loadDesigner({ ...knowledge, desl: '0.3' });
    expect(minor.findings.map((found) => [found.code, found.severity])).toEqual([['desl.specification', 'warning']]);
    expect(minor.value.surface).toEqual(knowledge.surface);
  });

  it('of DESL 0.2 is read with nothing found: counted ids, mentions, settings and the children of the document', () => {
    const hierarchy = hierarchySpecification();
    const { desl: version } = hierarchy;
    expect(version).toBe('0.2');
    const loaded = loadDesigner(hierarchy);
    expect(loaded.findings).toEqual([]);
    const metamodel = interpretMetamodel(loaded.value.interpreted);
    expect(metamodel.findings).toEqual([]);
    expect(expressionsOf(loaded.value, metamodel.value).findings).toEqual([]);
    expect(loaded.value.settings).toEqual(object(hierarchy.persistence).settings);
    const counted = Object.entries(object(object(object(hierarchy.persistence).ids).types)).filter(([, rule]) => object(rule).strategy === 'counter').map(([type]) => type);
    expect(counted.length).toBeGreaterThan(0);
    for (const type of counted) expect(loaded.value.persistence.ids.types?.[type]).toMatchObject({ strategy: 'counter', prefix: expect.any(String), mark: expect.any(String) });
  });

  describe('a counted id rule (DESL 5.3.5, 10.1 step 4)', () => {
    const base = { ...knowledgeSpecification() };
    const withRule = (rule: Json, document: Json = { last: { type: 'string' } }, top: Json = {}): unknown => ({
      ...base,
      metamodel: { ...object(base.metamodel), document: { attributes: document } },
      persistence: { ...object(base.persistence), ids: { ...object(object(base.persistence).ids), ...top, types: { Row: { strategy: 'counter', ...rule } } } },
    });
    const problems = (json: unknown): string[] => loadDesigner(json).findings.filter((found) => found.code === 'desl.persistence').map((found) => found.message);

    it('is read with a prefix, digits and a mark that is a string of the document', () => {
      expect(problems(withRule({ prefix: 'R-', digits: 3, mark: 'last', placeholder: 'NEW' }))).toEqual([]);
    });

    it.each([
      ['no prefix', { mark: 'last' }, undefined, 'prefix'],
      ['no digit', { prefix: 'R-', digits: 0, mark: 'last' }, undefined, 'digits'],
      ['a mark the document does not have', { prefix: 'R-', mark: 'first' }, undefined, 'first'],
      ['a mark that is no string', { prefix: 'R-', mark: 'last' }, { last: { type: 'int' } }, 'last'],
      ['an empty placeholder', { prefix: 'R-', mark: 'last', placeholder: '' }, undefined, 'placeholder'],
    ])('is a problem of the persistence with %s', (_what, rule, document, word) => {
      const found = problems(withRule(rule, document));
      expect(found).toHaveLength(1);
      expect(found[0]).toContain(word);
    });

    it('is a problem as the rule of every type', () => {
      expect(problems(withRule({ prefix: 'R-', mark: 'last' }, undefined, { strategy: 'counter' }))).toHaveLength(1);
    });
  });

  it('is no specification when its top level is not an object', () => {
    expect(loadDesigner([]).findings.map((found) => found.code)).toEqual(['desl.specification']);
  });
});

describe('the table surface', () => {
  const knowledge = knowledgeSpecification();
  const declared = object(knowledge.surface);
  const { surface } = interpreted(knowledge);

  it('names the types and attributes that play each part', () => {
    expect(surface.kind).toBe('table');
    expect(surface.columns).toEqual(declared.columns);
    expect(surface.rows).toEqual(declared.rows);
    expect(surface.cells).toEqual(declared.cells);
    expect(surface.views).toEqual(declared.views);
  });

  it('has every value type the definition lists, each as it is written', () => {
    const valueTypes = object(declared.valueTypes);
    expect(Object.keys(surface.valueTypes)).toEqual(Object.keys(valueTypes));
    expect(Object.keys(surface.valueTypes)).toHaveLength(9);
    for (const [id, written] of Object.entries(valueTypes)) {
      const type = object(written);
      expect(surface.valueTypes[id], id).toEqual({
        id, label: type.label, key: type.key, many: type.many === true, editor: type.editor, comparisons: type.comparisons, sort: type.sort, converts: type.converts ?? {},
      });
    }
  });

  it('is read of DESL\'s smallest example, which has no options, no title and no settings', () => {
    const small = interpreted(minimalSpecification()).surface;
    expect(small.columns).toEqual({ type: 'Field', name: 'name', valueType: 'valueType' });
    expect(small.views).toEqual({ type: 'View', name: 'name', settings: {} });
    expect(Object.keys(small.valueTypes)).toEqual(['text', 'number']);
  });

  const withSurface = (change: (surface: Json) => Json): unknown => ({ ...knowledge, surface: change(declared) });
  const read = (json: unknown) => {
    const loaded = loadDesigner(json);
    return interpretSurface(loaded.value.surface, interpretMetamodel(loaded.value.interpreted).value);
  };

  it('is not read of a kind this host does not lay out, and says which', () => {
    const board = read(withSurface((written) => ({ ...written, kind: 'board' })));
    expect(board.value).toBeUndefined();
    expect(board.findings.map((found) => [found.code, found.severity])).toEqual([['desl.unsupported-kind', 'error']]);
    expect(board.findings[0].message).toContain('board');
  });

  it.each([
    ['a type the metamodel does not have', (written: Json) => ({ ...written, rows: { type: 'Line' } }), 'Line'],
    ['an attribute its type does not have', (written: Json) => ({ ...written, columns: { ...object(written.columns), name: 'caption' } }), 'caption'],
    ['a value type whose key the cells do not have', (written: Json) => ({ ...written, valueTypes: { ...object(written.valueTypes), text: { ...object(object(written.valueTypes).text), key: 'words' } } }), 'words'],
  ])('is not read when it names %s (DESL 10.1, step 4)', (_what, change, name) => {
    const found = read(withSurface(change));
    expect(found.value).toBeUndefined();
    expect(found.findings.map((finding) => finding.code)).toEqual(['desl.surface']);
    expect(found.findings[0].message).toContain(name);
  });
});

describe('the CEL of DESL section 9', () => {
  const parts = interpreted(knowledgeSpecification());
  const model = modelOf(parts, knowledgeYaml(), cities());
  const world = parts.expressions.over(model);
  const value = (cel: string, self?: string): unknown => {
    const result = parts.expressions.evaluate(cel, world.scope(self));
    if (!result.ok) throw new Error(`${cel}: ${result.error}`);
    return result.value;
  };

  it('has the document, with its attributes and its elements in document order', () => {
    expect(value('document.name')).toBe('Cities');
    expect(value('document.activeView.id')).toBe('v1');
    expect(value('document.elementsOfType(\'View\').map(v, v.id)')).toEqual(['v1', 'v2']);
    expect(value('document.elementById(\'p3\').name')).toBe('Population');
    expect(value('document.elements.size()')).toBe(model.elements.length);
  });

  it('gives an element its parent, its slot, its children and its ancestors', () => {
    expect(value('self.parent.id', 'r1/p4/o3')).toBe('r1/p4');
    expect(value('self.slot', 'r1/p4/o3')).toBe('items');
    expect(value('self.slot', 'p1')).toBe('');
    expect(value('self.childrenOfType(\'Option\').map(o, o.name)', 'p4')).toEqual(['Port', 'Capital']);
    expect(value('self.ancestors().map(a, a.id)', 'r1/p4/o3')).toEqual(['r1/p4', 'r1']);
    expect(value('self.ancestorsOfType(\'Row\').map(a, a.id)', 'r1/p4/o3')).toEqual(['r1']);
    expect(value('self.label()', 'p2')).toBe('Country');
  });

  it('has `positionIn`, `uniqueName` and `isUnique` (DESL 9.4)', () => {
    expect(value('self.positionIn(document.elementsOfType(\'Property\'))', 'p3')).toBe(2);
    expect(value('self.positionIn(document.elementsOfType(\'View\'))', 'p3')).toBe(-1);
    expect(value('uniqueName(\'Mayor\', [\'Name\', \'Country\'])')).toBe('Mayor');
    expect(value('uniqueName(\'name\', [\'Name\', \'Name 2\'])')).toBe('name 3');
    expect(value('[1, 2, 3].isUnique()')).toBe(true);
    expect(value('[\'a\', \'b\', \'a\'].isUnique()')).toBe(false);
  });

  it('resolves a reference to its element, and reads one that names nothing as null', () => {
    expect(value('self.property.name', 'r1/p3')).toBe('Population');
    expect(value('self.groupBy.valueType', 'v1')).toBe('selection');
    expect(value('self.freeze == null', 'v1')).toBe(true);
    expect(value('has(self.freeze)', 'v1')).toBe(false);
    expect(value('has(self.groupBy)', 'v1')).toBe(true);
  });

  it('has the strings extension of CEL (DESL 9.1)', () => {
    expect(value("' a b c '.trim().replace(' ', '-')")).toBe('a-b-c');
    expect(value("'a.b.c'.replace('.', '/', 1)")).toBe('a/b.c');
    expect(value("'a.b.c'.replace('.', '', -1)")).toBe('abc');
    expect(value("'Web Shop'.lowerAscii()")).toBe('web shop');
    expect(value("'web'.upperAscii()")).toBe('WEB');
    expect(value("'a,b'.split(',')")).toEqual(['a', 'b']);
    expect(value("['a', 'b'].join('-')")).toBe('a-b');
    expect(value("'abc'.indexOf('c')")).toBe(2);
    expect(value("'abcdef'.substring(1, 3)")).toBe('bc');
    expect(value("'abc'.reverse()")).toBe('cba');
    expect(value("'abc'.charAt(1)")).toBe('b');
  });

  it('derives the ids the specification derives, parents before children (DESL 5.3.2)', () => {
    const ids = model.elements.map((element) => element.id);
    expect(ids).toEqual(expect.arrayContaining(['v1/columns/p3', 'v1/sorts/p3', 'v1/filter/0', 'r1/p1', 'r1/p4/o3', 'r1/p4/o4', 'r1/p5/nh']));
    // Every element has an id of its own.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('evaluates the constraints of the definition over a document, which holds them all', () => {
    expect(parts.constraints.check(model).map((found) => found.code)).toEqual([]);
  });

  it('reports a rule that does not hold with the definition\'s sentence, on the line of its element', () => {
    const second = cities().replace('    name: Country\r\n', '    name: Name\r\n');
    expect(second).not.toBe(cities());
    const found = parts.constraints.check(modelOf(parts, knowledgeYaml(), second));
    expect(found.map((finding) => [finding.code, finding.severity, finding.message, finding.element])).toEqual([
      ['knowledge.duplicate-property-name', 'error', 'A property named `Name` already exists.', 'p2'],
    ]);
  });
});
