import type { Action, DiagramType, EditOutcome, EditRequest, Field, Finding, Source, ToolboxEntry, ViewModel, ViewOptions } from '../frame/diagramType';
import { LineDocument } from '../text/lineDocument';
import { newShortGuid } from '../text/shortGuid';
import { apply, influenceOf, noteOf, removalConfirmation, trendOf, triggerOf, unreadable, type Edit } from './edits';
import {
  boundaryKeys, currentVersion, formatEnd, headerKey, parseEnd, phaseIndexOf, phaseTitles, visiblePhases,
  type End, type Model, type Trend,
} from './model';
import { parse } from './parser';
import { boundariesOf } from './phases';
import { findingsOf } from './rules';
import { formatMonth, nearestMonthAt, rowStep } from './scale';
import { tagsOf, viewOf } from './view';
import { formatSize } from './writer';

// The Gartner hype cycle graph as the frame sees it: the definition's toolbox, forms and actions as
// data, and every gesture turned into one edit of the document.

export const actionIds = {
  addTrend: 'ghg.add.trend',
  addTrigger: 'ghg.add.trigger',
  addNote: 'ghg.add.note',
  rename: 'ghg.rename',
  remove: 'ghg.remove',
  evenPhases: 'ghg.even-phases',
  disconnect: 'ghg.disconnect',
  arrange: 'ghg.arrange',
} as const;

export const fieldIds = {
  name: 'ghg.name',
  date: 'ghg.date',
  text: 'ghg.text',
  size: 'ghg.size',
  start: 'ghg.start',
  stop: 'ghg.stop',
  phases: 'ghg.phases',
  tags: 'ghg.tags',
  description: 'ghg.description',
  from: 'ghg.from',
  to: 'ghg.to',
  fromAttachment: 'ghg.from-attachment',
  toAttachment: 'ghg.to-attachment',
  boundaries: boundaryKeys.map((key) => `ghg.${key}`),
  influences: phaseTitles.map((title) => `ghg.${title.toLowerCase()}-influences`),
  influencedBy: phaseTitles.map((title) => `ghg.${title.toLowerCase()}-influenced-by`),
} as const;

/** The Phases slider's four stops, in order; the value is the one at `phases - 1`. */
export const phaseCandidates = ['Peak', 'Peak and Trough', 'Peak, Trough and Slope', 'All four'] as const;
export const noInfluences = 'None';

const nothingToArrange = 'There is nothing to arrange until this graph has a trend.';

const read = (source: Source): Model => parse(LineDocument.parse(source.text));

const toolboxEntries: ToolboxEntry[] = [
  { id: actionIds.addTrend, label: 'Trend', icon: 'mdi-arrow-right-bold-box-outline', description: 'A trend through the hype cycle. Drop it where it starts; it is a year long with all four phases.' },
  { id: actionIds.addTrigger, label: 'Trigger', icon: 'mdi-circle-slice-8', description: 'A moment in time that set trends off - an invention, a political moment, a disaster. Drop it where it happened; draw influences from it.' },
  { id: actionIds.addNote, label: 'Note', icon: 'mdi-note-text-outline', description: 'A remark of your own, placed where it applies. Drop it and start typing.' },
];

// An end as the grid shows it: "Steam engine · Plateau", or a trigger's name alone.
function describe(model: Model, id: string, end: End): string {
  const trend = trendOf(model, id);
  const trigger = triggerOf(model, id);
  if (!trend && trigger) return trigger.name.length > 0 ? trigger.name : id;
  const index = phaseIndexOf(end.phase);
  return `${trend && trend.name.length > 0 ? trend.name : id} · ${index >= 0 ? phaseTitles[index] : end.phase}`;
}

// Per phase, its two influence lists: every drawn phase, and a hidden one only while an influence
// still attaches to it, so nothing drawn from the document goes missing from the grid.
function influenceFields(model: Model, trend: Trend): Field[] {
  const shown = 'Draw, reattach or delete an influence on the canvas.';
  const fields: Field[] = [];
  phaseTitles.forEach((title, phase) => {
    const leaving = model.influences.filter((influence) => influence.from === trend.id && phaseIndexOf(influence.fromEnd.phase) === phase).map((influence) => describe(model, influence.to, influence.toEnd));
    const arriving = model.influences.filter((influence) => influence.to === trend.id && phaseIndexOf(influence.toEnd.phase) === phase).map((influence) => describe(model, influence.from, influence.fromEnd));
    const drawn = phase < visiblePhases(trend);
    if (!drawn && leaving.length === 0 && arriving.length === 0) return;
    const group = drawn ? title : `${title} (hidden)`;
    const list = (entries: string[]): string => (entries.length === 0 ? noInfluences : entries.join('\n'));
    fields.push({ id: fieldIds.influences[phase], label: 'Influence', group, control: 'multiline', value: list(leaving), readOnly: shown });
    fields.push({ id: fieldIds.influencedBy[phase], label: 'Influenced by', group, control: 'multiline', value: list(arriving), readOnly: shown });
  });
  return fields;
}

