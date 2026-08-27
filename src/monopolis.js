// Monopolis — a real-time strategy engine where you win markets, not land.
//
// Same house rules as the rest of this repo: no DOM, no imports, no global
// side effects, and every random decision flows through an injectable `rng`
// (a function returning a float in [0, 1)) so the whole simulation is
// deterministic under test.
//
// The shape of a game, in one paragraph: the board is a grid of districts.
// Each district has a `demand` (how much revenue it pays per second when you
// own it outright) and a `stake` (how much capital its owner has sunk into
// defending it). Firms spend capital to push into an adjacent district; that
// spending eats the incumbent's stake, and when the stake hits zero the
// district changes hands. Revenue funds more expansion, so the map compounds:
// the first firm to control `MONOPOLY_SHARE` of total demand wins. There is no
// combat, no units, no land — only market share and the cost of holding it.

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** Share of total market demand that counts as a monopoly (a win). */
export const MONOPOLY_SHARE = 0.6;

/** Capital every firm starts with. */
export const STARTING_CAPITAL = 120;

/** Capital per second a district costs to hold, per point of demand. */
export const UPKEEP_RATE = 0.06;

/** Fraction of an expansion spend that lands as damage on a rival's stake. */
export const HOSTILE_EFFICIENCY = 0.7;

/** Fraction of an expansion spend that lands as stake in a neutral district. */
export const NEUTRAL_EFFICIENCY = 1;

/** Stake a district passively regenerates per second, per point of demand. */
export const ENTRENCH_RATE = 0.15;

/** Ceiling on passive stake, per point of demand. */
export const ENTRENCH_CAP = 8;

/** Stake an unclaimed district defends itself with, per point of demand. */
export const NEUTRAL_RESISTANCE = 3;

/** Revenue multiplier applied per adjacent district you also own. */
export const SYNERGY_BONUS = 0.08;

/** Fraction of a firm's capital it may pour into expansion each second. */
export const DEFAULT_AGGRESSION = 0.5;

export const FIRM_COLORS = [
  '#7fd6a1', '#d9a441', '#b5462f', '#9a7fd6', '#4aa3d9', '#d97fae',
];

export const FIRM_NAMES = [
  'Ashgrove Holdings', 'Meridian Freight', 'Vantor Foods', 'Colcannon Media',
  'Ninth Street Capital', 'Halbrook Energy', 'Trellis Retail', 'Orbis Logistics',
  'Fairmount Pharma', 'Steelyard Motors', 'Lantern Bank', 'Corvid Chemicals',
];

/** Flavour only — a district's sector shapes its name and its demand roll. */
export const SECTORS = [
  { key: 'retail', label: 'Retail', demandRange: [3, 7] },
  { key: 'industry', label: 'Industry', demandRange: [5, 11] },
  { key: 'finance', label: 'Finance', demandRange: [6, 13] },
  { key: 'logistics', label: 'Logistics', demandRange: [4, 9] },
  { key: 'media', label: 'Media', demandRange: [3, 10] },
  { key: 'utilities', label: 'Utilities', demandRange: [5, 8] },
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function randInt(min, max, rng = Math.random) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

export function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

/**
 * Build a `width` x `height` board of districts. Districts are stored in a
 * flat array, row-major; `index = y * width + x`.
 */
export function makeBoard(width, height, rng = Math.random) {
  const districts = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sector = pick(SECTORS, rng);
      const [lo, hi] = sector.demandRange;
      const demand = randInt(lo, hi, rng);
      districts.push({
        index: districts.length,
        x,
        y,
        sector: sector.key,
        demand,
        owner: null,
        stake: demand * NEUTRAL_RESISTANCE,
      });
    }
  }
  return { width, height, districts };
}

/** Indices of the (up to four) orthogonal neighbours of `index`. */
export function neighbors(board, index) {
  const { width, height } = board;
  const x = index % width;
  const y = Math.floor(index / width);
  const out = [];
  if (x > 0) out.push(index - 1);
  if (x < width - 1) out.push(index + 1);
  if (y > 0) out.push(index - width);
  if (y < height - 1) out.push(index + width);
  return out;
}

export function totalDemand(board) {
  return board.districts.reduce((sum, d) => sum + d.demand, 0);
}

