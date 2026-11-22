# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `causal-loop-diagram.dis` | `etalii.adp` | `definitions/diagrams/causal-loop-diagram.dis` | `2ef4c0580acb38ce7443ab8227a70c0cf7478159` | `02f665745f64f172104e51a6b53cd656056ad98d3b23e80260405364799a1b66` |
| `causal-loop-diagram.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/causal-loop-diagram/backend/EtAlii.Adp.Diagram.CausalLoopDiagram/causal-loop-diagram.fbl` | `6da7f5a6c5a83e76edbcbc1d8f82d2db656b83e9` | `195768ebde4e419d82d3aa93f8abe26657158590d646460cb854b7c07ae15b27` |
| `causal-loop-diagram.md` | `etalii.adp` | `definitions/diagrams/causal-loop-diagram.md` | `2ef4c0580acb38ce7443ab8227a70c0cf7478159` | `5caaffb4407e191a2667e64673f9f31f3740abeb00332772778f89cdfcdf737b` |
