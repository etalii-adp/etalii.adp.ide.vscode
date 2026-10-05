import { packRows, type RowItem } from '../diagram/layout/rowPacked';
import { widthOfText } from '../text/textMetric';
import { hasSpan, isPlaceable, monthsOf, type Model } from './model';
import { formatWhen, rowStep, triggerSize, widthOf, xOf } from './scale';

const labelFontSize = 12;
const labelGap = 8;
const gap = 16;

/**
 * The row "Arrange diagram" gives every trend, trigger and note. Across is the data, so only rows
 * change: each element's extent is its dates plus the label drawn before it, and the rows are
 * packed with linked elements close together.
 */
export function rowsOf(model: Model): Map<string, number> {
  const unit = model.unit;
  const taken = new Set<string>();
  const take = (id: string): boolean => {
    if (id.length === 0 || taken.has(id)) return false;
    taken.add(id);
    return true;
  };
  const items: RowItem[] = [];

  for (const trend of model.trends) {
    if (!hasSpan(trend) || !take(trend.id)) continue;
    const left = xOf(trend.start, unit);
    items.push({ id: trend.id, left: left - labelGap - widthOfText(trend.name, labelFontSize), right: left + widthOf(monthsOf(trend), unit) });
  }
  for (const trigger of model.triggers) {
    if (trigger.date === undefined || !take(trigger.id)) continue;
    const centre = xOf(trigger.date, unit);
    const half = triggerSize / 2;
    const label = `${trigger.name} · ${formatWhen(trigger.date, unit)}`;
    items.push({ id: trigger.id, left: centre - half - labelGap - widthOfText(label, labelFontSize), right: centre + half });
  }
  for (const note of model.notes) {
    if (!isPlaceable(note) || !take(note.id)) continue;
    const left = xOf(note.at, unit);
    items.push({ id: note.id, left, right: left + note.width, rows: Math.ceil(note.height / rowStep) });
  }

  return packRows(items, model.influences.map((influence) => [influence.from, influence.to] as const), gap);
}