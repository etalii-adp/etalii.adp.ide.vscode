import { describe, expect, it } from 'vitest';
import { findingCodes, produceTemplate } from '../../../../src/core/fbl';
import { freeplaneMm } from '../../../../src/core/plugins/freeplane-mm';
import { architecture, binding, bodyText, childrenOf, inline, node, offsetOf, open, read, recorded, textOf, utf8 } from '../support';

// The persistence plugin `net.etalii.adp.freeplane.mm` reads a Freeplane `.mm` body as standalone's
// `MindmapFreeplanePlugin` reads it (etalii.adp spec 027, T064, research R9): one `Node` for each
// `<node>`, in the order of the file, each under its parent. A comment above a test names its
// counterpart in standalone at `5756a07`, under
// `src/diagrams/mindmap/backend/EtAlii.Adp.Diagram.Mindmap.Tests/`: `MindmapFreeplanePlugin.Tests.cs`
// (`MindmapFreeplanePluginTests`) and the reading cases of `MindmapDocument.Tests.cs`
// (`MindmapDocumentTests`), whose editing cases are in `planning.test.ts`.

const unparseable = (body: string | Uint8Array): string => {
  const result = read(body);
  expect(result.unreadable).toBe(true);
  expect(result.elements).toEqual([]);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0].code).toBe(findingCodes.unparseable);
  expect(result.findings[0].severity).toBe('error');
  return result.findings[0].message;
};

describe('the plugin and its binding', () => {
  // MindmapFreeplanePluginTests.TheBinding_NamesThisPluginAsItsReader
  it('the binding of the definition names this plugin as its reader', () => {
    expect(freeplaneMm.id).toBe('net.etalii.adp.freeplane.mm');
    expect(binding().plugin?.plugin).toBe(freeplaneMm.id);
  });

  // MindmapFreeplanePluginTests.AChange_IsRefused_BecauseTheCommandsEditTheXmlInPlace is not carried
  // over: this plugin plans what standalone's commands do (research R9), which planning.test.ts holds.
});

