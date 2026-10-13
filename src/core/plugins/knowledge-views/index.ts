// What a view of the Knowledge designer shows (etalii.adp `definitions/designers/knowledge.md`,
// "Views" and "Values"). DESL names the types that store a view's settings and not what an
// attribute of them means, and the companion says so: "the view logic itself (how a filter, a sort
// and a grouping select and order rows) is implemented by each host". This is that logic for this
// host, in the names of `knowledge.des`: which columns a view shows and how, the rows its filter
// keeps in the order its sorts give, its groups, and what the line under a column shows.
//
// simplified: a view grouped by the parent relation shows its rows as one list under their parents'
// groups, not nested; nest them when the table surface draws a tree. `docs/disl-support.md` records it.

import type { ModelElement, Value } from '../../disl/model';
import type { ShownView, TableCell, TableData, TableGroup, TableProperty, TableRow, ThemedColour, ViewLogic } from '../../tool/tableView';

/** Notion's ten names, each as one colour for a light theme and one for a dark one; `default` is the surface's own. */
const colours: Readonly<Record<string, ThemedColour>> = {
  gray: { light: '#e3e2e0', dark: '#5a5a5a' },
  brown: { light: '#eee0da', dark: '#603b2c' },
  orange: { light: '#fadec9', dark: '#854c1d' },
  yellow: { light: '#fdecc8', dark: '#89632a' },
  green: { light: '#dbeddb', dark: '#2b593f' },
  blue: { light: '#d3e5ef', dark: '#28456c' },
  purple: { light: '#e8deee', dark: '#492f64' },
  pink: { light: '#f5e0e9', dark: '#69314c' },
  red: { light: '#ffe2dd', dark: '#6e3630' },
};

const NONE = 'none';
const text = (value: Value | undefined): string => (value === undefined || value === null ? '' : String(value));
const isEmpty = (cell: TableCell | undefined): boolean => !cell || (cell.value === null && cell.items.length === 0);

// A moment of any of the three kinds as a number, so that two compare: a date and a time as they are written, a date and time by its instant.
const moment = (written: string): number => {
  const time = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(written);
  return time ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3] ?? 0) : Date.parse(written);
};

/** Whether a row's cell of a column holds what a condition asks, by the comparison the condition stores. */
function holds(cell: TableCell | undefined, property: TableProperty, condition: ModelElement): boolean {
  const operator = text(condition.attributes.operator);
  const empty = isEmpty(cell);
  if (operator === 'is-empty') return empty;
  if (operator === 'is-not-empty') return !empty;
  const negative = operator === 'is-not' || operator.startsWith('does-not') || operator === 'is-not-checked';
  switch (property.editor) {
    case 'checkbox':
      return (cell?.value === true) === (operator === 'is-checked');
    case 'choice': {
      const same = cell?.value === condition.attributes.option;
      return operator === 'is' ? same : !same;
    }
    case 'choices':
    case 'rows': {
      const wanted = text(condition.attributes.option ?? condition.attributes.text);
      const has = (cell?.items ?? []).some((item) => item.value === wanted);
      return operator === 'contains' ? has : !has;
    }
    case 'number': {
      const [value, other] = [cell?.value, condition.attributes.number];
      if (typeof value !== 'number' || typeof other !== 'number') return negative;
      return { equals: value === other, 'does-not-equal': value !== other, 'greater-than': value > other, 'less-than': value < other, 'at-least': value >= other, 'at-most': value <= other }[operator] ?? false;
    }
    case 'date':
    case 'dateTime':
    case 'time': {
      const other = text(condition.attributes[property.editor]);
      if (empty || other === '') return false;
      const [value, wanted] = [moment(text(cell!.value)), moment(other)];
      return { is: value === wanted, 'is-before': value < wanted, 'is-after': value > wanted, 'is-on-or-before': value <= wanted, 'is-on-or-after': value >= wanted }[operator] ?? false;
    }
    default: {
      // Text, ignoring case, as a sort does.
      const [value, other] = [text(cell?.value).toLowerCase(), text(condition.attributes.text).toLowerCase()];
      const found = { is: value === other, contains: value.includes(other), 'starts-with': value.startsWith(other), 'ends-with': value.endsWith(other) }[operator.replace(/^is-not$/, 'is').replace(/^does-not-contain$/, 'contains')] ?? false;
      return negative ? !found : found;
    }
  }
}

