// The layout a registration keeps beside a document (FBL 8.3): the top-left corner of each element
// a user placed, one `<id>: <x> <y>` a line under `layout:`. It is read with the FBL library's
// registration document, and written whole: the block is ADP's own, in the ordinal order of its
// ids with numbers of three decimals at most, and everything above and below it is kept byte for byte.

import { formatNumber } from '../fbl/planning/newText';
import { compareUtf8 } from '../fbl/registration/openRegistration';
import { RegistrationDocument } from '../fbl/registration/registrationDocument';
import { decode, encode } from '../fbl/text/utf8';

export interface Corner {
  readonly x: number;
  readonly y: number;
}

/** A new registration for a document of a tool type: its origin line, and nothing else yet. */
export const newRegistration = (origin: string): string => `${origin}\n`;

/** The corners a registration keeps, by id; none without a registration or a block. */
export function layoutOf(registration: string | undefined): Readonly<Record<string, Corner>> {
  return registration === undefined ? {} : Object.fromEntries(RegistrationDocument.read(encode(registration)).positions());
}

/** The registration with its layout block holding these corners; without any, the block is gone. */
export function withLayout(registration: string, corners: Readonly<Record<string, Corner>>): string {
  const bytes = encode(registration);
  const read = RegistrationDocument.read(bytes);
  const newline = (registration.match(/\r\n/g)?.length ?? 0) > (registration.match(/(?<!\r)\n/g)?.length ?? 0) ? '\r\n' : '\n';
  const entries = Object.entries(corners).sort(([a], [b]) => compareUtf8(a, b));
  const block = entries.length === 0 ? '' : `layout:${newline}${entries.map(([id, corner]) => `  ${id}: ${formatNumber(corner.x, 3)} ${formatNumber(corner.y, 3)}${newline}`).join('')}`;
  const [start, end] = read.layout ? [read.layout.span.start, read.layout.span.end] : [read.afterHeaders, read.afterHeaders];
  const before = decode(bytes.subarray(0, start));
  // A block that follows a last line without an ending gives that line one first.
  const lead = block !== '' && before !== '' && !before.endsWith('\n') ? newline : '';
  return before + lead + block + decode(bytes.subarray(end));
}
