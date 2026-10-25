// The surface of a designer (DESL 7): which types and attributes of the metamodel play which part
// of the layout. DESL 0.1 has the one kind, `table`, and DESL 0.2 adds `hierarchy` (7.7).

import { attributesOf, isA, valueKind, type Metamodel } from '../disl/metamodel';
import { finding, type Finding, type Loaded } from '../disl/model';
import { isObject, localized, type LocalizedText } from '../disl/specification';

/** The editor a host opens over a cell (DESL 7.5). */
export type Editor = 'text' | 'number' | 'checkbox' | 'date' | 'dateTime' | 'time' | 'choice' | 'choices' | 'rows';

const editors: readonly string[] = ['text', 'number', 'checkbox', 'date', 'dateTime', 'time', 'choice', 'choices', 'rows'];

/** What a column's cells hold and how the surface treats it (DESL 7.5). */
export interface ValueType {
  readonly id: string;
  readonly label: string;
  /** The attribute of the cells' type that holds the value or, with `many`, of the items' type that holds one value. */
  readonly key: string;
  readonly many: boolean;
  readonly editor: Editor;
  /** The comparisons a filter condition on it offers, by the operator a condition stores. */
  readonly comparisons: readonly string[];
  readonly sort: string;
  /** What a value becomes when its column changes to another value type, by that type (DESL 7.6). */
  readonly converts: Readonly<Record<string, string>>;
}

/** The `table` kind (DESL 7.2): rows, columns, cells at their crossings, and the views that store how it is shown. */
export interface TableSurface {
  readonly kind: 'table';
  readonly columns: {
    readonly type: string; readonly name: string; readonly valueType: string; readonly title?: string; readonly parent?: string;
    readonly options?: { readonly type: string; readonly name: string; readonly colour?: string };
  };
  readonly rows: { readonly type: string };
  readonly cells: { readonly type: string; readonly column: string; readonly items?: string };
  /** `settings` are the types that store a view's settings, by their role. */
  readonly views: { readonly type: string; readonly name: string; readonly active?: string; readonly settings: Readonly<Record<string, string>> };
  readonly valueTypes: Readonly<Record<string, ValueType>>;
}

/** The levels or the entries of a hierarchy (DESL 7.7): their type, and its title and description attributes. */
export interface HierarchyMembers {
  readonly type: string;
  readonly title: string;
  readonly description: string;
}

/** A label attribute of a hierarchy (DESL 7.7, 7.7.2): the types it is on, the list its values name members of, and its filter words' prefix. */
export interface HierarchyLabel {
  readonly attribute: string;
  readonly on: readonly string[];
  readonly options: { readonly type: string; readonly name: string; readonly colour?: string };
  /** What a filter's word for one of its members starts with (DESL 7.7.3): by default the attribute's name and `:`. */
  readonly prefix: string;
  /** Whether it holds several values. */
  readonly many: boolean;
}

/** The `hierarchy` kind (DESL 7.7): levels drawn as boxes that contain boxes, the entries they hold, labels, notes and stored filters. */
export interface HierarchySurface {
  readonly kind: 'hierarchy';
  readonly levels: HierarchyMembers;
  readonly entries: HierarchyMembers;
  /** By attribute, in the order the surface names them. */
  readonly labels: Readonly<Record<string, HierarchyLabel>>;
  readonly notes?: { readonly type: string; readonly about: string; readonly kind: string; readonly text: string; readonly detail: string; readonly resolved: string };
  /** The `bool` attribute of the levels' and the entries' types that folds one. */
  readonly collapsed?: string;
  readonly filters?: { readonly type: string; readonly name: string; readonly query: string };
  readonly widths?: { readonly type: string; readonly level: string; readonly width: string };
  /** Whether an element's id is shown beside its title. */
  readonly ids: 'shown' | 'hidden';
}

/** A surface of one of the kinds this host lays out. */
export type Surface = TableSurface | HierarchySurface;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

/**
 * Interprets `surface`, with the name checks of DESL 10.1, step 4. A surface of a kind this host
 * does not lay out, and one that names a type or an attribute the metamodel does not have, is not
 * read: there is then nothing to show a document on, and the finding says why.
 */
