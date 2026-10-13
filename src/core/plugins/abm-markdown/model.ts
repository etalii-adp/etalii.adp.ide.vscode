// The eleven kinds of node an agent behavior model has: the game industry's behavior tree
// vocabulary, tuned for an agent that works turn by turn with a person and with tools. The keyword
// is plain English on purpose: the file is read by a model that may never have heard of a selector
// or a sequence. The ids keep the behavior tree names, and the types are the definition's.

/** An inclusive range of zero-based line indices: the lines that declare one construct. */
export interface LineRange {
  readonly start: number;
  readonly end: number;
}

/** What a node may hold beneath it. */
export type Category = 'composite' | 'decorator' | 'leaf';

export interface Kind {
  /** The kind's id, as the behavior tree vocabulary names it (`sequence`). */
  readonly id: string;
  /** The type of the definition's metamodel a node of this kind is read as (`Sequence`). */
  readonly type: string;
  /** What the Markdown says in bold before the label (`Do in order`). */
  readonly keyword: string;
  readonly category: Category;
  /** One sentence on what the node does, as the agent is told it. */
  readonly meaning: string;
}

export const kindIds = {
  sequence: 'sequence', fallback: 'fallback', parallel: 'parallel',
  retry: 'retry', repeat: 'repeat', guard: 'guard', approval: 'approval',
  check: 'check', action: 'action', ask: 'ask', delegate: 'delegate',
} as const;

/** How many attempts a new Retry node allows. */
export const defaultRetryCount = 3;

/** Every kind, in the order the legend of a new file lists them. */
export const kinds: readonly Kind[] = [
  { id: kindIds.sequence, type: 'Sequence', keyword: 'Do in order', category: 'composite', meaning: 'runs its children one after another, and fails as soon as one fails' },
  { id: kindIds.fallback, type: 'Fallback', keyword: 'Try in order', category: 'composite', meaning: 'tries its children one after another, and succeeds as soon as one succeeds' },
  { id: kindIds.parallel, type: 'Parallel', keyword: 'Do together', category: 'composite', meaning: 'runs its children independently, at the same time where you can, and succeeds when all of them succeed' },
  { id: kindIds.retry, type: 'Retry', keyword: 'Retry up to N times', category: 'decorator', meaning: 'runs its child again when it fails, at most N times in all' },
  { id: kindIds.repeat, type: 'RepeatUntil', keyword: 'Repeat until', category: 'decorator', meaning: 'runs its child again and again until its condition holds' },
  { id: kindIds.guard, type: 'Guard', keyword: 'Only while', category: 'decorator', meaning: 'runs its child only while its condition holds, and abandons it when the condition stops holding' },
  { id: kindIds.approval, type: 'Approval', keyword: 'Ask approval before', category: 'decorator', meaning: "says what its child is about to do and waits for the user's explicit approval; without it, the node fails" },
  { id: kindIds.check, type: 'Check', keyword: 'Check', category: 'leaf', meaning: 'answers its question from the conversation, your memory or a tool result; it succeeds when the answer is yes, and never acts' },
  { id: kindIds.action, type: 'Do', keyword: 'Do', category: 'leaf', meaning: 'carries out one piece of work: a tool call, an answer, an edit' },
  { id: kindIds.ask, type: 'AskUser', keyword: 'Ask the user', category: 'leaf', meaning: 'asks its question and waits for the answer' },
  { id: kindIds.delegate, type: 'Delegate', keyword: 'Delegate', category: 'leaf', meaning: 'hands its task to a sub-agent, or follows the behavior file it links to' },
];

const byId = new Map(kinds.map((kind) => [kind.id, kind]));
const byType = new Map(kinds.map((kind) => [kind.type, kind]));

export function kindOf(id: string): Kind {
  const kind = byId.get(id);
  if (!kind) throw new Error(`A behavior model has no \`${id}\` node.`);
  return kind;
}

