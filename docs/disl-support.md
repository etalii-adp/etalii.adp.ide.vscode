# What this plug-in supports of DISL, DESL and FBL

The plug-in reads a tool type from its definition: a DISL specification with its FBL binding and its companion document, copied unchanged into `definitions/<tool>/`. One interpreter (`src/core/disl/`), one scene (`src/core/scene/`) and one function (`toolTypeFrom` in `src/core/tool/`) turn any such folder into a tool type. This page says what they read of a definition and what they do not, which behaviours this host had to choose because a definition leaves them unstated, where a tool type here differs from its definition, and which differences are raised with `etalii.adp` and settled nowhere here.

Read it before copying a definition, to know whether it will work in this host, and when writing one, to know what this host does with a construct. A definition that asks for more than this page lists still opens: what is not supported is read as the nearest thing that is, and reported as a finding in the Problems panel.

Two other records stand beside this one and are not repeated here. [docs/parity.md](parity.md) holds the differences from the standalone modules, and [docs/fbl.md](fbl.md) holds what the FBL library implements.

## Versions

| Language | Version read | What happens with a newer minor version |
| --- | --- | --- |
| DISL | 0.3 | The specification opens, with one finding (`disl.specification`, warning) that says it is newer than the DISL this host reads |
| DESL | None yet | A folder with a `.des` file is not offered as a tool type. DESL arrives with the first designer |
| FBL | 0.1 to 0.6 | A binding of 0.7 or newer loads with a warning. See [docs/fbl.md](fbl.md) |

A specification or a binding of another major version does not load, and its folder is no tool type.

## Conformance class and features

The list is the one of [`src/core/disl/support.ts`](../src/core/disl/support.ts): a feature is added there by the change that builds it, and to this table with it. A test holds the two together. A specification whose `language.requires` names another feature, or a higher conformance class, opens with one finding for each (`disl.unsupported-feature`, `disl.unsupported-conformance`, both warnings).

The conformance class is `standard`.

| Feature | What is built |
| --- | --- |
| `axis.yearMonth` | A time axis whose values are a year and a month, counted in months, with a unit of a month or coarser that may be bound to an attribute of the diagram |
| `ruler.adaptive` | A ruler whose levels are shown by the room their labels have on screen (`minSpacingPx`, `minZoom`, `maxZoom`, `step`), never finer than `minUnit` |
| `snap.byGesture` | Snapping rules per gesture, read with the coordinate system and the node notation |
| `anchor.part` | An edge end on a part of a composite shape, on a side of it and a fraction along that side |
| `canvas.filters` | The filters of `notation.canvas.filters` with the controls `chips`, `switch`, `select` and `search`, the effects `hide` and `dim`, and matching any or all |
| `viewpoint.variants` | A viewpoint that varies another, offered as its `toggle` |
| `placement.bound` | A node placed by its attributes on both axes, with `x2`, `y2`, `width`, `height`, `offset` and an anchor |
| `shape.custom` | A shape declared as path segments with parameters and handles |
| `shape.composite` | A shape made of parts, each with its own shape, box, style, condition and tooltip |
| `edge.bezier` | An edge drawn as a cubic curve, with `startDirection`, `endDirection`, `reach` and `maxReach` |
| `label.parse` | A label whose edited text is parsed and written by the specification's own rule |
| `persistence.fbl` | A document read and written through an FBL binding |

## What is read of each section

