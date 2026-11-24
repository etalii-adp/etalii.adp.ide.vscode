// The causal loop diagram's flow page (etalii.adp specs 074 and 082): one self-contained web page
// that animates the diagram as flows of influence, written beside its `.cld`. It is the desktop
// host's page byte for byte: `template.ts` is its template, copied unchanged, and this file is its
// generator, `flow_page.rs` of etalii.adp.ide.desktop, step for step (spec 082, research R2).
//
// `DATA` holds what the page reads: `v`, each variable as `[id, label, x, y, start, push]`; `l`, each
// link as `[from, to, sign, delayed, note, weight, flipped]`; `o`, each loop as `[id, name, [member ids]]`;
// `c`, the ids of the chart's series; and `p`, the dynamics and the heatmap reading. Every number is
// limited to the range of its control. A link that names no variable, and a loop whose links do not
// close it, are left out, since the page has no way to draw either.

import { elementaryCycles } from '../../disl/cycles';
import type { Attributes, Model, ModelElement, Value } from '../../disl/model';
import type { ExportLogic, ExportRequest } from '../../tool/pluginRegistry';
import { TEMPLATE } from './template';

/** Where the page's title and heading are written, HTML-escaped. */
const TITLE_MARKER = '/*FLOW_PAGE_TITLE*/';
/** Where the page's data is written. */
const DATA_MARKER = '/*FLOW_PAGE_DATA*/';
/** How many series the chart follows. */
const SERIES = 7;
/** How many cycles a diagram without declared loops lists at most, as the definition's cycle search is bounded. */
const CYCLE_BOUND = 1000;

const two = (value: number): string => String(value).padStart(2, '0');

/** The name of a page exported at `moment`, in local time: `FILENAME {yyyy-mm-dd hh.mm}.html` (spec 074, FR-004). */
export function pageName(stem: string, moment: Date): string {
  return `${stem} {${String(moment.getFullYear()).padStart(4, '0')}-${two(moment.getMonth() + 1)}-${two(moment.getDate())} ${two(moment.getHours())}.${two(moment.getMinutes())}}.html`;
}

/**
 * A number as Rust's `Display` writes an `f64`, which the desktop host's page holds: the shortest
 * digits that read back as the number, as JavaScript's own, but never with an exponent, and `-0` kept.
 */
export function numberText(value: number): string {
  if (Object.is(value, -0)) return '-0';
  const shortest = String(value);
  const exponent = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(shortest);
  if (!exponent) return shortest;
  const [, sign, lead, rest = '', power] = exponent;
  const digits = lead + rest;
  const point = 1 + Number(power);
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** `text` as a JSON string that is safe inside a script element: `<`, `>`, `&` and the two line separators JavaScript reads as line endings are written as `\uXXXX`. */
export function jsonText(text: string): string {
  let written = '"';
  for (const c of text) {
    const code = c.codePointAt(0)!;
    if (c === '"') written += '\\"';
    else if (c === '\\') written += '\\\\';
    else if (c === '<' || c === '>' || c === '&' || code === 0x2028 || code === 0x2029 || code < 0x20) written += `\\u${code.toString(16).padStart(4, '0')}`;
    else written += c;
  }
  return `${written}"`;
}

/** `text` as HTML text, for the page's title and heading. */
export function htmlEscaped(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\'', '&#39;');
}

const textOf = (attributes: Attributes, name: string): string => {
  const value = attributes[name];
  return typeof value === 'string' ? value : '';
};
const numberOf = (value: Value | undefined): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const limited = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

/** A link's sign: -1 for a negative link, else 1, a link of unstated polarity included. */
const signOf = (link: ModelElement): number => (textOf(link.attributes, 'polarity') === 'negative' ? -1 : 1);

/** A link's starting strength (spec 074, FR-027): its weight's size limited to 0 to 3; 1 for a link without one. */
const startingStrength = (link: ModelElement): number => {
  const weight = numberOf(link.attributes.weight);
  return weight === undefined ? 1 : limited(Math.abs(weight), 0, 3);
};

type Loop = readonly [id: string, name: string, members: readonly string[]];

