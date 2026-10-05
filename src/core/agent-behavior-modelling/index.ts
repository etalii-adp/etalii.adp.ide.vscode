import type { Action, Box, DiagramType, EditOutcome, EditRequest, Field, Finding, Source, ToolboxEntry, ViewElement, ViewModel, ViewOptions, ViewRelation } from '../frame/diagramType';
import { newRegistration, readLayout, writeLayout, type Position } from '../registration/registration';
import { LineDocument } from '../text/lineDocument';
import { arrange, dropOf, isNothing, moveIndexOf, nodeHeight, nodeWidth, renamed, rowAndBeneath } from './layout';
import {
  categoryOf, childrenOf, choiceOf, defaultRetryCount, isKnownKind, isWithin, keywordOf, kindIds, kindOf, kinds, nodeOf, shownKeyword, siblingsOf, takesAnotherChild,
  type Model, type Node,
} from './model';
import { hasBehaviorHeading, parse } from './parser';
import { findingsOf } from './rules';
import * as writer from './writer';

// Agent Behavior Modelling as the frame sees it: a chat agent's instructions as a behavior tree,
// kept in the Markdown file the agent reads. The Markdown is the instructions; the registration
// beside it is only the visualization, and keeps the heights rows were dragged to.

export const origin = 'etalii/agent-behavior-modelling';

export const actionIds = {
  rename: 'abm.rename',
  remove: 'abm.remove',
  moveEarlier: 'abm.move-earlier',
  moveLater: 'abm.move-later',
  editNotes: 'abm.edit-notes',
  arrange: 'abm.arrange',
  add: (kind: string): string => `abm.add.${kind}`,
} as const;

export const fieldIds = { kind: 'abm.kind', label: 'abm.label', attempts: 'abm.attempts', notes: 'abm.notes', place: 'abm.place' } as const;

export const childIdPrefix = 'child:';
const addPrefix = 'abm.add.';
const gone = 'That node is no longer in this behavior model.';
const dropRefusal = 'Drop the node below the node it belongs under: a Do in order, a Try in order, a Do together, or a Retry, Repeat until, Only while or Ask approval before that has no child yet.';

const read = (source: Source): Model => parse(LineDocument.parse(source.text));
const stored = (source: Source): Map<string, Position> => readLayout(source.registration);

const toolboxIcons: Record<string, string> = {
  sequence: 'mdi-arrow-right-bold-outline', fallback: 'mdi-help-rhombus-outline', parallel: 'mdi-call-split', retry: 'mdi-replay', repeat: 'mdi-repeat',
  guard: 'mdi-shield-outline', approval: 'mdi-account-check-outline', check: 'mdi-help-circle-outline', action: 'mdi-play-outline',
  ask: 'mdi-account-question-outline', delegate: 'mdi-account-arrow-right-outline',
};

const toolboxEntries: ToolboxEntry[] = kinds.map((kind) => ({
  id: actionIds.add(kind.id),
  label: choiceOf(kind.id),
  icon: toolboxIcons[kind.id],
  description: `${kind.meaning[0].toUpperCase()}${kind.meaning.slice(1)}. Drop it below the node it belongs under.`,
}));

/** The label a new node of a kind starts with, before the author types their own. */
export function startingLabel(kind: string): string {
  switch (kind) {
    case kindIds.sequence: return 'New steps';
    case kindIds.fallback: return 'New alternatives';
    case kindIds.parallel: return 'New independent work';
    case kindIds.repeat:
    case kindIds.guard: return 'New condition';
    case kindIds.check: return 'New question';
    case kindIds.action: return 'New action';
    case kindIds.ask: return 'New question for the user';
    case kindIds.delegate: return 'New task';
    default: return '';
  }
}

function overlaps(box: Box, viewport: Box): boolean {
  return box.x + box.width >= viewport.x && box.x <= viewport.x + viewport.width && box.y + box.height >= viewport.y && box.y <= viewport.y + viewport.height;
}

