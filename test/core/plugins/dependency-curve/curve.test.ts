import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { plugins as registry } from '../../../../src/core/plugins/index';
import { dependencyCurve } from '../../../../src/core/plugins/dependency-curve/index';
import type { SceneEdge } from '../../../../src/core/scene/scene';
import { definitionOf, diagramOf } from '../../tool/support';

// The dependency curve (etalii.adp spec 088, task T017): standalone's `dependencyRoute` of
// `dependencyGraphBindings.ts`, with `horizontalBezierPath` and `forwardBezierPath` of its `connectors.ts`.

const box = (x: number, y: number, width = 120, height = 40) => ({ x, y, width, height });

describe('the dependency curve', () => {
  it('joins the facing sides with a horizontal bezier while the dependency sits clear to the right', () => {
    const route = dependencyCurve.route({ source: box(0, 0), target: box(300, 60) });
    expect(route.from).toEqual({ x: 120, y: 20, side: 'right' });
    expect(route.to).toEqual({ x: 300, y: 80, side: 'left' });
    expect(route.path).toEqual([{ op: 'M', x: 120, y: 20 }, { op: 'C', c1x: 210, c1y: 20, c2x: 210, c2y: 80, x: 300, y: 80 }]);
  });

  it('loops forward out of the right side into the left one when the dependency sits behind', () => {
    const route = dependencyCurve.route({ source: box(300, 0), target: box(0, 60) });
    // span = 0 - 420 = -420; reach = max(-210, 40, 252) = 252
    expect(route.from).toEqual({ x: 420, y: 20, side: 'right' });
    expect(route.to).toEqual({ x: 0, y: 80, side: 'left' });
    expect(route.path).toEqual([{ op: 'M', x: 420, y: 20 }, { op: 'C', c1x: 672, c1y: 20, c2x: -252, c2y: 80, x: 0, y: 80 }]);
  });

  it('loops when the dependency overlaps the dependent, reaching at least 40', () => {
    const route = dependencyCurve.route({ source: box(0, 0), target: box(100, 60) });
    expect(route.path[1]).toEqual({ op: 'C', c1x: 160, c1y: 20, c2x: 60, c2y: 80, x: 100, y: 80 });
  });
});

describe('a dependency graph drawn with the dependency curve', () => {
  const type = diagramOf(definitionOf('dependency-graph'), registry);
  const scene = type.view({ fileName: 'services.dgr', text: readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8') }, {});

  it('draws every dependency as one cubic curve from a side of its dependent', () => {
    const shapes = scene.edges.map((edge: SceneEdge) => [edge.path.map((command) => command.op).join(''), edge.from?.side]);
    expect(shapes).toEqual(scene.edges.map(() => ['MC', 'right']));
  });

  it('writes a dependency\'s label 11 high, in the lines\' colour, centred 6 above the middle of its line', () => {
    const labelled = scene.edges.filter((edge: SceneEdge) => edge.labels !== undefined);
    expect(labelled.length).toBe(7);
    for (const edge of labelled) {
      const [label] = edge.labels ?? [];
      const middle = { x: ((edge.from?.x ?? 0) + (edge.to?.x ?? 0)) / 2, y: ((edge.from?.y ?? 0) + (edge.to?.y ?? 0)) / 2 };
      expect([label.fontSize, label.style.font?.color]).toEqual([11, { token: 'color.text.muted' }]);
      expect(label.box.x + label.box.width / 2).toBeCloseTo(middle.x, 6);
      expect(label.box.y + label.box.height / 2).toBeCloseTo(middle.y - 6, 6);
    }
  });

  it('reports nothing about its routing', () => {
    expect(type.findings({ fileName: 'services.dgr', text: readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8') }).filter((finding) => finding.rule.startsWith('disl.'))).toEqual([]);
  });

  it('draws the fallback bezier when the plugin is not carried', () => {
    const bare = diagramOf(definitionOf('dependency-graph'), { ...registry, routing: () => undefined });
    const drawn = bare.view({ fileName: 'services.dgr', text: readFileSync('examples/dependency-graph/example-1/services.dgr', 'utf8') }, {});
    expect(drawn.edges.every((edge) => edge.routing === 'bezier' && edge.path.some((command) => command.op === 'C'))).toBe(true);
  });
});