/** The page's `DATA`, as one line of JSON whose keys are in one order. */
function data(model: Model, centres: ExportRequest['centres']): string {
  const variables = model.elements.filter((element) => element.type === 'Variable');
  const links = model.relations.filter((relation) => relation.type === 'CausalLink');
  const declared = new Set(variables.map((variable) => textOf(variable.attributes, 'name')));
  // The first variable of a name is the one read, as the desktop host's model reads it.
  const distinct = variables.filter((variable, index) => variables.findIndex((other) => textOf(other.attributes, 'name') === textOf(variable.attributes, 'name')) === index);

  const variableTexts = distinct.map((variable) => {
    const name = textOf(variable.attributes, 'name');
    const label = textOf(variable.attributes, 'label');
    const at = centres[`variable:${name}`] ?? { x: 0, y: 0 };
    return `[${jsonText(name)},${jsonText(label === '' ? name : label)},${numberText(at.x)},${numberText(at.y)},${numberText(limited(numberOf(variable.attributes.start) ?? 0.5, 0, 1))},${numberText(limited(numberOf(variable.attributes.push) ?? 0, -4, 4))}]`;
  });

  const drawn = links.filter((link) => declared.has(textOf(link.attributes, 'causeName')) && declared.has(textOf(link.attributes, 'effectName')));
  const linkTexts = drawn.map((link) =>
    `[${jsonText(textOf(link.attributes, 'causeName'))},${jsonText(textOf(link.attributes, 'effectName'))},${signOf(link)},${link.attributes.delayed === true ? 1 : 0},${jsonText(textOf(link.attributes, 'note'))},${numberText(startingStrength(link))},${link.attributes.flipped === true ? 1 : 0}]`);

  // The sign of the first link between two variables, by their names.
  const signs = new Map<string, number>();
  for (const link of drawn) {
    const key = `${textOf(link.attributes, 'causeName')}\u0000${textOf(link.attributes, 'effectName')}`;
    if (!signs.has(key)) signs.set(key, signOf(link));
  }
  const pair = (from: string, to: string): string => `${from}\u0000${to}`;
  const closes = (members: readonly string[]): boolean => members.length > 0 && members.every((member, index) => signs.has(pair(member, members[(index + 1) % members.length])));

  const byId = new Map(model.elements.map((element) => [element.id, element]));
  const stated = model.elements.filter((element) => element.type === 'Loop');
  let loops: Loop[] = stated.flatMap((loop): Loop[] => {
    const members = memberNames(loop, byId);
    return members !== undefined && closes(members) ? [[textOf(loop.attributes, 'identifier'), textOf(loop.attributes, 'title'), members]] : [];
  });
  if (stated.length === 0) loops = foundCycles(distinct, links, declared, signs, pair);

  const inLoops = new Map<string, number>();
  for (const [, , members] of loops) for (const member of members) inLoops.set(member, (inLoops.get(member) ?? 0) + 1);
  const order = distinct.map((variable) => textOf(variable.attributes, 'name'));
  const chart = [...order].sort((a, b) => (inLoops.get(b) ?? 0) - (inLoops.get(a) ?? 0)).slice(0, SERIES).map(jsonText);

  const loopTexts = loops.map(([id, name, members]) => `[${jsonText(id)},${jsonText(name)},[${members.map(jsonText).join(',')}]]`);

  const setting = (name: string, fallback: number, low: number, high: number): string => numberText(limited(numberOf(model.diagram[name]) ?? fallback, low, high));
  const reading = textOf(model.diagram, 'heatmap');
  const heatmap = reading === 'pressure' || reading === 'throughput' || reading === 'level' ? reading : 'backlog';
  return `{"c":[${chart.join(',')}],"l":[${linkTexts.join(',')}],"o":[${loopTexts.join(',')}],"p":{"delayLength":${setting('delayLength', 5, 1, 12)},"density":${setting('density', 3, 0.5, 8)},"heatmap":${jsonText(heatmap)},"inertia":${setting('inertia', 1.2, 0.2, 5)},"speed":${setting('speed', 1, 0.1, 4)},"strength":${setting('strength', 3, 0.5, 8)}},"v":[${variableTexts.join(',')}]}`;
}

/** The names of the variables a loop runs through; nothing when one of them is no variable. */
function memberNames(loop: ModelElement, byId: ReadonlyMap<string, ModelElement>): string[] | undefined {
  const members = loop.attributes.members;
  if (!Array.isArray(members)) return undefined;
  const names: string[] = [];
  for (const member of members as readonly Value[]) {
    const element = typeof member === 'string' ? byId.get(member) : undefined;
    if (!element) return undefined;
    names.push(textOf(element.attributes, 'name'));
  }
  return names;
}

/**
 * The cycles the host finds in a diagram that declares no loops, as the causal loop diagram's cycle
 * finder finds them, named by their kind's letter and counted per kind, as the host claims a loop,
 * with the path of their variables' captions as their name.
 */
function foundCycles(distinct: readonly ModelElement[], links: readonly ModelElement[], declared: ReadonlySet<string>, signs: ReadonlyMap<string, number>, pair: (from: string, to: string) => string): Loop[] {
  const names = distinct.map((variable) => textOf(variable.attributes, 'name'));
  const captions = new Map(distinct.map((variable) => [textOf(variable.attributes, 'name'), textOf(variable.attributes, 'label') || textOf(variable.attributes, 'name')]));
  const successors = new Map<string, string[]>();
  for (const link of links) {
    const [cause, effect] = [textOf(link.attributes, 'causeName'), textOf(link.attributes, 'effectName')];
    if (declared.has(cause) && declared.has(effect)) (successors.get(cause) ?? successors.set(cause, []).get(cause)!).push(effect);
  }
  let reinforcing = 0;
  let balancing = 0;
  return elementaryCycles(names, successors, CYCLE_BOUND).cycles.map((cycle): Loop => {
    const negative = cycle.filter((member, index) => (signs.get(pair(member, cycle[(index + 1) % cycle.length])) ?? 1) < 0).length;
    const id = negative % 2 === 0 ? `R${++reinforcing}` : `B${++balancing}`;
    return [id, cycle.map((member) => captions.get(member) ?? member).join(' → '), cycle];
  });
}

/** The flow page of a diagram, whose file name without its extension is `stem`. */
export function flowPage(request: ExportRequest): string {
  const stated = textOf(request.model.diagram, 'title');
  const title = stated === '' ? request.stem : stated;
  const written = data(request.model, request.centres);
  let page = '';
  let rest = TEMPLATE;
  for (;;) {
    const marks = [TITLE_MARKER, DATA_MARKER].map((marker) => ({ marker, at: rest.indexOf(marker) })).filter((mark) => mark.at >= 0).sort((a, b) => a.at - b.at);
    if (marks.length === 0) break;
    const [{ marker, at }] = marks;
    page += rest.slice(0, at) + (marker === TITLE_MARKER ? htmlEscaped(title) : written);
    rest = rest.slice(at + marker.length);
  }
  return page + rest;
}

/** What the causal loop diagram exports: its flow page, as the desktop host's ribbon offers it. */
export const cldFlowPage: ExportLogic = {
  id: 'systems/causal-loop-diagram',
  exports: [{ id: 'flowPage', label: 'Export flow page', name: pageName, write: flowPage }],
};