describe('a node is read', () => {
  // MindmapFreeplanePluginTests.ANode_IsReadWithItsTextNotesLinkFoldAndSide_UnderItsParent
  it('with its text, notes, link, fold and side, under its parent', () => {
    const text = '<map version="freeplane 1.12.15">\n<node TEXT="root" ID="ID_1">\n'
      + '<node TEXT="left" ID="ID_2" POSITION="left" FOLDED="true" LINK="notes.md"><richcontent TYPE="NOTE"><html><head/><body><p>A note</p></body></html></richcontent>\n<node TEXT="deep" ID="ID_3"/>\n</node>\n'
      + '</node>\n</map>\n';
    const result = read(text);
    expect(result.unreadable).toBe(false);
    expect(result.findings).toEqual([]);
    expect(result.elements.map((element) => element.id)).toEqual(['ID_1', 'ID_2', 'ID_3']);
    const left = result.elements[1];
    expect(left.idIsStored).toBe(true);
    expect(left.type).toBe('Node');
    expect(left.rule).toBe('node');
    expect(left.isRelation).toBe(false);
    expect(left.parentId).toBe('ID_1');
    expect(left.parentSlot).toBe('children');
    expect(left.attributes).toEqual({ text: 'left', notes: 'A note', link: 'notes.md', folded: true, position: 'left', storedId: 'ID_2' });
    expect(left.line).toBe(3);
    expect(result.elements[0].parentId).toBeUndefined();
    expect(result.elements[0].parentSlot).toBeUndefined();
    expect(result.elements[0].attributes).toEqual({ text: 'root', notes: '', folded: false, storedId: 'ID_1' });
  });

  // MindmapFreeplanePluginTests.ALink_IsReadOnlyWhenTheFileHasOne_EvenAnEmptyOne
  it('with a link only when the file has one, even an empty one, and a side only when the file has one', () => {
    const result = read('<map version="freeplane 1.12.15"><node TEXT="root" ID="ID_1" LINK=""><node TEXT="plain" ID="ID_2"/></node></map>');
    expect(result.elements[0].attributes.link).toBe('');
    expect('link' in result.elements[1].attributes).toBe(false);
    expect('position' in result.elements[1].attributes).toBe(false);
  });

  // MindmapFreeplanePluginTests.ALaterHolderOfAnId_AndANodeWithoutOne_GetIdsOfTheirOwn_AndKeepWhatTheFileWrites
  it('under an id of its own when the file gives its ID twice or gives it none, keeping what the file writes', () => {
    const text = '<map version="freeplane 1.12.15"><node TEXT="root" ID="ID_1">'
      + '<node TEXT="a" ID="ID_A"><node TEXT="under the first" ID="ID_X"/></node><node TEXT="a again" ID="ID_A"><node TEXT="under the second" ID="ID_Y"/></node>'
      + '<node TEXT="none"/></node></map>';
    const elements = read(text).elements;
    expect(new Set(elements.map((element) => element.id)).size).toBe(elements.length);
    expect(elements[1].id).toBe('ID_A');
    expect(elements[1].idIsStored).toBe(true);
    // A later holder is the ID, a NUL, which no ID of a file can hold, and which holder it is.
    expect(elements[3].id).toBe('ID_A\u00002');
    expect(elements[3].idIsStored).toBe(false);
    expect(elements[3].attributes.storedId).toBe('ID_A');
    expect(elements[4].parentId).toBe(elements[3].id);
    // A node without an ID is a NUL and its place among the nodes, counted from one.
    expect(elements[5].id).toBe('\u00006');
    expect(elements[5].idIsStored).toBe(false);
    expect(elements[5].attributes.storedId).toBe('');
  });

  // MindmapDocumentTests.AssigningMissingIds_ChangesOnlyTheNodesThatHadNone, as far as it is
  // reading: the reader assigns nothing, so a node without an ID has no stored id and the ids the
  // file has are untouched. Writing an id into such a node is `storeId` in planning.test.ts.
  it('without an ID in a hand-written file, under its parent and over its children, with no byte changed', () => {
    const handWritten = '<map version="freeplane 1.11.5">\n<node TEXT="root" ID="ID_1">\n<node TEXT="no id yet">\n<node TEXT="child without one either"/>\n</node>\n</node>\n</map>';
    const body = open(handWritten);
    const [root, unnamed, child] = body.model.elements;
    expect(root.id).toBe('ID_1');
    expect(unnamed.attributes.text).toBe('no id yet');
    expect(unnamed.idIsStored).toBe(false);
    expect(unnamed.parentId).toBe('ID_1');
    expect(child.parentId).toBe(unnamed.id);
    expect(child.id).not.toBe(unnamed.id);
    expect(bodyText(body)).toBe(handWritten);
  });

  it('with the span of its element, from the `<` of its start tag to the `>` that ends it', () => {
    const text = '<map version="freeplane 1.12.15">\n<node TEXT="root" ID="ID_1">\n<node TEXT="déjà vu" ID="ID_2">\n<node TEXT="deep" ID="ID_3"/>\n</node>\n</node>\n</map>\n';
    const result = read(text);
    const spanned = (id: string): string => textOf(utf8(text).subarray(node(result, id).ownSpan.start, node(result, id).ownSpan.end));
    expect(spanned('ID_3')).toBe('<node TEXT="deep" ID="ID_3"/>');
    expect(spanned('ID_2')).toBe('<node TEXT="déjà vu" ID="ID_2">\n<node TEXT="deep" ID="ID_3"/>\n</node>');
    // Offsets are of UTF-8 bytes: the two accented letters before it count two bytes each.
    expect(node(result, 'ID_3').ownSpan.start).toBe(offsetOf(text, '<node TEXT="deep"'));
    expect(node(result, 'ID_3').ownSpan.start).toBe(text.indexOf('<node TEXT="deep"') + 2);
  });

  it('with FOLDED and the TYPE of a richcontent compared without regard to case', () => {
    const result = read('<map><node TEXT="root" ID="ID_1" FOLDED="TRUE"><richcontent TYPE="note"><html><body><p>Kept</p></body></html></richcontent><node TEXT="other" ID="ID_2" FOLDED="yes"/></node></map>');
    expect(node(result, 'ID_1').attributes.folded).toBe(true);
    expect(node(result, 'ID_1').attributes.notes).toBe('Kept');
    expect(node(result, 'ID_2').attributes.folded).toBe(false);
  });

  it('with its side as the file writes it', () => {
    const result = read(inline['inline/without-ids.mm']);
    expect(result.elements.map((element) => element.attributes.position)).toEqual([undefined, 'left', undefined, 'bottom_or_right', undefined]);
  });
});

