// A definition as a tool type (etalii.adp spec 027, contracts/tool-type.md): the frame's contract
// made from a specification, its bindings and the plugins it may name, with nothing written for the
// tool type itself. A document is read through its binding by the FBL library and typed by the
// interpreter; a request is one intent of the interpreted behavior, whose changes the library plans
// as splices of the text. Every method is a function of its arguments.

import { counterRules, markSets, numbered, renumbering, type Unnumbered } from '../desl/counters';
import { dedEnvelope, dedFindings, dedRefusal } from '../desl/envelope';
import { gesturesOf, withImplicitMembers } from '../desl/hierarchy';
import { checkMentions, interpretMentions } from '../desl/mentions';
import { interpretOperations, readingOf, type RunStep } from '../desl/operations';
import { derivedIds, interpretSettings, settingSteps, withSettings, type SettingSteps, type StoredBlocks } from '../desl/settings';
import { expressionsOf, loadDesigner } from '../desl/specification';
import { documentTypesOf, interpretSurface } from '../desl/surface';
import { applyChanges, baseCoordinate, interpretBehavior, type Change, type EndPlace, type OfferedEntry, type Outcome, type Point, type Situation, NOT_PICKED, type ViewChange } from '../disl/behavior';
import { interpretConstraints } from '../disl/constraints';
import { fittedScale, interpretCoordinates, rulerRows, scaleOf, type Axis } from '../disl/coordinates';
import { createExpressions, type Scope } from '../disl/expressions';
import { createTexts, formFor, interpretForms, type FormItem, type Subject } from '../disl/forms';
import { interpretLayout } from '../disl/layout';
import { indexedDocument, linkedModel, type Refreshed } from '../disl/links';
import { defaultOf, derivedRelations, interpretMetamodel, isA, isRelation, linkKind, withDerivedNodes, type DerivedRelation } from '../disl/metamodel';
import { emptyModel, type Finding as Found, type Model, type ModelElement, type Value } from '../disl/model';
import { edgeNotation, interpretNotation, nodeNotation, styleOf, type GestureRefusals, type Notation, type Paint } from '../disl/notation';
import { derivedIds as worldIds, entryOf, foldsOf, interpretPersistence, momentAttributes, naturalId, newDocumentId, newId, readModel, typeIds, viewEntryIds, type StoredView } from '../disl/persistence';
import { isCel, isObject, loadSpecification, localized, type LocalizedText } from '../disl/specification';
import { groupsIn, interpretToolbox, type ToolGroup } from '../disl/toolbox';
import { interpretViewpoints } from '../disl/viewpoints';
import { findRule, type FblBinding } from '../fbl/documents/types';
import { extensionOf, nameOf } from '../fbl/files/paths';
import { findingCodes } from '../fbl/finding';
import { OpenBody } from '../fbl/history/openBody';
import { messages } from '../fbl/messages';
import type { FblModel, IdRequest } from '../fbl/model';
import type { ChangePosition, ModelChange } from '../fbl/planning/modelChange';
import { PluginBody } from '../fbl/plugins/pluginBody';
import { OpenRegistration } from '../fbl/registration/openRegistration';
import { createRegistration } from '../fbl/registration/registrationCreation';
import { RegistrationDocument } from '../fbl/registration/registrationDocument';
import { memoryFiles } from '../fbl/files/memoryFiles';
import { readFolder } from '../fbl/routing/folderReading';
import { folderFiles as selectedFiles, recogniseFolder } from '../fbl/routing/folderSubject';
import { produceTemplate } from '../fbl/routing/templateWriter';
import type { Edit } from '../fbl/splice';
import { decode, encode } from '../fbl/text/utf8';
import { BodyText } from '../fbl/text/bodyText';
import type { Action, Control, DesignerToolType, DiagramToolType, EditOutcome, EditRequest, ExportOffer, Exported, Field, Finding, Severity, Source, TextSplice, ToolboxEntry, ViewOptions } from '../frame/toolType';
import { exportAction, exportOf, LINKED_FROM, OPEN_LINKED } from '../frame/toolType';
import { cachedName, parseLink } from '../fbl/links/link';
import { backlinksOf, breaksLinks, linkEntries, linkTarget } from './linkActions';
import { anchorOf, arrangedPlaces, arrangedRows, createScene, type Scene, type SceneChrome, type SceneOptions, type SceneRuler, type SceneTool, type SceneToken } from '../scene/scene';
import { widthOfText } from '../text/textMetric';
import { claimingBinding, claimsOf, suggests } from './claims';
import { readDefinitionFolder, type Definition } from './definitionFolder';
import { composedSplices, modelChangesOf, viewStepsOf, type Refused } from './modelChanges';
import { missingPlugins, pluginReferences, type PluginRegistry } from './pluginRegistry';
import { layoutOf, newRegistration, withLayout, type Corner } from './registrationLayout';
import { hierarchyReader, type HierarchyRequest, type HierarchyView, type NodeFinding } from './hierarchyView';
import { sectionsReader, type SectionsRequest, type SectionsView } from './sectionsView';
import { CREATED, tableReader, withFindings, type RelatedRows, type TableData, type TableGestures, type TableLinking, type TableProperty, type TableRequest, type TableValue, type TableView } from './tableView';
import { wireIdsOf } from './wireIds';

// The host's own sentences, for what a definition has no words for.
const GONE = 'That is no longer in this document.';
const NO_ROW = 'This value cannot be changed here.';
const NO_TEXT = 'This text cannot be changed here.';
const NOT_HERE = 'This is not possible here.';
const UNREADABLE = 'The document could not be read, so it cannot be edited.';
const unreadableFile = (fileName: string): string => `${fileName.slice(Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1)} could not be read, so it cannot be edited.`;
const NO_LINK = 'There is no link to open.';
const PICKED_LINK = 'A link is chosen with Add from another document, and opened with Open linked element.';
const NO_TARGET = 'The link does not lead to an element of the workspace, so there is nothing to open.';
const NO_WORKSPACE = 'This document is in no folder of the workspace, so there is nothing to link to.';
const NO_PLACE = 'An end is put on a part of what it is on, on a side of that part, at a share of the side from 0 to 1.';

const severities: Readonly<Record<string, Severity>> = { error: 'error', warning: 'warning', info: 'information', hint: 'hint' };
const controls: Readonly<Record<string, Control>> = {
  textarea: 'multiline', tags: 'tags', slider: 'slider', number: 'number', select: 'choice', segmented: 'choice', combobox: 'choice', checkbox: 'toggle', switch: 'toggle',
};

// The form a value of a widget is written in (DISL B.7), shown in its empty field: a duration is ISO 8601.
const placeholders: Readonly<Record<string, string>> = { duration: 'PT15M, PT2H or P1D', date: 'YYYY-MM-DD', month: 'YYYY-MM' };

/** A finding of the interpreter or the library as the frame's: its line counted from zero. */
const framed = (found: Found): Finding => ({ rule: found.code, severity: severities[found.severity] ?? 'warning', message: found.message, line: Math.max(0, found.location.line - 1), ...(found.element === undefined ? {} : { element: found.element }) });

/** An end as a request names it: `<part>/<side>/<at>`. */
function endOf(text: string | undefined): EndPlace | undefined {
  const [part, side, at, ...more] = (text ?? '').split('/');
  const along = Number(at);
  return part && side && at !== undefined && at.trim() !== '' && more.length === 0 && Number.isFinite(along) ? { part, side, at: along } : undefined;
}

/**
 * The specification with a layout that names a plugin the registry lacks given the algorithm the
 * plugin's `fallback` names, and an edge routed by such a plugin the routing it names (DISL 13.1).
 */
function withFallbacks(specification: Readonly<Record<string, unknown>>, fallbacks: ReadonlyMap<string, string>, routings: ReadonlyMap<string, string> = new Map()): Readonly<Record<string, unknown>> {
  return withRoutingFallbacks(withLayoutFallbacks(specification, fallbacks), routings);
}

function withRoutingFallbacks(specification: Readonly<Record<string, unknown>>, routings: ReadonlyMap<string, string>): Readonly<Record<string, unknown>> {
  const notation = specification.notation;
  if (routings.size === 0 || !isObject(notation) || !isObject(notation.edges)) return specification;
  const edges = Object.fromEntries(Object.entries(notation.edges).map(([type, declared]) => {
    const line = isObject(declared) ? declared.line : undefined;
    const routing = isObject(line) ? line.routing : undefined;
    const plugin = isObject(routing) && typeof routing.plugin === 'string' ? routing.plugin : undefined;
    return [type, plugin !== undefined && routings.has(plugin) ? { ...(declared as object), line: { ...(line as object), routing: routings.get(plugin) } } : declared];
  }));
  return { ...specification, notation: { ...notation, edges } };
}

function withLayoutFallbacks(specification: Readonly<Record<string, unknown>>, fallbacks: ReadonlyMap<string, string>): Readonly<Record<string, unknown>> {
  const layout = specification.layout;
  if (fallbacks.size === 0 || !isObject(layout) || !isObject(layout.algorithms)) return specification;
  const algorithms = Object.fromEntries(Object.entries(layout.algorithms).map(([name, declared]) => {
    const plugin = isObject(declared) && typeof declared.algorithm === 'string' && declared.algorithm.startsWith('plugin:') ? declared.algorithm.slice(7) : undefined;
    return [name, plugin !== undefined && fallbacks.has(plugin) ? { ...(declared as object), algorithm: fallbacks.get(plugin) } : declared];
  }));
  return { ...specification, layout: { ...layout, algorithms } };
}

/** A definition, its bindings and the plugins it may name, as one tool type. Never throws. */
export function toolTypeFrom(definition: Definition, bindings: readonly FblBinding[], plugins: PluginRegistry): DiagramToolType | DesignerToolType {
  return definition.kind === 'designer' ? designerFrom(definition, bindings, plugins) : diagramFrom(definition, bindings, plugins);
}

