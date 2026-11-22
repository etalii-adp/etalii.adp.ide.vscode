# Causal loop examples

Six ADP projects you can open and click around in. They are not fixtures — the fixtures under
`../backend/EtAlii.Adp.Diagram.CausalLoop.Tests/` exist to pin parser behaviour one construct at
a time, and read like it. These read like systems.

| Project | What it is for |
|---|---|
| [`reference/`](reference/) | Every construct ADP's causal loop support understands, in one diagram. Read it to find out what is supported and how to write it — and to see a loop whose label the arithmetic disagrees with. |
| [`on-call/`](on-call/) | Why an on-call rotation gets worse on its own. Read it to see the notation carrying a problem you probably recognise. |
| [`business-philosophy/`](business-philosophy/) | Whether a Business Philosophy study is applicable at a university of applied sciences: experts, philosophers, practical tools, core values, latent wisdom, stories, wicked problems, insight over solutions, and art as expression. Read it to see a larger model - eighteen variables, ten loops - where every cycle is named and the arrangement is authored. |
| [`mental-health/`](mental-health/) | Why mental health at work stays out of sight: self-direction, emotion suppression and meaning, the norm "don't make a fuss", the constraints of the system, and the loops that keep complaints invisible. Read it to see a wicked problem drawn as structure alone - thirty variables, eight loops, no solutions. |
| [`life-insurance/`](life-insurance/) | The growth or decline of a life insurance company: attrition, recruits and coaching, lapses and clawback, sales, capital and solvency, the back office and reputation. Read it to see a published figure redrawn - thirty-four variables, thirty-eight loops, every cycle named. |
| [`uk-cod-population/`](uk-cod-population/) | What impacts the cod population in the UK: spawning, recruitment and mortality, carrying capacity as a tipping point, fishing activity and the communities it supports, prices and trade, and the regulation of the catch. Read it to see a handwritten academic figure redrawn - forty-nine variables, thirty-five cycles - and the figure's own loop labels checked against its arrows. |

## Opening one

Open the folder. Each project is a `.adp` registration beside its `.cld` body, and the `.adp` is
what appears in the explorer as a diagram. Nothing needs configuring first.

## Authored for this repository

**Four of the six examples were written for ADP**; `life-insurance/` and `uk-cod-population/` are the exceptions, redrawn from published figures (see *A published figure, redrawn* and *An academic figure, cited*). None of the other four is derived from, nor attributed to, any external
source. That is the honest-fallback path Requirement 11 leads with, and it is where this task
landed after checking five candidate sources and rejecting every one on licence grounds:

| Source | Why it was rejected |
|---|---|
| `github.com/nocomplexity/causalloopdiagram` | GPL-3.0 — share-alike |
| `github.com/elbazjosh/AutoCLD` | No licence file at all, which reserves all rights |
| The Wikipedia article and its figures | CC BY-SA — share-alike (the article text; each figure carries its own licence, and the life insurance figure is public domain) |
| The MetaSD model library | Per-model author permission rather than a named licence, and Vensim stock-and-flow models rather than causal loop diagrams |
| `github.com/bear96/System-Dynamics-Bot` | CC BY-NC-4.0 — the NonCommercial term fails the same test the share-alike ones did |

The last was found by a fresh search when this task ran, and is the only candidate carrying an
actual corpus of causal loop diagrams rather than a tool. Its licence rules it out. AutoCLD's
*algorithm* is cited in the design — Johnson's elementary cycles, which is published
independently of that repository — but none of its content is used here.

## The label disagreement, in both directions

The whole point of this diagram type in ADP is that a loop's `R`/`B` label is **checkable**: a
loop is reinforcing when it runs through an even number of negative links, and balancing when the
count is odd. ADP counts, reports the disagreement, and changes nothing — the author's label may
be the intent and an arrow may be the mistake, and the tool is not entitled to guess which.

Both examples carry a case, and they are different cases on purpose:

- **`reference/` disagrees deliberately.** `R3` claims reinforcing where three negative links
  make it balancing. It is there so a reader can see the finding without writing a broken file
  themselves. A test pins it, so a future edit cannot quietly "fix" it and leave this page
  describing something the file no longer does.