export function interpretSurface(declared: unknown, metamodel: Metamodel, locale = 'en'): Loaded<Surface | undefined> {
  if (!isObject(declared)) return { value: undefined, findings: [] };
  if (declared.kind === 'table') return interpretTable(declared, metamodel, locale);
  if (declared.kind === 'hierarchy') return interpretHierarchy(declared, metamodel);
  return { value: undefined, findings: [finding('desl.unsupported-kind', 'error', `This tool lays its documents out as \`${String(declared.kind)}\`, and this host lays out a \`table\` or a \`hierarchy\` only, so its documents cannot be shown.`)] };
}

/** What both kinds check of the names a surface uses (DESL 10.1, step 4), each problem a `desl.surface` finding. */
function namesOf(metamodel: Metamodel, findings: Finding[]) {
  const problem = (message: string): void => void findings.push(finding('desl.surface', 'error', message));
  /** A type the surface names, which is a type of the metamodel. */
  const typed = (where: string, name: unknown): string => {
    if (typeof name !== 'string' || !Object.hasOwn(metamodel.types, name)) problem(`The surface names \`${String(name)}\` as ${where}, which is not a type of this tool.`);
    return String(name);
  };
  /** An attribute the surface names, which is an attribute of the type it is named for, or of the document for no type. */
  const attribute = (where: string, type: string | undefined, name: unknown, required = false): string | undefined => {
    if (name === undefined && !required) return undefined;
    const known = type === undefined ? metamodel.diagram : attributesOf(metamodel, type);
    if (typeof name !== 'string' || !Object.hasOwn(known, name)) problem(`The surface names \`${String(name)}\` as ${where}, which is not an attribute of ${type === undefined ? 'the document' : `\`${type}\``}.`);
    return String(name);
  };
  return { problem, typed, attribute };
}

function interpretTable(declared: Readonly<Record<string, unknown>>, metamodel: Metamodel, locale: string): Loaded<TableSurface | undefined> {
  const findings: Finding[] = [];
  const { problem, typed, attribute } = namesOf(metamodel, findings);
  const part = (name: string): Record<string, unknown> => (isObject(declared[name]) ? declared[name] : {});

  const columns = part('columns');
  const columnType = typed('the type of its columns', columns.type);
  const options = isObject(columns.options) ? columns.options : undefined;
  const optionType = options && typed('the type of a column\'s options', options.type);
  const rows = { type: typed('the type of its rows', part('rows').type) };
  const cells = part('cells');
  const cellType = typed('the type of its cells', cells.type);
  const itemType = cells.items === undefined ? undefined : typed('the type of a cell\'s items', cells.items);
  const views = part('views');
  const viewType = typed('the type of its views', views.type);
  const active = attribute('the view a document was last left in', undefined, views.active);
  const settings: Record<string, string> = {};
  for (const [role, type] of Object.entries(isObject(views.settings) ? views.settings : {})) settings[role] = typed(`the type of a view's \`${role}\``, type);

  const valueTypes: Record<string, ValueType> = {};
  for (const [id, entry] of Object.entries(isObject(declared.valueTypes) ? declared.valueTypes : {})) {
    if (!isObject(entry)) continue;
    const many = entry.many === true;
    if (many && itemType === undefined) problem(`The value type \`${id}\` holds several values, and the surface names no type for a cell's items.`);
    const key = attribute(`the key of the value type \`${id}\``, many ? itemType ?? cellType : cellType, entry.key, true)!;
    if (typeof entry.editor !== 'string' || !editors.includes(entry.editor)) problem(`The value type \`${id}\` is edited by \`${String(entry.editor)}\`, which is no editor of DESL.`);
    valueTypes[id] = {
      id, label: localized(entry.label as LocalizedText | undefined, locale) ?? id, key, many, editor: entry.editor as Editor,
      comparisons: Array.isArray(entry.comparisons) ? entry.comparisons.filter((comparison): comparison is string => typeof comparison === 'string') : [],
      sort: text(entry.sort) ?? 'text',
      converts: Object.fromEntries(Object.entries(isObject(entry.converts) ? entry.converts : {}).filter((conversion): conversion is [string, string] => typeof conversion[1] === 'string')),
    };
  }

  const title = attribute('the attribute that marks the title column', columnType, columns.title);
  const parent = attribute('the attribute that marks the parent column', columnType, columns.parent);
  const colour = options && optionType !== undefined ? attribute('the colour of an option', optionType, options.colour) : undefined;
  const surface: TableSurface = {
    kind: 'table',
    columns: {
      type: columnType,
      name: attribute('the name of a column', columnType, columns.name, true)!,
      valueType: attribute('the value type of a column', columnType, columns.valueType, true)!,
      ...(title === undefined ? {} : { title }),
      ...(parent === undefined ? {} : { parent }),
      ...(options && optionType !== undefined ? { options: { type: optionType, name: attribute('the name of an option', optionType, options.name, true)!, ...(colour === undefined ? {} : { colour }) } } : {}),
    },
    rows,
    cells: { type: cellType, column: attribute('the column of a cell', cellType, cells.column, true)!, ...(itemType === undefined ? {} : { items: itemType }) },
    views: { type: viewType, name: attribute('the name of a view', viewType, views.name, true)!, ...(active === undefined ? {} : { active }), settings },
    valueTypes,
  };
  return { value: findings.length > 0 ? undefined : surface, findings };
}

/**
 * The `hierarchy` kind (DESL 7.7) with the checks of DESL 10.1, step 4: every type a role names is a
 * type of the metamodel and every attribute an attribute of its type, of the type the role needs;
 * the levels' type contains itself and the entries' type; each label is on every type of its `on`,
 * which are the levels' and the entries' types; `collapsed` is on both.
 */
function interpretHierarchy(declared: Readonly<Record<string, unknown>>, metamodel: Metamodel): Loaded<HierarchySurface | undefined> {
  const findings: Finding[] = [];
  const { problem, typed, attribute } = namesOf(metamodel, findings);
  const part = (name: string): Readonly<Record<string, unknown>> | undefined => (isObject(declared[name]) ? declared[name] : undefined);
  /** The primitive of an attribute of a type, or the kind of value it holds, when both are known. */
  const typeOf = (type: string, name: string | undefined): string | undefined => {
    const known = name === undefined ? undefined : attributesOf(metamodel, type)[name];
    if (!known) return undefined;
    const kind = valueKind(metamodel, known.type);
    return kind.kind === 'primitive' ? kind.primitive : kind.kind;
  };
  /** An attribute the surface names, which holds what the role needs. */
  const ofType = (where: string, type: string, name: unknown, wanted: readonly string[], required = true): string | undefined => {
    const found = attribute(where, type, name, required);
    const actual = typeOf(type, found);
    if (found !== undefined && actual !== undefined && !wanted.includes(actual)) problem(`The surface names \`${found}\` of \`${type}\` as ${where}, which is ${actual === 'enum' ? 'an enumeration' : `a \`${actual}\``}, not ${wanted.map((one) => (one === 'enum' ? 'an enumeration' : `a \`${one}\``)).join(' or ')}.`);
    return found;
  };
  const members = (role: 'levels' | 'entries'): HierarchyMembers => {
    const written = part(role) ?? {};
    const type = typed(`the type of its ${role}`, written.type);
    return {
      type,
      title: ofType(`the title of its ${role}`, type, written.title, ['string']) ?? '',
      description: ofType(`the description of its ${role}`, type, written.description, ['text', 'string']) ?? '',
    };
  };
  const levels = members('levels');
  const entries = members('entries');
  const contains = (parent: string, child: string): boolean => {
    const children = metamodel.types[parent]?.declared.children;
    const allowed = isObject(children) && Array.isArray(children.allowed) ? children.allowed : [];
    return allowed.some((type) => typeof type === 'string' && isA(metamodel, child, type));
  };
  if (Object.hasOwn(metamodel.types, levels.type) && Object.hasOwn(metamodel.types, entries.type) && (!contains(levels.type, levels.type) || !contains(levels.type, entries.type))) {
    problem(`The levels of the surface, \`${levels.type}\`, do not contain themselves and its entries, \`${entries.type}\`.`);
  }
  const roles = [levels.type, entries.type];

  const labels: Record<string, HierarchyLabel> = {};
  for (const [name, written] of Object.entries(part('labels') ?? {})) {
    if (!isObject(written)) continue;
    const on = Array.isArray(written.on) ? written.on.filter((type): type is string => typeof type === 'string') : [];
    if (on.length === 0) problem(`The label \`${name}\` is on no type.`);
    let many = false;
    for (const type of on) {
      if (!roles.includes(type)) problem(`The label \`${name}\` is on \`${type}\`, which is neither the levels' type nor the entries'.`);
      const found = ofType('a label', type, name, ['string']);
      many ||= found !== undefined && attributesOf(metamodel, type)[found]?.many === true;
    }
    const options = isObject(written.options) ? written.options : {};
    const optionType = typed(`the type of the members \`${name}\` names`, options.type);
    const colour = attribute(`the colour of a member \`${name}\` names`, optionType, options.colour);
    labels[name] = {
      attribute: name, on, many,
      options: { type: optionType, name: attribute(`the name of a member \`${name}\` names`, optionType, options.name, true) ?? '', ...(colour === undefined ? {} : { colour }) },
      prefix: typeof written.prefix === 'string' && written.prefix !== '' ? written.prefix : `${name}:`,
    };
  }

  const notesPart = part('notes');
  let notes: HierarchySurface['notes'];
  if (notesPart) {
    const type = typed('the type of its notes', notesPart.type);
    const about = ofType('what a note is about', type, notesPart.about, ['string']) ?? '';
    if (Object.hasOwn(attributesOf(metamodel, type), about) && attributesOf(metamodel, type)[about].mentions === undefined) problem(`The surface names \`${about}\` as what a note is about, which has no mentions.`);
    notes = {
      type, about,
      kind: ofType('the kind of a note', type, notesPart.kind, ['enum']) ?? '',
      text: ofType('the text of a note', type, notesPart.text, ['string', 'text']) ?? '',
      detail: ofType('the detail of a note', type, notesPart.detail, ['string', 'text']) ?? '',
      resolved: ofType('whether a note is resolved', type, notesPart.resolved, ['bool']) ?? '',
    };
  }

  const collapsed = declared.collapsed === undefined ? undefined : String(declared.collapsed);
  if (collapsed !== undefined) for (const type of roles) ofType('what folds a level or an entry', type, collapsed, ['bool']);

  const filtersPart = part('filters');
  let filters: HierarchySurface['filters'];
  if (filtersPart) {
    const type = typed('the type of its stored filters', filtersPart.type);
    filters = { type, name: ofType('the name of a stored filter', type, filtersPart.name, ['string']) ?? '', query: ofType('the words of a stored filter', type, filtersPart.query, ['string', 'text']) ?? '' };
  }
  const widthsPart = part('widths');
  let widths: HierarchySurface['widths'];
  if (widthsPart) {
    const type = typed('the type of its column widths', widthsPart.type);
    widths = { type, level: ofType('the depth of a column', type, widthsPart.level, ['string']) ?? '', width: ofType('the width of a column', type, widthsPart.width, ['int']) ?? '' };
  }
  const ids = declared.ids ?? 'shown';
  if (ids !== 'shown' && ids !== 'hidden') problem(`The surface shows ids as \`${String(ids)}\`, which is neither \`shown\` nor \`hidden\`.`);

  const surface: HierarchySurface = {
    kind: 'hierarchy', levels, entries, labels,
    ...(notes === undefined ? {} : { notes }), ...(collapsed === undefined ? {} : { collapsed }),
    ...(filters === undefined ? {} : { filters }), ...(widths === undefined ? {} : { widths }),
    ids: ids === 'hidden' ? 'hidden' : 'shown',
  };
  return { value: findings.length > 0 ? undefined : surface, findings };
}
