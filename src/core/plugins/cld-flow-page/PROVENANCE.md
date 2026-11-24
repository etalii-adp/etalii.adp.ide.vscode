# Where the template comes from

`template.ts` holds the flow page of the causal loop diagram (etalii.adp spec 074), copied unchanged, byte for byte, from [etalii-adp/etalii.adp.ide.desktop](https://github.com/etalii-adp/etalii.adp.ide.desktop), licensed under the Apache License 2.0, as this repository is. It is the prototype the maintainer accepted, changed only at spec 074's FR-035 places, with the markers the generator fills. Do not edit it, or this file, by hand: a correction goes to the desktop host and arrives with a newer copy.

- Refresh it with `node scripts/sync-flow-page.mjs <path to etalii.adp.ide.desktop> [<git ref>]`; the ref defaults to `origin/develop`.
- Check the copy against this record with `node scripts/sync-flow-page.mjs --check`.

| File | Repository | Path | Commit | SHA-256 |
|---|---|---|---|---|
| `flow_page.html` | `etalii.adp.ide.desktop` | `modules/diagrams/causal-loop-diagram/src/flow_page.html` | `8dee3905c7a6dbd32423b5f422c9d3daa3578533` | `c8c1573fc3b15ae9154415a7a6b7ac8a0406b401b420c0e484d22472e7f93446` |
