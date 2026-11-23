// What a designer of the `sections` kind shows and what a gesture on it asks (DESL 7.8): one page of
// titled parts, each the fields of one element or a list of the elements of one type, with an
// order, groups, figures, marks and a read-only time strip, and selection shared across the parts.
// A sections view is plain data, as a table view is: it crosses to the webview as JSON, and holds
// nothing of a definition beyond the ids, the names and the values the document and the
// definition give, and which operation of the definition each gesture runs.

import { mentioned, mentionsIn, type Mentions } from '../desl/mentions';
import type { DesignerOperation, RunStep } from '../desl/operations';
import type { FieldWidget, SectionsField, SectionsPart, SectionsSurface } from '../desl/surface';
import { shownText, timestampOf, type Expressions, type World } from '../disl/expressions';
import type { Metamodel } from '../disl/metamodel';
import { finding, type Finding, type Model, type ModelElement, type Value } from '../disl/model';
import type { Control, Field, Severity } from '../frame/toolType';

/** An operation a part or a row offers, and whether it can run now. */
export interface SectionsOperation {
  readonly operation: string;
  readonly label: string;
  readonly enabled: boolean;
  /** Why it cannot run now. */
  readonly reason?: string;
  /** What it asks before it runs, each typed as text. */
  readonly params?: readonly { readonly name: string; readonly label: string; readonly required: boolean }[];
}

/** A field as the page shows it: its attribute, label and editor. */
export interface SectionsFieldView {
  readonly attribute: string;
  readonly label: string;
  readonly widget: FieldWidget;
  readonly many: boolean;
  readonly options?: readonly string[];
}

/** A finding about the element a row or a record shows. */
export interface SectionsFinding {
  readonly rule: string;
  readonly severity: Severity;
  readonly message: string;
}

/** A row of a list, or the element of a record: its id (empty for the document), the text of each field, and what is marked and related. */
export interface SectionsRow {
  readonly id: string;
  /** Each field's value as text: a list's items between commas, a bool `true` or `false`, nothing as the empty text. */
  readonly values: Readonly<Record<string, string>>;
  readonly marks: readonly { readonly id: string; readonly label: string; readonly style: 'info' | 'warning' }[];
  /** The elements it mentions and those that mention it (DESL 7.8.2), highlighted while it is selected. */
  readonly related: readonly string[];
  readonly operations: readonly SectionsOperation[];
  readonly findings: readonly SectionsFinding[];
}

/** A figure beside a part's title: its value in its written form, or the specification's text for no value. */
export interface SectionsFigureView {
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly absent: boolean;
}

/** The time strip of a list (DESL 7.8.3): its axis, a mark for each row with a time, and the rows with none. */
export interface SectionsTimeStrip {
  /** The earliest and the latest time, as written. */
  readonly from: string;
  readonly to: string;
  readonly marks: readonly { readonly row: string; readonly at: string; readonly offset: number; readonly emphasised: boolean; readonly label?: string }[];
  readonly untimed: readonly string[];
}

/** One part of the page. */
export interface SectionsPartView {
  readonly id: string;
  readonly title: string;
  readonly kind: 'record' | 'list';
  readonly type: string;
  readonly fields: readonly SectionsFieldView[];
  readonly figures: readonly SectionsFigureView[];
  /** A record's element; empty values where the document has none yet. */
  readonly record?: SectionsRow;
  /** A list's rows, in their order, under their groups; one group without a key where the list has no `group`. */
  readonly groups?: readonly { readonly key?: string; readonly count: number; readonly rows: readonly SectionsRow[] }[];
  readonly add?: SectionsOperation;
  readonly timeStrip?: SectionsTimeStrip;
}

export interface SectionsView {
  readonly name: string;
  readonly readOnly: boolean;
  readonly notice?: string;
  readonly parts: readonly SectionsPartView[];
}

/** What a gesture on a page of sections asks. */
export type SectionsRequest =
  | { readonly kind: 'operation'; readonly operation: string; readonly on?: readonly string[]; readonly args?: Readonly<Record<string, string | number | boolean | null>> }
  /** A field of a row or a record given a value, as the text its editor holds: `id` is empty for the document. */
  | { readonly kind: 'setField'; readonly id: string; readonly field: string; readonly value: string };

