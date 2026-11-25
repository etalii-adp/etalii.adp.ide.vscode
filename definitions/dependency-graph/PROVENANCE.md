# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `dependency-graph.dis` | `etalii.adp` | `definitions/diagrams/dependency-graph.dis` | `b003920534c33a9326bf71ba589f1af87baec153` | `7806e03bd6e237bbe955d9a7523edbbd85f66a845c5d1f997cbfe3a4500fe9e6` |
| `dependency-graph.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/dependency-graph/backend/EtAlii.Adp.Diagram.DependencyGraph/dependency-graph.fbl` | `0780217306148a42343930fbf5efe48fe04a3b1c` | `faa5a33fbdee19418b81828341327e7ab47501e0975d535f6c897078e1eaacec` |
| `dependency-graph.md` | `etalii.adp` | `definitions/diagrams/dependency-graph.md` | `b003920534c33a9326bf71ba589f1af87baec153` | `be00c02c623dd86e068bd510329d680b5e0632492fd24643f11c2c913581aa1a` |
