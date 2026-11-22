# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `causal-loop-diagram.dis` | `etalii.adp` | `definitions/diagrams/causal-loop-diagram.dis` | `6115d7747843c4084e134ebd027dca9ceb9e3d09` | `e5f2460d41ce60e3a1743215e26ac9b427433cecce757862d2913d679ffad8e1` |
| `causal-loop-diagram.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/causal-loop-diagram/backend/EtAlii.Adp.Diagram.CausalLoopDiagram/causal-loop-diagram.fbl` | `3178d9e37ca1b28623496cfd7e9a091c266b2763` | `8a7156489a6135c2a93d162e807ea068c83c45babcd240b5853fbc63680ac69b` |
| `causal-loop-diagram.md` | `etalii.adp` | `definitions/diagrams/causal-loop-diagram.md` | `6115d7747843c4084e134ebd027dca9ceb9e3d09` | `4436f21c0f26d9c6c1b6e3dba7089a23537e2c9d0b57f0608c6622e977235237` |
