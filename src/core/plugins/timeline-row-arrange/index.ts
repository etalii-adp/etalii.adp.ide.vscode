// The layout plugin `net.etalii.adp.generic.timelineRowArrange` the timeline's definition names
// (etalii.adp spec 091, research R7): "Arrange diagram" gives every element a row and changes no time.
// Ported from standalone's `TimelineArrangement.cs`, over the interpreter's row packing (DISL 10.2).
//
// Across is time, so only rows move. What each element covers across is taken as the client's first
// fit draws it: the timeline's span over 1000 of its 1200 units, at least a day. A period runs from
// its begin to its end, at least 2 units wide; a moment from its diamond's left to its label's end,
// the label 12 units high. A moment linked to something later is kept off that element's row, so
// their link does not run level through the moment's label.

import { assignRows, type LayoutPlugin, type RowItem } from '../../disl/layout';
import type { ModelElement } from '../../disl/model';
import { widthOfText } from '../../text/textMetric';
import { readTime } from '../timeline-times/index';

/** The width the client's first fit spreads the timeline's span over, without its margin. */
const fitWidth = 1200 / 1.2;
const labelFontSize = 12;
const momentRadius = 9;
const labelGap = 6;
/** The least clear space between two elements on one row. */
const gap = 12;
const day = 86_400_000;

const timeOf = (element: ModelElement, name: string): number | undefined => {
  const value = element.attributes[name];
  return typeof value === 'string' ? readTime(value) : undefined;
};

export const timelineRowArrange: LayoutPlugin = {
  id: 'net.etalii.adp.generic.timelineRowArrange',
  place: () => ({}),
  rows: ({ model }) => {
    // Elements without an id, without a readable begin, or with the id of an earlier one keep their row.
    const taken = new Set<string>();
    const elements = model.elements.filter((element) => element.id.length > 0 && timeOf(element, 'begin') !== undefined && !taken.has(element.id) && taken.add(element.id));
    if (elements.length === 0) return {};
    const begin = (element: ModelElement): number => timeOf(element, 'begin')!;
    const ending = (element: ModelElement): number | undefined => timeOf(element, 'end');
    // Where an element finishes: its begin for a moment, and never before its begin.
    const end = (element: ModelElement): number => Math.max(begin(element), ending(element) ?? begin(element));
    const first = Math.min(...elements.map(begin));
    const span = Math.max(Math.max(...elements.map(end)) - first, day);
    const unitsPerTime = fitWidth / span;

    const byId = new Map(elements.map((element) => [element.id, element]));
    const isMoment = (id: string): boolean => byId.has(id) && ending(byId.get(id)!) === undefined;
    const laterThan = (id: string, moment: string): boolean => byId.has(id) && begin(byId.get(id)!) > begin(byId.get(moment)!);
    const links = model.relations.flatMap((relation) => (relation.source !== undefined && relation.target !== undefined ? [[relation.source, relation.target] as const] : []));
    const apart = links.filter(([from, to]) => (isMoment(from) && laterThan(to, from)) || (isMoment(to) && laterThan(from, to)));

    const items = elements.map((element): RowItem => {
      const left = (begin(element) - first) * unitsPerTime;
      if (ending(element) !== undefined) return { id: element.id, from: left, to: Math.max(left + 2, (end(element) - first) * unitsPerTime) };
      const label = typeof element.attributes.label === 'string' && element.attributes.label.length > 0 ? element.attributes.label : element.id;
      return { id: element.id, from: left - momentRadius, to: left + momentRadius + labelGap + widthOfText(label, labelFontSize) };
    });
    return Object.fromEntries(assignRows(items, links, { clearance: gap, ties: 'lower', swapPasses: 64 }, apart));
  },
};
