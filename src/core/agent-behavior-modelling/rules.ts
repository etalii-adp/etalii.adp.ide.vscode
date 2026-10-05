import type { Finding } from '../frame/diagramType';
import { categoryOf, kindIds, rootsOf, shownKeyword, type Model } from './model';

// What the notation forbids, read over the whole model. A document that breaks a rule still opens
// and still draws: the agent reading the file meets it as written, so the diagram shows it as
// written and the findings name what an agent would trip over.

export const ruleIds = {
  noKeyword: 'abm.no-keyword',
  leafWithChildren: 'abm.leaf-with-children',
  decoratorChildren: 'abm.decorator-children',
  emptyComposite: 'abm.empty-composite',
  severalRoots: 'abm.several-roots',
  noAttempts: 'abm.no-attempts',
  noBehavior: 'abm.no-behavior',
} as const;

/** Every finding in a model, the parser's own first. */
export function findingsOf(model: Model): Finding[] {
  const findings: Finding[] = model.problems.map((problem) => ({ rule: problem.rule, severity: 'warning', message: problem.message, line: problem.line }));

  if (model.sectionLine === undefined) {
    findings.push({ rule: ruleIds.noBehavior, severity: 'information', message: 'This file has no Behavior heading, so there is no behavior tree to draw. Add a node to start one.', line: 0 });
    return findings;
  }
  if (model.nodes.length === 0) {
    findings.push({ rule: ruleIds.noBehavior, severity: 'information', message: 'The Behavior section holds no list yet. Add a node to start the tree.', line: model.sectionLine });
    return findings;
  }

  const roots = rootsOf(model);
  if (roots.length > 1) {
    findings.push({
      rule: ruleIds.severalRoots, severity: 'warning', line: roots[1].line,
      message: `The tree has ${roots.length} roots, and an agent starts at one. Put them under a Do in order or a Try in order to say how they relate.`,
    });
  }

  for (const node of model.nodes) {
    const category = categoryOf(node);
    const children = node.childIds.length;
    if (category === 'leaf' && children > 0) {
      findings.push({
        rule: ruleIds.leafWithChildren, severity: 'error', line: node.line,
        message: `"${shownKeyword(node)}: ${node.label}" holds no children, but has ${children}. Make it a Do in order, or move them out.`,
      });
    } else if (category === 'decorator' && children !== 1) {
      findings.push({
        rule: ruleIds.decoratorChildren, severity: 'error', line: node.line,
        message: `"${shownKeyword(node)}" wraps exactly one child, but has ${children}.${children > 1 ? ' Put them under a Do in order first.' : ' Add the node it applies to beneath it.'}`,
      });
    } else if (category === 'composite' && children === 0) {
      findings.push({
        rule: ruleIds.emptyComposite, severity: 'warning', line: node.line,
        message: `"${shownKeyword(node)}: ${node.label}" has no children, so it has nothing to run.`,
      });
    }
    if (node.kind === kindIds.retry && node.retryCount < 1) {
      findings.push({ rule: ruleIds.noAttempts, severity: 'error', line: node.line, message: 'A Retry that allows no attempt never runs its child.' });
    }
  }
  return findings;
}
