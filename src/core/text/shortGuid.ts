/** A new id as every ADP host mints one: a random UUID written as 25 characters of base 36. */
export function newShortGuid(): string {
  const hex = crypto.randomUUID().replaceAll('-', '');
  return BigInt(`0x${hex}`).toString(36).padStart(25, '0');
}