function diagramFrom(definition: Definition, bindings: readonly FblBinding[], plugins: PluginRegistry): DiagramToolType {
  // ---- the definition, interpreted once ----

  const missing = missingPlugins(pluginReferences(definition.specification, bindings), plugins);
  const needed = missing.filter((reference) => reference.required);
  const fallbacks = new Map(missing.flatMap((reference) => (!reference.required && reference.fallback.layout !== undefined ? [[reference.id, reference.fallback.layout] as const] : [])));

  const routingFallbacks = new Map(missing.flatMap((reference) => (!reference.required && reference.fallback.routing !== undefined ? [[reference.id, reference.fallback.routing] as const] : [])));
  const loaded = loadSpecification(withFallbacks(definition.specification, fallbacks, routingFallbacks));
  const specification = loaded.value;
  const origin = typeof specification.language.origin === 'string' ? specification.language.origin : specification.language.id;
  // What the binding cannot state of how this tool type reads its documents (`docs/disl-support.md`, "Code for one tool type").
  const readingLogic = plugins.reading(origin);
  // What the tool type exports of a document, which no definition states (`docs/disl-support.md`, "Code for one tool type").
  const exportLogic = plugins.exports(origin);
  const exportOffers: ExportOffer[] = (exportLogic?.exports ?? []).map((offer) => ({ id: offer.id, label: offer.label }));
  const metamodel = interpretMetamodel(specification);
  const persistence = interpretPersistence(specification, metamodel.value);
  const expressions = createExpressions(specification, metamodel.value, { pluginFunction: (plugin, name) => plugins.celFunctions(plugin)?.functions[name] });
  const coordinates = interpretCoordinates(specification, metamodel.value);
  const notation = interpretNotation(specification, metamodel.value);
  const layout = interpretLayout(specification);
  const viewpoints = interpretViewpoints(specification, metamodel.value, { notation: notation.value, coordinates: coordinates.value, layout: layout.value });
  const constraints = interpretConstraints(specification, metamodel.value, expressions);
  const forms = interpretForms(specification, metamodel.value, expressions, { numberText: readingLogic?.numberText });
  const toolbox = interpretToolbox(specification, metamodel.value);
  // The time axes of dates, whose scale a viewer fits to the document once and keeps (`ViewOptions.scales`), as the
  // standalone host does: each request is answered on the scale its viewer holds, else on the one the definition declares.
  const dateAxes = Object.values(coordinates.value.axes).filter((axis) => axis.kind === 'time' && axis.valueType === 'datetime');
  const declaredScales = new Map(dateAxes.map((axis) => [axis.name, { origin: axis.origin, size: axis.size }]));
  const scaled = (options: ViewOptions): void => {
    for (const axis of dateAxes) Object.assign(axis as { origin: number; size: number }, options.scales?.[axis.name] ?? declaredScales.get(axis.name));
  };
  const sceneTool: SceneTool = { metamodel: metamodel.value, expressions, coordinates: coordinates.value, viewpoints: viewpoints.value, layouts: (id) => plugins.layout(id), routings: (id) => plugins.routing(id) };
  // The core has no browser to measure a text with: for a definition whose text metric is the host's, it is the estimate every ADP host shares.
  const measured: SceneOptions = { textWidth: widthOfText, ...(readingLogic?.underlineStyle === undefined ? {} : { underlineStyle: readingLogic.underlineStyle }) };
  const behavior = interpretBehavior(specification, metamodel.value, expressions, {
    constraints: constraints.value, layout: layout.value, coordinates: coordinates.value, persistence: persistence.value, toolbox: toolbox.value,
    notation: notation.value, viewpoints: viewpoints.value,
    rows: (config, model) => arrangedRows(sceneTool, model, createScene(sceneTool, model, measured), config),
    placed: (config, model) => arrangedPlaces(sceneTool, model, createScene(sceneTool, model, measured), config),
  });
  const texts = createTexts(specification, expressions);
  const wire = wireIdsOf(definition.specification);
  // The tool types each operation's `lookup` offers the elements of (DISL 9.4, `origins`), by operation.
  const lookupOrigins = new Map(Object.entries(isObject(specification.behavior) && isObject(specification.behavior.operations) ? specification.behavior.operations : {})
    .flatMap(([name, declared]) => { const origins = originsOf(declared); return origins === undefined ? [] : [[name, origins] as const]; }));
  // Pins that no entry of the document holds are kept beside it: the layout of its registration, by the top-left corner of each element (DISL 11.6, FBL 8.3).
  const keptBeside = (persistence.value.view.store.includes('pinned') || persistence.value.view.store.includes('bounds')) && persistence.value.view.bind.pinned === undefined;
  // An entry is the point the node's placement anchor names where the binding says so (FBL 0.20 §8.3, `registration.layoutPoint`), else its top-left corner.
  const keptAnchored = (binding: FblBinding): boolean => keptBeside && binding.registration.layoutPoint === 'anchor';

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
    /** The entry each element is read from, where its id is another (`Read.entries`). */
    readonly entries?: ReadonlyMap<string, string>;
    readonly findings: readonly Finding[];
    /** Why nothing may be edited: absent for a document that is editable. */
    readonly refusal?: string;
    /** What the view says of it. */
    readonly notice?: string;
    readonly unreadable: boolean;
    /** The view data the document keeps, and the entries of it that are about nothing, which go with the next write (DISL 11.6). */
    readonly view: StoredView;
    readonly stale: readonly string[];
    /** The relations the model's relation types derive: drawn and edited, and no part of the model. */
    readonly derived: readonly DerivedRelation[];
    /** The corners the registration keeps, by id, where pins are kept beside the document. */
    readonly corners: Readonly<Record<string, Corner>>;
    /** The ids its types' own rules derive over the model, by the place of their entries, which the body is read again with. */
    readonly named?: ReadonlyMap<string, string>;
    /** What load-time validation writes with the next edit (FBL 17.4): the links whose text differs from what resolution found. */
    readonly refreshed: readonly Refreshed[];
    /** Whether the next edit gives the body its document id (FBL 17.4, step 1). */
    readonly needsId: boolean;
  }

  // What the FBL library asks of the tool type's specification: the id of an entry of bound view data, and which attributes hold a moment (FBL 5.3, 6.3).
  const viewIds = viewEntryIds(persistence.value);
  const ownIds = typeIds(persistence.value, expressions);
  const deriveId = (request: IdRequest): string | undefined => viewIds(request) ?? ownIds(request);
  const reading = new Map(bindings.map((binding) => [binding, { deriveId, timeAttributes: momentAttributes(binding, metamodel.value, persistence.value) }]));
  const optionsOf = (binding: FblBinding, named?: ReadonlyMap<string, string>) => {
    const options = reading.get(binding);
    return named === undefined ? options : { ...options, deriveId: (request: IdRequest) => named.get(`${request.rule}@${request.line}`) ?? deriveId(request) };
  };
  const bodyOf = (binding: FblBinding, source: Source, named?: ReadonlyMap<string, string>): OpenBody | PluginBody => {
    const bytes = encode(source.text);
    if (binding.plugin) return PluginBody.open(bytes, binding, plugins.persistence(binding.plugin.plugin), source.fileName);
    return OpenBody.open(bytes, binding, optionsOf(binding, named));
  };
  // A folder subject (FBL 10) is read from the files the host read of it, file by file, and is never written (FBL 10.4 is not built).
  const folderBinding = bindings.find((binding) => binding.body.isFolder);
  const folderBodyOf = (binding: FblBinding, folder: Readonly<Record<string, string>>, named?: ReadonlyMap<string, string>): { readonly model: FblModel; readonly isReadOnly: boolean } =>
    ({ model: readFolder(binding, '/', memoryFiles(Object.keys(folder), folder), optionsOf(binding, named)), isReadOnly: true });
  // A type's own derived rule (DISL 11.5.2, `ids.types`) may read what only the model has, such as its
  // parent and its place among its siblings: such ids are derived over the model read first, and the
  // document is read again with them, each by its entry's place, `<rule>@<line>` (FBL 5.3).
  const perType = persistence.value.ids.strategy === 'derived' && Object.keys(persistence.value.ids.types ?? {}).length > 0;
  const namedOver = (read: FblModel, model: Model): ReadonlyMap<string, string> | undefined => {
    if (!perType) return undefined;
    const { renamed } = worldIds(persistence.value, expressions, model);
    if (renamed.size === 0) return undefined;
    return new Map(read.elements.flatMap((element) => (renamed.has(element.id) ? [[`${element.rule}@${element.line}`, renamed.get(element.id)!] as const] : [])));
  };

  // The frame asks several things of one text in a row: the last reading is kept.
  let last: { readonly source: Source; readonly open: Open } | undefined;
  function opened(source: Source): Open {
    if (last && last.source.text === source.text && last.source.fileName === source.fileName && last.source.registration === source.registration && last.source.folder === source.folder && last.source.links === source.links) return last.open;
    const folder = folderBinding === undefined ? undefined : source.folder;
    const binding = folder === undefined ? claimingBinding(bindings, source.fileName, source.text) ?? bindings[0] : folderBinding!;
    const readBody = (named?: ReadonlyMap<string, string>) => (folder === undefined ? bodyOf(binding, source, named) : folderBodyOf(binding, folder, named));
    const bytes = encode(source.text);
    const entryText = (span: { readonly start: number; readonly end: number }): string => decode(bytes.subarray(span.start, span.end)).replace(/[\r\n]+$/, '');
    const typedOf = (from: FblModel) => {
      const reread = readingLogic?.reread ? { elements: readingLogic.reread(from.elements, entryText), findings: from.findings, unreadable: from.unreadable } : from;
      return readModel(reread, binding, metamodel.value, persistence.value, readingLogic?.unreadable ? (entry) => readingLogic.unreadable!(entryText(entry.ownSpan)) : undefined);
    };
    let body = readBody();
    let read = body.model;
    let typed = typedOf(read);
    const named = read.unreadable ? undefined : namedOver(read, typed.value);
    if (named !== undefined && named.size > 0) {
      body = readBody(named);
      read = body.model;
      typed = typedOf(read);
    }
    // The nodes the derived node types compute (DISL 4.11.2) are part of the model, before the derived relations, which may end at them.
    const nodes = read.unreadable ? { value: emptyModel, findings: [] } : withDerivedNodes(metamodel.value, expressions, typed.value);
    // In a workspace, a document that holds links shows each linked element by its target and reports what does not resolve (DISL 4.12, FBL 17.4).
    const linking = read.unreadable || source.links === undefined || persistence.value.documentId === undefined ? undefined : linkedModel(metamodel.value, nodes.value, source.links);
    const model = linking?.model ?? nodes.value;
    const derived = derivedRelations(metamodel.value, expressions, model);
    // The reader of a binding says itself that its plugin is missing; it is said once, with the others.
    // The derived relations are part of the diagram a constraint reads (DISL 4.11), though no part of the model that is written.
    const checked = constraints.value.check(derived.value.length === 0 ? model : { ...model, relations: [...model.relations, ...derived.value] }, typed.findings, { file: source.fileName.slice(Math.max(source.fileName.lastIndexOf('/'), source.fileName.lastIndexOf('\\')) + 1) }).filter((finding) => finding.code !== findingCodes.pluginMissing);
    const found = [
      ...(readingLogic?.order ? readingLogic.order(checked, model) : checked),
      ...nodes.findings,
      ...derived.findings,
      ...(linking?.findings ?? []),
    ].map(framed);
    const gate = needed.length > 0 ? messages.pluginMissing(needed[0].id) : body.isReadOnly && !read.unreadable ? binding.readOnly || messages.readOnlyFile : undefined;
    const kept = {
      view: typed.view, stale: typed.stale, ...(typed.entries ? { entries: typed.entries } : {}), derived: derived.value, corners: keptBeside ? layoutOf(source.registration) : {}, ...(named === undefined ? {} : { named }),
      // A binding that keeps no document id (FBL 17.2) is given none: its document still resolves the links it holds.
      refreshed: linking?.refreshed ?? [], needsId: linking !== undefined && read.documentId === undefined && (binding.plugin !== undefined || binding.documentId !== undefined),
    };
    // What is said of a document that cannot be read is the definition's sentence for one that cannot be edited, else the reader's finding.
    const readOnly = behavior.value.message('std.readOnly', emptyModel);
    const unread = readOnly ?? found[0]?.message ?? UNREADABLE;
    // An edit of it is refused naming the file, in the standalone host's words, where the definition gives no sentence of its own.
    const unedited = readOnly ?? unreadableFile(source.fileName);
    const open: Open = read.unreadable
      ? { binding, read, model, findings: found, unreadable: true, refusal: unedited, notice: unread, ...kept }
      : { binding, read, model, findings: found, unreadable: false, refusal: gate, notice: gate, ...kept };
    last = { source, open };
    return open;
  }

  const viewpointOf = (options: ViewOptions): string =>
    (options.viewpoint !== undefined && Object.hasOwn(viewpoints.value.all, options.viewpoint) ? options.viewpoint : viewpoints.value.default);

  // One request asks for the scene of one document several times: the last one is kept.
  let drawn: { readonly open: Open; readonly options: ViewOptions; readonly scene: Scene } | undefined;
  const sceneOf = (open: Open, options: ViewOptions): Scene => {
    if (drawn?.open === open && drawn.options === options) return drawn.scene;
    // Which nodes are folded for this viewer: what the options hold, else what the definition seeds a fold from (DISL 11.6).
    const folded = foldsOf(persistence.value, expressions, open.model, options.collapsed);
    const settings: SceneOptions = {
      ...measured,
      viewpoint: viewpointOf(options),
      filters: options.filters as SceneOptions['filters'],
      collapsed: Object.fromEntries(open.model.elements.map((element) => [element.id, folded(element.id)])),
      view: open.view,
      ...(keptBeside ? { corners: open.corners, cornersAnchored: keptAnchored(open.binding) } : {}),
      ...(options.placed === undefined ? {} : { placed: options.placed }),
      ...(open.refusal === undefined ? {} : { env: { readOnly: true } }),
    };
    drawn = { open, options, scene: createScene(sceneTool, open.model, settings) };
    return drawn.scene;
  };

  const situationOf = (open: Open, options: ViewOptions): Situation => {
    // Where a node is drawn, as the point of it its placement names: what is stored when it is pinned (DISL 11.6).
    const at = (id: string): Point | undefined => {
      const node = sceneOf(open, options).nodes.find((candidate) => candidate.id === id);
      if (!node) return undefined;
      const [fx, fy] = anchorOf(nodeNotation(viewpoints.value.all[viewpointOf(options)].notation, metamodel.value, node.type).placement.anchor);
      return { x: node.box.x + fx * node.box.width, y: node.box.y + fy * node.box.height };
    };
    // An element the registration keeps a corner for is pinned where it is drawn.
    const beside = Object.keys(open.corners);
    const view = beside.length === 0 ? open.view : { ...open.view, pinned: { ...open.view.pinned, ...Object.fromEntries(beside.flatMap((id) => { const point = at(id); return point ? [[id, point]] : []; })) } };
    return {
      env: { viewpoint: viewpointOf(options), ...(open.refusal === undefined ? {} : { readOnly: true }) }, ...(options.collapsed === undefined ? {} : { collapsed: options.collapsed }),
      view, at,
      bounds: (id) => sceneOf(open, options).nodes.find((candidate) => candidate.id === id)?.box,
    };
  };
  const elementOf = (model: Model, id: string) => [...model.elements, ...model.relations].find((element) => element.id === id);
  /** The sentence of the first of an element's `refusals` for a gesture its notation switches off that applies (DISL 6.9); none where none is declared. */
  const gestureRefusal = (model: Model, id: string, gesture: keyof GestureRefusals, env: Scope | undefined, drawn: Notation): string | undefined => {
    const element = elementOf(model, id);
    if (!element) return undefined;
    const reasons = (isRelation(metamodel.value.types[element.type]) ? edgeNotation(drawn, metamodel.value, element.type) : nodeNotation(drawn, metamodel.value, element.type)).refusals?.[gesture];
    return reasons === undefined ? undefined : texts.applicable(reasons, texts.scope({ model, element: id, ...(env === undefined ? {} : { env }) }));
  };

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
      // The value the diagram keeps for a kept filter, and this viewer's for any other (DISL 6.13.1).
      const kept = filter.persist ? { value: open.view.filters[filter.id], match: undefined } : options.filters?.[filter.id];
      const choices = evaluated(filter.options);
      return {
        id: filter.id, label: texts.worded(filter.label, scope, filter.id), control: filter.control,
        options: Array.isArray(choices) ? choices.filter((choice): choice is string => typeof choice === 'string') : [],
        value: (kept?.value as Value | undefined) ?? evaluated(filter.default) ?? null,
        match: kept?.match ?? filter.match.default, matchToggle: filter.match.userToggle, kept: filter.persist,
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
    scaled(options);
    const open = opened(source);
    const scene = sceneOf(open, options);
    const empty = open.notice === undefined ? emptyMessage(open, scene.viewpoint) : undefined;
    return {
      ...scene, readOnly: open.refusal !== undefined, ...(open.notice === undefined ? {} : { notice: open.notice }), ...(empty === undefined ? {} : { empty }),
      tokens: tokensOf(scene.viewpoint), chrome: chromeOf(open, scene, options),
    };
  }

  // The scale of each time axis of dates that shows the whole document across about 1200 canvas units, read from where
  // its nodes are drawn on the declared scale; none for an empty document.
  function fittedScales(source: Source): ViewOptions['scales'] {
    if (dateAxes.length === 0) return undefined;
    scaled({});
    const open = opened(source);
    if (open.unreadable) return undefined;
    const scene = createScene(sceneTool, open.model, measured);
    const system = coordinates.value.systems[scene.system];
    if (!system || scene.nodes.length === 0) return undefined;
    const fitted: Record<string, { origin: number; size: number }> = {};
    for (const [axis, across] of [[system.x, true], [system.y, false]] as [Axis, boolean][]) {
      if (!dateAxes.includes(axis)) continue;
      const scale = scaleOf(axis);
      const days = scene.nodes.flatMap((node) => (across ? [node.box.x, node.box.x + node.box.width] : [node.box.y, node.box.y + node.box.height]).map((at) => scale.toValue(at)));
      fitted[axis.name] = fittedScale(Math.min(...days), Math.max(...days));
    }
    return Object.keys(fitted).length === 0 ? undefined : fitted;
  }

  // What the canvas says while it has nothing to show (DISL 6.13, `canvas.empty`): its text, where its `when` holds, in its style.
  function emptyMessage(open: Open, viewpoint: string): Scene['empty'] {
    const notation = viewpoints.value.all[viewpoint].notation;
    const empty = notation.canvas.declared.empty;
    if (!isObject(empty)) return undefined;
    const scope = texts.world(open.model).scope(undefined);
    const holds = empty.when === undefined ? open.model.elements.length === 0 : texts.holds(empty.when, scope, false);
    const text = holds ? texts.worded(empty.text as Parameters<typeof texts.worded>[0], scope, '') : '';
    if (text === '') return undefined;
    const font = styleOf(notation, empty.style as Parameters<typeof styleOf>[1]).font;
    return { text, ...(typeof font?.size === 'number' ? { fontSize: font.size } : {}), ...(font?.color === undefined ? {} : { colour: font.color }) };
  }

  // ---- the panels ----

  function tools(source: Source): ToolboxEntry[] {
    const open = opened(source);
    if (open.refusal !== undefined) return [];
    const scope = texts.scope({ model: open.model, env: situationOf(open, {}).env });
    const all = (groups: readonly ToolGroup[]): ToolboxEntry[] => groups.filter((group) => texts.holds(group.visible, scope, true)).flatMap((group) => [
      ...group.tools.filter((tool) => texts.holds(tool.visible, scope, true)).map((tool) => ({ id: wire.tool(tool.id), label: texts.worded(tool.label, scope, tool.id), icon: tool.icon ?? '', description: tool.doc ?? '' })),
      ...all(group.groups),
    ]);
    return all(groupsIn(toolbox.value, viewpoints.value.default));
  }

  /** The rows of the form of an element, each with the label of the container it is in. */
  function rowsOf(on: Subject, type: string | undefined): { readonly item: FormItem; readonly group: string }[] {
    const rows = (items: readonly FormItem[], group: string): { readonly item: FormItem; readonly group: string }[] => items.flatMap((item) => {
      if (!item.visible(on)) return [];
      if (item.kind === 'field' || item.kind === 'computed' || item.kind === 'type') return [{ item, group }];
      return rows(item.items, item.label(on) || group);
    });
    return rows(formFor(forms.value, type).items, '');
  }

  function fields(source: Source, selection: readonly string[]): Field[] {
    const open = opened(source);
    // With nothing selected, the diagram's own form where the definition declares one (DISL 7.5, `for: "diagram"`), its rows edited under the id ''.
    const element = selection.length === 1 ? elementOf(open.model, selection[0]) : undefined;
    if (!element && (selection.length > 0 || formFor(forms.value, undefined).generated)) return [];
    const on: Subject = { model: open.model, ...(element ? { element: element.id } : {}), env: situationOf(open, {}).env };
    return rowsOf(on, element?.type).map(({ item, group }): Field => {
      const marks = item.widget === 'slider' && Array.isArray(item.widgetOptions.marks) ? (item.widgetOptions.marks as unknown[]).flatMap((mark) => (isObject(mark) && typeof mark.label === 'string' ? [mark.label] : [])) : [];
      const options = marks.length > 0 ? marks : item.options(on).map((option) => option.label);
      const locked = item.readOnly(on);
      // Every attribute of a derived node is read-only (DISL 4.11.2), with its reason.
      // A link is shown by its cached name and chosen with the host's lookup, never typed (DISL 0.12, 7.3, `lookup`).
      const lookup = item.widget === 'lookup';
      const readOnly = open.refusal ?? element?.derived?.reason ?? (locked.readOnly ? locked.reason ?? NO_ROW : lookup ? PICKED_LINK : undefined);
      const shown = item.display(on);
      return {
        id: wire.property(item.rowId(on)), label: item.label(on), group, control: controls[item.widget] ?? 'text', value: lookup && typeof shown === 'string' ? linkShown(element, shown) : shown,
        ...(options.length > 0 ? { options } : {}), ...(placeholders[item.widget] === undefined ? {} : { placeholder: placeholders[item.widget] }), ...(readOnly === undefined ? {} : { readOnly }),
      };
    });
  }

  /** A link as a field shows it (DISL 7.3, `lookup`): its target's current name while it resolves, else the name it caches, else as written. */
  const linkShown = (element: ModelElement | undefined, text: string): string => {
    const label = element === undefined ? undefined : metamodel.value.types[element.type]?.labelAttribute;
    const current = element?.linked !== undefined && label !== undefined ? element.attributes[label] : undefined;
    return typeof current === 'string' ? current : cachedName(parseLink(text) ?? { documentId: '', documentName: '' }) ?? text;
  };

  /** The entries the menu of a target offers, each with the id it is asked for by. */
  const offersOf = (open: Open, target: string | undefined, situation: Situation): { readonly entry: OfferedEntry; readonly id: string }[] => {
    const type = target === undefined ? undefined : (elementOf(open.model, target) ?? open.derived.find((relation) => relation.id === target))?.type;
    const lineage = type === undefined ? [] : metamodel.value.types[type]?.lineage ?? [type];
    return behavior.value.menu(open.model, target, situation).groups.flat().map((entry) => ({ entry, id: wire.action(entry.operation ?? entry.kind, lineage, entry.args) }));
  };

  function actions(source: Source, selection: readonly string[], options: ViewOptions = {}): Action[] {
    scaled(options);
    const open = opened(source);
    const line = selection.length === 1 ? open.derived.find((relation) => relation.id === selection[0]) : undefined;
    const target = selection.length === 1 && (line ?? elementOf(open.model, selection[0])) ? selection[0] : undefined;
    // In a document that cannot be edited, what is left is what changes nothing of it: a fold, a link followed.
    const offered = offersOf(open, target, situationOf(open, options))
      .filter(({ entry }) => open.refusal === undefined || (!open.unreadable && behavior.value.operations.find((operation) => operation.id === entry.operation)?.viewOnly === true));
    // A derived relation whose removal its definition maps to an operation, and that has no menu of its own, is removed by the host's own entry: see docs/disl-support.md.
    if (line && offered.length === 0 && open.refusal === undefined && Object.hasOwn(line.edits, 'delete')) return [{ id: 'delete', label: 'Delete', shortcut: 'Delete', enabled: true }];
    // What the tool type exports is offered on the diagram itself, after its own entries, in a document that cannot be edited too: an export changes nothing of it.
    const exporting = selection.length === 0 ? exportOffers.map((offer): Action => ({ id: exportAction(offer.id), label: offer.label, enabled: true })) : [];
    // In a workspace, an element's links are the host's to open, in a document that cannot be edited too (FBL 17.5).
    const element = target === undefined || line ? undefined : elementOf(open.model, target);
    const linking = element !== undefined && source.links !== undefined && !open.unreadable && !('source' in element) ? linkEntries(metamodel.value, element, source.links, source.linkPath ?? source.fileName) : [];
    return [...offered.map(({ entry, id }): Action => ({
      id, label: entry.label,
      ...(entry.icon === undefined ? {} : { icon: entry.icon }), ...(entry.shortcut === undefined ? {} : { shortcut: entry.shortcut }),
      enabled: entry.enabled, ...(entry.reason === undefined ? {} : { disabledReason: entry.reason }),
    })), ...linking, ...exporting];
  }

  /** The file an export writes: the model as read, and the centre of each node where the canvas draws it with these options. */
  function exported(source: Source, id: string, options: ViewOptions, moment: Date): Exported | undefined {
    scaled(options);
    const writer = exportLogic?.exports.find((offer) => offer.id === id);
    if (!writer) return undefined;
    const open = opened(source);
    // The scene keeps a box to six decimals; its centre is kept to as many, so that a point the registration states is the point written.
    const sixth = (value: number): number => Math.round(value * 1e6) / 1e6 + 0;
    const centres = Object.fromEntries(sceneOf(open, options).nodes.map((node) => [node.id, { x: sixth(node.box.x + node.box.width / 2), y: sixth(node.box.y + node.box.height / 2) }]));
    const base = source.fileName.slice(Math.max(source.fileName.lastIndexOf('/'), source.fileName.lastIndexOf('\\')) + 1);
    const stem = base.lastIndexOf('.') > 0 ? base.slice(0, base.lastIndexOf('.')) : base;
    return { name: writer.name(stem, moment), text: writer.write({ model: open.model, stem, centres }) };
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
    return row && wire.property(row.item.rowId(on));
  };

  /**
   * A set of an entry's attributes that the tool type's reading logic writes itself, as the statement written
   * again over the entry's own span (`restate`): planned against the body as it was read, so for a request that
   * writes that one entry, or several entries each once.
   */
  function restatedStep(source: Source, open: Open, step: ModelChange): Edit['splices'][number] | undefined {
    if (step.kind !== 'set' || readingLogic?.restate === undefined) return undefined;
    const entry = open.read.elements.find((element) => element.id === step.id);
    if (!entry) return undefined;
    const bytes = encode(source.text);
    const text = readingLogic.restate(decode(bytes.subarray(entry.ownSpan.start, entry.ownSpan.end)), step.attributes);
    return text === undefined ? undefined : { operation: 're-emit-line', start: entry.ownSpan.start, end: entry.ownSpan.end, text };
  }

  /** The steps of load-time validation (FBL 17.4) a document's next write carries: its document id where it has none, and each link written again. */
  function loadTimeSteps(open: Open): readonly ModelChange[] | Refused {
    const links: Change[] = open.refreshed.map((link) => ({ kind: 'set', id: link.element, attributes: { [link.attribute]: link.text, ...(link.label === undefined ? {} : { [link.label.attribute]: link.label.name }) } }));
    const refreshed = links.length === 0 ? [] : modelChangesOf(links, { binding: open.binding, metamodel: metamodel.value, persistence: persistence.value, read: open.read, ...(open.entries ? { entries: open.entries } : {}) }, open.model);
    if ('refused' in refreshed) return refreshed;
    return [...(open.needsId ? [{ kind: 'setDocumentId' as const, id: newDocumentId(persistence.value) }] : []), ...refreshed];
  }

  /** What an intent came to, as the outcome of the request: its changes planned by the library as splices of the text. */
  function carriedOut(source: Source, open: Open, outcome: Outcome, viewpoint: string, options: ViewOptions): EditOutcome {
    if (outcome.refused !== undefined) return { kind: 'refused', sentence: outcome.refused };
    const link = outcome.effects.find((effect) => effect.kind === 'open' && effect.message !== undefined);
    if (link && outcome.changes.length === 0) return { kind: 'open', path: link.message! };
    const modelSteps = modelChangesOf(outcome.changes, { binding: open.binding, metamodel: metamodel.value, persistence: persistence.value, read: open.read, ...(open.entries ? { entries: open.entries } : {}) }, open.model);
    if ('refused' in modelSteps) return { kind: 'refused', sentence: modelSteps.refused };
    const standard = (filter: string): Value | null => {
      const value = notation.value.canvas.filters[filter].default;
      const computed = isCel(value) ? expressions.evaluate(value, texts.scope({ model: open.model })) : undefined;
      return computed ? (computed.ok ? computed.value : null) : (value as Value);
    };
    // A pin that is kept beside the document is a corner of its registration's layout, and no step of the body.
    const pinning = (change: ViewChange): boolean => keptBeside && (change.kind === 'pin' || change.kind === 'unpin');
    const viewSteps = viewStepsOf(outcome.view.filter((change) => !pinning(change)), persistence.value.view.bind, open.binding, open.read, standard);
    if ('refused' in viewSteps) return { kind: 'refused', sentence: viewSteps.refused };
    // The corners after the request: each follows its element to the id that has afterwards, one of an element that is gone stays as the registration has it, as the standalone host leaves it, and each pin is the corner of the box it is the placement's point of.
    let registration: string | undefined;
    if (keptBeside && (outcome.renamed.size > 0 || outcome.view.some(pinning))) {
      const was = new Map([...outcome.renamed].map(([before, after]) => [after, before]));
      const corners: Record<string, Corner> = {};
      for (const [id, corner] of Object.entries(open.corners)) {
        const now = outcome.renamed.get(id) ?? id;
        corners[now] = corner;
      }
      const drawn = sceneOf(open, options).nodes;
      for (const change of outcome.view) {
        if (change.kind === 'unpin') delete corners[change.element];
        if (change.kind !== 'pin') continue;
        const node = drawn.find((candidate) => candidate.id === (was.get(change.element) ?? change.element));
        const [fx, fy] = node ? anchorOf(nodeNotation(viewpoints.value.all[viewpoint].notation, metamodel.value, node.type).placement.anchor) : [0, 0];
        // One created by this request is kept under the id it is read under once written: its natural id where it has one (DISL 11.5.1).
        const made = outcome.created.includes(change.element) ? outcome.after.elements.find((element) => element.id === change.element) : undefined;
        const kept = (made && naturalId(persistence.value, metamodel.value, made.type, made.attributes)) ?? change.element;
        corners[kept] = keptAnchored(open.binding) ? { x: change.x, y: change.y } : { x: change.x - fx * (node?.box.width ?? 0), y: change.y - fy * (node?.box.height ?? 0) };
      }
      // The registration is written when there is first something to keep in it, where the binding lets it be created, and the placement is refused otherwise (FBL 8.4).
      if (source.registration === undefined && Object.keys(corners).length > 0 && !open.binding.registration.createOnFirstPlacement) return { kind: 'refused', sentence: messages.registrationNotCreated(nameOf(source.fileName)) };
      const text = source.registration ?? (Object.keys(corners).length > 0 ? newRegistration(origin) : undefined);
      const next = text === undefined ? undefined : withLayout(text, corners);
      if (next !== source.registration) registration = next;
    }
    // With any write go the entries of view data that are about nothing, the last first, so that one named by its place is still at that place (DISL 11.6).
    const written = modelSteps.length + viewSteps.length > 0;
    // With the first write goes what load-time validation writes (FBL 17.4): the document id, and the links resolution found otherwise, in one step of the history.
    const validation = written ? loadTimeSteps(open) : [];
    if ('refused' in validation) return { kind: 'refused', sentence: validation.refused };
    const steps = [...validation, ...(written ? [...open.stale].reverse().map((id) => ({ kind: 'remove' as const, id })) : []), ...modelSteps, ...viewSteps];
    // Each step is planned against the body the one before left; FBL's own history is not used (research R5).
    const body = steps.length > 0 ? bodyOf(open.binding, source, open.named) : undefined;
    const edits: Edit[] = [];
    // Values set on entries that are each named once touch no byte of one another: they are planned against the one body,
    // which is read once and not once for every step, and are one edit.
    const apart = steps.length > 1 && steps.every((step) => step.kind === 'set') && new Set(steps.map((step) => (step.kind === 'set' ? step.id : ''))).size === steps.length;
    if (apart || (steps.length === 1 && restatedStep(source, open, steps[0]) !== undefined)) {
      const splices: Edit['splices'][number][] = [];
      for (const step of steps) {
        const own = restatedStep(source, open, step);
        if (own) {
          splices.push(own);
          continue;
        }
        const planned = body!.plan(step);
        if ('refused' in planned) return { kind: 'refused', sentence: planned.refused };
        splices.push(...planned.planned.splices);
      }
      edits.push({ splices: splices.map((splice, index) => ({ splice, index })).sort((one, other) => one.splice.start - other.splice.start || one.index - other.index).map((entry) => entry.splice) });
    }
    for (const step of edits.length > 0 ? [] : steps) {
      const planned = body!.change(step);
      if ('refused' in planned) return { kind: 'refused', sentence: planned.refused };
      edits.push(planned.planned);
    }
    const asked = outcome.effects.find((effect) => (effect.kind === 'select' || effect.kind === 'editLabel') && effect.elements.length > 0);
    const madeFirst = outcome.after.elements.find((element) => element.id === outcome.created[0]);
    const shown = madeFirst && (naturalId(persistence.value, metamodel.value, madeFirst.type, madeFirst.attributes) ?? madeFirst.id);
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
      ...(registration === undefined ? {} : { registration }),
      ...(asked ? { select: asked.elements[0] } : {}),
      // What a gesture made is brought into view where nothing selects it, so a node made off screen is seen (a host rule, docs/disl-support.md).
      ...(!asked && shown !== undefined ? { show: shown } : {}),
      ...(editing === undefined ? {} : { editLabel: true, multiline: editing === 'multiline' }),
      ...(Object.keys(folds).length === 0 ? {} : { viewOptions: { ...options, collapsed: { ...options.collapsed, ...folds } } }),
    };
  }

  function edit(source: Source, request: EditRequest, options: ViewOptions, confirmed: boolean): EditOutcome {
    scaled(options);
    // An export asked for from the menu is the extension's to write: it changes nothing of the document, which may be read-only.
    const asked = request.kind === 'action' ? exportOf(request.action) : undefined;
    if (asked !== undefined && exportOffers.some((offer) => offer.id === asked)) return { kind: 'export', export: asked };
    const open = opened(source);
    const { model } = open;
    const intents = behavior.value;
    // The host's entries for links change nothing of the document (FBL 17.5).
    if (request.kind === 'action' && (request.action === OPEN_LINKED || request.action === LINKED_FROM)) {
      const element = request.id === undefined ? undefined : elementOf(model, request.id);
      if (!element || source.links === undefined || 'source' in element) return { kind: 'refused', sentence: GONE };
      if (request.action === LINKED_FROM) return { kind: 'backlinks', backlinks: backlinksOf(source.links, source.linkPath ?? source.fileName, element.id) };
      const target = linkTarget(metamodel.value, element, source.links);
      return target ? { kind: 'openLinked', ...target } : { kind: 'refused', sentence: NO_TARGET };
    }
    // What changes nothing of the document is not an edit: a fold, and an operation of viewer state, are answered in a read-only document too (DISL 9.4).
    const picked = request.kind === 'action' ? request.picked : undefined;
    const situation: Situation = { ...situationOf(open, options), ...(picked === undefined ? {} : { picked }) };
    // What an action that is asked for is: the entry of the menu that has its id, with the arguments that entry gives; else what the id
    // stands for by the definition's own mapping, the first that applies to what is selected; else the operation or the kind of that name.
    const meant = (action: string, asked: string | undefined): { readonly name: string; readonly args?: Readonly<Record<string, Value>> } => {
      // The diagram itself is asked on as no element, also where the id '' names it.
      const target = asked === '' ? undefined : asked;
      // Of several an id stands for, the one that runs on what it is asked on, and that reads a point only where one is given:
      // an operation on the diagram is offered on any selection, so one on the element asked on goes first (a host rule, docs/disl-support.md).
      const pointed = request.kind === 'action' && request.x !== undefined && request.y !== undefined;
      const declared = (key: string) => intents.operations.find((operation) => operation.id === key);
      const offer = offersOf(open, target, situation).find((candidate) => candidate.id === action && (declared(candidate.entry.operation ?? '')?.placed ?? pointed) === pointed);
      if (offer) return { name: offer.entry.operation ?? offer.entry.kind, ...(offer.entry.args ? { args: offer.entry.args } : {}) };
      const candidates = wire.actionsOf(action);
      const fitting = (key: string) => (declared(key)?.placed ?? pointed) === pointed && (target === undefined) === (declared(key)?.for.includes('diagram') ?? target === undefined);
      const offered = candidates.filter((candidate) => intents.availability(model, candidate.key, target === undefined ? [] : [target], situation).offered);
      const applying = offered.find((candidate) => fitting(candidate.key)) ?? offered.find((candidate) => (declared(candidate.key)?.placed ?? pointed) === pointed) ?? offered[0] ?? candidates[0];
      return applying ? { name: applying.key, args: applying.args } : { name: action };
    };
    const acting = request.kind === 'action' ? meant(request.action, request.id) : undefined;
    const viewing = (request.kind === 'fold' && request.group === undefined) || request.kind === 'openLink'
      || (acting !== undefined && intents.operations.find((operation) => operation.id === acting.name)?.viewOnly === true);
    if (open.refusal !== undefined && (open.unreadable || !viewing)) return { kind: 'refused', sentence: open.refusal };
    const viewpoint = viewpointOf(options);
    const refused = (sentence: string): EditOutcome => ({ kind: 'refused', sentence });
    // A `lookup` the host has not answered yet is asked of it (DISL 9.4), over the documents of the workspace.
    const done = (outcome: Outcome): EditOutcome => {
      if (outcome.refused !== NOT_PICKED) return carriedOut(source, open, outcome, viewpoint, options);
      if (source.links === undefined) return refused(NO_WORKSPACE);
      const origins = acting === undefined ? undefined : lookupOrigins.get(acting.name);
      return { kind: 'lookup', ...(origins === undefined ? {} : { origins }) };
    };
    const nodeOf = (id: string) => sceneOf(open, options).nodes.find((node) => node.id === id);

    // A gesture that would change a derived node, or join a relation to one, is refused with its reason (DISL 4.11.4);
    // moving, sizing, folding and pinning it change the view alone.
    const derivedNode = (id: string | undefined) => (id === undefined ? undefined : elementOf(model, id)?.derived);
    const changed = request.kind === 'rename' || request.kind === 'setField' || request.kind === 'reparent' || (request.kind === 'action' && !viewing)
      ? derivedNode(request.id)
      : request.kind === 'connect' ? derivedNode(request.from) ?? derivedNode(request.to) : undefined;
    if (changed) return refused(changed.reason);

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
        // operation needs an element and the point is on none, nothing happens, but for an entry activated in ADP
        // Toolbox's view, which runs on the selection or the first element drawn: a host rule, see docs/disl-support.md.
        // A tool with `drop.targets` is resolved by what it lands on, so the core is told that too (DISL 7.2).
        const entry = wire.toolOf(request.entry);
        const used = Object.hasOwn(toolbox.value.tools, entry) ? toolbox.value.tools[entry] : undefined;
        const operation = used?.operation;
        const targeted = used?.drop?.place === undefined && (used?.drop?.targets?.length ?? 0) > 0;
        const nodes = operation === undefined && !targeted ? [] : sceneOf(open, options).nodes;
        const hit = [...nodes].reverse().find((node) => request.x >= node.box.x && request.x <= node.box.x + node.box.width && request.y >= node.box.y && request.y <= node.box.y + node.box.height)?.id;
        // An entry activated in ADP Toolbox's view lands at a free point, on no element: an operation that needs one runs on the
        // selected element it is offered on, else on the first element drawn that it is, so a new mind map's Node entry adds a
        // node under its central topic rather than nothing at all.
        const offeredOn = (id: string): boolean => operation !== undefined && intents.availability(model, operation, [id], situation).offered;
        const under = hit ?? (request.selected === undefined || operation === undefined || targeted || intents.availability(model, operation, [], situation).offered ? undefined
          : request.selected.find(offeredOn) ?? nodes.map((node) => node.id).find(offeredOn));
        // A target that runs an operation on what it lands on is that operation's entry there, its form and its refusals included.
        const landed = targeted && under !== undefined ? elementOf(model, under) : undefined;
        const target = landed && used?.drop?.targets?.find((candidate) => candidate.on.some((type) => isA(metamodel.value, landed.type, type)));
        if (target?.operation !== undefined) {
          return edit(source, { kind: 'action', action: target.operation, id: under, x: request.x, y: request.y, ...(request.params === undefined ? {} : { params: request.params }), ...(request.check === undefined ? {} : { check: request.check }) }, options, confirmed);
        }
        if (operation !== undefined && !targeted && under === undefined && !intents.availability(model, operation, [], situation).offered) return { kind: 'applied', splices: [] };
        return done(intents.create(model, entry, inBase({ x: request.x, y: request.y }), situation, under));
      }
      case 'move': {
        const node = nodeOf(request.id);
        // A move the notation switches off, of a node that does not move or of a relation, is refused with its `refusals.move`, first (DISL 6.9).
        const declined = node && (node.movable.x || node.movable.y) ? undefined : gestureRefusal(model, request.id, 'move', situation.env, viewpoints.value.all[viewpoint].notation);
        if (declined !== undefined) return refused(declined);
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
        // The anchor a line leaves decides its direction where the edge type maps it (`connect.from`, DISL 6.10):
        // drawn out of an anchor mapped to `target`, the element it leaves is the target.
        const drawnFrom = elementOf(model, request.from);
        const reversed = drawnFrom !== undefined && request.fromAnchor !== undefined && Object.values(metamodel.value.types).filter(isRelation)
          .some((type) => type.target.types.some((end) => isA(metamodel.value, drawnFrom.type, end)) && edgeNotation(viewpoints.value.all[viewpoint].notation, metamodel.value, type.name).connect?.from?.[request.fromAnchor!] === 'target');
        if (request.toPoint !== undefined && request.to === '') {
          if (!drawnFrom) return refused(GONE);
          // Let go on empty canvas: the edge type's library tool (`connect.tool`) makes the other end there, as one edit (DISL 7.2).
          const making = Object.values(metamodel.value.types).filter(isRelation).map((type) => edgeNotation(viewpoints.value.all[viewpoint].notation, metamodel.value, type.name).connect?.tool)
            .find((tool): tool is string => tool !== undefined && Object.hasOwn(toolbox.value.tools, tool) && (reversed ? toolbox.value.tools[tool].createSource : toolbox.value.tools[tool].createTarget) !== undefined);
          if (making === undefined) return refused(NOT_HERE);
          return done(intents.connectNew(model, making, request.from, reversed ? 'source' : 'target', inBase(request.toPoint), situation));
        }
        if (reversed) return edit(source, { kind: 'connect', from: request.to, to: request.from, ...(request.toEnd === undefined ? {} : { fromEnd: request.toEnd }), ...(request.fromEnd === undefined ? {} : { toEnd: request.fromEnd }) }, options, confirmed);
        if (!elementOf(model, request.from) || !elementOf(model, request.to)) return refused(GONE);
        // simplified: the first relation the definition offers for the two; give the request the type when a definition offers several.
        const connection = intents.menu(model, { source: request.from, target: request.to }, situation);
        // A connection menu of one operation that `runSingle` runs at once is the gesture: it states the relation itself (DISL 7.3).
        const only = connection.runSingle && connection.groups.flat().length === 1 ? connection.groups.flat()[0] : undefined;
        if (only?.operation !== undefined) return only.enabled ? done(intents.operate(model, only.operation, [], situation, undefined, only.args)) : refused(only.reason ?? NOT_HERE);
        const offered = connection.groups.flat().find((entry) => entry.via !== undefined);
        if (offered && !offered.enabled) return refused(offered.reason ?? NOT_HERE);
        // Where the definition offers none, the relation is the one whose ends allow the two: the first that takes both, else the first that takes
        // the one the line starts at, which then refuses the other end with the sentence of `std.endpoints` (DISL 8.7).
        const [from, to] = [elementOf(model, request.from)!.type, elementOf(model, request.to)!.type];
        const relations = Object.values(metamodel.value.types).filter(isRelation);
        const joining = offered?.via ?? (relations.find((type) => type.source.types.includes(from) && type.target.types.includes(to)) ?? relations.find((type) => type.source.types.includes(from)))?.name;
        if (joining === undefined) return refused(NOT_HERE);
        return done(intents.connect(model, joining, request.from, request.to, { source: endOf(request.fromEnd), target: endOf(request.toEnd) }, situation));
      }
      case 'moveEnd': {
        // An end is put on a part its node draws that an end may be on, on a side of it, at a share of that side from 0 to 1.
        const place = endOf(request.value);
        const edge = sceneOf(open, options).edges.find((candidate) => candidate.id === request.id);
        const on = nodeOf((request.end === 'from' ? edge?.source : edge?.target) ?? '');
        const sides: readonly string[] = ['top', 'right', 'bottom', 'left'];
        const placed = place && on?.parts.some((part) => part.id === place.part && part.anchor === true) === true && sides.includes(place.side ?? '') && place.at !== undefined && place.at >= 0 && place.at <= 1;
        if (edge && on && on.parts.some((part) => part.anchor === true) && !placed) return refused(NO_PLACE);
        return done(intents.reattach(model, request.id, request.end === 'from' ? 'source' : 'target', place ?? {}, situation));
      }
      case 'rename':
        return done(intents.editLabel(model, request.id, request.text, situation));
      case 'setField': {
        // A row of the diagram's own form is named under the id ''.
        if (request.id === '') {
          const on: Subject = { model, env: situation.env };
          const row = rowsOf(on, undefined).find(({ item }) => wire.property(item.rowId(on)) === request.field || item.rowId(on) === request.field);
          return row ? done(intents.edit(model, undefined, row.item, request.value, situation)) : refused(NO_ROW);
        }
        const element = elementOf(model, request.id);
        if (!element) return refused(GONE);
        const on: Subject = { model, element: element.id, env: situation.env };
        const row = rowsOf(on, element.type).find(({ item }) => wire.property(item.rowId(on)) === request.field || item.rowId(on) === request.field);
        if (!row) return refused(NO_ROW);
        // An attribute that an operation of the definition sets from its one parameter is set by that operation, so that what it does beside is done too.
        const setting = row.item.attribute === undefined ? undefined : intents.operations.find((operation) => operation.asks === row.item.attribute && operation.param !== undefined && intents.availability(model, operation.id, [element.id], situation).offered);
        const parsed = setting ? row.item.parse(on, request.value) : undefined;
        if (setting && parsed && 'refused' in parsed) return refused(parsed.refused);
        const given = parsed && 'set' in parsed ? parsed.set[row.item.attribute!] : undefined;
        if (setting && given !== undefined && given !== null) return done(intents.operate(model, setting.id, [element.id], situation, undefined, { [setting.param!]: given }));
        return done(intents.edit(model, element.id, row.item, request.value, situation));
      }
      case 'action': {
        const { id } = request;
        if (id !== undefined && !elementOf(model, id) && !open.derived.some((relation) => relation.id === id)) return refused(GONE);
        const selection = id === undefined ? [] : [id];
        const asking = (prompt: { readonly title: string; readonly message: string; readonly confirmLabel: string; readonly danger: boolean }): EditOutcome =>
          ({ kind: 'confirm', title: prompt.title, message: prompt.message, confirmLabel: prompt.confirmLabel, danger: prompt.danger });
        const { name, args } = acting!;
        const operation = intents.operations.find((candidate) => candidate.id === name);
        if (operation) {
          const state = intents.availability(model, name, selection, situation);
          if (state.offered && state.available && state.confirm && !confirmed) return asking(state.confirm);
          if (state.offered && state.available && operation.plugin !== undefined) {
            // The operation is a plugin's: what it answers is the outcome, and changes it makes are planned as any other.
            const result = plugins.action(operation.plugin)?.run({ source, model, selection });
            if (!result) return { kind: 'applied', splices: [] };
            if (result.kind === 'pickPath') return { ...result, field: wire.property(result.field) };
            return result.kind === 'changes' ? done({ changes: result.changes, after: applyChanges(model, result.changes), created: [], effects: [], collapsed: {}, view: [], renamed: new Map() }) : result;
          }
          // An operation that asks its parameters in a form of its own asks them first (DISL 9.4, `paramsForm`): the answers come back as `params`.
          const declared = isObject(specification.behavior) && isObject(specification.behavior.operations) ? specification.behavior.operations[name] : undefined;
          const paramsForm = isObject(declared) && typeof declared.paramsForm === 'string' ? forms.value.all[declared.paramsForm] : undefined;
          // A form that asks a text of several lines is answered in ADP Properties, as an input box holds one line.
          const oneLine = paramsForm !== undefined && paramsForm.items.every((item) => item.attribute === undefined || item.widget !== 'textarea');
          if (paramsForm && oneLine && state.offered && state.available) {
            const on: Subject = { model, ...(id === undefined ? {} : { element: id }), env: situation.env };
            const asked = paramsForm.items.filter((item) => item.attribute !== undefined);
            if (request.params === undefined) {
              const fields = asked.map((item) => ({ param: item.attribute!, label: item.label(on), initial: askedText(item.initial(on)) }));
              return { kind: 'ask', title: paramsForm.label(on) || name, ...(paramsForm.icon === undefined ? {} : { icon: paramsForm.icon }), confirmLabel: paramsForm.submitLabel(on) || 'OK', fields };
            }
            // A check is of the values given so far, as the form validates them; a commit runs the operation, whose own aborts speak, as the standalone host's does.
            if (request.check === true) {
              for (const item of asked) {
                if (!Object.hasOwn(request.params, item.attribute!)) continue;
                const invalid = item.validate(on, request.params[item.attribute!] ?? '');
                if (invalid !== undefined) return refused(invalid);
              }
              return { kind: 'applied', splices: [] };
            }
            return done(intents.operate(model, name, selection, situation, undefined, { ...args, ...request.params }));
          }
          // A request carries no parameters, and this host has no dialog to ask them in: the value is asked in ADP Properties, at the row of the attribute the operation sets.
          const field = state.offered && state.available && id !== undefined ? rowOf(open, situation, id, operation.asks) : undefined;
          if (field !== undefined) return { kind: 'showField', field };
          // Where the request names no point, the middle of what is shown is the point.
          const shown = options.viewport;
          const at = request.x !== undefined && request.y !== undefined ? { x: request.x, y: request.y } : shown ? { x: shown.x + shown.width / 2, y: shown.y + shown.height / 2 } : undefined;
          // Parameters the operation states and no row of ADP Properties holds are asked in a dialog, each with its default, and come back as `params` (DISL 9.4).
          const parameters = state.offered && state.available ? intents.parameters(model, name, selection, situation).filter((parameter) => args === undefined || !Object.hasOwn(args, parameter.name)) : [];
          if (parameters.length > 0 && request.params === undefined) {
            return { kind: 'ask', title: state.label, confirmLabel: 'OK', fields: parameters.map((parameter) => ({ param: parameter.name, label: parameter.label, initial: parameter.initial })) };
          }
          return done(intents.operate(model, name, selection, situation, at && inBase(at), { ...args, ...request.params }));
        }
        if (name === 'delete' && id !== undefined) {
          const removal = intents.deletion(model, selection, situation);
          if (removal.refused !== undefined) return refused(removal.refused);
          // Before an element with backlinks goes, how many links the delete breaks is said (FBL 17.5).
          const breaking = source.links === undefined ? 0 : source.links.brokenByDeleting(source.linkPath ?? source.fileName, removal.removes);
          const confirm = breaking === 0 ? removal.confirm
            : { title: removal.confirm?.title ?? 'Delete', message: [removal.confirm?.message, breaksLinks(breaking)].filter(Boolean).join(' '), confirmLabel: removal.confirm?.confirmLabel ?? 'Delete', danger: true };
          return confirm && !confirmed ? asking(confirm) : done(intents.remove(model, selection, situation));
        }
        // The standard entries of DISL 7.3 that a definition lists by their kind.
        if (name === 'pin' && id !== undefined) return done(intents.pin(model, id, situation.at?.(id), situation));
        if (name === 'unpin' && id !== undefined) return done(intents.unpin(model, [id], situation));
        if (name === 'unpinAll') return done(intents.unpin(model, undefined, situation));
        if (name === 'create-child' && id !== undefined) return done(intents.createChild(model, id, situation));
        if ((name === 'moveUp' || name === 'moveDown') && id !== undefined) return done(intents.shift(model, id, name === 'moveUp' ? -1 : 1, situation));
        if (name === 'editLabel' && id !== undefined) {
          const editing = editedLabel(model, id, viewpoint);
          if (editing?.how !== 'form') return editing ? { kind: 'editInPlace', id, multiline: editing.how === 'multiline' } : refused(NO_TEXT);
          // A label the definition edits in a form is edited in ADP Properties, at the row of the attribute it shows.
          const field = rowOf(open, situation, id, editing.attribute);
          return field === undefined ? refused(NO_TEXT) : { kind: 'showField', field };
        }
        return refused(intents.message('std.notApplicable', model, situation) ?? 'This cannot be done with what is selected.');
      }
      case 'reparent': {
        // A node that does not move is dragged only to go under another; where that is refused, the sentence is its type's for the gesture, `reparent`, else `move` (DISL 6.9).
        const outcome = done(intents.reparent(model, request.id, request.parent, request.index, situation));
        const node = nodeOf(request.id);
        if (outcome.kind !== 'refused' || !node || node.movable.x || node.movable.y) return outcome;
        const declined = gestureRefusal(model, request.id, 'reparent', situation.env, viewpoints.value.all[viewpoint].notation) ?? gestureRefusal(model, request.id, 'move', situation.env, viewpoints.value.all[viewpoint].notation);
        return declined === undefined ? outcome : refused(declined);
      }
      case 'fold': {
        if (!elementOf(model, request.id)) return refused(GONE);
        // The state of a group of a node's items is kept with the diagram: an edit (DISL 6.9).
        if (request.group !== undefined) return done(intents.fold(model, request.id, request.group, request.folded, situation));
        // Viewer state (DISL 11.6): nothing is written, so there are no splices and no undo step.
        return nodeOf(request.id)?.fold === undefined ? refused(NOT_HERE) : { kind: 'applied', splices: [], viewOptions: { ...options, collapsed: { ...options.collapsed, [request.id]: request.folded } } };
      }
      case 'openLink': {
        if (!elementOf(model, request.id)) return refused(GONE);
        if (request.compartment !== undefined) {
          // The link symbol of an item: the link is the one the scene drew it with, and it is opened as the `open` action opens one (DISL 6.9, 9.4).
          const items = nodeOf(request.id)?.compartments.find((compartment) => compartment.id === request.compartment)?.rows.filter((row) => row.kind === 'item') ?? [];
          const link = items[request.item ?? 0]?.link;
          if (link === undefined) return refused(NO_LINK);
          const kind = linkKind(link);
          return kind.kind === 'uri' && kind.scheme !== 'http' && kind.scheme !== 'https' ? refused(`The link "${link}" is neither an http or https address nor a path, so it is not opened.`) : { kind: 'open', path: link };
        }
        // The link is what the first operation offered on the element that opens one gives (DISL 9.4, `open`).
        const opening = intents.operations.find((operation) => {
          const state = operation.opens ? intents.availability(model, operation.id, [request.id], situation) : undefined;
          return state?.offered === true && state.available;
        });
        return opening ? done(intents.operate(model, opening.id, [request.id], situation)) : refused(NOT_HERE);
      }
      case 'pin': {
        if (!elementOf(model, request.id)) return refused(GONE);
        return done(request.pinned ? intents.pin(model, request.id, situation.at?.(request.id), situation) : intents.unpin(model, [request.id], situation));
      }
      case 'filter':
        return done(intents.filter(model, request.id, request.value as Value, situation));
      default:
        return refused(NOT_HERE);
    }
  }

  const language = specification.language;
  return {
    origin,
    kind: 'diagram',
    page: 'canvas',
    displayName: texts.worded(language.label, {}, definition.name),
    claims: claimsOf(bindings),
    claimed: (fileName, text) => claimingBinding(bindings, fileName, text) !== undefined,
    suggests: (fileName, text) => suggests(bindings, fileName, text),
    ...(folderBinding === undefined ? {} : {
      folderFiles: (paths: readonly string[]) => {
        const files = memoryFiles(paths);
        return recogniseFolder(folderBinding, '/', files) ? selectedFiles(folderBinding, '/', files).map((file) => file.relativePath) : [];
      },
    }),
    ...(dateAxes.length === 0 ? {} : { fittedScales }),
    // The index holds a document as its body says it (FBL 17.3), so it is read without the workspace.
    ...(persistence.value.documentId === undefined ? {} : {
      indexed: (source: Source) => {
        const open = opened(source.links === undefined ? source : { ...source, links: undefined });
        return open.unreadable ? undefined : indexedDocument(metamodel.value, open.model, source.linkPath ?? source.fileName, open.read.documentId);
      },
    }),
    findings: (source) => {
      const open = opened(source);
      return [...open.findings, ...(open.unreadable ? [] : createScene(sceneTool, open.model, measured).findings.map(framed)), ...ofDefinition, ...ofPlugins];
    },
    view,
    toolbox: tools,
    fields,
    actions,
    edit,
    exports: exportOffers,
    exported,
    newDocument: (name) => {
      const made = produceTemplate(bindings[0], undefined, name, () => crypto.randomUUID(), bindings[0].plugin && plugins.persistence(bindings[0].plugin.plugin));
      return made ? decode(made) : '';
    },
    newRegistration: (text) => registrationOfNew(bindings[0], origin, keptBeside, text),
    // A diagram's registration keeps nothing outside the history.
    restoreRegistration: (snapshot) => snapshot,
  };
}

