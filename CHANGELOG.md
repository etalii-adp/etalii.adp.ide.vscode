# Changelog

All notable changes to **ADP: A Different Perspective** are listed here, newest first.

## [Unreleased]

### Added

- **Timeline** and **Dependency graph:** an element can now stand for an element of another file in your workspace, such as a knowledge row, a mind map node or an element of another timeline or graph. Choose **Add from another document…** on the canvas, and the linked element shows its target's current name. **Open linked element** and **Linked from** in its menu take you to the other side, and a link whose target was deleted or cannot be found is listed in the Problems panel.
- **Knowledge:** a relation can now point at a timeline, a dependency graph or a mind map. Choose the diagram as the relation's target, and each cell picks that diagram's elements by name and shows their current names. Type a name that is not there yet and choose **Create** to add it to the diagram as well, as a moment or a period in a timeline and as a node in a dependency graph or a mind map; one undo takes back both files.
- **All tools:** **New ADP Tool…** in the Explorer's right-click menu makes a new tool document in the folder you clicked.

### Fixed

- **Timeline** and **Dependency graph:** a linked element is listed by its target's name, not by an id, in **Linked from** and in the list of **Add from another document…**.
- **Timeline**, **Dependency graph** and **Mind map:** a new file can be linked to at once, before its first edit, and its id is short like the ids of its elements.
- **All tools:** when **Add from another document…** has nothing to offer, it says why: the files it names have no id yet, and get one with their first edit and save.
- **Knowledge:** opening a link to a row that the current view filters out says so, instead of nothing happening.
- **All diagrams:** pressing an element's label beside it selects the element, so a moment on a timeline no longer has to be hit on its small mark.

## [0.2.5] - 2026-11-25

### Fixed

- **Timeline:** a new timeline now opens on the weeks around today, so what you add first is dated near today rather than in 1970.
- **Timeline:** an element whose dates you change in ADP Properties is brought into view where its new dates put it.
- **Timeline:** a timeline that is almost as tall as the editor opens with its last row clear of the date ruler.
- **All diagrams:** an element changed in ADP Properties is scrolled into view when the change moves it out of sight.
- **Timeline:** a new, empty timeline shows the dates around today on its ruler.
- **Timeline:** a Begin later than the element's End is refused in ADP Properties with a sentence saying why, as an End before the Begin already was, instead of the element disappearing.
- **All tools:** a second new document offers the next free name, such as `untitled-2.tml`, instead of offering to overwrite the first.
- **Timeline:** `Tab` and `Enter` select the element they add, so pressing them again goes on along the row or down instead of stacking a second element on the first.
- **Causal loop diagram:** in an exported flow page, clicking a selected loop in the Loops list again now deselects it at once; a Clear button beside the list, `Esc`, or a click on an empty part of the diagram also deselect it.

## [0.2.4] - 2026-11-25

### Added

- **Timeline** (`.tml`): plans, histories and roadmaps against a ruler of dates. Elements are bars from their begin to their end, moments are diamonds, and arrows connect them. Drop an element or a moment on its day, move and resize with the mouse, add one after or below with `Tab` and `Enter`, give a moment an end or take it away, and let **ADP: Arrange Diagram** pack the rows. Unreadable dates, an end before its begin and broken connections are listed in the Problems panel. A timeline opens showing all of it. Connections enter an element from its left, with their arrowhead in front of it. Create one with **ADP: New Timeline diagram**.

### Fixed

- **All diagrams:** a line let go on a dot of another node now connects to that node instead of making a new one.
- **Causal loop diagram:** an exported flow page now shows each loop's name under its loop marker, as the diagram does, not only its R1 or B2 tag.
- **Causal loop diagram:** in an exported flow page, links now curve as deeply as on the canvas, so a page looks like the diagram it was exported from.

## [0.2.3] - 2026-11-25

### Added

- **Mind map:** link a node to a node of another mind map in your workspace, or of the same one. **Add from another document…** searches the workspace by name and adds a linked node that always shows its target's current name. **Open linked element** takes you to the target, and **Linked from (N)** lists the nodes that link to the one you selected. A link whose target was deleted or cannot be found is marked on the node and listed in the Problems panel. Before you delete a node that other documents link to, you are told how many links the delete breaks. The first time you edit a map, it is given an id of its own, so that other documents can link to it.

- **Knowledge designer:** a relation now links the table it relates to and the rows it holds, so it keeps working when either file is moved or renamed within your workspace, and a link that no longer finds its table or row is listed in the Problems panel. A two-way relation is shown in the other table as a read-only column of the name you give it, without changing that file. A knowledge file made before links is converted the first time you edit it in a workspace, in the same undo step.

### Fixed

- **Mind map:** a new mind map now takes its first nodes. Clicking **Node** in the ADP Toolbox adds a node under the selected node, or under the central topic when nothing is selected, and **Tab** adds a child like **Insert**, which Mac keyboards do not have.
- **Causal loop diagram:** in an exported flow page, variable names are now readable at every heat. A variable just above the middle of the scale showed a dark name on a mid-brown fill; the name now takes whichever of a dark and a light ink stands out more.
- **Causal loop diagram:** in an exported flow page, each link now curves to the same side as on the canvas, and a link whose curve you flipped is flipped on the page too. Before, every curve was drawn on the other side.

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

[Unreleased]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.2.5...develop
[0.2.5]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/etalii-adp/etalii.adp.ide.vscode/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/etalii-adp/etalii.adp.ide.vscode/releases/tag/v0.1.0
