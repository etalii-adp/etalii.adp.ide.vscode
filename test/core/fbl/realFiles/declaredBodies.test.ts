import { describe, expect, it } from 'vitest';
import { isComputed } from '../../../../src/core/fbl/documents/types';
import { OpenBody } from '../../../../src/core/fbl/history/openBody';
import { driftUndo } from '../../../../src/core/fbl/history/splicedFile';
import type { ModelChange } from '../../../../src/core/fbl/planning/modelChange';
import { readBody, type BodyReading } from '../../../../src/core/fbl/rules/bodyReading';
import type { ReadElement } from '../../../../src/core/fbl/rules/familyReader';
import type { FblSplice } from '../../../../src/core/fbl/splice';
import { utf8 } from '../support/repository';
import { all, bytesOfFile, declared, fileOf, filesOf, find, loaded, optionsFor, pairs, registrations } from './corpus';
import { checkDivergence, divergences, properties } from './divergences';

// The copied declared bindings on every real file they claim: read without throwing and every byte
// accounted for, saved unchanged, edited and removed touching only the splices' bytes and undone
// exactly, and an undo refused when the file has drifted. Counterparts of standalone's
// RealFiles/DeclaredBodies.Tests.cs.

const open = (key: string, file: string): { body: OpenBody; bytes: Uint8Array } => {
  const binding = loaded(find(key));
  const bytes = bytesOfFile(fileOf(file));
  return { body: OpenBody.open(bytes, binding, optionsFor(binding, file)), bytes };
};

/**
 * The first element's first writable attribute: the first element in document order with an
 * attribute that is present, writable, a string, and neither its key, a reference nor a mapped
 * value, whose change would mean something else than an edit of text.
 */
function firstWritable(reading: BodyReading): { element: ReadElement; attribute: string; value: string } | undefined {
  for (const element of reading.elements) {
    if (element.isRelation || element.rule.readOnly !== undefined) continue;
    for (const [name, binding] of element.rule.attributes) {
      if (isComputed(binding) || binding.parent !== undefined || binding.reference || binding.map || binding.flag) continue;
      if (name === element.keyAttribute) continue;
      const from = element.rule.id?.from;
      if (from && from.key === binding.key && from.attribute === binding.attribute && from.group === binding.group && from.capture === binding.capture) continue;
      const read = element.slots.get(name);
      if (!read?.present || !read.writable || typeof read.value !== 'string' || read.value.length === 0) continue;
      return { element, attribute: name, value: read.value };
    }
  }
  return undefined;
}

const editOf = (target: { element: ReadElement; attribute: string; value: string }): ModelChange =>
  ({ kind: 'set', id: target.element.id, attributes: { [target.attribute]: `${target.value} edited` } });

/** Every byte outside the splices is unchanged: the bytes between splices match, in order, before and after. */
function expectOnlySplicesChanged(before: Uint8Array, after: Uint8Array, splices: readonly FblSplice[], file: string): void {
  let position = 0;
  let shift = 0;
  for (const splice of splices) {
    const kept = before.subarray(position, splice.start);
    expect(after.subarray(position + shift, position + shift + kept.length), `${file}: bytes ${position}..${splice.start} changed outside the edit's splices.`).toEqual(kept);
    shift += utf8(splice.text).length - (splice.end - splice.start);
    position = splice.end;
  }
  expect(after.length, `${file}: the length after the edit`).toBe(before.length + shift);
  expect(after.subarray(position + shift), `${file}: bytes after ${position} changed outside the edit's splices.`).toEqual(before.subarray(position));
}

// A property that does not concern a file is not one of its cases: a file that is read-only or has
// no attribute to edit is left out of the edit tests rather than reported as passing them.
const editable = pairs.filter(({ key, file }) => {
  const { body } = open(key, file);
  return !body.isReadOnly && firstWritable(body.reading) !== undefined;
});
const removableOf = (reading: BodyReading): ReadElement | undefined => reading.elements.find((element) => element.rule.remove && element.rule.readOnly === undefined);
const removable = pairs.filter(({ key, file }) => {
  const { body } = open(key, file);
  return !body.isReadOnly && removableOf(body.reading) !== undefined;
});
const undoable = editable.filter(({ key, file }) => {
  const { body } = open(key, file);
  return 'planned' in body.plan(editOf(firstWritable(body.reading)!));
});

