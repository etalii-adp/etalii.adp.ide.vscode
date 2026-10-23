// The ADP tool language's server on a Node worker thread (etalii.adp spec 035, T112): the WebAssembly build of
// `atd-lsp` that `npm run fetch-atd-lsp` unpacks into vendor/atd-lsp/, handed each message the client sends and
// posting back each message it answers. A change's diagnostics come 150 ms after the last change, as the desktop
// host's and IntelliJ's transports send them. The server reads the files no editor holds open from the disk, so a
// description's parts and imports resolve.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

interface WasmServer {
  handle(message: string): string;
  pending(): boolean;
  flush(): string;
}

const DEBOUNCE_MS = 150;

const glue = createRequire(__filename)(join(workerData.serverFolder as string, 'adp_atd_lsp.js')) as {
  WasmServer: { withFiles(read: (path: string) => string | null, list: (folder: string) => string[]): WasmServer };
};

const server = glue.WasmServer.withFiles(
  (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  },
  (folder) => {
    try {
      return readdirSync(folder)
        .filter((name) => name.endsWith('.atd'))
        .map((name) => join(folder, name));
    } catch {
      return [];
    }
  },
);

let timer: NodeJS.Timeout | undefined;

function post(messages: string): void {
  for (const message of JSON.parse(messages) as unknown[]) parentPort?.postMessage(message);
}

parentPort?.on('message', (message: unknown) => {
  post(server.handle(JSON.stringify(message)));
  if (timer) clearTimeout(timer);
  timer = server.pending() ? setTimeout(() => post(server.flush()), DEBOUNCE_MS) : undefined;
});
