import { describe, expect, it } from 'vitest';
import type { ModelChange, PluginBody } from '../../../../src/core/fbl';
import { afterStep, architecture, bodyText, change, childrenOf, node, offsetOf, open, recorded, refusal, textOf, undoAll, written, type TranscriptEdit } from '../support';

// The persistence plugin `net.etalii.adp.freeplane.mm` plans (etalii.adp spec 027, T065, research
// R9): what standalone's commands do to the XML in place, it gives as splices of the body's bytes,
// so everything an edit does not touch is kept byte for byte. Every test drives the plugin through
// the library as a host does, and `change` of ../support holds each planned edit to FBL 11.4: only
// its splices change, and its inverse restores the bytes. A comment above a test names its
// counterpart in standalone at `5756a07`, under
// `src/diagrams/mindmap/backend/EtAlii.Adp.Diagram.Mindmap.Tests/`: `Commands.Tests.cs`
// (`CommandsTests`) and the editing cases of `MindmapDocument.Tests.cs` (`MindmapDocumentTests`).
// No fixture of etalii.adp states the bytes of a mind map edit (etalii.adp issue 141), so those
// tests and the transcript at the end of this file are the statement of them.

const backend = 'ID_411002937';
const client = 'ID_411002938';
const contextService = 'ID_88117420';
const leaf = 'ID_88117422';
const hierarchy = 'ID_88117425';
const rich = 'ID_411002940';
const root = 'ID_1730044821';

/** A map as ADP writes one: a node on each line, LF. */
const lf = '<map version="freeplane 1.12.15">\n<node TEXT="root" ID="ID_1">\n<node TEXT="one" ID="ID_2"/>\n<node TEXT="two" ID="ID_3"/>\n<node TEXT="three" ID="ID_4"/>\n</node>\n</map>\n';
/** The same map as Freeplane saves one on Windows. */
const crlf = lf.replaceAll('\n', '\r\n');
/** A map on one line, as a test or another tool may write one. */
const oneLine = '<map version="freeplane 1.12.15"><node TEXT="root" ID="ID_1"><node TEXT="a" ID="ID_2"><node TEXT="b" ID="ID_3"/></node><node TEXT="c" ID="ID_4"/></node></map>';

const fresh = '<node TEXT="new" ID="ID_n"/>';
const add = (parent: string | undefined, more: Partial<Extract<ModelChange, { kind: 'add' }>> = {}): ModelChange =>
  ({ kind: 'add', type: 'Node', id: 'ID_n', attributes: { text: 'new' }, ...(parent === undefined ? {} : { parent }), ...more });
const set = (id: string, attributes: Readonly<Record<string, unknown>>): ModelChange => ({ kind: 'set', id, attributes });
const note = (...lines: string[]): string => `<richcontent TYPE="NOTE"><html><head/><body>${lines.map((line) => `<p>${line}</p>`).join('')}</body></html></richcontent>`;
const texts = (body: PluginBody, parent: string): unknown[] => childrenOf(body, parent).map((child) => child.attributes.text);
const ids = (body: PluginBody, parent: string): string[] => childrenOf(body, parent).map((child) => child.id);

