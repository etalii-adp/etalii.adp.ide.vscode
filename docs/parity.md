# Parity record

Where this host differs from a tool's definition in [etalii.adp](https://github.com/etalii-adp/etalii.adp/tree/develop/definitions/diagrams), and why. The definition, its `.dis` and its companion together, is the reference (etalii.adp spec 006, FR-006 and FR-007): a behaviour the definition states is either here, covered by a test, or listed below. A difference between a definition and the standalone host is not settled here; it is raised as a change to the definition.

**Keep this record with the code: a change that closes or opens a difference changes its row in the same pull request.**

## Every diagram type

| Difference | Why |
|---|---|
| The ADP Toolbox is a view of its own, beside ADP Properties, and adds an entry at the centre of what the diagram shows when it is clicked or activated with Enter or Space. | A view can be put wherever the user wants it, which a toolbox docked in the editor could not. |
| A file with mixed line endings is saved with one kind. This holds for every tool type, a diagram or a designer. | Visual Studio Code's text document keeps one line ending per file and normalises the others when it reads the file; every tool edits that document, and an edit read from a definition is FBL's splices of it. A file with one kind of line ending, with or without a final newline, is kept byte for byte. |
| A read-only diagram hides the toolbox and offers no handles, rather than showing them disabled. | Nothing that edits is offered (FR-037); what is not there cannot be mistaken for something that works. |
| A refusal is shown on a line at the bottom left of the canvas for eight seconds, and at its field in ADP Properties. | The standalone host has one refusal line around its canvas; this is its place here. |
| A tooltip appears after the browser's own delay. | Tooltips are SVG titles, which Visual Studio Code's webviews show as any page does. |
| A file named on the command line when Visual Studio Code starts opens as text; opened any other way, from the Explorer, Quick Open, or the command line into a window that is already running, it opens in its diagram. | Seen with a `.ghg` file on Visual Studio Code 1.140: the editor for a file given at start-up is chosen before the editors that plug-ins bring are known. `Reopen Editor With...` shows the diagram; the plug-in does not reopen the tab by itself, since a text tab may be what the user chose. |
| A document is first shown whole when that leaves it readable, and otherwise from its top-left corner at 60 percent. | A graph of three centuries fitted into one screen shows nothing that can be read or pointed at. |
| The time ruler shows one rung at a time. | The finest rung whose labels are 64 pixels apart is shown, as the definition says; the standalone ruler also draws the next coarser rung above it. |

## Gartner hype cycle graph

The graph is read from its definition (etalii.adp spec 027). Where the definition gives another result than the diagram spec 006 wrote by hand, the row is in [docs/disl-support.md](disl-support.md), "Differences from each definition"; what follows is this host's own.

| Difference | Why |
|---|---|
| The sentence of "The document could not be read as YAML: ..." ends differently, and a file one reader accepts the other may refuse. | This host reads YAML with the FBL library's own reader and the standalone host with YamlDotNet. Both report the problem as `ghg.unreadable-entry` with its line and open the diagram empty and read-only. |
| An influence can also be drawn with a right-button drag from anywhere on a trend or trigger. | The frame offers it for every diagram, since Agent Behavior Modelling draws its relation that way; a press on a trend's top or bottom edge draws one as the definition says. |
| A dragged trend, trigger or note follows the pointer freely, and lands on its step and row when it is let go. A dragged phase boundary shows only its handle, and a resize the outline of the new bounds. | The canvas draws the scene it is sent and computes none: the edit snaps, and the scene that follows shows the result. The lines to what is dragged follow it. |
| Moving the Phases slider makes one edit, and one undo step, for every stop passed. | As in the standalone host, where each stop passed is its own command. |
| A new id is 25 characters of base 36. | That is what the definition's `ids` state and the standalone host mints. |
| Dates and sizes typed in ADP Properties are committed when the field loses the focus or Enter is pressed. | A property grid's usual behaviour; the standalone grid previews a drag in these rows, which this host does not. |

## Agent Behavior Modelling

The diagram is read from its definition (etalii.adp spec 027). Where the definition gives another result than the diagram spec 006 wrote by hand, the row is in [docs/disl-support.md](disl-support.md), "Differences from each definition"; what follows is this host's own.

| Difference | Why |
|---|---|
| A drag that only moves a row, and Arrange diagram, are undone and redone with the Undo and Redo shortcuts in the diagram and with "ADP: Undo (Diagram)" and "ADP: Redo (Diagram)", and not from the Edit menu. | Both change the registration alone and leave the Markdown untouched, as the definition requires, so the Markdown's own undo history has nothing to take back. The plug-in keeps those steps itself, each in its turn among the edits of the Markdown, and binds the shortcuts to them only while one is next in line; the Edit menu's Undo is always the document's. A step is kept for as long as the diagram is open. |
| The registration is created when a row is first dragged. | In the standalone host a document is added to a project through its registration, so one always exists. Here a Markdown file is opened as a behavior model directly, and the `.adp` is written only when there is a position to keep. |
| "Edit notes…" takes the focus to the Notes row of ADP Properties. | The standalone host asks for notes in a dialog; Visual Studio Code has no multi-line input dialog, and the property grid has the room. |
| The Explorer does not offer "Open as Agent Behavior Modelling". "Open With" and the Command Palette offer it for every Markdown file. | The definition's binding does not say which Markdown file looks like a behavior model (etalii.adp issue 150), and nothing here names a tool type to say it instead. |
| While a node is dragged, the lines to what moves are drawn again between their ends, and the siblings it has passed step aside. | As the standalone canvas shows it; the arithmetic is the tidy tree's own, which the scene carries to the canvas. |

## Native dialogs, seen in a real window

A test in a real Visual Studio Code cannot answer a native dialog, so each one the three new tool types raise is looked at once by a person (etalii.adp spec 027, FR-015). Peter Vrenken saw them on 2026-10-13 in Visual Studio Code 1.141.0 on Windows, with the Development build of the plug-in at `9849baf`. Each appeared and read as its definition states.

| Tool type | Dialog | Raised by |
|---|---|---|
| Mind map | The confirmation "Delete branch?", which names the node and the number of nodes under it | Deleting a node that has children |
| Mind map | The choice between a file and a folder, then the platform's open dialog | "Link to" |
| Knowledge | The confirmation before a property goes with its values | Deleting a property that has values |
| Knowledge | The confirmation before an option goes and the rows that use it are cleared | Deleting an option that rows use |
| Mind map, agent activity diagram, Knowledge | Visual Studio Code's save prompt | Closing a document that was edited |

A tool type that is added, or a definition that gains a dialog, gets its row here when a person has seen it.
