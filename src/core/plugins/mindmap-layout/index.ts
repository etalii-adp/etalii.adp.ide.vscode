// The layout plugin the mind map's definition names (`plugin:net.etalii.adp.freeplane.mindmapLayout`;
// etalii.adp spec 027, research R8): the model that is drawn as a tree, the definition's spacing and
// options as the layout's metrics, and each node's top-left with the size the layout measured.

import type { LayoutPlugin } from '../../disl/layout';
import type { ModelElement } from '../../disl/model';
import { defaultMetrics, layoutOf, type Metrics, type Topic } from './layout';

const OPTION = 'net.etalii.adp.mindmap.';

export const mindmapLayout: LayoutPlugin = {
  id: 'net.etalii.adp.freeplane.mindmapLayout',
  place: ({ model, spacing, options }) => {
    const central = model.elements.find((element) => element.parent === undefined);
    if (!central) return {};
    const number = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
    const option = (name: keyof Metrics): number => number(options[OPTION + name], defaultMetrics[name]);
    const metrics: Metrics = {
      fontSize: option('fontSize'), lineHeight: option('lineHeight'), horizontalPadding: option('horizontalPadding'), verticalPadding: option('verticalPadding'),
      minimumWidth: option('minimumWidth'), minimumGapRatio: option('minimumGapRatio'),
      horizontalGap: number(spacing.layer, defaultMetrics.horizontalGap), verticalGap: number(spacing.node, defaultMetrics.verticalGap),
    };
    const topic = (element: ModelElement): Topic => ({
      id: element.id,
      text: typeof element.attributes.text === 'string' ? element.attributes.text : '',
      ...(typeof element.attributes.position === 'string' ? { position: element.attributes.position } : {}),
      children: model.elements.filter((child) => child.parent === element.id).map(topic),
    });
    return Object.fromEntries(layoutOf(topic(central), metrics));
  },
};