describe('add', () => {
  // MindmapDocumentTests.AddChild_AppendsAsTheLastChild_AndWritesOnePerLine; CommandsTests.AddChild_AppendsLast_AndUndoRemovesExactlyThatNode
  it('appends a node as the last child, on a line of its own, and undo removes exactly that node', () => {
    const original = architecture();
    const body = open(original);
    const end = node(body, backend).ownSpan.end - '</node>'.length;
    const splices = change(body, { kind: 'add', type: 'Node', id: 'ID_new', attributes: { text: 'Logging' }, parent: backend });
    // The genuine save has CRLF between its nodes, so the new line ends with CRLF too.
    expect(splices).toEqual([{ operation: 'insert-entry', start: end, end, text: '<node TEXT="Logging" ID="ID_new"/>\r\n' }]);
    expect(childrenOf(body, backend).at(-1)).toMatchObject({ id: 'ID_new', idIsStored: true, attributes: { text: 'Logging' } });
    expect(bodyText(body)).toContain('<node TEXT="Logging" ID="ID_new"/>\r\n</node>');

    expect(body.undo()).toHaveProperty('done');
    expect(body.bytes).toEqual(original);
    expect(body.redo()).toHaveProperty('done');
    expect(childrenOf(body, backend).at(-1)!.id).toBe('ID_new');
  });

  // MindmapDocumentTests.AddSibling_InsertsRightAfterTheNode; CommandsTests.AddSibling_InsertsAfter_AndRoundTripsThroughUndo
  it('with the position after a node, inserts right after it, and undo gives the bytes back', () => {
    const original = architecture();
    const body = open(original);
    const end = node(body, contextService).ownSpan.end;
    const splices = change(body, { kind: 'add', type: 'Node', id: 'ID_new', attributes: { text: 'Projects' }, parent: backend, position: { after: contextService } });
    expect(splices).toEqual([{ operation: 'insert-entry', start: end, end, text: '\r\n<node TEXT="Projects" ID="ID_new"/>' }]);
    expect(texts(body, backend)).toEqual(['Context service', 'Projects', 'Commands & history', 'Hierarchy']);
    expect(body.undo()).toHaveProperty('done');
    expect(body.bytes).toEqual(original);
  });

  // CommandsTests.AddSibling_OfTheRoot_IsRejectedWithoutAnException
  it('beside the root node is refused: a map has one', () => {
    const body = open(architecture());
    expect(refusal(body, add(undefined, { position: { after: root } }))).toBe('The root node cannot have a sibling.');
    expect(refusal(body, add(undefined))).toBe('The root node cannot have a sibling.');
    expect(body.canUndo).toBe(false);
  });

  it('into a node that has no child opens its tag (FBL 6.1, `self-close`)', () => {
    const body = open(lf);
    const end = node(body, 'ID_3').ownSpan.end;
    expect(change(body, add('ID_3'))).toEqual([
      { operation: 'self-close', start: end - 2, end, text: '>' },
      { operation: 'insert-entry', start: end, end, text: `\n${fresh}\n` },
      { operation: 'self-close', start: end, end, text: '</node>' },
    ]);
    expect(written(body, 'ID_3')).toBe(`<node TEXT="two" ID="ID_3">\n${fresh}\n</node>`);
    expect(node(body, 'ID_n').parentId).toBe('ID_3');
  });

  it.each<[string, ModelChange, string[]]>([
    ['no position: last', add('ID_1'), ['ID_2', 'ID_3', 'ID_4', 'ID_n']],
    ['index 0: first', add('ID_1', { position: { index: 0 } }), ['ID_n', 'ID_2', 'ID_3', 'ID_4']],
    ['index 1', add('ID_1', { position: { index: 1 } }), ['ID_2', 'ID_n', 'ID_3', 'ID_4']],
    ['the index of the number of children: last', add('ID_1', { position: { index: 3 } }), ['ID_2', 'ID_3', 'ID_4', 'ID_n']],
    ['before a node', add('ID_1', { position: { before: 'ID_4' } }), ['ID_2', 'ID_3', 'ID_n', 'ID_4']],
    ['after a node', add('ID_1', { position: { after: 'ID_2' } }), ['ID_2', 'ID_n', 'ID_3', 'ID_4']],
    ['after the last node', add('ID_1', { position: { after: 'ID_4' } }), ['ID_2', 'ID_3', 'ID_4', 'ID_n']],
  ])('honours its position (FBL 11.2): %s', (_name, made, order) => {
    const body = open(lf);
    expect(change(body, made)).toHaveLength(1);
    expect(ids(body, 'ID_1')).toEqual(order);
    // Wherever it goes, the map still has one node on each line.
    expect(bodyText(body).split('\n')).toHaveLength(lf.split('\n').length + 1);
    expect(bodyText(body)).toContain(`${fresh}\n`);
  });

  it('at an index is one insertion directly before the node that is there (FBL 6.4)', () => {
    const body = open(lf);
    const start = node(body, 'ID_3').ownSpan.start;
    expect(change(body, add('ID_1', { position: { index: 1 } }))).toEqual([{ operation: 'insert-entry', start, end: start, text: `${fresh}\n` }]);
  });

  it('writes the line ending the file has between its nodes: the one after `<map>`', () => {
    const windows = open(crlf);
    change(windows, add('ID_1'));
    expect(bodyText(windows)).toBe(crlf.replace('</node>\r\n</map>', `${fresh}\r\n</node>\r\n</map>`));

    // CRLF between the nodes and an LF line among them, as a genuine save has inside its notes.
    const mixed = '<map version="freeplane 1.12.15">\r\n<node TEXT="a&#xd;b" ID="ID_1">\r\n<node TEXT="lf line" ID="ID_2"/>\n</node>\r\n</map>\r\n';
    const both = open(mixed);
    change(both, add('ID_1'));
    expect(bodyText(both)).toBe(mixed.replace('</node>\r\n</map>', `${fresh}\r\n</node>\r\n</map>`));

    const unix = '<map>\n<node TEXT="root" ID="ID_1">\r\n<node TEXT="a" ID="ID_2"/>\r\n</node>\r\n</map>';
    const after = open(unix);
    change(after, add('ID_1'));
    expect(bodyText(after)).toBe(unix.replace('</node>\r\n</map>', `${fresh}\n</node>\r\n</map>`));
  });

  it('into a map written on one line writes LF around the new node, and nothing else moves', () => {
    const child = open(oneLine);
    change(child, add('ID_1'));
    expect(bodyText(child)).toBe(oneLine.replace('</node></map>', `\n${fresh}\n</node></map>`));

    const sibling = open(oneLine);
    change(sibling, add('ID_1', { position: { after: 'ID_2' } }));
    expect(bodyText(sibling)).toBe(oneLine.replace('<node TEXT="c"', `\n${fresh}<node TEXT="c"`));

    const before = open(oneLine);
    change(before, add('ID_1', { position: { index: 0 } }));
    expect(bodyText(before)).toBe(oneLine.replace('<node TEXT="a"', `${fresh}\n<node TEXT="a"`));
  });

  it('writes TEXT and ID in that order, escaped as an attribute, then a link and notes when it is given them', () => {
    const body = open(lf);
    change(body, { kind: 'add', type: 'Node', id: 'ID_n', attributes: { text: 'a & b < c > "d"\ne — ü 🌐', link: 'https://example.org/a?b=1&c=2', notes: 'first <line>\nsecond & last' }, parent: 'ID_1' });
    expect(written(body, 'ID_n')).toBe(
      `<node TEXT="a &amp; b &lt; c &gt; &quot;d&quot;&#xa;e — ü 🌐" ID="ID_n" LINK="https://example.org/a?b=1&amp;c=2">\n${note('first &lt;line&gt;', 'second &amp; last')}\n</node>`,
    );
    expect(node(body, 'ID_n').attributes).toEqual({ text: 'a & b < c > "d"\ne — ü 🌐', link: 'https://example.org/a?b=1&c=2', notes: 'first <line>\nsecond & last', folded: false, storedId: 'ID_n' });
  });

  it('without a text writes an empty TEXT', () => {
    const body = open(lf);
    change(body, { kind: 'add', type: 'Node', id: 'ID_n', attributes: {}, parent: 'ID_3' });
    expect(written(body, 'ID_n')).toBe('<node TEXT="" ID="ID_n"/>');
  });

  it('is refused with the sentence when it cannot be made', () => {
    const body = open(lf);
    expect(refusal(body, add('ID_1', { id: 'ID_3' }))).toBe('A node with that id already exists.');
    expect(refusal(body, add('ID_gone'))).toBe('The node no longer exists.');
    expect(refusal(body, add('ID_1', { position: { after: 'ID_1' } }))).toBe('The node to place it beside is not under that node.');
    expect(refusal(body, add('ID_1', { position: { before: 'ID_gone' } }))).toBe('The node to place it beside is not under that node.');
    expect(refusal(body, add('ID_1', { type: 'Branch' }))).toBe('A mind map holds only nodes, so no `Branch` is added.');
    expect(refusal(body, { kind: 'add', type: 'Node', attributes: { text: 'new' }, parent: 'ID_1' })).toBe('A new node needs an id.');
    expect(refusal(body, add('ID_1', { attributes: { text: 'new', folded: true } }))).toBe('The `folded` of a node cannot be changed.');
  });
});

