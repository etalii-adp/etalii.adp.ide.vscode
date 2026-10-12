/** What an id derivation is asked: the library's `IdRequest`, as far as these derivations use it. */
interface Request {
  readonly rule: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly source?: string;
  readonly target?: string;
}

/**
 * The id derivations the copied fixtures name their elements by, standing in for DISL, which the
 * library does not implement. Each mirrors the `persistence.ids` of the specification in
 * etalii.adp's `definitions/diagrams/`: natural ids with the type's prefix, and the causal loop's
 * links and loops by their ends and identifier as its fixtures address them.
 */
export function naturalIds(binding: string): (request: Request) => string | undefined {
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
      default: return undefined;
    }
  };
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

/** Whether a binding's tool type keeps DISL's default deletion policy, which clears the references to a removed element. */
export const unsetsReferences = (binding: string): boolean => binding === 'aad';

function attribute(request: Request, name: string): string {
  const value = request.attributes[name];
  return value === undefined || value === null ? '' : String(value);
}

const unprefixed = (id: string | undefined): string => (id === undefined ? '' : id.slice(id.indexOf(':') + 1));
