// The envelope of a DED definition (DED 2, 4): the version of DED a designer's document is written in
// and the origin of its designer type. A host reads a later version read-only, with the reason, and
// reports a registration that names another designer type than the envelope, which decides.

import { finding, type Finding } from '../disl/model';

/** The DED versions this host reads; the last is the one it writes. */
export const dedVersions: readonly string[] = ['0.1', '0.2'];

export interface DedEnvelope {
  readonly version: string;
  readonly designer: string;
}

/** DED 0.2 section 2's expression for the envelope of a Markdown body, line 1 of the file. */
const markdownLine = /^<!--[ \t]+ded:[ \t]+(?<ded>[^ \t]+)[ \t]+designer:[ \t]+(?<designer>[^ \t]+)[ \t]+-->[ \t]*$/;

const unquoted = (value: string): string => value.trim().replace(/^(["'])(.*)\1$/, '$2');

/**
 * The envelope of a document (DED 2), read in the form its text has: line 1 of a text of lines, after
 * a byte-order mark only; the two root keys `ded` and `designer` of a JSON object or of a YAML
 * mapping; the attributes `version` and `designer` of the root element `ded` of XML. Nothing when
 * the text has none.
 */
export function dedEnvelope(text: string): DedEnvelope | undefined {
  const body = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const line = markdownLine.exec(body.split('\n', 1)[0].replace(/\r$/, ''));
  if (line?.groups) return { version: line.groups.ded, designer: line.groups.designer };
  const start = body.trimStart();
  if (start.startsWith('{')) {
    try {
      const root: unknown = JSON.parse(body);
      if (typeof root !== 'object' || root === null || Array.isArray(root)) return undefined;
      const { ded, designer } = root as Readonly<Record<string, unknown>>;
      return typeof ded === 'string' && typeof designer === 'string' ? { version: ded, designer } : undefined;
    } catch {
      return undefined;
    }
  }
  if (start.startsWith('<')) {
    const root = /<ded\b([^>]*)>/.exec(body)?.[1];
    const attribute = (name: string): string | undefined => (root === undefined ? undefined : new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(root)?.slice(1).find((value) => value !== undefined));
    const version = attribute('version');
    const designer = attribute('designer');
    return version !== undefined && designer !== undefined ? { version, designer } : undefined;
  }
  // A mapping's root keys start their line.
  const rootKey = (key: string): string | undefined => {
    const found = body.split(/\r?\n/).find((candidate) => candidate.startsWith(`${key}:`));
    return found === undefined ? undefined : unquoted(found.slice(key.length + 1).replace(/\s+#.*$/, ''));
  };
  const version = rootKey('ded');
  const designer = rootKey('designer');
  return version !== undefined && designer !== undefined ? { version, designer } : undefined;
}

/** Why a document of an envelope cannot be changed here (DED 4, step 2), or nothing for a version this host reads. Standalone's sentence. */
export function dedRefusal(envelope: DedEnvelope | undefined): string | undefined {
  if (envelope === undefined || dedVersions.includes(envelope.version)) return undefined;
  return `This document is written in DED ${envelope.version}, and this application reads DED ${dedVersions[dedVersions.length - 1]} and earlier. It is left exactly as it is and cannot be changed here.`;
}

/** The id of the finding of a registration that names another designer type than the envelope (DED 4). */
export const dedDesignerCode = 'ded.designer';

/**
 * The finding of a registration whose origin is another designer type than the envelope names
 * (DED 4: "the envelope decides and the host reports the difference as a finding"), on line 1.
 */
export function dedFindings(envelope: DedEnvelope | undefined, registrationOrigin: string | undefined): Finding[] {
  if (envelope === undefined || registrationOrigin === undefined || registrationOrigin === '' || registrationOrigin === envelope.designer) return [];
  return [finding(dedDesignerCode, 'warning', `The registration beside this document is of \`${registrationOrigin}\`, and its envelope names \`${envelope.designer}\`: the envelope decides, and nothing is read from or kept in the registration.`, { location: { file: '', line: 1, column: 1, length: 0 } })];
}
