# Parity record

Where this host differs from a tool's definition in [etalii.adp](https://github.com/etalii-adp/etalii.adp/tree/develop/definitions/diagrams), and why. The definition, its `.dis` and its companion together, is the reference (etalii.adp spec 006, FR-006 and FR-007): a behaviour the definition states is either here, covered by a test, or listed below. A difference between a definition and the standalone host is not settled here; it is raised as a change to the definition.

**Keep this record with the code: a change that closes or opens a difference changes its row in the same pull request.**

## Every diagram type

| Difference | Why |
|---|---|
| The ADP Toolbox is a view of its own, beside ADP Properties, and adds an entry at the centre of what the diagram shows when it is clicked or activated with Enter or Space. | A view can be put wherever the user wants it, which a toolbox docked in the editor could not. |
| A file with mixed line endings is saved with one kind. | Visual Studio Code's text document keeps one line ending per file and normalises the others when it reads the file; the diagram edits that document. A file with one kind of line ending, with or without a final newline, is kept byte for byte. |
| A read-only diagram hides the toolbox and offers no handles, rather than showing them disabled. | Nothing that edits is offered (FR-037); what is not there cannot be mistaken for something that works. |
| A refusal is shown on a line at the bottom left of the canvas for eight seconds, and at its field in ADP Properties. | The standalone host has one refusal line around its canvas; this is its place here. |
| A tooltip appears after the browser's own delay. | Tooltips are SVG titles, which Visual Studio Code's webviews show as any page does. |
| A file named on the command line when Visual Studio Code starts opens as text; opened any other way, from the Explorer, Quick Open, or the command line into a window that is already running, it opens in its diagram. | Seen with a `.ghg` file on Visual Studio Code 1.140: the editor for a file given at start-up is chosen before the editors that plug-ins bring are known. `Reopen Editor With...` shows the diagram; the plug-in does not reopen the tab by itself, since a text tab may be what the user chose. |
| A document is first shown whole when that leaves it readable, and otherwise from its top-left corner at 60 percent. | A graph of three centuries fitted into one screen shows nothing that can be read or pointed at. |
| The time ruler shows one rung at a time. | The finest rung whose labels are 64 pixels apart is shown, as the definition says; the standalone ruler also draws the next coarser rung above it. |

## Gartner hype cycle graph

| Difference | Why |
|---|---|
| The sentence of "The document could not be read as YAML: ..." ends differently, and a file one reader accepts the other may refuse. | This host reads YAML with the `yaml` library and the standalone host with YamlDotNet. Both report the problem as `ghg.unreadable-entry` with its line and open the diagram empty and read-only. |
| Empty canvas offers "Arrange diagram" and not "Add trend here", "Add trigger here" and "Add note here". | The toolbox adds all three, by drag or at the centre of the view. |
| A trigger's influence leaves from whichever of its top, right and bottom is nearest the point it arrives at. | The definition says the line leaves facing its target; nearest of the three is this host's reading of it. |
| An influence can also be drawn with a right-button drag from anywhere on a trend or trigger. | The frame offers it for every diagram type, since Agent Behavior Modelling draws its relation that way; a press on a trend's top or bottom edge draws one as the definition says. |
| Moving the Phases slider makes one edit, and one undo step, for every stop passed. | As in the standalone host, where each stop passed is its own command. |
| A new id is 25 characters of base 36. | That is what the standalone host mints today; the definition's companion still says 22 characters of base 64, and is to be corrected there. |
| Dates and sizes typed in ADP Properties are committed when the field loses the focus or Enter is pressed. | A property grid's usual behaviour; the standalone grid previews a drag in these rows, which this host does not. |

## Agent Behavior Modelling

| Difference | Why |
|---|---|
| A drag that only moves a row, and Arrange diagram, are undone and redone with the Undo and Redo shortcuts in the diagram and with "ADP: Undo (Diagram)" and "ADP: Redo (Diagram)", and not from the Edit menu. | Both change the registration alone and leave the Markdown untouched, as the definition requires, so the Markdown's own undo history has nothing to take back. The plug-in keeps those steps itself, each in its turn among the edits of the Markdown, and binds the shortcuts to them only while one is next in line; the Edit menu's Undo is always the document's. A step is kept for as long as the diagram is open. |
| The registration is created when a row is first dragged. | In the standalone host a document is added to a project through its registration, so one always exists. Here a Markdown file is opened as a behavior model directly, and the `.adp` is written only when there is a position to keep. |
| "Edit notes…" takes the focus to the Notes row of ADP Properties. | The standalone host asks for notes in a dialog; Visual Studio Code has no multi-line input dialog, and the property grid has the room. |
| A node's label is shown on at most two lines, ending in an ellipsis. | The standalone canvas draws one line; two fit the node's height and show more of an instruction. |
| The Explorer offers "Open as Agent Behavior Model" only once the plug-in has read the workspace's Markdown files. | Whether a file has a Behavior heading is in its text, which a menu's condition cannot read; the plug-in starts with Visual Studio Code, looks at up to 2,000 Markdown files of at most 512 KB, and keeps the list up to date. "Open With" and the Command Palette offer it for every Markdown file at once. |
| A Do is grey and an Ask the user and a Delegate are teal. | That is what the standalone host draws; the definition's companion states the two the other way round, and is to be corrected there. |
