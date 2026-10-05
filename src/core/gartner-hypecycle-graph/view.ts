import type { Box, ViewElement, ViewModel, ViewOptions, ViewRelation } from '../frame/diagramType';
import { widthOfText } from '../text/textMetric';
import { unreadable } from './edits';
import type { Attachment } from '../diagram/shapes/segments';
import { gartnerNames, hasSpan, isPlaceable, isReadableEnd, monthsOf, phaseCount, phaseIndexOf, phaseNames, phaseTitles, visiblePhases, type End, type Model } from './model';
import { fractionsOf } from './phases';
import { formatWhen, formatWhenLong, rowStep, topOf, trendHeight, triggerSize, unitsPerStep, widthOf, xOf } from './scale';

// A model as what the canvas draws: trends as arrow banners, triggers as circles, notes as boxes of
// text, and influences from a trend or trigger to a trend.
//
// What cannot be drawn is left out, and what breaks a rule is still drawn: a trend without a
// readable span, an influence whose end is not a drawable element, and every later entry reusing
// an id already drawn. A description is never part of the view.

export const elementTypes = { trend: 'trend', trigger: 'trigger', note: 'note' } as const;
export const relationTypes = { influence: 'influence' } as const;

/** A compact trend's width when it shows all four phases: twenty-four steps, twice a new trend's. */
export const compactWidth = 24 * unitsPerStep;
const compactGap = unitsPerStep;
const labelFontSize = 12;
const labelGap = 8;

/** A trend's compact width: a quarter of the full compact width per phase it shows. */
export function compactWidthOf(phases: number): number {
  return (compactWidth * Math.min(Math.max(phases, 1), phaseCount)) / phaseCount;
}

/** The ruler's rungs, finest first, by the months each spans. */
const rulerRungs = [
  { months: 1, every: 'month', label: 'MMM yyyy' },
  { months: 3, every: 'quarter', label: 'MMM yyyy' },
  { months: 12, every: 'year', label: 'yyyy' },
  { months: 120, every: 'decade', label: 'yyyy' },
  { months: 1200, every: 'century', label: 'yyyy' },
  { months: 12000, every: 'millennium', label: 'yyyy' },
] as const;

export interface Chrome {
  readonly unit: string;
  readonly unitMonths: number;
  readonly compact: boolean;
  /** The ruler's rungs for this unit, or none in compact, where an x is no date. */
  readonly ruler: readonly { months: number; every: string; label: string }[];
  /** Every tag in use on trends and triggers, once each, in order of first use. */
  readonly tags: readonly string[];
  readonly legend: readonly { caption: string; swatchClass: string }[];
  /** The tag filter as it is set for this view; it is never saved. */
  readonly filter: { readonly label: string; readonly tags: readonly string[]; readonly mode: 'any' | 'all' };
  /** The steps a drag is previewed on; where a drop lands is the document's to say. */
  readonly snap: { readonly x: number; readonly y: number };
}

export function tagsOf(model: Model): string[] {
  return [...new Set([...model.trends.flatMap((trend) => trend.tags), ...model.triggers.flatMap((trigger) => trigger.tags)])];
}

function attachmentOf(end: End): Attachment | undefined {
  return isReadableEnd(end) ? { edge: end.edge as 'top' | 'bottom', region: phaseIndexOf(end.phase), at: end.at } : undefined;
}

