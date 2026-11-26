// Elements made in other documents by their own tool types (etalii.adp spec 092, FR-025): a knowledge relation's "Create"
// adds an element with the typed name to the diagram the relation targets. The diagram's tool type makes it, as its ADP
// Toolbox makes one activated rather than dragged: dropped at a free point near the middle of what is drawn, then named.
// A kind is an entry of its toolbox that makes an element the workspace's index can link to.

import { applySplices } from '../fbl/splice';
import { freePointNear, type Box } from '../scene/geometry';
import type { Scene } from '../scene/scene';
import type { EditRequest, ElementKind, ElementMaker, Source, TextSplice, ToolType, ViewOptions } from './toolType';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** What the tool types of the host can make of the files a document names, read from `source.related`. */
export function elementMaker(types: readonly ToolType<unknown, unknown>[], source: Source, today = Math.floor(Date.now() / 86_400_000)): ElementMaker {
  const kinds = new Map<string, readonly ElementKind[]>();
  return {
    offered(file) {
      const other = sourceOf(source, file);
      const type = other && diagramTypeOf(types, other);
      if (!other || !type) return [];
      const key = `${file}\n${other.text}`;
      const known = kinds.get(key);
      if (known) return known;
      const made = type.toolbox(other).filter((entry) => madeBy(type, other, entry.id, entry.label, today) !== undefined).map((entry) => ({ id: entry.id, label: entry.label }));
      kinds.set(key, made);
      return made;
    },
    make(file, kind, name) {
      const other = sourceOf(source, file);
      const type = other && diagramTypeOf(types, other);
      if (!other || !type || !type.toolbox(other).some((entry) => entry.id === kind)) return undefined;
      return madeBy(type, other, kind, name, today);
    },
  };
}

/** A file the document names, as the host read it; undefined for one it could not read. */
function sourceOf(source: Source, file: string): Source | undefined {
  const given = source.related?.[file];
  return given ? { fileName: given.fileName, text: given.text } : undefined;
}

/** The diagram tool type that claims a file. */
function diagramTypeOf(types: readonly ToolType<unknown, unknown>[], source: Source): ToolType<Scene, EditRequest> | undefined {
  return types.find((type) => type.kind === 'diagram' && type.claimed(source.fileName, source.text)) as ToolType<Scene, EditRequest> | undefined;
}

/**
 * The splices that add an element of the toolbox entry `entry`, named `name`, to a diagram, and its id: dropped at a free
 * point near the middle of what is drawn, then renamed; undefined when the drop or the name is refused, or when what it
 * made is no element the workspace's index can link to.
 */
function madeBy(type: ToolType<Scene, EditRequest>, source: Source, entry: string, name: string, today: number): { readonly id: string; readonly splices: readonly TextSplice[] } | undefined {
  const scales = type.fittedScales?.(source, today);
  const options: ViewOptions = scales === undefined ? {} : { scales };
  const nodes = type.view(source, options).nodes;
  const drawn = boundsOf(nodes.map((node) => node.box));
  const wanted = drawn === undefined ? { x: 0, y: 0 } : { x: drawn.x + drawn.width / 2, y: drawn.y + drawn.height / 2 };
  const view: Box = drawn === undefined ? { x: -600, y: -400, width: 1200, height: 800 } : { x: drawn.x - 200, y: drawn.y - 200, width: drawn.width + 400, height: drawn.height + 400 };
  const at = freePointNear(nodes, wanted, view);
  // Sent with nothing selected, as from the toolbox's view: an entry that adds to an element adds to the first drawn.
  const dropped = type.edit(source, { kind: 'drop', entry, x: at.x, y: at.y, selected: [] }, options, false);
  if (dropped.kind !== 'applied' || dropped.splices.length === 0) return undefined;
  const placed = { ...source, text: spliced(source.text, dropped.splices) };
  // What it made: the element it selects, or else the one element the index holds now and did not before.
  const before = new Set(type.indexed?.(source)?.elements.map((element) => element.id) ?? []);
  const added = type.indexed?.(placed)?.elements.filter((element) => !before.has(element.id)) ?? [];
  const id = dropped.select ?? (added.length === 1 ? added[0]!.id : undefined);
  if (id === undefined) return undefined;
  const renamed = type.edit(placed, { kind: 'rename', id, text: name }, options, false);
  if (renamed.kind !== 'applied') return undefined;
  const text = spliced(placed.text, renamed.splices);
  if (type.indexed?.({ ...source, text })?.elements.some((element) => element.id === id) !== true) return undefined;
  return { id, splices: [difference(source.text, text)] };
}

/** The smallest box around boxes; undefined for none. */
function boundsOf(boxes: readonly Box[]): Box | undefined {
  if (boxes.length === 0) return undefined;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The text after the splices of one outcome, each a range of the UTF-8 bytes of the text before. */
function spliced(text: string, splices: readonly TextSplice[]): string {
  return decoder.decode(applySplices(encoder.encode(text), splices.map((splice) => ({ operation: 'replace-value' as const, start: splice.offset, end: splice.offset + splice.length, text: splice.text }))));
}

/** One splice that makes `after` of `before`: the bytes between what they begin and end with alike. */
function difference(before: string, after: string): TextSplice {
  const [a, b] = [encoder.encode(before), encoder.encode(after)];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  // A splice starts and ends between characters: never inside the bytes of one.
  while (start > 0 && (a[start] ?? 0) >> 6 === 2) start -= 1;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end += 1;
  while (end > 0 && (a[a.length - end] ?? 0) >> 6 === 2) end -= 1;
  return { offset: start, length: a.length - start - end, text: decoder.decode(b.subarray(start, b.length - end)) };
}