function viewOf(source: Source, options: ViewOptions): ViewModel {
  const model = read(source);
  // The whole tree is laid out first and culled afterwards, so a pan never re-packs it.
  const positions = arrange(model, stored(source));
  const boxOf = (node: Node): Box => ({ ...(positions.get(node.id) ?? { x: 0, y: 0 }), width: nodeWidth, height: nodeHeight });

  const shown = new Set(model.nodes.filter((node) => !options.viewport || overlaps(boxOf(node), options.viewport)).map((node) => node.id));
  // A parent line is kept when either end is in view, and brings both ends with it.
  const lines = model.nodes.filter((node) => node.parentId !== undefined && (shown.has(node.id) || shown.has(node.parentId)));
  for (const child of lines) {
    shown.add(child.id);
    shown.add(child.parentId as string);
  }

  const elements: ViewElement[] = model.nodes.filter((node) => shown.has(node.id)).map((node) => ({
    id: node.id, type: node.kind, ...boxOf(node), label: node.label,
    tooltip: node.notes.length > 0 ? node.notes : undefined,
    data: {
      keyword: shownKeyword(node), family: categoryOf(node), implicit: !node.hasKeyword, hasNotes: node.notes.length > 0,
      movable: true, resize: 'none', connectable: categoryOf(node) !== 'leaf', multiline: false,
      // What follows a drag of this node: its subtree with it, and the rest of its row up and down.
      subtree: model.nodes.filter((other) => isWithin(other.id, node.id)).map((other) => other.id),
      row: rowAndBeneath(model, node).map((other) => other.id),
    },
  })).map(({ tooltip, ...element }) => (tooltip === undefined ? element : { ...element, tooltip }));

  const relations: ViewRelation[] = lines.map((child) => ({
    id: childIdPrefix + child.id, type: 'child', from: child.parentId as string, to: child.id,
    data: { index: (nodeOf(model, child.parentId as string)?.childIds.indexOf(child.id) ?? 0) + 1 },
  }));

  return { elements, relations, readOnly: false, chrome: { snap: { x: 0, y: 0 } } };
}

function fieldsOf(model: Model, id: string): Field[] {
  const node = nodeOf(model, id);
  if (!node) return [];
  // The kinds a node can become without losing a child.
  const candidates = kinds.filter((kind) => (kind.category === 'leaf' ? node.childIds.length === 0 : kind.category === 'decorator' ? node.childIds.length <= 1 : true));
  const fields: Field[] = [
    { id: fieldIds.kind, label: 'Kind', group: 'Node', control: 'choice', value: choiceOf(node.kind), options: candidates.map((kind) => choiceOf(kind.id)) },
    { id: fieldIds.label, label: 'Label', group: 'Node', control: 'text', value: node.label },
  ];
  if (node.kind === kindIds.retry) fields.push({ id: fieldIds.attempts, label: 'Attempts', group: 'Node', control: 'number', value: String(node.retryCount) });
  fields.push({ id: fieldIds.notes, label: 'Notes', group: 'Node', control: 'multiline', value: node.notes });
  fields.push({ id: fieldIds.place, label: 'Place', group: 'Node', control: 'text', value: node.id, readOnly: "A node's place follows from where it sits in the tree." });
  return fields;
}

function actionsOf(model: Model, id: string | undefined): Action[] {
  const arrangeAction: Action = {
    id: actionIds.arrange, label: 'Arrange diagram', icon: 'mdi-sitemap-outline', enabled: model.nodes.length > 0,
    disabledReason: 'There is nothing to arrange until this behavior model has a node.',
  };
  const node = id === undefined ? undefined : nodeOf(model, id);
  if (!node) return [arrangeAction];
  const siblings = siblingsOf(model, node);
  const place = siblings.findIndex((sibling) => sibling.id === node.id);
  const actions: Action[] = [
    { id: actionIds.rename, label: 'Rename…', icon: 'mdi-pencil-outline', shortcut: 'F2', enabled: true },
    { id: actionIds.editNotes, label: 'Edit notes…', icon: 'mdi-note-text-outline', enabled: true },
    { id: actionIds.moveEarlier, label: 'Move earlier', icon: 'mdi-arrow-left', shortcut: 'Alt+Up', enabled: place > 0, disabledReason: 'It is already the first of its siblings.' },
    { id: actionIds.moveLater, label: 'Move later', icon: 'mdi-arrow-right', shortcut: 'Alt+Down', enabled: place < siblings.length - 1, disabledReason: 'It is already the last of its siblings.' },
    { id: actionIds.remove, label: 'Remove', icon: 'mdi-delete-outline', shortcut: 'Delete', enabled: true },
  ];
  if (takesAnotherChild(node)) {
    actions.push(...kinds.map((kind): Action => ({ id: actionIds.add(kind.id), label: `Add child: ${choiceOf(kind.id)}`, icon: 'mdi-plus', enabled: true })));
  }
  return [...actions, arrangeAction];
}

// Where a node dropped at a point belongs: under the nearest node above it that takes another
// child, before the first of its children drawn right of it. An empty model takes it as its root.
function placeDrop(model: Model, layout: ReadonlyMap<string, Position>, x: number, y: number): { parent: Node | undefined; index: number; refusal?: string } {
  if (model.nodes.length === 0) return { parent: undefined, index: 0 };
  const positions = arrange(model, layout);
  const centre = (node: Node): Position => {
    const topLeft = positions.get(node.id) ?? { x: 0, y: 0 };
    return { x: topLeft.x + nodeWidth / 2, y: topLeft.y + nodeHeight / 2 };
  };
  const distance = (node: Node): number => Math.abs(x - centre(node).x) + 2 * (y - centre(node).y);
  const parent = model.nodes.filter((node) => takesAnotherChild(node) && centre(node).y < y).sort((a, b) => distance(a) - distance(b))[0];
  if (!parent) return { parent: undefined, index: 0, refusal: dropRefusal };
  return { parent, index: childrenOf(model, parent).filter((child) => centre(child).x < x).length };
}

