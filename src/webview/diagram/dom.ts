const svgNamespace = 'http://www.w3.org/2000/svg';

type Attributes = Record<string, string | number | undefined>;
type Child = Node | string | undefined;

function fill(element: Element, attributes: Attributes, children: Child[]): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined) element.setAttribute(name, String(value));
  }
  for (const child of children) {
    if (child !== undefined) element.append(child);
  }
}

/** An SVG element with its attributes and children. */
export function svg<K extends keyof SVGElementTagNameMap>(name: K, attributes: Attributes = {}, ...children: Child[]): SVGElementTagNameMap[K] {
  const element = document.createElementNS(svgNamespace, name);
  fill(element, attributes, children);
  return element;
}

/** An HTML element with its attributes and children. */
export function html<K extends keyof HTMLElementTagNameMap>(name: K, attributes: Attributes = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(name);
  fill(element, attributes, children);
  return element;
}

/** Points as an SVG `points` attribute. */
export function points(list: readonly { x: number; y: number }[]): string {
  return list.map((point) => `${point.x},${point.y}`).join(' ');
}