describe('set text', () => {
  // CommandsTests.SetText_UndoRestoresThePreviousText
  it('replaces the value of TEXT and nothing else, and undo restores the text', () => {
    const body = open(architecture());
    const start = offsetOf(bodyText(body), 'TEXT="ICommand"') + 'TEXT="'.length;
    expect(change(body, set(leaf, { text: 'renamed' }))).toEqual([{ operation: 'replace-value', start, end: start + 'ICommand'.length, text: 'renamed' }]);
    expect(node(body, leaf).attributes.text).toBe('renamed');
    expect(body.undo()).toHaveProperty('done');
    expect(node(body, leaf).attributes.text).toBe('ICommand');
    expect(body.bytes).toEqual(architecture());
  });

  // MindmapDocumentTests.SetText_ToEmpty_IsKept; CommandsTests.SetText_ToEmpty_IsPersisted
  it('to the empty text keeps the attribute, empty', () => {
    const body = open(architecture());
    change(body, set(leaf, { text: '' }));
    expect(bodyText(body)).toContain('TEXT="" ID="ID_88117422"');
    expect(node(body, leaf).attributes.text).toBe('');
  });

  // MindmapDocumentTests.SetText_OnARichContentNode_ReplacesTheMarkupWithPlainText
  it('of a node whose text is an HTML body writes TEXT after the last attribute and takes the body out', () => {
    const body = open(architecture());
    const before = bodyText(body);
    const attributes = offsetOf(before, 'MODIFIED="1755820913000"', true);
    const markup = { start: offsetOf(before, '<richcontent TYPE="NODE">'), end: offsetOf(before, '</html>\n</richcontent>', true) };
    expect(change(body, set(rich, { text: 'plain now' }))).toEqual([
      { operation: 'insert-key', start: attributes, end: attributes, text: ' TEXT="plain now"' },
      { operation: 'remove-key', start: markup.start, end: markup.end, text: '' },
    ]);
    expect(node(body, rich).attributes.text).toBe('plain now');
    expect(bodyText(body)).not.toContain('rich content');
    // The line break that followed the markup stays, as standalone leaves it.
    expect(written(body, rich)).toBe('<node ID="ID_411002940" CREATED="1755820813000" MODIFIED="1755820913000" TEXT="plain now">\r\n</node>');
  });

  it('of a node that holds nothing but its HTML body closes the tag again', () => {
    const text = '<map><node TEXT="root" ID="ID_1"><node ID="ID_2"><richcontent TYPE="NODE"><html><body><p>formatted</p></body></html></richcontent></node></node></map>';
    const body = open(text);
    const markup = { start: offsetOf(text, '<richcontent'), end: offsetOf(text, '</richcontent>', true) };
    expect(change(body, set('ID_2', { text: 'plain' }))).toEqual([
      { operation: 'insert-key', start: markup.start - 1, end: markup.start - 1, text: ' TEXT="plain"' },
      { operation: 'self-close', start: markup.start - 1, end: markup.start, text: '/>' },
      { operation: 'remove-key', start: markup.start, end: markup.end, text: '' },
      { operation: 'self-close', start: markup.end, end: markup.end + '</node>'.length, text: '' },
    ]);
    expect(bodyText(body)).toBe('<map><node TEXT="root" ID="ID_1"><node ID="ID_2" TEXT="plain"/></node></map>');
  });

  it('of a node with both a TEXT and an HTML body replaces the one and takes out the other', () => {
    const body = open('<map><node TEXT="old" ID="ID_1"><richcontent TYPE="NODE"><html><body><p>formatted</p></body></html></richcontent>\n<node TEXT="child" ID="ID_2"/>\n</node></map>');
    change(body, set('ID_1', { text: 'plain' }));
    expect(bodyText(body)).toBe('<map><node TEXT="plain" ID="ID_1">\n<node TEXT="child" ID="ID_2"/>\n</node></map>');
  });

  // MindmapDocumentTests.Edits_EscapeWhatXmlRequires_AndNothingElse
  it('escapes what XML requires and nothing else', () => {
    const body = open(architecture());
    change(body, set(leaf, { text: 'a & b < c > "d" — ü' }));
    expect(bodyText(body)).toContain('TEXT="a &amp; b &lt; c &gt; &quot;d&quot; — ü"');
    expect(node(body, leaf).attributes.text).toBe('a & b < c > "d" — ü');
  });

  it('writes a line break and a carriage return as references, which read back', () => {
    const body = open(lf);
    change(body, set('ID_3', { text: 'two\nlines\r\nand an end' }));
    expect(written(body, 'ID_3')).toBe('<node TEXT="two&#xa;lines&#xd;&#xa;and an end" ID="ID_3"/>');
    expect(node(body, 'ID_3').attributes.text).toBe('two\nlines\r\nand an end');
  });

  it('counts its offsets in bytes: text of several bytes before and in the value', () => {
    const body = open(architecture());
    const before = bodyText(body);
    const start = offsetOf(before, 'TEXT="Ünïcödé') + 'TEXT="'.length;
    const end = offsetOf(before, 'emoji 🌐', true);
    expect(end - start).toBeGreaterThan('Ünïcödé — dash, curly ‘quotes’, emoji 🌐'.length);
    expect(change(body, set('ID_411002944', { text: '🌐 ünï — ‘cödé’' }))).toEqual([{ operation: 'replace-value', start, end, text: '🌐 ünï — ‘cödé’' }]);
    expect(node(body, 'ID_411002944').attributes.text).toBe('🌐 ünï — ‘cödé’');
    // A node after it is still found where it is.
    change(body, set('ID_411002949', { text: 'niveau 5 — très profond' }));
    expect(written(body, 'ID_411002949')).toBe('<node TEXT="niveau 5 — très profond" ID="ID_411002949" CREATED="1755820824000" MODIFIED="1755820924000"/>');
  });

  it('of a node without a TEXT writes one after the last attribute', () => {
    const text = '<map><node ID="ID_1" FOLDED="true"/></map>';
    const body = open(text);
    const at = offsetOf(text, 'FOLDED="true"', true);
    expect(change(body, set('ID_1', { text: 'named' }))).toEqual([{ operation: 'insert-key', start: at, end: at, text: ' TEXT="named"' }]);
  });

  it('keeps the quotes and the spacing a tag is written with', () => {
    const body = open('<map><node  TEXT=\'a\'   ID="ID_1" /></map>');
    change(body, set('ID_1', { text: 'it\'s "b"' }));
    expect(bodyText(body)).toBe('<map><node  TEXT=\'it&apos;s &quot;b&quot;\'   ID="ID_1" /></map>');
    expect(node(body, 'ID_1').attributes.text).toBe('it\'s "b"');
  });

  it('to the text it has plans no splice', () => {
    const body = open(lf);
    expect(change(body, set('ID_3', { text: 'two' }))).toEqual([]);
    expect(body.canUndo).toBe(false);
  });
});

