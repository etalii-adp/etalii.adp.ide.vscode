import { agentBehaviorModellingDefinition } from './agent-behavior-modelling/definition';
import { registerDefinition } from './diagram/notation';
import { gartnerHypecycleGraphDefinition } from './gartner-hypecycle-graph/definition';

// Every diagram type this plug-in brings, made known to the diagram library: what each webview that
// draws or lists them imports first.

export const definitions = [gartnerHypecycleGraphDefinition, agentBehaviorModellingDefinition];

for (const definition of definitions) registerDefinition(definition);
