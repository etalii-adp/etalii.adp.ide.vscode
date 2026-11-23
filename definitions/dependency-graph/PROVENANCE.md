# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `dependency-graph.dis` | `etalii.adp` | `definitions/diagrams/dependency-graph.dis` | `eba610d55c0c343062a3c672fc135099254ba334` | `a3e7a6b13cd62ef0b4ba4d507f303bdc55c870a807de81d09a045e3c133d1346` |
| `dependency-graph.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/dependency-graph/backend/EtAlii.Adp.Diagram.DependencyGraph/dependency-graph.fbl` | `4302e130593bb487358c1925c2b060165677fd4f` | `450946d78f1a87e7acf5676bc4f1bfcbe4bb02399804264137a2e97689cc32af` |
| `dependency-graph.md` | `etalii.adp` | `definitions/diagrams/dependency-graph.md` | `eba610d55c0c343062a3c672fc135099254ba334` | `0b3661566ec07b96f9bbd402f81bfdfc69870a93e1f7d28b64edd23cdee4d023` |
