import type { DiagramType } from '../core/frame/diagramType';
import { gartnerHypecycleGraph } from '../core/gartner-hypecycle-graph/index';

/** Every diagram type this plug-in brings. Adding a type is adding it here and in package.json. */
export const diagramTypes: readonly DiagramType[] = [gartnerHypecycleGraph];