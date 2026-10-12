import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveReference } from '../../../../src/core/fbl/documents/documentLoader';
import type { FblBinding } from '../../../../src/core/fbl/documents/types';
import { nodeFiles } from '../../../../src/core/fbl/files/nodeFiles';
import { pathOf } from './repository';

/**
 * Where etalii.adp's `definitions/` is copied to, in its own layout: the tool types' bindings,
 * specifications and example documents that FBL's fixtures name (fixtures/fbl/PROVENANCE.md).
 */
export const definitions = pathOf('fixtures', 'fbl', 'definitions');

/** The Knowledge designer's binding document, with its three bindings `yaml`, `json` and `xml`. */
export const knowledgeBindings = join(definitions, 'designers', 'knowledge.fbl');

/** One of the Knowledge designer's bindings, by its name. */
export const knowledgeBinding = (name: string): FblBinding => resolveReference(`knowledge.fbl#${name}`, knowledgeBindings, nodeFiles);

/** What an id derivation is asked: the library's `IdRequest`, as far as these derivations use it. */
interface Request {
  readonly rule: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly parentId?: string;
  readonly parentSlot?: string;
  readonly positionInSlot?: number;
}

/**
 * The id derivations of the Knowledge designer's specification, standing in for DESL, which the
 * library does not implement any more than it implements DISL. Each mirrors `persistence.ids` of
 * etalii.adp's `definitions/designers/knowledge.des`: a column and a sort by their view and
 * property, a cell by its row and property, a cell's item by its cell and what it names, a group
 * setting by its view, slot and key, and a filter's conditions and groups by their place.
 */
export function knowledgeIds(request: Request): string | undefined {
  switch (request.rule) {
    case 'table': return 'table';
    case 'column': return `${request.parentId}/columns/${attribute(request, 'property')}`;
    case 'sort': return `${request.parentId}/sorts/${attribute(request, 'property')}`;
    case 'condition1':
    case 'filterGroup1': return `${request.parentId}/filter/${request.positionInSlot}`;
    case 'condition2':
    case 'filterGroup2':
    case 'condition3': return `${request.parentId}/${request.positionInSlot}`;
    case 'groupOrder':
    case 'hiddenGroup':
    case 'collapsedGroup': return `${request.parentId}/${request.parentSlot}/${attribute(request, 'key')}`;
    case 'cell': return `${request.parentId}/${attribute(request, 'property')}`;
    case 'cellOption': return `${request.parentId}/${attribute(request, 'option')}`;
    case 'cellRow': return `${request.parentId}/${attribute(request, 'row')}`;
    default: return undefined;
  }
}

function attribute(request: Request, name: string): string {
  const value = request.attributes[name];
  return value === undefined || value === null ? '' : String(value);
}

interface Specification {
  metamodel: { types: Record<string, { attributes?: Record<string, { type?: unknown }> }> };
}

let types: Map<string, string> | undefined;

function read(): Map<string, string> {
  const specification = JSON.parse(readFileSync(join(definitions, 'designers', 'knowledge.des'), 'utf8')) as Specification;
  const found = new Map<string, string>();
  for (const [element, type] of Object.entries(specification.metamodel.types)) {
    for (const [name, declared] of Object.entries(type.attributes ?? {})) {
      if (typeof declared.type === 'string') found.set(`${element}\n${name}`, declared.type);
    }
  }
  return found;
}

/**
 * The attribute types of the Knowledge designer's specification, read once from the copied
 * `definitions/designers/knowledge.des`, standing in for DESL as `knowledgeIds` does for its id
 * derivations.
 */
export const knowledgeTypes = {
  /** How many attributes the specification types: none means the reading of it broke. */
  get count(): number {
    return (types ??= read()).size;
  },

  of(element: string, attribute: string): string | undefined {
    return (types ??= read()).get(`${element}\n${attribute}`);
  },
};