function editOf(source: Source, request: EditRequest, confirmed: boolean): EditOutcome {
  const document = LineDocument.parse(source.text);
  const model = parse(document);
  const refused = (sentence: string): EditOutcome => ({ kind: 'refused', sentence });
  const done = (refusal: writer.Refusal, extra: { select?: string; editLabel?: boolean } = {}): EditOutcome =>
    (refusal === undefined ? { kind: 'applied', text: document.text, ...extra } : refused(refusal));
  const addUnder = (parent: Node | undefined, index: number, kind: string): EditOutcome => {
    const added = writer.add(document, model, parent, index, kind, startingLabel(kind));
    // An added node is renamed in place at once.
    return done(added.refusal, { select: added.id, editLabel: true });
  };

  switch (request.kind) {
    case 'drop': {
      const kind = request.entry.startsWith(addPrefix) ? request.entry.slice(addPrefix.length) : '';
      if (!isKnownKind(kind)) return refused(`A behavior model has no \`${kind}\` node.`);
      const place = placeDrop(model, stored(source), request.x, request.y);
      return place.refusal ? refused(place.refusal) : addUnder(place.parent, place.index, kind);
    }
    case 'move': {
      // A drop moves the node's row, and may change its place among its siblings.
      const node = nodeOf(model, request.id);
      if (!node) return refused(gone);
      const before = stored(source);
      const drop = dropOf(model, before, node, request.x, request.y);
      if (isNothing(drop)) return refused('That node is already there.');
      const parent = node.parentId === undefined ? undefined : nodeOf(model, node.parentId);
      let current = model;
      let layout = before;
      let reordered = false;
      if (drop.from !== drop.to) {
        const refusal = writer.move(document, model, node, parent, moveIndexOf(drop));
        if (refusal !== undefined) return refused(refusal);
        current = parse(document);
        layout = renamed(drop, node.parentId, siblingsOf(model, node).length, before);
        reordered = true;
      }
      // Every node in the row and beneath it is written out, at where it is drawn now plus the
      // row's move: so a row below one that only hung from its parent keeps its place under it.
      const arranged = arrange(current, layout);
      const movedParent = parent ? nodeOf(current, parent.id) : undefined;
      const row = movedParent ? childrenOf(current, movedParent) : current.nodes.filter((candidate) => candidate.parentId === undefined);
      const positions = new Map(layout);
      for (const moved of current.nodes.filter((candidate) => row.some((member) => isWithin(candidate.id, member.id)))) {
        const at = arranged.get(moved.id) ?? { x: 0, y: 0 };
        positions.set(moved.id, { x: at.x, y: at.y + drop.dy });
      }
      const dropped = moveIndexOf(drop) > drop.from ? drop.to : drop.to;
      const landed = node.parentId === undefined ? String(dropped + 1) : `${node.parentId}.${dropped + 1}`;
      return {
        kind: 'applied', text: reordered ? document.text : source.text,
        registration: writeLayout(source.registration ?? newRegistration(origin), positions), select: landed,
      };
    }
    case 'connect': {
      // Drawing a parent line moves the child, with everything beneath it, to be the parent's last child.
      const child = nodeOf(model, request.to);
      const parent = nodeOf(model, request.from);
      if (!child) return refused(gone);
      if (!parent) return refused('The node it was moved under is no longer in this behavior model.');
      return done(writer.move(document, model, child, parent, -1));
    }
    case 'rename': {
      const node = nodeOf(model, request.id);
      return node ? done(writer.setLabel(document, node, request.text)) : refused(gone);
    }
    case 'setField': {
      const node = nodeOf(model, request.id);
      if (!node) return refused(gone);
      switch (request.field) {
        case fieldIds.kind: {
          const kind = kinds.find((candidate) => choiceOf(candidate.id) === request.value || candidate.id === request.value);
          if (!kind) return refused(`'${request.value}' is not a kind of node.`);
          return done(writer.setKind(document, node, kind.id, kind.id === kindIds.retry ? Math.max(node.retryCount, defaultRetryCount) : 0));
        }
        case fieldIds.label:
          return done(writer.setLabel(document, node, request.value));
        case fieldIds.attempts: {
          const attempts = /^\s*[+-]?\d+\s*$/.test(request.value) ? Number(request.value) : Number.NaN;
          if (!Number.isInteger(attempts) || attempts < 1) return refused(`'${request.value}' is not a number of attempts; a Retry allows at least 1.`);
          return done(writer.setKind(document, node, kindIds.retry, attempts));
        }
        case fieldIds.notes:
          return done(writer.setNotes(document, node, request.value));
        default:
          return refused(`'${request.field}' cannot be edited on this selection.`);
      }
    }
    case 'action': {
      if (request.action === actionIds.arrange) {
        // The tidy tree is the arrangement: arranging forgets every dragged position, and never touches the Markdown.
        if (source.registration === undefined) return refused('This behavior model was opened without a registration, so it has no dragged positions to forget.');
        if (stored(source).size === 0) return refused('This behavior model is already arranged.');
        return { kind: 'applied', text: source.text, registration: writeLayout(source.registration, new Map()) };
      }
      const node = request.id === undefined ? undefined : nodeOf(model, request.id);
      if (request.action.startsWith(addPrefix)) {
        const kind = request.action.slice(addPrefix.length);
        if (!isKnownKind(kind)) return refused(`A behavior model has no \`${kind}\` node.`);
        return node ? addUnder(node, -1, kind) : refused('A node is added under another node, or by dropping it where it belongs.');
      }
      if (!node) return refused(gone);
      const place = siblingsOf(model, node).findIndex((sibling) => sibling.id === node.id);
      const parent = node.parentId === undefined ? undefined : nodeOf(model, node.parentId);
      switch (request.action) {
        case actionIds.rename:
          return { kind: 'editInPlace', id: node.id, multiline: false };
        case actionIds.editNotes:
          // Notes are the agent's extra instructions for this node, and get the property grid's room.
          return { kind: 'showField', field: fieldIds.notes };
        case actionIds.moveEarlier:
          return done(writer.move(document, model, node, parent, place - 1));
        case actionIds.moveLater:
          return done(writer.move(document, model, node, parent, place + 2));
        case actionIds.remove: {
          const below = model.nodes.filter((candidate) => isWithin(candidate.id, node.id)).length - 1;
          if (below > 0 && !confirmed) {
            return {
              kind: 'confirm', title: 'Remove', confirmLabel: 'Remove', danger: true,
              message: below === 1 ? 'Removing this node also removes the 1 node beneath it.' : `Removing this node also removes the ${below} nodes beneath it.`,
            };
          }
          return done(writer.remove(document, node));
        }
        default:
          return refused(gone);
      }
    }
    default:
      return refused(gone);
  }
}

