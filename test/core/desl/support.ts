// What the tests of the DESL interpreter share: a specification read from a folder of
// `definitions/` or from DESL's own example, interpreted as the tool type made of it interprets it,
// and a document of it read through its binding into the model the operations run on.
import { readFileSync } from 'node:fs';
import { interpretOperations, type Operations } from '../../../src/core/desl/operations';
import { expressionsOf, loadDesigner, type DesignerSpecification } from '../../../src/core/desl/specification';
import { interpretSurface, type Surface } from '../../../src/core/desl/surface';
import { interpretConstraints, type Constraints } from '../../../src/core/disl/constraints';
import type { Expressions } from '../../../src/core/disl/expressions';
import { interpretMetamodel, type Metamodel } from '../../../src/core/disl/metamodel';
import type { Finding, Model } from '../../../src/core/disl/model';
import { readModel } from '../../../src/core/disl/persistence';
import { loadDocument } from '../../../src/core/fbl/documents/documentLoader';
import type { FblBinding } from '../../../src/core/fbl/documents/types';
import { OpenBody } from '../../../src/core/fbl/history/openBody';
import { encode } from '../../../src/core/fbl/text/utf8';

export type Json = Readonly<Record<string, unknown>>;
export const object = (value: unknown): Json => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {});

export const knowledgeFolder = 'definitions/knowledge';
export const hierarchyFolder = 'definitions/hierarchical-requirement';
export const minimalFolder = 'fixtures/tools/desl';

/** A specification file as parsed JSON, exactly as it is on disk. */
export const specificationAt = (path: string): Json => JSON.parse(readFileSync(path, 'utf8')) as Json;
export const knowledgeSpecification = (): Json => specificationAt(`${knowledgeFolder}/knowledge.des`);
export const minimalSpecification = (): Json => specificationAt(`${minimalFolder}/minimal-table.des`);
/** The Hierarchical Requirement Designer's specification: DESL 0.2, with a `hierarchy` surface. */
export const hierarchySpecification = (): Json => specificationAt(`${hierarchyFolder}/hierarchical-requirement.des`);

/** A binding of an FBL document on disk, by its name. */
export function bindingAt(path: string, name: string): FblBinding {
  const loaded = loadDocument(new Uint8Array(readFileSync(path)), path.slice(path.lastIndexOf('/') + 1));
  const binding = loaded.document?.bindings.get(name);
  if (!binding) throw new Error(`${path} has no binding ${name}`);
  return binding;
}

export interface Interpreted {
  readonly designer: DesignerSpecification;
  readonly metamodel: Metamodel;
  readonly expressions: Expressions;
  readonly constraints: Constraints;
  readonly surface: Surface;
  readonly operations: Operations;
  /** What reading the specification found, of every part. */
  readonly findings: readonly Finding[];
}

/** A specification interpreted as a tool type interprets it. One whose surface cannot be read fails the test. */
export function interpreted(json: unknown): Interpreted {
  const designer = loadDesigner(json);
  const metamodel = interpretMetamodel(designer.value.interpreted);
  const expressions = expressionsOf(designer.value, metamodel.value);
  const constraints = interpretConstraints(designer.value.interpreted, metamodel.value, expressions);
  const surface = interpretSurface(designer.value.surface, metamodel.value);
  if (!surface.value) throw new Error(`The surface cannot be read: ${surface.findings.map((found) => found.message).join(' ')}`);
  const operations = interpretOperations(designer.value, surface.value, metamodel.value, expressions, constraints.value);
  return {
    designer: designer.value, metamodel: metamodel.value, expressions, constraints: constraints.value, surface: surface.value, operations: operations.value,
    findings: [...designer.findings, ...metamodel.findings, ...expressions.findings, ...constraints.findings, ...surface.findings, ...operations.findings],
  };
}

/** A document read through a binding into the model, with the ids the specification derives. */
export function modelOf(parts: Interpreted, binding: FblBinding, text: string, fileName = 'document.yaml'): Model {
  const body = OpenBody.open(encode(text), binding, { fileName, ...parts.operations.reading(binding) });
  return readModel(body.model, binding, parts.metamodel, parts.designer.persistence).value;
}

export const cities = (): string => readFileSync('examples/knowledge/cities.yaml', 'utf8');
export const knowledgeYaml = (): FblBinding => bindingAt(`${knowledgeFolder}/knowledge.fbl`, 'yaml');
