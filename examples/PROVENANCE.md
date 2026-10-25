# Where the examples and fixtures come from

The files under `examples/` and `fixtures/` are copied unchanged, byte for byte, from [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone) and, for DESL's smallest example and DISL's example of inherited relation flags, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp), both licensed under the Apache License 2.0, as this repository is. They are what both hosts must agree on: every example opens and round-trips here as it does there, and every fixture yields the same findings. This record covers the folders of its table; `fixtures/fbl/` has a record of its own.

- Refresh them with `node scripts/sync-examples.mjs <path to a checkout of etalii.adp.ide.standalone> [<git ref>] [<path to a checkout of etalii.adp> [<git ref>]]`; do not edit them by hand.

| Here | Repository | Path | Commit |
|---|---|---|---|
| `examples/gartner-hypecycle-graph/` | `etalii.adp.ide.standalone` | `src/diagrams/gartner-hype-cycle-graph/examples/` | `5756a07edf339f2d0f8d118bd8922848032b6058` |
| `examples/agent-behavior-modelling/` | `etalii.adp.ide.standalone` | `src/diagrams/agent-behavior-modelling/examples/` | `5756a07edf339f2d0f8d118bd8922848032b6058` |
| `fixtures/gartner-hypecycle-graph/` | `etalii.adp.ide.standalone` | `src/diagrams/gartner-hype-cycle-graph/backend/EtAlii.Adp.Diagram.GartnerHypeCycleGraph.Tests/Fixtures/` | `5756a07edf339f2d0f8d118bd8922848032b6058` |
| `fixtures/gartner-hypecycle-graph/scale-fixture.json` | `etalii.adp.ide.standalone` | `src/diagrams/gartner-hype-cycle-graph/scale-fixture.json` | `5756a07edf339f2d0f8d118bd8922848032b6058` |
| `examples/mindmap/` | `etalii.adp.ide.standalone` | `src/diagrams/mindmap/examples/` | `5756a07edf339f2d0f8d118bd8922848032b6058` |
| `fixtures/tools/mindmap/architecture.mm` | `etalii.adp.ide.standalone` | `src/diagrams/mindmap/backend/EtAlii.Adp.Diagram.Mindmap.Tests/Fixtures/architecture.mm` | `5756a07edf339f2d0f8d118bd8922848032b6058` |
| `fixtures/tools/mindmap/mindmap.transcript.json` | `etalii.adp.ide.standalone` | `src/diagrams/mindmap/backend/EtAlii.Adp.Diagram.Mindmap.Tests/Parity/mindmap.transcript.json` | `5756a07edf339f2d0f8d118bd8922848032b6058` |
| `examples/agent-activity-diagram/` | `etalii.adp.ide.standalone` | `src/diagrams/agent-activity-diagram/examples/` | `5756a07edf339f2d0f8d118bd8922848032b6058` |
| `fixtures/tools/agent-activity-diagram/` | `etalii.adp.ide.standalone` | `src/diagrams/agent-activity-diagram/backend/EtAlii.Adp.Diagram.AgentActivityDiagram.Tests/Fixtures/` | `5756a07edf339f2d0f8d118bd8922848032b6058` |
| `examples/knowledge/` | `etalii.adp.ide.standalone` | `src/designers/knowledge/examples/` | `5756a07edf339f2d0f8d118bd8922848032b6058` |
| `examples/hierarchical-requirement/web-shop.md` | `etalii.adp` | `definitions/designers/examples/web-shop.md` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `examples/hierarchical-requirement/web-shop.adp` | `etalii.adp` | `definitions/designers/examples/web-shop.adp` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/tools/desl/minimal-table.des` | `etalii.adp` | `specifications/desl/minimal-table.des` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/tools/desl/minimal-table.fbl` | `etalii.adp` | `specifications/desl/minimal-table.fbl` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/tools/desl/desl.schema.json` | `etalii.adp` | `specifications/desl/desl.schema.json` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/disl/flag-inheritance/service-calls.dis` | `etalii.adp` | `specifications/disl/service-calls.dis` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/disl/flag-inheritance/service-calls.did` | `etalii.adp` | `specifications/disl/service-calls.did` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/disl/flag-inheritance/service-calls.findings.json` | `etalii.adp` | `specifications/disl/service-calls.findings.json` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/disl/flag-inheritance/relation-flag-widened.dis` | `etalii.adp` | `specifications/disl/refused/relation-flag-widened.dis` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/disl/flag-inheritance/relation-flag-directed.dis` | `etalii.adp` | `specifications/disl/refused/relation-flag-directed.dis` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/disl/flag-inheritance/relation-flag-conflict.dis` | `etalii.adp` | `specifications/disl/refused/relation-flag-conflict.dis` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