function fieldsOf(model: Model, id: string): Field[] {
  const locked = model.readable ? {} : { readOnly: unreadable };
  const month = (value: number | undefined): string => (value === undefined ? '' : formatMonth(value));

  const trend = trendOf(model, id);
  if (trend) {
    const fields: Field[] = [
      { id: fieldIds.name, label: 'Name', group: 'Identity', control: 'text', value: trend.name, ...locked },
      { id: fieldIds.description, label: 'Description', group: 'Identity', control: 'multiline', value: trend.description, ...locked },
      { id: fieldIds.tags, label: 'Tags', group: 'Identity', control: 'tags', value: trend.tags.join(', '), options: tagsOf(model), ...locked },
      { id: fieldIds.start, label: 'Start', group: 'Time', control: 'text', value: month(trend.start), ...locked },
      { id: fieldIds.stop, label: 'Stop', group: 'Time', control: 'text', value: month(trend.stop), ...locked },
      { id: fieldIds.phases, label: 'Phases', group: 'Phases', control: 'slider', value: phaseCandidates[visiblePhases(trend) - 1], options: phaseCandidates, ...locked },
    ];
    // One row per drawn inner boundary: the ones a chevron can be dragged at.
    boundariesOf(trend).forEach((boundary, index) => {
      fields.push({ id: fieldIds.boundaries[index], label: `${phaseTitles[index]} ends`, group: 'Phases', control: 'text', value: formatMonth(boundary), ...locked });
    });
    return [...fields, ...influenceFields(model, trend)];
  }

  const trigger = triggerOf(model, id);
  if (trigger) {
    return [
      { id: fieldIds.name, label: 'Name', group: 'Identity', control: 'text', value: trigger.name, ...locked },
      { id: fieldIds.description, label: 'Description', group: 'Identity', control: 'multiline', value: trigger.description, ...locked },
      { id: fieldIds.tags, label: 'Tags', group: 'Identity', control: 'tags', value: trigger.tags.join(', '), options: tagsOf(model), ...locked },
      { id: fieldIds.date, label: 'Date', group: 'Time', control: 'text', value: month(trigger.date), ...locked },
    ];
  }

  const note = noteOf(model, id);
  if (note) {
    const size = note.width !== undefined && note.height !== undefined ? `${formatSize(note.width)} x ${formatSize(note.height)}` : '';
    return [
      { id: fieldIds.text, label: 'Text', group: 'Identity', control: 'multiline', value: note.text, ...locked },
      { id: fieldIds.size, label: 'Size', group: 'Identity', control: 'text', value: size, ...locked },
    ];
  }

  const influence = influenceOf(model, id);
  if (influence) {
    const shown = 'Where it is attached; drag the end on the canvas to move it.';
    return [
      { id: fieldIds.description, label: 'Description', group: 'Identity', control: 'multiline', value: influence.description, ...locked },
      { id: fieldIds.from, label: 'From', group: 'Ends', control: 'text', value: describe(model, influence.from, influence.fromEnd), readOnly: shown },
      { id: fieldIds.to, label: 'To', group: 'Ends', control: 'text', value: describe(model, influence.to, influence.toEnd), readOnly: shown },
      { id: fieldIds.fromAttachment, label: 'From attachment', group: 'Ends', control: 'text', value: formatEnd(influence.fromEnd), ...locked },
      { id: fieldIds.toAttachment, label: 'To attachment', group: 'Ends', control: 'text', value: formatEnd(influence.toEnd), ...locked },
    ];
  }
  return [];
}

