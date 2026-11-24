# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `mindmap.dis` | `etalii.adp` | `definitions/diagrams/mindmap.dis` | `aa2b6a7e6606de7733ffdfff6398bda488989613` | `1af14569bdef4d3e1ea34e409b95662fd959ccfa14b3563f8dd8faad2d652721` |
| `mindmap.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/mindmap/backend/EtAlii.Adp.Diagram.Mindmap/mindmap.fbl` | `1469af623afd153e7b21d91dc6e62a46e67fe378` | `344dddac8efb564534f54723785c66b3f873eb89706806266a17ddebbbebea56` |
| `mindmap.md` | `etalii.adp` | `definitions/diagrams/mindmap.md` | `aa2b6a7e6606de7733ffdfff6398bda488989613` | `9e3bdfa0e6b84b1861d9629547f6280d6961aec8fb81f31b4ea82666c437ae12` |
