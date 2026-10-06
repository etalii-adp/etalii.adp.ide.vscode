import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** A folder under the system's temporary folder, removed by `dispose`. */
export class TemporaryFolder {
  readonly path = mkdtempSync(join(tmpdir(), 'fbl-'));

  /** Writes a file at a `/`-separated relative path and returns its full path. */
  write(relative: string, text: string): string {
    const full = join(this.path, ...relative.split('/'));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
    return full;
  }

  dispose(): void {
    rmSync(this.path, { recursive: true, force: true });
  }
}

/** Runs a test body with temporary folders that are removed afterwards, whatever the body did. */
export function withFolders<T>(count: number, body: (...folders: TemporaryFolder[]) => T): T {
  const folders = Array.from({ length: count }, () => new TemporaryFolder());
  try {
    return body(...folders);
  } finally {
    for (const folder of folders) folder.dispose();
  }
}

/**
 * Creates a symbolic link to a folder. Returns nothing when it was made, and otherwise the reason
 * the system refused, for a test to be skipped with (Windows refuses without the privilege).
 */
export function linkFolder(target: string, link: string): string | undefined {
  try {
    symlinkSync(target, link, 'dir');
    return undefined;
  } catch (error) {
    return `this system refuses to create a symbolic link: ${(error as NodeJS.ErrnoException).code ?? String(error)}`;
  }
}

let refusal: string | undefined | null = null;

/** Why this system makes no symbolic link, found by trying once; nothing when it makes them. */
export function linkRefusal(): string | undefined {
  if (refusal === null) {
    refusal = withFolders(2, (folder, outside) => linkFolder(outside.path, join(folder.path, 'linked')));
  }
  return refusal;
}