/** What the view is made with beside the model. */
export interface SectionsState {
  readonly name: string;
  readonly readOnly: boolean;
  readonly notice?: string;
  /** The findings of the document, by the element each is about. */
  readonly findings: readonly { readonly rule: string; readonly severity: Severity; readonly message: string; readonly element?: string }[];
  availability(operation: string, on: readonly string[]): { readonly offered: boolean; readonly available: boolean; readonly reason?: string; readonly label?: string };
}

export interface SectionsReaderOptions {
  readonly surface: SectionsSurface;
  readonly metamodel: Metamodel;
  readonly expressions: Expressions;
  readonly operations: readonly DesignerOperation[];
  readonly mentions: Mentions;
}

/** The operation that sets a field of a part's type: no identifier of DESL, so none of a specification's (DESL 10.3, the quick change of a value). */
export const fieldOperation = (type: string, attribute: string): string => `:${type}.${attribute}`;

const NOT_A_FIELD = 'This value cannot be changed here.';
const GONE = 'That is no longer in this file.';

/** A stored value as the text of a field. */
const textOf = (value: Value | undefined): string =>
  (value === undefined || value === null ? '' : Array.isArray(value) ? value.map((item) => textOf(item)).join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value));

/** The control ADP Properties shows a field with. */
const controls: Readonly<Record<FieldWidget, Control>> = { text: 'text', number: 'number', checkbox: 'choice', date: 'text', dateTime: 'text', time: 'text', choice: 'choice', choices: 'tags' };

/**
 * The reader of a page of sections: the view of a model, the rows of ADP Properties for a selected
 * row or record, the steps that give a field a value, and the findings DESL asks of the page itself.
 */
