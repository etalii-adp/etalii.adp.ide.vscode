# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `dependency-graph.dis` | `etalii.adp` | `definitions/diagrams/dependency-graph.dis` | `a9f978357ce1e98b9bd00c0624446c8c748a3eb1` | `7806e03bd6e237bbe955d9a7523edbbd85f66a845c5d1f997cbfe3a4500fe9e6` |
| `dependency-graph.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/dependency-graph/backend/EtAlii.Adp.Diagram.DependencyGraph/dependency-graph.fbl` | `30fa033bb8e9ed6d660b09f1b0ab3c9d82164972` | `5810c940c1f28d7b7f2265a1804462241af686ca5edd7acd437d1f2966fb711b` |
| `dependency-graph.md` | `etalii.adp` | `definitions/diagrams/dependency-graph.md` | `a9f978357ce1e98b9bd00c0624446c8c748a3eb1` | `be00c02c623dd86e068bd510329d680b5e0632492fd24643f11c2c913581aa1a` |