/** Districts owned by `firmId`. */
export function holdings(board, firmId) {
  return board.districts.filter((d) => d.owner === firmId);
}

/**
 * Districts a firm may legally expand into: not already theirs, and adjacent
 * to something they own. This is the whole geography of the game — you cannot
 * buy into a market you have no presence next to.
 */
export function frontier(board, firmId) {
  const seen = new Set();
  for (const d of board.districts) {
    if (d.owner !== firmId) continue;
    for (const n of neighbors(board, d.index)) {
      if (board.districts[n].owner !== firmId) seen.add(n);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/** How much of a district's revenue a firm actually books, with synergies. */
export function districtRevenue(board, district) {
  if (district.owner === null) return 0;
  let adjacentOwned = 0;
  for (const n of neighbors(board, district.index)) {
    if (board.districts[n].owner === district.owner) adjacentOwned++;
  }
  return district.demand * (1 + SYNERGY_BONUS * adjacentOwned);
}

export function firmIncome(board, firmId) {
  let income = 0;
  for (const d of board.districts) {
    if (d.owner === firmId) income += districtRevenue(board, d);
  }
  return income;
}

export function firmUpkeep(board, firmId) {
  let upkeep = 0;
  for (const d of board.districts) {
    if (d.owner === firmId) upkeep += d.demand * UPKEEP_RATE;
  }
  return upkeep;
}

/** A firm's market share as a fraction of all demand on the board. */
export function marketShare(board, firmId) {
  const total = totalDemand(board);
  if (total === 0) return 0;
  let held = 0;
  for (const d of board.districts) {
    if (d.owner === firmId) held += d.demand;
  }
  return held / total;
}

// ---------------------------------------------------------------------------
// Game setup
// ---------------------------------------------------------------------------

/**
 * Create a game with one human firm and `aiCount` rivals, each seeded into a
 * starting district as far from the others as the board allows.
 */
export function createGame({
  width = 12,
  height = 9,
  aiCount = 3,
  rng = Math.random,
} = {}) {
  const board = makeBoard(width, height, rng);
  const firms = [];
  const count = aiCount + 1;
  for (let i = 0; i < count; i++) {
    firms.push({
      id: i,
      name: i === 0 ? 'Your Firm' : FIRM_NAMES[randInt(0, FIRM_NAMES.length - 1, rng)],
      color: FIRM_COLORS[i % FIRM_COLORS.length],
      capital: STARTING_CAPITAL,
      human: i === 0,
      aggression: DEFAULT_AGGRESSION,
      target: null,
      bankrupt: false,
    });
  }
  // Distinct AI names, without caring much how we get there.
  const used = new Set();
  for (const firm of firms) {
    while (used.has(firm.name)) firm.name = `${firm.name} Group`;
    used.add(firm.name);
  }

  for (const [i, seat] of seedSeats(board, count, rng).entries()) {
    const d = board.districts[seat];
    d.owner = i;
    d.stake = d.demand * ENTRENCH_CAP;
  }

  return { board, firms, elapsed: 0, winner: null, over: false };
}

/**
 * Pick `count` starting districts, greedily maximising the distance to every
 * seat already chosen. Deterministic given `rng`.
 */
export function seedSeats(board, count, rng = Math.random) {
  const seats = [board.districts[randInt(0, board.districts.length - 1, rng)].index];
  while (seats.length < count) {
    let best = null;
    let bestScore = -1;
    for (const d of board.districts) {
      if (seats.includes(d.index)) continue;
      let score = Infinity;
      for (const s of seats) {
        const o = board.districts[s];
        score = Math.min(score, Math.abs(o.x - d.x) + Math.abs(o.y - d.y));
      }
      if (score > bestScore) {
        bestScore = score;
        best = d.index;
      }
    }
    seats.push(best);
  }
  return seats;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/**
 * Spend `budget` capital pushing into `targetIndex` on behalf of `firm`.
 * Returns the capital actually spent — a firm never spends more than the
 * district still needs, so a nearly-taken market doesn't drain the treasury.
 */
export function invest(board, firm, targetIndex, budget) {
  const target = board.districts[targetIndex];
  if (!target || target.owner === firm.id || budget <= 0) return 0;

  const efficiency = target.owner === null ? NEUTRAL_EFFICIENCY : HOSTILE_EFFICIENCY;
  const needed = target.stake / efficiency;
  const spend = Math.min(budget, needed);
  target.stake -= spend * efficiency;
  firm.capital -= spend;

  if (target.stake <= 1e-9) {
    target.owner = firm.id;
    target.stake = target.demand; // A fresh acquisition is thinly defended.
  }
  return spend;
}

/** Advance the simulation by `dt` seconds. Mutates and returns `game`. */
export function tick(game, dt, rng = Math.random) {
  if (game.over || dt <= 0) return game;
  const { board, firms } = game;
  game.elapsed += dt;

  // Revenue and upkeep.
  for (const firm of firms) {
    if (firm.bankrupt) continue;
    firm.capital += (firmIncome(board, firm.id) - firmUpkeep(board, firm.id)) * dt;
    if (firm.capital < 0) firm.capital = 0;
  }

  // Entrenchment: held districts slowly harden up to a cap.
  for (const d of board.districts) {
    if (d.owner === null) continue;
    d.stake = Math.min(d.stake + d.demand * ENTRENCH_RATE * dt, d.demand * ENTRENCH_CAP);
  }

  // AI firms choose a target before anyone spends.
  for (const firm of firms) {
    if (!firm.human && !firm.bankrupt) firm.target = chooseAiTarget(game, firm, rng);
  }

  // Expansion spending.
  for (const firm of firms) {
    if (firm.bankrupt || firm.target === null) continue;
    if (!frontier(board, firm.id).includes(firm.target)) {
      firm.target = null;
      continue;
    }
    const budget = firm.capital * firm.aggression * dt;
    invest(board, firm, firm.target, budget);
    if (board.districts[firm.target].owner === firm.id) firm.target = null;
  }

  // Bankruptcy and victory.
  for (const firm of firms) {
    firm.bankrupt = holdings(board, firm.id).length === 0;
  }
  const alive = firms.filter((f) => !f.bankrupt);
  for (const firm of alive) {
    if (marketShare(board, firm.id) >= MONOPOLY_SHARE) {
      game.winner = firm.id;
      game.over = true;
    }
  }
  if (!game.over && alive.length <= 1) {
    game.winner = alive.length === 1 ? alive[0].id : null;
    game.over = true;
  }
  return game;
}

/**
 * Score every district on a firm's frontier and take the best one. The AI
 * likes cheap, valuable, well-connected districts, and — mildly — dislikes
 * picking fights with whoever is currently winning.
 */
export function chooseAiTarget(game, firm, rng = Math.random) {
  const { board } = game;
  const options = frontier(board, firm.id);
  if (options.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const index of options) {
    const d = board.districts[index];
    const efficiency = d.owner === null ? NEUTRAL_EFFICIENCY : HOSTILE_EFFICIENCY;
    const cost = d.stake / efficiency;
    let adjacency = 0;
    for (const n of neighbors(board, index)) {
      if (board.districts[n].owner === firm.id) adjacency++;
    }
    let score = (d.demand * (1 + SYNERGY_BONUS * adjacency)) / (cost + 1);
    if (d.owner !== null && d.owner !== firm.id) {
      score *= 1 - 0.5 * marketShare(board, d.owner);
    }
    score *= 0.85 + 0.3 * rng(); // Keeps rivals from playing identically.
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

/** Set the human firm's expansion target, ignoring illegal picks. */
export function setTarget(game, firmId, targetIndex) {
  const firm = game.firms[firmId];
  if (!firm || firm.bankrupt) return false;
  if (targetIndex === null) {
    firm.target = null;
    return true;
  }
  if (!frontier(game.board, firmId).includes(targetIndex)) return false;
  firm.target = targetIndex;
  return true;
}

export function setAggression(game, firmId, value) {
  const firm = game.firms[firmId];
  if (!firm) return false;
  firm.aggression = clamp(value, 0, 1);
  return true;
}

/** A scoreboard row per firm, sorted by market share. */
export function standings(game) {
  return game.firms
    .map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      human: f.human,
      bankrupt: f.bankrupt,
      capital: f.capital,
      share: marketShare(game.board, f.id),
      income: firmIncome(game.board, f.id) - firmUpkeep(game.board, f.id),
      districts: holdings(game.board, f.id).length,
    }))
    .sort((a, b) => b.share - a.share || b.capital - a.capital);
}
