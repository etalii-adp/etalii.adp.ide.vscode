# The plug-in's FBL implementation

FBL, the [Format Binding Language](https://github.com/etalii-adp/etalii.adp/blob/develop/specifications/fbl/FBL-specification.md), declares how a tool reads and writes a model that lives in another tool's file, with byte-preserving splices. The plug-in carries a generic implementation of FBL 0.6 in `src/core/fbl`, specified in etalii.adp [spec 009](https://github.com/etalii-adp/etalii.adp/tree/develop/specs/009-vscode-fbl-implementation) at FBL 0.1 and brought to FBL 0.6 by [spec 027](https://github.com/etalii-adp/etalii.adp/tree/develop/specs/027-vscode-disl-fbl-tools). It reads a document of FBL 0.1 to 0.6 with its meaning, and one of a newer minor version with a warning (FBL 2.7).

## What the library is

**Every tool type uses it.** A tool type is read from its definition (see [docs/disl-support.md](disl-support.md)), and its documents are read and written through its FBL binding by this library: an edit is the library's splices of the text, and a registration is read with the library's registration document. The library itself adds no editor, command, finding or setting.

It takes an FBL document and a body as bytes, and:

- loads the document (FBL 14.1, steps 1, 2, 4, 5 and 6): duplicate keys, the version, every name, every regular expression and CEL expression, each problem at its JSON Pointer;
- reads a body through a binding into elements, relations and findings, never failing on content; what a slot reads from a yaml or json scalar, its written text or its typed value, is settled by the binding's `read` and, without it, by the attribute's type, which the caller gives with `FblOptions.attributeType` (FBL 5.2);
- plans a change (add, set, remove, a move among siblings, an id stored in an entry that has none) as FBL's splices, applies it, and keeps a history with exact undo and redo, refused when the file changed underneath;
- reads and writes the `.adp` registration by splices, finds a registration's body, and reads and writes legacy sidecars;
- routes a file to its bindings, recognises a folder subject, produces a new body from a template, and does the host's side of the persistence plugin contract.

Offsets are UTF-8 byte offsets, a byte-order mark included. The library names no tool type and no binding, and imports neither Visual Studio Code nor a browser; `test/core/fbl/generic.test.ts` and two lint rules keep it so. Its public surface is `src/core/fbl/index.ts`, and it is reached from the rest of the plug-in at one place: `AdpApi.fbl`, the object `activate` returns (`src/extension/extension.ts`).

It is a port of standalone's library (`EtAlii.Adp.Specification.Fbl`, first at [`25fc7b4a`](https://github.com/etalii-adp/etalii.adp.ide.standalone/tree/25fc7b4af7a99989d23d75d1af9d844303243b9d/src/backend/EtAlii.Adp.Specification.Fbl) and then with what it gained up to [`5756a07`](https://github.com/etalii-adp/etalii.adp.ide.standalone/tree/5756a07edf339f2d0f8d118bd8922848032b6058/src/backend/EtAlii.Adp.Specification.Fbl)), module by module, with FBL as the referee where the two differ. Standalone at `5756a07` is behind FBL 0.6 in places; there the library is built from FBL and its fixtures, and "Differences from standalone" says where. Every sentence a user can see is standalone's, word for word, in `src/core/fbl/messages.ts`, apart from the few marked there as this host's.

The library keeps a history of its own, as FBL section 7 requires of a host, while the plug-in's diagrams make every change an edit of the file's text document, with Visual Studio Code's undo. The feature that first connects a tool to the library has to reconcile the two, and the editor's one line ending per file with FBL's bytes; this feature leaves that open.

## Class and families

The plug-in claims **FBL 0.6, *Host, declared*** (FBL 15.1) for all five families: `yaml`, `json`, `xml`, `lines` and `blocks`. The claim rests on FBL's twenty-five round-trip fixtures, in twenty-three folders, which pass splice for splice (`test/core/fbl/conformanceFixtures.test.ts`, and step by step for the Knowledge designer's in `knowledgeFixtures.test.ts`), and one of them is walked in a real Visual Studio Code from the packaged plug-in (`test/vscode/fbl.test.ts`). The two fixtures of FBL 0.6, `insert-empty-yaml` and `insert-empty-json`, which standalone at `5756a07` departs from, pass here as they are written. For a binding read by a persistence plugin it does the host's side (FBL 11.3); it has no plugin, so such a body opens read-only with `std.pluginMissing`.

