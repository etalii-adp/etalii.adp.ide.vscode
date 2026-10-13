import { keywordOf, kindIds, kinds } from './model';
import { itemLine, oneLine } from './planner';

/** The section that tells the agent how to follow the tree. */
export function legend(): string[] {
  return [
    '## How to follow the behavior',
    '',
    'The behavior below is a behavior tree, and it is your instructions. Start at its first node and work through it from the top. Each list item is a node; the items indented under a node are its children, in order. Every node ends in success or failure, and its parent decides what happens next:',
    '',
    ...kinds.map((kind) => `- **${kind.keyword}** ${kind.meaning}.`),
    '',
    'Lines under a node that are not list items are notes: follow them while you carry out that node.',
  ];
}

/**
 * The text of a new behavior model: a Markdown file an agent can follow from the first save. It
 * explains itself to the agent, and starts the tree with one Do in order. CRLF, as every ADP host
 * writes a new document.
 */
export function newDocument(title: string): string {
  const heading = oneLine(title);
  return [
    `# ${heading.length > 0 ? heading : 'Agent'}`,
    '',
    'Describe the agent here: who it works for, and what it is for.',
    '',
    ...legend(),
    '',
    '## Behavior',
    '',
    itemLine('- ', keywordOf(kindIds.sequence, 0), 'Handle the request'),
    '',
  ].join('\r\n');
}
