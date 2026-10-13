# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `mindmap.dis` | `etalii.adp` | `definitions/diagrams/mindmap.dis` | `8e52c81af82ad3cef23937139545c44495621db8` | `235bb6a731e5680223f7068ab884fe70c0bf9710d202167a153a51e155e34103` |
| `mindmap.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/mindmap/backend/EtAlii.Adp.Diagram.Mindmap/mindmap.fbl` | `5756a07edf339f2d0f8d118bd8922848032b6058` | `344dddac8efb564534f54723785c66b3f873eb89706806266a17ddebbbebea56` |
| `mindmap.md` | `etalii.adp` | `definitions/diagrams/mindmap.md` | `8e52c81af82ad3cef23937139545c44495621db8` | `8f0475c9c0c7df69a8aa600fbd02359a30f732fc82bbc867a6c065285a76d627` |