/** The kind a type of the definition's metamodel is written as; undefined when it is none of the eleven. */
export const kindOfType = (type: string): Kind | undefined => byType.get(type);

/**
 * The kind a keyword names, with a Retry's count; undefined when the keyword is none of them. Read
 * without regard to case or surrounding space, because a person typing the Markdown by hand should
 * not have to match the capitals.
 */
export function kindFromKeyword(keyword: string): { kind: Kind; retryCount: number } | undefined {
  const normalized = keyword.split(' ').filter((part) => part.length > 0).join(' ');
  const retry = /^retry up to (\d{1,6}) times?$/i.exec(normalized);
  if (retry) return { kind: kindOf(kindIds.retry), retryCount: Number(retry[1]) };
  const kind = kinds.find((candidate) => candidate.id !== kindIds.retry && candidate.keyword.toLowerCase() === normalized.toLowerCase());
  return kind ? { kind, retryCount: 0 } : undefined;
}

/** The keyword a node of a kind is written with. */
export function keywordOf(id: string, retryCount: number): string {
  return id === kindIds.retry ? `Retry up to ${retryCount} ${retryCount === 1 ? 'time' : 'times'}` : kindOf(id).keyword;
}

/** One node of the tree, as it was read from one list item and the lines under it. */
export interface Node {
  /** Its place in the tree: `1` for the first root, `1.2` for that root's second child. */
  readonly id: string;
  readonly kind: string;
  /** The text after the keyword. */
  readonly label: string;
  /** A Retry's attempts; zero for every other kind. */
  readonly retryCount: number;
  /** The plain lines under the item, without their indentation. */
  readonly notes: string;
  /** False for an item without a keyword, which is read as a Do. */
  readonly hasKeyword: boolean;
  /** The item's own line, counted from zero. */
  readonly line: number;
  readonly notesRange: LineRange | undefined;
  /** The last line that belongs to this node: its notes, or its last descendant's. */
  readonly subtreeEnd: number;
  /** The column the item's marker sits at. */
  readonly indent: number;
  /** The column the item's text starts at, where its notes are written. */
  readonly contentIndent: number;
  /** The list marker: `-`, `*` or `+`. */
  readonly marker: string;
  /** The keyword exactly as written, so a rename keeps the author's own spelling. */
  readonly keywordText: string;
  readonly parentId: string | undefined;
  readonly childIds: readonly string[];
}

export const categoryOf = (node: Pick<Node, 'kind'>): Category => kindOf(node.kind).category;

/** Whether another child may be added beneath a node. */
export function takesAnotherChild(node: Pick<Node, 'kind' | 'childIds'>): boolean {
  const category = categoryOf(node);
  return category === 'composite' || (category === 'decorator' && node.childIds.length === 0);
}

/** The keyword as a sentence names it: the canonical one, with a Retry's count. */
export const shownKeyword = (node: Pick<Node, 'kind' | 'retryCount'>): string => keywordOf(node.kind, node.retryCount);

/** What the parser read from one Markdown file. */
export interface Model {
  /** Every node, in document order, which is also depth-first order. */
  readonly nodes: readonly Node[];
  /** The Behavior heading's line, counted from zero; undefined when the file has none. */
  readonly sectionLine: number | undefined;
  /** The column the tree's root items sit at. */
  readonly listIndent: number;
}

export const emptyModel: Model = { nodes: [], sectionLine: undefined, listIndent: 0 };

export const rootsOf = (model: Model): Node[] => model.nodes.filter((node) => node.parentId === undefined);

export const nodeOf = (model: Model, id: string): Node | undefined => model.nodes.find((node) => node.id === id);

export function childrenOf(model: Model, node: Node): Node[] {
  return node.childIds.map((id) => nodeOf(model, id)).filter((child): child is Node => child !== undefined);
}

/** Whether a place is a node's own or lies beneath it. */
export const isWithin = (candidate: string, node: string): boolean => candidate === node || candidate.startsWith(`${node}.`);