describe('the genuine Freeplane save', () => {
  // MindmapDocumentTests.Parse_ReadsTheTree
  it('is read as its tree', () => {
    const result = read(architecture());
    expect(result.unreadable).toBe(false);
    expect(result.findings).toEqual([]);
    const root = result.elements[0];
    expect(root.id).toBe('ID_1730044821');
    expect(root.parentId).toBeUndefined();
    expect(root.attributes.text).toBe('ADP architecture');
    expect(childrenOf(result, root.id).map((child) => child.attributes.text)).toEqual(['Backend', 'Client', 'Diagram types', 'Deliberately deep']);
    expect(result.elements).toHaveLength(25);
    expect(result.elements.filter((element) => element.parentId === undefined)).toHaveLength(1);
    expect(result.elements.every((element) => element.idIsStored && element.attributes.storedId === element.id)).toBe(true);
  });

  // MindmapDocumentTests.Parse_ReadsTextHeldAsRichContent
  it('gives the text held as rich content, which wins over TEXT', () => {
    expect(node(read(architecture()), 'ID_411002940').attributes.text).toBe('A node whose text is rich content rather than a TEXT attribute');
    const both = read('<map><node TEXT="plain" ID="ID_1"><richcontent TYPE="NODE"><html><body><p>formatted</p></body></html></richcontent></node></map>');
    expect(both.elements[0].attributes.text).toBe('formatted');
  });

  // MindmapDocumentTests.Parse_ReadsNotes_WithAndWithoutAContentType
  it('gives the notes, with and without a CONTENT-TYPE', () => {
    const result = read(architecture());
    expect(node(result, 'ID_1730044821').attributes.notes).toBe('The map ADP\'s round-trip tests read. Keep it ugly on purpose — it is here to be hard.');
    expect(node(result, 'ID_88117420').attributes.notes).toBe('Owns the selection. See tech.md › Context.\nNested markup & entities live here: <node> is not a node.');
    expect(node(result, 'ID_88117422').attributes.notes).toBe('');
    const typed = read('<map><node TEXT="root" ID="ID_1"><richcontent CONTENT-TYPE="xml/" TYPE="NOTE"><html><head/><body><p>As Freeplane 1.11 wrote it</p></body></html></richcontent></node></map>');
    expect(typed.elements[0].attributes.notes).toBe('As Freeplane 1.11 wrote it');
  });

  // MindmapDocumentTests.Parse_ReadsFoldLinkAndEmptyText
  it('gives the fold, the link and an empty text', () => {
    const result = read(architecture());
    expect(node(result, 'ID_88117425').attributes.folded).toBe(true);
    expect(node(result, 'ID_1730044821').attributes.folded).toBe(false);
    expect(node(result, 'ID_88117420').attributes.link).toBe('../../../../backend/EtAlii.Adp.Backend/Context/ContextServiceImpl.cs');
    expect('link' in node(result, 'ID_88117422').attributes).toBe(false);
    expect(node(result, 'ID_411002939').attributes.text).toBe('');
    expect(node(result, 'ID_411002937').attributes.position).toBe('bottom_or_right');
    expect(node(result, 'ID_411002941').attributes.position).toBe('top_or_left');
  });

  it('gives each node the line its element starts on, counted from one', () => {
    const result = read(architecture());
    expect(node(result, 'ID_1730044821').line).toBe(4);
    expect(node(result, 'ID_411002937').line).toBe(49);
    expect(node(result, 'ID_88117422').line).toBe(65);
    expect(node(result, 'ID_411002940').line).toBe(79);
  });

  it('gives each node a span inside its parent\'s, that starts and ends with its tags', () => {
    const bytes = architecture();
    const result = read(bytes);
    for (const element of result.elements) {
      const own = textOf(bytes.subarray(element.ownSpan.start, element.ownSpan.end));
      expect(own.startsWith('<node ')).toBe(true);
      expect(own.endsWith('/>') || own.endsWith('</node>')).toBe(true);
      if (element.parentId === undefined) continue;
      const parent = node(result, element.parentId).ownSpan;
      expect(element.ownSpan.start).toBeGreaterThan(parent.start);
      expect(element.ownSpan.end).toBeLessThan(parent.end);
    }
  });

  // MindmapDocumentTests.ParseThenWrite_ReproducesTheCorpusByteForByte. There is no writer here: the
  // body is its bytes, and what is saved without a change is what was opened.
  it('is saved as it was opened when nothing changed', () => {
    const bytes = architecture();
    const body = open(bytes);
    expect(body.isReadOnly).toBe(false);
    expect(body.plan({ kind: 'save' })).toEqual({ planned: { splices: [] } });
    let saved: Uint8Array | undefined;
    body.save((writing) => { saved = writing; });
    expect(saved).toEqual(architecture());
  });

  // MindmapDocumentTests.ParseThenWrite_KeepsAnElementAndAnAttributeItDoesNotUnderstand, as far as
  // it is reading; that an edit keeps them byte for byte is in planning.test.ts.
  it('reads the same nodes beside an element and an attribute it does not understand', () => {
    const original = textOf(architecture());
    const extended = original
      .replace('<node TEXT="Backend"', '<node TEXT="Backend" FUTURE_ATTR="kept"')
      .replace('<edge COLOR="#ff0000" WIDTH="2"/>', '<edge COLOR="#ff0000" WIDTH="2"/>\r\n<future_element answer="42"><inner/></future_element>');
    expect(extended).not.toBe(original);
    const plain = ({ id, attributes, parentId }: { id: string; attributes: unknown; parentId?: string }) => ({ id, attributes, parentId });
    expect(read(extended).elements.map(plain)).toEqual(read(original).elements.map(plain));
  });
});

