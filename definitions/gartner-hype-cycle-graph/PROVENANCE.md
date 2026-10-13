# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `gartner-hype-cycle-graph.dis` | `etalii.adp` | `definitions/diagrams/gartner-hype-cycle-graph.dis` | `5062bde43fa0a81f09091c5fdb99edb2296269e2` | `fab0bbdf6a57db82402214f114e08bafb7a082569f42681ecd44a5442d2683e6` |
| `gartner-hype-cycle-graph.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/gartner-hype-cycle-graph/backend/EtAlii.Adp.Diagram.GartnerHypeCycleGraph/gartner-hype-cycle-graph.fbl` | `5756a07edf339f2d0f8d118bd8922848032b6058` | `69c9f444ddf13e98f62a22b1e7bc86e7b08be2c60629df27f7226681c750b46e` |
| `gartner-hype-cycle-graph.md` | `etalii.adp` | `definitions/diagrams/gartner-hype-cycle-graph.md` | `5062bde43fa0a81f09091c5fdb99edb2296269e2` | `91b3c833d3b42ce282730edad1e84547c9a45f997224ec70cff8cf3a63a09b69` |
