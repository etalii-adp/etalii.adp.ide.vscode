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
      default: return undefined;
    }
  };
}

function attribute(request: Request, name: string): string {
  const value = request.attributes[name];
  return value === undefined || value === null ? '' : String(value);
}

const unprefixed = (id: string | undefined): string => (id === undefined ? '' : id.slice(id.indexOf(':') + 1));
