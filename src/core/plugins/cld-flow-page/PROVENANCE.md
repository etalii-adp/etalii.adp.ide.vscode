# Where the template comes from

`template.ts` holds the flow page of the causal loop diagram (etalii.adp spec 074), copied unchanged, byte for byte, from [etalii-adp/etalii.adp.ide.desktop](https://github.com/etalii-adp/etalii.adp.ide.desktop), licensed under the Apache License 2.0, as this repository is. It is the prototype the maintainer accepted, changed only at spec 074's FR-035 places, with the markers the generator fills. Do not edit it, or this file, by hand: a correction goes to the desktop host and arrives with a newer copy.

- Refresh it with `node scripts/sync-flow-page.mjs <path to etalii.adp.ide.desktop> [<git ref>]`; the ref defaults to `origin/develop`.
- Check the copy against this record with `node scripts/sync-flow-page.mjs --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `flow_page.html` | `etalii.adp.ide.desktop` | `modules/diagrams/causal-loop-diagram/src/flow_page.html` | `c7c6a480d5ee5f1a86ee468b7c89ac1a40420f47` | `f22b4c8c91a853666f811f3e3fb6ff65a793d6c4c3d7ec3fb6d179feeca5d03b` |
