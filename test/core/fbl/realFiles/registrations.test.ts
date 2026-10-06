import { describe, expect, it } from 'vitest';
import type { FblBinding } from '../../../../src/core/fbl/documents/types';
import { nodeFiles } from '../../../../src/core/fbl/files/nodeFiles';
import { nameOf } from '../../../../src/core/fbl/files/paths';
import { findingCodes } from '../../../../src/core/fbl/finding';
import { OpenBody } from '../../../../src/core/fbl/history/openBody';
import { locateBody, type BodyLocation } from '../../../../src/core/fbl/registration/bodyLocator';
import { LegacySidecar } from '../../../../src/core/fbl/registration/legacySidecar';
import { OpenRegistration } from '../../../../src/core/fbl/registration/openRegistration';
import { RegistrationDocument } from '../../../../src/core/fbl/registration/registrationDocument';
import { folderFiles, recogniseFolder } from '../../../../src/core/fbl/routing/folderSubject';
import { candidates, suggestsReading } from '../../../../src/core/fbl/routing/router';
import { allBindings, bindingOf } from '../support/bindings';
import { ordinal } from '../support/repository';
import { bytesOfFile, chartFolders, minimumChartFolders, minimumRegistrations, minimumTurtle, nameIn, optionsFor, registrations, turtleFiles, type RealFile } from './corpus';
import { checkDivergence } from './divergences';

// Every .adp registration among the real files: parsed in the line form and written back unchanged;
// for a declared binding's origin, its body found and opened, its `view` or `resource` selecting
// something, and its layout naming elements of the reading or reported stale; for the W3C readings,
// the reading's `suggest` matching the body; for the C4 types, the *.layout.json sidecar read as the
// binding's legacy layout. Counterparts of standalone's RealFiles/Registrations.Tests.cs.

const bindings = allBindings().map(({ binding }) => binding);
const turtle = bindingOf('w3c-turtle.fbl', 'turtle');

/** The copied declared file binding whose `claims.origins` holds `origin`, if any. */
const declaredFor = (origin: string): FblBinding | undefined => bindings.find((binding) => !binding.plugin && !binding.body.isFolder && binding.claims.origins.includes(origin));

interface Registered {
  readonly file: RealFile;
  readonly name: string;
  readonly registration: RegistrationDocument;
}

const read = registrations.map((file): Registered => ({ file, name: file.name, registration: RegistrationDocument.read(bytesOfFile(file)) }));
const locate = (registered: Registered, binding: FblBinding): BodyLocation => locateBody(registered.file.path, registered.registration, binding, registered.file.root, nodeFiles);
const sidecarOf = (binding: FblBinding, location: BodyLocation): string => LegacySidecar.pathFor(binding.registration.legacyLayout!, location.path!);

// A test is given the registrations it concerns: one of another origin is not a case of it, rather
// than a case that passes having checked nothing.
const ofDeclared = read.filter(({ registration }) => declaredFor(registration.origin));
const ofW3C = read.filter(({ registration }) => ['w3c/owl', 'w3c/shacl', 'w3c/skos'].includes(registration.origin));
const ofC4 = read.filter(({ registration }) => registration.origin.startsWith('c4/') && declaredFor(registration.origin));
const withLegacyLayout = ofC4.filter((registered) => {
  const binding = declaredFor(registered.registration.origin)!;
  const location = locate(registered, binding);
  return location.exists && !registered.registration.layout && nodeFiles.kind(sidecarOf(binding, location)) === 'file';
});