/**
 * The registration a new document is created with (FBL 8.4): its origin line, in the new body's line
 * ending, when a document of the binding cannot be kept without one, because the binding claims a
 * file only when it is registered, or because the tool type keeps something in a registration
 * (`keepsBeside`) that the binding does not let be created by the first change. Without it, the first
 * change of a document made by "New ..." would be refused. Nothing for any other binding.
 */
/** The `origins` of the first `lookup` among an operation's actions, at any depth. */
function originsOf(declared: unknown): readonly string[] | undefined {
  if (Array.isArray(declared)) {
    for (const item of declared) {
      const found = originsOf(item);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isObject(declared)) return undefined;
  if (isObject(declared.lookup) && Array.isArray(declared.lookup.origins)) return declared.lookup.origins.filter((origin): origin is string => typeof origin === 'string');
  for (const value of Object.values(declared)) {
    const found = originsOf(value);
    if (found !== undefined) return found;
  }
  return undefined;
}

function registrationOfNew(binding: FblBinding, origin: string, keepsBeside: boolean, text: string): string | undefined {
  if (!binding.claims.registrationOnly && (!keepsBeside || binding.registration.createOnFirstPlacement)) return undefined;
  return `${origin}${new BodyText(encode(text)).dominantEnding ?? binding.text.newline}`;
}

// ---- a designer ----

/** What a transaction came to, where it was not refused. */
type Done = Exclude<Outcome, { readonly refused: string }>;

const emptyTable = (notice: string): TableView => ({ name: '', properties: [], rows: [], total: 0, views: [], settings: [], operations: {}, readOnly: true, notice });
const emptyHierarchy = (notice: string): HierarchyView => ({
  name: '', ids: 'shown', roles: { level: '', entry: '' }, mentions: {}, queryWords: { level: '', sort: '' }, readOnly: true, notice, roots: [], stray: [], lists: [], notes: [], noteKinds: [], filters: [], completions: {}, unhide: {}, sortKeys: [], widths: [], pageGestures: {}, findings: [], operations: {},
});

/**
 * A request or view options made again of a text whose unnumbered elements are numbered: every
 * name such an element had in memory (`line/<line>`, DESL 0.3) given as the id it now has, also
 * where it is a key, as a fold the session kept for it.
 */
function numberedIn<T>(given: T, unnumbered: readonly Unnumbered[]): T {
  const now = new Map(unnumbered.filter((element) => element.name !== element.newId).map((element) => [element.name, element.newId]));
  if (now.size === 0) return given;
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return now.get(value) ?? value;
    if (Array.isArray(value)) return value.map(walk);
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(Object.entries(value).map(([key, part]) => [now.get(key) ?? key, walk(part)]));
  };
  return walk(given) as T;
}

