# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `timeline.dis` | `etalii.adp` | `definitions/diagrams/timeline.dis` | `492cded3d4fce1c56c185358ee20f5f49b56c951` | `beb65204c083b12415c7a93ccad674537614268a63b3d36573da4cde40164d3b` |
| `timeline.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/timeline/backend/EtAlii.Adp.Diagram.Timeline/timeline.fbl` | `9555565b585dcd55d23d16c5b7008aa59ba30c1c` | `9171107840c6810022623231c8992c2e4c285e2eab7c6cf1091a8b01fd473912` |
| `timeline.md` | `etalii.adp` | `definitions/diagrams/timeline.md` | `492cded3d4fce1c56c185358ee20f5f49b56c951` | `da8139f1c5e0f49b851044e7611a2de7c669bbcc432d244232156298d1fbb1ce` |
