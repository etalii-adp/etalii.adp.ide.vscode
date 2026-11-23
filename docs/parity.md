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

## Hierarchical Requirement Designer

The designer is read from its definition; where the definition and the standalone host differ, the row is in [docs/disl-support.md](disl-support.md), "Hierarchical Requirement Designer". The page follows the standalone host after its pull requests 695 to 707, in its sizes and in Visual Studio Code's colours; what follows is this host's own.

| Difference | Why |
|---|---|
| The page follows the text document live: every gesture is an edit of it, one undo step, and Visual Studio Code's modified state, save, revert and conflict handling are its own. Of the standalone host's handling of a second writer, only the bar "This file was changed outside the designer." is kept, shown while a title or description is open and the document changes underneath, by another editor, the disk, an undo or a redo. | The document is Visual Studio Code's; the designer is one editor of it. |
| A delete, by Delete or by the selected box's control, asks first only when the definition's `confirm` asks, in its words, and its button says what the definition calls it. The standalone host's control on a box always asks, and says "Nothing else concerns it." when nothing does. | Whether anything concerns an entry is the definition's count, worked out by the core on the whole document; the page computes nothing of the tool type. Undo takes back a delete that was not asked about. |
| The keys of the page are listed under the keyboard icon at the right of the trail, in the words of the operations they run. | The standalone host shows them beside the actions in its ribbon and menus, which Visual Studio Code does not have for a webview. |
| As many levels fit as the page's width inside its padding holds, so the page never scrolls sideways when they fit. | The standalone host counts the padding too, which can make the deepest column overflow by it. |
| A collapsed box shows its number, title, labels and the mark of its notes only: neither its focus control nor the mark of the levels it does not show. | What a collapsed level holds is not on the page, so there is nothing to focus on or reveal beside it. |
| ADP Toolbox offers Item and Requirement, dragged onto the page to add one where a box dragged there would go, or activated in its view to add one at the selection; ADP Properties shows and edits the selected item's or requirement's id, title, description and labels. The standalone host offers neither beside its page of boxes. | The maintainer's choice for Visual Studio Code, where both views are there for every tool type; it departs from DESL 7.7.1, and is part of etalii.adp issue 526. |
| A label's list is reordered with a member's up and down controls, and with Alt+Up and Alt+Down anywhere in its line; the standalone host's options editor drags a member to its place, which this host does not. | The same move operation runs either way; the keys are the keyboard's path to it, which a drag in the list would not add to. |
| A member deleted from a label's list asks first in the page's own dialog, in the definition's words, when the definition's `confirm` asks; the standalone options editor asks beside the member. | Whether anything carries a member is the definition's count, worked out by the core. |
| A label's look follows from what the surface says of it: tags with their sign, a badge, a status with a dot. | DESL's surface names no look; see "What this host decides" in [docs/disl-support.md](disl-support.md). |
| A step that changes only the registration, such as a column's width, a member's colour or place in its list, or a stored filter, is undone and redone with the Undo and Redo shortcuts in the designer and with "ADP: Undo (Diagram)" and "ADP: Redo (Diagram)", and not from the Edit menu. | The Markdown is not changed, so its own undo history has nothing to take back; the plug-in keeps those steps itself, in their turn among the edits of the Markdown, as it does for Agent Behavior Modelling. A fold is no step at all, as the definition says. |
| While a column's edge is dragged, the boxes of that depth follow the pointer and nothing else is drawn again: how many levels fit is counted with the new width when it is let go. | The standalone host draws its whole page again on every move of the pointer; here a page of thousands of boxes, such as NIST SP 800-53's, keeps up with the pointer. |
| A width the definition's range does not hold is never asked for: the page holds a drag, a key and a reset to 120 to 2000 pixels before it asks. The core holds the width to the parameter's range as well, and refuses one outside it, with nothing written, in this host's words: "Width is a whole number from 120 to 2000." The standalone host refuses one with "A column is 120 to 2000 pixels wide." | The definition words no refusal for a parameter outside its facets, so the core's sentence is this host's generic one, naming the parameter's label and range (see "What this host decides" in [docs/disl-support.md](disl-support.md)); no gesture of the page asks for a width outside the range. |
| The page is a tree to the keyboard and to assistive technology: the arrow keys, Home and End move the selection through the boxes in the order they are drawn, Left and Right also collapse and expand a level, and Alt with an arrow moves the selected box earlier or later among its kind, out of its level or into the level before it. "ADP: Move Earlier" and "ADP: Move Later" do so from the Command Palette. The standalone host's page is a tree to assistive technology, but its boxes are selected and moved by the pointer only. | The accessibility pass the maintainer asked for: everything a pointer does has a key, by the same move operation a drag runs. Alt+Left and Alt+Right are kept from Visual Studio Code, which goes back and forward between editors with them elsewhere. |
| In high contrast, the focus is a dashed outline in the contrast's active border, two pixels wide, on a control and on the selected box while the page has the focus. | Visual Studio Code's high contrast themes tell the focus by that colour; dashed, it is told from the selection's solid outline. |

