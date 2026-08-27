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
pure engine + tested logic, one HTML file for the UI):

**Monopolis** is a real-time strategy game in the shape of [openfront.io](https://openfront.io),
except you're not conquering land — you're cornering markets.

- The board is a grid of **districts**, each with a demand value and a sector.
- Holding a district pays revenue every second; owning its neighbours adds a
  **synergy bonus**, so clustered positions compound.
- **Expansion is spending.** Click any district on your border to pour capital
  into it in real time. Unclaimed markets are cheap; buying out a rival's
  **stake** costs more per dollar.
- Districts you hold **entrench** over time, so an unanswered lead is expensive
  to reverse.
- The **reinvestment** slider sets how much of your treasury goes into
  expansion each second — the rest compounds.
- Three AI firms play by the same rules. First to **60% of total market
  demand** wins the monopoly; you can also win by outlasting everyone.

Open `monopolis.html` (engine: `src/monopolis.js`, tests: `test/monopolis.test.mjs`).

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