- **`on-call/` agreed only after the tool corrected the author.** Its third loop was first
  written as `B3` — "automation would help, if there were time", the obvious reading of a
  balancing loop being starved. ADP reported the disagreement, and it was right: two negative
  links is an even count, so that path is *reinforcing*. The exit does not merely fail to open;
  the busier the team gets, the faster it closes. The loop is now `R3`, and the model says
  something truer than the author first believed.

The second case is the better advertisement, and it happened by accident while writing these
files.

## Every cycle named

`business-philosophy/` is the larger case. Its twenty-eight links form exactly ten cycles, and
each is claimed by a named loop whose label agrees with its arithmetic: eight reinforcing, two
balancing. So it opens with no finding at all - not an unlabelled cycle, not a disagreement - and
a test holds it there, because in a model this dense one added link quietly creates a cycle
nobody named. Its one variable outside every loop, the weight of wicked problems, is outside on
purpose: the study does not claim to solve them, only to understand them better.

## Structure without solutions

`mental-health/` is drawn from a Dutch set of notes on mental health in working life, and it keeps their limits: no person in them is named, and no solution is offered - the diagram shows only the structure of the problem. Its labels are in English like the other examples, with the notes' own Dutch phrases kept in link notes and comments. Its three core variables - experienced self-direction, emotion suppression and experienced meaning - are tied together by two bridges, goal orientation and the willingness to sacrifice, and its eight loops are all named and all agree with their arithmetic: six reinforcing, two balancing. A test holds it there. The norm "don't make a fuss" and the three constraints of the system - the legal limits on discussing mental health, the dependence on insurers and premiums, and an ageing population - sit outside every loop on purpose: they press on the system, and nothing in it presses back.

## A published figure, redrawn

`life-insurance/` redraws "Causal Loop Diagram of a Model Examining the Growth or Decline of a Life Insurance Company" by Robert A. Taylor of the U.S. Department of Energy (2008), the figure the Wikipedia article on causal loop diagrams closes with. A work of the U.S. Federal Government, it is in the public domain, and `LICENSE.md` beside the example quotes the statement on its file page. Every variable, arrow and delay mark of the figure is there, in the figure's own words, arranged as the figure arranges them. The figure prints a polarity on only some arrows: those links carry the note "printed", and the others the polarity the arrow plainly means. It marks four loops with a circling arrow and no letter; they are the example's first four loops, labelled by their arithmetic. The arrows make thirty-four more cycles the figure leaves unmarked, and the example names them too, so that it opens with no finding - twenty-nine reinforcing and nine balancing in all. A test holds it there. What it does not show: the figure is a qualitative map of one company's model, so the example carries no starting values, no weights and nothing of the simulation behind it.

## An academic figure, cited

`uk-cod-population/` redraws "Diagram 7: CLD telling the story of what impacts cod population in the UK" from Kamath, Palmer, Manikarachchige and Hutton (2024), *Causal Loop Diagram*, a National Centre for Research Methods online learning resource from the University of Southampton. Unlike the life insurance figure it carries no licence: the page states only its copyright. It is here by the project owner's ruling of 2026-10-31 that the figure is academic content and may be redrawn with a full citation, and `SOURCE.md` beside the example gives the citation, what was checked for a licence, and every place the redrawing reads more than the figure states. The figure is handwritten; its labels were read against the four partial diagrams on the same page and the transcripts of the resource's two videos. It is the one example whose loop labels are the source's rather than ADP's: the figure marks twelve loops with R or B, nine of them can be tied to one cycle, and four of those nine disagree with the arithmetic of their arrows - R2, R3, B2 and B3. ADP reports all four and changes none, which is the point of a checkable label: the figure may mean what it says and an arrow may be drawn wrong, or the reverse. Carrying capacity, the figure's tipping point, is joined by double arrows with delay marks and no polarity, because the page says it behaves one way until a threshold and another after it; the twelve loops through it are named T1 to T12, claim nothing, and are reported undecidable. The other cycles are named with the label their arithmetic gives. Tests hold all of this. What it does not show: the figure is a qualitative map drawn for teaching, so the example carries no starting values, no weights and no simulation, and the three R and B marks that cannot be tied to one cycle are not assigned.
