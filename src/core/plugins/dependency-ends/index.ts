// A dependency's ends as the file writes them (`net.etalii.adp.generic.dependencyEnds`, `writtenEnd`; etalii.adp
// spec 088, research R5), which DISL's CEL cannot read: an end that names no node is null in the model (DISL 4.9),
// so the definition's dangling and self-dependency rules read the id the end is written with. The binding reads it
// twice, as the reference and as the host attributes `writtenFrom` and `writtenTo`, as standalone's module reads
// it over its own reading (`DependencyGraphFindings.cs`).

import type { CelFunctionsPlugin, PluginFunction } from '../../tool/pluginRegistry';

const written: Readonly<Record<string, string>> = { source: 'writtenFrom', target: 'writtenTo' };

/** The id the `source` or `target` end is written with; the empty text when the key is absent or empty. */
const writtenEnd: PluginFunction = ([relation, end], _read, host) => {
  const attribute = written[String(end)];
  const value = attribute === undefined ? undefined : host(relation, attribute);
  return value === undefined || value === null ? '' : String(value);
};

export const dependencyEnds: CelFunctionsPlugin = { id: 'net.etalii.adp.generic.dependencyEnds', functions: { writtenEnd } };
