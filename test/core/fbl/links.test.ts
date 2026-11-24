import { describe, expect, it } from 'vitest';
import { base36, nanoid } from '../../../src/core/fbl/links/ids';
import { cachedName, linkText, linkToElement, parseLink } from '../../../src/core/fbl/links/link';
import { type IndexedDocument, linkCodes, LinkWorkspace } from '../../../src/core/fbl/links/workspace';

// Links as FBL 0.23 section 17 writes, resolves and reports them (etalii.adp spec 089), the counterparts of the
// desktop host's adp-links tests.

describe('a link (FBL 17.1)', () => {
  it('reads and writes back the four forms of the specification', () => {
    for (const text of ['$k3f9x2ma@provinces.yaml#nh.name=Noord-Holland', '$p0q7e2zd@release.tml#launch=Launch', '$m8c1u4wa@ideas.mm#ID_1723.text=v1.2 scope', '$k3f9x2ma@provinces.yaml']) {
      const link = parseLink(text);
      expect(link, text).toBeDefined();
      expect(linkText(link!)).toBe(text);
    }
    expect(parseLink('$k3f9x2ma@provinces.yaml#nh.name=Noord-Holland')).toEqual(linkToElement('k3f9x2ma', 'provinces.yaml', 'nh', 'name', 'Noord-Holland'));
  });

  it('keeps the dots and equals signs of a name', () => {
    const link = parseLink('$a@b.yaml#x=1.5 = 3/2')!;
    expect(cachedName(link)).toBe('1.5 = 3/2');
    expect(link.element?.nameProp).toBeUndefined();
  });

  it('escapes what would end a part, and reads it back', () => {
    const link = linkToElement('a.b', 'a#b%.yaml', 'x=y', 'n@m', '50% off');
    const text = linkText(link);
    expect(text).toBe('$a%2Eb@a%23b%25.yaml#x%3Dy.n%40m=50%25 off');
    expect(parseLink(text)).toEqual(link);
  });

  it('reads escapes in either case and as UTF-8', () => {
    expect(parseLink('$a@caf%c3%A9.yaml')?.documentName).toBe('café.yaml');
  });

  it('is nothing when the text is not a link', () => {
    for (const text of ['', 'k3f9x2ma@provinces.yaml#ut', '$@provinces.yaml', '$k3f9x2ma@', '$k3f9x2ma', '$k3f9x2ma@provinces.yaml#', '$k3f9x2ma@provinces.yaml#nh.', '$k3f%9x@a.yaml', '$k3$f@a.yaml', 'not a link', '$a@b\u0007.yaml']) {
      expect(parseLink(text), JSON.stringify(text)).toBeUndefined();
    }
  });

  it('takes an empty cached name for a name', () => {
    const link = parseLink('$a@b.yaml#x=')!;
    expect(cachedName(link)).toBe('');
    expect(linkText(link)).toBe('$a@b.yaml#x=');
  });
});

describe('a new id (nanoid)', () => {
  it('has its length and only its alphabet, and two differ', () => {
    for (let i = 0; i < 100; i++) {
      const id = nanoid(base36, 8);
      expect(id).toMatch(/^[0-9a-z]{8}$/);
    }
    expect(nanoid()).not.toBe(nanoid());
  });

  it('draws every character', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) for (const c of nanoid()) seen.add(c);
    expect(seen.size).toBe(36);
  });
});

const document = (path: string, id: string | undefined, elements: [string, string][]): IndexedDocument => ({
  path: `/w/${path}`,
  ...(id === undefined ? {} : { documentId: id }),
  nameProperty: 'label',
  elements: elements.map(([elementId, label]) => ({ id: elementId, attributes: [['label', label]] })),
  links: [],
});