/** The section that tells the agent how to follow the tree. */
export function legend(): string[] {
  return [
    '## How to follow the behavior',
    '',
    'The behavior below is a behavior tree, and it is your instructions. Start at its first node and work through it from the top. Each list item is a node; the items indented under a node are its children, in order. Every node ends in success or failure, and its parent decides what happens next:',
    '',
    ...kinds.map((kind) => `- **${kind.keyword}** ${kind.meaning}.`),
    '',
    'Lines under a node that are not list items are notes: follow them while you carry out that node.',
  ];
}

// The text of a new behavior model: a Markdown file an agent can follow from the first save. It
// explains itself to the agent, and starts the tree with one Do in order. CRLF, as every ADP host
// writes a new document.
function newDocument(name: string): string {
  const title = writer.oneLine(name.replace(/\.md$/i, ''));
  return [
    `# ${title.length > 0 ? title : 'Agent'}`,
    '',
    'Describe the agent here: who it works for, and what it is for.',
    '',
    ...legend(),
    '',
    '## Behavior',
    '',
    writer.itemLine('- ', keywordOf(kindIds.sequence, 0), 'Handle the request'),
    '',
  ].join('\r\n');
}

export const agentBehaviorModelling: DiagramType = {
  origin,
  displayName: 'Agent Behavior Modelling',
  extensions: ['md'],
  // Markdown belongs to many tools: a file is a behavior model only when the user opens it as one.
  shared: true,
  suggests: hasBehaviorHeading,
  findings: (source: Source): Finding[] => findingsOf(read(source)),
  view: viewOf,
  toolbox: (): ToolboxEntry[] => toolboxEntries,
  fields: (source: Source, selection: readonly string[]): Field[] => (selection.length === 1 ? fieldsOf(read(source), selection[0]) : []),
  actions: (source: Source, selection: readonly string[]): Action[] => actionsOf(read(source), selection.length === 1 ? selection[0] : undefined),
  edit: (source: Source, request: EditRequest, _options: ViewOptions, confirmed: boolean): EditOutcome => editOf(source, request, confirmed),
  newDocument,
};

/** A kind's keyword in a sentence, for tests and messages. */
export const keywordFor = (kind: string): string => kindOf(kind).keyword;
