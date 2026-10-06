import { describe, expect, it } from 'vitest';
import type { FblBinding, Slot } from '../../../src/core/fbl/documents/types';
import { BoundedRegex } from '../../../src/core/fbl/expressions/regexMatcher';
import { BodyText } from '../../../src/core/fbl/text/bodyText';
import { allBindings } from './support/bindings';
import { bytesOf, filesBelow, pathOf } from './support/repository';

// The library matches regular expressions with a matcher of its own, because the platform's cannot
// be bounded (etalii.adp spec 009, research R3). This test holds the two together where it counts:
// every expression of the copied bindings, over every line of every copied body, gives the same
// match and the same ranges for every named group through both.
interface Expression {
  source: string;
  caseInsensitive: boolean;
}

function expressionsOf(binding: FblBinding): Expression[] {
  const found: Expression[] = [];
  const add = (source: string | undefined, caseInsensitive = false): void => {
    if (source !== undefined) found.push({ source, caseInsensitive });
  };
  const slot = (value: Slot | undefined): void => add(value?.word);
  add(binding.comment);
  add(binding.header?.line);
  add(binding.claims.marker?.pattern);
  for (const block of binding.blocks) add(block.line, block.caseInsensitive);
  for (const rule of [...binding.elements, ...binding.relations]) {
    add(rule.line, rule.caseInsensitive);
    slot(rule.id?.from);
    slot(rule.source);
    slot(rule.target);
    for (const [, attribute] of rule.attributes) {
      slot(attribute);
      slot(attribute.override);
    }
  }
  return found;
}

const expressions = [...new Map(allBindings().flatMap(({ binding }) => expressionsOf(binding)).map((expression) => [`${expression.caseInsensitive}:${expression.source}`, expression])).values()];

function linesOf(folder: string): string[] {
  const lines = new Set<string>();
  for (const file of filesBelow(pathOf(folder))) {
    const text = new BodyText(bytesOf(folder, file));
    if (!text.isValidUtf8) continue;
    text.lines.forEach((line, index) => lines.add(text.text(index === 0 ? Math.max(line.start, text.bomLength) : line.start, line.contentEnd)));
  }
  return [...lines];
}

const lines = [...new Set([...linesOf('fixtures/fbl/conformance/fixtures'), ...linesOf('fixtures/fbl/real-files')])];

type Outcome = { start: number; end: number; groups: Record<string, [number, number]> } | undefined;

function platform(expression: Expression, line: string): Outcome {
  const match = new RegExp(expression.source, expression.caseInsensitive ? 'di' : 'd').exec(line);
  if (!match) return undefined;
  const groups: Record<string, [number, number]> = {};
  for (const [name, range] of Object.entries(match.indices!.groups ?? {})) {
    if (range) groups[name] = [range[0], range[1]];
  }
  return { start: match.index, end: match.index + match[0].length, groups };
}

function library(regex: BoundedRegex, line: string): Outcome {
  const match = regex.match(line);
  if (!match) return undefined;
  const groups: Record<string, [number, number]> = {};
  for (const [name, range] of match.groups) groups[name] = [range.start, range.end];
  return { start: match.start, end: match.end, groups };
}

describe('the library\'s regular expression matcher and the platform\'s', () => {
  it('have expressions and lines to compare', () => {
    expect(expressions.length).toBeGreaterThanOrEqual(20);
    expect(lines.length).toBeGreaterThanOrEqual(10000);
  });

  it.each(expressions)('agree on every line of the copied bodies: $source', (expression) => {
    const regex = new BoundedRegex(expression.source, expression.caseInsensitive);
    const differences: string[] = [];
    for (const line of lines) {
      const expected = platform(expression, line);
      const actual = library(regex, line);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) differences.push(`${JSON.stringify(line)}: the platform ${JSON.stringify(expected)}, the library ${JSON.stringify(actual)}`);
      if (differences.length === 5) break;
    }
    expect(differences).toEqual([]);
  }, 60_000);
});
