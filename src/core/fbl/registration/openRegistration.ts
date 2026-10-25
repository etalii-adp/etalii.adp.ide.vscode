import { bindingOf, type FblBinding, type RegistrationBlockDeclaration, type RegistrationSettings } from '../documents/types';
import type { Finding } from '../finding';
import { driftEdit, SplicedFile } from '../history/splicedFile';
import { messages } from '../messages';
import type { ModelChange } from '../planning/modelChange';
import { formatNumber } from '../planning/newText';
import type { PlanResult } from '../planning/plan';
import type { Span } from '../span';
import { emptyEdit, type FblSplice } from '../splice';
import { RefusedException } from '../rules/familyReader';
import type { BodyText } from '../text/bodyText';
import { compareUtf8, planSetting, type BlockMember } from './declaredBlockWriter';
import { RegistrationDocument, type RegistrationBlock, type RegistrationEntry } from './registrationDocument';

export { compareUtf8 } from './declaredBlockWriter';

/**
 * An open registration (FBL 8): its bytes, its line form, and its own history. Placing an element
 * writes its layout entry by splices, in the ordinal order of ids, with numbers in `{decimals: 3}`
 * form and the registration's own line ending (FBL 8.3); a setting writes an entry of a block the
 * binding declares (FBL 0.7 8.4).
 */
export class OpenRegistration extends SplicedFile {
  private read: RegistrationDocument;

  /** The blocks the binding declares (FBL 0.7 8.1), in the order it declares them. */
  private readonly declarations: readonly RegistrationBlockDeclaration[];

  /** The headers the binding declares (FBL 8.1). */
  private readonly declaredHeaders: readonly string[];

  /**
   * The ids the reading has, when known. A layout entry for any other id is stale and is removed as
   * part of the next placement (FBL 8.5).
   */
  knownIds: ReadonlySet<string> | undefined;

  /** The natural keys the reading has, when known: an `identities` entry for any other key is stale (FBL 8.6). */
  knownKeys: ReadonlySet<string> | undefined;

  /** Whether DISL marks an id ephemeral: such an element's position is never stored (FBL 8.5). */
  isEphemeral: (id: string) => boolean = () => false;

  /**
   * The members a declared block stands for while it is absent, by its name, in their order: the
   * initial and the implicit members of its list, which the tool type's specification gives and the
   * body implies (DESL 0.2 5.5, 7.7.2). The first change to such a block writes them all, with the
   * change applied (FBL 0.7 8.4); nothing, or a block it gives nothing for, writes the changed entry
   * alone. FBL knows no list, so the host tells it.
   */
  absentMembers: (block: string) => readonly BlockMember[] | undefined = () => undefined;

  private constructor(bytes: Uint8Array, settings: RegistrationSettings) {
    super(bytes);
    this.declarations = settings.blocks;
    this.declaredHeaders = settings.headers;
    this.read = RegistrationDocument.read(bytes, this.declared);
  }

  /** Opens a registration, through its binding when given, which declares its headers and blocks (FBL 0.7 8.1). */
  static open(bytes: Uint8Array, binding?: FblBinding): OpenRegistration {
    return new OpenRegistration(bytes, (binding ?? bindingOf({ name: '' })).registration);
  }

  get document(): RegistrationDocument {
    return this.read;
  }

  /** The entries of the declared block `block` (FBL 0.7 8.1), by key and value in their order, or nothing when the registration does not hold it. */
  blockEntries(block: string): BlockMember[] | undefined {
    return this.read.block(block)?.entries.map((entry) => ({ key: entry.key, value: entry.value }));
  }

  /**
   * What reading the registration reports (FBL 8.1, 8.5, 0.7 8.1): the headers and blocks neither
   * FBL nor the binding declares, and, when `knownIds` is set, the entries for ids the body does not have.
   */
  findings(fileName: string): Finding[] {
    const findings = [...this.read.unknownHeaders(this.declaredHeaders, fileName), ...this.read.unknownBlocks(fileName)];
    if (this.knownIds) findings.push(...this.read.staleEntries(this.knownIds, fileName, this.declarations));
    return findings;
  }

