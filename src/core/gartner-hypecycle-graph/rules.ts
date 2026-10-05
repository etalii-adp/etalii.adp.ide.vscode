import type { Finding } from '../frame/diagramType';
import { boundaryKeys, formatEnd, hasSpan, isPlaceable, isReadableEnd, phaseCount, type Model } from './model';
import { formatMonth } from './scale';

// A document that breaks the rules still opens, and every breach is reported: reporting, never
// refusing. One influence per DIRECTION, never per pair: A to B and B to A may both exist; a second
// A to B may not. An influence hidden by a phase count counts like any other, because the rules
// read the document, not what is drawn.

export const ruleIds = {
  duplicateInfluence: 'ghg.duplicate-influence',
  selfInfluence: 'ghg.self-influence',
  stopBeforeStart: 'ghg.stop-before-start',
  phaseCount: 'ghg.phase-count',
  boundaryOrder: 'ghg.boundary-order',
  badAttachment: 'ghg.bad-attachment',
  danglingReference: 'ghg.dangling-reference',
  duplicateId: 'ghg.duplicate-id',
  unreadableEntry: 'ghg.unreadable-entry',
  influenceIntoTrigger: 'ghg.influence-into-trigger',
  triggerDate: 'ghg.trigger-date',
  notePosition: 'ghg.note-position',
} as const;

/** The ids naming a trigger and no trend: an id shared with a trend is the trend's. */
export function triggerIdsOf(model: Model): Set<string> {
  const trendIds = new Set(model.trends.map((trend) => trend.id));
  return new Set(model.triggers.filter((trigger) => trigger.id.length > 0 && !trendIds.has(trigger.id)).map((trigger) => trigger.id));
}

/** Whether a new influence from one element to another would repeat one in the same direction. */
export function alreadyInfluences(model: Model, from: string, to: string): boolean {
  return model.influences.some((influence) => influence.from === from && influence.to === to);
}

/** Every breach in the model, in rule order then document order. All twelve rules report as warnings. */
export function findingsOf(model: Model): Finding[] {
  const findings: Finding[] = [];
  const report = (rule: string, message: string, line: number): void => {
    findings.push({ rule, severity: 'warning', message, line });
  };
  const trendIds = new Set(model.trends.filter((trend) => trend.id.length > 0).map((trend) => trend.id));
  const triggerIds = triggerIdsOf(model);

  const directions = new Map<string, typeof model.influences[number][]>();
  for (const influence of model.influences) {
    if (influence.from.length === 0 || influence.to.length === 0) continue;
    const key = JSON.stringify([influence.from, influence.to]);
    directions.set(key, [...(directions.get(key) ?? []), influence]);
  }
  for (const group of directions.values()) {
    if (group.length > 1) {
      report(ruleIds.duplicateInfluence, `\`${group[0].from}\` influences \`${group[0].to}\` ${group.length} times; a trend influences another once in each direction.`, group[1].range.start);
    }
  }

  for (const influence of model.influences) {
    if (influence.from.length > 0 && influence.from === influence.to) {
      report(ruleIds.selfInfluence, `\`${influence.id}\` has \`${influence.from}\` influence itself; a trend cannot.`, influence.range.start);
    }
  }

  for (const trend of model.trends) {
    if (trend.start !== undefined && trend.stop !== undefined && trend.stop <= trend.start) {
      report(ruleIds.stopBeforeStart, `\`${trend.id}\` stops at ${formatMonth(trend.stop)}, not after it starts at ${formatMonth(trend.start)}; a trend is at least a month long.`, trend.range.start);
    }
  }

  for (const trend of model.trends) {
    if (trend.phases < 1 || trend.phases > phaseCount) {
      report(ruleIds.phaseCount, `\`${trend.id}\` shows ${trend.phases} phases; a trend shows 1 to ${phaseCount}.`, trend.range.start);
    }
  }

  // Stored boundaries must lie strictly inside the span, and strictly in phase order.
  for (const trend of model.trends) {
    if (!hasSpan(trend)) continue;
    let previous = trend.start;
    for (let index = 0; index < trend.draggedEnds.length; index++) {
      const boundary = trend.draggedEnds[index];
      if (boundary === undefined) continue;
      if (boundary <= previous || boundary >= trend.stop) {
        report(ruleIds.boundaryOrder, `\`${trend.id}\`'s \`${boundaryKeys[index]}: ${formatMonth(boundary)}\` is out of order or outside ${formatMonth(trend.start)} to ${formatMonth(trend.stop)}.`, trend.range.start);
        break;
      }
      previous = boundary;
    }
  }

  // A trigger's end states nothing, by design, so neither the end leaving a trigger nor one
  // arriving at it is checked here.
  for (const influence of model.influences) {
    for (const [side, id, end] of [['from', influence.from, influence.fromEnd], ['to', influence.to, influence.toEnd]] as const) {
      if (!triggerIds.has(id) && !isReadableEnd(end)) {
        report(ruleIds.badAttachment, `\`${influence.id}\`'s ${side} end (${formatEnd(end)}) does not name a phase, a top or bottom edge, and an \`at\` from 0 to 1.`, influence.range.start);
      }
    }
  }

  for (const influence of model.influences) {
    if (!trendIds.has(influence.from) && !triggerIds.has(influence.from)) {
      report(ruleIds.danglingReference, `\`${influence.id}\` comes from \`${influence.from}\`, which is not a trend or a trigger in this document.`, influence.range.start);
    }
    if (!trendIds.has(influence.to) && !triggerIds.has(influence.to)) {
      report(ruleIds.danglingReference, `\`${influence.id}\` names \`${influence.to}\`, which is not a trend in this document.`, influence.range.start);
    }
  }

  const declared = new Map<string, number[]>();
  for (const entry of [...model.trends, ...model.triggers, ...model.notes, ...model.influences]) {
    if (entry.id.length === 0) continue;
    declared.set(entry.id, [...(declared.get(entry.id) ?? []), entry.range.start]);
  }
  for (const [id, starts] of declared) {
    if (starts.length > 1) {
      report(ruleIds.duplicateId, `\`${id}\` is declared ${starts.length} times; an id names one entry.`, starts[starts.length - 1]);
    }
  }

  for (const problem of model.problems) report(ruleIds.unreadableEntry, problem.message, problem.line);

  for (const influence of model.influences) {
    if (triggerIds.has(influence.to)) {
      report(ruleIds.influenceIntoTrigger, `\`${influence.id}\` ends at the trigger \`${influence.to}\`; an influence cannot end at a trigger.`, influence.range.start);
    }
  }

  for (const trigger of model.triggers) {
    if (trigger.date === undefined) {
      report(ruleIds.triggerDate, `\`${trigger.id}\` has no \`date\` written as YYYY-MM; a trigger cannot be drawn without one.`, trigger.range.start);
    }
  }

  for (const note of model.notes) {
    if (!isPlaceable(note)) {
      report(ruleIds.notePosition, `\`${note.id}\` needs an \`at\` written as YYYY-MM and a \`width\` and \`height\` that are positive numbers; it cannot be drawn without them.`, note.range.start);
    }
  }

  return findings;
}