function overlaps(box: Box, viewport: Box): boolean {
  return box.x + box.width >= viewport.x && box.x <= viewport.x + viewport.width && box.y + box.height >= viewport.y && box.y <= viewport.y + viewport.height;
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

function matches(tags: readonly string[], options: ViewOptions): boolean {
  const wanted = (options.filterTags ?? []).map((tag) => tag.toLowerCase()).filter((tag) => tag.length > 0);
  if (wanted.length === 0) return true;
  const has = new Set(tags.map((tag) => tag.toLowerCase()));
  return options.filterMode === 'all' ? wanted.every((tag) => has.has(tag)) : wanted.some((tag) => has.has(tag));
}

export function viewOf(model: Model, options: ViewOptions): ViewModel {
  const unit = model.unit;
  const compact = options.compact === true;
  const taken = new Set<string>();
  const take = (id: string): boolean => {
    if (id.length === 0 || taken.has(id)) return false;
    taken.add(id);
    return true;
  };

  const elements: ViewElement[] = [];
  const hiddenByFilter = new Set<string>();
  const trendIds = new Set<string>();
  const sourceIds = new Set<string>();
  const shownPhases = new Map<string, number>();

  for (const trend of model.trends) {
    if (!hasSpan(trend) || !take(trend.id)) continue;
    trendIds.add(trend.id);
    sourceIds.add(trend.id);
    shownPhases.set(trend.id, visiblePhases(trend));
    if (!matches(trend.tags, options)) {
      hiddenByFilter.add(trend.id);
      continue;
    }
    const phases = visiblePhases(trend);
    elements.push({
      id: trend.id, type: elementTypes.trend, x: xOf(trend.start, unit), y: topOf(trend.row), width: widthOf(monthsOf(trend), unit), height: trendHeight,
      label: trend.name,
      data: {
        phases, boundaries: compact ? [] : fractionsOf(trend), tags: trend.tags, labelText: trend.name,
        phaseTooltips: gartnerNames.slice(0, phases), movable: !compact, resize: compact ? 'none' : 'horizontal', connectable: true,
      },
    });
  }
  for (const trigger of model.triggers) {
    if (trigger.date === undefined || !take(trigger.id)) continue;
    sourceIds.add(trigger.id);
    if (!matches(trigger.tags, options)) {
      hiddenByFilter.add(trigger.id);
      continue;
    }
    const half = triggerSize / 2;
    elements.push({
      id: trigger.id, type: elementTypes.trigger, x: xOf(trigger.date, unit) - half, y: topOf(trigger.row) + trendHeight / 2 - half, width: triggerSize, height: triggerSize,
      // The label is the name alone: what the inline editor opens with, never the date beside it.
      label: trigger.name,
      tooltip: `Trigger: ${trigger.name}, ${formatWhenLong(trigger.date, unit)}`,
      data: { labelText: `${trigger.name} · ${formatWhen(trigger.date, unit)}`, tags: trigger.tags, movable: !compact, resizable: false },
    });
  }
  for (const note of model.notes) {
    if (!isPlaceable(note) || !take(note.id)) continue;
    elements.push({
      id: note.id, type: elementTypes.note, x: xOf(note.at, unit), y: topOf(note.row), width: note.width, height: note.height,
      label: note.text, tooltip: note.text, data: { movable: !compact, resize: compact ? 'none' : 'both', connectable: false, multiline: true },
    });
  }

  const relations: ViewRelation[] = [];
  for (const influence of model.influences) {
    if (!sourceIds.has(influence.from) || !trendIds.has(influence.to) || !take(influence.id)) continue;
    if (hiddenByFilter.has(influence.from) || hiddenByFilter.has(influence.to)) continue;
    const source = attachmentOf(influence.fromEnd);
    const target = attachmentOf(influence.toEnd);
    // An influence attached to a phase its trend does not show is hidden, not removed: it stays in
    // the document and still counts for the one-per-direction rule.
    const hidden = (source !== undefined && source.region >= (shownPhases.get(influence.from) ?? phaseCount))
      || (target !== undefined && target.region >= (shownPhases.get(influence.to) ?? phaseCount));
    relations.push({ id: influence.id, type: relationTypes.influence, from: influence.from, to: influence.to, data: { source, target, hidden } });
  }

  const placed = compact ? packed(elements, relations) : cull(elements, relations, options.viewport);
  const chrome: Chrome = {
    unit: unit.name,
    unitMonths: unit.months,
    compact,
    ruler: compact ? [] : rulerRungs.filter((rung) => rung.months >= unit.months),
    tags: tagsOf(model),
    legend: phaseNames.map((phase, index) => ({ caption: phaseTitles[index], swatchClass: `ghg-${phase}` })),
    filter: { label: 'Filter by tags', tags: options.filterTags ?? [], mode: options.filterMode ?? 'any' },
    snap: { x: unitsPerStep, y: rowStep },
  };
  return {
    ...placed,
    readOnly: !model.readable,
    ...(model.readable ? {} : { notice: unreadable }),
    chrome: chrome as unknown as Record<string, unknown>,
  };
}

// Every element that overlaps the viewport, and every influence whose span does, with its two ends.
function cull(elements: ViewElement[], relations: ViewRelation[], viewport: Box | undefined): { elements: ViewElement[]; relations: ViewRelation[] } {
  if (!viewport) return { elements, relations };
  const byId = new Map(elements.map((element) => [element.id, element]));
  const shown = new Set(elements.filter((element) => overlaps(element, viewport)).map((element) => element.id));
  const shownRelations = relations.filter((relation) => {
    const from = byId.get(relation.from);
    const to = byId.get(relation.to);
    return from !== undefined && to !== undefined && overlaps(union(from, to), viewport);
  });
  for (const relation of shownRelations) {
    shown.add(relation.from);
    shown.add(relation.to);
  }
  return { elements: elements.filter((element) => shown.has(element.id)), relations: shownRelations };
}

// Compact: every element keeps its row; within a row elements keep the order of their start dates
// and are placed as far left as they fit, four units apart, each leaving room for the label before
// it. An influence's target starts after the middle of its source, so causes read left of effects.
// Only trends take the compact width; a note two rows tall keeps both rows clear.
function packed(elements: ViewElement[], relations: ViewRelation[]): { elements: ViewElement[]; relations: ViewRelation[] } {
  const width = (element: ViewElement): number => (element.type === elementTypes.trend ? compactWidthOf(element.data.phases as number) : element.width);
  const leading = (element: ViewElement): number =>
    typeof element.data.labelText === 'string' ? labelGap + widthOfText(element.data.labelText, labelFontSize) : 0;
  const rowsOf = (element: ViewElement): number[] => {
    const first = Math.floor(element.y / rowStep);
    const last = Math.max(first, Math.floor((element.y + element.height - 1) / rowStep));
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  };

  const byStart = [...elements].sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const sourcesOf = new Map<string, string[]>();
  for (const relation of relations) sourcesOf.set(relation.to, [...(sourcesOf.get(relation.to) ?? []), relation.from]);

  const rowEnd = new Map<number, number>();
  const placedLeft = new Map<string, number>();
  const byId = new Map(elements.map((element) => [element.id, element]));
  let previous: number | undefined;
  for (let start = 0; start < byStart.length;) {
    let end = start;
    while (end < byStart.length && byStart[end].x === byStart[start].x) end++;
    const group = byStart.slice(start, end);

    let groupX = previous ?? group[0].x;
    for (const element of group) {
      for (const sourceId of sourcesOf.get(element.id) ?? []) {
        const left = placedLeft.get(sourceId);
        const source = byId.get(sourceId);
        if (left !== undefined && source) groupX = Math.max(groupX, left + width(source) / 2 + compactGap + leading(element));
      }
      for (const row of rowsOf(element)) {
        const free = rowEnd.get(row);
        if (free !== undefined) groupX = Math.max(groupX, free + compactGap + leading(element));
      }
    }

    // A later member of the group follows an earlier one on any row they share.
    const placedRows = new Set<number>();
    let rightmost = groupX;
    for (const element of group) {
      const rows = rowsOf(element);
      let left = groupX;
      for (const row of rows) {
        if (placedRows.has(row)) left = Math.max(left, rowEnd.get(row)! + compactGap + leading(element));
      }
      for (const row of rows) {
        placedRows.add(row);
        rowEnd.set(row, left + width(element));
      }
      rightmost = Math.max(rightmost, left);
      placedLeft.set(element.id, left);
    }
    previous = rightmost;
    start = end;
  }

  return { elements: elements.map((element) => ({ ...element, x: placedLeft.get(element.id) ?? element.x, width: width(element) })), relations };
}

/**
 * The true-time x a compact x stands for: the compact placement run backwards. Between two placed
 * elements the date runs evenly from the one's start to the other's; left of the first and right
 * of the last it runs at the true-time scale. This is what lets a toolbox drop in Compact land on
 * a date.
 */
export function trueTimeX(model: Model, options: ViewOptions, x: number): number {
  const { viewport: _viewport, ...rest } = options;
  void _viewport;
  const trueTime = viewOf(model, { ...rest, compact: false }).elements;
  if (trueTime.length === 0) return x;
  const compact = new Map(viewOf(model, { ...rest, compact: true }).elements.map((element) => [element.id, element.x]));
  const placed = trueTime.map((element) => ({ manualLeft: element.x, placedLeft: compact.get(element.id) ?? element.x })).sort((a, b) => a.placedLeft - b.placedLeft);
  let before: (typeof placed)[number] | undefined;
  let after: (typeof placed)[number] | undefined;
  for (const entry of placed) {
    if (entry.placedLeft <= x) {
      before = entry;
    } else {
      after = entry;
      break;
    }
  }
  if (!before) return (after as (typeof placed)[number]).manualLeft - ((after as (typeof placed)[number]).placedLeft - x);
  if (!after || after.placedLeft === before.placedLeft) return before.manualLeft + (x - before.placedLeft);
  return before.manualLeft + ((x - before.placedLeft) / (after.placedLeft - before.placedLeft)) * (after.manualLeft - before.manualLeft);
}