# Where the files under fixtures/fbl/ come from

They are copied unchanged, byte for byte, from two repositories, both licensed under the Apache License 2.0, as this repository is. The tests of the plug-in's FBL implementation (`test/core/fbl`, `test/vscode/fbl.test.ts`) read them, and `test/core/fbl/corpus.test.ts` checks every one against the SHA-256 that `manifest.json` records, so a copy that was edited or saved with other line endings is noticed.

| Here | From | Commit | Licence |
|---|---|---|---|
| `fixtures/fbl/conformance/` | [etalii-adp/etalii.adp](https://github.com/etalii-adp/etalii.adp), `specifications/fbl/`: the example bindings (`*.fbl`), `fixtures/` and `registrations/` | `30206eaf29bc33b4af9aa0ecddc88584d24b9499` | Apache-2.0 |
| `fixtures/fbl/real-files/` | [etalii-adp/etalii.adp.ide.standalone](https://github.com/etalii-adp/etalii.adp.ide.standalone), the files under `src/` its FBL tests read, under the paths they have there | `25fc7b4af7a99989d23d75d1af9d844303243b9d` | Apache-2.0 |

## Third-party notices

Some of the real files came to standalone from elsewhere. The notice standalone keeps beside them is copied with them:

- `fixtures/fbl/real-files/src/diagrams/helm-chart/examples/hello-world/LICENSE`
- `fixtures/fbl/real-files/src/diagrams/helm-chart/examples/nginx/LICENSE.md`
- `fixtures/fbl/real-files/src/diagrams/helm-chart/examples/nginx/charts/common/LICENSE.md`
- `fixtures/fbl/real-files/src/diagrams/helm-chart/examples/prometheus/LICENSE`
- `fixtures/fbl/real-files/src/diagrams/rdf/examples/nobel/LICENSE.md`
- `fixtures/fbl/real-files/src/diagrams/rdf/examples/owl-time/LICENSE.md`
- `fixtures/fbl/real-files/src/diagrams/rdf/examples/prov-o/LICENSE.md`
- `fixtures/fbl/real-files/src/diagrams/rdf/examples/shacl/fair-data-point/LICENSE.md`
- `fixtures/fbl/real-files/src/diagrams/rdf/examples/shacl/w3c-shacl/LICENSE.md`
- `fixtures/fbl/real-files/src/diagrams/rdf/examples/stw/LICENSE.md`
- `fixtures/fbl/real-files/src/diagrams/rdf/examples/w3c-turtle/LICENSE.md`
- `fixtures/fbl/real-files/src/diagrams/rdf/examples/wikidata/LICENSE.md`
- `fixtures/fbl/real-files/src/diagrams/sankey/examples/recent-graduates/LICENSE.md`
- `fixtures/fbl/real-files/src/diagrams/sankey/examples/uk-energy/LICENSE.md`
- `fixtures/fbl/real-files/src/diagrams/sparql/examples/uniprot/LICENSE.md`
- `fixtures/fbl/real-files/src/diagrams/sparql/examples/w3c-sparql/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/ansible-structure/jboss-standalone/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/ansible-structure/lamp_simple/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/ansible-structure/lamp_simple_rhel7/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/ansible-structure/mongodb/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/ansible-structure/tomcat-memcached-failover/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/ansible-structure/wordpress-nginx/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/ansible-structure/wordpress-nginx_rhel7/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/helm-chart/hello-world/LICENSE`
- `fixtures/fbl/real-files/src/examples/diagrams/helm-chart/nginx/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/helm-chart/nginx/charts/common/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/helm-chart/prometheus/LICENSE`
- `fixtures/fbl/real-files/src/examples/diagrams/owl/owl-time/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/owl/prov-o/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/rdf/nobel/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/rdf/w3c-turtle/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/rdf/wikidata/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/sankey/recent-graduates/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/sankey/uk-energy/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/shacl/fair-data-point/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/shacl/w3c-shacl/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/skos/stw/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/sparql/uniprot/LICENSE.md`
- `fixtures/fbl/real-files/src/examples/diagrams/sparql/w3c-sparql/LICENSE.md`

## Refreshing

Run `npm run sync-fbl -- <path to etalii.adp> <path to etalii.adp.ide.standalone> [<etalii.adp ref>] [<standalone ref>]` and commit what it writes; both refs default to `origin/develop`. Do not edit a file under `fixtures/fbl/` by hand: a difference from its source is taken up by copying at a newer commit.
