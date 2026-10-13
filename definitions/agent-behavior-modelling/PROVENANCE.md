# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `agent-behavior-modelling.dis` | `etalii.adp` | `definitions/diagrams/agent-behavior-modelling.dis` | `8e52c81af82ad3cef23937139545c44495621db8` | `a27739c838e3fe5464678d484ef3e1ccf9162fcd175cfc627ff9c7c0f8d6e4f9` |
| `agent-behavior-modelling.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/agent-behavior-modelling/backend/EtAlii.Adp.Diagram.AgentBehaviorModelling/agent-behavior-modelling.fbl` | `5756a07edf339f2d0f8d118bd8922848032b6058` | `2955ceaf57cd21ba54d3ba9e31ef7b007ffac3ec575d1510f1e5f2adeb18c298` |
| `agent-behavior-modelling.md` | `etalii.adp` | `definitions/diagrams/agent-behavior-modelling.md` | `8e52c81af82ad3cef23937139545c44495621db8` | `3a56453e8ff1d6eab68915082c68c69db5af64224c39a6812027305be578bf2b` |
