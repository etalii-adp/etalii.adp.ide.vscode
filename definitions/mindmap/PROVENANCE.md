# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `mindmap.dis` | `etalii.adp` | `definitions/diagrams/mindmap.dis` | `b003920534c33a9326bf71ba589f1af87baec153` | `1af14569bdef4d3e1ea34e409b95662fd959ccfa14b3563f8dd8faad2d652721` |
| `mindmap.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/mindmap/backend/EtAlii.Adp.Diagram.Mindmap/mindmap.fbl` | `0780217306148a42343930fbf5efe48fe04a3b1c` | `7084f6804b7b009c724ea3d23af4db9531deda44f83e2929765e75b819b8054a` |
| `mindmap.md` | `etalii.adp` | `definitions/diagrams/mindmap.md` | `b003920534c33a9326bf71ba589f1af87baec153` | `9e3bdfa0e6b84b1861d9629547f6280d6961aec8fb81f31b4ea82666c437ae12` |