## Knowledge designer

Its differences from the definition and from the standalone host are listed in [disl-support.md, *Knowledge*](disl-support.md#knowledge); the ones its table surface still has are etalii.adp spec 079's to close.

| Difference | Why |
|---|---|
| Every drag also has its keys: Alt with an arrow moves a tab, a column or a row one place, Alt+Shift with an arrow widens or narrows a column by 20 pixels, and the arrows move a line of an editor by its handle. | Spec 079 asks a keyboard path for every drag (FR-030); the standalone host has none for these. |
| The settings control's editors open under the bar, as one panel, and use the editor's own selects and boxes. | A webview draws with the platform's controls; what each editor offers is the standalone one's. |
| A step that writes two files, such as a two-way relation made, is one entry of Visual Studio Code's undo, taken back by one Undo in the table. On 2026-11-22, in Visual Studio Code 1.147.0 on macOS with the dialogs drawn by the workbench, one Undo after "Neighbours" was made two-way between `countries.yaml` and `regions.yaml` returned both files to their bytes before the step and showed no "Undo in all files" dialog; `countries.yaml` was the one file open in an editor. No picture was taken, since no dialog appeared. Whether the dialog appears while `regions.yaml` is open in an editor too was not seen (etalii.adp spec 080, T022). | The step is one workspace edit over both files, which Visual Studio Code keeps as one undo element; whether it asks first is the platform's, not the plug-in's. |
| A knowledge file renamed in the explorer asks first, in Visual Studio Code's own words: "Extension 'ADP: A Different Perspective' wants to make refactoring changes with this file move", with Show Preview, Skip Changes and OK. | The `target` of the other files is rewritten as a participant of the move, which the platform confirms; the standalone host renames without asking. |

## Causal loop diagram

The diagram is read from its definition and held to the standalone host's recorded transcript (etalii.adp spec 081). Where the definition and the standalone host differ, the row is in [docs/disl-support.md](disl-support.md), "Causal loop diagram"; what follows is what this host does in its own way.

| Difference | Why |
|---|---|
| Variables, links and loops show the tooltips the definition states. | The standalone host shows none; the definition is the reference, and Peter chose on 2026-11-22 to show them. |
| An operation that asks a value, such as "Add link from here…" or a link or a loop dropped onto a variable, asks it in an input box, one value at a time, checked as it is typed against the form's own validation. | Visual Studio Code's input box is its dialog for one line; the standalone host opens a dialog of its own. |
| A request no canvas, menu or row here can make, a row shown and not edited, and a menu entry shown off are refused in this host's words, or in the row's or the entry's reason. | The standalone host's transcript records its own sentence for them; the outcome is the same. |
| A link's curvature or label changed in a statement written in a spelling of its own changes only the words the edit touches. | FBL 6.3: the rest of the line stays as it was spelt, where the standalone host writes the whole statement again. |
| Export flow page writes the diagram's flow page beside the `.cld`, as the desktop host's ribbon does; the standalone host has no such export. It is on the diagram's menu, in the Command Palette, on the right-click of a `.cld` in the Explorer and of the editor's tab, and in the ADP menu of the editor's title bar. | etalii.adp spec 082: Peter asked for the export here and chose its places on 2026-11-22. VS Code gives an extension no menu of its own in the window's menu bar, so the ADP menu is in the editor's title bar. The page is the desktop host's byte for byte (its template copied with `scripts/sync-flow-page.mjs`, its generator ported), which `test/core/plugins/cld-flow-page/` holds against the desktop host's own pages. |
| A flow page of a diagram that opens on a ring holds the centres the canvas draws, to the scene's six decimals; the desktop host writes its own ring unrounded, so the two differ below a millionth of a unit there. | The page holds what this host draws (spec 082, FR-005); a position the registration states is written as the desktop host writes it. |
| A flow page holds a link's note as this host reads it: a bare word is a note, and of two notes the last wins. The desktop host reads the first quoted word. | The standalone host's reading (spec 081, FR-008), which this host follows; raised as a difference of the desktop host in [etalii.adp issue 759](https://github.com/etalii-adp/etalii.adp/issues/759). |

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