| Section | Read | Not read, and what happens instead |
| --- | --- | --- |
| The specification as a whole | `disl`, `language`, `functions` and the sections below. Of `plugins`: each plugin's id, `provides`, `required` and `fallback` | `imports` and every `x-` extension are not read. A section that is not an object is not read and is reported |
| `metamodel` | Types with inheritance, relations with the types each end allows, enums, data types, the diagram's own attributes, defaults | The built-in findings a metamodel generates are not raised yet, `std.endpoints` apart: `std.required`, `std.facets`, `std.unique`, `std.multiplicity`, `std.containment`, `std.acyclic` and `std.axisBounds` |
| Expressions (DISL 12) | CEL, with elements, their attributes and their neighbours, and the functions `isA`, `label`, `elementById`, `nodesOfType`, `relationsOfType`, `outgoingOf`, `incomingOf`, `yearMonth`, `parseYearMonth`, `formatYearMonth`, `year`, `month`, `enumLabel`, `ordinal`, `clamp`, `textWidth`, `lower`, `upper`, `distinct`, `flatten`, `indexOf`, `range` and `math.abs`, `ceil`, `floor`, `round`, `sqrt`, `trunc` | Any other function of DISL 12.4, and a function a plugin declares. An expression that uses one fails where it is evaluated: a default is used and one finding says so |
| `coordinates` | Linear axes, time axes of year and month, cartesian systems with y down or up, snap profiles, placement, and the ruler of a time axis with every level it declares | Another kind of axis is read as linear, another kind of system as cartesian, each with a finding. A time axis finer than a month is drawn in months. The grid is not drawn. A linear axis has no ruler |
| `notation`: shapes | `rect`, `roundedRect`, `pill`, `ellipse`, `circle`, `text`, `none`; custom shapes from path segments `M`, `L`, `H`, `V`, `Q`, `C`, `Z`; composite shapes; handles | Another built-in shape is drawn as a rectangle. A shape from `svg` or a plugin, and a path given as an SVG path string, is drawn as its bounds. A path segment `A`, `R` or `E` is drawn as a straight line. Each is reported. Icons are not drawn |
| `notation`: edges | Routing `bezier` and `straight`; anchors `outline`, `center`, `fixed`, `sides` and `part`; the end markers named arrow, triangle, diamond and circle, open or filled | Another routing is drawn as a straight line and reported. A `port` anchor is read as `outline`. A marker declared in `notation.markers`, a marker instance, a mid marker and a label on an edge are not drawn; a marker of another name is drawn as an arrow |
| `notation`: text | The text metric, `wrap` (`none`, `word`, `char`), `overflow` (`visible`, `clip`, `ellipsis`, `shrink`), alignment, the font's family, size, weight, colour and line height | `maxWidth` is not applied: a label is laid out in the box its position gives it |
| `notation`: theme and canvas | Theme tokens with the modes `light` and `dark`; the filters; a legend whose entries name an enum or a type; `canvas.background` | A legend `from: "drawn"` or `computed` is shown from its declared entries. The `position` of a filter, the legend and a viewpoint's toggle is not read. `canvas.title`, `header`, `notices`, `empty`, `zoom`, `page`, `bounds`, `fit`, `watermark` and `minimap` are not read |
| `viewpoints` | `include`, `exclude`, `members`, the coordinate system, the layout, the viewpoint's own notation, variants with their toggle | A specification with several viewpoints that are no variants opens in its default one and offers no control to change to another |
| `layout` | `rowPacked` to the right and `rows`. A layout named `plugin:<id>` whose optional plugin is not carried runs the algorithm the plugin's `fallback.layout` names | Another algorithm is not run: the nodes it should place stand at the origin, and a finding says so. A layout plugin is not run yet |
| `constraints` | Invariants and gesture constraints with `scope`, `forEach`, `when`, `rule`, `severity`, `message`, `target`, `location`, `subject`, `attribute`, `timing`, `enforcement`, `enabled` and `group`; `defaults`, `order`, `blockSaveOn`, `builtIn` | A rule `over` a view is left out and reported. Quick fixes and suppressions are not read |
| `behavior` | `messages`, `reasons`, `editGate`, hooks, operations, `deletion`, and the actions `set`, `unset`, `create`, `connect`, `delete`, `let`, `if`, `forEach`, `layout` (the `rows` algorithm), `abort`, `call`, `select`, `reveal`, `highlight`, `editLabel`, `openForm`, `notify` | Parent placements, the clipboard, retyping and simulations are not read. An action of another kind is reported and skipped. An operation that names a plugin and states no actions changes nothing yet. Of the effects, selecting and editing a label in place reach the canvas; `reveal`, `highlight`, `openForm` and `notify` do not yet |
| `toolbox` | Groups and their tools, context menus | Context tools around an element (`contextTools`) are read and not shown: an element's actions are those of its context menu. `showRecent` and `searchable` are not used |
| `forms` | The inspector form of a type, or one made from its attributes: sections, fields, computed items, `visible`, `readOnly` with its reasons, `validate`, `parse`, `display`, options | A form is shown for one selected element only. The diagram's own form, and the usages `create`, `embedded`, `popover` and `bulk`, are not shown. A widget ADP Properties has no control for is shown as text |
| `persistence` | A binding named as `<address>#<name>` of an FBL document, resolved to the copied file of that name; `typeMap`; ids made as `uuid-v4` in the declared encoding with the declared prefix | An inline binding is not read, and a definition whose `format` is not `fbl` is no tool type. Another id strategy is replaced by `uuid-v4`, and id rules for single types by the one rule; each is reported. `persistence.view` is not read: a viewpoint and a filter's value are kept per open editor and never saved. A binding's `registration` block is not written yet |

