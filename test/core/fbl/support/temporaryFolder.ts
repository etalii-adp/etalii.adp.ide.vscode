import { appendFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';

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
 * Creates a link to a folder. Returns nothing when it was made, and otherwise the reason
 * the system refused, for a test to be skipped with (a system may refuse to make one).
 */
export function linkFolder(target: string, link: string): string | undefined {
  try {
    // On Windows a junction, which needs no privilege and is a link all the same; elsewhere a symbolic link.
    symlinkSync(target, link, 'junction');
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

/**
 * Skips the running test, with the reason, on a system that makes no symbolic link. The JUnit report
 * keeps no reason for a skipped test, so the reason is also written beside the reports, where
 * scripts/skipped-tests.mjs finds it for the list of skipped tests.
 */
export function skipWithoutLinks(context: { task: { name: string; file: { name: string } }; skip: (note?: string) => void }): void {
  const reason = linkRefusal();
  if (reason === undefined) return;
  mkdirSync('reports', { recursive: true });
  appendFileSync(join('reports', 'skip-reasons.jsonl'), `${JSON.stringify({ file: context.task.file.name.split(sep).join('/'), name: context.task.name, reason })}\n`);
  context.skip(reason);
}