describe('set notes', () => {
  // MindmapDocumentTests.SetNotes_AddsThenUpdatesThenRemovesTheNote; CommandsTests.SetNotes_UndoRemovesANoteThatWasNotThere
  it('adds, then updates, then removes the note, and the node is closed as it was', () => {
    const original = architecture();
    const body = open(original);
    const end = node(body, leaf).ownSpan.end;
    expect(change(body, set(leaf, { notes: 'first line\nsecond line' }))).toEqual([
      { operation: 'self-close', start: end - 2, end, text: '>' },
      { operation: 'insert-key', start: end, end, text: `\r\n${note('first line', 'second line')}\r\n` },
      { operation: 'self-close', start: end, end, text: '</node>' },
    ]);
    expect(node(body, leaf).attributes.notes).toBe('first line\nsecond line');

    const splices = change(body, set(leaf, { notes: 'changed' }));
    expect(splices.map((splice) => [splice.operation, splice.text])).toEqual([['replace-value', '<html><head/><body><p>changed</p></body></html>']]);
    expect(node(body, leaf).attributes.notes).toBe('changed');
    expect(written(body, leaf).split('<richcontent').length - 1).toBe(1);

    change(body, set(leaf, { notes: '' }));
    expect(node(body, leaf).attributes.notes).toBe('');
    expect(written(body, leaf)).not.toContain('richcontent');
    // With the line breaks around it, so the node is self-closed again and the file is what it was.
    expect(body.bytes).toEqual(original);

    undoAll(body);
    expect(body.bytes).toEqual(original);
  });

  it('go before the first child node, on a line of their own', () => {
    const body = open(lf);
    const start = node(body, 'ID_2').ownSpan.start;
    expect(change(body, set('ID_1', { notes: 'a note' }))).toEqual([{ operation: 'insert-key', start, end: start, text: `${note('a note')}\n` }]);
    expect(bodyText(body)).toBe(lf.replace('<node TEXT="one"', `${note('a note')}\n<node TEXT="one"`));
  });

  it('go last in a node that holds other things and no child node', () => {
    const text = '<map>\n<node TEXT="root" ID="ID_1">\n<icon BUILTIN="idea"/>\n</node>\n</map>\n';
    const body = open(text);
    change(body, set('ID_1', { notes: 'a note' }));
    expect(bodyText(body)).toBe(text.replace('</node>', `${note('a note')}\n</node>`));

    const tight = open('<map><node TEXT="root" ID="ID_1"><icon BUILTIN="idea"/></node></map>');
    change(tight, set('ID_1', { notes: 'a note' }));
    expect(bodyText(tight)).toBe(`<map><node TEXT="root" ID="ID_1"><icon BUILTIN="idea"/>\n${note('a note')}\n</node></map>`);
  });

  it('replace the body of the note the file has, whatever its layout, and keep its tag', () => {
    const body = open(architecture());
    const before = bodyText(body);
    const start = offsetOf(before, '<richcontent TYPE="NOTE">', true);
    const end = offsetOf(before, '</richcontent>');
    expect(change(body, set(root, { notes: 'First line.\nSecond line.' }))).toEqual([
      { operation: 'replace-value', start, end, text: '<html><head/><body><p>First line.</p><p>Second line.</p></body></html>' },
    ]);
    expect(bodyText(body)).toContain(`<hook NAME="AutomaticEdgeColor" COUNTER="5" RULE="ON_BRANCH_CREATION"/>\r\n${note('First line.', 'Second line.')}\r\n<node TEXT="Backend"`);

    const typed = open('<map><node TEXT="root" ID="ID_1"><richcontent CONTENT-TYPE="xml/" TYPE="NOTE"/><node TEXT="a" ID="ID_2"/></node></map>');
    change(typed, set('ID_1', { notes: 'filled' }));
    expect(bodyText(typed)).toBe('<map><node TEXT="root" ID="ID_1"><richcontent CONTENT-TYPE="xml/" TYPE="NOTE"><html><head/><body><p>filled</p></body></html></richcontent><node TEXT="a" ID="ID_2"/></node></map>');
  });

  it('emptied take the note out with the line break after it, and leave what else the node holds', () => {
    const body = open(architecture());
    const before = bodyText(body);
    const start = offsetOf(before, '<richcontent TYPE="NOTE">');
    const end = offsetOf(before, '</html></richcontent>\r\n', true);
    expect(change(body, set(root, { notes: '' }))).toEqual([{ operation: 'remove-key', start, end, text: '' }]);
    expect(node(body, root).attributes.notes).toBe('');
    expect(bodyText(body)).toContain('<hook NAME="AutomaticEdgeColor" COUNTER="5" RULE="ON_BRANCH_CREATION"/>\r\n<node TEXT="Backend"');
  });

  it('emptied close a node that held nothing else, and null empties as the empty text does', () => {
    const body = open(recorded('inline/rich-and-links.mm').bytes);
    const before = bodyText(body);
    const markup = { start: offsetOf(before, '<richcontent TYPE="NOTE"><html><head/><body/>'), end: offsetOf(before, '<body/></html></richcontent>', true) };
    expect(change(body, set('ID_E', { notes: null }))).toEqual([
      { operation: 'self-close', start: markup.start - 1, end: markup.start, text: '/>' },
      { operation: 'remove-key', start: markup.start, end: markup.end, text: '' },
      { operation: 'self-close', start: markup.end, end: markup.end + '</node>'.length, text: '' },
    ]);
    expect(written(body, 'ID_E')).toBe('<node TEXT="empty note" ID="ID_E"/>');
  });

  it('are written a paragraph a line, escaped as text, and leave a formatted text alone', () => {
    const body = open(recorded('inline/rich-and-links.mm').bytes);
    change(body, set('ID_F', { notes: 'a & b < c > "d"\n\n— ü 🌐' }));
    expect(written(body, 'ID_F')).toContain(note('a &amp; b &lt; c &gt; "d"', '', '— ü 🌐'));
    expect(node(body, 'ID_F').attributes).toMatchObject({ text: 'Formatted\ntext here', notes: 'a & b < c > "d"\n\n— ü 🌐' });
    expect(written(body, 'ID_F')).toContain('<richcontent TYPE="NODE">\n<html>\n<head/>\n<body>\n<p>Formatted</p>\n<p>  text   here </p>\n</body>\n</html>\n</richcontent>\r\n');
  });

  it('emptied where there are none, or set to what they are, plan no splice', () => {
    const body = open(architecture());
    expect(change(body, set(leaf, { notes: '' }))).toEqual([]);
    const noted = open(`<map><node TEXT="root" ID="ID_1">${note('as it is')}</node></map>`);
    expect(change(noted, set('ID_1', { notes: 'as it is' }))).toEqual([]);
  });
});

describe('set link', () => {
  // MindmapDocumentTests.SetLink_SetsAndClearsTheAttribute; CommandsTests.SetLink_UndoRestoresNoLink
  it('writes LINK after the last attribute, and takes it out again with the space before it', () => {
    const original = architecture();
    const body = open(original);
    const at = node(body, leaf).ownSpan.end - '/>'.length;
    expect(change(body, set(leaf, { link: '../x.cs' }))).toEqual([{ operation: 'insert-key', start: at, end: at, text: ' LINK="../x.cs"' }]);
    expect(node(body, leaf).attributes.link).toBe('../x.cs');

    expect(change(body, set(leaf, { link: null }))).toEqual([{ operation: 'remove-key', start: at, end: at + ' LINK="../x.cs"'.length, text: '' }]);
    expect('link' in node(body, leaf).attributes).toBe(false);
    expect(body.bytes).toEqual(original);

    expect(body.undo()).toHaveProperty('done');
    expect(node(body, leaf).attributes.link).toBe('../x.cs');
    expect(body.undo()).toHaveProperty('done');
    expect('link' in node(body, leaf).attributes).toBe(false);
  });

  // CommandsTests.SetLink_ToNull_UnlinksAndUndoRelinks
  it('to nothing unlinks, and undo links again', () => {
    const body = open(architecture());
    change(body, set(contextService, { link: null }));
    expect('link' in node(body, contextService).attributes).toBe(false);
    expect(written(body, contextService)).toMatch(/^<node TEXT="Context service" ID="ID_88117420" CREATED="1755820802000" MODIFIED="1755820900000"><richcontent/);
    expect(body.undo()).toHaveProperty('done');
    expect(node(body, contextService).attributes.link).toBe('../../../../backend/EtAlii.Adp.Backend/Context/ContextServiceImpl.cs');
  });

  it('to the empty text unlinks too: an emptied link is an unlink, also where the file writes an empty LINK', () => {
    const body = open(recorded('inline/rich-and-links.mm').bytes);
    change(body, set('ID_W', { link: '' }));
    expect(written(body, 'ID_W')).toBe('<node TEXT="web" ID="ID_W" FOLDED="false"/>');
    change(body, set('ID_R', { link: '' }));
    expect(bodyText(body)).toContain('<node TEXT="root" ID="ID_R">\r\n');
  });

  it('replaces the value of the LINK the node has, escaped as an attribute', () => {
    const body = open(recorded('inline/rich-and-links.mm').bytes);
    const splices = change(body, set('ID_W', { link: 'https://example.org/search?q="mind map"&lang=nl' }));
    expect(splices.map((splice) => splice.operation)).toEqual(['replace-value']);
    expect(written(body, 'ID_W')).toBe('<node TEXT="web" ID="ID_W" LINK="https://example.org/search?q=&quot;mind map&quot;&amp;lang=nl" FOLDED="false"/>');
    change(body, set('ID_R', { link: 'notes.md' }));
    expect(bodyText(body)).toContain('<node TEXT="root" ID="ID_R" LINK="notes.md">\r\n');
  });

  it('removed where there is none, or set to what it is, plans no splice', () => {
    const body = open(architecture());
    expect(change(body, set(leaf, { link: null }))).toEqual([]);
    expect(change(body, set(contextService, { link: '../../../../backend/EtAlii.Adp.Backend/Context/ContextServiceImpl.cs' }))).toEqual([]);
  });
});

