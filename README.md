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
pure tested engine, one HTML file for the UI): a **real-time strategy game
about building a business empire** — no map, no armies, just markets.

The economy is eight **markets** (Coffee, Streaming, Airlines, Solar, Fashion,
Grocery, Semiconductors, Fitness). Each is contested by three or four
**brands**, owned by you, by three AI conglomerates, or by nobody. Every brand
sets a **price** and burns cash on **marketing**, and those two numbers decide
its slice of the market: customers are pulled toward strong brands and pushed
away by expensive ones — hard in price-sensitive categories like Airlines,
barely at all in Semiconductors.

What you actually play with:

- **Price** — charge more for a fatter margin per unit, or undercut to take
  share. The trade is sharper in elastic markets.
- **Marketing** — buys brand equity, which is what really wins customers, and
  which decays the moment you stop paying for it.
- **Category campaigns** — grow a whole market's demand. It lifts every brand
  in the category, so it only pays where you already hold the biggest slice.
- **Acquisitions** — buy a brand and take its entire slice at once.
  Independents sell at a small premium; a hostile bid on a rival costs 55% over
  fair value, and the cash goes straight to the rival's war chest.
- **Debt** — you can borrow against your portfolio to close a deal, and the
  interest is a real drag when a price war goes badly.

The constraint that makes it a game is that **you can only raid the weak**: a
rival's brand is takeable when it has been starved below 15% of its market,
when its parent is over-leveraged, or when you already out-hold that parent in
that category. So you win a category with price and advertising *first*, then
buy the losers in it. Meanwhile costs inflate all game, so a three-way
standoff steadily gets more expensive until someone's balance sheet breaks.

**Win** by taking 50% of all revenue in the economy. **Lose** by being stripped
of every brand — the AI plays by exactly the same rules, and will come for
yours the moment your net worth gets thin.

The whole state of the game reads off one screen: a card per market, each with
a stacked share bar coloured by owner, and every brand's price, equity and
share underneath it.

Open `monopolis.html` (engine: `src/monopolis.js`, tests: `test/monopolis.test.mjs`).
It loads its engine as an ES module, so serve the folder rather than opening the
file directly:

```sh
python3 -m http.server 8000   # then visit localhost:8000/monopolis.html
```

For a single self-contained file you can open straight from disk, run
`node tools/build-standalone.mjs` — it inlines the engine into
`dist/monopolis.html`.

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
