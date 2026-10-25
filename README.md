# etalii.adp.ide.vscode

[![Build](https://github.com/etalii-adp/etalii.adp.ide.vscode/actions/workflows/build.yml/badge.svg?branch=develop)](https://github.com/etalii-adp/etalii.adp.ide.vscode/actions/workflows/build.yml?query=branch%3Adevelop)

The ADP tools as a Visual Studio Code extension, "ADP: A Different Perspective".

ADP, A Different Perspective, is a range of task-focused tools: diagrams, designers and editors (see the [ADP terminology](https://github.com/etalii-adp/etalii.adp/blob/develop/docs/terminology.md)). The site is at <https://etalii.net/adp/>.

**Where it stands.** The plug-in brings six tool types, four diagrams and two designers:

- **Gartner hype cycle graph** (`.ghg`). A `.ghg` file opens in the diagram: trends on a time axis as banners in the phases they have reached, triggers, notes, and the influences between them. Drop elements from the ADP Toolbox, rename them in place, move and resize them, drag a phase boundary, draw an influence from one trend's edge to another's, filter by tags, switch to Compact, and arrange the diagram.
- **Agent Behavior Modelling** (Markdown). A chat agent's instructions as a behavior tree, kept as a bullet list under the `Behavior` heading of the Markdown file the agent reads. A Markdown file keeps opening as text; choose **Open With**, or **ADP: Open as Agent Behavior Modelling** from the Command Palette. Drop one of the eleven kinds of node under the node it belongs to, drag a node past a sibling to reorder the list, lower a row, right-drag from a node to another to move it under it, and change a node's kind in ADP Properties. Where rows were dragged to is kept in an `.adp` file beside the Markdown, never in it; Ctrl+Z in the diagram takes a row drag or an Arrange back like any other change, and opening that `.adp` opens the diagram.
- **Mind map** (`.mm`). A Freeplane map opens in the diagram: ideas branching from one central topic to its left and right, each node with its text, its notes and a link. Add a child or a sibling, rename a node in place, drag a branch under another node, fold a branch, and link a node to a file or a folder. What the tool does not understand of the file is kept byte for byte, so Freeplane and FreeMind go on reading it.
- **Agent activity diagram** (`.aad`). Which agents work on which specification of which project, where and on what system: projects in the middle, their specifications with tasks listed by status, then agents, locations and environments, laid out radiating outwards. Lock a node where you dragged it, fold a group, open a link, and show or hide what is archived. Agents keep the file current, and an open diagram follows it.
- **Knowledge** (YAML, JSON and XML). A table of rows and typed properties in a file you own, with stored views that choose, order, sort, filter and group its columns. A file whose envelope names it opens in the designer; every other YAML, JSON and XML file opens as text, as before, and **Open With** offers the designer.
- **Hierarchical Requirement Designer** (Markdown). The requirements of one subject as boxes that contain boxes, in a Markdown file whose first line names the designer, kept by a person and an agent together. Work in progress: **Open With** offers it for a Markdown file, which opens read-only until its page is built.

ADP Toolbox and ADP Properties, in the ADP container of the activity bar, offer what the tool that has the focus can add, and show and edit what is selected in it.
Each tool is an editor on the file's own text: every change is one step in Visual Studio Code's undo, edits only the lines it concerns, and leaves the rest of the file byte for byte as it was. **Open as Text** shows the same document beside the tool, and problems in the file are listed in the Problems panel. The tool types are catalogued in [docs/tools.md](docs/tools.md).

**No tool type is written in code here.** Each is read from its definition in [etalii.adp](https://github.com/etalii-adp/etalii.adp/tree/develop/definitions), a DISL specification for a diagram or a DESL specification for a designer, with its [FBL](https://github.com/etalii-adp/etalii.adp/blob/develop/specifications/fbl/FBL-specification.md) binding, copied unchanged into [`definitions/`](definitions) ([spec 027 in etalii.adp](https://github.com/etalii-adp/etalii.adp/tree/develop/specs/027-vscode-disl-fbl-tools)). Three records say how far that goes: [docs/disl-support.md](docs/disl-support.md), what the plug-in reads of DISL 0.4 and DESL 0.1 and where a tool type differs from its definition; [docs/fbl.md](docs/fbl.md), what it implements of FBL 0.8; and [docs/parity.md](docs/parity.md), what this host does in its own way.

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
| `npm run test:unit` | The core (files, models, rules, edits) without Visual Studio Code, and the webview (canvas, table, toolbox, property grid) in a simulated browser. |
| `npm run test:vscode` | The packaged plug-in, unpacked and run in a real Visual Studio Code, on a copy of the examples. A window opens while it runs. |

The build fetches the language server of `.atd` tool descriptions from the desktop host's release that `vendor/atd-lsp.lock` names, checking its SHA-256 ([docs/atd.md](docs/atd.md)); `npm run fetch-atd-lsp` does it again.

Reports are written to `reports/`. On Windows, keep the clone at a short path: the Visual Studio Code the tests download does not start from a path near the 260-character limit.

Every pull request into `develop` and every change to `develop` is checked by the Build workflow (`.github/workflows/build.yml`), which runs the same commands. Its summary lists the tests that were skipped and why, and its test reports are kept with the run.

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
| `src/core/disl`, `src/core/desl` | The DISL interpreter, taken from etalii.adp.ide.notion (see its [origin](src/core/disl/ORIGIN.md)) and owned here, and what DESL adds to it: a table surface and operations. |
| `src/core/scene` | A model as a scene: the shapes, lines and labels a diagram's notation gives, with their geometry. |
| `src/core/tool` | A definition as a tool type: `toolTypeFrom` turns a folder of `definitions/` into the one contract the frame serves (`src/core/frame/toolType.ts`), with what a diagram shows as a scene and what a designer shows as a table view. |
| `src/core/plugins/<plugin>` | The code a definition names as a plugin, and the view logic of the Knowledge designer, each registered in `src/core/plugins/index.ts`. The only place where code is for one tool type. |
| `src/core/fbl` | The FBL implementation: bodies and registrations read and written through FBL bindings, by splices on bytes; see [docs/fbl.md](docs/fbl.md). |
| `src/extension` | The part that runs in the extension host: it reads `definitions/`, opens a file in its tool, applies an edit's splices as one edit of the text document, and reports findings. |
| `src/webview` | The part that runs in webviews: the canvas that draws the scene of every diagram (`src/webview/diagram`), the table of a designer (`src/webview/table`), and the ADP Toolbox and ADP Properties views. `npm run look` draws one example in a page outside Visual Studio Code, for a quick look at the drawing. |
| `examples`, `fixtures` | Example documents and test fixtures, copied unchanged from etalii.adp.ide.standalone and, for `fixtures/tools/desl/`, from etalii.adp; see [their provenance](examples/PROVENANCE.md). |
| `fixtures/fbl` | What the FBL implementation is tested on, copied unchanged from two sources: FBL's example bindings, fixtures and registrations from etalii.adp, and the real files standalone's FBL tests read from etalii.adp.ide.standalone; see [their provenance](fixtures/fbl/PROVENANCE.md). `npm run sync-fbl` refreshes them. |
| `test/core`, `test/webview`, `test/vscode` | The three test levels. |

## Adding a tool type

A tool type is a folder of `definitions/`, and adding one writes no code as long as its definition uses only what [docs/disl-support.md](docs/disl-support.md) lists. With the clones of etalii.adp and etalii.adp.ide.standalone beside this one:

```sh
npm run sync-definitions -- ../etalii.adp ../etalii.adp.ide.standalone --add definitions/diagrams/<name>.dis
npm run sync-definitions -- --check
```

The first command copies the specification, its companion and the binding it names, byte for byte from the `origin/develop` of both clones, writes the folder's `PROVENANCE.md`, and writes the tool type's custom editor and commands into `package.json`. A designer is added the same way with `--add definitions/designers/<name>.des`. Commit the folder and `package.json`, add the tool type's row to [docs/tools.md](docs/tools.md) and its subsection to "Differences from each definition" in the support record. Its examples are copied by `npm run sync-examples`, once `scripts/sync-examples.mjs` names them.

Without `--add` the command refreshes every folder to the newest definitions. To remove a tool type, delete its folder and run the command. `--check` copies nothing: it fails when a copy differs from its record or `package.json` from the copies, and the Build workflow runs it.

A definition that asks for more than the support record lists still opens: what is not read is reported as a finding. The construct is then built once, for every tool type, in `src/core/disl`, `src/core/desl`, `src/core/scene` or `src/core/tool`, where no tool type may be named, and its row is added to the support record in the same change. A plugin a definition names is written under `src/core/plugins/<plugin>` and registered by its id. Where a definition and the standalone host disagree, or a language cannot state what the tool needs, the definition is followed and the difference is raised as an issue in etalii.adp, never settled here.

## How work is done here

Every change starts as a specification, using GitHub Spec Kit in [etalii.adp](https://github.com/etalii-adp/etalii.adp), which also holds [this repository's principles](https://github.com/etalii-adp/etalii.adp/blob/develop/.specify/memory/repositories/etalii.adp.ide.vscode.md). See `CLAUDE.md`.

## Licence

[Apache License 2.0](LICENSE). The plug-in ships three third-party libraries, bundled into it: [yaml](https://github.com/eemeli/yaml) (ISC), which reads YAML documents and never writes them, [cel-js](https://github.com/marcbachmann/cel-js) (MIT), which evaluates the expressions of a DISL or DESL specification, and the icons the tool definitions name from [Material Design Icons](https://github.com/Templarian/MaterialDesign-JS) (Apache-2.0).