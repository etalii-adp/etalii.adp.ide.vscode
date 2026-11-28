// The causal loop diagram flow page's instructions for the person who reads it: what the page shows
// and how to use it, saved by the command "Include Flow Page user instructions". They describe the
// page `template.ts` holds, so a change to the template that a reader would notice changes them too.

/** How to read and use an exported flow page, in Markdown. */
export const INSTRUCTIONS = `# Reading a flow page

A flow page is an animated web page of a causal loop diagram, made with **ADP: Export Flow Page**. It shows the diagram as flows of influence: each variable rises and falls, and dots travel along the links to carry influence from cause to effect. The page is a single file that opens in any web browser and needs nothing else, so you can share it, attach it to a message or put it on a website.

Nothing you do on the page changes the diagram it was made from. Play freely: reload the page to start over, and export again from Visual Studio Code to take in later changes to the diagram.

## What you see

- **Variables** are the boxes. The bar inside a box shows the variable's current level, from low on the left to high on the right. A small blue tick on the bar shows where the variable's inputs are pushing it; the gap between the bar and the tick is how far it still has to go.
- **External variables** have a dashed grey border. Nothing in the diagram moves them: you set them yourself, under **External pressures**.
- **Links** are the curved arrows between variables. A thicker link is a stronger one, and a link glows in the heat of what it carries (see **The heatmap**).
  - A teal **+** near the arrow head marks a positive link: when the cause rises the effect rises too, and when it falls the effect falls.
  - A pink **−** marks a negative link: the effect moves the opposite way to the cause.
  - A **dashed** link with a double bar is **delayed**: its influence takes longer to arrive, so dots queue on it.
- A **▲** or **▼** with a number above a variable shows an outside push you gave it (see **Trying things out**).
- **Dots** travel along the links. Each one carries influence and lands when it arrives. Where dots crowd together, influence is waiting to be felt.
- **Loops** are named under their badge, at the centre of the variables they pass through: teal for a reinforcing loop, pink for a balancing loop.
- **The chart** below the diagram follows the level of several variables over the last 60 seconds, from 0 at the bottom to 1 at the top. Its legend says which line is which variable.
- **The time** at the top right counts simulated time since the start.

Hover over a variable or a link to see its details: a variable's level, how much influence is on its way to it and how fast it arrives; a link's direction, polarity, delay and note.

## Reading the loops

A feedback loop is a chain of links that comes back to where it started. Every loop of the diagram is listed under **Loops** on the right, with its badge and its name.

- A loop whose badge starts with **R** is **reinforcing**: a change goes round the loop and comes back larger, so growth feeds more growth, or decline feeds more decline.
- A loop whose badge starts with **B** is **balancing**: a change comes back smaller and in the opposite direction, so the loop pulls the system towards a goal or a limit.
- The **bar** beside each loop shows its loop gain, how strongly a change is passed all the way round it at this moment. The bar turns orange when the gain is above 1: a reinforcing loop with that gain runs away. Hover over the bar to read the number.

To see a loop in the diagram:

- **Hover** over a loop in the list to trace it: its links are highlighted and the rest of the diagram fades.
- **Click** a loop to pin it, so it stays traced while you move the mouse away. The pinned loop has a blue border in the list.
- To let a pinned loop go, click it again, press **Esc**, click the **Clear** button beside the Loops heading, or click the background of the diagram.

## The heatmap

The variables and links are coloured by heat, from cold to hot, and the scale under **Heatmap** shows the colours. Choose what heat means:

- **Backlog**: how much influence is on its way to a variable, compared with the busiest one. Delayed links hold their dots longest, so heat gathers where delays feed in: these are the bottlenecks.
- **Pressure**: how far a variable is from where its inputs push it. Hot means it is still catching up.
- **Throughput**: how much influence arrives at a variable per second, compared with the busiest one.
- **Level**: the variable's own level, from 0 (cold) to 1 (hot).

The sentence under the scale repeats what the chosen reading means.

## Trying things out

- **Pause** and **Play** stop and continue the animation. **Reset** puts every variable back to its starting level and starts the time again. **Fit** brings the whole diagram into view.
- **Scenario** sets the starting values. **Diagram as saved** uses the values stored in the diagram.
- **External pressures** has a slider for each external variable: move one to see how the rest of the diagram responds.
- **Click a variable** to select it. Under **Selection** you can give it an **Outside push** up or down, or use **Shock up** and **Shock down** to jump it to its highest or lowest level and watch the change spread. For an external variable you set its **Value** instead.
- **Click a link** to select it. You can change its **Strength**, add or remove its delay with **Add delay** or **Remove delay**, and turn it from positive to negative or back with **Flip polarity**. This is a quick way to ask "what if this effect were slower, stronger or the other way round?"
- Under **Dynamics**, change how the whole simulation behaves:
  - **Simulation speed**: how fast time passes on the page.
  - **Link strength (gain)**: how strongly every link passes influence on.
  - **Length of a delay**: how much slower a delayed link is than an ordinary one.
  - **Inertia of a variable**: how slowly a variable follows its inputs.
  - **Dot density**: how many dots are drawn, which changes only the picture.

## Moving around

- Drag a variable to move it.
- Drag the background to pan, and scroll to zoom in or out.
- **Fit** brings everything back into view.

## Tips for reading a diagram this way

- Start with **Backlog** to find where influence piles up, then pin each loop in turn to see which feedback runs through those variables.
- Give one variable a **Shock up** and follow the dots: the variables that change first are its direct effects, and the ones that change later are reached through delays or longer chains.
- Compare a reinforcing loop with a balancing loop that shares a variable: the one with the higher loop gain decides which way that variable goes.
- The page shows tendencies, not forecasts. Its numbers come from the shape of the diagram and the settings on the page, not from measured data.
`;