*(FBL 0.8)* The library also writes an insert's `constant`, which [etalii.adp spec 033](https://github.com/etalii-adp/etalii.adp/tree/develop/specs/033-fbl-insert-constant) added to FBL 0.8 (section 6.2), without claiming the rest of 0.7 and 0.8. Every new entry is given the constant's keys and values as they are: one that `insert.keys` names is written at its place there, every other after the entry's other keys, in the constant's member order, each as its JSON type. No other edit writes a constant. Loading refuses a constant outside the yaml and json families, one beside `emit`, a value that is not a scalar, and a key that the same rule writes too (section 14.1, step 6). The fixtures `insert-constant-yaml`, `-json`, `-yaml-read` and `-json-read` pass, and `refused/insert-constant-collision.fbl` is refused at its rule `task` alone (`test/core/fbl/loading.test.ts`).

Every one of the 132 tests of standalone's library at `5756a07` has a counterpart here, or the reason it does not apply; `test/core/fbl/baseline.json` lists them and `baseline.test.ts` checks the list. Five do not apply: the cross-check of a binding against standalone's own parsers of four diagram types, which this host does not have; a measurement whose times are not asserted; and the three tests that record how standalone departs from the two FBL 0.6 fixtures, which this library passes.

## Where the copies come from

The tests read FBL's example bindings, fixtures and registrations, copied from etalii.adp, and the real files standalone's FBL tests read, copied from etalii.adp.ide.standalone. Both are under `fixtures/fbl/`, unchanged, with the commit of each and a SHA-256 for every file; see [fixtures/fbl/PROVENANCE.md](../fixtures/fbl/PROVENANCE.md). `npm run sync-fbl` refreshes them.

| Copy | From | Commit |
|---|---|---|
| `fixtures/fbl/conformance/` | etalii.adp, `specifications/fbl/` | `20c73ae4cbcfb0723e177e74528a441d4fca4340` |
| `fixtures/fbl/definitions/` | etalii.adp, `definitions/`: the bindings and inputs a fixture names, and the specification beside each | `20c73ae4cbcfb0723e177e74528a441d4fca4340` |
| `fixtures/fbl/real-files/` | etalii.adp.ide.standalone, `src/` | `5756a07edf339f2d0f8d118bd8922848032b6058` |
| `fixtures/fbl/conformance/`: `fixtures/insert-constant-*/` and `refused/` | etalii.adp, `specifications/fbl/`, taken ahead of the rest for spec 033; `scripts/sync-fbl.mjs` pins them, and leaves them to the rest once its etalii.adp commit has them | `59e2117738fb0e254f961d093b25038c90af78fe` |

## Not implemented

The library implements what the fixtures and the 132 baseline tests prove. What FBL requires and neither proves is not built: building it would have two hosts decide bytes separately, where a fixture in etalii.adp should decide first.