/** An element of a model the FBL library read, by where it stands in the reading: the same place in two readings of one body is the same entry. */
const placesOf = (before: FblModel, after: FblModel): Map<string, string> => new Map(before.elements.map((element, index) => [element.id, after.elements[index]?.id ?? element.id]));

/** The splices of an applied outcome as an edit of the text they were made for, to compose with edits made before them. */
const editOf = (splices: readonly TextSplice[]): Edit => ({ splices: splices.map((splice) => ({ operation: 'replace-value', start: splice.offset, end: splice.offset + splice.length, text: splice.text })) });

// The host's own sentences for a page of boxes, the standalone module's where it has one.
const ENTRY_GONE = 'That entry is no longer in this file.';
const NOT_RENUMBERED = 'Only an entry whose id another holds before it, or that has none yet, is given a new one.';
const IN_A_LEVEL = 'This is added inside a level: drop it onto one.';
const FOREIGN_REGISTRATION = 'The registration beside this document is of another designer type, so nothing is kept in it.';

/**
 * A designer's definition as a tool type (DESL 11, "Host"): its documents are read through the
 * binding their format family has, shown as the table or the page of boxes its surface names, and
 * changed by its operations, each one transaction that the FBL library plans as splices of the text
 * and, for what the registration keeps, of the registration.
 */
