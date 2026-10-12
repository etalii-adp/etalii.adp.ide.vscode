// A definition as a tool type (etalii.adp spec 027, contracts/tool-type.md): the frame's contract
// made from a specification, its bindings and the plugins it may name, with nothing written for the
// tool type itself. A document is read through its binding by the FBL library and typed by the
// interpreter; a request is one intent of the interpreted behavior, whose changes the library plans
// as splices of the text. Every method is a function of its arguments.

import { applyChanges, baseCoordinate, interpretBehavior, type EndPlace, type Outcome, type Point, type Situation } from '../disl/behavior';
import { interpretConstraints } from '../disl/constraints';
import { interpretCoordinates, rulerRows } from '../disl/coordinates';
import { createExpressions } from '../disl/expressions';
import { createTexts, formFor, interpretForms, type FormItem, type Subject } from '../disl/forms';
import { interpretLayout } from '../disl/layout';
import { defaultOf, interpretMetamodel } from '../disl/metamodel';
import { emptyModel, type Finding as Found, type Model, type Value } from '../disl/model';
import { edgeNotation, interpretNotation, nodeNotation, styleOf, type Paint } from '../disl/notation';
import { foldsOf, interpretPersistence, readModel } from '../disl/persistence';
import { isCel, isObject, loadSpecification } from '../disl/specification';
import { groupsIn, interpretToolbox, type ToolGroup } from '../disl/toolbox';
import { interpretViewpoints } from '../disl/viewpoints';
import type { FblBinding } from '../fbl/documents/types';
import { findingCodes } from '../fbl/finding';
import { OpenBody } from '../fbl/history/openBody';
import { messages } from '../fbl/messages';
import type { FblModel } from '../fbl/model';
import { PluginBody } from '../fbl/plugins/pluginBody';
import { produceTemplate } from '../fbl/routing/templateWriter';
import type { Edit } from '../fbl/splice';
import { decode, encode } from '../fbl/text/utf8';
import type { Action, Control, DiagramToolType, EditOutcome, EditRequest, Field, Finding, Severity, Source, ToolboxEntry, ViewOptions } from '../frame/toolType';
import { arrangedRows, createScene, type Scene, type SceneChrome, type SceneOptions, type SceneRuler, type SceneTool, type SceneToken } from '../scene/scene';
import { widthOfText } from '../text/textMetric';
import { claimingBinding, claimsOf, suggests } from './claims';
import { readDefinitionFolder, type Definition } from './definitionFolder';
import { composedSplices, modelChangesOf } from './modelChanges';
import { missingPlugins, pluginReferences, type PluginRegistry } from './pluginRegistry';

// The host's own sentences, for what a definition has no words for.
const GONE = 'That is no longer in this diagram.';
const NO_ROW = 'This value cannot be changed here.';
const NO_TEXT = 'This text cannot be changed here.';
const NOT_HERE = 'This is not possible here.';
const UNREADABLE = 'The document could not be read, so it cannot be edited.';

const severities: Readonly<Record<string, Severity>> = { error: 'error', warning: 'warning', info: 'information', hint: 'hint' };
const controls: Readonly<Record<string, Control>> = {
  textarea: 'multiline', tags: 'tags', slider: 'slider', number: 'number', select: 'choice', segmented: 'choice', combobox: 'choice', checkbox: 'choice',
};

/** A finding of the interpreter or the library as the frame's: its line counted from zero. */
const framed = (found: Found): Finding => ({ rule: found.code, severity: severities[found.severity] ?? 'warning', message: found.message, line: Math.max(0, found.location.line - 1) });

/** An end as a request names it: `<part>/<side>/<at>`. */
function endOf(text: string | undefined): EndPlace | undefined {
  const [part, side, at, ...more] = (text ?? '').split('/');
  const along = Number(at);
  return part && side && at !== undefined && at.trim() !== '' && more.length === 0 && Number.isFinite(along) ? { part, side, at: along } : undefined;
}

/**
 * The specification with a layout that names a plugin the registry lacks given the algorithm the
 * plugin's `fallback` names (DISL 13.1).
 */
