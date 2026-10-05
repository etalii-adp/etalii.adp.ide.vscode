# Where the examples and fixtures come from

The files under `examples/` and `fixtures/` are copied unchanged, byte for byte, from [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), which is licensed under the Apache License 2.0, as this repository is. They are what both hosts must agree on: every example opens and round-trips here as it does there, and every fixture yields the same findings.

- Commit: `13b517b3481410c48708b3f391b1e9454e42e8c4`
- Refresh them with `node scripts/sync-examples.mjs <path to a checkout of etalii.adp.ide.standalone>`; do not edit them by hand.

| Here | There |
|---|---|
| `examples/gartner-hypecycle-graph/` | `src/diagrams/gartner-hype-cycle-graph/examples/` |
| `examples/agent-behavior-modelling/` | `src/diagrams/agent-behavior-modelling/examples/` |
| `fixtures/gartner-hypecycle-graph/` | `src/diagrams/gartner-hype-cycle-graph/backend/EtAlii.Adp.Diagram.GartnerHypeCycleGraph.Tests/Fixtures/` |
| `fixtures/gartner-hypecycle-graph/scale-fixture.json` | `src/diagrams/gartner-hype-cycle-graph/scale-fixture.json` |
