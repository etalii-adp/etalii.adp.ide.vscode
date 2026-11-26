# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `gartner-hype-cycle-graph.dis` | `etalii.adp` | `definitions/diagrams/gartner-hype-cycle-graph.dis` | `a9f978357ce1e98b9bd00c0624446c8c748a3eb1` | `fab0bbdf6a57db82402214f114e08bafb7a082569f42681ecd44a5442d2683e6` |
| `gartner-hype-cycle-graph.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/gartner-hype-cycle-graph/backend/EtAlii.Adp.Diagram.GartnerHypeCycleGraph/gartner-hype-cycle-graph.fbl` | `30fa033bb8e9ed6d660b09f1b0ab3c9d82164972` | `69c9f444ddf13e98f62a22b1e7bc86e7b08be2c60629df27f7226681c750b46e` |
| `gartner-hype-cycle-graph.md` | `etalii.adp` | `definitions/diagrams/gartner-hype-cycle-graph.md` | `a9f978357ce1e98b9bd00c0624446c8c748a3eb1` | `7df3042da906c4f5b8cb694cafd647ed91c5b8112e6ea75c80057727c39d1889` |
