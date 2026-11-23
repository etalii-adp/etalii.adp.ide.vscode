import { behaviorTreeIds } from './behaviorTree';

/** What an id derivation is asked: the library's `IdRequest`, as far as these derivations use it. */
interface Request {
  readonly rule: string;
  readonly type?: string;
  readonly line?: number;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly source?: string;
  readonly target?: string;
  readonly parentId?: string;
  readonly positionInSlot?: number;
}

/**
 * The id derivations the copied fixtures name their elements by, standing in for DISL, which the
 * library does not implement. Each mirrors the `persistence.ids` of the specification in
 * etalii.adp's `definitions/diagrams/`: natural ids with the type's prefix, and the causal loop's
 * links and loops by their ends and identifier as its fixtures address them.
 */
export function naturalIds(binding: string): (request: Request) => string | undefined {
  // Agent Behavior Modelling (behavior-tree.fbl#abm, FBL 0.7): a node's id is its place in the tree.
  if (binding === 'abm') return (request) => behaviorTreeIds({ parentId: request.parentId, positionInSlot: request.positionInSlot ?? 0 });
  return (request) => {
    switch (`${binding}/${request.rule}`) {
      case 'cld/link': return `link:${request.source ?? ''}|${request.target ?? ''}`;
      case 'cld/loop': return `loop:${attribute(request, 'identifier')}`;
      case 'job/task': return `task:${attribute(request, 'key')}`;
      case 'job/cluster': return `cluster:${attribute(request, 'key')}`;
      case 'job/dependency': return `edge:${unprefixed(request.source)}->${unprefixed(request.target)}`;
      case 'settings/pipeline': return 'pipeline';
      case 'settings/library': return `library:${attribute(request, 'path')}`;
      case 'freeplane/branch': return `branch:${request.source ?? ''}->${request.target ?? ''}`;
      case 'workspace/relationship': return `${request.source ?? ''}->${request.target ?? ''}`;
      // The agent activity diagram (DISL 0.4, persistence.view.bind): the root is the diagram, and a
      // locked position and a group state are view data, keyed by the element they name.
      case 'aad/diagram': return 'diagram';
      case 'aad/placement': return `pinned:${attribute(request, 'element')}`;
      case 'aad/group': return `groups:${attribute(request, 'element')}#${attribute(request, 'group')}`;
      // The value stream map (definitions/diagrams/value-stream-map.dis, persistence.ids): the root is the
      // diagram, a vocabulary entry is named by its name, and a flow, alternative or rework by its ends.
      case 'vsm/diagram': return 'diagram';
      case 'vsm/activity': return `activity:${attribute(request, 'name')}`;
      case 'vsm/practice': return `practice:${attribute(request, 'name')}`;
      case 'vsm/currentFlow': case 'vsm/futureFlow': case 'vsm/currentAlternative': case 'vsm/futureAlternative': return `flow:${request.source ?? ''}->${request.target ?? ''}`;
      case 'vsm/currentRework': case 'vsm/futureRework': return `rework:${request.source ?? ''}->${request.target ?? ''}`;
      default: return binding === 'openslo' || binding === 'folder' ? openSloId(request) : undefined;
    }
  };
}

/**
 * The SLO map (definitions/diagrams/openslo-slo.dis, persistence.ids): a document's object by its kind
 * and name, an inline object by its owner's id and its own, an objective by its owner's and its
 * place, and a document of no kind the map draws by its line.
 */
function openSloId(request: Request): string | undefined {
  if (request.rule === 'objective') return `${request.parentId ?? ''}/objective:${(request.positionInSlot ?? 0) + 1}`;
  if (request.rule === 'other') return `document@${request.line ?? 0}`;
  const own = `${request.type ?? ''}:${attribute(request, 'name')}`;
  return request.rule.startsWith('inline') && request.parentId !== undefined ? `${request.parentId}/${own}` : own;
}

/**
 * The attributes a binding's tool type gives a date or date-time type, each as `rule.attribute`,
 * which FBL 6.3 asks of the host: read here, as the ids are, from the specifications in etalii.adp.
 */
export const timeAttributes = (binding: string): ReadonlySet<string> => new Set(binding === 'aad' ? ['task.updated', 'pullRequest.updated'] : []);

/**
 * The type a binding's tool type gives an attribute, which FBL 5.2 asks of the host: a string
 * attribute reads a scalar's written text and every other its typed value, converted. Read here,
 * as the ids are, from the specifications in etalii.adp (`definitions/diagrams/timeline.dis`): an
 * element's label is a string, its begin and end are date-times and its row is an int. A binding
 * whose fixtures state no attribute value is given no type, and reads as its family reads it.
 */
export function attributeTypes(binding: string): ((element: string, attribute: string) => string | undefined) | undefined {
  if (binding !== 'timeline') return undefined;
  const types: Readonly<Record<string, string>> = { label: 'string', begin: 'datetime', end: 'datetime', row: 'int' };
  return (_element, attribute) => (Object.hasOwn(types, attribute) ? types[attribute] : undefined);
}

/**
 * The defaults a binding's tool type gives the attributes of a new element, which a host fills in
 * before the add reaches the binding: read here, as the ids are, from the specifications in
 * etalii.adp. The value stream map's trigger and outcome take their key, `role`, from them
 * (`definitions/diagrams/value-stream-map.dis`, FBL 0.14 6.2).
 */
export function addDefaults(binding: string): (type: string) => Readonly<Record<string, unknown>> {
  if (binding !== 'vsm') return () => ({});
  return (type) => (type === 'Trigger' ? { role: 'trigger' } : type === 'Outcome' ? { role: 'outcome' } : {});
}

/** Whether a binding's tool type keeps DISL's default deletion policy, which clears the references to a removed element. */
export const unsetsReferences = (binding: string): boolean => binding === 'aad';

function attribute(request: Request, name: string): string {
  const value = request.attributes[name];
  return value === undefined || value === null ? '' : String(value);
}

const unprefixed = (id: string | undefined): string => (id === undefined ? '' : id.slice(id.indexOf(':') + 1));