function withFallbacks(specification: Readonly<Record<string, unknown>>, fallbacks: ReadonlyMap<string, string>): Readonly<Record<string, unknown>> {
  const layout = specification.layout;
  if (fallbacks.size === 0 || !isObject(layout) || !isObject(layout.algorithms)) return specification;
  const algorithms = Object.fromEntries(Object.entries(layout.algorithms).map(([name, declared]) => {
    const plugin = isObject(declared) && typeof declared.algorithm === 'string' && declared.algorithm.startsWith('plugin:') ? declared.algorithm.slice(7) : undefined;
    return [name, plugin !== undefined && fallbacks.has(plugin) ? { ...(declared as object), algorithm: fallbacks.get(plugin) } : declared];
  }));
  return { ...specification, layout: { ...layout, algorithms } };
}

/** A definition, its bindings and the plugins it may name, as one tool type. Never throws. */
export function toolTypeFrom(definition: Definition, bindings: readonly FblBinding[], plugins: PluginRegistry): DiagramToolType {
  // ---- the definition, interpreted once ----

  const missing = missingPlugins(pluginReferences(definition.specification, bindings), plugins);
  const needed = missing.filter((reference) => reference.required);
  const fallbacks = new Map(missing.flatMap((reference) => (!reference.required && reference.fallback.layout !== undefined ? [[reference.id, reference.fallback.layout] as const] : [])));

  const loaded = loadSpecification(withFallbacks(definition.specification, fallbacks));
  const specification = loaded.value;
  const metamodel = interpretMetamodel(specification);
  const persistence = interpretPersistence(specification, metamodel.value);
  const expressions = createExpressions(specification, metamodel.value);
  const coordinates = interpretCoordinates(specification, metamodel.value);
  const notation = interpretNotation(specification, metamodel.value);
  const layout = interpretLayout(specification);
  const viewpoints = interpretViewpoints(specification, metamodel.value, { notation: notation.value, coordinates: coordinates.value, layout: layout.value });
  const constraints = interpretConstraints(specification, metamodel.value, expressions);
  const forms = interpretForms(specification, metamodel.value, expressions);
  const toolbox = interpretToolbox(specification, metamodel.value);
  const sceneTool: SceneTool = { metamodel: metamodel.value, expressions, coordinates: coordinates.value, viewpoints: viewpoints.value, layouts: (id) => plugins.layout(id) };
  // The core has no browser to measure a text with: for a definition whose text metric is the host's, it is the estimate every ADP host shares.
  const measured: SceneOptions = { textWidth: widthOfText };
  const behavior = interpretBehavior(specification, metamodel.value, expressions, {
    constraints: constraints.value, layout: layout.value, coordinates: coordinates.value, persistence: persistence.value, toolbox: toolbox.value,
    notation: notation.value, viewpoints: viewpoints.value,
    rows: (config, model) => arrangedRows(sceneTool, model, createScene(sceneTool, model, measured), config),
  });
  const texts = createTexts(specification, expressions);

  // What reading the definition found, and each required plugin that is missing: findings of every document.
  const ofDefinition: Finding[] = [
    ...[loaded, metamodel, persistence, coordinates, notation, layout, viewpoints, constraints, forms, toolbox, behavior].flatMap((part) => part.findings),
    ...expressions.findings,
  ].map(framed);
  const ofPlugins: Finding[] = needed.map((reference) => ({ rule: findingCodes.pluginMissing, severity: 'warning', message: messages.pluginMissing(reference.id), line: 0 }));

  // ---- a document ----

  interface Open {
    readonly binding: FblBinding;
    /** What the library read; the model the metamodel types is made of it. */
    readonly read: FblModel;
    readonly model: Model;
    readonly findings: readonly Finding[];
    /** Why nothing may be edited: absent for a document that is editable. */
    readonly refusal?: string;
    /** What the view says of it. */
    readonly notice?: string;
    readonly unreadable: boolean;
  }

  const bodyOf = (binding: FblBinding, source: Source): OpenBody | PluginBody => {
    const bytes = encode(source.text);
    return binding.plugin ? PluginBody.open(bytes, binding, plugins.persistence(binding.plugin.plugin), source.fileName) : OpenBody.open(bytes, binding);
  };

  // The frame asks several things of one text in a row: the last reading is kept.
  let last: { readonly source: Source; readonly open: Open } | undefined;
  function opened(source: Source): Open {
    if (last && last.source.text === source.text && last.source.fileName === source.fileName) return last.open;
    const binding = claimingBinding(bindings, source.fileName, source.text) ?? bindings[0];
    const body = bodyOf(binding, source);
    const read = body.model;
    const typed = readModel(read, binding, metamodel.value, persistence.value);
    const model = read.unreadable ? emptyModel : typed.value;
    // The reader of a binding says itself that its plugin is missing; it is said once, with the others.
    const found = constraints.value.check(model, typed.findings, { file: source.fileName.slice(Math.max(source.fileName.lastIndexOf('/'), source.fileName.lastIndexOf('\\')) + 1) }).filter((finding) => finding.code !== findingCodes.pluginMissing).map(framed);
    const gate = needed.length > 0 ? messages.pluginMissing(needed[0].id) : body.isReadOnly && !read.unreadable ? binding.readOnly || messages.readOnlyFile : undefined;
    const open: Open = read.unreadable
      ? { binding, read, model, findings: found, unreadable: true, refusal: behavior.value.message('std.readOnly', emptyModel) ?? found[0]?.message ?? UNREADABLE, notice: found[0]?.message ?? UNREADABLE }
      : { binding, read, model, findings: found, unreadable: false, refusal: gate, notice: gate };
    last = { source, open };
    return open;
  }

  const viewpointOf = (options: ViewOptions): string =>
    (options.viewpoint !== undefined && Object.hasOwn(viewpoints.value.all, options.viewpoint) ? options.viewpoint : viewpoints.value.default);

  const sceneOf = (open: Open, options: ViewOptions): Scene => {
    // Which nodes are folded for this viewer: what the options hold, else what the definition seeds a fold from (DISL 11.6).
    const folded = foldsOf(persistence.value, expressions, open.model, options.collapsed);
    const settings: SceneOptions = {
      ...measured,
      viewpoint: viewpointOf(options),
      filters: options.filters as SceneOptions['filters'],
      collapsed: Object.fromEntries(open.model.elements.map((element) => [element.id, folded(element.id)])),
      ...(open.refusal === undefined ? {} : { env: { readOnly: true } }),
    };
    return createScene(sceneTool, open.model, settings);
  };

  const situationOf = (open: Open, options: ViewOptions): Situation =>
    ({ env: { viewpoint: viewpointOf(options), ...(open.refusal === undefined ? {} : { readOnly: true }) }, ...(options.collapsed === undefined ? {} : { collapsed: options.collapsed }) });
  const elementOf = (model: Model, id: string) => [...model.elements, ...model.relations].find((element) => element.id === id);

  // ---- what a scene carries beside its nodes and edges ----

  function tokensOf(name: string): Record<string, SceneToken> {
    const theme = viewpoints.value.all[name].notation.theme;
    const tokens: Record<string, SceneToken> = {};
    for (const token of new Set([...Object.keys(theme.tokens), ...Object.values(theme.modes).flatMap((mode) => Object.keys(mode))])) {
      const valued = (mode: string): { [mode: string]: string | number } => {
        const value = theme.modes[mode]?.[token] ?? theme.tokens[token];
        return typeof value === 'string' || typeof value === 'number' ? { [mode]: value } : {};
      };
      tokens[token] = { ...valued('light'), ...valued('dark') };
    }
    return tokens;
  }

  function chromeOf(open: Open, scene: Scene, options: ViewOptions): SceneChrome {
    const { model } = open;
    const viewpoint = viewpoints.value.all[scene.viewpoint];
    const canvas = viewpoint.notation.canvas;
    const scope = texts.scope({ model });
    const evaluated = (value: unknown): Value | undefined => {
      if (!isCel(value)) return value as Value | undefined;
      const result = expressions.evaluate(value, scope);
      return result.ok ? result.value : undefined;
    };

    // The rows of each ruler, every level at once: which of them has room is the zoom's to say, which only the page knows.
    const diagram = { ...Object.fromEntries(Object.entries(metamodel.value.diagram).flatMap(([name, attribute]) => (defaultOf(attribute) === undefined ? [] : [[name, defaultOf(attribute)!]]))), ...model.diagram };
    const system = coordinates.value.systems[scene.system];
    const shown = options.viewport ?? scene.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
    const rulers: SceneRuler[] = [];
    for (const along of ['x', 'y'] as const) {
      const axis = system?.[along];
      const ruler = axis?.ruler;
      if (!axis || !ruler || ruler.visible === false) continue;
      const view = along === 'x' ? { from: shown.x, to: shown.x + shown.width, zoom: 1 } : { from: shown.y, to: shown.y + shown.height, zoom: 1 };
      const levels = (ruler.levels ?? []).flatMap((level) => {
        const [row] = rulerRows({ ...axis, ruler: { ...ruler, levels: [{ ...level, minSpacingPx: 0, minZoom: undefined, maxZoom: undefined }] } }, diagram, view);
        return row ? [{ spacing: row.spacing, minSpacing: level.minSpacingPx ?? 0, minZoom: level.minZoom, maxZoom: level.maxZoom, ticks: row.ticks.map((tick) => ({ at: tick.at, label: tick.label })) }] : [];
      });
      if (levels.length > 0) rulers.push({ axis: along, position: ruler.position ?? (along === 'x' ? 'bottom' : 'left'), size: ruler.size ?? 24, attach: ruler.attach ?? 'view', levels });
    }

    const filters = Object.values(canvas.filters).map((filter) => {
      const kept = options.filters?.[filter.id];
      const choices = evaluated(filter.options);
      return {
        id: filter.id, label: texts.worded(filter.label, scope, filter.id), control: filter.control,
        options: Array.isArray(choices) ? choices.filter((choice): choice is string => typeof choice === 'string') : [],
        value: (kept?.value as Value | undefined) ?? evaluated(filter.default) ?? null,
        match: kept?.match ?? filter.match.default, matchToggle: filter.match.userToggle,
      };
    });

    const toggles = viewpoints.value.all[viewpoints.value.default].variants.map((name) => {
      const variant = viewpoints.value.all[name];
      return { viewpoint: name, label: texts.worded(variant.toggle?.label ?? variant.label, scope, name), on: scene.viewpoint === name };
    });

    // An entry that names an enum is one swatch for each of its values; one that names a type, the fill the type is drawn with (DISL 6.13).
    const legend = (canvas.legend?.visible ? canvas.legend.entries : []).flatMap((entry) => {
      if (Object.hasOwn(metamodel.value.enums, entry)) return metamodel.value.enums[entry].values.map((value) => ({ id: `${entry}.${value.key}`, label: value.label, fill: value.color as Paint | undefined }));
      if (!Object.hasOwn(metamodel.value.types, entry)) return [];
      return [{ id: entry, label: metamodel.value.types[entry].label, fill: styleOf(viewpoint.notation, nodeNotation(viewpoint.notation, metamodel.value, entry).style).fill }];
    });

    const background = canvas.declared.background;
    return { rulers, filters, toggles, legend, ...(typeof background === 'string' || (isObject(background) && typeof background.token === 'string') ? { background: background as Paint } : {}) };
  }

  function view(source: Source, options: ViewOptions): Scene {
    const open = opened(source);
    const scene = sceneOf(open, options);
    return { ...scene, readOnly: open.refusal !== undefined, ...(open.notice === undefined ? {} : { notice: open.notice }), tokens: tokensOf(scene.viewpoint), chrome: chromeOf(open, scene, options) };
  }

  // ---- the panels ----

  function tools(source: Source): ToolboxEntry[] {
    const open = opened(source);
    if (open.refusal !== undefined) return [];
    const scope = texts.scope({ model: open.model, env: situationOf(open, {}).env });
    const all = (groups: readonly ToolGroup[]): ToolboxEntry[] => groups.filter((group) => texts.holds(group.visible, scope, true)).flatMap((group) => [
      ...group.tools.filter((tool) => texts.holds(tool.visible, scope, true)).map((tool) => ({ id: tool.id, label: texts.worded(tool.label, scope, tool.id), icon: tool.icon ?? '', description: tool.doc ?? '' })),
      ...all(group.groups),
    ]);
    return all(groupsIn(toolbox.value, viewpoints.value.default));
  }

  /** The rows of the form of an element, each with the label of the container it is in. */
  function rowsOf(on: Subject, type: string): { readonly item: FormItem; readonly group: string }[] {
    const rows = (items: readonly FormItem[], group: string): { readonly item: FormItem; readonly group: string }[] => items.flatMap((item) => {
      if (!item.visible(on)) return [];
      if (item.kind === 'field' || item.kind === 'computed') return [{ item, group }];
      return rows(item.items, item.label(on) || group);
    });
    return rows(formFor(forms.value, type).items, '');
  }

  function fields(source: Source, selection: readonly string[]): Field[] {
    const open = opened(source);
    const element = selection.length === 1 ? elementOf(open.model, selection[0]) : undefined;
    if (!element) return [];
    const on: Subject = { model: open.model, element: element.id, env: situationOf(open, {}).env };
    return rowsOf(on, element.type).map(({ item, group }): Field => {
      const marks = item.widget === 'slider' && Array.isArray(item.widgetOptions.marks) ? (item.widgetOptions.marks as unknown[]).flatMap((mark) => (isObject(mark) && typeof mark.label === 'string' ? [mark.label] : [])) : [];
      const options = marks.length > 0 ? marks : item.options(on).map((option) => option.label);
      const locked = item.readOnly(on);
      const readOnly = open.refusal ?? (locked.readOnly ? locked.reason ?? NO_ROW : undefined);
      return {
        id: item.rowId(on), label: item.label(on), group, control: controls[item.widget] ?? 'text', value: item.display(on),
        ...(options.length > 0 ? { options } : {}), ...(readOnly === undefined ? {} : { readOnly }),
      };
    });
  }

  function actions(source: Source, selection: readonly string[], options: ViewOptions = {}): Action[] {
    const open = opened(source);
    const target = selection.length === 1 && elementOf(open.model, selection[0]) ? selection[0] : undefined;
    // In a document that cannot be edited, what is left is what changes nothing of it: a fold, a link followed.
    const offered = behavior.value.menu(open.model, target, situationOf(open, options)).groups.flat()
      .filter((entry) => open.refusal === undefined || (!open.unreadable && behavior.value.operations.find((operation) => operation.id === entry.operation)?.viewOnly === true));
    return offered.map((entry): Action => ({
      id: entry.operation ?? entry.kind, label: entry.label,
      ...(entry.icon === undefined ? {} : { icon: entry.icon }), ...(entry.shortcut === undefined ? {} : { shortcut: entry.shortcut }),
      enabled: entry.enabled, ...(entry.reason === undefined ? {} : { disabledReason: entry.reason }),
    }));
  }

  // ---- an edit ----

  /** The first label of an element that is edited, as its notation declares it: how, and the attribute it shows. */
  const editedLabel = (model: Model, id: string, viewpoint: string): { readonly how: 'inline' | 'multiline' | 'form'; readonly attribute?: string } | undefined => {
    const element = elementOf(model, id);
    if (!element) return undefined;
    const drawn = viewpoints.value.all[viewpoint].notation;
    const labels = 'source' in element ? edgeNotation(drawn, metamodel.value, element.type).labels : nodeNotation(drawn, metamodel.value, element.type).labels;
    const label = labels.find((candidate) => candidate.editable !== false && (candidate.editable !== undefined || isObject(candidate.text)));
    const shown = label && ([label.editText, label.text] as readonly unknown[]).find((text): text is { readonly attribute: string } => isObject(text) && typeof text.attribute === 'string');
    return label ? { how: label.editable || 'inline', ...(shown ? { attribute: shown.attribute } : {}) } : undefined;
  };

  /** The row of ADP Properties that edits an attribute of an element, by its id. */
  const rowOf = (open: Open, situation: Situation, id: string, attribute: string | undefined): string | undefined => {
    const element = attribute === undefined ? undefined : elementOf(open.model, id);
    if (!element) return undefined;
    const on: Subject = { model: open.model, element: id, env: situation.env };
    const row = rowsOf(on, element.type).find(({ item }) => item.attribute === attribute);
    return row?.item.rowId(on);
  };

  /** What an intent came to, as the outcome of the request: its changes planned by the library as splices of the text. */
  function carriedOut(source: Source, open: Open, outcome: Outcome, viewpoint: string, options: ViewOptions): EditOutcome {
    if (outcome.refused !== undefined) return { kind: 'refused', sentence: outcome.refused };
    const link = outcome.effects.find((effect) => effect.kind === 'open' && effect.message !== undefined);
    if (link && outcome.changes.length === 0) return { kind: 'open', path: link.message! };
    const steps = modelChangesOf(outcome.changes, { binding: open.binding, metamodel: metamodel.value, persistence: persistence.value, read: open.read }, open.model);
    if ('refused' in steps) return { kind: 'refused', sentence: steps.refused };
    // Each step is planned against the body the one before left; FBL's own history is not used (research R5).
    const body = steps.length > 0 ? bodyOf(open.binding, source) : undefined;
    const edits: Edit[] = [];
    for (const step of steps) {
      const planned = body!.change(step);
      if ('refused' in planned) return { kind: 'refused', sentence: planned.refused };
      edits.push(planned.planned);
    }
    const asked = outcome.effects.find((effect) => (effect.kind === 'select' || effect.kind === 'editLabel') && effect.elements.length > 0);
    const labelled = outcome.effects.find((effect) => effect.kind === 'editLabel' && effect.elements.length > 0);
    const editing = labelled ? editedLabel(outcome.after, labelled.elements[0], viewpoint)?.how : undefined;
    // What the viewer holds after the request: the folds it changed, and every folded node that hides what it selects, opened (DISL 11.6, `revealExpands`).
    // simplified: `revealExpands: false` is not read; read it in `interpretPersistence` when a definition states it.
    const folds: Record<string, boolean> = { ...outcome.collapsed };
    if (asked) {
      const folded = foldsOf(persistence.value, expressions, outcome.after, { ...options.collapsed, ...folds });
      const parents = new Map(outcome.after.elements.map((element) => [element.id, element.parent]));
      for (let parent = parents.get(asked.elements[0]), seen = 0; parent !== undefined && seen < parents.size; parent = parents.get(parent), seen++) if (folded(parent)) folds[parent] = false;
    }
    return {
      kind: 'applied', splices: edits.length === 0 ? [] : composedSplices(edits),
      ...(asked ? { select: asked.elements[0] } : {}),
      ...(editing === undefined ? {} : { editLabel: true, multiline: editing === 'multiline' }),
      ...(Object.keys(folds).length === 0 ? {} : { viewOptions: { ...options, collapsed: { ...options.collapsed, ...folds } } }),
    };
  }

  function edit(source: Source, request: EditRequest, options: ViewOptions, confirmed: boolean): EditOutcome {
    const open = opened(source);
    const { model } = open;
    const intents = behavior.value;
    // What changes nothing of the document is not an edit: a fold, and an operation of viewer state, are answered in a read-only document too (DISL 9.4).
    const viewing = request.kind === 'fold' || request.kind === 'openLink' || (request.kind === 'action' && intents.operations.find((operation) => operation.id === request.action)?.viewOnly === true);
    if (open.refusal !== undefined && (open.unreadable || !viewing)) return { kind: 'refused', sentence: open.refusal };
    const situation = situationOf(open, options);
    const viewpoint = viewpointOf(options);
    const refused = (sentence: string): EditOutcome => ({ kind: 'refused', sentence });
    const done = (outcome: Outcome): EditOutcome => carriedOut(source, open, outcome, viewpoint, options);
    const nodeOf = (id: string) => sceneOf(open, options).nodes.find((node) => node.id === id);

    // A point of a viewpoint that places by layout, on the axes of the viewpoint it varies: what is created is placed there.
    const inBase = (point: Point): Point => {
      const varied = viewpoints.value.all[viewpoint].variantOf;
      if (varied === undefined) return point;
      const places = new Map(sceneOf(open, { ...options, viewpoint: varied }).nodes.map((node) => [node.id, node.box]));
      const nodes = sceneOf(open, options).nodes.filter((node) => places.has(node.id));
      const pairs = (axis: 'x' | 'y') => nodes.map((node) => ({ placed: node.box[axis], base: places.get(node.id)![axis] }));
      return { x: baseCoordinate(pairs('x'), point.x), y: baseCoordinate(pairs('y'), point.y) };
    };

    switch (request.kind) {
      case 'drop': {
        // A tool that runs an operation runs it on the element the point is on, the topmost there. Where the
        // operation needs an element and there is none, nothing happens: a host rule, see docs/disl-support.md.
        const operation = Object.hasOwn(toolbox.value.tools, request.entry) ? toolbox.value.tools[request.entry].operation : undefined;
        const under = operation === undefined ? undefined : [...sceneOf(open, options).nodes].reverse().find((node) => request.x >= node.box.x && request.x <= node.box.x + node.box.width && request.y >= node.box.y && request.y <= node.box.y + node.box.height)?.id;
        if (operation !== undefined && under === undefined && !intents.availability(model, operation, [], situation).offered) return { kind: 'applied', splices: [] };
        return done(intents.create(model, request.entry, inBase({ x: request.x, y: request.y }), situation, under));
      }
      case 'move': {
        const node = nodeOf(request.id);
        return node ? done(intents.move(model, [request.id], { x: request.x - node.box.x, y: request.y - node.box.y }, situation)) : refused(GONE);
      }
      case 'resize': {
        const node = nodeOf(request.id);
        if (!node) return refused(GONE);
        const { box } = node;
        const { bounds } = request;
        return done(intents.resize(model, request.id, {
          left: bounds.x - box.x, top: bounds.y - box.y, right: bounds.x + bounds.width - (box.x + box.width), bottom: bounds.y + bounds.height - (box.y + box.height),
        }, situation));
      }
      case 'handle': {
        const node = nodeOf(request.id);
        const handle = node?.handles[request.handle];
        if (!node || !handle) return refused(GONE);
        // simplified: a handle is dragged along x, as the request carries an x only; give the request a y when a definition has a handle along y.
        const share = Math.min(1, Math.max(0, (request.x - node.box.x) / (node.box.width || 1)));
        return done(intents.dragHandle(model, request.id, handle.param, share, situation));
      }
      case 'connect': {
        if (!elementOf(model, request.from) || !elementOf(model, request.to)) return refused(GONE);
        // simplified: the first relation the definition offers for the two; give the request the type when a definition offers several.
        const offered = intents.menu(model, { source: request.from, target: request.to }, situation).groups.flat().find((entry) => entry.via !== undefined);
        if (!offered?.via) return refused(NOT_HERE);
        if (!offered.enabled) return refused(offered.reason ?? NOT_HERE);
        return done(intents.connect(model, offered.via, request.from, request.to, { source: endOf(request.fromEnd), target: endOf(request.toEnd) }, situation));
      }
      case 'moveEnd':
        return done(intents.reattach(model, request.id, request.end === 'from' ? 'source' : 'target', endOf(request.value) ?? {}, situation));
      case 'rename':
        return done(intents.editLabel(model, request.id, request.text, situation));
      case 'setField': {
        const element = elementOf(model, request.id);
        if (!element) return refused(GONE);
        const on: Subject = { model, element: element.id, env: situation.env };
        const row = rowsOf(on, element.type).find(({ item }) => item.rowId(on) === request.field);
        return row ? done(intents.edit(model, element.id, row.item, request.value, situation)) : refused(NO_ROW);
      }
      case 'action': {
        const { id } = request;
        if (id !== undefined && !elementOf(model, id)) return refused(GONE);
        const selection = id === undefined ? [] : [id];
        const asking = (question: { readonly title: string; readonly message: string; readonly confirmLabel: string; readonly danger: boolean }): EditOutcome =>
          ({ kind: 'confirm', title: question.title, message: question.message, confirmLabel: question.confirmLabel, danger: question.danger });
        const operation = intents.operations.find((candidate) => candidate.id === request.action);
        if (operation) {
          const state = intents.availability(model, request.action, selection, situation);
          if (state.offered && state.available && state.confirm && !confirmed) return asking(state.confirm);
          if (state.offered && state.available && operation.plugin !== undefined) {
            // The operation is a plugin's: what it answers is the outcome, and changes it makes are planned as any other.
            const result = plugins.action(operation.plugin)?.run({ source, model, selection });
            if (!result) return { kind: 'applied', splices: [] };
            return result.kind === 'changes' ? done({ changes: result.changes, after: applyChanges(model, result.changes), created: [], effects: [], collapsed: {} }) : result;
          }
          // A request carries no parameters, and this host has no dialog to ask them in: the value is asked in ADP Properties, at the row of the attribute the operation sets.
          const field = state.offered && state.available && id !== undefined ? rowOf(open, situation, id, operation.asks) : undefined;
          if (field !== undefined) return { kind: 'showField', field };
          // Where the request names no point, the middle of what is shown is the point.
          const shown = options.viewport;
          const at = request.x !== undefined && request.y !== undefined ? { x: request.x, y: request.y } : shown ? { x: shown.x + shown.width / 2, y: shown.y + shown.height / 2 } : undefined;
          return done(intents.operate(model, request.action, selection, situation, at && inBase(at)));
        }
        if (request.action === 'delete' && id !== undefined) {
          const removal = intents.deletion(model, selection, situation);
          if (removal.refused !== undefined) return refused(removal.refused);
          return removal.confirm && !confirmed ? asking(removal.confirm) : done(intents.remove(model, selection, situation));
        }
        if (request.action === 'editLabel' && id !== undefined) {
          const editing = editedLabel(model, id, viewpoint);
          if (editing?.how !== 'form') return editing ? { kind: 'editInPlace', id, multiline: editing.how === 'multiline' } : refused(NO_TEXT);
          // A label the definition edits in a form is edited in ADP Properties, at the row of the attribute it shows.
          const field = rowOf(open, situation, id, editing.attribute);
          return field === undefined ? refused(NO_TEXT) : { kind: 'showField', field };
        }
        return refused(intents.message('std.notApplicable', model, situation) ?? 'This cannot be done with what is selected.');
      }
      case 'reparent':
        return done(intents.reparent(model, request.id, request.parent, request.index, situation));
      case 'fold': {
        if (!elementOf(model, request.id)) return refused(GONE);
        // Viewer state (DISL 11.6): nothing is written, so there are no splices and no undo step.
        return nodeOf(request.id)?.fold === undefined ? refused(NOT_HERE) : { kind: 'applied', splices: [], viewOptions: { ...options, collapsed: { ...options.collapsed, [request.id]: request.folded } } };
      }
      case 'openLink': {
        if (!elementOf(model, request.id)) return refused(GONE);
        // The link is what the first operation offered on the element that opens one gives (DISL 9.4, `open`).
        const opening = intents.operations.find((operation) => {
          const state = operation.opens ? intents.availability(model, operation.id, [request.id], situation) : undefined;
          return state?.offered === true && state.available;
        });
        return opening ? done(intents.operate(model, opening.id, [request.id], situation)) : refused(NOT_HERE);
      }
      default:
        // simplified: pinning is refused; it is built with the first definition that stores `pinned`.
        return refused(NOT_HERE);
    }
  }

  const language = specification.language;
  return {
    origin: typeof language.origin === 'string' ? language.origin : language.id,
    kind: 'diagram',
    displayName: texts.worded(language.label, {}, definition.name),
    claims: claimsOf(bindings),
    claimed: (fileName, text) => claimingBinding(bindings, fileName, text) !== undefined,
    suggests: (fileName, text) => suggests(bindings, fileName, text),
    findings: (source) => {
      const open = opened(source);
      return [...open.findings, ...(open.unreadable ? [] : createScene(sceneTool, open.model, measured).findings.map(framed)), ...ofDefinition, ...ofPlugins];
    },
    view,
    toolbox: tools,
    fields,
    actions,
    edit,
    newDocument: (name) => {
      const made = produceTemplate(bindings[0], undefined, name, () => crypto.randomUUID(), bindings[0].plugin && plugins.persistence(bindings[0].plugin.plugin));
      return made ? decode(made) : '';
    },
  };
}

/**
 * The tool types of the folders of `definitions/`, each folder given as its files' bytes by name,
 * in the order of the folders' names. A folder that is no tool type is left out, with the reason.
 */
export function toolTypesFrom(folders: ReadonlyMap<string, ReadonlyMap<string, Uint8Array>>, plugins: PluginRegistry):
{ readonly types: readonly DiagramToolType[]; readonly skipped: readonly { readonly folder: string; readonly reason: string }[] } {
  const types: DiagramToolType[] = [];
  const skipped: { readonly folder: string; readonly reason: string }[] = [];
  for (const folder of [...folders.keys()].sort()) {
    const read = readDefinitionFolder(folder, folders.get(folder)!);
    if ('reason' in read) skipped.push({ folder, reason: read.reason });
    // simplified: a designer is left out until `toolTypeFrom` makes one; say so here until then.
    else if (read.definition.kind !== 'diagram') skipped.push({ folder, reason: 'The definition is a designer, which this host does not show yet.' });
    else types.push(toolTypeFrom(read.definition, read.bindings, plugins));
  }
  return { types, skipped };
}