function actionsOf(model: Model, id: string | undefined): Action[] {
  // A read-only diagram offers nothing that edits.
  if (!model.readable) return [];
  const arrange: Action = {
    id: actionIds.arrange, label: 'Arrange diagram', icon: 'mdi-sitemap-outline',
    enabled: model.trends.length + model.triggers.length + model.notes.length > 0, disabledReason: nothingToArrange,
  };
  if (id === undefined) return [arrange];
  const trend = trendOf(model, id);
  if (trend) {
    const actions: Action[] = [{ id: actionIds.rename, label: 'Rename…', icon: 'mdi-pencil-outline', shortcut: 'F2', enabled: true }];
    if (trend.draggedEnds.some((boundary) => boundary !== undefined)) {
      actions.push({ id: actionIds.evenPhases, label: 'Even phases', icon: 'mdi-arrow-split-vertical', enabled: true });
    }
    return [...actions, { id: actionIds.remove, label: 'Remove', icon: 'mdi-delete-outline', shortcut: 'Delete', enabled: true }, arrange];
  }
  if (triggerOf(model, id) || noteOf(model, id)) {
    return [
      { id: actionIds.rename, label: noteOf(model, id) && !triggerOf(model, id) ? 'Edit text…' : 'Rename…', icon: 'mdi-pencil-outline', shortcut: 'F2', enabled: true },
      { id: actionIds.remove, label: 'Remove', icon: 'mdi-delete-outline', shortcut: 'Delete', enabled: true },
      arrange,
    ];
  }
  if (influenceOf(model, id)) {
    return [{ id: actionIds.disconnect, label: 'Remove influence', icon: 'mdi-vector-polyline-remove', shortcut: 'Delete', enabled: true }, arrange];
  }
  return [arrange];
}

// The edit a property means, or the sentence that refuses it.
function fieldEdit(model: Model, id: string, field: string, value: string): Edit | string {
  const isTrend = trendOf(model, id) !== undefined;
  const isTrigger = triggerOf(model, id) !== undefined;
  const isNote = noteOf(model, id) !== undefined;
  const isInfluence = influenceOf(model, id) !== undefined;
  const boundary = fieldIds.boundaries.indexOf(field);

  if (field === fieldIds.phases && isTrend) {
    const phases = phaseCandidates.indexOf(value.trim() as (typeof phaseCandidates)[number]) + 1;
    return phases === 0 ? `'${value}' is not one of ${phaseCandidates.join(', ')}.` : { kind: 'setPhases', id, phases };
  }
  if ((field === fieldIds.fromAttachment || field === fieldIds.toAttachment) && isInfluence) {
    return parseEnd(value)
      ? { kind: 'setAttachment', id, side: field === fieldIds.fromAttachment ? 'from' : 'to', end: value }
      : `'${value}' is not an attachment; write it as phase/edge/at, such as plateau/bottom/0.3.`;
  }
  if (field === fieldIds.name && (isTrend || isTrigger)) return { kind: 'rename', id, name: value };
  if (field === fieldIds.text && isNote) return { kind: 'rename', id, name: value };
  if (field === fieldIds.size && isNote) return { kind: 'setNoteSize', id, size: value };
  if (field === fieldIds.start && isTrend) return { kind: 'setSpan', id, start: value };
  if (field === fieldIds.stop && isTrend) return { kind: 'setSpan', id, stop: value };
  if (field === fieldIds.date && isTrigger) return { kind: 'setSpan', id, start: value };
  if (field === fieldIds.tags && (isTrend || isTrigger)) return { kind: 'setTags', id, tags: value };
  if (field === fieldIds.description && (isTrend || isTrigger || isInfluence)) return { kind: 'setDescription', id, description: value };
  if (boundary >= 0 && isTrend) return { kind: 'setBoundary', id, index: boundary, month: value };
  return `'${field}' cannot be edited on this selection.`;
}

const round = (value: number): string => String(Math.round(value * 100) / 100);

