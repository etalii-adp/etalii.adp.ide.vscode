# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `timeline.dis` | `etalii.adp` | `definitions/diagrams/timeline.dis` | `2f150406b4e984f02ab94f0e1056c88d5f6409db` | `7e9ac2c5d98ffdaaaa4ee71d4b1374fd7eff7dc394d41d5828f3f65b25d1a085` |
| `timeline.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/timeline/backend/EtAlii.Adp.Diagram.Timeline/timeline.fbl` | `9555565b585dcd55d23d16c5b7008aa59ba30c1c` | `9171107840c6810022623231c8992c2e4c285e2eab7c6cf1091a8b01fd473912` |
| `timeline.md` | `etalii.adp` | `definitions/diagrams/timeline.md` | `2f150406b4e984f02ab94f0e1056c88d5f6409db` | `7f704c3b099f5f5885c6551c07dc2f95629d7caa06ac711150a4dc575941b907` |
