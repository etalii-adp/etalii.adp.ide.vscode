import { agentBehaviorModelling } from '../core/agent-behavior-modelling/index';
import { fromHandCoded } from '../core/frame/handCoded';
import type { DiagramType } from '../core/frame/toolType';
import { gartnerHypecycleGraph } from '../core/gartner-hypecycle-graph/index';

/** Every diagram type this plug-in brings. Adding a type is adding it here and in package.json. */
export const diagramTypes: readonly DiagramType[] = [gartnerHypecycleGraph, agentBehaviorModelling].map(fromHandCoded);