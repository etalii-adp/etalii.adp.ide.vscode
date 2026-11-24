import type { ToolType } from './toolType';

/**
 * The sentences ADP Properties and the ADP Toolbox show where they have nothing to show, worded for
 * the kind of tool that has the focus: a designer is a page, not a diagram, and has no elements or
 * relations to select (docs/terminology.md).
 */
type Kind = Pick<ToolType<unknown, unknown>, 'kind' | 'page'>;

const what = (tool: Kind): string => (tool.kind === 'designer' ? 'designer' : 'diagram');

/** ADP Properties with nothing selected and no form of the tool's own. */
export const nothingSelected = (tool: Kind): string =>
  tool.kind === 'designer' ? 'Select an item on the page to see its properties.' : 'Select an element or a relation in the diagram to see its properties.';

/** The ADP Toolbox of a tool whose definition offers no entries. */
export const noEntries = (tool: Kind): string =>
  tool.kind === 'designer' ? 'This designer adds nothing from the toolbox: add items with the buttons on its page.' : 'This diagram adds nothing from the toolbox.';

/** The ADP Toolbox of a tool that is read-only. */
export const readOnlyEntries = (tool: Kind): string => `This ${what(tool)} is read-only, so nothing can be added to it.`;