/** How two cells of a column compare, by its value type's sort; nothing where either is empty, which sorts last in both directions. */
function compared(a: TableCell | undefined, b: TableCell | undefined, property: TableProperty): number {
  const order = (cell: TableCell | undefined): number => property.options.findIndex((option) => option.id === (property.many ? cell?.items[0]?.value : cell?.value));
  switch (property.editor) {
    case 'number': return (a!.value as number) - (b!.value as number);
    case 'checkbox': return Number(a?.value === true) - Number(b?.value === true);
    case 'date': case 'dateTime': case 'time': return moment(text(a!.value)) - moment(text(b!.value));
    case 'choice': case 'choices': return order(a) - order(b);
    default: {
      const [left, right] = [(a?.items[0]?.label ?? a?.text ?? '').toLowerCase(), (b?.items[0]?.label ?? b?.text ?? '').toLowerCase()];
      return left < right ? -1 : left > right ? 1 : 0;
    }
  }
}

const number = (value: number): string => String(Math.round(value * 100) / 100);

/** What the line under a column shows of the rows in sight, or nothing for a calculation that does not suit the column. */
function calculated(calculation: string, property: TableProperty, rows: readonly TableRow[]): string | undefined {
  const cells = rows.map((row) => row.cells[property.id]);
  const filled = cells.filter((cell) => !isEmpty(cell)) as TableCell[];
  const values = filled.flatMap((cell) => (property.many ? cell.items.map((item) => item.value) : [text(cell.value)]));
  const share = (count: number): string => `${rows.length === 0 ? 0 : Math.round((100 * count) / rows.length)}%`;
  const numbers = property.editor === 'number' ? filled.map((cell) => cell.value as number).sort((a, b) => a - b) : undefined;
  const moments = property.editor === 'date' || property.editor === 'dateTime' ? filled.map((cell) => text(cell.value)).sort((a, b) => moment(a) - moment(b)) : undefined;
  switch (calculation) {
    case 'countAll': return String(rows.length);
    case 'countValues': return String(values.length);
    case 'countUnique': return String(new Set(values).size);
    case 'countEmpty': return String(rows.length - filled.length);
    case 'countNotEmpty': return String(filled.length);
    case 'percentEmpty': return share(rows.length - filled.length);
    case 'percentNotEmpty': return share(filled.length);
    default: break;
  }
  if (moments && moments.length > 0) {
    const days = Math.round((moment(moments[moments.length - 1]) - moment(moments[0])) / 86_400_000);
    return { earliest: moments[0], latest: moments[moments.length - 1], dateRange: `${days} ${days === 1 ? 'day' : 'days'}` }[calculation];
  }
  if (!numbers || numbers.length === 0) return undefined;
  const sum = numbers.reduce((total, value) => total + value, 0);
  const middle = numbers.length / 2;
  return {
    sum: number(sum), average: number(sum / numbers.length), min: number(numbers[0]), max: number(numbers[numbers.length - 1]), range: number(numbers[numbers.length - 1] - numbers[0]),
    median: number(numbers.length % 2 === 1 ? numbers[Math.floor(middle)] : (numbers[middle - 1] + numbers[middle]) / 2),
  }[calculation];
}

