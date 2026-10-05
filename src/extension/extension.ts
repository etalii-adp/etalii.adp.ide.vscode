import { viewTypeOf } from '../core/frame/diagramType';
import { diagramTypes } from './diagramTypes';

/** What activation hands back, so tests can see what was registered. */
export interface AdpApi {
  readonly viewTypes: readonly string[];
}

export function activate(): AdpApi {
  return { viewTypes: diagramTypes.map(viewTypeOf) };
}

export function deactivate(): void {
  // Nothing to release: every registration is disposed with the extension context.
}