function editOf(source: Source, request: EditRequest, confirmed: boolean): EditOutcome {
  const model = read(source);
  if (!model.readable) return { kind: 'refused', sentence: unreadable };
  const dateAt = (x: number): string => formatMonth(nearestMonthAt(x, model.unit));
  const run = (edit: Edit, extra: { select?: string; editLabel?: boolean; multiline?: boolean } = {}): EditOutcome => {
    const outcome = apply(source.text, edit);
    return outcome.refusal !== undefined ? { kind: 'refused', sentence: outcome.refusal } : { kind: 'applied', text: outcome.text, ...extra };
  };
  const gone: EditOutcome = { kind: 'refused', sentence: 'That is no longer in this graph.' };

  switch (request.kind) {
    case 'drop': {
      const id = newShortGuid();
      if (request.entry === actionIds.addTrend) return run({ kind: 'addTrend', x: request.x, y: request.y, id }, { select: id });
      if (request.entry === actionIds.addTrigger) return run({ kind: 'addTrigger', x: request.x, y: request.y, id }, { select: id });
      // A note is added empty, and its editor opens at once.
      if (request.entry === actionIds.addNote) return run({ kind: 'addNote', x: request.x, y: request.y, id }, { select: id, editLabel: true, multiline: true });
      return { kind: 'refused', sentence: 'A trend is added by dropping it where it starts.' };
    }
    case 'move':
      return run({ kind: 'setPlacement', id: request.id, x: request.x, y: request.y });
    case 'resize': {
      const { bounds } = request;
      if (noteOf(model, request.id)) {
        return run({ kind: 'setNoteSize', id: request.id, size: `${round(bounds.width)} x ${round(bounds.height)} at ${dateAt(bounds.x)} row ${Math.round(bounds.y / rowStep)}` });
      }
      // A trend's resize is a span: the dragged edge's month is the new start or stop.
      if (request.side === 'left') return run({ kind: 'setSpan', id: request.id, start: dateAt(bounds.x) });
      if (request.side === 'right') return run({ kind: 'setSpan', id: request.id, stop: dateAt(bounds.x + bounds.width) });
      return gone;
    }
    case 'connect': {
      const id = newShortGuid();
      const fromEnd = parseEnd(request.fromEnd);
      const toEnd = parseEnd(request.toEnd);
      return run({ kind: 'addInfluence', from: request.from, to: request.to, id, ...(fromEnd ? { fromEnd } : {}), ...(toEnd ? { toEnd } : {}) }, { select: id });
    }
    case 'moveEnd':
      return run({ kind: 'setAttachment', id: request.id, side: request.end, end: request.value });
    case 'handle':
      return run({ kind: 'setBoundary', id: request.id, index: request.handle, month: dateAt(request.x) });
    case 'rename':
      return run({ kind: 'rename', id: request.id, name: request.text });
    case 'setField': {
      const edit = fieldEdit(model, request.id, request.field, request.value);
      return typeof edit === 'string' ? { kind: 'refused', sentence: edit } : run(edit);
    }
    case 'action': {
      if (request.action === actionIds.arrange) return run({ kind: 'arrange' });
      const id = request.id;
      if (id === undefined) return gone;
      const isElement = trendOf(model, id) !== undefined || triggerOf(model, id) !== undefined || noteOf(model, id) !== undefined;
      switch (request.action) {
        case actionIds.rename:
          // In place, over the element's own label: the name alone, never a trigger's date.
          return isElement ? { kind: 'editInPlace', id, multiline: noteOf(model, id) !== undefined && !trendOf(model, id) && !triggerOf(model, id) } : gone;
        case actionIds.evenPhases:
          return trendOf(model, id) ? run({ kind: 'clearBoundaries', id }) : gone;
        case actionIds.remove: {
          if (!isElement) return gone;
          // Says how many influences go with it before it runs; with none, no ceremony.
          const confirmation = confirmed ? undefined : removalConfirmation(model, id);
          return confirmation ? { kind: 'confirm', ...confirmation, confirmLabel: 'Remove', danger: true } : run({ kind: 'remove', id });
        }
        case actionIds.disconnect:
          return influenceOf(model, id) ? run({ kind: 'removeInfluence', id }) : gone;
        default:
          return gone;
      }
    }
  }
}

export const gartnerHypecycleGraph: DiagramType = {
  origin: 'gartner/hypecycle-graph',
  displayName: 'Gartner hype cycle graph',
  extensions: ['ghg'],
  shared: false,
  suggests: () => true,
  findings: (source: Source): Finding[] => findingsOf(read(source)),
  view: (source: Source, options: ViewOptions): ViewModel => viewOf(read(source), options),
  toolbox: (): ToolboxEntry[] => toolboxEntries,
  fields: (source: Source, selection: readonly string[]): Field[] => (selection.length === 1 ? fieldsOf(read(source), selection[0]) : []),
  actions: (source: Source, selection: readonly string[]): Action[] => actionsOf(read(source), selection.length === 1 ? selection[0] : undefined),
  edit: (source: Source, request: EditRequest, _options: ViewOptions, confirmed: boolean): EditOutcome => editOf(source, request, confirmed),
  // CRLF, as every ADP host writes a new document.
  newDocument: (): string => [`${headerKey}: ${currentVersion}`, 'trends: []', 'influences: []', ''].join('\r\n'),
};