describe('what Freeplane writes in more than one way', () => {
  // MindmapDocumentTests.ParseThenWrite_KeepsMixedLineEndings_AndAnEscapedCarriageReturnInAnAttribute,
  // as far as it is reading; that an edit keeps the mixture is in planning.test.ts.
  it('mixed line endings count as one line each, and an escaped carriage return in an attribute is read', () => {
    const mixed = '<map version="freeplane 1.12.15">\r\n<node TEXT="a&#xd;b" ID="ID_1">\r\n<node TEXT="lf line" ID="ID_2"/>\n</node>\r\n</map>\r\n';
    const result = read(mixed);
    expect(node(result, 'ID_1').attributes.text).toBe('a\rb');
    expect(node(result, 'ID_1').line).toBe(2);
    expect(node(result, 'ID_2').line).toBe(3);
  });

  it('a formatted text is one line for each paragraph, with its whitespace collapsed', () => {
    const result = read(recorded('inline/rich-and-links.mm').bytes);
    expect(node(result, 'ID_F').attributes.text).toBe('Formatted\ntext here');
    expect(node(result, 'ID_F').attributes.notes).toBe('A note');
    expect(node(result, 'ID_E').attributes.notes).toBe('');
    expect(node(result, 'ID_W').attributes.link).toBe('https://example.org/a?b=1&c=2');
    expect(node(result, 'ID_R').attributes.link).toBe('');
  });

  it('a body without paragraphs is one line, and markup inside a paragraph is dropped', () => {
    const result = read('<map><node ID="ID_1"><richcontent TYPE="NODE"><html><body>\n  just   <b>bold</b> words\n</body></html></richcontent><richcontent TYPE="NOTE"><html><body><p>one <i>two</i></p><p/><p>three</p></body></html></richcontent></node></map>');
    expect(result.elements[0].attributes.text).toBe('just bold words');
    expect(result.elements[0].attributes.notes).toBe('one two\n\nthree');
  });

  it('references in an attribute are decoded: the five entities and characters by number', () => {
    const result = read('<map><node TEXT="a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos; &#xa;f&#10;g &#x1F310;" ID="ID_1"/></map>');
    expect(result.elements[0].attributes.text).toBe('a & b < c > "d" \'e\' \nf\ng 🌐');
  });

  it('a declaration, a comment, a CDATA section, single quotes and other elements around the nodes are read past', () => {
    const text = '﻿<?xml version="1.0" encoding="UTF-8"?>\n<!-- a comment with <node> in it -->\n<map version=\'freeplane 1.12.15\'>\n<bookmarks/>\n'
      + '<node TEXT=\'root\'  ID = "ID_1" >\n<!-- <node TEXT="not a node"/> -->\n<hook NAME="x"><![CDATA[<node TEXT="nor this"/>]]></hook>\n<node ID="ID_2" TEXT="child" />\n</node >\n</map>\n';
    const result = read(text);
    expect(result.unreadable).toBe(false);
    expect(result.elements.map((element) => [element.id, element.attributes.text, element.parentId, element.line])).toEqual([['ID_1', 'root', undefined, 5], ['ID_2', 'child', 'ID_1', 8]]);
    // The byte-order mark counts in every offset (FBL 2.6).
    expect(node(result, 'ID_1').ownSpan.start).toBe(offsetOf(text, '<node TEXT=\'root\''));
    expect(node(result, 'ID_1').ownSpan.end).toBe(offsetOf(text, '</node >', true));
  });
});

