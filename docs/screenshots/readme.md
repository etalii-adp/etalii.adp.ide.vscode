# Screenshots

The images of the ADP tools in Visual Studio Code, and how each was taken, precisely enough that anyone (or an agent) retakes a comparable image after a UI change. **When the UI changes so that one of these no longer shows what a user sees, retake it**; a stale screenshot is a false claim with a picture attached. The website shows these images, read from this folder.

## The shared setup, for every image

- **Source material**: only documents from [`examples/`](../../examples/) appear in any image, so every capture is reproducible from repository content alone. The script opens a copy of that folder as the workspace, so a capture never edits the repository.
- **VS Code**: the current stable release, downloaded into `.vscode-test/` as the real-IDE tests do, with an empty profile, this extension loaded from the repository (`--extensionDevelopmentPath`) and every other extension disabled.
- **Window**: viewport **1600×900 CSS px, device pixel ratio 1, zoom level 0**, the whole window.
- **Theme**: Default Dark Modern, unless the image's name ends in `-light`, which uses Default Light Modern.
- **Layout**: the ADP side bar open with ADP Toolbox above ADP Properties, the panel closed, no notifications, the document in the editor.
- **Selection**: one element selected, after the drawing is centred, so ADP Properties shows its properties rather than its empty message.
- **Centred**: the middle of the drawing in the middle of the editor, at the size the editor first draws it. A drawing that fits the editor at a readable size is drawn whole; a hype cycle, whose year axis spans decades, is drawn at that readable size and only its middle is in view.
- **Known artefact**: the window title begins with `[Extension Development Host]`, because the extension is loaded from source, and the status bar has the purple colour VS Code gives such a window. A user of the installed extension sees neither.
- **Format and budget**: PNG; each image ≤ 300 KB.

The whole procedure is executable: [`capture.mjs`](capture.mjs) drives all of the above with puppeteer-core over the Chrome DevTools protocol. Run `npm run build`, then `npm i --no-save puppeteer-core`, then `node docs/screenshots/capture.mjs` from the repository root; image names as arguments retake those alone (`node docs/screenshots/capture.mjs agent-behavior-modelling.png`). It needs a desktop session, since VS Code opens a real window. Retaking an image means re-running the script and committing the changed file; the entries below say what each image must show, which is what to check before committing a retake. The script exits non-zero naming any image whose diagram drew nothing, or whose toolbox or properties stayed empty.

## The images

| Image | Document opened | What must be visible |
|---|---|---|
| `agent-behavior-modelling.png` | `agent-behavior-modelling/research-assistant/` → `research-assistant.adp` | The research assistant's behavior tree centred in its tab, each node in the shape and colour of its kind with its keyword above its label, parents joined to children by elbowed arrows; ADP Toolbox listing the behavior kinds; the Do together node selected, with its properties in ADP Properties. |
| `gartner-hypecycle-graph-light.png` | `gartner-hypecycle-graph/digital-trends/` → `digital-trends.ghg` | The digital trends as banners on the year axis, coloured by phase, with the Peak/Trough/Slope/Plateau key and the tag filter above; ADP Toolbox showing Trend, Trigger and Note; the trend nearest the middle selected, with its properties in ADP Properties. Light theme. |
