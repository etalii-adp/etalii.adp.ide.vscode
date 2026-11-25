# Where the examples and fixtures come from

The files under `examples/` and `fixtures/` are copied unchanged, byte for byte, from [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone) and, for DESL's smallest example and DISL's example of inherited relation flags, from [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp), both licensed under the Apache License 2.0, as this repository is. The data of `examples/hierarchical-requirement/nist-sp-800-53/` is NIST's, a work of the United States government in the public domain and dedicated worldwide under CC0 1.0, as the `LICENSE.md` and `readme.md` copied beside it say. They are what both hosts must agree on: every example opens and round-trips here as it does there, and every fixture yields the same findings. This record covers the folders of its table; `fixtures/fbl/` has a record of its own.

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
| `examples/causal-loop-diagram/` | `etalii.adp.ide.standalone` | `src/diagrams/causal-loop-diagram/examples/` | `d04b9c99a27d7343f22eb49e7e53f8b3cdbc0701` |
| `fixtures/tools/causal-loop-diagram/` | `etalii.adp.ide.standalone` | `src/diagrams/causal-loop-diagram/backend/EtAlii.Adp.Diagram.CausalLoopDiagram.Tests/Fixtures/` | `d04b9c99a27d7343f22eb49e7e53f8b3cdbc0701` |
| `fixtures/tools/causal-loop-diagram/causal-loop.transcript.json` | `etalii.adp.ide.standalone` | `src/diagrams/causal-loop-diagram/backend/EtAlii.Adp.Diagram.CausalLoopDiagram.Tests/Parity/causal-loop.transcript.json` | `d04b9c99a27d7343f22eb49e7e53f8b3cdbc0701` |
| `examples/knowledge/` | `etalii.adp.ide.standalone` | `src/designers/knowledge/examples/` | `5756a07edf339f2d0f8d118bd8922848032b6058` |
| `examples/dependency-graph/` | `etalii.adp.ide.standalone` | `src/diagrams/dependency-graph/examples/` | `004723646580644bac7dc0949d60f5dcfb7c92d5` |
| `fixtures/tools/dependency-graph/` | `etalii.adp.ide.standalone` | `src/diagrams/dependency-graph/backend/EtAlii.Adp.Diagram.DependencyGraph.Tests/Fixtures/` | `004723646580644bac7dc0949d60f5dcfb7c92d5` |
| `fixtures/tools/dependency-graph/dependency-graph.transcript.json` | `etalii.adp.ide.standalone` | `src/diagrams/dependency-graph/backend/EtAlii.Adp.Diagram.DependencyGraph.Tests/Parity/dependency-graph.transcript.json` | `004723646580644bac7dc0949d60f5dcfb7c92d5` |
| `examples/timeline/` | `etalii.adp.ide.standalone` | `src/diagrams/timeline/examples/` | `9555565b585dcd55d23d16c5b7008aa59ba30c1c` |
| `fixtures/tools/timeline/` | `etalii.adp` | `definitions/diagrams/conformance/timeline/` | `3fb0884c875d52805a22a5560b4ea0d5fc528ca6` |
| `examples/hierarchical-requirement/web-shop.md` | `etalii.adp` | `definitions/designers/examples/web-shop.md` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `examples/hierarchical-requirement/web-shop.adp` | `etalii.adp` | `definitions/designers/examples/web-shop.adp` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `examples/hierarchical-requirement/nist-sp-800-53/` | `etalii.adp.ide.standalone` | `src/examples/designers/hierarchical-requirement/nist-sp-800-53/` | `80ad865b9ab14f48bc23cb77daeccab9b89df513` |
| `examples/value-stream-map/request-fulfilment.vsm` | `etalii.adp` | `definitions/diagrams/examples/request-fulfilment.vsm` | `519f7be9fd5d02aa221d5d72f0a3b1e34eb749c0` |
| `examples/value-stream-map/restore-service.vsm` | `etalii.adp` | `definitions/diagrams/examples/restore-service.vsm` | `519f7be9fd5d02aa221d5d72f0a3b1e34eb749c0` |
| `examples/post-incident-review/checkout-latency.md` | `etalii.adp` | `definitions/designers/examples/checkout-latency.md` | `eba610d55c0c343062a3c672fc135099254ba334` |
| `examples/post-incident-review/certificate-expiry.md` | `etalii.adp` | `definitions/designers/examples/certificate-expiry.md` | `eba610d55c0c343062a3c672fc135099254ba334` |
| `fixtures/tools/post-incident-review/read/` | `etalii.adp` | `specifications/fbl/fixtures/post-incident-review-read/` | `eba610d55c0c343062a3c672fc135099254ba334` |
| `fixtures/tools/post-incident-review/edits/` | `etalii.adp` | `specifications/fbl/fixtures/post-incident-review-edits/` | `eba610d55c0c343062a3c672fc135099254ba334` |
| `examples/openslo-slo/` | `etalii.adp` | `definitions/diagrams/vendored/openslo/` | `88fc48e6aa339ca0efd4ac1a11094293c4cef18f` |
| `fixtures/tools/desl/minimal-table.des` | `etalii.adp` | `specifications/desl/minimal-table.des` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/tools/desl/minimal-table.fbl` | `etalii.adp` | `specifications/desl/minimal-table.fbl` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/tools/desl/desl.schema.json` | `etalii.adp` | `specifications/desl/desl.schema.json` | `e598c604280fd31dcc66e382bd7788dd0a249a4a` |
| `fixtures/disl/flag-inheritance/service-calls.dis` | `etalii.adp` | `specifications/disl/service-calls.dis` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/disl/flag-inheritance/service-calls.did` | `etalii.adp` | `specifications/disl/service-calls.did` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/disl/flag-inheritance/service-calls.findings.json` | `etalii.adp` | `specifications/disl/service-calls.findings.json` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/disl/flag-inheritance/relation-flag-widened.dis` | `etalii.adp` | `specifications/disl/refused/relation-flag-widened.dis` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/disl/flag-inheritance/relation-flag-directed.dis` | `etalii.adp` | `specifications/disl/refused/relation-flag-directed.dis` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
| `fixtures/disl/flag-inheritance/relation-flag-conflict.dis` | `etalii.adp` | `specifications/disl/refused/relation-flag-conflict.dis` | `4f5b96df0c243be44469cab9e58a8c2512ae5513` |