describe('the declared bindings on real files', () => {
  it.each(declared)('the enumeration finds the files: $key', (binding) => {
    const copied = filesOf(binding).filter((file) => file.copied);
    expect(copied.length, `${binding.key}: files copied from standalone`).toBeGreaterThanOrEqual(binding.minimum);
  });

  it('the cases of the tests below are found', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(46);
    expect(editable.length).toBeGreaterThan(0);
    expect(removable.length).toBeGreaterThan(0);
    expect(undoable.length).toBeGreaterThan(0);
  });

  it.each(pairs)('the file reads: $key on $file', ({ key, file }) => {
    const binding = loaded(find(key));
    const reading = readBody(bytesOfFile(fileOf(file)), binding, optionsFor(binding, file));
    // Unreadable only where listed, with the reason the reading gives.
    checkDivergence('unreadable', key, file, reading.unreadable ? `offset ${reading.unreadable.offset}: ${reading.unreadable.message}` : undefined);
    if (reading.unreadable) return;
    const gaps = reading.family.unaccounted().map((gap) => `[${gap.start}, ${gap.end}) '${reading.text.textOf(gap)}'`);
    expect(gaps, `${file}: bytes no node of the reading owns`).toEqual([]);
  });

  it.each(pairs)('a save without an edit writes the bytes that were read: $key on $file', ({ key, file }) => {
    const { body, bytes } = open(key, file);
    const result = body.change({ kind: 'save' });
    if (body.isReadOnly) expect(result).toHaveProperty('refused');
    else expect(result).toEqual({ planned: { splices: [] } });
    expect(body.bytes).toEqual(bytes);
  });

  it.each(editable)('an edit changes only its splices and its undo restores the file: $key on $file', ({ key, file }) => {
    const { body, bytes } = open(key, file);
    const target = firstWritable(body.reading)!;
    const result = body.change(editOf(target));
    checkDivergence('edit', key, file, 'refused' in result ? `${target.element.id}.${target.attribute}: ${result.refused}` : undefined);
    if ('refused' in result) return;
    expectOnlySplicesChanged(bytes, body.bytes, result.planned.splices, file);
    expect(body.undo()).toHaveProperty('done');
    expect(body.bytes).toEqual(bytes);
  });

  it.each(removable)('a removal changes only its splices and its undo restores the file: $key on $file', ({ key, file }) => {
    const { body, bytes } = open(key, file);
    const element = removableOf(body.reading)!;
    const result = body.change({ kind: 'remove', id: element.id });
    checkDivergence('remove', key, file, 'refused' in result ? `${element.id}: ${result.refused}` : undefined);
    if ('refused' in result) return;
    expect(result.planned.splices.length).toBeGreaterThan(0);
    expectOnlySplicesChanged(bytes, body.bytes, result.planned.splices, file);
    expect(body.model.elements.filter((other) => other.id === element.id && other.type === element.rule.type)).toEqual([]);
    expect(body.undo()).toHaveProperty('done');
    expect(body.bytes).toEqual(bytes);
  });

  it.each(undoable)('an undo after the file changed is refused: $key on $file', ({ key, file }) => {
    const { body } = open(key, file);
    body.change(editOf(firstWritable(body.reading)!));
    const edited = body.bytes;
    const drifted = Uint8Array.of(...edited, 0x0a);
    expect(body.undo(drifted)).toEqual({ refused: driftUndo });
    expect(body.bytes).toEqual(edited);
  });

  it('every listed divergence names a file of the suite', () => {
    const registered = new Set(registrations.map((file) => file.name));
    const names = new Set(all.map((file) => file.name));
    for (const divergence of divergences) {
      expect(properties, `the property of the divergence on ${divergence.file}`).toContain(divergence.property);
      expect(divergence.reason.trim(), `The divergence on ${divergence.file} gives no reason.`).not.toBe('');
      const known = declared.some((binding) => binding.key === divergence.binding && filesOf(binding).some((file) => file.name === divergence.file)) || registered.has(divergence.file);
      expect(known && names.has(divergence.file), `divergences.json lists ${divergence.file} for ${divergence.binding}, which the suite does not read.`).toBe(true);
    }
  });
});