describe('set', () => {
  it('of text, notes and link at once is one edit, each written where it goes', () => {
    const original = architecture();
    const body = open(original);
    change(body, set(leaf, { text: 'T', notes: 'N', link: 'L' }));
    expect(written(body, leaf)).toBe(`<node TEXT="T" ID="ID_88117422" CREATED="1755820804000" MODIFIED="1755820904000" LINK="L">\r\n${note('N')}\r\n</node>`);
    expect(body.undo()).toHaveProperty('done');
    expect(body.bytes).toEqual(original);

    const bare = open('<map><node ID="ID_1"/></map>');
    change(bare, set('ID_1', { link: 'L', text: 'T' }));
    expect(bodyText(bare)).toBe('<map><node ID="ID_1" TEXT="T" LINK="L"/></map>');
  });

  it('of a formatted text and its note at once closes a node that held nothing else', () => {
    const body = open(`<map><node ID="ID_1"><richcontent TYPE="NODE"><html><body><p>formatted</p></body></html></richcontent>\n${note('gone')}\n</node></map>`);
    change(body, set('ID_1', { text: 'plain', notes: '' }));
    expect(bodyText(body)).toBe('<map><node ID="ID_1" TEXT="plain"/></map>');
  });

  // CommandsTests.AnyCommand_OnANodeThatIsGone_IsRejectedWithAMessage
  it('of a node that is gone is refused with a sentence', () => {
    const body = open(architecture());
    expect(refusal(body, set('ID_does_not_exist', { text: 'x' }))).toBe('The node no longer exists.');
    expect(body.canUndo).toBe(false);
  });

  it('of what the file gives and ADP never writes is refused', () => {
    const body = open(architecture());
    expect(refusal(body, set(hierarchy, { folded: false }))).toBe('The `folded` of a node cannot be changed.');
    expect(refusal(body, set(backend, { position: 'left' }))).toBe('The `position` of a node cannot be changed.');
    expect(refusal(body, set(backend, { storedId: 'ID_other' }))).toBe('The `storedId` of a node cannot be changed.');
    expect(refusal(body, set(backend, { text: 'Kept out', colour: 'red' }))).toBe('The `colour` of a node cannot be changed.');
  });

  // CommandsTests.AnyCommand_OnAMapThatIsNotAMap_IsRejectedNamingTheFile. The sentence is the
  // library's, which never asks the plugin to plan for a body it could not read (FBL 7.5).
  it('of a body that is no map is refused, and nothing is written', () => {
    const body = open('<html/>');
    refusal(body, set('x', { text: 'y' }));
    expect(bodyText(body)).toBe('<html/>');
  });

  it('of a later holder of an ID the file gives twice changes that node, not the first', () => {
    const body = open(recorded('inline/duplicate-id.mm').bytes);
    const second = body.model.elements[2];
    expect(second.attributes.storedId).toBe('ID_2');
    change(body, set(second.id, { text: 'the second' }));
    expect(bodyText(body)).toBe('<map version="freeplane 1.12.15"><node TEXT="root" ID="ID_1"><node TEXT="first" ID="ID_2"/><node TEXT="the second" ID="ID_2"/></node></map>');
  });
});

describe('remove', () => {
  // MindmapDocumentTests.RemoveThenRestore_PutsTheSubtreeBackExactly; CommandsTests.Remove_UndoPutsTheWholeSubtreeBackByteForByte
  it('takes a node out with everything under it and the line break after it, and undo puts it back byte for byte', () => {
    const original = architecture();
    const body = open(original);
    const span = node(body, backend).ownSpan;
    // Backend, with 9 nodes under it, notes, links and content ADP does not read.
    expect(change(body, { kind: 'remove', id: backend })).toEqual([{ operation: 'remove-entry', start: span.start, end: span.end + '\r\n'.length, text: '' }]);
    expect(body.model.find(backend)).toBeUndefined();
    expect(body.model.find(contextService)).toBeUndefined();
    expect(body.model.elements).toHaveLength(25 - 10);
    expect(bodyText(body)).toContain('</html></richcontent>\r\n<node TEXT="Client"');

    expect(body.undo()).toHaveProperty('done');
    expect(body.bytes).toEqual(original);
    expect(node(body, contextService).attributes.link).toBe('../../../../backend/EtAlii.Adp.Backend/Context/ContextServiceImpl.cs');
  });

  // CommandsTests.Remove_RedoRemovesItAgain
  it('is removed again by redo', () => {
    const body = open(architecture());
    change(body, { kind: 'remove', id: hierarchy });
    expect(body.undo()).toHaveProperty('done');
    expect(body.redo()).toHaveProperty('done');
    expect(body.model.find(hierarchy)).toBeUndefined();
    expect(body.model.find('ID_88117428')).toBeUndefined();
  });

  // MindmapDocumentTests.Remove_TheRoot_IsRefused; CommandsTests.Remove_TheRoot_IsRejected
  it('of the root node is refused', () => {
    const body = open(architecture());
    expect(refusal(body, { kind: 'remove', id: root })).toBe('The root node cannot be removed.');
    expect(refusal(body, { kind: 'remove', id: 'ID_gone' })).toBe('The node no longer exists.');
    expect(body.model.elements).toHaveLength(25);
  });

  it('of the last child on its line leaves its parent open, as standalone leaves it', () => {
    const body = open(lf);
    change(body, { kind: 'remove', id: 'ID_2' });
    change(body, { kind: 'remove', id: 'ID_3' });
    change(body, { kind: 'remove', id: 'ID_4' });
    expect(bodyText(body)).toBe('<map version="freeplane 1.12.15">\n<node TEXT="root" ID="ID_1">\n</node>\n</map>\n');
    undoAll(body);
    expect(bodyText(body)).toBe(lf);
  });

  it('of the only thing a node holds closes the tag again (FBL 6.1, `self-close`)', () => {
    const body = open(oneLine);
    const child = node(body, 'ID_3').ownSpan;
    const parent = node(body, 'ID_2').ownSpan;
    expect(change(body, { kind: 'remove', id: 'ID_3' })).toEqual([
      { operation: 'self-close', start: child.start - 1, end: child.start, text: '/>' },
      { operation: 'remove-entry', start: child.start, end: child.end, text: '' },
      { operation: 'self-close', start: child.end, end: parent.end, text: '' },
    ]);
    expect(written(body, 'ID_2')).toBe('<node TEXT="a" ID="ID_2"/>');
  });

  it('of a node with another right behind it takes the node and nothing else', () => {
    const body = open(oneLine);
    const span = node(body, 'ID_2').ownSpan;
    expect(change(body, { kind: 'remove', id: 'ID_2' })).toEqual([{ operation: 'remove-entry', start: span.start, end: span.end, text: '' }]);
    expect(bodyText(body)).toBe('<map version="freeplane 1.12.15"><node TEXT="root" ID="ID_1"><node TEXT="c" ID="ID_4"/></node></map>');
  });
});

