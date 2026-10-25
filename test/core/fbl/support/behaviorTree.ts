import { readFileSync } from 'node:fs';
import type { FblElement } from '../../../../src/core/fbl/model';
import { pathOf } from './repository';

// What Agent Behavior Modelling's specification adds to a reading of `behavior-tree.fbl`, the
// declared binding FBL's fixtures `behavior-tree-read` read its Markdown through, standing in for
// DISL as naturalIds.ts does: the ids it derives from a node's place, and its attributes' types and
// defaults, which a binding of the bullets family, reading text and nothing else, does not carry
// (FBL 0.7 4.8, 5.2). Read from `definitions/agent-behavior-modelling/agent-behavior-modelling.dis`.

interface AttributeDefinition {
  readonly type?: string;
  readonly default?: unknown;
}

interface Definition {
  readonly metamodel: {
    readonly types: Readonly<Record<string, { readonly extends?: string; readonly attributes?: Readonly<Record<string, AttributeDefinition>> }>>;
  };
}

let loaded: Definition | undefined;

const specification = (): Definition =>
  (loaded ??= JSON.parse(readFileSync(pathOf('definitions', 'agent-behavior-modelling', 'agent-behavior-modelling.dis'), 'utf8')) as Definition);

/** The attributes of a node type, its own and those of the types it extends. */
function attributesOf(type: string): Map<string, AttributeDefinition> {
  const attributes = new Map<string, AttributeDefinition>();
  for (let current: string | undefined = type; current !== undefined; current = specification().metamodel.types[current]?.extends) {
    for (const [name, definition] of Object.entries(specification().metamodel.types[current]?.attributes ?? {})) {
      if (!attributes.has(name)) attributes.set(name, definition);
    }
  }
  return attributes;
}

/**
 * A node's id is its place in the tree (`persistence.ids`, strategy derived): its parent's id, a dot
 * and its position among its siblings counted from 1, or that position alone at the top level.
 */
export const behaviorTreeIds = (request: { readonly parentId?: string; readonly positionInSlot: number }): string =>
  request.parentId === undefined ? String(request.positionInSlot + 1) : `${request.parentId}.${request.positionInSlot + 1}`;

/**
 * A node's attributes as the tool type holds them: each typed as its specification declares it, an
 * int and a bool read from the text the binding gives, and an attribute the body does not hold at
 * its default (DISL: an attribute no binding stores takes its default).
 */
export function behaviorTreeView(element: FblElement): Readonly<Record<string, unknown>> {
  const attributes: Record<string, unknown> = { ...element.attributes };
  for (const [name, definition] of attributesOf(element.type)) {
    const value = attributes[name];
    if (value === undefined || value === null) attributes[name] = typeof definition.default === 'number' && Number.isInteger(definition.default) ? BigInt(definition.default) : definition.default;
    else if (definition.type === 'int' && typeof value === 'string' && /^[0-9]+$/.test(value)) attributes[name] = BigInt(value);
    else if (definition.type === 'bool' && typeof value === 'string') attributes[name] = value === 'true';
  }
  return attributes;
}