## Plugins

A plugin is code for one tool type, kept under `src/core/plugins/<plugin>/` and registered by its id in [`src/core/plugins/index.ts`](../src/core/plugins/index.ts), which is the only place its id appears outside its own folder. A test holds this section to that registry: every plugin carried is a row here with its id, what it provides, its folder and the definitions that name it.

None is carried yet.

What happens for a plugin that a definition or a binding names and this host does not carry:

- A plugin declared `required: true`, and the plugin a binding names as its `reader`, makes every document of the tool type read-only. The document opens with what can be read without the plugin, the finding `std.pluginMissing` names the plugin with FBL's sentence, the same sentence is the notice over the canvas, nothing that edits is offered, and every request is refused with it.
- A plugin declared `required: false` gives no finding. A layout it provides is replaced by the algorithm its `fallback.layout` names. An operation it provides changes nothing.

## Code for one tool type

Nothing under `src/core/disl/`, `src/core/scene/` and `src/core/tool/` names a tool type, which a test holds by reading those folders for every name the copied definitions declare. Code for one tool type exists in these places outside a plugin.

| Where | What | Why |
| --- | --- | --- |
| `src/core/gartner-hypecycle-graph/`, with its notation in `src/webview/diagram/` | The Gartner hype cycle graph written by hand, from spec 006 | It serves users until the last pull request of spec 027 (User Story 4) removes it. Until then the type read from `definitions/gartner-hype-cycle-graph/` is built and tested beside it, and the hand-coded one wins for its origin |
| `src/core/agent-behavior-modelling/`, with its notation in `src/webview/diagram/` | Agent Behavior Modelling written by hand, from spec 006 | Its definition's binding is read by a persistence plugin this host does not carry yet. The same pull request removes it, when its parser and writer have become that plugin |
| `src/core/frame/handCoded.ts` | The adapter that makes the frame's contract of a hand-coded diagram: its whole new text as one splice, its extensions as one claim | The two diagrams above keep the shape spec 006 gave them. It goes with them |

## What this host decides

Behaviour a definition leaves unstated and this host had to choose. A rule names no tool type.

