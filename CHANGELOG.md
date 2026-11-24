# Changelog

All notable changes to **ADP: A Different Perspective** are listed here, newest first.

## [Unreleased] (0.2.3)

### Fixed

- **Causal loop diagram:** in an exported flow page, variable names are now readable at every heat. A variable just above the middle of the scale showed a dark name on a mid-brown fill; the name now takes whichever of a dark and a light ink stands out more.

### Changed

- The extension is easier to find for ITIL 4 service management: its description and keywords now name the value stream map, the SLO map and the post-incident review designer and the practices they support.
- The Marketplace page has been rewritten to describe each tool from a Visual Studio Code user's point of view, with a screenshot of each, and this changelog is now shown on the Marketplace.

## [0.2.2] - 2026-11-24

### Added

- **Causal loop diagram:** new command **ADP: Include Causal loop diagram LLM instructions** saves a Markdown guide that teaches an AI assistant how to read and write causal loop diagrams, wherever you choose.

## [0.2.1] - 2026-11-24

### Fixed

- **Causal loop diagram:** a diagram created with **ADP: New Causal loop diagram** can now be edited straight away; the layout file it needs is created with it.

## [0.2.0] - 2026-11-24

Three new tools for ITIL 4 service management.

### Added

- **Value stream map** (`.vsm`): how a service request or an incident flows from its trigger through its steps to its outcome, with lead time, process time, flow efficiency and hand-offs calculated for you. **Create future state** copies the current state to design an improvement, and the two are compared. One state is shown at a time.
- **SLO map** (OpenSLO YAML): services, SLOs, indicators, data sources and alerting drawn with every reference as a line, and mistakes such as conflicting windows shown at the object concerned. Open any YAML file with **ADP: Open as SLO map**, or a whole folder of OpenSLO files as one read-only map.
- **Post-incident review designer** (Markdown): a blameless incident review on one page of sections, with the time to detect, engage, mitigate and resolve, a timeline on a time strip, contributing factors by category and follow-up actions.

### Changed

- A yes/no property is now a switch, and a number is typed as text in the form the file stores it, instead of in your region's number format.
- A duration such as `15m` is refused with a message showing the expected form (for example `PT15M`) instead of being written and breaking the step's times; empty date and duration fields show their form.
- The labels of a time strip stand level and never overlap; a line's label is no longer crossed by its own line.
- A problem found in a row is shown as its full sentence under the row.
- The ADP Toolbox and ADP Properties explain what to do when a designer is open, instead of showing nothing.
- **Dependency graph:** easier first steps. A new graph shows a hint and opens the ADP Toolbox, every node shows the dots a dependency is drawn from, a node created off-screen is scrolled into view, and an item dropped from the Toolbox lands on free space instead of on top of a node.

## [0.1.2] - 2026-11-23

### Added

- **Dependency graph** (`.dgr`): named items on rows joined by dependencies. Draw a dependency out of a node's side, let go on empty canvas to create the node there, press `Tab` or `Enter` to add a node to the right or below, add nodes with **ADP: Add Node**, edit position and label in ADP Properties, and see missing, repeated and dangling references reported as problems.

### Fixed

- **Knowledge:** a column can be resized by dragging its border again, and resizing, hiding or wrapping a column no longer moves it to the front.
- Two layout changes made at once (for example two folds) are both kept.

## [0.1.1] - 2026-11-23

### Added

- **Causal loop diagram:** **ADP: Export Flow Page** saves an animated, self-contained HTML page of the diagram beside the file and opens it. It is available from the diagram's right-click menu, the Command Palette, the Explorer and the editor title bar.
- The extension has its ADP icon in the Marketplace and the Extensions view.

### Changed

- **Causal loop diagram:** links, selected variables and loop captions now use the same colours as the other ADP hosts, in light and dark themes.

## [0.1.0] - 2026-11-22

First release on the Visual Studio Marketplace and Open VSX.

### Added

- **Mind map** (`.mm`), in the Freeplane format: add, rename, drag and fold nodes, with notes and links to files and folders.
- **Causal loop diagram** (`.cld`): variables, causal links with polarity and delay, and feedback loops checked as reinforcing, balancing or undecidable; **ADP: Arrange Diagram** lays it out.
- **Gartner hype cycle graph** (`.ghg`): trends, triggers, notes and influences on the hype cycle, with tag filters, a compact view and **ADP: Even Phases**.
- **Agent Behavior Modelling** (Markdown): a chat agent's instructions as a behavior tree, kept as a bullet list in the agent's own Markdown file.
- **Agent activity diagram** (`.aad`): which agents work on which tasks of which project, following the file live as agents update it.
- **Hierarchical Requirement Designer** (Markdown): requirements as boxes within boxes, with tags, categories, states, notes, references, saved filters and resizable columns.
- **Knowledge** (YAML, JSON, XML): a table of rows and typed properties with stored views that sort, filter and group.
- **ADP Toolbox** and **ADP Properties** in the ADP view of the activity bar, **ADP: Open as Text**, and full Undo and Redo for every change.
- Language support for `.atd` tool descriptions: colouring, completion, hover, rename, formatting and live problem checking, with **ADP: New Tool Description**, **ADP: Check Tool Description** and **ADP: Validate Tool Description**.

[Unreleased]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.2.2...develop
[0.2.2]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/etalii-adp/etalii.adp.ide.vscode/releases/tag/v0.1.0
