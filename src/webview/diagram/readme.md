# The diagram library

Everything this plug-in draws on a diagram's canvas, and every gesture on it, is done here, once, for every diagram type. A diagram type writes no drawing code: it states a `DiagramDefinition` ([definition.ts](definition.ts)) beside its own stylesheet, in `src/webview/<tool>/`, and registers it in [../tools.ts](../tools.ts). It is this host's counterpart of the standalone host's shared canvas library (`src/client/src/canvas/library` in etalii.adp.ide.standalone), with the same shapes, routes and words, so a diagram looks and behaves the same in both.

| Part | Where |
| --- | --- |
| The canvas: selection, gestures, handles, the menu, the panel, the ruler, editing in place | [canvas.ts](canvas.ts) and the files beside it |
| An element drawn from its type's definition: shape, segments, labels | [elements.ts](elements.ts) |
| A relation's ends, its route, and starting one with a press | [relations.ts](relations.ts) |
| A definition turned into what the canvas calls, including how a drag rearranges the drawing | [notation.ts](notation.ts) |
| The shared appearance: outlines, lines, the selection highlight, segments | [canvas.css](canvas.css) |

The geometry under it is plain TypeScript in `src/core/diagram/`, because the view models in the extension place things with the same functions the canvas draws them with: the built-in shapes (`shapes/outline.ts`), segmented shapes and where a relation attaches along them (`shapes/segments.ts`), the routes (`connectors.ts`), the top-down tree and what a drag of one of its nodes means (`layout/tree.ts`), and rows packed for a compact view (`layout/rowPacked.ts`).