export function sectionsReader({ surface, metamodel, expressions, operations, mentions }: SectionsReaderOptions) {
  const evaluated = (world: World, expression: string, self?: string): { readonly ok: boolean; readonly raw: unknown } => {
    const result = expressions.evaluate(expression, world.scope(self, { document: world.diagram }));
    return result.ok ? { ok: true, raw: result.raw } : { ok: false, raw: undefined };
  };
  const plainOf = (raw: unknown): unknown => (typeof raw === 'bigint' ? Number(raw) : raw instanceof Date ? raw.getTime() : raw);
  const holds = (world: World, expression: string | undefined, self: string): boolean => expression !== undefined && evaluated(world, expression, self).raw === true;

  /** What each element mentions and what mentions it, by id (DESL 7.8.2). */
  function relationsOf(model: Model): Map<string, Set<string>> {
    const related = new Map<string, Set<string>>();
    const relate = (one: string, other: string): void => {
      if (one === other) return;
      for (const [from, to] of [[one, other], [other, one]]) {
        if (!related.has(from)) related.set(from, new Set());
        related.get(from)!.add(to);
      }
    };
    for (const element of model.elements) {
      for (const facet of mentions.facets.filter((candidate) => candidate.type === element.type)) {
        const value = element.attributes[facet.attribute];
        const texts = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : typeof value === 'string' ? [value] : [];
        for (const text of texts) {
          for (const mention of mentionsIn(text, facet)) {
            const target = mentioned(model, facet, metamodel, mention.id);
            if (target) relate(element.id, target.id);
          }
        }
      }
    }
    return related;
  }

  const fieldsOf = (part: SectionsPart): SectionsFieldView[] => part.fields.map(({ attribute, label, widget, many, options }) => ({ attribute, label, widget, many, ...(options ? { options } : {}) }));
  const offered = (state: SectionsState, operation: DesignerOperation, on: readonly string[]): SectionsOperation | undefined => {
    const now = state.availability(operation.id, on);
    if (!now.offered) return undefined;
    const label = now.label ?? operation.id;
    const params = operation.params.map(({ name, label: asked, required }) => ({ name, label: asked, required }));
    return { operation: operation.id, label, enabled: now.available && !state.readOnly, ...(now.available ? {} : { reason: now.reason ?? `${label} cannot be done now.` }), ...(params.length === 0 ? {} : { params }) };
  };

  function view(model: Model, state: SectionsState): SectionsView {
    const world = expressions.over(model);
    const related = relationsOf(model);
    const findingsOf = (id: string): SectionsFinding[] => state.findings.filter((found) => found.element === id).map(({ rule, severity, message }) => ({ rule, severity, message }));
    const rowOf = (part: SectionsPart, element: ModelElement | undefined): SectionsRow => {
      const id = element?.id ?? '';
      const attributes = part.document ? model.diagram : element?.attributes ?? {};
      return {
        id,
        values: Object.fromEntries(part.fields.map((field) => [field.attribute, textOf(attributes[field.attribute])])),
        marks: element ? part.marks.filter((mark) => holds(world, mark.when, element.id)).map(({ id: mark, label, style }) => ({ id: mark, label, style })) : [],
        related: [...(related.get(id) ?? [])],
        operations: element ? operations.filter((operation) => operation.id !== part.add).flatMap((operation) => offered(state, operation, [element.id]) ?? []) : [],
        findings: element ? findingsOf(element.id) : [],
      };
    };

    const parts = surface.parts.map((part): SectionsPartView => {
      const figures = part.figures.map((figure): SectionsFigureView => {
        const result = evaluated(world, figure.value);
        const text = result.ok ? shownText(result.raw) : undefined;
        return { id: figure.id, label: figure.label, text: text ?? figure.absentText ?? '', absent: text === undefined };
      });
      const shown = { id: part.id, title: part.title, kind: part.kind, type: part.type, fields: fieldsOf(part), figures };
      const elements = part.document ? [] : model.elements.filter((element) => element.type === part.type);
      if (part.kind === 'record') return { ...shown, record: rowOf(part, elements[0]) };

      // The order and the groups are the page's; the file keeps its own (DESL 7.8.2).
      const keyed = elements.map((element, index) => ({ element, index, key: part.order === undefined ? undefined : plainOf(evaluated(world, part.order, element.id).raw) }));
      const compare = (a: unknown, b: unknown): number => (a === b ? 0 : a === undefined ? 1 : b === undefined ? -1 : (a as number | string) < (b as number | string) ? -1 : (a as number | string) > (b as number | string) ? 1 : 0);
      const ordered = keyed.sort((a, b) => compare(a.key, b.key) || a.index - b.index).map(({ element }) => element);
      const groups: { key?: string; count: number; rows: SectionsRow[] }[] = [];
      for (const element of ordered) {
        const key = part.group === undefined ? undefined : shownText(evaluated(world, part.group, element.id).raw) ?? '';
        let group = groups.find((candidate) => candidate.key === key);
        if (!group) groups.push(group = { ...(key === undefined ? {} : { key }), count: 0, rows: [] });
        group.count += 1;
        group.rows.push(rowOf(part, element));
      }
      if (groups.length === 0 && part.group === undefined) groups.push({ count: 0, rows: [] });

      const adding = part.add === undefined ? undefined : operations.find((operation) => operation.id === part.add);
      const add = adding && offered(state, adding, []);
      return { ...shown, groups, ...(add ? { add } : {}), ...(part.timeStrip ? { timeStrip: stripOf(part, ordered, world) } : {}) };
    });
    return { name: state.name, readOnly: state.readOnly, ...(state.notice === undefined ? {} : { notice: state.notice }), parts };
  }

  function stripOf(part: SectionsPart, rows: readonly ModelElement[], world: World): SectionsTimeStrip {
    const strip = part.timeStrip!;
    const timed: { readonly row: ModelElement; readonly at: string; readonly time: number }[] = [];
    const untimed: string[] = [];
    for (const row of rows) {
      const value = row.attributes[strip.at];
      const time = typeof value === 'string' ? timestampOf(value)?.getTime() : undefined;
      if (time === undefined) untimed.push(row.id);
      else timed.push({ row, at: value as string, time });
    }
    if (timed.length === 0) return { from: '', to: '', marks: [], untimed };
    const first = timed.reduce((a, b) => (b.time < a.time ? b : a));
    const last = timed.reduce((a, b) => (b.time > a.time ? b : a));
    const span = last.time - first.time;
    return {
      from: first.at, to: last.at, untimed,
      marks: timed.map(({ row, at, time }) => {
        const emphasised = holds(world, strip.highlight, row.id);
        const label = emphasised && strip.label !== undefined ? shownText(evaluated(world, strip.label, row.id).raw) : undefined;
        return { row: row.id, at, offset: span === 0 ? 0 : (time - first.time) / span, emphasised, ...(label === undefined ? {} : { label }) };
      }),
    };
  }

  /** The part a selected element is shown in, and its element: the first that shows its type. */
  const partOf = (model: Model, id: string): { readonly part: SectionsPart; readonly element?: ModelElement } | undefined => {
    if (id === '') {
      const part = surface.parts.find((candidate) => candidate.document);
      return part && { part };
    }
    const element = model.elements.find((candidate) => candidate.id === id);
    const part = element && surface.parts.find((candidate) => !candidate.document && candidate.type === element.type);
    return part && { part, element };
  };

  /** The rows of ADP Properties for a selected row or record: its fields, each with the control of its editor. */
  function fields(model: Model, id: string, readOnly?: string): Field[] {
    const found = partOf(model, id);
    if (!found) return [];
    const parts = id === '' ? surface.parts.filter((candidate) => candidate.document) : [found.part];
    return parts.flatMap((part) => part.fields.map((field): Field => {
      const value = (part.document ? model.diagram : found.element?.attributes ?? {})[field.attribute];
      const options = field.widget === 'checkbox' ? ['', 'true', 'false'] : field.widget === 'choice' ? ['', ...(field.options ?? [])] : field.widget === 'choices' ? [...(field.options ?? [])] : undefined;
      return {
        id: field.attribute, label: field.label, group: parts.length > 1 ? part.title : '', control: controls[field.widget],
        value: textOf(value), ...(options ? { options } : {}), ...(readOnly === undefined ? {} : { readOnly }),
      };
    }));
  }

  /**
   * The step that gives a field the value its editor holds: the field's own quick change, with the
   * text read as its widget takes it. The empty text clears the field.
   */
  function fieldSteps(model: Model, id: string, attribute: string, text: string): readonly RunStep[] | { readonly refused: string } {
    const found = partOf(model, id);
    if (!found) return { refused: GONE };
    const field: SectionsField | undefined = (id === '' ? surface.parts.filter((candidate) => candidate.document) : [found.part]).flatMap((part) => part.fields).find((candidate) => candidate.attribute === attribute);
    if (!field) return { refused: NOT_A_FIELD };
    const typed = text.trim();
    const step = (value: Value | undefined): readonly RunStep[] => [{ operation: fieldOperation(found.part.type, attribute), on: id === '' ? [] : [id], args: value === undefined ? {} : { value } }];
    if (typed === '') return step(undefined);
    if (field.many) return step(typed.split(',').map((item) => item.trim()).filter((item) => item !== ''));
    switch (field.widget) {
      case 'number': return Number.isFinite(Number(typed)) ? step(Number(typed)) : { refused: `\`${typed}\` is not a number.` };
      case 'checkbox': return typed === 'true' || typed === 'false' ? step(typed === 'true') : { refused: `${field.label} is \`true\` or \`false\`.` };
      case 'choice': return field.options?.includes(typed) ? step(typed) : { refused: `\`${typed}\` is not one of ${(field.options ?? []).join(', ')}.` };
      case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(typed) && timestampOf(typed) ? step(typed) : { refused: `${field.label} is a date written as 2026-11-30.` };
      case 'dateTime': return /T/.test(typed) && timestampOf(typed) ? step(typed) : { refused: `${field.label} is a date and time with its offset, written as 2026-11-03T10:12+01:00.` };
      case 'time': return /^\d{2}:\d{2}(:\d{2})?$/.test(typed) ? step(typed) : { refused: `${field.label} is a time written as 10:12.` };
      default: return step(field.widget === 'text' ? text : typed);
    }
  }

  /** What DESL asks a host to report of the page itself: each element of a record's type after the first (DESL 7.8.2). */
  function findings(model: Model, file = ''): Finding[] {
    return surface.parts.filter((part) => part.kind === 'record' && !part.document).flatMap((part) => model.elements.filter((element) => element.type === part.type).slice(1).map((element) =>
      finding('desl.second-record', 'warning', `${part.title} shows one \`${part.type}\`, and this is another: only the first is shown.`, { element: element.id, location: { file, line: element.line, column: 0, length: 0 } })));
  }

  return { view, fields, fieldSteps, findings };
}

export type SectionsReader = ReturnType<typeof sectionsReader>;
