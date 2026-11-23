# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `dependency-graph.dis` | `etalii.adp` | `definitions/diagrams/dependency-graph.dis` | `ed9bc28102871754e443409694699e347bd6e20d` | `af7fc796e099ac37dd1547e590d60ecc6ad89aec3b36bc8ddf31e5363f05ba67` |
| `dependency-graph.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/dependency-graph/backend/EtAlii.Adp.Diagram.DependencyGraph/dependency-graph.fbl` | `4302e130593bb487358c1925c2b060165677fd4f` | `450946d78f1a87e7acf5676bc4f1bfcbe4bb02399804264137a2e97689cc32af` |
| `dependency-graph.md` | `etalii.adp` | `definitions/diagrams/dependency-graph.md` | `ed9bc28102871754e443409694699e347bd6e20d` | `8a88b3057d4b22a5a7490bf83d1f92a47587af09b335bb6742c2a89c254901f9` |
