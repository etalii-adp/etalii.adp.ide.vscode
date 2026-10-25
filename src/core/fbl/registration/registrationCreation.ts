import type { FblBinding } from '../documents/types';
import { messages } from '../messages';
import { BodyText } from '../text/bodyText';
import { encode } from '../text/utf8';
import { RegistrationDocument } from './registrationDocument';

/** The registration to write before the edit is planned, or why none is created. */
export type RegistrationCreationResult = { readonly bytes: Uint8Array } | { readonly refused: string };

/**
 * The text of the registration `registrationName` to write beside the body `bodyName` the first time
 * the user places an element or changes a setting a declared block keeps, when the binding's
 * `registration.createOnFirstPlacement` is true (FBL 8.4, 0.7 8.4). It is written before the edit is
 * planned, outside the history, so that an undo leaves the file in place: the origin line, then
 * `body: <name>` when the base names differ, in the body's dominant line ending. Refused with a
 * reason when the binding does not create one, or when a file of that name exists (`existing`) that
 * is not a registration of this origin and body; such a registration, when it exists, is given back
 * as it is. `bodyName` is the body's path relative to the registration's folder, `/`-separated.
 */
export function createRegistration(
  binding: FblBinding, origin: string, registrationName: string, bodyName: string, body: Uint8Array, existing: Uint8Array | undefined,
): RegistrationCreationResult {
  if (!binding.registration.createOnFirstPlacement) return { refused: messages.registrationNotCreated(bodyName) };
  const named = baseName(registrationName) !== baseName(bodyName);
  if (existing !== undefined) {
    const document = RegistrationDocument.read(existing);
    const same = document.origin === origin && (document.body ?? (named ? undefined : bodyName)) === bodyName;
    return same ? { bytes: existing } : { refused: messages.registrationNameTaken(registrationName, bodyName) };
  }
  const newline = new BodyText(body).dominantEnding ?? binding.text.newline;
  return { bytes: encode(`${origin}${newline}${named ? `body: ${bodyName}${newline}` : ''}`) };
}

/** A path's file name without its last extension. */
function baseName(path: string): string {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot < 0 ? name : name.slice(0, dot);
}