function designerFrom(definition: Definition, bindings: readonly FblBinding[], plugins: PluginRegistry): DesignerToolType {
  // ---- the definition, interpreted once ----

  const loaded = loadDesigner(definition.specification);
  const designer = loaded.value;
  const { persistence } = designer;
  const metamodel = interpretMetamodel(designer.interpreted);
  const expressions = expressionsOf(designer, metamodel.value);
  const constraints = interpretConstraints(designer.interpreted, metamodel.value, expressions);
  const language = designer.interpreted.language;
  const locale = language.defaultLocale ?? 'en';
  const surface = interpretSurface(designer.surface, metamodel.value, locale, { documentTypes: documentTypesOf(persistence), operations: Object.keys(designer.operations) });
  const tableSurface = surface.value?.kind === 'table' ? surface.value : undefined;
  const hierarchySurface = surface.value?.kind === 'hierarchy' ? surface.value : undefined;
  const sectionsSurface = surface.value?.kind === 'sections' ? surface.value : undefined;
  const operations = surface.value && interpretOperations(designer, surface.value, metamodel.value, expressions, constraints.value);
  // A document is read as the specification says, also where its surface is one this host cannot show.
  const readBy = readingOf(persistence, metamodel.value, expressions);
  const settings = interpretSettings(designer.settings, metamodel.value, persistence, bindings);
  const mentions = interpretMentions(metamodel.value);
  const derive = derivedIds(expressions, persistence);
  const counters = counterRules(persistence);
  const origin = typeof language.origin === 'string' ? language.origin : language.id;
  const logic = plugins.views(origin);
  const table = tableSurface && operations && tableReader({ surface: tableSurface, metamodel: metamodel.value, operations: operations.value.all, logic });
  const gestures = hierarchySurface && operations && gesturesOf(hierarchySurface, metamodel.value, operations.value.all, designer.operations);
  const hierarchy = hierarchySurface && operations && gestures && hierarchyReader({ surface: hierarchySurface, metamodel: metamodel.value, operations: operations.value.all, gestures, mentions: mentions.value, logic, locale });
  const sections = sectionsSurface && operations && sectionsReader({ surface: sectionsSurface, metamodel: metamodel.value, expressions, operations: operations.value.all, mentions: mentions.value });
  const needed = missingPlugins(pluginReferences({}, bindings), plugins);

  const ofDefinition: Finding[] = [...loaded.findings, ...metamodel.findings, ...expressions.findings, ...constraints.findings, ...surface.findings, ...(operations?.findings ?? []), ...settings.findings, ...mentions.findings].map(framed);
  const ofPlugins: Finding[] = needed.map((reference) => ({ rule: findingCodes.pluginMissing, severity: 'warning', message: messages.pluginMissing(reference.id), line: 0 }));
  // A document of a surface this host does not lay out opens read-only, with the reason (DESL 11).
  const unshown = table || hierarchy || sections ? undefined : surface.findings[0]?.message ?? loaded.findings[0]?.message ?? UNREADABLE;

  // ---- a document ----

  interface Open {
    readonly binding: FblBinding;
    readonly read: FblModel;
    readonly model: Model;
    readonly findings: readonly Finding[];
    /** The findings with the element each is about, for a page that shows them at it. */
    readonly found: readonly NodeFinding[];
    /** Why nothing may be edited: absent for a document that is editable. */
    readonly refusal?: string;
    readonly unreadable: boolean;
    /** The elements of a counted type numbered in memory, in reading order, which the next edit that writes the body numbers (DESL 5.3.4). */
    readonly unnumbered: readonly Unnumbered[];
    /** The ids that may be given a new one: those numbered in memory, and a later holder of an id. */
    readonly renumbered: ReadonlySet<string>;
    /** The blocks the registration holds, as the settings read them (DESL 5.5). */
    readonly stored: StoredBlocks;
    /** The implicit members of the lists of a hierarchy's labels (DESL 7.7.2). */
    readonly implied: ReadonlySet<string>;
    /** True when the registration is of another designer type than the envelope names (DED 4). */
    readonly foreign: boolean;
  }

  const bodyOf = (binding: FblBinding, source: Source): OpenBody | PluginBody => {
    const bytes = encode(source.text);
    return binding.plugin ? PluginBody.open(bytes, binding, plugins.persistence(binding.plugin.plugin), source.fileName) : OpenBody.open(bytes, binding, { fileName: nameOf(source.fileName), ...readBy(binding) });
  };

  let last: { readonly source: Source; readonly open: Open } | undefined;
  function opened(source: Source): Open {
    if (last && last.source.text === source.text && last.source.fileName === source.fileName && last.source.registration === source.registration) return last.open;
    const open = readOpen(source);
    last = { source, open };
    return open;
  }

  // The files a document names, each read once for its text: a large one is read again only when it changes.
  const relatedRead = new Map<string, { readonly text: string; readonly rows: ReturnType<RelatedRows> }>();
  /** The rows of each file a document names, read through this tool type's bindings: none for a file that is not one of its documents. */
  const relatedOf = (source: Source): RelatedRows | undefined => source.related && ((file) => {
    const given = source.related?.[file];
    if (!given || !table) return undefined;
    const key = `${file}\u0000${given.fileName}`;
    const known = relatedRead.get(key);
    if (known && known.text === given.text) return known.rows;
    const open = claimingBinding(bindings, given.fileName, given.text) === undefined ? undefined : readOpen({ fileName: given.fileName, text: given.text });
    const rows = open === undefined || open.unreadable ? undefined : { rows: table.titlesOf(open.model), model: open.model };
    relatedRead.set(key, { text: given.text, rows });
    return rows;
  });
  /** The workspace a document resolves its links in, where it is in one (FBL 17.3). */
  const linkingOf = (source: Source): TableLinking | undefined => (source.links === undefined ? undefined : { links: source.links, path: source.linkPath ?? source.fileName });
  /** The model as the table shows it: with the columns the tool type computes from the workspace, which no file holds. */
  const shownModel = (source: Source, open: Open): Model => {
    if (!table || !logic?.shownColumns || open.unreadable) return open.model;
    const related = relatedOf(source);
    const linking = linkingOf(source);
    const columns = logic.shownColumns({ model: open.model, metamodel: metamodel.value, properties: table.propertiesOf(open.model), rows: table.rowsOf(open.model), ...(related ? { related } : {}), ...(source.peers ? { peers: source.peers } : {}), ...(linking ? { linking } : {}) });
    return columns.length === 0 ? open.model : { ...open.model, elements: [...open.model.elements, ...columns] };
  };
  /** The tool type's own findings of the values that name rows of the files a document names. */
  const relatedFound = (source: Source, open: Open): NodeFinding[] => {
    if (!table || open.unreadable) return [];
    const lines = new Map(open.model.elements.map((element) => [element.id, element.line]));
    return table.foundOf(shownModel(source, open), relatedOf(source), linkingOf(source)).map((found) => ({ rule: found.code, severity: found.severity, message: found.message, line: Math.max(0, (lines.get(found.element) ?? 1) - 1), element: found.element }));
  };

  function readOpen(source: Source): Open {
    const binding = claimingBinding(bindings, source.fileName, source.text) ?? bindings[0];
    const body = bodyOf(binding, source);
    const read = body.model;
    const file = nameOf(source.fileName);
    // The reading in DESL's order (DESL 10.2): the counted ids numbered, the registration's settings, the implicit members of the lists.
    const counted = numbered(readModel(read, binding, metamodel.value, persistence), counters);
    const envelope = dedEnvelope(source.text);
    const registrationOrigin = source.registration === undefined ? undefined : RegistrationDocument.read(encode(source.registration)).origin;
    const ded = dedFindings(envelope, registrationOrigin);
    const foreign = ded.length > 0;
    let model = read.unreadable ? emptyModel : counted.model;
    let stored: StoredBlocks = new Map();
    let implied: ReadonlySet<string> = new Set();
    if (!read.unreadable) {
      const kept = withSettings(model, source.registration === undefined || foreign ? undefined : OpenRegistration.open(encode(source.registration), binding), settings.value, metamodel.value, derive);
      ({ model, stored } = kept);
      if (hierarchySurface) ({ model, implied } = withImplicitMembers(model, hierarchySurface, derive));
    }
    const raw = [
      ...constraints.value.check(model, counted.findings, { file }).filter((finding) => finding.code !== findingCodes.pluginMissing),
      ...(read.unreadable ? [] : checkMentions(model, mentions.value, metamodel.value, file)),
      ...(read.unreadable || !sections ? [] : sections.findings(model, file)),
      ...ded,
    ];
    const found: NodeFinding[] = raw.map((finding) => ({ ...framed(finding), ...(finding.element === undefined ? {} : { element: finding.element }) }));
    const gate = unshown ?? (needed.length > 0 ? messages.pluginMissing(needed[0].id) : dedRefusal(envelope) ?? (body.isReadOnly && !read.unreadable ? binding.readOnly || messages.readOnlyFile : undefined));
    const renumbered = new Set([...counted.unnumbered.map((element) => element.name), ...raw.filter((finding) => finding.code === 'std.duplicateId' && finding.element !== undefined).map((finding) => finding.element!)]);
    const open: Open = {
      binding, read, model, findings: found.map(({ rule, severity, message, line }) => ({ rule, severity, message, line })), found,
      unreadable: read.unreadable, refusal: read.unreadable ? found[0]?.message ?? UNREADABLE : gate,
      unnumbered: counted.unnumbered, renumbered, stored, implied, foreign,
    };
    return open;
  }

  /**
   * The model with the folds the viewer keeps for the session (DESL 5.3.3, 5.5): the value of a
   * state for an element whose id is still ephemeral, which the registration cannot hold. An element
   * that has been numbered since is the registration's again, whatever the session held for it.
   */
  const withSession = (model: Model, options: ViewOptions): Model => {
    const held = options.collapsed;
    const attribute = hierarchySurface?.collapsed;
    const state = attribute === undefined ? undefined : settings.value.states.find((candidate) => candidate.attribute === attribute);
    if (held === undefined || state === undefined) return model;
    let changed = false;
    const elements = model.elements.map((element) => {
      const value = element.ephemeral && state.of.includes(element.type) ? held[element.id] : undefined;
      if (value === undefined || element.attributes[state.attribute] === value) return element;
      changed = true;
      return { ...element, attributes: { ...element.attributes, [state.attribute]: value } };
    });
    return changed ? { ...model, elements } : model;
  };

  // ---- what is shown ----

  const baseName = (fileName: string): string => nameOf(fileName).replace(/\.[^.]*$/, '');

  const view = (source: Source, options: ViewOptions = {}): TableView | HierarchyView | SectionsView => {
    const open = opened(source);
    if (sectionsSurface) {
      if (!sections || !operations || open.unreadable) return { name: baseName(source.fileName), readOnly: true, notice: open.refusal ?? UNREADABLE, parts: [] };
      return sections.view(open.model, {
        name: baseName(source.fileName), readOnly: open.refusal !== undefined, ...(open.refusal === undefined ? {} : { notice: open.refusal }), findings: open.found,
        availability: (operation, on) => operations.value.availability(open.model, operation, on),
      });
    }
    if (hierarchySurface) {
      if (!hierarchy || !operations || open.unreadable) return emptyHierarchy(open.refusal ?? UNREADABLE);
      const session = withSession(open.model, options);
      return hierarchy.view(open.model, {
        name: baseName(source.fileName), readOnly: open.refusal !== undefined, ...(open.refusal === undefined ? {} : { notice: open.refusal }),
        findings: open.found, implied: open.implied, renumbered: open.renumbered,
        ...(options.collapsed === undefined ? {} : { collapsed: options.collapsed }), ...(options.query === undefined ? {} : { query: options.query }), ...(options.focus === undefined ? {} : { focus: options.focus }),
        availability: (operation, on) => operations.value.availability(session, operation, on),
      });
    }
    if (!table || open.unreadable) return emptyTable(open.refusal ?? UNREADABLE);
    const related = relatedOf(source);
    const model = shownModel(source, open);
    const shown = withFindings(table.view(model, { readOnly: open.refusal !== undefined, ...(open.refusal === undefined ? {} : { notice: open.refusal }) }, related, source.peers, linkingOf(source)), [...open.found, ...relatedFound(source, open)], model);
    return shown.gestures && operations ? { ...shown, gestures: checkedGestures(shown.gestures, open.model) } : shown;
  };

  /**
   * The surface's gestures, each entry that runs an operation that cannot run now marked with the
   * reason, wherever it is: in a menu, an editor of the settings control or a panel.
   */
  function checkedGestures(gestures: TableGestures, model: Model): TableGestures {
    const run = operations!.value;
    const requests = new Set(['request', 'remove', 'add', 'rename', 'moves', 'newView', 'newRow', 'newRowIn']);
    const reasonOf = (request: unknown): string | undefined => {
      const asked = request as TableRequest | undefined;
      if (asked?.kind !== 'operation' || (asked.on ?? []).some((id) => id.startsWith('$'))) return undefined;
      // A step of the tool type's own says why it cannot be made when it is made.
      if (logic?.ownSteps?.includes(asked.operation)) return undefined;
      const state = run.availability(model, asked.operation, asked.on ?? []);
      return !state.offered ? NOT_HERE : state.available ? undefined : state.reason ?? `${state.label} cannot be done now.`;
    };
    const walk = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(walk);
      if (typeof value !== 'object' || value === null) return value;
      const given = value as Record<string, unknown>;
      const walked = Object.fromEntries(Object.entries(given).map(([key, part]) => [key, requests.has(key) ? part : walk(part)]));
      // An entry: what it is called and the request it makes.
      if (typeof given.id === 'string' && typeof given.label === 'string' && 'request' in given && given.disabled === undefined) {
        const disabled = reasonOf(given.request);
        if (disabled !== undefined) walked.disabled = disabled;
      }
      return walked;
    };
    return walk(gestures) as TableGestures;
  }

  const isRow = (model: Model, id: string): boolean => model.elements.some((element) => element.id === id && element.type === tableSurface?.rows.type);
  const editors: Readonly<Record<string, Control>> = { number: 'number', checkbox: 'choice', choice: 'choice', choices: 'tags', rows: 'tags' };

  // The cells of one selected row are the rows of ADP Properties, a column each; of a level or an entry its id, title, description and labels.
  function fields(source: Source, selection: readonly string[]): Field[] {
    const open = opened(source);
    if (hierarchy) return selection.length === 1 ? hierarchy.fields(open.model, selection[0], open.refusal) : [];
    if (sections) return selection.length === 1 ? sections.fields(open.model, selection[0], open.refusal) : [];
    if (!table || selection.length !== 1 || !isRow(open.model, selection[0])) return [];
    const row = table.rowsOf(open.model).find((candidate) => candidate.id === selection[0]);
    return table.propertiesOf(open.model).map((property): Field => {
      const cell = row?.cells[property.id];
      const names = property.options.map((option) => option.name);
      const options = property.editor === 'checkbox' ? ['', 'true', 'false'] : property.editor === 'choice' ? ['', ...names] : property.editor === 'choices' ? names : undefined;
      const readOnly = open.refusal ?? property.readOnly;
      return {
        id: property.id, label: property.name, group: '', control: (property.editor && editors[property.editor]) ?? 'text',
        value: property.editor === 'rows' ? (cell?.items ?? []).map((item) => item.value).join(', ') : cell?.text ?? '',
        ...(options ? { options } : {}), ...(readOnly === undefined ? {} : { readOnly }),
      };
    });
  }

  // A page of boxes offers its levels and its entries to drop, where an operation adds one.
  function toolbox(source: Source): ToolboxEntry[] {
    if (!hierarchySurface || !gestures || opened(source).refusal !== undefined) return [];
    const { levels, entries } = hierarchySurface;
    const addsLevel = gestures.adds[levels.type] !== undefined || gestures.on[levels.type]?.addLevel !== undefined;
    const addsEntry = gestures.on[levels.type]?.addEntry !== undefined;
    return [...(addsLevel ? [levels.type] : []), ...(addsEntry ? [entries.type] : [])].map((type) => {
      const declared = metamodel.value.types[type].declared;
      const doc = declared.doc;
      const described = typeof doc === 'string' ? doc : isObject(doc) && 'summary' in doc ? localized(doc.summary, locale) : localized(doc as LocalizedText | undefined, locale);
      return { id: type, label: metamodel.value.types[type].label, icon: typeof declared.icon === 'string' ? declared.icon : '', description: described ?? '' };
    });
  }

  function actions(source: Source, selection: readonly string[], options: ViewOptions = {}): Action[] {
    const open = opened(source);
    if (!operations || open.refusal !== undefined) return [];
    const model = withSession(open.model, options);
    return operations.value.all.flatMap((operation): Action[] => {
      const state = operations.value.availability(model, operation.id, selection);
      return state.offered ? [{ id: operation.id, label: state.label, enabled: state.available, ...(state.reason === undefined ? {} : { disabledReason: state.reason }) }] : [];
    });
  }

  // ---- an edit ----

  /** The body's model changes planned by the library, one after the other, as edits of the text. */
  function bodyEdits(source: Source, open: Open, changes: readonly Change[]): Edit[] | Refused {
    const steps = modelChangesOf(changes, { binding: open.binding, metamodel: metamodel.value, persistence, read: open.read }, open.model);
    if ('refused' in steps) return steps;
    const body = steps.length > 0 ? bodyOf(open.binding, source) : undefined;
    const edits: Edit[] = [];
    for (const step of steps) {
      const planned = body!.change(step);
      if ('refused' in planned) return planned;
      edits.push(planned.planned);
    }
    return edits;
  }

  /** Changes of the model as the outcome of a request: planned by the library, one after the other, as splices of the text. */
  function written(source: Source, open: Open, changes: readonly Change[], select?: string): EditOutcome {
    const edits = bodyEdits(source, open, changes);
    if ('refused' in edits) return { kind: 'refused', sentence: edits.refused };
    return { kind: 'applied', splices: edits.length === 0 ? [] : composedSplices(edits), ...(select === undefined ? {} : { select }) };
  }

  /**
   * A transaction of a designer whose registration keeps settings (DESL 5.5): its changes parted into
   * the body's, planned as splices of the text, and the registration's, applied to the registration,
   * which is created with the first setting it keeps (FBL 0.7 8.4). A fold of an element whose id is
   * ephemeral is kept in the view options for the session. An edit of only blocks outside the history
   * says so (`history: false`).
   */
  function writtenWithSettings(source: Source, open: Open, outcome: Done, parted: SettingSteps, options: ViewOptions): EditOutcome {
    const edits = bodyEdits(source, open, parted.body);
    if ('refused' in edits) return { kind: 'refused', sentence: edits.refused };
    let registration: string | undefined;
    if (parted.registration.length > 0) {
      if (open.foreign) return { kind: 'refused', sentence: FOREIGN_REGISTRATION };
      let bytes: Uint8Array;
      if (source.registration !== undefined) bytes = encode(source.registration);
      else {
        const created = createRegistration(open.binding, origin, `${baseName(source.fileName)}.adp`, nameOf(source.fileName), encode(source.text), undefined);
        if ('refused' in created) return { kind: 'refused', sentence: created.refused };
        ({ bytes } = created);
      }
      const kept = OpenRegistration.open(bytes, open.binding);
      for (const step of parted.registration) {
        const planned = kept.change(step);
        if ('refused' in planned) return { kind: 'refused', sentence: planned.refused };
      }
      const text = decode(kept.bytes);
      if (text !== source.registration) registration = text;
    }
    const folded = parted.session.filter((change) => change.attribute === hierarchySurface?.collapsed);
    const made = outcome.created.find((id) => outcome.after.elements.some((element) => element.id === id && hierarchy?.roleOf(element.type) !== undefined));
    return {
      kind: 'applied', splices: edits.length === 0 ? [] : composedSplices(edits),
      ...(registration === undefined ? {} : { registration }),
      ...(made === undefined ? {} : { select: made, editLabel: true }),
      ...(folded.length === 0 ? {} : { viewOptions: { ...options, collapsed: { ...options.collapsed, ...Object.fromEntries(folded.map((change) => [change.id, change.value === true])) } } }),
      ...(parted.outsideHistory ? { history: false as const } : {}),
    };
  }

  /**
   * The edits that number every element a counted rule numbered in memory (DESL 5.3.4, 5.3.5): its
   * id written over the placeholder, or where it has none, the last first so that an earlier one is
   * still read under the id it was given, and each mark set to the last number given, in the text
   * they leave.
   */
  function numbering(source: Source, open: Open, renamed: readonly { readonly id: string; readonly newId: string }[] = open.unnumbered): { readonly edits: readonly Edit[]; readonly text: string } | Refused {
    const body = bodyOf(open.binding, source);
    const edits: Edit[] = [];
    for (const element of [...renamed].reverse()) {
      const planned = body.change({ kind: 'storeId', id: element.id, newId: element.newId, replace: true });
      if ('refused' in planned) return planned;
      edits.push(planned.planned);
    }
    const marks = modelChangesOf(markSets(counters, open.model, renamed.map((element) => element.newId)), { binding: open.binding, metamodel: metamodel.value, persistence, read: body.model }, open.model);
    if ('refused' in marks) return marks;
    for (const step of marks) {
      const planned = body.change(step);
      if ('refused' in planned) return planned;
      edits.push(planned.planned);
    }
    return { edits, text: decode(body.bytes) };
  }

  /** What a field of ADP Properties was given, as the values its column takes: a value of a cell, or the ones a cell is to hold. */
  function given(open: Open, row: string, column: TableProperty, text: string): { readonly value: Value | null } | { readonly items: readonly string[] } | Refused {
    const typed = text.trim();
    const listed = typed === '' ? [] : typed.split(',').map((part) => part.trim()).filter((part) => part !== '');
    const optionOf = (name: string): string | undefined => column.options.find((option) => option.name.toLowerCase() === name.toLowerCase())?.id;
    const unknown = (name: string): Refused => ({ refused: `\`${name}\` is not one of the values this column takes.` });
    switch (column.editor) {
      case 'number': return typed === '' ? { value: null } : Number.isFinite(Number(typed)) ? { value: Number(typed) } : { refused: `\`${typed}\` is not a number.` };
      case 'checkbox': return typed === '' ? { value: null } : typed === 'true' || typed === 'false' ? { value: typed === 'true' } : unknown(typed);
      case 'choice': return typed === '' ? { value: null } : optionOf(typed) === undefined ? unknown(typed) : { value: optionOf(typed)! };
      case 'choices': {
        const missing = listed.find((name) => optionOf(name) === undefined);
        return missing === undefined ? { items: listed.map((name) => optionOf(name)!) } : unknown(missing);
      }
      case 'rows': return { items: listed };
      case 'text': return { value: text };
      default: return column.editor === undefined ? { refused: column.readOnly ?? NO_ROW } : { value: typed === '' ? null : typed };
    }
  }

  /** A request on an operation of the definition: offered and available, asked first where it asks, and run as one transaction. */
  function operated(open: Open, request: { readonly operation: string; readonly on?: readonly string[]; readonly args?: Readonly<Record<string, TableValue>> }, confirmed: boolean, done: (outcome: Outcome) => EditOutcome): EditOutcome {
    const run = operations!.value;
    const selection = request.on ?? [];
    const state = run.availability(open.model, request.operation, selection);
    if (!state.offered) return { kind: 'refused', sentence: NOT_HERE };
    if (!state.available) return { kind: 'refused', sentence: state.reason ?? `${state.label} cannot be done now.` };
    if (state.confirm && !confirmed) return { kind: 'confirm', title: state.confirm.title, message: state.confirm.message, confirmLabel: state.confirm.confirmLabel, danger: state.confirm.danger };
    const args = Object.fromEntries(Object.entries(request.args ?? {}).filter((entry): entry is [string, string | number | boolean] => entry[1] !== null));
    return done(run.run(open.model, request.operation, selection, args));
  }

  /**
   * A request on a page of boxes. An edit that writes the body numbers first what was numbered in
   * memory (DESL 5.3.4): the ids are written, and the request is made again of the text that has
   * them, so that one gesture is one undo step. An edit of settings alone writes the registration.
   * The operations run on the model with the folds the session keeps for what is still ephemeral.
   */
  function editHierarchy(source: Source, request: HierarchyRequest, options: ViewOptions, confirmed: boolean): EditOutcome {
    const read = opened(source);
    const open: Open = { ...read, model: withSession(read.model, options) };
    if (!operations || !hierarchy || !hierarchySurface || !gestures || open.refusal !== undefined) return { kind: 'refused', sentence: open.refusal ?? UNREADABLE };
    const run = operations.value;
    const { levels, entries } = hierarchySurface;
    const refused = (sentence: string): EditOutcome => ({ kind: 'refused', sentence });

    /** The request made again of the text with what was numbered in memory written. */
    const numberedFirst = (): EditOutcome => {
      const numbered = numbering(source, open);
      if ('refused' in numbered) return refused(numbered.refused);
      const rest = editHierarchy({ ...source, text: numbered.text }, numberedIn(request, open.unnumbered), numberedIn(options, open.unnumbered), confirmed);
      if (rest.kind !== 'applied') return rest;
      return { ...rest, splices: composedSplices([...numbered.edits, ...(rest.splices.length === 0 ? [] : [editOf(rest.splices)])]) };
    };
    const done = (outcome: Outcome): EditOutcome => {
      if (outcome.refused !== undefined) return refused(outcome.refused);
      const parted = settingSteps(outcome.changes, open.model, outcome.after, settings.value, open.stored, metamodel.value, open.binding.registration.blocks);
      if (parted.body.length > 0 && open.unnumbered.length > 0) return numberedFirst();
      return writtenWithSettings(source, open, outcome, parted, options);
    };

    switch (request.kind) {
      case 'operation':
        // A step of the tool type's own, which the definition cannot state: its whole change is the tool type's.
        if (logic?.ownSteps?.includes(request.operation)) {
          const none: Done = { changes: [], after: open.model, created: [], effects: [], collapsed: {}, view: [], renamed: new Map() };
          return across(source, open, request, none, confirmed) ?? { kind: 'refused', sentence: NOT_HERE };
        }
        return operated(open, request, confirmed, done);
      case 'renumber': {
        if (!open.model.elements.some((element) => element.id === request.id)) return refused(ENTRY_GONE);
        if (!open.renumbered.has(request.id)) return refused(NOT_RENUMBERED);
        if (open.unnumbered.length > 0) {
          // What was numbered in memory is numbered by the first edit that writes the body; this one writes nothing else.
          const named = open.unnumbered.find((element) => element.name === request.id);
          if (named) {
            const numbered = numbering(source, open);
            return 'refused' in numbered ? refused(numbered.refused) : { kind: 'applied', splices: composedSplices([...numbered.edits]), select: named.newId };
          }
          return numberedFirst();
        }
        const given = renumbering(open.model, [request.id], counters).renamed;
        if (given.length === 0) return refused(NOT_RENUMBERED);
        const numbered = numbering(source, open, given);
        return 'refused' in numbered ? refused(numbered.refused) : { kind: 'applied', splices: composedSplices([...numbered.edits]), select: given[0].newId };
      }
      case 'drop': {
        // A level dropped at the top is added by the operation that adds one there; one dropped into a level, and an entry, by the one that adds it inside that level,
        // and moved after the sibling it was dropped after, or with no sibling named, first among its kind there, as a move within its own parent puts it.
        const level = request.entry === levels.type;
        if (!level && request.entry !== entries.type) return refused(NOT_HERE);
        const parent = request.parent;
        if (parent !== undefined && !open.model.elements.some((element) => element.id === parent && element.type === levels.type)) return refused(ENTRY_GONE);
        const adding = parent === undefined ? (level ? gestures.adds[levels.type] : undefined) : gestures.on[levels.type]?.[level ? 'addLevel' : 'addEntry'];
        if (!adding) return refused(parent === undefined ? IN_A_LEVEL : NOT_HERE);
        const steps: (RunStep | ((created: readonly string[]) => RunStep))[] = [{ operation: adding.operation, on: parent === undefined ? [] : [parent] }];
        if (request.after !== undefined) {
          const moving = gestures.on[request.entry]?.move;
          if (!moving) return refused(NOT_HERE);
          const after = request.after;
          steps.push((created) => ({
            operation: moving.operation, on: [created[0]],
            args: { ...(parent === undefined || moving.params.into === undefined ? {} : { [moving.params.into]: parent }), ...(moving.params.after === undefined || after === '' ? {} : { [moving.params.after]: after }) },
          }));
        }
        return done(run.runAll(open.model, steps));
      }
      case 'setField': {
        const steps = hierarchy.fieldSteps(open.model, request.id, request.field, request.value);
        if ('refused' in steps) return refused(steps.refused);
        return steps.length === 0 ? { kind: 'applied', splices: [] } : done(run.runAll(open.model, steps));
      }
      default:
        return refused(NOT_HERE);
    }
  }

  /**
   * A request on a page of sections: an operation, or a field given a value, each one transaction.
   * An edit that writes the body numbers first what was numbered in memory (DESL 5.3.4), in the
   * same step, as on a page of boxes.
   */
  function editSections(source: Source, request: SectionsRequest, confirmed: boolean): EditOutcome {
    const open = opened(source);
    if (!operations || !sections || open.refusal !== undefined) return { kind: 'refused', sentence: open.refusal ?? UNREADABLE };
    const run = operations.value;
    const done = (outcome: Outcome): EditOutcome => {
      if (outcome.refused !== undefined) return { kind: 'refused', sentence: outcome.refused };
      if (outcome.changes.length > 0 && open.unnumbered.length > 0) {
        const numbered = numbering(source, open);
        if ('refused' in numbered) return { kind: 'refused', sentence: numbered.refused };
        const rest = editSections({ ...source, text: numbered.text }, numberedIn(request, open.unnumbered), confirmed);
        if (rest.kind !== 'applied') return rest;
        return { ...rest, splices: composedSplices([...numbered.edits, ...(rest.splices.length === 0 ? [] : [editOf(rest.splices)])]) };
      }
      const made = outcome.created.find((id) => sectionsSurface!.parts.some((part) => !part.document && outcome.after.elements.some((element) => element.id === id && element.type === part.type)));
      return written(source, open, outcome.changes, made);
    };
    switch (request.kind) {
      case 'operation':
        return operated(open, request, confirmed, done);
      case 'setField': {
        const steps = sections.fieldSteps(open.model, request.id, request.field, request.value);
        if ('refused' in steps) return { kind: 'refused', sentence: steps.refused };
        return done(run.runAll(open.model, steps));
      }
      default:
        return { kind: 'refused', sentence: NOT_HERE };
    }
  }

  function edit(source: Source, request: TableRequest | HierarchyRequest | SectionsRequest, options: ViewOptions, confirmed: boolean): EditOutcome {
    if (sectionsSurface) return editSections(source, request as SectionsRequest, confirmed);
    if (hierarchySurface) return editHierarchy(source, request as HierarchyRequest, options, confirmed);
    return editTable(source, request as TableRequest, options, confirmed);
  }

  /**
   * An operation that is a step writing two files (`knowledge.md`, etalii.adp spec 080, FR-007, FR-008):
   * both files' changes planned first, neither written when either is refused, and both given as one
   * outcome, which the host applies as one edit. Undefined for an operation that writes one file.
   */
  function across(source: Source, open: Open, request: { readonly operation: string; readonly on?: readonly string[]; readonly args?: Readonly<Record<string, TableValue>> }, outcome: Done, confirmed: boolean): EditOutcome | undefined {
    if (!logic?.across || !tableSurface) return undefined;
    const related = relatedOf(source);
    const step = logic.across({
      operation: request.operation, on: request.on ?? [], args: request.args ?? {},
      before: open.model, after: outcome.after, created: outcome.created,
      ...(related ? { related } : {}),
      back: (file) => relativePath(source.related?.[file]?.fileName ?? file, source.fileName),
      newId: (type) => newId(persistence, entryOf(persistence, type).as),
      peers: source.peers ?? [], confirmed,
      ...(source.links === undefined ? {} : { linking: linkingOf(source)! }),
    });
    if (step === undefined) return undefined;
    if ('refused' in step) return { kind: 'refused', sentence: step.refused };
    if ('confirm' in step) return { kind: 'confirm', ...step.confirm };
    const made = outcome.created.find((id) => outcome.after.elements.some((element) => element.id === id && (element.type === tableSurface.rows.type || element.type === tableSurface.columns.type)));
    const here = written(source, open, [...outcome.changes, ...step.here], made);
    if (here.kind !== 'applied' || step.file === '.' || step.there.length === 0) return here;
    const given = source.related?.[step.file];
    if (!given) return { kind: 'refused', sentence: `${step.file} cannot be read, so it is not changed, and neither is this file.` };
    const other: Source = { fileName: given.fileName, text: given.text };
    const there = bodyEdits(other, readOpen(other), step.there);
    if ('refused' in there) return { kind: 'refused', sentence: there.refused };
    return { ...here, others: [{ file: step.file, splices: there.length === 0 ? [] : composedSplices(there) }] };
  }

  /** A request with every id it names given by `now`: an id written in a step before, or one a step before created. */
  function renamed(request: TableRequest, now: (id: string) => string): TableRequest {
    const value = <V>(given: V): V => (typeof given === 'string' ? now(given) as V : given);
    switch (request.kind) {
      case 'operation':
        return { ...request, ...(request.on ? { on: request.on.map(now) } : {}), ...(request.args ? { args: Object.fromEntries(Object.entries(request.args).map(([name, given]) => [name, value(given)])) } : {}) };
      case 'show': return { ...request, view: now(request.view) };
      case 'setField': return { ...request, id: now(request.id), field: now(request.field) };
      case 'steps': return { ...request, steps: request.steps.map((step) => renamed(step, now)) };
      case 'cell': return { ...request, row: now(request.row), property: now(request.property), value: value(request.value) };
      case 'item': return { ...request, row: now(request.row), property: now(request.property), value: now(request.value) };
      case 'follow': return { ...request, row: now(request.row) };
    }
  }

  /** The table of a document as the tool type's own logic is given it, in its workspace. */
  function dataOf(source: Source, open: Open): TableData {
    const related = relatedOf(source);
    const linking = linkingOf(source);
    return { model: open.model, metamodel: metamodel.value, properties: table!.propertiesOf(open.model), rows: table!.rowsOf(open.model), ...(related ? { related } : {}), ...(source.peers ? { peers: source.peers } : {}), ...(linking ? { linking } : {}) };
  }

  /**
   * What loading a document for editing in a workspace writes of it (FBL 17.4), planned on its text: the root's
   * attributes past their `readOnly` (its version, its document id), then the changes of the model. Nothing outside a
   * workspace, or for a tool type that takes no part in links.
   */
  function conversionOf(source: Source, open: Open): { readonly edits: readonly Edit[]; readonly text: string } | Refused {
    if (!table || !logic?.conversion || source.links === undefined || persistence.documentId === undefined) return { edits: [], text: source.text };
    const root = open.read.elements.find((element) => entryOf(persistence, element.type).as === 'diagram');
    const version = root === undefined ? '' : String(root.attributes.version ?? '');
    const { migrate, changes } = logic.conversion(dataOf(source, open), version, nameOf(source.linkPath ?? source.fileName), () => newDocumentId(persistence));
    if (Object.keys(migrate).length === 0 && changes.length === 0) return { edits: [], text: source.text };
    const body = bodyOf(open.binding, source);
    const edits: Edit[] = [];
    if (Object.keys(migrate).length > 0) {
      if (root === undefined) return { refused: UNREADABLE };
      // A new document id goes after the envelope's designer type, as a new file's template writes it (DED 2).
      const planned = body.change({ kind: 'migrate', id: root.id, attributes: migrate, after: 'designer' });
      if ('refused' in planned) return planned;
      edits.push(planned.planned);
    }
    const steps = modelChangesOf(changes, { binding: open.binding, metamodel: metamodel.value, persistence, read: body.model }, open.model);
    if ('refused' in steps) return steps;
    for (const step of steps) {
      const planned = body.change(step);
      if ('refused' in planned) return planned;
      edits.push(planned.planned);
    }
    return { edits, text: decode(body.bytes) };
  }

  function editTable(source: Source, incoming: TableRequest, options: ViewOptions, confirmed: boolean): EditOutcome {
    let request = incoming;
    const open = opened(source);
    if (!operations || !table || open.refusal !== undefined) return { kind: 'refused', sentence: open.refusal ?? UNREADABLE };
    const run = operations.value;

    // An entry that was written without an id is given one by the first edit that writes the document, in the same step
    // (DESL 5.3.4): the ids are written first, and the request is made of the document that has them.
    const nameless = open.read.elements.filter((element) => !element.idIsStored && findRule(open.binding, element.rule)?.id?.from !== undefined);
    if (nameless.length > 0) {
      const body = bodyOf(open.binding, source);
      const edits: Edit[] = [];
      for (const element of nameless) {
        const planned = body.change({ kind: 'storeId', id: element.id, newId: newId(persistence, entryOf(persistence, element.type).as) });
        if ('refused' in planned) return { kind: 'refused', sentence: planned.refused };
        edits.push(planned.planned);
      }
      const named = placesOf(open.read, body.model);
      const now = (id: string): string => named.get(id) ?? id;
      const asked = renamed(request, now);
      const outcome = editTable({ ...source, text: decode(body.bytes) }, asked, options, confirmed);
      if (outcome.kind !== 'applied' || outcome.splices.length === 0) return outcome;
      return { ...outcome, splices: composedSplices([...edits, editOf(outcome.splices)]) };
    }

    // In a workspace, what loading the document writes of it (FBL 17.4) is written with its first edit, in the same step:
    // its document id, the conversion of a file made before links, the links that resolve otherwise than they say.
    const converted = conversionOf(source, open);
    if ('refused' in converted) return { kind: 'refused', sentence: converted.refused };
    if (converted.edits.length > 0) {
      const outcome = editTable({ ...source, text: converted.text }, request, options, confirmed);
      if (outcome.kind !== 'applied' || outcome.splices.length === 0) return outcome;
      return { ...outcome, splices: composedSplices([...converted.edits, editOf(outcome.splices)]) };
    }
    // A value picked in a cell of several is written as the tool type writes it: a related row as a link to it (FBL 17.1).
    const data = dataOf(source, open);
    const valued = (step: TableRequest): TableRequest => {
      if (step.kind === 'item' && logic?.itemValue) return { ...step, value: logic.itemValue(data, step.property, step.row, step.value, step.present) };
      return step.kind === 'steps' ? { ...step, steps: step.steps.map(valued) } : step;
    };
    request = valued(request);

    const done = (outcome: Outcome): EditOutcome => {
      if (outcome.refused !== undefined) return { kind: 'refused', sentence: outcome.refused };
      // What a request made is shown: the first row or column of it.
      const made = outcome.created.find((id) => outcome.after.elements.some((element) => element.id === id && (element.type === tableSurface!.rows.type || element.type === tableSurface!.columns.type)));
      return written(source, open, outcome.changes, made);
    };

    switch (request.kind) {
      case 'operation':
        // A step of the tool type's own, which the definition cannot state: its whole change is the tool type's.
        if (logic?.ownSteps?.includes(request.operation)) {
          const none: Done = { changes: [], after: open.model, created: [], effects: [], collapsed: {}, view: [], renamed: new Map() };
          return across(source, open, request, none, confirmed) ?? { kind: 'refused', sentence: NOT_HERE };
        }
        return operated(open, request, confirmed, (outcome) => (outcome.refused === undefined ? across(source, open, request, outcome as Done, confirmed) : undefined) ?? done(outcome));
      case 'cell':
        return done(run.setCell(open.model, request.row, request.property, request.value));
      case 'item':
        return done(run.setItem(open.model, request.row, request.property, request.value, request.present));
      case 'show':
        return done(run.activate(open.model, request.view));
      case 'follow':
        return { kind: 'open', path: request.file, select: request.row };
      case 'steps': {
        // One after another on what the one before left, written once: one edit and one undo step.
        const changes: Change[] = [];
        const created: string[] = [];
        let model = open.model;
        for (const given of request.steps) {
          const step = renamed(given, (id) => (id.startsWith(CREATED) ? created[Number(id.slice(CREATED.length))] ?? id : id));
          let outcome: Outcome;
          if (step.kind === 'operation') {
            const state = run.availability(model, step.operation, step.on ?? []);
            if (!state.offered) return { kind: 'refused', sentence: NOT_HERE };
            if (!state.available) return { kind: 'refused', sentence: state.reason ?? `${state.label} cannot be done now.` };
            if (state.confirm && !confirmed) return { kind: 'confirm', title: state.confirm.title, message: state.confirm.message, confirmLabel: state.confirm.confirmLabel, danger: state.confirm.danger };
            const args = Object.fromEntries(Object.entries(step.args ?? {}).filter((entry): entry is [string, string | number | boolean] => entry[1] !== null));
            outcome = run.run(model, step.operation, step.on ?? [], args);
          } else if (step.kind === 'cell') {
            outcome = run.setCell(model, step.row, step.property, step.value);
          } else if (step.kind === 'item') {
            outcome = run.setItem(model, step.row, step.property, step.value, step.present);
          } else if (step.kind === 'show') {
            outcome = run.activate(model, step.view);
          } else {
            return { kind: 'refused', sentence: NOT_HERE };
          }
          if (outcome.refused !== undefined) return { kind: 'refused', sentence: outcome.refused };
          changes.push(...outcome.changes);
          created.push(...outcome.created);
          model = outcome.after;
        }
        return done({ changes, created, after: model, effects: [], collapsed: {}, view: [], renamed: new Map() });
      }
      case 'setField': {
        const column = table.propertiesOf(open.model).find((property) => property.id === request.field);
        if (!column || !isRow(open.model, request.id)) return { kind: 'refused', sentence: GONE };
        const asked = given(open, request.id, column, request.value);
        if ('refused' in asked) return { kind: 'refused', sentence: asked.refused };
        if ('value' in asked) return done(run.setCell(open.model, request.id, column.id, asked.value));
        // Several values: each one that is new is added and each one that is gone taken away, as one step.
        const held = (table.rowsOf(open.model).find((row) => row.id === request.id)?.cells[column.id]?.items ?? []).map((item) => item.value);
        const changes: Change[] = [];
        let model = open.model;
        for (const [value, present] of [...held.filter((value) => !asked.items.includes(value)).map((value) => [value, false] as const), ...asked.items.filter((value) => !held.includes(value)).map((value) => [value, true] as const)]) {
          const outcome = run.setItem(model, request.id, column.id, value, present);
          if (outcome.refused !== undefined) return { kind: 'refused', sentence: outcome.refused };
          changes.push(...outcome.changes);
          model = outcome.after;
        }
        return written(source, open, changes);
      }
      default:
        return { kind: 'refused', sentence: NOT_HERE };
    }
  }

  /**
   * The registration an undo or a redo gives back (FBL 0.7 7.1): the snapshot, with each block the
   * binding declares `history: false` made what it is in the current text, by the library's own
   * settings: what the current block lacks removed, and what it holds set, added after the entry
   * before it where the block keeps its order. Where the snapshot is no file and the current text
   * keeps something outside the history, the file stays, holding only that.
   */
  function restoreRegistration(snapshot: string | undefined, current: string | undefined): string | undefined {
    if (snapshot === current) return snapshot;
    const binding = bindings.find((candidate) => candidate.registration.blocks.some((block) => !block.inHistory));
    if (!binding) return snapshot;
    const { blocks } = binding.registration;
    const now = current === undefined ? undefined : RegistrationDocument.read(encode(current), blocks.map((block) => block.name));
    const outside = (name: string): readonly { readonly key: string; readonly value: string }[] => now?.block(name)?.entries.map(({ key, value }) => ({ key, value })) ?? [];
    if (snapshot === undefined && blocks.every((block) => block.inHistory || outside(block.name).length === 0)) return undefined;
    // Where there was no file, what the history keeps is nothing: the current text without the blocks inside the history.
    const kept = OpenRegistration.open(encode(snapshot ?? current!), binding);
    for (const block of blocks.filter((candidate) => snapshot === undefined || !candidate.inHistory)) {
      const target = block.inHistory ? [] : outside(block.name);
      const held = (): readonly { readonly key: string; readonly value: string }[] => kept.blockEntries(block.name) ?? [];
      const steps: Extract<ModelChange, { kind: 'setting' }>[] = held().filter((entry) => !target.some((member) => member.key === entry.key)).map((entry) => ({ kind: 'setting', block: block.name, key: entry.key, remove: true }));
      for (const step of steps) if ('refused' in kept.change(step)) return snapshot;
      for (const [index, member] of target.entries()) {
        const entries = held();
        const place = entries.findIndex((entry) => entry.key === member.key);
        const previous = index === 0 ? undefined : target[index - 1].key;
        const inPlace = !block.kept || (previous === undefined ? place === 0 : place > 0 && entries[place - 1].key === previous);
        if (place >= 0 && inPlace && entries[place].value === member.value) continue;
        const position: ChangePosition | undefined = !block.kept || inPlace ? undefined : previous !== undefined ? { after: previous } : entries.length > 0 ? { index: 0 } : undefined;
        if ('refused' in kept.change({ kind: 'setting', block: block.name, key: member.key, value: member.value, ...(position === undefined ? {} : { position }) })) return snapshot;
      }
    }
    return decode(kept.bytes);
  }

  return {
    origin,
    kind: 'designer',
    page: sectionsSurface ? 'sections' : hierarchySurface ? 'hierarchy' : 'table',
    displayName: localized(language.label, locale) ?? definition.name,
    claims: claimsOf(bindings),
    claimed: (fileName, text) => claimingBinding(bindings, fileName, text) !== undefined,
    suggests: (fileName, text) => suggests(bindings, fileName, text),
    findings: (source) => {
      const open = opened(source);
      return [...open.findings, ...relatedFound(source, open).map(({ rule, severity, message, line }) => ({ rule, severity, message, line })), ...ofDefinition, ...ofPlugins];
    },
    related: (source) => {
      const open = opened(source);
      return open.unreadable ? [] : logic?.targets?.(open.model, linkingOf(source)) ?? [];
    },
    // A document of a tool type that takes part in links is in the workspace's index (FBL 17.3), read without the workspace.
    ...(persistence.documentId === undefined || !logic?.indexed || !table ? {} : {
      indexed: (source: Source) => {
        const open = opened(source);
        if (open.unreadable) return undefined;
        return logic.indexed!({ model: open.model, metamodel: metamodel.value, properties: table.propertiesOf(open.model), rows: table.rowsOf(open.model) }, source.linkPath ?? source.fileName);
      },
    }),
    ...(logic?.retarget ? {
      retargeted: (source: Source, moved: (file: string) => string | undefined) => {
        const open = readOpen(source);
        if (open.unreadable) return undefined;
        const changes = logic.retarget!(open.model, moved);
        if (changes.length === 0) return [];
        const outcome = written(source, open, changes);
        return outcome.kind === 'applied' ? outcome.splices : undefined;
      },
    } : {}),
    view,
    toolbox,
    fields,
    actions,
    edit,
    // A new document is in the format of the name it is given: the template of the binding that claims that name (DESL 5.1).
    newDocument: (name) => {
      const extension = extensionOf(nameOf(name)).toUpperCase();
      const binding = bindings.find((candidate) => candidate.claims.extensions.some((claimed) => claimed.toUpperCase() === extension)) ?? bindings[0];
      const made = produceTemplate(binding, undefined, name, (rule) => newId(persistence, entryOf(persistence, findRule(binding, rule)?.type ?? rule).as), binding.plugin && plugins.persistence(binding.plugin.plugin));
      return made ? decode(made) : '';
    },
    newRegistration: (text, name) => {
      const extension = extensionOf(nameOf(name)).toUpperCase();
      const binding = bindings.find((candidate) => candidate.claims.extensions.some((claimed) => claimed.toUpperCase() === extension)) ?? bindings[0];
      return registrationOfNew(binding, origin, binding.registration.blocks.length > 0, text);
    },
    restoreRegistration,
  };
}

