# The canvas

Everything this plug-in draws on a diagram's canvas, and every gesture on it, is done here, once, for every diagram. A diagram writes no drawing code: its tool type is read from its definition, the core computes a scene of it (`src/core/scene/`), and the canvas draws the scene it is sent and turns each gesture into a request.

| Part | Where |
| --- | --- |
| The canvas: selection, gestures, handles, the menu, the panel, the ruler, editing in place | [canvas.ts](canvas.ts) and the files beside it |
| A scene as SVG: nodes with their shapes, parts, labels, compartments and badges, edges with their markers, in the colours of the theme | [scene.ts](scene.ts) |
| The icons a definition names | [icons.ts](icons.ts) |
| The shared appearance: outlines, lines, the selection highlight | [canvas.css](canvas.css) |

The webview reads no definition. Of the core it imports types, the arithmetic on points and paths of `src/core/scene/geometry.ts`, and that of a tidy tree in `src/core/scene/tidyTree.ts`, with which a drag in a tree is previewed; a lint rule holds it to that.
