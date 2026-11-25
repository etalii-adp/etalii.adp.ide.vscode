# Where the template comes from

`template.ts` holds the flow page of the causal loop diagram (etalii.adp spec 074), copied unchanged, byte for byte, from [etalii-adp/etalii.adp.ide.desktop](https://github.com/etalii-adp/etalii.adp.ide.desktop), licensed under the Apache License 2.0, as this repository is. It is the prototype the maintainer accepted, changed only at spec 074's FR-035 places, with the markers the generator fills. Do not edit it, or this file, by hand: a correction goes to the desktop host and arrives with a newer copy.

- Refresh it with `node scripts/sync-flow-page.mjs <path to etalii.adp.ide.desktop> [<git ref>]`; the ref defaults to `origin/develop`.
- Check the copy against this record with `node scripts/sync-flow-page.mjs --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `flow_page.html` | `etalii.adp.ide.desktop` | `modules/diagrams/causal-loop-diagram/src/flow_page.html` | `e9a9af9b626548934c93286dd617062ecc20ee5c` | `fd6f5e53dc32f73cd0fdbed71a013a2947400fd863f4f1c82e6f5e7ee74c1b1e` |
