# The desktop host's flow pages

Each page here was written by the desktop host's own generator, the example `flow_page` of its causal loop diagram module, run at [etalii-adp/etalii.adp.ide.desktop](https://github.com/etalii-adp/etalii.adp.ide.desktop) commit `c0a6ffa2bd29669636cd3ab6fa1cfb57d85483d5`, the commit the template in `src/core/plugins/cld-flow-page/` was copied from (etalii.adp spec 082, research R3):

```sh
cargo run -p adp-diagram-causal-loop --example flow_page -- <document>.cld <page>.html
```

- `<example>.html`: each of the six examples in `examples/causal-loop-diagram/`, with its registration.
- `fixture-<name>.html`: each document in `fixtures/tools/causal-loop-diagram/`, which has no registration and opens on a ring.
- `flow-properties.html`: `../flow-page-sources/flow-properties/`, written for this feature, which sets every flow property, some out of range, and puts markup in its title and labels.

`test/core/plugins/cld-flow-page/flowPage.test.ts` holds this host's pages to them. Write them again, with the same command, when the template is refreshed.
