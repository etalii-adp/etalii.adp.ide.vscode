# `.atd` tool descriptions

The plug-in gives `.atd` files, tool descriptions written in [ATD, the ADP tool language](https://github.com/etalii-adp/etalii.adp/blob/develop/specifications/atd/ATD-specification.md), the language support of etalii.adp spec 035: the same checker, completion and formatting as every other ADP host, from the one implementation in the desktop host.

## What an `.atd` file gets

- **Colours.** `syntaxes/atd.tmLanguage.json` is the TextMate grammar etalii.adp generates from ATD's grammar ([its provenance](../syntaxes/README.md)), and the server's semantic tokens colour types, attributes, functions and capabilities over it.
- **Findings.** Every finding of `atd check` is a diagnostic, with its code (`ATD2001` and the others of ATD §15) and, where the checker has one, a quick fix. A change to one file of a description checks every file of it again, 150 ms after typing stops.
- **Completion**, from what the grammar admits at the cursor and the names the position takes; **hover**, with the keyword's documentation or the declaration's; **go to definition**, **find references**, **rename** across every file of a description (inside CEL too, never inside strings); **format document**, in the layout of ATD §16; **outline**, **folding** and **highlights**.

## How it runs

The server is the desktop host's `atd-lsp`, built for WebAssembly and published in the desktop host's releases as `atd-lsp-wasm.zip`. `vendor/atd-lsp.lock` names the release and the SHA-256 of each file; `npm run fetch-atd-lsp`, which `npm run build` runs when the release is not unpacked yet, downloads them, checks each hash and unpacks the server into `vendor/atd-lsp/` and the walk into `vendor/atd-walk/`. Neither folder is committed; the package ships `vendor/atd-lsp/`. Set `ATD_RELEASE_DIR` to a folder holding the files to build without network; they are checked all the same.

The server runs on a Node worker thread of the extension host (`src/extension/atd/worker.ts`) and talks to `vscode-languageclient` through in-process message transports (`src/extension/atd/client.ts`): no process is started and no socket opened. It reads the files no editor holds open from the disk, so a description's parts and imports resolve. `src/core` has no part in it.

To move to a newer release, change `release` and the hashes in `vendor/atd-lsp.lock` (the release lists each file's SHA-256 beside it) and run `npm run fetch-atd-lsp`.

## Tests

- `test/extension/atd-textmate.test.ts` tokenizes every example of the walk with the TextMate grammar, as Visual Studio Code does, and checks that each token the server's lexer reads starts with a scope of its class.
- `test/vscode/atd.test.ts` runs the 30 steps of the walk through Visual Studio Code's own commands in the packaged plug-in, and measures diagnostics and completion on a description of 5,000 lines (SC-006: within 1 s and 0.5 s), printing the times.
