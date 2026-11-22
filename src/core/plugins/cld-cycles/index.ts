// The cycle finder the causal loop diagram's definition names (`net.etalii.adp.systems.cldCycles`,
// `causalCycles`; etalii.adp spec 081): the standalone module's `CycleFinder`, whose order DISL's
// `diagram.cycles` does not give. Johnson's algorithm from each variable in model order, walking
// a variable's successors in the order of the links that leave it. A link's ends are the names it
// writes, a variable is the first of its name, and a link whose end names no variable is not walked.

import { elementaryCycles } from '../../disl/cycles';
import type { CelFunctionsPlugin, PluginFunction } from '../../tool/pluginRegistry';

const causalCycles: PluginFunction = ([variables, links, max], read) => {
  const byName = new Map<string, unknown>();
  for (const variable of variables as readonly unknown[]) {
    const name = String(read(variable, 'name') ?? '');
    if (!byName.has(name)) byName.set(name, variable);
  }
  const successors = new Map<string, string[]>();
  for (const link of links as readonly unknown[]) {
    const [cause, effect] = [String(read(link, 'causeName') ?? ''), String(read(link, 'effectName') ?? '')];
    if (byName.has(cause) && byName.has(effect)) (successors.get(cause) ?? successors.set(cause, []).get(cause)!).push(effect);
  }
  return elementaryCycles([...byName.keys()], successors, Number(max)).cycles.map((cycle) => cycle.map((name) => byName.get(name)));
};

export const cldCycles: CelFunctionsPlugin = { id: 'net.etalii.adp.systems.cldCycles', functions: { causalCycles } };