describe('move', () => {
  // MindmapDocumentTests.Move_CarriesTheWholeSubtree_ToTheGivenParentAndIndex; CommandsTests.Move_RestoresBothParentAndIndexOnUndo
  it('carries the whole branch to the parent and the index, its bytes unchanged, and undo restores both', () => {
    const original = architecture();
    const body = open(original);
    const span = node(body, hierarchy).ownSpan;
    const branch = written(body, hierarchy);
    const first = childrenOf(body, client)[0].ownSpan.start;
    // Hierarchy is the third child of Backend. It becomes the first child of Client.
    expect(change(body, { kind: 'move', id: hierarchy, parent: client, position: { index: 0 } })).toEqual([
      { operation: 'remove-entry', start: span.start, end: span.end + '\r\n'.length, text: '' },
      { operation: 'insert-entry', start: first, end: first, text: `${branch}\r\n` },
    ]);
    expect(childrenOf(body, client)[0].id).toBe(hierarchy);
    expect(childrenOf(body, hierarchy)).toHaveLength(2);
    expect(ids(body, backend)).not.toContain(hierarchy);
    expect(written(body, hierarchy)).toBe(branch);

    expect(body.undo()).toHaveProperty('done');
    expect(body.bytes).toEqual(original);
    expect(ids(body, backend).indexOf(hierarchy)).toBe(2);
  });

  // MindmapDocumentTests.Move_IntoItsOwnSubtree_IsRefused; CommandsTests.Move_IntoItsOwnSubtree_IsRejected
  it('into its own branch is refused', () => {
    const body = open(architecture());
    expect(refusal(body, { kind: 'move', id: backend, parent: leaf, position: { index: 0 } })).toBe('A node cannot be moved into its own branch.');
    expect(refusal(body, { kind: 'move', id: backend, parent: backend })).toBe('A node cannot be moved into its own branch.');
  });

  // MindmapDocumentTests.Move_TheRoot_IsRefused; CommandsTests.Move_TheRoot_IsRejected
  it('of the root node is refused', () => {
    const body = open(architecture());
    expect(refusal(body, { kind: 'move', id: root, parent: backend, position: { index: 0 } })).toBe('The root node cannot be moved.');
  });

  it('is refused with the sentence when it cannot be made', () => {
    const body = open(architecture());
    expect(refusal(body, { kind: 'move', id: 'ID_gone', parent: backend })).toBe('The node no longer exists.');
    expect(refusal(body, { kind: 'move', id: hierarchy, parent: 'ID_nowhere', position: { index: 0 } })).toBe('The destination node no longer exists.');
    expect(refusal(body, { kind: 'move', id: hierarchy })).toBe('The root node cannot have a sibling.');
    expect(refusal(body, { kind: 'move', id: hierarchy, parent: client, position: { after: backend } })).toBe('The node to place it beside is not under that node.');
  });

  it('counts an index among the children after the node is taken out (FBL 11.2)', () => {
    const first = open(lf);
    const two = node(first, 'ID_3').ownSpan;
    const one = node(first, 'ID_2').ownSpan;
    // The second of three to index 0 is the first.
    expect(change(first, { kind: 'move', id: 'ID_3', parent: 'ID_1', position: { index: 0 } })).toEqual([
      { operation: 'insert-entry', start: one.start, end: one.start, text: '<node TEXT="two" ID="ID_3"/>\n' },
      { operation: 'remove-entry', start: two.start, end: two.end + 1, text: '' },
    ]);
    expect(ids(first, 'ID_1')).toEqual(['ID_3', 'ID_2', 'ID_4']);
    expect(bodyText(first).split('\n')).toHaveLength(lf.split('\n').length);

    // The second of three to index 2 is the last.
    const last = open(lf);
    change(last, { kind: 'move', id: 'ID_3', parent: 'ID_1', position: { index: 2 } });
    expect(ids(last, 'ID_1')).toEqual(['ID_2', 'ID_4', 'ID_3']);
    expect(bodyText(last)).toBe(lf.replace('<node TEXT="two" ID="ID_3"/>\n', '').replace('</node>\n</map>', '<node TEXT="two" ID="ID_3"/>\n</node>\n</map>'));
  });

  it('to the place the node is at plans no splice', () => {
    const body = open(lf);
    expect(change(body, { kind: 'move', id: 'ID_3', parent: 'ID_1', position: { index: 1 } })).toEqual([]);
    expect(change(body, { kind: 'move', id: 'ID_4', parent: 'ID_1' })).toEqual([]);
    expect(change(body, { kind: 'move', id: 'ID_2', parent: 'ID_1', position: { before: 'ID_3' } })).toEqual([]);
    expect(body.canUndo).toBe(false);
  });

  it('without a position makes it the last child, and beside a node puts it there', () => {
    const body = open(crlf);
    change(body, { kind: 'move', id: 'ID_2', parent: 'ID_1' });
    expect(ids(body, 'ID_1')).toEqual(['ID_3', 'ID_4', 'ID_2']);
    change(body, { kind: 'move', id: 'ID_2', parent: 'ID_1', position: { after: 'ID_3' } });
    expect(ids(body, 'ID_1')).toEqual(['ID_3', 'ID_2', 'ID_4']);
    change(body, { kind: 'move', id: 'ID_4', parent: 'ID_1', position: { before: 'ID_3' } });
    expect(ids(body, 'ID_1')).toEqual(['ID_4', 'ID_3', 'ID_2']);
    // Three moves on, the map still has one node on each line, each ending as the file's lines end.
    expect(bodyText(body)).toBe(crlf.replace(/<node TEXT="one".*<node TEXT="three" ID="ID_4"\/>\r\n/s, '<node TEXT="three" ID="ID_4"/>\r\n<node TEXT="two" ID="ID_3"/>\r\n<node TEXT="one" ID="ID_2"/>\r\n'));
    undoAll(body);
    expect(bodyText(body)).toBe(crlf);
  });

  it('under a node that has no child opens its tag, and out of a node that holds nothing else closes it', () => {
    const lines = open(lf);
    change(lines, { kind: 'move', id: 'ID_4', parent: 'ID_2' });
    expect(bodyText(lines)).toBe(
      '<map version="freeplane 1.12.15">\n<node TEXT="root" ID="ID_1">\n<node TEXT="one" ID="ID_2">\n<node TEXT="three" ID="ID_4"/>\n</node>\n<node TEXT="two" ID="ID_3"/>\n</node>\n</map>\n',
    );

    const tight = open(oneLine);
    change(tight, { kind: 'move', id: 'ID_3', parent: 'ID_4' });
    expect(bodyText(tight)).toBe('<map version="freeplane 1.12.15"><node TEXT="root" ID="ID_1"><node TEXT="a" ID="ID_2"/><node TEXT="c" ID="ID_4">\n<node TEXT="b" ID="ID_3"/>\n</node></node></map>');
    undoAll(tight);
    expect(bodyText(tight)).toBe(oneLine);
  });
});

