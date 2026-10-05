# Tool types

The tool types this Visual Studio Code plug-in supports or plans to support, each of one kind (diagram, designer or editor, as the [ADP glossary](https://github.com/etalii-adp/etalii.adp/blob/develop/docs/terminology.md) defines them), with how far along each one is, the theory behind its notation and an example. The format is the one [etalii.adp.ide.standalone's `docs/tools.md`](https://github.com/etalii-adp/etalii.adp.ide.standalone/blob/develop/docs/tools.md) uses, so the [ADP website](https://etalii.net/adp) reads every host's catalogue the same way.

**This document is a living catalog: move a row's state in the same change that moves the tool, and add a row when a new tool type is identified.** The website's tool catalogue is refreshed from this file, so a row missing here is a tool missing there.

Each tool type is specified in [etalii.adp](https://github.com/etalii-adp/etalii.adp/tree/develop/definitions/diagrams). Where this host differs from a definition is recorded in the [parity record](parity.md).

## Legend

**State** — how far the plug-in's support for the tool type has progressed:

| Icon | State | Meaning |
|---|---|---|
| 💡 | Identified | Recognized as a candidate tool type; no spec yet |
| 📝 | Specified | A specification exists |
| ⏸️ | To-do | Specification planned and queued for implementation, not yet started |
| 🛠️ | Work-in-progress | Actively being implemented |
| ⚗️ | Prototype | Implemented as a working prototype; usable, not yet hardened to full quality |
| ✅ | Implemented | Shipped and usable in the plug-in |

**Origin** — a MIME-type-style tag identifying where the notation comes from, in the form `<architecture-or-vendor>/<diagram-type>`. A tool type every ADP host supports carries the same origin in each host's catalogue.

**Kind** — the tool's kind: Diagram, Designer or Editor. Both tools in this plug-in are diagrams.

---

<table>
  <thead>
    <tr><th>State</th><th>Origin</th><th>Tool</th><th>Kind</th><th>Theory</th><th>Example</th></tr>
  </thead>
  <tbody>
    <tr><td colspan="6"><h3>Technology assessment</h3><p>Tool types for placing technologies and trends in time and relating them to each other.</p></td></tr>
    <tr><td style="white-space: nowrap;">⚗️&nbsp;Prototype</td><td style="white-space: nowrap;"><code>gartner/hypecycle-graph</code></td><td>Gartner hype cycle graph</td><td>Diagram</td><td><a href="https://en.wikipedia.org/wiki/Gartner_hype_cycle">Gartner hype cycle (Wikipedia)</a></td><td>Gartner hype cycle graph (trends on a time axis, each a right-pointing arrow banner divided into the Peak, Trough, Slope and Plateau phases it has reached, with triggers and notes, joined by influences anchored to a phase of each trend; <code>.ghg</code>, ADP's own YAML schema); <a href="https://github.com/etalii-adp/etalii.adp/blob/develop/definitions/diagrams/gartner-hype-cycle-graph.md">definition</a> · <a href="https://github.com/etalii-adp/etalii.adp.ide.vscode/tree/develop/examples/gartner-hypecycle-graph">nine example graphs</a>, the standalone host's own</td></tr>
    <tr><td colspan="6"><h3>Collaboration between people and agents</h3><p>Tool types for saying what an agent is to do in a form both a person and the agent read.</p></td></tr>
    <tr><td style="white-space: nowrap;">⚗️&nbsp;Prototype</td><td style="white-space: nowrap;"><code>etalii/agent-behavior-modelling</code></td><td>Agent Behavior Modelling</td><td>Diagram</td><td><a href="https://en.wikipedia.org/wiki/Behavior_tree_(artificial_intelligence,_robotics_and_control)">Behavior tree (Wikipedia)</a>; the game industry's behavior trees, tuned to agent engineering</td><td>Agent Behavior Modelling (a chat agent's instructions as a behavior tree, kept as a keyword-marked bullet list under the Behavior heading of the Markdown file the agent reads; <code>.md</code>, a shared extension, so a file is a model only when it is opened as one); <a href="https://github.com/etalii-adp/etalii.adp/blob/develop/definitions/diagrams/agent-behavior-modelling.md">definition</a> · <a href="https://github.com/etalii-adp/etalii.adp.ide.vscode/tree/develop/examples/agent-behavior-modelling">four example agents</a>, the standalone host's own</td></tr>
  </tbody>
</table>
