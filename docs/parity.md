# Parity record

Where this host differs from a tool's definition in [etalii.adp](https://github.com/etalii-adp/etalii.adp/tree/develop/definitions/diagrams), and why. The definition, its `.dis` and its companion together, is the reference (etalii.adp spec 006, FR-006 and FR-007): a behaviour the definition states is either here, covered by a test, or listed below. A difference between a definition and the standalone host is not settled here; it is raised as a change to the definition.

**Keep this record with the code: a change that closes or opens a difference changes its row in the same pull request.**

## Every diagram type

| Difference | Why |
|---|---|
| The ADP Toolbox is docked inside each diagram's editor, not shown as a view of its own. | Visual Studio Code does not carry a drag from one webview to another, and dragging an entry onto the canvas is the toolbox's main use. ADP Properties needs no drag and is a view. |
| A file with mixed line endings is saved with one kind. | Visual Studio Code's text document keeps one line ending per file and normalises the others when it reads the file; the diagram edits that document. A file with one kind of line ending, with or without a final newline, is kept byte for byte. |
| A read-only diagram hides the toolbox and offers no handles, rather than showing them disabled. | Nothing that edits is offered (FR-037); what is not there cannot be mistaken for something that works. |
| A refusal is shown on a line at the bottom left of the canvas for eight seconds, and at its field in ADP Properties. | The standalone host has one refusal line around its canvas; this is its place here. |
| A tooltip appears after the browser's own delay. | Tooltips are SVG titles, which Visual Studio Code's webviews show as any page does. |
| The time ruler shows one rung at a time. | The finest rung whose labels are 64 pixels apart is shown, as the definition says; the standalone ruler also draws the next coarser rung above it. |

## Gartner hype cycle graph

| Difference | Why |
|---|---|
| The sentence of "The document could not be read as YAML: ..." ends differently, and a file one reader accepts the other may refuse. | This host reads YAML with the `yaml` library and the standalone host with YamlDotNet. Both report the problem as `ghg.unreadable-entry` with its line and open the diagram empty and read-only. |
| A toolbox drop while Compact is on lands at the date of the true-time x under the pointer, not at the date the compact position stands for. | The definition approximates this by running the compact placement backwards; that is not built yet. |
| Empty canvas offers "Arrange diagram" and not "Add trend here", "Add trigger here" and "Add note here". | The toolbox adds all three, by drag or at the centre of the view. |
| A trigger's influence leaves from whichever of its top, right and bottom is nearest the point it arrives at. | The definition says the line leaves facing its target; nearest of the three is this host's reading of it. |
| An influence can also be drawn with a right-button drag from anywhere on a trend or trigger. | The frame offers it for every diagram type, since Agent Behavior Modelling draws its relation that way; a press on a trend's top or bottom edge draws one as the definition says. |
| Moving the Phases slider makes one edit, and one undo step, for every stop passed. | As in the standalone host, where each stop passed is its own command. |
| A new id is 25 characters of base 36. | That is what the standalone host mints today; the definition's companion still says 22 characters of base 64, and is to be corrected there. |
| Dates and sizes typed in ADP Properties are committed when the field loses the focus or Enter is pressed. | A property grid's usual behaviour; the standalone grid previews a drag in these rows, which this host does not. |
