# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `timeline.dis` | `etalii.adp` | `definitions/diagrams/timeline.dis` | `b003920534c33a9326bf71ba589f1af87baec153` | `7e9ac2c5d98ffdaaaa4ee71d4b1374fd7eff7dc394d41d5828f3f65b25d1a085` |
| `timeline.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/timeline/backend/EtAlii.Adp.Diagram.Timeline/timeline.fbl` | `0780217306148a42343930fbf5efe48fe04a3b1c` | `91733008a9e054bc39e8132e5f19c3fcd9b38615a72a92dcc5772506bd9d131d` |
| `timeline.md` | `etalii.adp` | `definitions/diagrams/timeline.md` | `b003920534c33a9326bf71ba589f1af87baec153` | `7f704c3b099f5f5885c6551c07dc2f95629d7caa06ac711150a4dc575941b907` |