describe('what the plugin does not plan', () => {
  it('is refused with a sentence: a mind map has one type of node, and its file holds no place', () => {
    const body = open(lf);
    for (const made of [
      { kind: 'retype', id: 'ID_2', type: 'Topic', attributes: {} },
      { kind: 'place', id: 'ID_2', x: 10, y: 20 },
      { kind: 'identify', key: 'one', id: 'ID_2' },
    ] satisfies ModelChange[]) {
      expect(refusal(body, made)).toBe('A mind map file cannot hold this change.');
    }
  });
});

describe('storeId', () => {
  // MindmapDocumentTests.AssigningMissingIds_ChangesOnlyTheNodesThatHadNone, as far as it is
  // writing: standalone gives every node without an ID one when it opens the map and writes them
  // all with the first save. Here nothing is written that no change asked for, so the host asks.
  it('writes an ID into the node that had none, after its last attribute, and into no other', () => {
    const handWritten = '<map version="freeplane 1.11.5">\n<node TEXT="root" ID="ID_1">\n<node TEXT="no id yet">\n<node TEXT="child without one either"/>\n</node>\n</node>\n</map>';
    const body = open(handWritten);
    const unnamed = body.model.elements[1];
    const at = offsetOf(handWritten, 'TEXT="no id yet"', true);
    expect(change(body, { kind: 'storeId', id: unnamed.id, newId: 'ID_given' })).toEqual([{ operation: 'insert-key', start: at, end: at, text: ' ID="ID_given"' }]);
    expect(bodyText(body)).toBe(handWritten.replace('<node TEXT="no id yet">', '<node TEXT="no id yet" ID="ID_given">'));
    expect(node(body, 'ID_given')).toMatchObject({ idIsStored: true, parentId: 'ID_1', attributes: { text: 'no id yet', storedId: 'ID_given' } });
    expect(body.model.elements[2].parentId).toBe('ID_given');
    expect(body.model.elements[2].idIsStored).toBe(false);
  });

  it('gives a later holder of an ID one of its own', () => {
    const body = open(recorded('inline/duplicate-id.mm').bytes);
    change(body, { kind: 'storeId', id: body.model.elements[2].id, newId: 'ID_3' });
    expect(bodyText(body)).toContain('<node TEXT="first" ID="ID_2"/><node TEXT="second" ID="ID_3"/>');
    expect(body.model.elements.every((element) => element.idIsStored)).toBe(true);
  });

  it('is refused for an id another node has, and for a node that is gone', () => {
    const body = open(recorded('inline/duplicate-id.mm').bytes);
    expect(refusal(body, { kind: 'storeId', id: body.model.elements[2].id, newId: 'ID_1' })).toBe('A node with that id already exists.');
    expect(refusal(body, { kind: 'storeId', id: 'ID_gone', newId: 'ID_9' })).toBe('The node no longer exists.');
  });
});

describe('what an edit does not touch is kept byte for byte', () => {
  const edits: readonly ModelChange[] = [
    set(backend, { text: 'Back end' }),
    set(backend, { notes: 'Two\nlines' }),
    set(backend, { link: 'backend/' }),
    { kind: 'add', type: 'Node', id: 'ID_a', attributes: { text: 'Logging' }, parent: backend },
    { kind: 'add', type: 'Node', id: 'ID_b', attributes: { text: 'First' }, parent: backend, position: { index: 0 } },
    { kind: 'move', id: hierarchy, parent: client, position: { index: 1 } },
    { kind: 'remove', id: 'ID_88117421' },
    set(backend, { notes: '' }),
  ];

  // MindmapDocumentTests.ParseThenWrite_KeepsAnElementAndAnAttributeItDoesNotUnderstand
  it('an element and an attribute the plugin does not understand, around every kind of edit', () => {
    const original = textOf(architecture())
      .replace('<node TEXT="Backend"', '<node TEXT="Backend" FUTURE_ATTR="kept"')
      .replace('<edge COLOR="#ff0000" WIDTH="2"/>', '<edge COLOR="#ff0000" WIDTH="2"/>\r\n<future_element answer="42"><inner/></future_element>');
    const body = open(original);
    for (const made of edits) {
      expect(change(body, made).length).toBeGreaterThan(0);
      expect(bodyText(body)).toContain(' FUTURE_ATTR="kept"');
      expect(bodyText(body)).toContain('<edge COLOR="#ff0000" WIDTH="2"/>\r\n<future_element answer="42"><inner/></future_element>\r\n<attribute NAME="owner" VALUE="platform"/>');
      // The style sheet Freeplane keeps in the map, which is most of the file, is never rewritten.
      expect(bodyText(body).slice(0, original.indexOf('<richcontent'))).toBe(original.slice(0, original.indexOf('<richcontent')));
    }
    expect(written(body, backend)).toMatch(/^<node TEXT="Back end" FUTURE_ATTR="kept" POSITION="bottom_or_right" ID="ID_411002937" CREATED="1755820801000" MODIFIED="1755906000000" LINK="backend\/">\r\n<icon BUILTIN="gohome"\/>\r\n/);
    undoAll(body);
    expect(bodyText(body)).toBe(original);
  });

  // MindmapDocumentTests.ParseThenWrite_KeepsMixedLineEndings_AndAnEscapedCarriageReturnInAnAttribute
  it('mixed line endings and a carriage return written as a reference', () => {
    const mixed = '<map version="freeplane 1.12.15">\r\n<node TEXT="a&#xd;b" ID="ID_1">\r\n<node TEXT="lf line" ID="ID_2"/>\n</node>\r\n</map>\r\n';
    const body = open(mixed);
    change(body, set('ID_2', { text: 'still an lf line' }));
    expect(bodyText(body)).toBe(mixed.replace('lf line', 'still an lf line'));
    change(body, set('ID_1', { link: 'x' }));
    expect(bodyText(body)).toContain('<node TEXT="a&#xd;b" ID="ID_1" LINK="x">\r\n<node TEXT="still an lf line" ID="ID_2"/>\n</node>\r\n');
  });

  it.each([
    ['no final newline', ''],
    ['a final LF', '\n'],
    ['a final CRLF', '\r\n'],
    ['blank lines and spaces after the map', '\r\n\n  \n'],
  ])('the end of the body: %s', (_name, tail) => {
    const text = lf.replace(/\n$/, '') + tail;
    const body = open(text);
    for (const made of [add('ID_1'), set('ID_4', { notes: 'n' }), { kind: 'move', id: 'ID_2', parent: 'ID_3' } as const, { kind: 'remove', id: 'ID_n' } as const]) change(body, made);
    expect(bodyText(body).endsWith(`</node>\n</map>${tail}`)).toBe(true);
    expect(bodyText(body).slice(0, text.indexOf('\n') + 1)).toBe('<map version="freeplane 1.12.15">\n');
    undoAll(body);
    expect(bodyText(body)).toBe(text);
  });

  it('a byte-order mark, a declaration, comments, single quotes and the spacing inside tags', () => {
    const text = '﻿<?xml version="1.0" encoding="UTF-8"?>\n<!-- kept -->\n<map version=\'freeplane 1.12.15\'>\n<bookmarks/>\n'
      + '<node TEXT=\'root\'  ID = "ID_1" >\n<!-- <node TEXT="not a node"/> -->\n<hook NAME="x"><![CDATA[<node TEXT="nor this"/>]]></hook>\n<node ID="ID_2" TEXT="child" />\n</node >\n</map>\n';
    const body = open(text);
    change(body, set('ID_2', { text: 'renamed' }));
    expect(bodyText(body)).toBe(text.replace('TEXT="child"', 'TEXT="renamed"'));
    change(body, add('ID_2'));
    expect(bodyText(body)).toBe(text.replace('<node ID="ID_2" TEXT="child" />', `<node ID="ID_2" TEXT="renamed" >\n${fresh}\n</node>`));
    change(body, add('ID_1', { id: 'ID_m' }));
    expect(bodyText(body)).toBe(text.replace('<node ID="ID_2" TEXT="child" />\n', `<node ID="ID_2" TEXT="renamed" >\n${fresh}\n</node>\n<node TEXT="new" ID="ID_m"/>\n`));
    undoAll(body);
    expect(bodyText(body)).toBe(text);
  });

  it('a branch that is moved, whatever is written in it', () => {
    const branch = '<node  TEXT=\'odd\' ID="ID_2" COLOR="#ff0000" ><font SIZE="18"/><!-- kept --><node ID="ID_3" TEXT="inner"  /></node >';
    const text = `<map>\n<node TEXT="root" ID="ID_1">\n${branch}\n<node TEXT="target" ID="ID_4"/>\n</node>\n</map>\n`;
    const body = open(text);
    change(body, { kind: 'move', id: 'ID_2', parent: 'ID_4' });
    expect(bodyText(body)).toBe(`<map>\n<node TEXT="root" ID="ID_1">\n<node TEXT="target" ID="ID_4">\n${branch}\n</node>\n</node>\n</map>\n`);
  });
});

