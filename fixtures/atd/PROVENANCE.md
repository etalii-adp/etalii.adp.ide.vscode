# Where the files under fixtures/atd/ come from

The tests of *Validate Tool Description* (`test/vscode/atd.test.ts`, etalii.adp spec 035, T136) read them.

| Here | From | Commit | Licence |
|---|---|---|---|
| `fixtures/atd/diagrams/mindmap.atd`, `mindmap.notation.atd`, `mindmap.freeplane.atd` and `conformance/mindmap/` | [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp), `definitions/diagrams/`: the mind map's description and its conformance cases, copied unchanged, byte for byte, from git objects | `0c6ac4d27fadd2a738789b21767cca770b776543` | Apache-2.0 |
| `fixtures/atd/mindmap.validate.json` | the desktop host's result for that description: `atd validate --json mindmap.atd`, run in `fixtures/atd/diagrams/` with `atd` of the release [atd-v0.2.3](https://github.com/etalii-adp/etalii.adp.ide.desktop/releases/tag/atd-v0.2.3) (macos-arm64), the release `vendor/atd-lsp.lock` names | `7a27632a683c49f7ce3501595ec74df1dd3661ca` of etalii-adp/etalii.adp.ide.desktop | Apache-2.0 |

Both are replaced together when the lock moves to a later release: the description's commit is the one the desktop host vendored at the release's commit.