| FBL | What is missing |
|---|---|
| 5.2, 6.2 | In json and xml, the levels above a container that `create.at: "end"` creates when they are missing, and in json a key written into a child mapping that is not there yet (an attribute's `create: {at: "end"}`). The yaml family does both. In json a missing container is created only after a member that stands on one line with its siblings. |
| 5.5, 6.4 | Through a declared binding: moving an element to another parent, an `add` with a `position`, and a `retype`. Each is refused with a sentence, and a body read by a plugin hands each to its plugin as it was made. A move among the siblings of one parent is planned. |
| 6.2 | `insert.place` as `{before: key}` and as `next-sibling`: every family refuses the first, where the tree families and xml once placed the entry at the end. |
| 7.1 | A snapshot undo is reported as its inverse splices, not as one splice of the whole body; the bytes it gives are the same. |
| 8.3 | Removing `layout:` with its last entry, other than by undo. |
| 8.4 | `registration.createOnFirstPlacement`: the registration is created by the caller. |
| 8.7 | `registration.legacyIdentities` and `legacyLayout` are read from the binding and a sidecar is read and written when handed to the library, but the library does not find and apply one on its own. |
| 9.1 | One open body shared by several readings. |
| 10.2 | A folder subject's rules reading its files: a folder is recognised and its files listed, no more. |
| 10.3 | Watching a folder subject and settling. |
| 14.1, step 3 | Validating an FBL document against the JSON Schema. |
| 14.1, step 4 | Checking that a reference's `by` is an attribute every rule in `to` binds; a reference `by: "id"` is checked. |

## Differences from standalone

Where this host does something else than standalone's library at `5756a07`, and why. The first table is where FBL 0.5 and 0.6 and their fixtures decide and standalone is behind them; no fixture and no baseline test depends on any row of the second.

| What | Standalone | Here | Why |
|---|---|---|---|
| The version read (FBL 2.7) | 0.1; any newer minor version loads with a warning | 0.1 to 0.6 without a warning, 0.7 and newer with one | FBL names the six versions, and a host reads an earlier minor version with its meaning. |
| What a slot reads from a yaml or json scalar (FBL 0.5, sections 4.1.5 and 5.2) | The typed value in every case; with `attributeType`, a text that says a number is taken for one, quoted or not | The written text for `read: "text"`, a reference, an id and a string attribute, and the typed value converted for every other; `quoted: "convert"` reads a quoted scalar from its text; a value that does not convert is its `fallback`, reported as `fbl.unconverted-value` with the attribute and the written text, or makes its entry unreadable; a key with no value leaves a typed attribute absent | The `timeline-written-text` fixture: an id written `007` is `007`, and a reference written `7` does not name it. Without `attributeType` a slot without `read` reads as its family reads it, as before. |
| CEL (FBL 2.4) | The engine it shares with DISL | The library's own evaluator, with `text` and `style` beside `entry` in a yaml or json rule, the function `type` and the names of the types | FBL 0.5 presents the written text and the style to CEL, and a copied binding asks `type(entry.view) == map`. An xml rule has no `text` or `style`, since xml reads text and nothing else. |
| A value written for a slot read as text (FBL 6.3) | No such slot | An attribute whose `style` is `plain` is written plain whenever YAML's syntax allows it; a number or bool replacing a quoted scalar that the binding reads with `quoted: "convert"` keeps the quotes | The same fixture: the row `"3"` becomes `"5"`. |
| An empty value on an insert (FBL 0.6, section 6.2) | yaml writes the key only under an explicit `empty: "keep"`; json writes every value that is not null; neither refuses | An attribute the add gives its empty value is written with `keep`, left out with `remove` and refuses the add with `refuse`; without `empty` an empty text or list is kept and a null is left out; an attribute the add does not give is left out. The same in yaml, json and a new xml element | The `insert-empty-yaml` and `insert-empty-json` fixtures. |
| The layout of a new json entry (FBL 6.3) | Always on one line | One member on each line, indented as the members of the entry it is written beside, when that entry is an object written so; else on one line | The `insert-empty-json` fixture, and the Knowledge designer's, whose rows stand on one line each. |
| The index of a `move` (FBL 11.2) | Counted among the siblings before the element is taken out | Counted after it is taken out; a position may also be `{after: id}` or `{before: id}` | FBL says so, and a fixture's `position` is passed on as it is written. |
| A relation end that names nothing (FBL 5.4) | Reported at the end's value | Reported on the entry | FBL says "on the entry", and the fixture gives the entry's line. |
| What a plugin's `read` is given (FBL 11.2) | The files | The files and the binding's `args`, when it has any; `plan` is given no `args` in either | FBL gives `read` the binding's `args`. |
| What standalone removed as unused | `settle`, `finalNewline`, `legacyIdentities`, a file rule's `readOnly`, `placeBefore`, `BodyLocation.isFolder`, `canRedo`, `suggests`, a layout entry's position and the like | Kept | They are FBL's constructs or part of the surface `src/core/fbl/index.ts` gives the plug-in. |
| Loading (FBL 5.2, 5.7) | Not checked | `read`, `quoted` and `fallback` are refused on a slot of a family that reads text and on a `value` or `capture` slot; a reference `by: "id"` to a rule without `id.from` is refused | FBL says MUST NOT and MUST of both. |
| The types a value is held to (FBL 7.4) | `number`, `bool`, `date`, `datetime`, `time`, the last three by the platform's lenient parser | Those and `int`; a date, a date-time and a time in their ISO 8601 forms | DISL and DESL write them so, and the same value reads the same on every machine. |

| What | Standalone | Here | Why |
|---|---|---|---|
| The bound of a regular expression match (FBL 16) | 250 ms | 1,000,000 steps of the library's own matcher (`regexSteps`) | The platform's matcher cannot be interrupted, and a bound in steps reads the same body the same way on every machine. `test/core/fbl/regexDifferential.test.ts` holds the matcher to the platform's on every expression of the example bindings and every line of the copied bodies. |
| Escapes of a regular expression (FBL 2.5) | Whatever .NET compiles | The listed subset only; `\b`, `\A`, `\x41` and the like are refused at load | FBL lists the subset. |
| `caseInsensitive` and a range in a class | Each letter rewritten to both cases, which widens `[A-Za-z]` to `[`, `\`, `]`, `^`, `_` and a backtick | ASCII letters fold and nothing else | FBL asks for case-insensitive matching of ASCII letters. |
| A counted quantifier | Any count | At most 1000 | It keeps the matcher's program small. |
| CEL: `size` of a string | Grapheme clusters | Code points | CEL defines it so. |
| CEL: `lowerAscii`, `upperAscii` | Every letter | ASCII letters | CEL defines it so. |
| CEL: an int compared with a double | Equal within a tolerance | As the numbers they are | CEL defines it so. |
| CEL: int arithmetic that overflows, `int()` of a number that does not fit | Wraps around | An error | CEL defines it so. |
| A yaml body that is not well-formed | YamlDotNet's offset and message | The offset and message of the `yaml` package the plug-in bundles | Each host asks its platform's parser; the code, `std.unparseable`, is the same. The same holds for a `rootKey` marker. |
| A json body, and an FBL document | Some number forms JSON does not have are read (`01`, `.5`, `1.`) | Exactly RFC 8259 | FBL 4.4 says the body is a JSON text. One reader serves both, because `JSON.parse` loses a number's text, a duplicate key and the order of keys that look like integers. |
| `{decimals: n}` | Rounds the binary value | Rounds the shortest decimal representation by its digits: `1.005` at two decimals is `1.01` | It gives one answer in every language. |
| An integer | Written through a double | A `bigint`, written as its digits | CEL keeps int and double apart, and no digit is lost above 2^53. |
| `time: "keep-precision"` | The platform's lenient date parser | ISO 8601 dates and date-times, read strictly | A value that is no date is written as it is given. |
| Paths | Made absolute against the working directory | Taken as given | The library has no working directory and reads a disk only through `FblFiles`; `LegacySidecar.pathFor` and `locateBody` are given whole paths. |
| A regular expression that takes too long on a marker's line or an xml header | An exception | Read as not matching | Reading does not fail on content. |
| A number that is not finite | An exception when it is written | Written as it reads (`NaN`, `Infinity`) | Reading does not fail on content. |

## Open questions and divergences

Where FBL does not decide, this host decides nothing on its own account: it follows standalone where a fixture or a baseline test fixes the behaviour, and the question is asked in etalii.adp.

| | Question for FBL | Issue |
|---|---|---|
| Q1 | Which CEL functions and macros must a host support? | [etalii.adp#71](https://github.com/etalii-adp/etalii.adp/issues/71) |
| Q2 | The finding code for a regular expression that exceeds its bound, and how the bound is measured. | [etalii.adp#72](https://github.com/etalii-adp/etalii.adp/issues/72) |
| Q3 | Where `std.unparseable` is located for a yaml body that is not well-formed. | [etalii.adp#73](https://github.com/etalii-adp/etalii.adp/issues/73) |
| Q4 | Whether `{decimals: n}` rounds the shortest decimal representation or the binary value. | [etalii.adp#74](https://github.com/etalii-adp/etalii.adp/issues/74) |
| Q5 | Which sentences are normative, since a fixture compares a refusal's reason exactly. | [etalii.adp#75](https://github.com/etalii-adp/etalii.adp/issues/75) |
| Q6 | What `caseInsensitive` does to a range in a character class; `structurizr.fbl` is touched by it. | [etalii.adp#64](https://github.com/etalii-adp/etalii.adp/issues/64) |
| Q7 | Whether the list of escapes in section 2.5 is closed. | [etalii.adp#76](https://github.com/etalii-adp/etalii.adp/issues/76) |
| Q8 | Section 5.2: what a slot without `read` reads when the host has no type for the attribute. Here: what its family reads, as before FBL 0.5. | [etalii.adp#148](https://github.com/etalii-adp/etalii.adp/issues/148) |
| Q9 | Sections 4.1.4, 4.1.5 and 5.2: the typed value of a plain `yes` is a bool in 4.1.5 and 5.2's table and a string by the YAML 1.2 core schema that 4.1.4 names. Here: CEL's `entry` keeps the core schema, and a bool attribute reads the YAML 1.1 words `yes`, `no`, `on` and `off` of a plain scalar. | [etalii.adp#148](https://github.com/etalii-adp/etalii.adp/issues/148) |
| Q10 | Sections 5.2 and 6.2: the default `empty` of an attribute that is not a string, when an add gives it null or an empty list. Here: an empty list is kept, as an empty text is, and a null is left out. | [etalii.adp#148](https://github.com/etalii-adp/etalii.adp/issues/148) |
| Q11 | Section 6.3: how the members of a new json object entry are laid out. Here: as the entry it is written beside. | [etalii.adp#148](https://github.com/etalii-adp/etalii.adp/issues/148) |
| Q12 | Section 6.3: whether a number that replaces a quoted scalar keeps the quotes when the binding does not say `quoted: "convert"`. Here: only with `convert`. | [etalii.adp#148](https://github.com/etalii-adp/etalii.adp/issues/148) |
| Q13 | Sections 6.4 and 15.3: a declared binding plans an `add` with a `position`, a `move` to another parent and a `retype`, and no fixture has one. Here: refused, as standalone refuses them. | [etalii.adp#148](https://github.com/etalii-adp/etalii.adp/issues/148) |
| Q14 | Sections 5.4 and 7.4: where an attribute's reference that names nothing is reported, on the value or on the entry. Here: at the value, as standalone has it; a relation's end is on the entry. | [etalii.adp#148](https://github.com/etalii-adp/etalii.adp/issues/148) |
| Q15 | Sections 5.2 and 6.2: a set of an attribute to its empty value where the slot is absent writes nothing here, also under `empty: "keep"`, so an add that gives the empty value and an add followed by such a set differ. | [etalii.adp#148](https://github.com/etalii-adp/etalii.adp/issues/148) |

Where a copied binding and a real file disagree, the disagreement is recorded in `test/core/fbl/realFiles/divergences.json` with what was observed and why, and the tests fail on an unlisted one, on a listed one that no longer occurs, and on one observed differently. The record has 29 entries, and this host observes each exactly as standalone records it: none was added, removed or changed. Their causes, and two more that standalone knows from the cross-check this host cannot run:

| Cause | Entries | Issue |
|---|---|---|
| `structurizr.fbl`'s view block rule reads a view's description as its key. | 24 on a registration's view | [etalii.adp#65](https://github.com/etalii-adp/etalii.adp/issues/65) |
| FBL 4.7: `{` followed by a comment opens no block, and the body is unreadable. | 1 unreadable body | [etalii.adp#66](https://github.com/etalii-adp/etalii.adp/issues/66) |
| Causal loop registrations key positions by `variable:<name>`, the binding reads the bare name. | 2 on a registration's layout | [etalii.adp#67](https://github.com/etalii-adp/etalii.adp/issues/67) |
| `databricks-pipeline.fbl` has no `registration.resource` capture. | 2 on a registration's resource | [etalii.adp#68](https://github.com/etalii-adp/etalii.adp/issues/68) |
| `mindmap.fbl`'s branch relation selects entries its node rule always takes. | as standalone states it | [etalii.adp#69](https://github.com/etalii-adp/etalii.adp/issues/69) |
| `structurizr.fbl` has no rules for components and deployment elements. | as standalone states it | [etalii.adp#70](https://github.com/etalii-adp/etalii.adp/issues/70) |

## Duration of the unit tests

The unit tests may take at most twice as long as before the library came (spec 009, SC-007).

| When | "Test the core and the webview" (`npm run test:unit`) | Build run |
|---|---|---|
| Before, on `develop` at `f0f9cf1` | 7 seconds | [37384430774](https://github.com/etalii-adp/etalii.adp.ide.vscode/actions/runs/37384430774) |
| After, on pull request 21 at `4c6f830` | 12 seconds | [37542183510](https://github.com/etalii-adp/etalii.adp.ide.vscode/actions/runs/37542183510) |
