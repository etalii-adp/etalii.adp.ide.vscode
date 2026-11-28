import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS } from '../../../../src/core/plugins/cld-flow-page/instructions';
import { TEMPLATE } from '../../../../src/core/plugins/cld-flow-page/template';
import { plugins as registry } from '../../../../src/core/plugins/index';
import { definitionOf, diagramOf } from '../../tool/support';

// The flow page's instructions for the person who reads it (Peter, 2026-11-28): offered with the export,
// and naming every control the page has, so a control added to the template is not left unexplained.

const type = diagramOf(definitionOf('causal-loop-diagram'), registry);

/** The visible text of every button, heading and labelled control of the page's body. */
function controlsOf(template: string): string[] {
  const body = template.slice(template.indexOf('<body>'), template.indexOf('<script>'));
  const texts = [...body.matchAll(/<(button|h2|label)\b[^>]*>([^<]+)</g)].map((match) => match[2].trim());
  return [...new Set(texts.filter((text) => text !== ''))];
}

describe('the flow page instructions', () => {
  it('are offered with the flow page export', () => {
    expect(type.exports?.find((offer) => offer.id === 'flowPage')?.instructions).toBe(INSTRUCTIONS);
  });

  it('name every control of the page', () => {
    const controls = controlsOf(TEMPLATE);
    expect(controls.length).toBeGreaterThan(15);
    expect(controls.filter((control) => !INSTRUCTIONS.includes(control))).toEqual([]);
  });

  it('name the buttons the page writes when something is selected', () => {
    for (const button of ['Shock up', 'Shock down', 'Add delay', 'Remove delay', 'Flip polarity', 'Outside push', 'Strength', 'Esc']) {
      expect(TEMPLATE).toContain(button);
      expect(INSTRUCTIONS).toContain(button);
    }
  });
});