// ---- standalone's transcript ----

interface Asked {
  readonly made: ModelChange;
  /** The sentence the step was refused with, when it is one a command gave: the plugin gives the same. */
  readonly sentence?: string;
  readonly refused: boolean;
}

/**
 * A step of the transcript as the model change the tool type sends for it, or nothing where the
 * step never reaches a plugin: a question asked first, an action that is not offered, a fold.
 */
function asked(step: TranscriptEdit, body: PluginBody, newId: () => string): Asked | undefined {
  const refused = step.answer.startsWith('refused: ');
  // What a property row or a menu refuses is theirs to word; what a command refuses is the plugin's.
  const sentence = refused && !/is not a property|no longer in this mindmap/.test(step.answer) ? step.answer.slice('refused: '.length) : undefined;
  const from = (made: ModelChange | undefined): Asked | undefined => (made ? { made, sentence, refused } : undefined);
  const value = (written: string): string => JSON.parse(written) as string;
  const added = (parent: string | undefined, text: string, id: string, after?: string): ModelChange =>
    ({ kind: 'add', type: 'Node', id, attributes: { text }, ...(parent === undefined ? {} : { parent }), ...(after === undefined ? {} : { position: { after } }) });

  const property = /^set (\S+) mindmap\.(text|notes|link|folded) = (.*)$/s.exec(step.do);
  if (property) {
    const [, id, attribute, text] = property;
    if (attribute === 'folded') return from(set(id, { folded: value(text) === 'Yes' }));
    // The property row turns an emptied link into an unlink.
    return from(set(id, { [attribute]: attribute === 'link' && value(text) === '' ? null : value(text) }));
  }

  const moved = /^move (\S+) under (\S+) at (-?\d+)$/.exec(step.do);
  if (moved) {
    const index = Number(moved[3]);
    return from({ kind: 'move', id: moved[1], parent: moved[2], ...(index < 0 ? {} : { position: { index } }) });
  }

  const action = /^(execute|commit) mindmap\.([a-z-]+) on (\S+)(?: = (.*))?$/s.exec(step.do);
  if (!action) return undefined;
  const [, how, name, id, text] = action;
  const went = step.answer === 'ok';
  // An add asks for the new node's name once it is made: the answer names the node and the name it was given.
  const creation = /InitialValue = (.*), ConfirmLabel = .*InlineLabelElementId = (\S+), CommitActionId = mindmap\.rename/s.exec(step.answer);
  const parent = (): string | undefined => body.model.find(id)?.parentId;
  switch (`${how} ${name}`) {
    case 'execute add-child': return creation ? from(added(id, creation[1], creation[2])) : undefined;
    case 'execute add-sibling': return creation ? from(added(parent(), creation[1], creation[2], id)) : undefined;
    case 'commit add-child': return went ? from(added(id, value(text), newId())) : undefined;
    case 'commit add-sibling': return went ? from(added(parent(), value(text), newId(), id)) : undefined;
    case 'commit rename': return from(set(id, { text: value(text) }));
    case 'commit edit-notes': return from(set(id, { notes: value(text) }));
    case 'commit link': return from(set(id, { link: value(text) }));
    case 'execute unlink': return went ? from(set(id, { link: null })) : undefined;
    case 'execute delete':
    case 'commit delete': return went ? from({ kind: 'remove', id }) : undefined;
    default: return undefined;
  }
}

describe('the edits standalone recorded', () => {
  // Parity/MindmapTranscript.cs: the scripted edits of each document, each step's answer and what
  // it did to the file. The documents left out are those whose nodes have no ID, or share one:
  // standalone gives a node without an ID one when it opens the map and writes them all with its
  // first save, and reaches only the first holder of an ID, so its bytes there are not an edit's.
  it.each([
    'diagrams/mindmap/backend/EtAlii.Adp.Diagram.Mindmap.Tests/Fixtures/architecture.mm',
    'diagrams/mindmap/examples/example 1/design.mm',
    'diagrams/mindmap/examples/example 1/mindmap.mm',
    'inline/unnamed-root.mm',
    'inline/empty-ordinary-node.mm',
    'inline/rich-and-links.mm',
  ])('give the bytes standalone gave, step for step, and undo gives the file back: %s', (name) => {
    const { document, bytes } = recorded(name);
    const body = open(bytes);
    let expected = textOf(bytes);
    let made = 0;
    let planned = 0;
    for (const step of document.edits!) {
      expected = afterStep(expected, step);
      // A node an add makes is `ID_new1`, `ID_new2`, ... in the transcript, in the order they were made.
      const next = asked(step, body, () => `ID_new${made + 1}`);
      if (next?.made.kind === 'add') made++;
      if (!next) expect(step.unchanged, `'${step.do}' reaches no plugin, so it changes nothing`).toBe(true);
      else if (next.refused) {
        const sentence = refusal(body, next.made);
        if (next.sentence !== undefined) expect(sentence, step.do).toBe(next.sentence);
      } else {
        change(body, next.made);
        planned++;
      }
      expect(bodyText(body), step.do).toBe(expected);
    }
    expect(planned).toBeGreaterThanOrEqual(19);

    // Standalone's own undo leaves some of these files changed ("the original text is NOT back"),
    // because its commands write a note or a branch again in their own layout. An edit of splices
    // is undone by its inverse, so every file is back to the byte.
    undoAll(body);
    expect(body.bytes).toEqual(bytes);
  });
});