  private get declared(): string[] {
    return this.declarations.map((declaration) => declaration.name);
  }

  private declaration(name: string): RegistrationBlockDeclaration | undefined {
    return this.declarations.find((declaration) => declaration.name === name);
  }

  plan(change: ModelChange): PlanResult {
    switch (change.kind) {
      case 'save':
        return { planned: emptyEdit };
      case 'place':
        if (this.isEphemeral(change.id)) return { refused: messages.ephemeralPosition(change.id) };
        return { planned: { splices: this.planPlace(change.id, change.x, change.y) } };
      case 'identify':
        return { planned: { splices: this.planIdentify(change.key, change.id) } };
      case 'setting': {
        const declaration = this.declaration(change.block);
        if (!declaration) return { refused: messages.undeclaredBlock(change.block) };
        // FBL 0.7 8.5: an ephemeral id is never stored as a key of a block keyed by ids.
        if (declaration.keyedByIds && !change.remove && this.isEphemeral(change.rename ?? change.key)) {
          return { refused: messages.ephemeralBlockKey(change.block, change.rename ?? change.key) };
        }
        try {
          return { planned: { splices: planSetting(this.read, this.declarations, declaration, change, this.knownIds, this.absentMembers(change.block)) } };
        } catch (error) {
          if (error instanceof RefusedException) return { refused: error.message };
          throw error;
        }
      }
      default:
        throw new Error(messages.registrationChange);
    }
  }

  /**
   * Plans and applies `change`. A setting of a block declared `history: false` is applied outside
   * the history (FBL 0.7 7.1): no undo step, and the history carried over it. `current`, when given,
   * is the file as it is now on disk or in another editor's buffer: when it is not the bytes the
   * change is planned against, the change is refused, nothing is written, and the registration is
   * read again from `current` (FBL 0.7 7.2).
   */
  change(change: ModelChange, current?: Uint8Array): PlanResult {
    if (this.drifted(current)) return { refused: driftEdit };
    const result = this.plan(change);
    if (!('planned' in result)) return result;
    if (change.kind === 'setting' && this.declaration(change.block)?.inHistory === false) this.applyOutsideHistory(result.planned);
    else this.apply(result.planned);
    return result;
  }

  /** The lines of the declared blocks with `history: false`, which the comparison of FBL 7.2 leaves out (FBL 0.7 7.1). */
  protected override outsideHistory(bytes: Uint8Array): readonly Span[] {
    const outside = this.declarations.filter((declaration) => !declaration.inHistory);
    if (outside.length === 0) return [];
    const document = sameBytes(bytes, this.bytes) ? this.read : RegistrationDocument.read(bytes, this.declared);
    return outside.flatMap((declaration) => document.block(declaration.name)?.span ?? []).sort((a, b) => a.start - b.start);
  }

  protected reread(): void {
    this.read = RegistrationDocument.read(this.bytes, this.declared);
  }

  private planPlace(id: string, placedX: number, placedY: number): FblSplice[] {
    const document = this.read;
    const x = formatNumber(placedX, 3);
    const y = formatNumber(placedY, 3);
    return this.planEntry(document.layout, 'layout', document.afterHeaders, this.knownIds, id, `${x} ${y}`, (existing) => {
      const text = document.text;
      const parts = numbersIn(text, existing.valueSpan);
      if (parts.length !== 2) return [{ operation: 'replace-value', start: existing.valueSpan.start, end: existing.valueSpan.end, text: `${x} ${y}` }];
      const splices: FblSplice[] = [];
      if (text.textOf(parts[0]) !== x) splices.push({ operation: 'replace-value', start: parts[0].start, end: parts[0].end, text: x });
      if (text.textOf(parts[1]) !== y) splices.push({ operation: 'replace-value', start: parts[1].start, end: parts[1].end, text: y });
      return splices;
    });
  }

