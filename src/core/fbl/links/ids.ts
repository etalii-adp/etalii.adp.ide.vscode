// New ids by DISL's and DESL's `nanoid` strategy (DISL 0.12, DESL 0.5; etalii.adp spec 089, FR-001 and FR-003):
// random characters of an alphabet, every character equally likely.

/** The alphabet `base36`: the digits and the lower-case letters. */
export const base36 = '0123456789abcdefghijklmnopqrstuvwxyz';

/** The alphabet a `nanoid` rule names: `base36`, `alphanumeric`, or the characters it lists. */
export function alphabetOf(name: string | undefined): string {
  if (name === undefined || name === 'base36') return base36;
  if (name === 'alphanumeric') return '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  return name;
}

/** A new id of `length` characters of `alphabet`, each drawn uniformly: a random byte that would favour the first characters is drawn again. */
export function nanoid(alphabet: string = base36, length = 8): string {
  const characters = [...alphabet];
  if (characters.length === 0 || characters.length > 256) throw new Error('An alphabet has 1 to 256 characters.');
  const usable = 256 - (256 % characters.length);
  let id = '';
  const bytes = new Uint8Array(32);
  while ([...id].length < length) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < usable && [...id].length < length) id += characters[byte % characters.length];
    }
  }
  return id;
}
