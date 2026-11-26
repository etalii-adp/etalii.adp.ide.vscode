# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `timeline.dis` | `etalii.adp` | `definitions/diagrams/timeline.dis` | `a9f978357ce1e98b9bd00c0624446c8c748a3eb1` | `7e9ac2c5d98ffdaaaa4ee71d4b1374fd7eff7dc394d41d5828f3f65b25d1a085` |
| `timeline.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/timeline/backend/EtAlii.Adp.Diagram.Timeline/timeline.fbl` | `30fa033bb8e9ed6d660b09f1b0ab3c9d82164972` | `bee09c75b09d79e1a93329bf88f7202353cf310e0892424df28926c15fb62dc4` |
| `timeline.md` | `etalii.adp` | `definitions/diagrams/timeline.md` | `a9f978357ce1e98b9bd00c0624446c8c748a3eb1` | `7f704c3b099f5f5885c6551c07dc2f95629d7caa06ac711150a4dc575941b907` |