describe('the registrations among the real files', () => {
  it('the enumeration finds the registrations', () => {
    expect(registrations.filter((file) => file.copied).length).toBeGreaterThanOrEqual(minimumRegistrations);
    expect(ofDeclared.length).toBeGreaterThan(0);
    expect(ofW3C.length).toBeGreaterThan(0);
    expect(withLegacyLayout.length).toBeGreaterThan(0);
  });

  it.each(read)('the registration parses and saves unchanged: $name', ({ file }) => {
    const bytes = bytesOfFile(file);
    const registration = OpenRegistration.open(bytes);
    const result = registration.change({ kind: 'save' });
    expect(registration.document.origin.trim(), 'the origin on line 1').not.toBe('');
    expect(result).toEqual({ planned: { splices: [] } });
    expect(registration.bytes).toEqual(bytes);
  });

  it.each(ofDeclared)('a declared bindings registration opens its body: $name', (registered) => {
    const { file, name, registration } = registered;
    const binding = declaredFor(registration.origin)!;
    const location = locate(registered, binding);

    // The body resolves and exists.
    expect(location.refusal).toBeUndefined();
    checkDivergence('registration-body', binding.name, name, location.exists ? undefined : `no body at ${nameIn(file, location.path!)}`);
    if (!location.exists) return;
    const body = OpenBody.open(nodeFiles.read(location.path!)!, binding, optionsFor(binding, nameIn(file, location.path!), registration.headers));
    const model = body.model;
    if (model.unreadable) return;

    // The view and the resource select something.
    if (registration.view !== undefined) {
      checkDivergence('registration-view', binding.name, name, model.selectView(registration.view) ? undefined : `no view '${registration.view}' among ${model.views.map((view) => view.name).join(', ')}`);
    }
    if (registration.resource !== undefined) {
      checkDivergence('registration-resource', binding.name, name, model.resources.includes(registration.resource) ? undefined : `no resource '${registration.resource}' among [${model.resources.join(', ')}]`);
    }

    // Every layout entry names an element of the reading, or is reported stale.
    const ids = new Set(model.elements.map((element) => element.id));
    const stale = registration.staleEntries(ids, name);
    const unknown = (registration.layout?.entries ?? []).map((entry) => entry.key).filter((id) => !ids.has(id)).sort(ordinal);
    expect(stale.map((finding) => finding.code)).toEqual(unknown.map(() => findingCodes.staleViewData));
    checkDivergence('registration-layout', binding.name, name, unknown.length === 0 ? undefined : `${unknown.length} layout entries name no element: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? ', …' : ''}`);
  });

  it.each(ofW3C)('a W3C readings suggest matches its body: $name', (registered) => {
    const { name, registration } = registered;
    const location = locate(registered, turtle);
    expect(location.refusal).toBeUndefined();
    expect(location.exists, `the body of ${name} at ${location.path}`).toBe(true);
    const suggests = suggestsReading(turtle, registration.origin, nodeFiles.read(location.path!)!);
    checkDivergence('reading-suggest', turtle.name, name, suggests ? undefined : `the ${registration.origin} reading's suggest does not match ${nameOf(location.path!)}`);
  });

  it.each(withLegacyLayout)('a C4 registration reads its legacy layout: $name', (registered) => {
    const { file, name, registration } = registered;
    const binding = declaredFor(registration.origin)!;
    const location = locate(registered, binding);
    const sidecar = LegacySidecar.open(nodeFiles.read(sidecarOf(binding, location))!);
    const positions = sidecar.positions(registration.view);
    const model = OpenBody.open(nodeFiles.read(location.path!)!, binding, optionsFor(binding, nameIn(file, location.path!))).model;
    // The sidecar reads, and every position of the view names an element of the reading.
    expect(sidecar.isUnreadable).toBe(false);
    expect([...positions.keys()].filter((id) => !model.find(id)).sort(ordinal), `${name}: positions of the legacy layout the reading does not have`).toEqual([]);
  });

  it('the C4 legacy layouts are positioned through their registrations', () => {
    const binding = bindingOf('structurizr.fbl', 'workspace');
    let placed = 0;
    for (const registered of read) {
      if (!registered.registration.origin.startsWith('c4/') || registered.registration.layout) continue;
      const location = locate(registered, binding);
      if (!location.exists) continue;
      const bytes = nodeFiles.read(sidecarOf(binding, location));
      if (bytes) placed += LegacySidecar.open(bytes).positions(registered.registration.view).size;
    }
    // The enumeration found positions to apply at all, so the test above is not vacuous.
    expect(placed).toBeGreaterThan(0);
  });

  it('every chart folder is recognised and every turtle file routes to the turtle binding', () => {
    const chart = bindingOf('helm-chart.fbl', 'chart');
    const folders = chartFolders.map((file) => file.path.slice(0, -'/Chart.yaml'.length));
    expect(chartFolders.filter((file) => file.copied).length).toBeGreaterThanOrEqual(minimumChartFolders);
    expect(folders.filter((folder) => !recogniseFolder(chart, folder, nodeFiles)), 'folders not recognised as a chart').toEqual([]);
    expect(folders.filter((folder) => !folderFiles(chart, folder, nodeFiles).some((file) => file.relativePath === 'Chart.yaml')), 'charts without their Chart.yaml').toEqual([]);
    expect(turtleFiles.filter((file) => file.copied).length).toBeGreaterThanOrEqual(minimumTurtle);
    const misrouted = turtleFiles.filter((file) => {
      const found = candidates(file.name, bytesOfFile(file), bindings);
      return found.length !== 1 || found[0] !== turtle;
    });
    expect(misrouted.map((file) => file.name), 'Turtle and N-Triples files not routed to the turtle binding alone').toEqual([]);
  }, 60_000);
});
