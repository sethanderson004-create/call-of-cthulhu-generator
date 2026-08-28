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
pure tested engine, plain ES modules): a **real-time strategy game about
building a business empire** — no map, no armies, just markets. It plays on a
phone, solo against bots or in a live room of **up to a hundred firms**.

### The game

The economy is a set of **markets** (Coffee, Streaming, Airlines, Solar,
Fashion, Grocery, Semiconductors, Fitness — repeated across regions as the
world grows). Each is contested by **brands** owned by you, by rivals, or by
nobody. Every brand sets a **price** and spends on **marketing**, and those two
numbers decide its slice: customers are pulled toward brands they know and
pushed away by expensive ones — hard in price-sensitive categories like
Airlines, barely at all in Semiconductors.

**Build or buy.** Launch your own brand into any market for a modest price: it
arrives tiny and unknown, but converts advertising into recognition more than
twice as fast for its first minute, so a funded launch can outrun a sleepy
incumbent. Or buy a brand and take its whole slice today — independents at a
small premium, a rival's at 55% over fair value, the cash going straight into
their war chest.

**One-tap campaigns**, so a round is playable with a thumb:

| Play | Cost | Effect |
| --- | --- | --- |
| Ad blitz | $55 | Buys customer reach outright, instantly |
| Promotion | $30 | Discounts the brand for 18 seconds — a share spike at a thinner margin |
| Category push | $65 | Lifts demand for *every* brand in the market, so it pays where you lead |

**You can only raid the weak.** A rival's brand is takeable when it has been
starved below 15% of its market, when its parent is deep in debt, or when you
already out-hold that parent in that category. Firms with three brands or fewer
are sheltered, so a new player isn't dismantled before their first move.

**Scale pays.** Brands run side by side in one market share their costs, and a
large portfolio spreads overhead thinner — consolidating compounds, which is
what carries someone to a monopoly rather than a permanent standoff.

**Win** by taking a share of all revenue — half of it in a four-firm game, down
to a fifth in a hundred-firm world — or by leading the leaderboard when the
ten-minute round clock runs out. In a crowded economy you are really playing
for rank: nobody monopolises a hundred-firm world in ten minutes.

**The money works.** A starting position earns about **+$2/s** doing nothing,
and every brand's full profit and loss — revenue, cost of goods, marketing,
overhead — is shown in the brand desk, so when a brand does lose money you can
see which line is doing it. Campaigns and takeovers are meant to be a real
sacrifice of that income, not a slide into permanent losses.

### Playing solo

`monopolis.html` opens straight into a game — the whole simulation runs in the
tab, no server involved. **Rooms** picks a different world size (4 firms up to
100) or joins a live server if one is running at that address. It loads its
engine as ES modules, so serve the folder rather than opening the file
directly:

```sh
npm start                    # then visit localhost:8000/monopolis.html
npm run build                # or: one self-contained file at dist/monopolis.html
```

### Running a server

```sh
npm run serve                # http://localhost:8080, 100 seats
node server/monopolis-server.mjs --port 8080 --seats 100
```

The server is the authority: it runs the world at 10 ticks a second and sends
each player a snapshot four times a second. Clients submit *commands* and
receive *snapshots* — they hold no simulation state, so a modified client can
ask for whatever it likes and gets the same answer as everyone else. Every
command is re-checked against the engine's rules, and each connection has a
token-bucket rate limit.

Seats are always full: bots hold every chair, a joining player takes one over,
and a player who disconnects hands their firm back to a bot rather than
evaporating mid-round. When someone wins, the result stands for fifteen seconds
and a fresh world starts with everyone still connected reseated.

Snapshots are **scoped** — the whole market list is sent once, and after that a
client receives live figures only for the markets it is displaying, plus full
brand detail for the one it has open. That is what keeps a hundred players
inside a couple of megabytes a second; measured with a hundred concurrent
clients, the server used about 2 MB/s and 13% of one core.

WebSockets are implemented from scratch in `server/ws.mjs` (handshake, framing,
ping/pong, fragmentation) because this repo has no dependencies and wasn't
going to grow one for a hash and four bytes of framing.

### Layout

| File | What it is |
| --- | --- |
| `src/monopolis.js` | The simulation: markets, brands, pricing, campaigns, takeovers, bots |
| `src/protocol.js` | Snapshots and commands — the only thing a client ever sees |
| `server/ws.mjs` | A small RFC 6455 WebSocket implementation |
| `server/room.mjs` | One authoritative world: seats, join/leave, rate limits, rounds |
| `server/monopolis-server.mjs` | HTTP + WebSocket wiring and the tick loop |
| `monopolis.html` | The interface — renders snapshots, whether local or remote |
| `tools/build-standalone.mjs` | Inlines the module graph into one offline file |

Tests: `npm test` (99 cases, covering the economy, the protocol, the WebSocket
framing, room lifecycle, and a live server end to end).

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
