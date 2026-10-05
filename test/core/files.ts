import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Every file under a folder with one of the extensions, as paths relative to the repository root. */
export function filesUnder(folder: string, ...extensions: string[]): string[] {
  const found: string[] = [];
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path, ...extensions));
    else if (extensions.some((extension) => name.endsWith(extension))) found.push(path.replaceAll('\\', '/'));
  }
  return found.sort();
}

/** A file's text exactly as it is on disk: no newline conversion. */
export function read(path: string): string {
  return readFileSync(path, 'utf8');
}