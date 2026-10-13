# Where the DISL interpreter and the scene come from

`src/core/disl/` and `src/core/scene/` were taken from [etalii-adp/etalii.adp.ide.notion](https://github.com/etalii-adp/etalii.adp.ide.notion) at commit `4a0cdb4`, which is licensed under the Apache License 2.0, as this repository is (etalii.adp spec 027, research R2 and R3). They are owned here from that commit on: unlike `src/core/fbl/`, which the Notion add-ons copy from this repository and never edit, these files grow here with what each tool type's definition needs.

| Here | There, at `4a0cdb4` |
|---|---|
| `src/core/disl/*.ts` | `src/disl/*.ts`, 14 files |
| `src/core/scene/scene.ts`, `geometry.ts`, `snapping.ts` | `src/canvas/scene.ts`, `geometry.ts`, `snapping.ts` |
| `test/core/disl/` | `test/disl/`, without `offers.test.ts`, which tests through the Notion add-ons' store |
| `test/core/scene/` | `test/canvas/scene.test.ts`, `scene.examples.test.ts`, `geometry.test.ts`, `snapping.test.ts`, `tool.ts` |
| `fixtures/disl/mindmap.dis`, `fixtures/disl/disl.schema.json` | `test/fixtures/`, themselves copies from etalii.adp |
| `fixtures/disl/places/<example>.places.json` | `test/examples/gartner-hype-cycle-graph/<example>/`, the places this host's hand-coded view gave each example at `271a92c` |

## What changed when they were taken

- Imports name this repository's folders, and the tests read the definition from `definitions/gartner-hype-cycle-graph/`, the fixtures from `fixtures/gartner-hypecycle-graph/` and the examples from `examples/gartner-hypecycle-graph/`.
- `model.ts`: a finding carries its own `detail`, since the FBL library at 0.6 gave its finding one of another type.
- `fixtures/disl/disl.schema.json` is no longer the copy that came with them: it is `specifications/disl/disl.schema.json` of etalii.adp at `8e52c81`, the schema of DISL 0.4, taken when the interpreter learned to read 0.4 (etalii.adp spec 027, User Story 2).

Every later change is in this repository's history and, where it adds a construct, in `docs/disl-support.md`.
