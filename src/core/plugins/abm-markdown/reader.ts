// The reader of the persistence plugin `net.etalii.adp.etalii.abmMarkdown` (etalii.adp spec 027,
// research R8 and R12): the behavior tree of a Markdown file as the elements of the definition's
// metamodel, one for each list item, in the order of the file.

import type { FblElement, Finding, PluginReadRequest, PluginReadResult } from '../../fbl';
import { LineBody } from './lineBody';
import { kindIds, kindOf, type Model, type Node } from './model';
import { parse } from './parser';

/** The one finding the reader reports: no element exists to carry it, so no constraint of the definition can. */
export const noBehavior = 'abm.no-behavior';

const noHeading = 'This file has no Behavior heading, so there is no behavior tree to draw. Add a node to start one.';
const noList = 'The Behavior section holds no list yet. Add a node to start the tree.';

/** A body as its lines and the tree read from them. */
export function readTree(bytes: Uint8Array): { readonly body: LineBody; readonly model: Model } {
  const body = LineBody.parse(bytes);
  return { body, model: parse(body.lines) };
}

/** The body among the files a request holds: the one without a path. */
export const bodyOf = (files: PluginReadRequest['files']): Uint8Array => files.find((file) => file.relativePath === '')?.bytes ?? new Uint8Array();

/**
 * A node as an element. Its id is its place in the tree, which the Markdown does not store, and its
 * span runs from the start of its line to the end of the last line beneath it.
 */
function elementOf(node: Node, body: LineBody): FblElement {
  const attributes: Record<string, unknown> = { label: node.label };
  if (node.notes.length > 0) attributes.notes = node.notes;
  if (node.kind === kindIds.retry) attributes.attempts = node.retryCount;
  if (!node.hasKeyword) attributes.implicit = true;
  return {
    id: node.id, idIsStored: false, type: kindOf(node.kind).type, rule: 'node', isRelation: false, attributes,
    ...(node.parentId === undefined ? {} : { parentId: node.parentId, parentSlot: 'children' }),
    ownSpan: body.spanOf({ start: node.line, end: node.subtreeEnd }), line: node.line + 1,
  };
}

const finding = (message: string, line: number): Finding => ({ code: noBehavior, severity: 'info', message, location: { file: '', line, column: 1, length: 0 } });

/** FBL 11.2 `read`: never fails on content, so a file without a tree reads as no element and one finding. */
export function read(request: PluginReadRequest): PluginReadResult {
  const { body, model } = readTree(bodyOf(request.files));
  const findings = model.sectionLine === undefined
    ? [finding(noHeading, 1)]
    : model.nodes.length === 0 ? [finding(noList, model.sectionLine + 1)] : [];
  return { elements: model.nodes.map((node) => elementOf(node, body)), findings, unreadable: false };
}