const workspace = (): LinkWorkspace =>
  new LinkWorkspace('/w', [
    document('a/plan.tml', 'aaaaaaaa', [['x', 'Ex'], ['d', 'One'], ['d', 'Two']]),
    document('b/plan.tml', 'aaaaaaaa', [['x', 'Copy']]),
    document('c/other.tml', 'cccccccc', [['y', 'Why']]),
    document('c/new.tml', undefined, [['z', 'Zed']]),
  ]);

describe('resolving a link (FBL 17.3, 17.6)', () => {
  it('resolves a unique id whatever name the link has', () => {
    const { resolved } = workspace().resolve('$cccccccc@old.tml#y.label=Old');
    expect(resolved?.path).toBe('/w/c/other.tml');
    expect(linkText(resolved!.refreshed)).toBe('$cccccccc@other.tml#y.label=Why');
  });

  it('tells copies with one id apart by name, or reports them', () => {
    const { finding } = workspace().resolve('$aaaaaaaa@plan.tml#x');
    expect(finding?.code).toBe(linkCodes.ambiguousDocument);
    expect(finding?.message).toBe("2 documents are 'plan.tml' with id 'aaaaaaaa': a/plan.tml, b/plan.tml.");
    expect(finding?.candidates).toHaveLength(2);
  });

  it('takes no document without an id for a target', () => {
    const { finding } = workspace().resolve('$zzzzzzzz@new.tml#z');
    expect([finding?.code, finding?.message]).toEqual([linkCodes.brokenDocument, "No document 'new.tml' with id 'zzzzzzzz' is in the workspace."]);
  });

  it('reports a missing and a duplicated element', () => {
    const w = workspace();
    expect(w.resolve('$cccccccc@other.tml#q=Gone').finding).toMatchObject({ code: linkCodes.brokenElement, message: "'Gone' is no longer in 'other.tml'." });
    expect(w.resolve('$cccccccc@other.tml#q').finding?.message).toBe("'q' is no longer in 'other.tml'.");
    expect(w.resolve('$aaaaaaaa@missing.tml#d').finding?.code).toBe(linkCodes.brokenDocument);
    const one = new LinkWorkspace('/w', [document('a/plan.tml', 'aaaaaaaa', [['d', 'One'], ['d', 'Two']])]);
    expect(one.resolve('$aaaaaaaa@plan.tml#d').finding).toMatchObject({ code: linkCodes.ambiguousDocument, message: "'plan.tml' holds 2 elements with id 'd'." });
  });

  it('reports a malformed link as such', () => {
    expect(workspace().resolve('plan.tml#x').finding).toMatchObject({ code: linkCodes.malformed, message: "'plan.tml#x' is not a link." });
  });

  it('replaces a name property the target has not, and fills in a missing name', () => {
    const w = workspace();
    expect(linkText(w.resolve('$cccccccc@other.tml#y.text=Why').resolved!.refreshed)).toBe('$cccccccc@other.tml#y.label=Why');
    expect(linkText(w.resolve('$cccccccc@other.tml#y').resolved!.refreshed)).toBe('$cccccccc@other.tml#y=Why');
    expect(linkText(w.resolve('$cccccccc@x.tml').resolved!.refreshed)).toBe('$cccccccc@other.tml');
  });
});

describe('backlinks (FBL 17.5)', () => {
  it('are the links that resolve to the element, and a delete breaks them', () => {
    const w = workspace();
    w.put({
      ...document('d/map.tml', 'dddddddd', [['m', 'Em']]),
      links: [
        { holder: 'm', text: '$cccccccc@other.tml#y=Why' },
        { holder: 'n', text: '$cccccccc@renamed.tml#y=Why' },
        { holder: 'o', text: '$cccccccc@other.tml#gone' },
      ],
    });
    expect(w.backlinks('/w/c/other.tml', 'y').map((b) => b.holder)).toEqual(['m', 'n']);
    expect(w.brokenByDeleting('/w/c/other.tml', ['y'])).toBe(2);
    w.remove('/w/d/map.tml');
    expect(w.backlinks('/w/c/other.tml', 'y')).toEqual([]);
  });
});
