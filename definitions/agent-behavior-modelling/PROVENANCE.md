# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `agent-behavior-modelling.dis` | `etalii.adp` | `definitions/diagrams/agent-behavior-modelling.dis` | `aa2b6a7e6606de7733ffdfff6398bda488989613` | `a27739c838e3fe5464678d484ef3e1ccf9162fcd175cfc627ff9c7c0f8d6e4f9` |
| `agent-behavior-modelling.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/agent-behavior-modelling/backend/EtAlii.Adp.Diagram.AgentBehaviorModelling/agent-behavior-modelling.fbl` | `1469af623afd153e7b21d91dc6e62a46e67fe378` | `2955ceaf57cd21ba54d3ba9e31ef7b007ffac3ec575d1510f1e5f2adeb18c298` |
| `agent-behavior-modelling.md` | `etalii.adp` | `definitions/diagrams/agent-behavior-modelling.md` | `aa2b6a7e6606de7733ffdfff6398bda488989613` | `db3dfc69aeac552126f9b74cf5b18089443aeb0ccacd33c5cf2123e96ab91abb` |
