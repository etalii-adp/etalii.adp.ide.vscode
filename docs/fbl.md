# The plug-in's FBL implementation

FBL, the [Format Binding Language](https://github.com/etalii-adp/etalii.adp/blob/develop/specifications/fbl/FBL-specification.md), declares how a tool reads and writes a model that lives in another tool's file, with byte-preserving splices. The plug-in carries a generic implementation of FBL 0.1 in `src/core/fbl`, specified in etalii.adp [spec 009](https://github.com/etalii-adp/etalii.adp/tree/develop/specs/009-vscode-fbl-implementation).

## What the library is

**No tool uses it yet.** The hype cycle graph and Agent Behavior Modelling read and write their files as before, with their own text primitives (`src/core/text`) and the existing reader of the `.adp` registration (`src/core/registration`). The library adds no editor, command, finding or setting, and nothing a user sees changes. It is in the plug-in so that the tool types that come next can be bound to their formats by an FBL document and no code of their own.

It takes an FBL document and a body as bytes, and:

- loads the document (FBL 14.1, steps 1, 2, 4, 5 and 6): duplicate keys, the version, every name, every regular expression and CEL expression, each problem at its JSON Pointer;
- reads a body through a binding into elements, relations and findings, never failing on content;
- plans a change (add, set, remove) as FBL's splices, applies it, and keeps a history with exact undo and redo, refused when the file changed underneath;
- reads and writes the `.adp` registration by splices, finds a registration's body, and reads and writes legacy sidecars;
- routes a file to its bindings, recognises a folder subject, produces a new body from a template, and does the host's side of the persistence plugin contract.

Offsets are UTF-8 byte offsets, a byte-order mark included. The library names no tool type and no binding, and imports neither Visual Studio Code nor a browser; `test/core/fbl/generic.test.ts` and two lint rules keep it so. Its public surface is `src/core/fbl/index.ts`, and it is reached from the rest of the plug-in at one place: `AdpApi.fbl`, the object `activate` returns (`src/extension/extension.ts`).

It is a port of standalone's library (`EtAlii.Adp.Specification.Fbl` at [`25fc7b4a`](https://github.com/etalii-adp/etalii.adp.ide.standalone/tree/25fc7b4af7a99989d23d75d1af9d844303243b9d/src/backend/EtAlii.Adp.Specification.Fbl)), module by module, with FBL as the referee where the two differ. Every sentence a user can see is standalone's, word for word, in `src/core/fbl/messages.ts`.

The library keeps a history of its own, as FBL section 7 requires of a host, while the plug-in's diagrams make every change an edit of the file's text document, with Visual Studio Code's undo. The feature that first connects a tool to the library has to reconcile the two, and the editor's one line ending per file with FBL's bytes; this feature leaves that open.

## Class and families

The plug-in claims **FBL 0.1, *Host, declared*** (FBL 15.1) for all five families: `yaml`, `json`, `xml`, `lines` and `blocks`. The claim rests on FBL's eight round-trip fixtures, which pass splice for splice (`test/core/fbl/conformanceFixtures.test.ts`), and one of them is walked in a real Visual Studio Code from the packaged plug-in (`test/vscode/fbl.test.ts`). For a binding read by a persistence plugin it does the host's side (FBL 11.3); it has no plugin, so such a body opens read-only with `std.pluginMissing`.

Every one of the 86 tests of standalone's library has a counterpart here, or the reason it does not apply; `test/core/fbl/baseline.json` lists them and `baseline.test.ts` checks the list. One does not apply: the cross-check of a binding against standalone's own parsers of four diagram types, which this host does not have.

## Where the copies come from

The tests read FBL's example bindings, fixtures and registrations, copied from etalii.adp, and the real files standalone's FBL tests read, copied from etalii.adp.ide.standalone. Both are under `fixtures/fbl/`, unchanged, with the commit of each and a SHA-256 for every file; see [fixtures/fbl/PROVENANCE.md](../fixtures/fbl/PROVENANCE.md). `npm run sync-fbl` refreshes them.

| Copy | From | Commit |
|---|---|---|
| `fixtures/fbl/conformance/` | etalii.adp, `specifications/fbl/` | `30206eaf29bc33b4af9aa0ecddc88584d24b9499` |
| `fixtures/fbl/real-files/` | etalii.adp.ide.standalone, `src/` | `25fc7b4af7a99989d23d75d1af9d844303243b9d` |

## Not implemented

The library implements what the fixtures and the 86 baseline tests prove. What FBL requires and neither proves is not built: building it would have two hosts decide bytes separately, where a fixture in etalii.adp should decide first.

| FBL | What is missing |
|---|---|
| 5.5 | Moving an element to another parent. |
| 6.2 | `insert.place` as `{before: key}` and as `next-sibling`. |
| 7.1 | A snapshot undo is reported as its inverse splices, not as one splice of the whole body; the bytes it gives are the same. |
| 8.2 | The finding `fbl.missing-body`: the library says a body is missing (`BodyLocation.isMissing`) and leaves the finding to its caller. |
| 8.3 | Removing `layout:` with its last entry, other than by undo. |
| 8.4 | `registration.createOnFirstPlacement`: the registration is created by the caller. |
| 8.7 | `registration.legacyIdentities` and `legacyLayout` are read from the binding and a sidecar is read and written when handed to the library, but the library does not find and apply one on its own. |
| 9.1 | One open body shared by several readings. |
| 10.2 | A folder subject's rules reading its files: a folder is recognised and its files listed, no more. |
| 10.3 | Watching a folder subject and settling. |
| 14.1, step 3 | Validating an FBL document against the JSON Schema. |

## Differences from standalone

Where this host does something else than standalone's library at `25fc7b4a`, and why. No fixture and no baseline test depends on any of them.

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