describe('a body that is no map', () => {
  // MindmapFreeplanePluginTests.ABodyThatIsNotAMap_IsUnreadable_WithTheReaderSReason; MindmapDocumentTests.Parse_AMapWithTwoRoots_Throws
  it('with two root nodes is unreadable, with the reader\'s reason', () => {
    expect(unparseable(recorded('inline/two-roots.mm').bytes)).toBe('A map has exactly one root node; this one has 2.');
    expect(unparseable('<map><node TEXT="a"/><node TEXT="b"/></map>')).toBe('A map has exactly one root node; this one has 2.');
  });

  it('with no root node is unreadable', () => {
    expect(unparseable('<map version="freeplane 1.12.15">\n<bookmarks/>\n</map>\n')).toBe('A map has exactly one root node; this one has 0.');
    expect(unparseable('<map/>')).toBe('A map has exactly one root node; this one has 0.');
  });

  // MindmapDocumentTests.Parse_AFileThatIsNotAMap_Throws
  it('with another document element is unreadable', () => {
    expect(unparseable('<html><body/></html>')).toBe('The file does not start with a <map> element.');
  });

  // MindmapDocumentTests.Parse_AMalformedFile_ThrowsNamingTheProblem
  it.each([
    ['an element that is not closed', '<map><node TEXT=\'unclosed\'></map>'],
    ['a start tag that is not closed', inline['inline/unclosed.mm']],
    ['text and no element', inline['inline/not-a-map.mm']],
    ['nothing at all', ''],
    ['a second document element', '<map><node TEXT="a"/></map><map/>'],
    ['an attribute without quotes', '<map><node TEXT=a/></map>'],
    ['an entity XML does not define', '<map><node TEXT="a&nbsp;b" ID="ID_1"/></map>'],
    ['an ampersand that starts no reference', '<map><node TEXT="a & b" ID="ID_1"/></map>'],
  ])('that is not well-formed XML is unreadable: %s', (_name, text) => {
    expect(unparseable(text)).toMatch(/^The map is not well-formed XML: ./);
  });

  it('that is not UTF-8 is unreadable (FBL 7.5)', () => {
    const bytes = utf8('<map><node TEXT="caf?" ID="ID_1"/></map>');
    bytes[bytes.indexOf(0x3f)] = 0xe9;
    unparseable(bytes);
  });

  it('opens read-only, and its finding is the only one', () => {
    const body = open(recorded('inline/two-roots.mm').bytes);
    expect(body.isReadOnly).toBe(true);
    expect(body.model.elements).toEqual([]);
    expect(body.model.findings.map((finding) => finding.code)).toEqual([findingCodes.unparseable]);
  });
});

describe('the template of a new map', () => {
  const template = (fileName: string): string => textOf(produceTemplate(binding(), undefined, fileName, () => 'unused', freeplaneMm)!);

  // The body standalone's MindmapDocumentFactory gives a new map (mindmap.md, section 2), which its
  // plugin's `Template` hands on.
  it('is one root node named after the file\'s base name, with an id of its own, in Freeplane\'s layout', () => {
    expect(template('plans/roadmap.mm')).toMatch(/^<map version="freeplane 1\.11\.5">\n<node TEXT="roadmap" ID="ID_[0-9a-z]{25}"\/>\n<\/map>$/);
    expect(template('roadmap.mm')).not.toBe(template('roadmap.mm'));
  });

  it('escapes the name as an attribute', () => {
    expect(template('R&D "next" <draft>.mm')).toContain('<node TEXT="R&amp;D &quot;next&quot; &lt;draft&gt;" ID="ID_');
  });

  // FBL 13: a template reads through its binding with no finding of severity warning or above.
  // CommandsTests.AnyCommand_OnAMapWithNoBodyYet_OpensAnEmptyMapAndWritesItOnSave is the store's;
  // what is left of it here is that a new map is one that reads and takes a first child.
  it('reads through the binding with no finding', () => {
    const body = open(template('roadmap.mm'));
    expect(body.isReadOnly).toBe(false);
    expect(body.model.findings).toEqual([]);
    expect(body.model.elements).toHaveLength(1);
    expect(body.model.elements[0].attributes.text).toBe('roadmap');
    expect(body.model.elements[0].idIsStored).toBe(true);
  });
});
