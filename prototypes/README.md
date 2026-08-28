# Prototypes

Sketches built to answer one question each, before committing to a direction.

## `dial.html` — the market dial

A prototype of a **shape**, not a game. It exists to answer: *is watching a
business empire grow on a radial instrument satisfying enough to build a game
around?*

The whole economy is one dial. Segments are markets, sized by how big they are.
Colour fills **outward from the hub** as a firm takes share, so a cornered
market is a full spoke and your empire is an arc of light growing around the
ring — the win line (half the economy) is drawn on the rim, which makes the
picture its own progress bar.

What it deliberately keeps:

- **Locality.** You can only push into a segment touching one you already hold.
- **A structural rate limit.** Capital accrues from what you hold and converts
  to share over time. Nobody — you or the bots — can go faster than that, so
  clicking quickly buys nothing.
- **Foresight.** Committed capital shows as brightness massing on a border
  *before* share moves, and a firm that stops spending glows at the hub because
  it is banking a burst. Watching closely tells you what is coming.
- **One verb.** Tap a segment to push into it. One slider decides how much of
  your income goes into expansion rather than the bank.

What it deliberately leaves out: prices, marketing budgets, brands,
acquisitions, capability ladders — everything from the full game. If the shape
is not compelling on its own, no amount of economy underneath will save it.

Open `prototypes/dial.html` directly in a browser; it has no dependencies and
no build step.