  private planIdentify(key: string, id: string): FblSplice[] {
    const document = this.read;
    const after = document.layout ? document.layout.span.end : document.afterHeaders;
    return this.planEntry(document.identities, 'identities', after, this.knownKeys, key, id, (existing) =>
      (document.text.textOf(existing.valueSpan) === id ? [] : [{ operation: 'replace-value', start: existing.valueSpan.start, end: existing.valueSpan.end, text: id }]));
  }

  /**
   * Writes one entry of a block (FBL 8.3, 8.6): its value replaced in place when it exists, else
   * inserted in the ordinal order of keys, creating the block at `createAt` first; stale entries
   * (keys not in `known`) are removed in the same edit (FBL 8.5).
   */
  private planEntry(
    block: RegistrationBlock | undefined, name: string, createAt: number, known: ReadonlySet<string> | undefined,
    key: string, value: string, replace: (existing: RegistrationEntry) => FblSplice[],
  ): FblSplice[] {
    const text = this.read.text;
    const lastLine = text.lines[text.lines.length - 1];
    const splices: FblSplice[] = [];
    const stale = !block || !known ? [] : block.entries.filter((entry) => entry.key !== key && !known.has(entry.key));
    for (const entry of stale) splices.push({ operation: 'remove-entry', start: entry.line.start, end: entry.line.end, text: '' });
    const existing = block?.entries.find((entry) => entry.key === key);
    if (existing) {
      splices.push(...replace(existing));
      return ordered(splices);
    }
    if (!block) {
      const offset = createAt;
      const newline = text.newlineAt(Math.max(0, offset - 1), '\n');
      const lead = offset === text.length && lastLine.ending.length === 0 && offset > 0;
      if (lead) {
        splices.push({ operation: 'ensure-container', start: offset, end: offset, text: `${newline}${name}:` });
        splices.push({ operation: 'insert-entry', start: offset, end: offset, text: `${newline}  ${key}: ${value}` });
      } else {
        splices.push({ operation: 'ensure-container', start: offset, end: offset, text: `${name}:${newline}` });
        splices.push({ operation: 'insert-entry', start: offset, end: offset, text: `  ${key}: ${value}${newline}` });
      }
      return splices;
    }
    const kept = block.entries.filter((entry) => !stale.includes(entry));
    const next = kept.find((entry) => compareUtf8(entry.key, key) > 0);
    const indent = ' '.repeat(kept[0]?.indent ?? 2);
    const at = next ? next.line.start : kept[kept.length - 1]?.line.end ?? block.nameLine.end;
    const ending = text.newlineAt(Math.max(0, at - 1), '\n');
    const entryText = at === text.length && lastLine.ending.length === 0
      ? `${ending}${indent}${key}: ${value}`
      : `${indent}${key}: ${value}${ending}`;
    splices.push({ operation: 'insert-entry', start: at, end: at, text: entryText });
    return ordered(splices);
  }
}

/**
 * The splices in body order. At one offset an insertion goes before a removal that starts there,
 * as when a new entry follows the last kept one and a stale entry comes next (FBL 8.5, 8.6).
 */
const ordered = (splices: FblSplice[]): FblSplice[] =>
  splices
    .map((splice, index) => ({ splice, index }))
    .sort((a, b) => a.splice.start - b.splice.start || a.splice.end - b.splice.end || a.index - b.index)
    .map(({ splice }) => splice);

/** The spans of the numbers of a layout entry's value, separated by spaces. */
function numbersIn(text: BodyText, value: Span): Span[] {
  const spans: Span[] = [];
  let i = value.start;
  while (i < value.end) {
    while (i < value.end && text.bytes[i] === 0x20) i++;
    const start = i;
    while (i < value.end && text.bytes[i] !== 0x20) i++;
    if (i > start) spans.push({ start, end: i });
  }
  return spans;
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((byte, at) => byte === b[at]);
