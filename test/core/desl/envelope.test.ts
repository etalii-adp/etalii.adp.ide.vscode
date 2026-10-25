import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dedEnvelope, dedFindings, dedRefusal } from '../../../src/core/desl/envelope';

// The envelope of a DED definition (DED 2, 4), read from the forms DED gives it: line 1 of a
// Markdown body, the root keys of YAML and JSON, and the root element of XML; a later version
// opened read-only with the standalone module's sentence; and a registration of another designer
// type reported.

describe('the envelope of a document', () => {
  it('is line 1 of a Markdown body, with any run of spaces and tabs, after a byte-order mark only', () => {
    expect(dedEnvelope(readFileSync('examples/hierarchical-requirement/web-shop.md', 'utf8'))).toEqual({ version: '0.2', designer: 'etalii/hierarchical-requirement' });
    expect(dedEnvelope('\uFEFF<!--\tded:  0.3 designer: a/b -->  \r\n# Title\r\n')).toEqual({ version: '0.3', designer: 'a/b' });
    expect(dedEnvelope('# Title\n<!-- ded: 0.2 designer: a/b -->\n')).toBeUndefined();
    expect(dedEnvelope(' <!-- ded: 0.2 designer: a/b -->\n')).toBeUndefined();
  });

  it('is the root keys of YAML and JSON, and the root element of XML', () => {
    expect(dedEnvelope(readFileSync('examples/knowledge/cities.yaml', 'utf8'))).toMatchObject({ designer: 'etalii/knowledge' });
    expect(dedEnvelope('ded: "0.1"  # the version\ndesigner: etalii/knowledge\nname: Cities\n')).toEqual({ version: '0.1', designer: 'etalii/knowledge' });
    expect(dedEnvelope('{ "ded": "0.1", "designer": "etalii/knowledge", "name": "Cities" }')).toEqual({ version: '0.1', designer: 'etalii/knowledge' });
    expect(dedEnvelope('<?xml version="1.0"?>\n<ded version="0.1" designer="etalii/knowledge" name="Cities">\n</ded>\n')).toEqual({ version: '0.1', designer: 'etalii/knowledge' });
    expect(dedEnvelope('name: Cities\n')).toBeUndefined();
    expect(dedEnvelope('{ "name": ')).toBeUndefined();
  });
});

describe('a version this host does not read', () => {
  it('opens read-only, with the reason', () => {
    expect(dedRefusal({ version: '0.2', designer: 'a/b' })).toBeUndefined();
    expect(dedRefusal({ version: '0.1', designer: 'a/b' })).toBeUndefined();
    expect(dedRefusal(undefined)).toBeUndefined();
    expect(dedRefusal({ version: '1.0', designer: 'a/b' })).toBe('This document is written in DED 1.0, and this application reads DED 0.2 and earlier. It is left exactly as it is and cannot be changed here.');
  });
});

describe('a registration of another designer type', () => {
  it('is reported on line 1, the envelope deciding (DED 4)', () => {
    expect(dedFindings({ version: '0.2', designer: 'a/b' }, 'a/b')).toEqual([]);
    expect(dedFindings({ version: '0.2', designer: 'a/b' }, undefined)).toEqual([]);
    expect(dedFindings(undefined, 'c/d')).toEqual([]);
    const [found] = dedFindings({ version: '0.2', designer: 'a/b' }, 'c/d');
    expect(found).toMatchObject({ code: 'ded.designer', severity: 'warning', location: { line: 1 } });
    expect(found.message).toContain('`c/d`');
  });
});