| Behaviour | Rule followed | Where |
| --- | --- | --- |
| The mode of a theme | A definition's theme gives its tokens for `light` and `dark`. Light and high contrast light themes read `light`; dark and high contrast themes read `dark`. In both high contrast kinds outlines take the editor's contrast border and text its foreground, so nothing depends on a fill alone. A token with no value in the mode takes the editor's own colour for that role | The scene carries every token with both values (`Scene.tokens`); the webview chooses |
| Where an action at a point lands | An operation that reads `position` runs at the point the request names. A request without one, as from the Command Palette, takes the middle of what the canvas shows. In a viewpoint that places by layout the point is read back onto the axes of the viewpoint it varies, as a drop is | `edit` in `src/core/tool/toolTypeFrom.ts` |
| A tool dropped in a viewpoint that places by layout | Between two placed elements the coordinate runs evenly from the one's own place to the other's, beyond the first and the last it runs at the scale of the base axis, and with nothing placed it is the point itself | `baseCoordinate` in `src/core/disl/behavior.ts` |
| An edge end that names a part or a side its node does not have | The end is drawn at the first place it could name: the first part and the first side its attributes allow, halfway along, and marked `fallback` in the scene. An end on a part the node has and does not draw hides the edge, as DISL says | `onPart` in `src/core/scene/scene.ts` |
| The value of a dragged handle | The share of the node's width the pointer is at, from 0 to 1 | `edit` in `src/core/tool/toolTypeFrom.ts` |
| Which relation a connect gesture draws | The first relation the definition's `connection` menu offers for the two elements | `edit` in `src/core/tool/toolTypeFrom.ts` |
| Which actions an element has | The entries of its context menu. An action's id is the entry's operation, else its kind | `actions` in `src/core/tool/toolTypeFrom.ts` |
| The ids the frame uses | A toolbox entry is a tool's id, and a row of ADP Properties is the form item's `id`, else its attribute, else its label. An `x-` key that maps them to another host's ids is not read | `src/core/tool/toolTypeFrom.ts` |
| The sentence for what a definition has no words for | The interpreter's own: "That is no longer in this diagram.", "This value cannot be changed here.", "This text cannot be changed here.", "This cannot be done with what is selected." A definition's `behavior.messages` replaces a standard one | `src/core/disl/behavior.ts`, `src/core/tool/toolTypeFrom.ts` |
| A document that cannot be read | It opens empty and read-only. The notice is the reader's finding as the definition words it, and a request is refused with the definition's `std.readOnly` message | `opened` in `src/core/tool/toolTypeFrom.ts` |
| Several changes of one gesture | Each is planned by the FBL library against the body the one before left, and all are given as splices of the text before the gesture, so one gesture is one undo step. FBL's own history is not used | `composedSplices` in `src/core/tool/modelChanges.ts` |
| A label inside a node | It is HTML in a `foreignObject`, wrapped by the browser and not by the definition's text metric, because the scene does not carry the metric to the webview. The scene's own sizes and places are computed with the metric | `src/webview/diagram/` |
| What is shown during a drag | A plain stand-in: a translated group or the outline of a box. The canvas draws again from the new scene when the edit is applied | `src/webview/diagram/` |
| The ruler | The scene carries every level of a ruler with its ticks for the part in view. The canvas draws one row, the finest whose ticks have the room the level asks for at the zoom | `chromeOf` in `src/core/tool/toolTypeFrom.ts`, `src/webview/diagram/` |

## Differences from each definition

Every difference between a tool type in this host and its definition. Where the standalone module does something else than the definition, the definition is followed and the row says so: such a difference is not settled here.

### Gartner hype cycle graph

Users are served by the hand-coded diagram until User Story 4. These rows are about the type read from the definition, which is what replaces it.