/**
 * The tool types of the folders of `definitions/`, each folder given as its files' bytes by name,
 * in the order of the folders' names. A folder that is no tool type is left out, with the reason.
 */
export function toolTypesFrom(folders: ReadonlyMap<string, ReadonlyMap<string, Uint8Array>>, plugins: PluginRegistry):
{ readonly types: readonly (DiagramToolType | DesignerToolType)[]; readonly skipped: readonly { readonly folder: string; readonly reason: string }[] } {
  const types: (DiagramToolType | DesignerToolType)[] = [];
  const skipped: { readonly folder: string; readonly reason: string }[] = [];
  for (const folder of [...folders.keys()].sort()) {
    const read = readDefinitionFolder(folder, folders.get(folder)!);
    if ('reason' in read) skipped.push({ folder, reason: read.reason });
    else types.push(toolTypeFrom(read.definition, read.bindings, plugins));
  }
  return { types, skipped };
}

/**
 * How a file names another by a path from its own folder, with forward slashes, as a relation's
 * target is written; `.` for the file itself.
 */
export function relativePath(from: string, to: string): string {
  const parts = (path: string): string[] => path.replace(/\\/g, '/').split('/').filter((part) => part !== '' && part !== '.');
  const [a, b] = [parts(from), parts(to)];
  if (a.join('/') === b.join('/')) return '.';
  const folder = a.slice(0, -1);
  let shared = 0;
  while (shared < folder.length && shared < b.length - 1 && folder[shared] === b[shared]) shared += 1;
  return [...folder.slice(shared).map(() => '..'), ...b.slice(shared)].join('/');
}

