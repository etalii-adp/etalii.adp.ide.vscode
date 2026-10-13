// The surface of a designer (DESL 7): which types and attributes of the metamodel play which part
// of the layout. DESL 0.1 has the one kind, `table`.

import { attributesOf, type Metamodel } from '../disl/metamodel';
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
export interface Surface {
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

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

/**
 * Interprets `surface`, with the name checks of DESL 10.1, step 4. A surface of a kind this host
 * does not lay out, and one that names a type or an attribute the metamodel does not have, is not
 * read: there is then nothing to show a document on, and the finding says why.
 */
export function interpretSurface(declared: unknown, metamodel: Metamodel, locale = 'en'): Loaded<Surface | undefined> {
  const findings: Finding[] = [];
  if (!isObject(declared)) return { value: undefined, findings };
  if (declared.kind !== 'table') {
    return { value: undefined, findings: [finding('desl.unsupported-kind', 'error', `This tool lays its documents out as \`${String(declared.kind)}\`, and this host lays out the kind \`table\` only, so its documents cannot be shown.`)] };
  }
  const problem = (message: string): void => void findings.push(finding('desl.surface', 'error', message));
  const part = (name: string): Record<string, unknown> => (isObject(declared[name]) ? declared[name] : {});

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
  const surface: Surface = {
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
