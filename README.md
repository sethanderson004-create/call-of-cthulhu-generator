# 🎲 Roll the Bones — Call of Cthulhu Investigator Generator

A zero-dependency, browser-only generator for **Call of Cthulhu 7th-edition**
investigators. Two ways to play:

- **🕯️ Create step by step** — a guided walkthrough: set characteristics (roll
  them one at a time *or* spend a point-buy budget), then age, vitals + a Luck
  roll, occupation, **hands-on skill allocation** (spend occupation and
  personal-interest points, or auto-spend), and backstory drawn one prompt at a
  time — so you *feel* the investigator take shape.
- **🎲 Summon instantly** — one tap for a complete, doom-touched character with
  skills auto-allocated.

Either way the finished sheet can be copied, **downloaded as a text
character sheet**, or printed (→ PDF).

Either way you get rolled characteristics, derived attributes, a Jazz Age name,
an occupation with a themed skill spread, and a randomized backstory the Keeper
can twist against the player.

**▶ Live:** https://sethanderson004-create.github.io/call-of-cthulhu-generator/

No build step, no framework, no server — plain ES modules and a single HTML
file. Every roll happens locally in your browser.

## 🏙️ Also in this repo: Monopolis

A second, unrelated toy that shares the same house rules (zero dependencies,
pure tested engine, plain ES modules): a **turn-based strategy game about
building a business empire** — no map, no armies, just markets. It plays on a
phone, against bots, entirely in the browser.

### How a game goes

Sixteen quarters. The board starts small — four markets, two rivals, a couple
of brands each — and grows as you do: a new market opens every few quarters.

Each quarter you commit **three decisions**, and that scarcity is the whole
game:

| Decision | Costs |
| --- | --- |
| Run a campaign — blitz, promotion, or category push | 1 |
| Launch a brand into a market | 1 |
| Build the firm — a rung on a capability ladder | 1 |
| Acquire a rival's brand | 2 |

Setting a brand's **price and marketing budget is free** — that is running what
you already own, not a decision competing with expansion. Then you end the
quarter: your rivals commit their moves under the *same* three-decision budget,
the economy runs forward, and you get a report of what actually changed —
your share and profit, what each rival did, and the events of the quarter.

There is no clock, no cooldown in seconds, and nothing to out-tap.

### The economy underneath

Every brand sets a price and spends on marketing, and those two numbers decide
its slice: customers are pulled toward brands they know and pushed away by
expensive ones — hard in price-sensitive categories like Airlines, barely at
all in Semiconductors. A brand that sustains its reach climbs from Local to
Regional, National and Iconic, and each rung pulls a few more customers in on
its own.

**Campaigns** each show what they are worth on that brand right now, as dollars
per second with a payback time, calibrated against simulated outcomes: an ad
blitz buys reach outright, a promotion trades margin for volume and converts
the customers it wins into lasting reach, a category push grows a whole market
and so only pays where you already lead.

**You can only raid the weak.** A rival's brand is takeable when it has been
starved well below its market's even split, when its parent is deep in debt, or
when you already out-hold that parent in that category. Your last brand can
never be taken, and losing one buys a respite before the next bid.

**Build the firm** along four ladders of three rungs — Distribution, Research,
Creative studio, Dealmaking. Nobody can climb them all in one game, so which
one you pick is the decision the rest of your game hangs off. Each moves
*share*, not only margins, because a ladder that merely improved profit would
be a trap.

**Win** by taking half the economy outright, or by leading when the sixteenth
quarter closes.

### Playing

`monopolis.html` opens straight into a game — everything runs in the tab.
It loads its engine as ES modules, so serve the folder rather than opening the
file directly:

```sh
npm start                    # then visit localhost:8000/monopolis.html
npm run build                # or: one self-contained file at dist/monopolis.html
```

### Layout

| File | What it is |
| --- | --- |
| `src/monopolis.js` | The economy: markets, brands, pricing, campaigns, takeovers, capabilities |
| `src/turns.js` | The turn layer: decision budgets, rivals' quarters, resolution, reports |
| `src/protocol.js` | Snapshots and commands — the only thing the interface sees |
| `monopolis.html` | The interface |
| `tools/build-standalone.mjs` | Inlines the module graph into one offline file |
| `server/` | A zero-dependency multiplayer server for up to 100 players — see below |

Tests: `npm test` (129 cases, covering the economy, the turn layer, the
protocol, WebSocket framing, and a live server end to end).

### The multiplayer server

`server/` holds a complete authoritative server — a from-scratch RFC 6455
WebSocket implementation, a room that seats up to a hundred players with bots
filling the empty chairs, scoped snapshots, and per-client rate limits. It runs
the **real-time** version of the economy:

```sh
npm run serve                # http://localhost:8080
```

It is not yet reconciled with the turn structure: the browser client above is
the turn game, and the server still resolves continuously. Making the server
run quarters — with a timer per quarter and simultaneous resolution — is the
obvious next step, and the reason it is documented here rather than quietly
deleted.

## What it generates

- **Characteristics** — STR, CON, SIZ, DEX, APP, INT, POW, EDU rolled on the
  7e scale (`3d6×5` and `(2d6+6)×5`), each shown with its half/fifth values.
  **Tap any single stat to re-roll just that one** — vitals recompute live.
- **Vitals** — Hit Points, Sanity (starts at POW), Luck, Magic Points, Move
  rate, Dodge, Damage Bonus, and Build, all from the canonical formulas.
- **Occupation** — 16 pulp archetypes (Antiquarian, Occultist, Alienist,
  Private Investigator, Drifter, …), each with a credit-rating range, a
  signature skill list, and occupation/personal-interest skill-point budgets.
- **Backstory** — ideology, a significant person, a meaningful location, a
  treasured possession, a defining trait, a private fear, and an ominous
  **"Keeper's Hook"** to seed a scenario.

Plus: name/backstory re-rolls, copy-to-clipboard, print-friendly sheet, and
a reduced-motion-aware dice-tumble animation.

## Project layout

The code is split into a **pure, tested engine** and an **untested UI layer** —
the engine has no DOM and no imports, so it runs identically in Node and the
browser and all randomness flows through an injectable RNG.

| Path | What it is |
| --- | --- |
| `src/cthulhu.js` | Pure generation engine — dice, characteristics, derived attributes, occupations, names, backstory tables, `makeInvestigator()`. |
| `index.html` | The eldritch-themed UI (all CSS/JS inline; imports only the engine). |
| `test/cthulhu.test.mjs` | Property tests: dice ranges, 7e damage-bonus boundaries, derived-attribute formulas, occupation bounds, deterministic seeded output. |

### Using the engine directly

```js
import { makeInvestigator } from './src/cthulhu.js';

// Random investigator:
const inv = makeInvestigator();

// Reproducible (inject any () => number in [0,1)):
const seeded = makeInvestigator({ rng: myPRNG, occupation: 'Detective', gender: 'neutral' });
```

## Develop

```sh
npm test        # run the engine unit tests (node --test, no deps)
npm start       # serve at http://localhost:8000 (any static server works)
```

Node's test runner is the only tool required, and it ships with Node — there
are no dependencies to install.

## License

MIT — see [`LICENSE`](./LICENSE). *Call of Cthulhu* is a trademark of
Chaosium Inc.; this is an unofficial, fan-made tool, not affiliated with or
endorsed by Chaosium. No game text is reproduced.
