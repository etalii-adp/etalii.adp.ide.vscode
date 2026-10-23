// Language support for `.atd` tool descriptions (etalii.adp spec 035, T112): the ADP tool language's server, the
// WebAssembly build of the desktop host's `atd-lsp`, runs on a Node worker thread inside the extension host and talks
// to `vscode-languageclient` through in-process message transports; no process is started and no socket opened.
// Diagnostics, completion, hover, definition, references, rename, formatting, symbols, folding, highlights, code
// actions and semantic tokens are all the server's.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import * as vscode from 'vscode';
import {
  AbstractMessageReader,
  AbstractMessageWriter,
  type DataCallback,
  type Disposable,
  LanguageClient,
  type Message,
  type MessageTransports,
} from 'vscode-languageclient/node';

/** Messages the server posts from its worker. */
class WorkerReader extends AbstractMessageReader {
  constructor(private readonly worker: Worker) {
    super();
    worker.on('error', (error) => this.fireError(error));
    worker.on('exit', () => this.fireClose());
  }

  listen(callback: DataCallback): Disposable {
    const listener = (message: Message): void => callback(message);
    this.worker.on('message', listener);
    return { dispose: () => this.worker.off('message', listener) };
  }
}

/** Messages for the server, posted to its worker. */
class WorkerWriter extends AbstractMessageWriter {
  constructor(private readonly worker: Worker) {
    super();
  }

  async write(message: Message): Promise<void> {
    this.worker.postMessage(message);
  }

  end(): void {
    void this.worker.terminate();
  }
}

/** Starts the client of `.atd` files; none when the server was not fetched into the package. */
export function startAtd(context: vscode.ExtensionContext): LanguageClient | undefined {
  const serverFolder = join(context.extensionPath, 'vendor', 'atd-lsp');
  if (!existsSync(join(serverFolder, 'adp_atd_lsp.js'))) {
    console.warn('ADP: vendor/atd-lsp is missing, so .atd files have no language support; run `npm run fetch-atd-lsp`.');
    return undefined;
  }
  const transports = async (): Promise<MessageTransports> => {
    const worker = new Worker(join(context.extensionPath, 'dist', 'atd-worker.js'), { workerData: { serverFolder } });
    return { reader: new WorkerReader(worker), writer: new WorkerWriter(worker), detached: false };
  };
  const client = new LanguageClient('atd', 'ADP tool language', transports, {
    documentSelector: [{ language: 'atd' }],
  });
  context.subscriptions.push({ dispose: () => void client.stop() });
  void client.start();
  return client;
}