/** A path with `.` and `..` worked out and forward slashes; a leading slash or drive is kept. */
function normalPath(path: string): string {
  const parts: string[] = [];
  const given = path.replace(/\\/g, '/');
  for (const part of given.split('/')) {
    if (part === '.' || (part === '' && parts.length > 0)) continue;
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..' && parts[parts.length - 1] !== '') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

/** Where a path is once files or folders have moved, each from its `from` to its `to`; the path itself when none of them holds it. */
function movedPath(path: string, moves: readonly { readonly from: string; readonly to: string }[]): string {
  for (const move of moves) {
    const [from, to] = [normalPath(move.from), normalPath(move.to)];
    if (path === from) return to;
    if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`;
  }
  return path;
}

/**
 * How a document names, once files have moved, each file it named before (etalii.adp spec 080,
 * FR-010): undefined for a name that stays. The document may itself be among what moved. `document`
 * and the moves are full paths.
 */
export function movedName(document: string, moves: readonly { readonly from: string; readonly to: string }[]): (file: string) => string | undefined {
  const before = normalPath(document);
  const after = movedPath(before, moves);
  const folder = before.slice(0, before.lastIndexOf('/'));
  return (file) => {
    const named = relativePath(after, movedPath(normalPath(`${folder}/${file}`), moves));
    return named === file ? undefined : named;
  };
}

/** A value a form starts from, as the text of an input box. */
function askedText(value: Value | undefined): string {
  return value === undefined || value === null ? '' : typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
}