| What | The definition, followed here | The hand-coded diagram and the standalone module | Issue |
| --- | --- | --- | --- |
| A name with spaces around it | A trend's name is written as typed, quoted. Only the trigger's label trims, through its `parse` | Trimmed | [98](https://github.com/etalii-adp/etalii.adp/issues/98) |
| A description of spaces only | Written as `" "` | The key is removed | [98](https://github.com/etalii-adp/etalii.adp/issues/98) |
| A note's size typed as `200 x 80 at 1961-01 row 6` | The size is set | The note is moved too | [98](https://github.com/etalii-adp/etalii.adp/issues/98) |
| After a trend or a trigger is dropped | Nothing is selected (`after: "none"`) | The new element is selected | [98](https://github.com/etalii-adp/etalii.adp/issues/98) |
| After an influence is drawn | Nothing is selected: the definition states no effect | The new influence is selected | [151](https://github.com/etalii-adp/etalii.adp/issues/151) |
| A key the binding does not read | Kept, and no finding | The finding `ghg.unreadable-entry` | [96](https://github.com/etalii-adp/etalii.adp/issues/96) |
| A malformed value, the wording of a reader's sentence, an unknown enum value, the line of a reference that names nothing | As the definition and the binding give them | As issue 96 lists them | [96](https://github.com/etalii-adp/etalii.adp/issues/96) |
| An end on a trigger | Drawn from the outline (`drawnFrom: "outline"`) | Drawn at the anchor point | [97](https://github.com/etalii-adp/etalii.adp/issues/97) |
| The empty canvas | Offers "Add trend here", "Add trigger here", "Add note here" and "Arrange diagram" | Offers "Arrange diagram" only, see [docs/parity.md](parity.md) | None: the definition is met |
| Removing the last trigger or note | The list's key stays, empty: the binding does not say the container goes with its last entry | Not recorded | None |
| The unit and the header | Read-only: the binding says they are changed in the file itself, so no property edits them | The same | [94](https://github.com/etalii-adp/etalii.adp/issues/94) |

One thing this host does that the definition does not state: where the property grid would show a drag's values while it lasts ([93](https://github.com/etalii-adp/etalii.adp/issues/93)), ADP Properties shows the values after the drag.

### Agent Behavior Modelling

Users are served by the hand-coded diagram until User Story 4. Of the type read from the definition, this is true today.

| What | The definition | Here | Issue |
| --- | --- | --- | --- |
| Reading and editing | The binding's reader is the persistence plugin `abmMarkdown` | The definition loads as a tool type, and the plugin is not carried yet: every document opens read-only and empty, with `std.pluginMissing` | None: it is built with the plugin |
| The shapes `superellipse`, `hexagon` and `parallelogram` | Drawn as such | Drawn as rectangles, each with a finding | None: built with the tool type |
| The layout `tidyTree` | Places the tree | Not run, with a finding | None: built with the tool type |
| "Open as Agent Behavior Modelling" in the Explorer | The binding states no `claims.suggest`, so nothing says which Markdown file looks like a behavior model | The entry cannot be fed from the definition. The hand-coded diagram looks for a Behavior heading | [150](https://github.com/etalii-adp/etalii.adp/issues/150) |
| The binding's address | A relative reference with no such file beside the specification | The copy is taken from `etalii.adp.ide.standalone` by name | [142](https://github.com/etalii-adp/etalii.adp/issues/142) |

## Differences raised and not settled here

The plug-in changes neither a specification nor a binding. Where they and the hosts differ, or where a language cannot state something, an issue in `etalii.adp` says so, and the plug-in follows the definition until the issue is settled.

| Issue | What it is about |
| --- | --- |
| [92](https://github.com/etalii-adp/etalii.adp/issues/92) | The hype cycle graph's specification names its binding by an address into the `develop` branch of `etalii.adp.ide.standalone` |
| [93](https://github.com/etalii-adp/etalii.adp/issues/93) | Four behaviours the hype cycle graph's specification leaves unstated |
| [94](https://github.com/etalii-adp/etalii.adp/issues/94) | The hype cycle graph's binding says the unit and the header are changed in the file itself |
| [96](https://github.com/etalii-adp/etalii.adp/issues/96) | Findings the hosts give for a hype cycle graph that its specification does not state |
| [97](https://github.com/etalii-adp/etalii.adp/issues/97) | Where the drawing the hype cycle graph's specification states differs from what the hosts draw |
| [98](https://github.com/etalii-adp/etalii.adp/issues/98) | Edits the hosts make of a hype cycle graph that its specification states differently or not at all |
| [140](https://github.com/etalii-adp/etalii.adp/issues/140) | The mind map's specification names a binding whose claim has no marker, so every `.mm` file is claimed |
| [141](https://github.com/etalii-adp/etalii.adp/issues/141) | No fixture states the bytes of a mind map edit |
| [142](https://github.com/etalii-adp/etalii.adp/issues/142) | The Agent Behavior Modelling specification names a relative binding that is not beside it |
| [143](https://github.com/etalii-adp/etalii.adp/issues/143) | The mind map's specification names its binding by an address into the `develop` branch of `etalii.adp.ide.standalone` |
| [144](https://github.com/etalii-adp/etalii.adp/issues/144) | Bindings at FBL 0.1 beside a library and fixtures at 0.6: whether a binding is expected to follow |
| [145](https://github.com/etalii-adp/etalii.adp/issues/145) | A definition's theme states `light` and `dark` and nothing for high contrast |
| [148](https://github.com/etalii-adp/etalii.adp/issues/148) | FBL 0.2 to 0.6: what a second host could not decide from the document |
| [150](https://github.com/etalii-adp/etalii.adp/issues/150) | The Agent Behavior Modelling binding states no `claims.suggest`, so a host cannot tell from the definition which Markdown file looks like a behavior model |
| [151](https://github.com/etalii-adp/etalii.adp/issues/151) | The hype cycle graph's specification states no effect after an influence is drawn, where the hosts select it |
