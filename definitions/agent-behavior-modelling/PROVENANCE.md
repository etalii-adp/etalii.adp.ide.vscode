# Where the files in this folder come from

They are the definition of one tool type, copied unchanged, byte for byte, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp) and [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), both licensed under the Apache License 2.0, as this repository is. Do not edit them, or this file, by hand: a correction goes to the repository a file came from and arrives with a newer copy.

- Refresh every folder with `npm run sync-definitions -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]`; both refs default to `origin/develop`.
- Check the copies against this record, and `package.json` against the copies, with `npm run sync-definitions -- --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `agent-behavior-modelling.dis` | `etalii.adp` | `definitions/diagrams/agent-behavior-modelling.dis` | `a5eed37222a3f0c26ddc61b2cb4decc18502ac1d` | `a27739c838e3fe5464678d484ef3e1ccf9162fcd175cfc627ff9c7c0f8d6e4f9` |
| `agent-behavior-modelling.fbl` | `etalii.adp.ide.standalone` | `src/diagrams/agent-behavior-modelling/backend/EtAlii.Adp.Diagram.AgentBehaviorModelling/agent-behavior-modelling.fbl` | `9555565b585dcd55d23d16c5b7008aa59ba30c1c` | `2955ceaf57cd21ba54d3ba9e31ef7b007ffac3ec575d1510f1e5f2adeb18c298` |
| `agent-behavior-modelling.md` | `etalii.adp` | `definitions/diagrams/agent-behavior-modelling.md` | `a5eed37222a3f0c26ddc61b2cb4decc18502ac1d` | `db3dfc69aeac552126f9b74cf5b18089443aeb0ccacd33c5cf2123e96ab91abb` |
