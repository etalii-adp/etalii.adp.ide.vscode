# Developing the extension

How the ADP extension for Visual Studio Code is built, tested, debugged and released, and how a tool type is added. What the extension offers its users is in the [README](../README.md), which is also its Marketplace page; what changed in each release is in the [changelog](../CHANGELOG.md).

## How a tool type is made

**No tool type is written in code here.** Each is read from its definition in [etalii.adp](https://github.com/etalii-adp/etalii.adp/tree/develop/definitions), a DISL specification for a diagram or a DESL specification for a designer, with its [FBL](https://github.com/etalii-adp/etalii.adp/blob/develop/specifications/fbl/FBL-specification.md) binding, copied unchanged into [`definitions/`](../definitions) ([spec 027 in etalii.adp](https://github.com/etalii-adp/etalii.adp/tree/develop/specs/027-vscode-disl-fbl-tools)). Three records say how far that goes: [disl-support.md](disl-support.md), what the plug-in reads of DISL 0.4 and DESL 0.2 and where a tool type differs from its definition; [fbl.md](fbl.md), what it implements of FBL 0.8; and [parity.md](parity.md), what this host does in its own way. The tool types are catalogued in [tools.md](tools.md).

## Writing for the Marketplace

`README.md` is the extension's page on the Visual Studio Marketplace and Open VSX, and `CHANGELOG.md` is its Changelog tab; both ship in the package. Write them for someone using Visual Studio Code, not for someone building ADP: what each tool does for them, how to create and open its files, how to edit and export, and the commands, with no specification names, language versions or internals. Those belong here and in the other documents under `docs/`. A pull request that changes what a user sees adds a line to the `Unreleased` section of `CHANGELOG.md`, and a release turns that section into its version with the date.

## Install from a file

1. Download `etalii-adp-<version>.vsix` from the [Releases page](https://github.com/etalii-adp/etalii.adp.ide.vscode/releases): the **Development build** pre-release is the plug-in from the current `develop` after it passed every check.
2. In Visual Studio Code, open the Extensions view, choose **...** and **Install from VSIX...**, and pick the file.

To try a pull request before it is merged, open its **Build** run under **Actions**: the run offers that pull request's `etalii-adp-<version>.vsix`.

The plug-in needs Visual Studio Code 1.140 or later, and nothing else installed or running. It makes no network access.

## Build

You need [Node.js](https://nodejs.org) 22 or later. Nothing else: every command below installs the dependencies itself when they are missing or older than `package-lock.json`, and the tests download the Visual Studio Code they run in.

```sh
npm run check        # types and lint
npm test             # check, then every test at the three levels below
npm run package      # writes etalii-adp-<version>.vsix
```

| Command | What it tests |
|---|---|
| `npm run test:unit` | The core (files, models, rules, edits) without Visual Studio Code, and the webview (canvas, table, page of boxes, toolbox, property grid) in a simulated browser. |
| `npm run test:vscode` | The packaged plug-in, unpacked and run in a real Visual Studio Code, on a copy of the examples. A window opens while it runs. |

The build fetches the language server of `.atd` tool descriptions from the desktop host's release that `vendor/atd-lsp.lock` names, checking its SHA-256 ([docs/atd.md](atd.md)); `npm run fetch-atd-lsp` does it again.

Reports are written to `reports/`. On Windows, keep the clone at a short path: the Visual Studio Code the tests download does not start from a path near the 260-character limit.

Every pull request into `develop` and every change to `develop` is checked by the Build workflow (`.github/workflows/build.yml`), which runs the same commands. Its summary lists the tests that were skipped and why, and its test reports are kept with the run.

## Release

A release is a tag `v<version>` on a commit of `develop`, where `<version>` is the `version` in `package.json`. Pushing the tag runs the Build workflow on that commit; when every check passes, its `release` job makes the release `v<version>` on the Releases page with `etalii-adp-<version>.vsix`, and publishes that same file to the Visual Studio Marketplace and to Open VSX. A tag that names another version, or a commit that is not on `develop`, is refused.

```sh
git tag v0.1.0 origin/develop
git push origin v0.1.0
```

Raise the version in `package.json` right after a release: the Marketplace accepts each version once.

It needs, once:

- A Marketplace publisher whose id is the `publisher` in `package.json` (`etalii`), made at <https://marketplace.visualstudio.com/manage>.
- A namespace `etalii` on [Open VSX](https://open-vsx.org).
- A trusted publisher on each store for this repository (`etalii-adp/etalii.adp.ide.vscode`) and its workflow `build.yml`: the publisher's Trusted Publishing policy for GitHub on the Marketplace, and the namespace's trusted publisher on Open VSX. The `release` job then publishes with its own OIDC token (`vsce publish --oidc`, `ovsx publish --trusted-publishing`); no store token is stored as a secret. Open VSX accepts a trusted publisher only for an extension it already holds, so its first versions were published by hand with a personal access token; since v0.2.0 both stores take every release from the `release` job. A release whose publish step failed is published again by re-running that job, which leaves a store already holding the version as it is.

## Debug

Open this folder in Visual Studio Code and start **Run ADP** (F5). A second window opens with the plug-in loaded on `.debug/examples`, a copy of `examples/` that is refreshed on every start, so nothing you edit there changes what the tests read. On a fresh clone the first start also installs the dependencies, which takes a minute; nothing has to be run beforehand.

- Breakpoints work in the original TypeScript in both halves: the code that runs in the extension host (`src/extension`, `src/core`) and the code that runs in a webview (`src/webview`).
- The build runs in watch mode while you debug. After a change, run **Developer: Reload Window** in the second window. Build and type errors show in the Problems panel as you type.
- **Debug core and webview tests** runs the test file that is open under the debugger. **Debug tests in Visual Studio Code** does the same for the tests under `test/vscode`.

## Layout

| Path | What it is |
|---|---|
| `definitions/<tool>` | One folder per tool type: its DISL or DESL specification, its FBL binding and its companion document, copied unchanged from etalii.adp and etalii.adp.ide.standalone, with `PROVENANCE.md` recording where each came from. Never edited here. The folder ships in the package and is read when the plug-in starts. |
| `src/core` | Everything that knows a definition. It knows nothing of Visual Studio Code or a browser, and the lint rules keep it so. |
| `src/core/disl`, `src/core/desl` | The DISL interpreter, taken from etalii.adp.ide.notion (see its [origin](../src/core/disl/ORIGIN.md)) and owned here, and what DESL adds to it: a table surface and operations. |
| `src/core/scene` | A model as a scene: the shapes, lines and labels a diagram's notation gives, with their geometry. |
| `src/core/tool` | A definition as a tool type: `toolTypeFrom` turns a folder of `definitions/` into the one contract the frame serves (`src/core/frame/toolType.ts`), with what a diagram shows as a scene and what a designer shows as a table view. |
| `src/core/plugins/<plugin>` | The code a definition names as a plugin, and the view logic of the Knowledge designer, each registered in `src/core/plugins/index.ts`. The only place where code is for one tool type. |
| `src/core/fbl` | The FBL implementation: bodies and registrations read and written through FBL bindings, by splices on bytes; see [docs/fbl.md](fbl.md). |
| `src/extension` | The part that runs in the extension host: it reads `definitions/`, opens a file in its tool, applies an edit's splices as one edit of the text document, and reports findings. |
| `src/webview` | The part that runs in webviews: the canvas that draws the scene of every diagram (`src/webview/diagram`), the table of a designer (`src/webview/table`), the page of boxes of a designer of the `hierarchy` kind (`src/webview/hierarchy`), and the ADP Toolbox and ADP Properties views. `npm run look` draws one example in a page outside Visual Studio Code, for a quick look at the drawing. |
| `examples`, `fixtures` | Example documents and test fixtures, copied unchanged from etalii.adp.ide.standalone and, for `fixtures/tools/desl/`, from etalii.adp; see [their provenance](../examples/PROVENANCE.md). |
| `fixtures/fbl` | What the FBL implementation is tested on, copied unchanged from two sources: FBL's example bindings, fixtures and registrations from etalii.adp, and the real files standalone's FBL tests read from etalii.adp.ide.standalone; see [their provenance](../fixtures/fbl/PROVENANCE.md). `npm run sync-fbl` refreshes them. |
| `test/core`, `test/webview`, `test/vscode` | The three test levels. |

## Adding a tool type

A tool type is a folder of `definitions/`, and adding one writes no code as long as its definition uses only what [docs/disl-support.md](disl-support.md) lists. With the clones of etalii.adp and etalii.adp.ide.standalone beside this one:

```sh
npm run sync-definitions -- ../etalii.adp ../etalii.adp.ide.standalone --add definitions/diagrams/<name>.dis
npm run sync-definitions -- --check
```

The first command copies the specification, its companion and the binding it names, byte for byte from the `origin/develop` of both clones, copies the LLM instructions `definitions/diagrams/<name>/README.md` as `llm-instructions.md` where etalii.adp has them, writes the folder's `PROVENANCE.md`, and writes the tool type's custom editor and commands into `package.json`. A designer is added the same way with `--add definitions/designers/<name>.des`. Commit the folder and `package.json`, add the tool type's row to [docs/tools.md](tools.md) and its subsection to "Differences from each definition" in the support record. Its examples are copied by `npm run sync-examples`, once `scripts/sync-examples.mjs` names them.

Without `--add` the command refreshes every folder to the newest definitions. To remove a tool type, delete its folder and run the command. `--check` copies nothing: it fails when a copy differs from its record or `package.json` from the copies, and the Build workflow runs it.

A definition that asks for more than the support record lists still opens: what is not read is reported as a finding. The construct is then built once, for every tool type, in `src/core/disl`, `src/core/desl`, `src/core/scene` or `src/core/tool`, where no tool type may be named, and its row is added to the support record in the same change. A plugin a definition names is written under `src/core/plugins/<plugin>` and registered by its id. Where a definition and the standalone host disagree, or a language cannot state what the tool needs, the definition is followed and the difference is raised as an issue in etalii.adp, never settled here.

## How work is done here

Every change starts as a specification, using GitHub Spec Kit in [etalii.adp](https://github.com/etalii-adp/etalii.adp), which also holds [this repository's principles](https://github.com/etalii-adp/etalii.adp/blob/develop/.specify/memory/repositories/etalii.adp.ide.vscode.md). See `CLAUDE.md`.
