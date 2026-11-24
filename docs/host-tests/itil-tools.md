# Host test: the value stream map, the SLO map and the post-incident review designer

The three ITIL tools in Visual Studio Code, each opened from its examples in both themes and tried as a new user would try it. etalii.adp spec [090](https://github.com/etalii-adp/etalii.adp/tree/develop/specs/090-vscode-itil-tools), task T029, tasks taken from etalii.adp commit `8710bbf`.

## Setup

- **Date**: 2026-11-24, on the Mac mini (macOS, Apple silicon).
- **VS Code**: the installed stable release, with this repository's `develop` at `0200a5b` packaged by `npm run package` (`etalii-adp-0.1.2.vsix`) and installed with `code --install-extension --force`. It ran in a window with a throwaway profile, at 1600×900 CSS pixels, in Dark Modern and Light Modern, on a copy of `examples/` and of the shop folder of FBL's `openslo-slo-folder` fixture.
- Every edit made during the test was undone or reverted, and none was saved.

## Value stream map

**What worked.** Both `.vsm` examples open in the map. The toolbox lists Trigger, Step, Outcome, Flow, Alternative and Rework. A step added from the toolbox is selected, and ADP Properties shows its fields. `PT15M` and `PT2H` are drawn as "PT 15m · WT 2h". Undo takes back every edit, one at a time, until the tab is clean. Each state's totals and the comparison of the two states are drawn.

| # | Finding | Outcome |
|---|---|---|
| 1 | `request-fulfilment.vsm` drew its steps on top of each other. "Build custom" stood on "Fulfil from catalogue", and "Deliver" stood back in the column of "Approve". Its totals were wrong too. | **Fixed** in [#93](https://github.com/etalii-adp/etalii.adp.ide.vscode/pull/93). The columns and rows are recursive functions of the definition, and a recursive call inside `map()` lost the outer call's place. The totals now match the companion's hand-worked figures. |
| 2 | Typing "15m" for a time was accepted. The step's times then vanished, and Problems showed a raw expression error. | **Fixed**: a duration that is not ISO 8601 is refused with a sentence that gives the form, and an empty duration field shows `PT15M, PT2H or P1D`. Whether the definition should accept the shorthand is [etalii.adp#826](https://github.com/etalii-adp/etalii.adp/issues/826). |
| 3 | A step added from the toolbox lands on the trigger. | Definition: [etalii.adp#826](https://github.com/etalii-adp/etalii.adp/issues/826). |
| 4 | The toolbox tooltips show requirement and research ids. | Definition: [etalii.adp#826](https://github.com/etalii-adp/etalii.adp/issues/826). DISL 2.4 says `doc` reaches users. |
| 5 | `restore-service.vsm` opens with its totals off screen to the right. | Open: [#95](https://github.com/etalii-adp/etalii.adp.ide.vscode/issues/95). A drawing is fitted only when fitting leaves it readable. |
| 6 | The wait icon covers the time line, and the trigger's name runs past the chevron. | Definition: [etalii.adp#826](https://github.com/etalii-adp/etalii.adp/issues/826). |
| 7 | Lines and text look dim in Dark Modern. | Open: [#95](https://github.com/etalii-adp/etalii.adp.ide.vscode/issues/95). |
| 8 | Seen once: both documents held their text twice, with no change marked on the tab. | Open, not reproduced: [#94](https://github.com/etalii-adp/etalii.adp.ide.vscode/issues/94). |
| 9 | The State filter, which shows the current or the future state, had no control: a state could be changed only from the menu. | **Fixed**: a filter whose control is a `select` is a list in the diagram's panel, an edit where the diagram keeps it and the viewer's own option otherwise. |
| 10 | After **Show future state**, **Show current state** stays unavailable, and a step added from the toolbox goes to the current state. | Definition: [etalii.adp#829](https://github.com/etalii-adp/etalii.adp/issues/829). |
| 11 | The view does not move to the other state's steps after a switch. | Open: [#95](https://github.com/etalii-adp/etalii.adp.ide.vscode/issues/95). |

## SLO map

**What worked.**
- **Open as SLO map** opens `specification-samples.yaml` as a map.
- The placeholders for references not in the file are dashed and say so.
- Changing an objective's Target to 0.99 rewrote only `target: 0.99`, the label was recomputed, and Undo restored it.
- `shop/openslo.adp` opens the folder read-only. A banner says so, the toolbox says nothing can be added, and every document is drawn.

| # | Finding | Outcome |
|---|---|---|
| 1 | An objective stands apart from its SLO. | Definition: [etalii.adp#827](https://github.com/etalii-adp/etalii.adp/issues/827). |
| 2 | An objective offers both Target and Target percent. | Definition: [etalii.adp#827](https://github.com/etalii-adp/etalii.adp/issues/827). |
| 3 | Target was a number box in the region's format (0,98), and typing added to the old value. | **Fixed**: a number is a line of text holding the number as the file writes it, and is selected on entering. |
| 4 | Rolling was the free text "true". | **Fixed**: a `bool` is a switch. Window stays text, since "4w" is OpenSLO's own form: [etalii.adp#827](https://github.com/etalii-adp/etalii.adp/issues/827). |
| 5 | Edge labels are drawn across their lines and arrowheads. | **Fixed** here as far as the host can: an edge's label is ringed in the editor's background. Where the labels stand is [etalii.adp#827](https://github.com/etalii-adp/etalii.adp/issues/827). |
| 6 | For the folder, the editor picker shows `etalii.adp.openslo.slo`. | Open: [#95](https://github.com/etalii-adp/etalii.adp.ide.vscode/issues/95). |
| 7 | For the folder, the placeholders say "not in this file". | Definition: [etalii.adp#827](https://github.com/etalii-adp/etalii.adp/issues/827). |

## Post-incident review designer

**What worked.**
- Both examples open straight into the designer, with Summary and its four times, Impact, Timeline with its strip, Contributing factors by category, Actions and Categories.
- Accept on a proposed factor set it to accepted and marked it "Unaddressed".
- "New action for this factor" made `A-0001`, which addresses the factor, warned "No owner or due date", and moved the counter in the Markdown.

| # | Finding | Outcome |
|---|---|---|
| 1 | The timeline's labels were turned, small, and printed over each other ("Trigger" on "Start"), and nearly invisible in Dark Modern. | **Fixed**: the labels stand level in the editor's text colour, each on the nearest level where it overlaps no other. |
| 2 | ADP Toolbox was empty with no sentence, and ADP Properties asked for "an element or a relation in the diagram". | **Fixed**: a designer's toolbox says it adds nothing and that items are added with the page's buttons, and ADP Properties asks for an item on the page. |
| 3 | An accepted factor with no action showed a stray "Note". | **Fixed**: a finding is its sentence under the row. That a row says one fault twice, as a mark and as a finding, is [etalii.adp#828](https://github.com/etalii-adp/etalii.adp/issues/828). |
| 4 | An action has a Done checkbox and a Done button, and ADP Properties showed Done as a list of false and true. | The list is **fixed** (a `bool` is a switch). The two controls are [etalii.adp#828](https://github.com/etalii-adp/etalii.adp/issues/828). |
| 5 | After "New action for this factor", the page did not scroll to the new action. | Not seen again: in the second run the page scrolled to the new action and selected it (below). |
| 6 | Times are shown in ISO form, and the Due field is in the region's date format. | Times: [etalii.adp#828](https://github.com/etalii-adp/etalii.adp/issues/828). The date field is the platform's date input. |

## A new user

The test opened each tool from its example as someone who has not used ADP would. All three open with no error and no setup beyond installing the extension, and the SLO map is offered by **Open as SLO map** on any YAML file. These hurdles stood in a new user's way:

- the stacked steps of the value stream map;
- the times that accepted "15m" and then broke;
- the region-formatted number box;
- the unreadable timeline labels;
- the empty toolbox with no sentence;
- the State filter with no control.

All of them are fixed here. What is left is listed above with its issue, most of it in the definitions.

## Screenshots

Each fix above changes what the screenshots show, so they were taken again on the Mac mini with the fixes in, from `develop` at `f739492` (Dark Modern, 1600×900, device scale 1). Retaking them turned up one more fault: the value stream map drew the future state's steps, without their flows, beside the current state's. Its State filter shows one state at a time. The filter took the steps out, but a step placed by an expression was put back when placements were computed again after the layout. That fault is fixed in `src/core/scene/scene.ts` ([#97](https://github.com/etalii-adp/etalii.adp.ide.vscode/pull/97)), and `value-stream-map.png` was taken with it in, from `develop` at `17b8810`, showing the current state alone. That run found findings 9 to 11 of the value stream map. The three screenshots are in [`../screenshots/`](../screenshots/), described in its [readme](../screenshots/readme.md).

The second run also checked these, and each passed:
- "15m" in a Wait time is refused with "'15m' is not a duration: write it in ISO 8601, as PT15M for 15 minutes, PT2H for 2 hours or P1D for a day."
- The post-incident review's ADP Toolbox and ADP Properties now speak of a page.
- "New action for this factor" in `checkout-latency.md` scrolled to the new action and selected it. The open item in #95 for that scroll is withdrawn.