function shown(table: TableData): ShownView {
  const { model } = table;
  const view = model.elements.find((element) => element.id === table.view);
  if (!view) return {};
  const settings = (type: string, slot?: string): ModelElement[] => model.elements.filter((element) => element.parent === view.id && element.type === type && (slot === undefined || element.slot === slot));
  const propertyOf = (id: Value | undefined): TableProperty | undefined => table.properties.find((property) => property.id === id);

  // ---- the rows: what the filter keeps, in the order the sorts give ----

  const kept = (parent: string, match: Value | undefined, row: TableRow): boolean => {
    const results = model.elements.filter((element) => element.parent === parent && (element.type === 'Condition' || element.type === 'FilterGroup')).flatMap((element) => {
      if (element.type === 'FilterGroup') return [kept(element.id, element.attributes.match, row)];
      // A condition that names no property of the table is left out: the view opens without it.
      const property = propertyOf(element.attributes.property);
      return property ? [holds(row.cells[property.id], property, element)] : [];
    });
    return results.length === 0 || (match === 'any' ? results.some(Boolean) : results.every(Boolean));
  };
  let rows = table.rows.filter((row) => kept(view.id, view.attributes.filterMatch, row));

  const sorts = settings('Sort').flatMap((sort) => {
    const property = propertyOf(sort.attributes.property);
    return property ? [{ property, descending: sort.attributes.direction === 'descending' }] : [];
  });
  if (sorts.length > 0) {
    rows = [...rows].sort((a, b) => {
      for (const { property, descending } of sorts) {
        const [left, right] = [a.cells[property.id], b.cells[property.id]];
        // A checkbox without a value is unchecked; any other empty value is last, whichever way the sort goes.
        const [none, other] = property.editor === 'checkbox' ? [false, false] : [isEmpty(left), isEmpty(right)];
        const order = none || other ? Number(none) - Number(other) : compared(left, right, property) * (descending ? -1 : 1);
        if (order !== 0) return order;
      }
      return 0;
    });
  }

  // ---- the groups ----

  const by = propertyOf(view.attributes.groupBy);
  let groups: TableGroup[] | undefined;
  if (by && ['choice', 'choices', 'checkbox', 'rows'].includes(by.editor ?? '')) {
    const keysOf = (row: TableRow): string[] => {
      const cell = row.cells[by.id];
      if (by.editor === 'checkbox') return [String(cell?.value === true)];
      const keys = by.many ? (cell?.items ?? []).map((item) => item.value) : cell?.value === null || cell === undefined ? [] : [text(cell.value)];
      return keys.length === 0 ? [NONE] : keys;
    };
    const labels = new Map<string, { readonly label: string; readonly colour?: ThemedColour }>();
    if (by.editor === 'checkbox') labels.set('true', { label: 'Checked' }).set('false', { label: 'Unchecked' });
    for (const option of by.options) labels.set(option.id, { label: option.name, ...(option.colour ? { colour: option.colour } : {}) });
    // A related row is a group by its own name, in the order the rows first name it.
    for (const row of rows) for (const item of row.cells[by.id]?.items ?? []) if (!labels.has(item.value)) labels.set(item.value, { label: item.label });
    if (by.editor !== 'checkbox') labels.set(NONE, { label: '' });

    const keyed = (slot: string): string[] => settings('GroupSetting', slot).map((setting) => text(setting.attributes.key));
    const [first, hidden, collapsed] = [keyed('groupOrder'), keyed('hiddenGroups'), keyed('collapsed')];
    const ordered = [...first.filter((key) => labels.has(key)), ...[...labels.keys()].filter((key) => !first.includes(key))];
    groups = ordered.filter((key) => !hidden.includes(key)).map((key): TableGroup => ({
      key, ...labels.get(key)!, collapsed: collapsed.includes(key), rows: rows.filter((row) => keysOf(row).includes(key)).map((row) => row.id),
    })).filter((group) => view.attributes.hideEmptyGroups !== true || group.rows.length > 0);
    // The rows of a group that is not shown are not in sight.
    const sight = new Set(groups.flatMap((group) => group.rows));
    rows = rows.filter((row) => sight.has(row.id));
  }

  // ---- the columns: those the view has a setting for first, in its order ----

  const listed = settings('Column').filter((column) => propertyOf(column.attributes.property));
  const order = [...listed.map((column) => text(column.attributes.property)), ...table.properties.map((property) => property.id).filter((id) => !listed.some((column) => column.attributes.property === id))];
  const frozen = order.indexOf(text(view.attributes.freeze));
  const calculations = table.metamodel.enums.Calculation?.values ?? [];
  const columns = order.map((id, index) => {
    const property = propertyOf(id)!;
    const setting = listed.find((column) => column.attributes.property === id)?.attributes ?? {};
    const calculation = text(setting.calculate);
    const result = calculation === '' ? undefined : calculated(calculation, property, rows);
    return {
      id,
      // The title column is never hidden.
      visible: property.title || setting.visible !== false, wrap: setting.wrap === true, frozen: index <= frozen,
      ...(typeof setting.width === 'number' ? { width: setting.width } : {}),
      ...(result === undefined ? {} : { summary: { label: calculations.find((value) => value.key === calculation)?.label ?? calculation, text: result } }),
    };
  });

  return { columns, rows: rows.map((row) => row.id), ...(groups ? { groups } : {}) };
}

/** The view logic of the tool type `etalii/knowledge`. */
export const knowledgeViews: ViewLogic = { id: 'etalii/knowledge', shown, colour: (key) => (Object.hasOwn(colours, key) ? colours[key] : undefined) };
