// Monopolis — a real-time strategy game about cornering markets.
//
// House rules, same as the rest of this repo: no DOM, no imports, no global
// side effects, and every random decision flows through an injectable `rng`
// (a function returning a float in [0, 1)) so the simulation is deterministic
// under test.
//
// The model, in one paragraph. The economy is a handful of MARKETS (Coffee,
// Streaming, Solar…). Each market is contested by a few BRANDS, which are
// owned by conglomerates — you, your AI rivals, or nobody (independents).
// Every brand sets a PRICE and burns capital on MARKETING; those two numbers
// decide its share of the market through a simple attraction model: customers
// are drawn to strong brands and repelled by expensive ones. Share times price
// is revenue, minus unit costs and marketing is profit, and profit is the cash
// you use to BUY BRANDS — from independents, or out from under a rival at a
// premium. Brands get more expensive as they get better, so hesitating costs
// you. Cash is the whole tension: a price war wins share and starves your
// treasury, a takeover empties it entirely, and a conglomerate whose net worth
// falls to zero gets bought out itself.

// ---------------------------------------------------------------------------
// Tuning — every dial the simulation turns, in one place.
// ---------------------------------------------------------------------------

/**
 * How long a round runs before the leaderboard decides it. A monopoly ends a
 * round early; otherwise the clock does, which keeps a session to a known
 * length however many firms are trading — a hundred-firm economy would
 * otherwise take an hour to consolidate.
 */
export const ROUND_SECONDS = 600;

/** Revenue share of the whole economy that counts as a monopoly (a win). */
export const MONOPOLY_SHARE = 0.5;

/** Brands each conglomerate is seeded with. */
export const SEED_BRANDS = 2;

/** Cash every conglomerate starts with. */
export const STARTING_CASH = 420;

/** Price multipliers a brand may charge, relative to the category norm. */
export const MIN_PRICE = 0.6;
export const MAX_PRICE = 1.8;

/** Brand equity is a 0–100 score; it is the numerator of brand attraction. */
export const MAX_EQUITY = 100;

/** Equity gained per $1/s of brand marketing, before diminishing returns. */
export const EQUITY_GAIN = 0.42;

/**
 * Fraction of equity lost per second when nobody is spending. Brands rot —
 * but slowly enough that a modest, affordable ad budget holds a position.
 * Set it higher and every brand needs more advertising than it earns, which
 * makes the whole economy a treadmill nobody can run profitably.
 */
export const EQUITY_DECAY = 0.015;

/** Category buzz gained per $1/s of category marketing. */
export const BUZZ_GAIN = 0.05;
export const BUZZ_DECAY = 0.025;

/** How much full buzz (1.0) inflates a market's unit demand. */
export const BUZZ_EFFECT = 0.55;

/** How much the category shrinks as the average price rises. */
export const CATEGORY_ELASTICITY = 0.6;

/**
 * Cost of running a brand, per second, before inflation and scale. It is
 * proportional to the size of the brand's market — a national grocery chain
 * costs more to operate than a boutique solar outfit — so a small category is
 * a viable niche to hold rather than a trap that quietly bleeds you.
 */
export const BRAND_OVERHEAD = 0.32;
export const OVERHEAD_REFERENCE_DEMAND = 15;

/**
 * Costs drift up as the game runs, which tightens a long standoff without
 * strangling the economy: every `INFLATION_PERIOD` seconds adds to brand
 * overhead, up to `MAX_INFLATION`.
 */
export const INFLATION_PERIOD = 300;
export const MAX_INFLATION = 1.8;

/**
 * Scale economics — the real endgame engine. A conglomerate spreads its
 * overhead across everything it owns, so each extra brand makes the whole
 * portfolio cheaper to run, down to `MIN_SCALE_FACTOR`. A one-brand firm pays
 * `SOLO_PENALTY` per brand instead. Being big is an advantage that compounds,
 * which is what turns a stalemate into a monopoly.
 */
/**
 * Brands a firm runs side by side in one market share distribution, shelf
 * space and back office, so each costs less than a standalone would. Without
 * this, consolidating a category multiplies overhead while dividing the same
 * category revenue, and winning a market makes you poorer.
 */
export const CATEGORY_SYNERGY = 0.5;

export const SCALE_DISCOUNT = 0.05;
export const MIN_SCALE_FACTOR = 0.6;
export const SOLO_PENALTY = 1;

/**
 * A firm this small is a startup, not a target: its brands can only be taken
 * if they are genuinely starved or the firm is over-leveraged, never merely
 * because a conglomerate out-holds it in a category. Without this, a new
 * player is dismantled before they have had a turn.
 */
export const SHELTERED_SIZE = 3;

/** Valuation: brands are priced off profit, revenue and equity. */
export const VALUE_PROFIT_MULTIPLE = 30;
export const VALUE_REVENUE_MULTIPLE = 7;
export const VALUE_EQUITY_MULTIPLE = 2;

/**
 * Even a failing brand costs this much to buy — a distribution network and a
 * name people recognise are worth something. It sits deliberately above
 * `launchCost` for a small market, so founding a brand is the cheap, slow
 * route and buying one is the expensive, instant route. When the floor drops
 * below launch cost, nobody ever builds anything.
 */
export const VALUE_FLOOR = 85;

/** Premium over fair value, by seller. Rivals do not sell politely. */
export const INDEPENDENT_PREMIUM = 0.12;
export const HOSTILE_PREMIUM = 0.55;

/** Credit limit as a multiple of portfolio value, and interest per second. */
export const CREDIT_RATIO = 0.55;
export const INTEREST_RATE = 0.006;

/**
 * A firm is distressed — and so open to raids — when its net worth falls
 * below this fraction of the portfolio it is carrying, which in practice
 * means debt above about 60% of what it owns. Set it any tighter and simply
 * investing in growth marks you as prey.
 */
export const DISTRESS_RATIO = 0.4;

/**
 * A brand is "neglected" — and so can be bought out from under a healthy
 * owner — when it holds less than this fraction of an even split of its
 * market. Measuring against the even split rather than a fixed percentage
 * matters as soon as markets get crowded: a flat 15% means every brand in a
 * six-way market is permanently raidable, and brands ping-pong between owners
 * all round instead of being fought over.
 */
export const NEGLECT_RATIO = 0.8;

/** No acquisitions in the opening seconds — everyone gets to set up first. */
export const OPENING_GRACE = 45;

/**
 * Launching a brand: you found it yourself instead of buying one. It arrives
 * tiny and unknown, but young brands grow faster than established ones for
 * their first minute or so — the launch window — so a well-funded launch can
 * outrun an incumbent that stopped paying attention.
 */
export const LAUNCH_BASE_COST = 55;
export const LAUNCH_COST_PER_DEMAND = 4;
export const LAUNCH_EQUITY = 8;
export const LAUNCH_MOMENTUM = 2.6;
export const LAUNCH_WINDOW = 75;
export const LAUNCH_COOLDOWN = 12;
export const MAX_BRANDS_PER_MARKET = 6;

/**
 * Capabilities: permanent investments in the firm itself. They are the spine
 * of a long game — income is not just a score, it is the thing you convert
 * into a structural advantage — and they pull in different directions on
 * purpose. Nobody can afford them all in a round, so which ladder you climb
 * is the strategic decision the rest of the game hangs off.
 */
export const CAPABILITIES = {
  distribution: {
    label: 'Distribution',
    blurb: 'Warehouses, trucks and shelf space. Your brands are in front of more customers, cost less to run, and are cheaper to start.',
    detail: (level) => `+${Math.round(level * 5)}% reach, overhead −${Math.round(level * 25)}%, launches −${Math.round(level * 20)}%`,
    max: 3,
  },
  research: {
    label: 'Research',
    blurb: 'Process and product work. A better product at a lower cost to make, across everything you own.',
    detail: (level) => `+${Math.round(level * 5)}% appeal, unit costs −${Math.round(level * 8)}%`,
    max: 3,
  },
  creative: {
    label: 'Creative studio',
    blurb: 'In-house advertising. Every dollar of marketing buys more reach.',
    detail: (level) => `Marketing +${Math.round(level * 25)}% effective`,
    max: 3,
  },
  dealmaking: {
    label: 'Dealmaking',
    blurb: 'Bankers on retainer. Takeovers cost less over fair value, and a brand you buy is yours to trade sooner.',
    detail: (level) => `Premium −${Math.round(level * 15)} points, bought brands keep +${Math.round(level * 12)}% reach, integration −${level * 8}s`,
    max: 3,
  },
};

/** Reach an acquired brand keeps per level of dealmaking. */
export const INTEGRATION_CARE = 0.12;

/** How much each level of distribution and research pulls customers in. */
export const AVAILABILITY_PULL = 0.05;
export const QUALITY_PULL = 0.05;

/** What the next level of any capability costs. */
export const CAPABILITY_COSTS = [60, 150, 340];

/**
 * Brand tiers. A brand that holds its reach climbs a ladder, and each rung
 * pulls a few more customers in on its own — a brand people have heard of
 * sells itself. It is the other half of building: the first is your firm, the
 * second is each business inside it.
 */
export const TIERS = [
  { name: 'Local', at: 0, pull: 1 },
  { name: 'Regional', at: 35, pull: 1.06 },
  { name: 'National', at: 62, pull: 1.14 },
  { name: 'Iconic', at: 86, pull: 1.24 },
];

/**
 * One-tap plays, for when there is no time to nurse a slider: an ad blitz
 * buys equity outright, a promotion discounts a brand for a while, and a
 * category push spikes a whole market's demand.
 */
export const ACTIONS = {
  // Buys recognition outright. Strongest on a brand whose reach is low, and
  // it lasts — equity decays slowly, so this is the play that compounds.
  blitz: { label: 'Ad blitz', cost: 34, cooldown: 22, equity: 34, scope: 'brand' },
  // Cheap volume now, and the volume itself converts: customers who try you
  // during a promotion stick around, so a promotion in a big, price-sensitive
  // market buys lasting reach a blitz would charge more for. A shallower cut
  // than it used to be, because a deep one destroyed the margin it needed.
  promo: { label: 'Promotion', cost: 28, cooldown: 20, discount: 0.85, duration: 22, scope: 'brand' },
  // Grows the whole category. Only pays where you already hold the biggest
  // slice — the rest of the lift goes to your rivals.
  push: { label: 'Category push', cost: 60, cooldown: 30, buzz: 0.8, scope: 'market' },
};

/** Equity gained per unit sold while a promotion is running — trial to habit. */
export const PROMO_LOYALTY = 0.3;

/**
 * After losing a brand, a firm cannot be raided again for this long. Losing
 * one is a setback you can answer; losing three while you are still reading
 * the first notification is just being farmed.
 */
export const RAID_RESPITE = 50;

/**
 * Seconds a freshly acquired brand spends being integrated, during which
 * nobody can buy it again. Without it, a contested brand ping-pongs between
 * conglomerates several times a minute, which reads as noise rather than
 * strategy.
 */
export const INTEGRATION_LOCK = 30;

/**
 * How far ahead of a brand's owner you must be *inside that brand's market*
 * before you can force a sale. Dominate a category and its stragglers become
 * buyable; hold a scattered portfolio and nothing is.
 */
export const CATEGORY_EDGE = 0.15;

export const FIRM_COLORS = ['#7fd6a1', '#d9a441', '#4aa3d9', '#c2607f', '#9a7fd6', '#d97a45'];

/** How many out-of-territory brands a bot appraises per shopping cycle. */
export const AI_SCAN_SAMPLE = 30;

export const RIVAL_NAMES = [
  'Halbrook Group', 'Vantor Industries', 'Meridian Partners', 'Colcannon Capital',
  'Ninth Street Holdings', 'Orbis Consolidated', 'Fairmount & Co.', 'Steelyard Ventures',
];

/**
 * The economy. `demand` is baseline units per second, `elasticity` is how
 * sharply customers punish a high price, `adPower` is how much marketing moves
 * equity here, and `cost` is what a unit costs to make (as a share of the
 * category's baseline price of 1.0).
 */
export const MARKET_TEMPLATES = [
  {
    key: 'coffee', name: 'Coffee', demand: 22, elasticity: 1.5, adPower: 1.25, cost: 0.38,
    brands: ['Ashgrove Roasters', 'Bean & Bell', 'Cardinal Coffee', 'Nocturne Brew'],
    reserve: ['Ember & Oat', 'Hollow Cup', 'Dayrise Coffee'],
  },
  {
    key: 'streaming', name: 'Streaming', demand: 16, elasticity: 1.1, adPower: 1.45, cost: 0.32,
    brands: ['Lumen+', 'Kestrel TV', 'Nightplay', 'Orbit Originals'],
    reserve: ['Halcyon Play', 'Vireo', 'Second Reel'],
  },
  {
    key: 'airlines', name: 'Airlines', demand: 12, elasticity: 2.4, adPower: 0.75, cost: 0.54,
    brands: ['Corvid Air', 'Trellis Airways', 'Skyline Jet'],
    reserve: ['Meridian Air', 'Wing & Wold', 'Pelagic Airways'],
  },
  {
    key: 'solar', name: 'Solar', demand: 10, elasticity: 1.7, adPower: 0.95, cost: 0.46,
    brands: ['Helio Works', 'Bright Harvest', 'Sunfall Energy'],
    reserve: ['Dawnline Solar', 'Copperfield Power', 'Zenith Array'],
  },
  {
    key: 'fashion', name: 'Fashion', demand: 18, elasticity: 1.2, adPower: 1.6, cost: 0.36,
    brands: ['Marlowe & Vane', 'Petra Label', 'Sable Row', 'Ivy Grade'],
    reserve: ['Vellum Atelier', 'Cross & Quiet', 'Norwood Studio'],
  },
  {
    key: 'grocery', name: 'Grocery', demand: 28, elasticity: 2.1, adPower: 0.7, cost: 0.56,
    brands: ['Fairmount Foods', 'Larkin Market', 'Provisions Co.'],
    reserve: ['Bramble Grocers', 'Ordinary Goods', 'Hearth Pantry'],
  },
  {
    key: 'chips', name: 'Semiconductors', demand: 9, elasticity: 0.9, adPower: 0.6, cost: 0.42,
    brands: ['Silica Dynamics', 'Nexon Micro', 'Quartzline'],
    reserve: ['Ferrite Labs', 'Halide Systems', 'Kelvin Micro'],
  },
  {
    key: 'fitness', name: 'Fitness', demand: 14, elasticity: 1.8, adPower: 1.35, cost: 0.40,
    brands: ['Ironhaus', 'Pulse Studios', 'Ridgeline Gyms'],
    reserve: ['Rowhouse', 'Granite Athletic', 'Third Mile'],
  },
];


// ---------------------------------------------------------------------------
// Procedural naming
//
// Eight hand-written markets and their brand lists are plenty for a four-firm
// game. A hundred-player world needs dozens of markets and hundreds of brands,
// so beyond the hand-written ones both are generated: sectors repeat across
// regions ("Coffee · Northside"), and brand names are drawn from stems and
// suffixes that suit the sector.
// ---------------------------------------------------------------------------

export const REGIONS = [
  'Northside', 'Harbour', 'Midlands', 'Westgate', 'Riverside', 'Uptown',
  'Lakeshore', 'Southbank', 'Old Town', 'Fairview', 'Eastfield', 'Highgate',
  'Ironworks', 'Meadowbrook', 'Kingsport', 'Brightwater',
];

export const BRAND_STEMS = [
  'Ashgrove', 'Corvid', 'Halbrook', 'Larkin', 'Petra', 'Sable', 'Vantor',
  'Marlowe', 'Orbis', 'Quartz', 'Trellis', 'Kestrel', 'Vireo', 'Bramble',
  'Copperfield', 'Dawnline', 'Ember', 'Granite', 'Hollow', 'Ivy', 'Juniper',
  'Kelvin', 'Lumen', 'Meridian', 'Norwood', 'Ordinary', 'Pelagic', 'Ridgeline',
  'Silica', 'Thornfield', 'Vellum', 'Wexley', 'Yarrow', 'Zenith', 'Aldercroft',
  'Blackwell', 'Cinder', 'Dovetail', 'Everly', 'Foxglove', 'Glasswing',
];

export const BRAND_SUFFIXES = {
  coffee: ['Roasters', 'Coffee', 'Brew Co.', '& Oat'],
  streaming: ['+', 'TV', 'Play', 'Originals'],
  airlines: ['Air', 'Airways', 'Jet', 'Skylines'],
  solar: ['Solar', 'Power', 'Energy', 'Array'],
  fashion: ['Atelier', 'Label', 'Studio', '& Vane'],
  grocery: ['Market', 'Grocers', 'Foods', 'Provisions'],
  chips: ['Micro', 'Systems', 'Dynamics', 'Silicon'],
  fitness: ['Athletic', 'Gyms', 'Studios', 'Fitness'],
};

/** A brand name for `sector` that is not already taken in `game`. */
export function makeBrandName(game, sectorKey, rng = Math.random) {
  const taken = new Set(game.brands.map((b) => b.name));
  const suffixes = BRAND_SUFFIXES[sectorKey] ?? ['& Co.', 'Group', 'Works'];
  for (let attempt = 0; attempt < 200; attempt++) {
    const name = `${pick(BRAND_STEMS, rng)} ${pick(suffixes, rng)}`;
    if (!taken.has(name)) return name;
  }
  return `Brand ${game.brands.length + 1}`; // Vanishingly unlikely, but total.
}

/** Firm names for late joiners and bots, unique within the game. */
export function makeFirmName(game, rng = Math.random) {
  const taken = new Set(game.firms.map((f) => f.name));
  for (const name of RIVAL_NAMES) if (!taken.has(name)) return name;
  for (let attempt = 0; attempt < 200; attempt++) {
    const name = `${pick(BRAND_STEMS, rng)} ${pick(['Holdings', 'Group', 'Partners', 'Capital', 'Industries', 'Ventures'], rng)}`;
    if (!taken.has(name)) return name;
  }
  return `Firm ${game.firms.length + 1}`;
}

/**
 * How big a world a given number of firms needs. Everyone should be able to
 * find a market worth fighting over without every category turning into a
 * hundred-way scrum.
 */
export function worldSize(firmCount) {
  const markets = clamp(Math.round(4 + firmCount * 0.55), 6, 64);
  return { markets, seedBrandsPerMarket: 3 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The level a firm has reached in one capability. */
export function capabilityLevel(game, firmId, key) {
  return game.firms[firmId]?.capabilities?.[key] ?? 0;
}

/** What the next level of `key` costs this firm, or null when maxed out. */
export function capabilityCost(game, firmId, key) {
  const spec = CAPABILITIES[key];
  if (!spec) return null;
  const level = capabilityLevel(game, firmId, key);
  return level >= spec.max ? null : CAPABILITY_COSTS[level];
}

export function canInvest(game, firmId, key) {
  const firm = game.firms[firmId];
  const spec = CAPABILITIES[key];
  if (!firm || !spec || firm.gone || game.over) return { ok: false, reason: 'unavailable' };
  const cost = capabilityCost(game, firmId, key);
  if (cost === null) return { ok: false, reason: 'fully built', cost: null };
  if (buyingPower(game, firmId) < cost) return { ok: false, reason: 'not enough capital', cost };
  return { ok: true, cost };
}

/** Buy the next level of a capability. Permanent, and never taken from you. */
export function invest(game, firmId, key) {
  const check = canInvest(game, firmId, key);
  if (!check.ok) return check;
  const firm = game.firms[firmId];
  if (firm.cash < check.cost) borrow(game, firmId, check.cost - firm.cash);
  firm.cash -= check.cost;
  firm.capabilities = { ...(firm.capabilities ?? {}), [key]: capabilityLevel(game, firmId, key) + 1 };
  computeShares(game);
  logEvent(game, `${firm.name} invested in ${CAPABILITIES[key].label.toLowerCase()} (level ${firm.capabilities[key]}).`, firm.color);
  return { ok: true, cost: check.cost, level: firm.capabilities[key] };
}

/** The tier a brand has reached, from its accumulated reach. */
export function brandTier(brand) {
  let tier = TIERS[0];
  for (const candidate of TIERS) if (brand.equity >= candidate.at) tier = candidate;
  return tier;
}

export function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}

export function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

export function jitter(center, spread, rng = Math.random) {
  return center + (rng() * 2 - 1) * spread;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Build a new economy. Every brand starts independent except one seed brand
 * per conglomerate, so the opening move is always "who do I buy first?".
 */
export function createGame({
  rivals = 3,
  players,
  markets,
  bots = true,
  roundSeconds = ROUND_SECONDS,
  rng = Math.random,
} = {}) {
  // `players` is the io-style entry point (how many seats the world is built
  // for); `rivals` is the original single-player one. Either sizes the world.
  const seats = players ?? rivals + 1;
  const marketCount = markets ?? worldSize(seats).markets;

  const game = {
    time: 0,
    markets: [],
    brands: [],
    firms: [],
    log: [],
    over: false,
    winner: null,
    outcome: null,
    seats,
    roundLength: roundSeconds,
  };

  for (let i = 0; i < marketCount; i++) {
    const tpl = MARKET_TEMPLATES[i % MARKET_TEMPLATES.length];
    const round = Math.floor(i / MARKET_TEMPLATES.length);
    // The first pass uses the hand-written markets; later passes repeat the
    // sectors across regions, so a big world stays legible ("Coffee ·
    // Harbour") instead of inventing categories nobody recognises.
    const name = round === 0 ? tpl.name : `${tpl.name} · ${REGIONS[(round - 1) % REGIONS.length]}`;
    const market = {
      id: i,
      key: tpl.key,
      name,
      baseDemand: Math.round(jitter(tpl.demand, tpl.demand * 0.15, rng)),
      elasticity: tpl.elasticity,
      adPower: tpl.adPower,
      unitCost: tpl.cost,
      buzz: 0,
      categorySpend: 0, // Set by whoever is funding category ads this second.
      reserve: round === 0 ? [...(tpl.reserve ?? [])] : [],
      brandIds: [],
    };
    game.markets.push(market);

    const names = round === 0 ? tpl.brands : tpl.brands.map(() => null);
    for (const preset of names) {
      addBrand(game, market.id, { name: preset ?? makeBrandName(game, tpl.key, rng), rng });
    }
  }

  for (let i = 0; i < seats; i++) {
    addFirm(game, {
      name: i === 0 ? 'Your Holdings' : makeFirmName(game, rng),
      human: i === 0,
      bot: i > 0 && bots,
      rng,
      seed: true,
    });
  }

  computeShares(game);
  return game;
}

/** Put a brand into a market. Shared by world generation and launches. */
export function addBrand(game, marketId, { name, owner = null, equity, price, rng = Math.random } = {}) {
  const market = game.markets[marketId];
  const brand = {
    id: game.brands.length,
    name: name ?? makeBrandName(game, market.key, rng),
    marketId,
    owner,
    price: price ?? clamp(jitter(1, 0.12, rng), MIN_PRICE, MAX_PRICE),
    equity: equity ?? jitter(38, 12, rng),
    marketing: Math.max(0.8, market.baseDemand * 0.06),
    share: 0,
    born: game.time,
    promoUntil: 0,
    lockedUntil: 0,
    units: 0,
    revenue: 0,
    profit: 0,
  };
  game.brands.push(brand);
  market.brandIds.push(brand.id);
  return brand;
}

/**
 * Seat a new conglomerate — at world generation, or when someone joins a game
 * already in progress. Joiners are handed one brand in the least contested
 * market going, so they always have somewhere to stand.
 */
export function addFirm(game, { name, human = false, bot = false, rng = Math.random, seed = true } = {}) {
  const firm = {
    id: game.firms.length,
    name: name ?? makeFirmName(game, rng),
    color: FIRM_COLORS[game.firms.length % FIRM_COLORS.length],
    human,
    bot,
    cash: STARTING_CASH,
    debt: 0,
    boughtOut: false,
    gone: false,
    joinedAt: game.time,
    cooldown: rng() * 6, // Stagger bot decisions from the first tick.
    actionReady: {},
    capabilities: {},
  };
  game.firms.push(firm);
  if (seed) for (let i = 0; i < SEED_BRANDS; i++) seatFirm(game, firm, rng);
  return firm;
}

/** Hand `firm` one brand: an unowned one in a quiet market, or a fresh launch. */
function seatFirm(game, firm, rng = Math.random) {
  const mine = new Set(game.brands.filter((b) => b.owner === firm.id).map((b) => b.marketId));
  const contested = new Map();
  for (const b of game.brands) {
    if (b.owner === null) continue;
    contested.set(b.marketId, (contested.get(b.marketId) ?? 0) + 1);
  }
  const free = game.brands
    .filter((b) => b.owner === null && !mine.has(b.marketId))
    .sort((a, b) => (contested.get(a.marketId) ?? 0) - (contested.get(b.marketId) ?? 0));
  if (free.length) {
    free[0].owner = firm.id;
    free[0].born = game.time;
    return free[0];
  }
  // Every brand is spoken for: found one in the emptiest market instead.
  const market = [...game.markets]
    .sort((a, b) => (contested.get(a.id) ?? 0) - (contested.get(b.id) ?? 0))[0];
  return addBrand(game, market.id, { owner: firm.id, equity: LAUNCH_EQUITY * 2, rng });
}

/** A player quit or was disconnected: their brands go back on the market. */
export function removeFirm(game, firmId) {
  const firm = game.firms[firmId];
  if (!firm || firm.gone) return false;
  for (const brand of game.brands) {
    if (brand.owner === firmId) {
      brand.owner = null;
      brand.marketing = 1.5;
      brand.lockedUntil = game.time + INTEGRATION_LOCK;
    }
  }
  firm.gone = true;
  firm.boughtOut = true;
  computeShares(game);
  logEvent(game, `${firm.name} left the market.`, firm.color);
  return true;
}

/** Seconds left in the round, or null when a round is untimed. */
export function timeLeft(game) {
  if (!game.roundLength) return null;
  return Math.max(0, game.roundLength - game.time);
}

/** Firms still in the running. */
export function activeFirms(game) {
  return game.firms.filter((f) => !f.gone && !f.boughtOut);
}

/**
 * The share of the whole economy that wins the game. Half of everything is a
 * fair target in a four-firm game and an impossible one in a hundred-firm
 * world, so the bar falls as the lobby grows — but never below a fifth, which
 * is still a colossal position.
 */
export function winShare(game) {
  const seats = Math.max(2, game.seats ?? game.firms.length);
  return clamp(MONOPOLY_SHARE - 0.004 * (seats - 4), 0.2, MONOPOLY_SHARE);
}

// ---------------------------------------------------------------------------
// The market model
// ---------------------------------------------------------------------------

export const brandsIn = (game, market) => market.brandIds.map((id) => game.brands[id]);

/** Cost multiplier on brand overhead at the current point in the game. */
export function costPressure(game) {
  return Math.min(MAX_INFLATION, 1 + game.time / INFLATION_PERIOD);
}

/** How many brands in `marketId` belong to `firmId`. */
export function stableSize(game, firmId, marketId) {
  return game.markets[marketId].brandIds
    .filter((id) => game.brands[id].owner === firmId).length;
}

/**
 * Overhead multiplier for a firm's brands, given how many it runs. Scale is
 * cheap; running a single brand against conglomerates is not.
 */
export function scaleFactor(game, firmId) {
  const held = ownedBrands(game, firmId).length;
  if (held <= 1) return SOLO_PENALTY;
  return Math.max(MIN_SCALE_FACTOR, SOLO_PENALTY - SCALE_DISCOUNT * (held - 1));
}

/**
 * How badly customers want a brand. Equity pulls, price pushes — and the push
 * is sharper in price-sensitive categories. This single line is the whole
 * strategic core: every lever in the game moves one of its two terms.
 */
/** The price customers actually pay — a running promotion discounts it. */
export function effectivePrice(game, brand) {
  const promo = game.time < (brand.promoUntil ?? 0);
  return brand.price * (promo ? ACTIONS.promo.discount : 1);
}

/**
 * How badly customers want a brand. Reach pulls, price pushes — and two of the
 * firm's capabilities pull as well, because they are things customers can
 * feel: distribution is whether the product is on the shelf in front of them,
 * research is whether it is any good. Without this, those ladders would only
 * ever improve margins, and rounds are won on share, not on margins — so
 * building the firm would be a trap for anyone trying to win.
 */
export function attraction(game, brand) {
  const market = game.markets[brand.marketId];
  const owner = brand.owner ?? -1;
  const capability = 1
    + AVAILABILITY_PULL * capabilityLevel(game, owner, 'distribution')
    + QUALITY_PULL * capabilityLevel(game, owner, 'research');
  return Math.max(1, brand.equity) * brandTier(brand).pull * capability
    * Math.pow(effectivePrice(game, brand), -market.elasticity);
}

/** Total units a category absorbs per second, after buzz and price effects. */
export function marketDemand(game, market) {
  const brands = brandsIn(game, market);
  const avgPrice = brands.reduce((s, b) => s + effectivePrice(game, b), 0) / brands.length;
  return market.baseDemand
    * (1 + BUZZ_EFFECT * market.buzz)
    * Math.pow(avgPrice, -CATEGORY_ELASTICITY);
}

/** Recompute share, units, revenue and profit for every brand. */
export function computeShares(game) {
  for (const market of game.markets) {
    const brands = brandsIn(game, market);
    const attrs = brands.map((b) => attraction(game, b));
    const total = attrs.reduce((s, a) => s + a, 0) || 1;
    const demand = marketDemand(game, market);
    for (const [i, brand] of brands.entries()) {
      const price = effectivePrice(game, brand);
      brand.share = attrs[i] / total;
      brand.units = demand * brand.share;
      brand.revenue = brand.units * price;
      const unitCost = market.unitCost
        * (1 - 0.08 * capabilityLevel(game, brand.owner ?? -1, 'research'));
      const gross = brand.units * (price - unitCost);
      const stable = brand.owner === null ? 1 : stableSize(game, brand.owner, market.id);
      const overhead = brand.owner === null ? 0
        : BRAND_OVERHEAD * costPressure(game) * scaleFactor(game, brand.owner)
          * (market.baseDemand / OVERHEAD_REFERENCE_DEMAND)
          * Math.pow(stable, -CATEGORY_SYNERGY)
          * (1 - 0.25 * capabilityLevel(game, brand.owner, 'distribution'));
      brand.profit = gross - brand.marketing - overhead;
    }
  }
  return game;
}

export const ownedBrands = (game, firmId) => game.brands.filter((b) => b.owner === firmId);

export function firmRevenue(game, firmId) {
  return ownedBrands(game, firmId).reduce((s, b) => s + b.revenue, 0);
}

export function firmProfit(game, firmId) {
  const firm = game.firms[firmId];
  const operating = ownedBrands(game, firmId).reduce((s, b) => s + b.profit, 0);
  const category = game.markets.reduce(
    (s, m) => s + (m.fundedBy === firmId ? m.categorySpend : 0), 0);
  return operating - category - firm.debt * INTEREST_RATE;
}

/** Revenue share of the entire economy — the scoreboard number. */
export function economyShare(game, firmId) {
  const total = game.brands.reduce((s, b) => s + b.revenue, 0) || 1;
  return firmRevenue(game, firmId) / total;
}

// ---------------------------------------------------------------------------
// Valuation, credit and acquisitions
// ---------------------------------------------------------------------------

/** What a brand is worth on the open market. */
export function brandValue(game, brandId) {
  const b = game.brands[brandId];
  return Math.max(
    VALUE_FLOOR,
    VALUE_PROFIT_MULTIPLE * Math.max(b.profit, 0)
      + VALUE_REVENUE_MULTIPLE * b.revenue
      + VALUE_EQUITY_MULTIPLE * b.equity,
  );
}

/** Everything a firm owns, at market value. */
export function portfolioValue(game, firmId) {
  return ownedBrands(game, firmId).reduce((s, b) => s + brandValue(game, b.id), 0);
}

export function netWorth(game, firmId) {
  const firm = game.firms[firmId];
  return firm.cash + portfolioValue(game, firmId) - firm.debt;
}

export function creditLimit(game, firmId) {
  return portfolioValue(game, firmId) * CREDIT_RATIO;
}

/** Cash a firm could raise right now: its treasury plus unused credit. */
export function buyingPower(game, firmId) {
  const firm = game.firms[firmId];
  return firm.cash + Math.max(0, creditLimit(game, firmId) - firm.debt);
}

/** Price to take a brand, including the premium its owner will demand. */
export function acquisitionPrice(game, buyerId, brandId) {
  const brand = game.brands[brandId];
  const base = brand.owner === null ? INDEPENDENT_PREMIUM : HOSTILE_PREMIUM;
  const discount = 0.15 * capabilityLevel(game, buyerId, 'dealmaking');
  return brandValue(game, brandId) * (1 + Math.max(0.05, base - discount));
}

/**
 * A firm is in distress when its net worth no longer comfortably covers its
 * debts and obligations. Only distressed firms can be raided — otherwise a
 * healthy conglomerate would just get dismantled by whoever is richest.
 */
export function inDistress(game, firmId) {
  const firm = game.firms[firmId];
  return netWorth(game, firmId) < portfolioValue(game, firmId) * DISTRESS_RATIO;
}

/** A brand nobody is defending — starved well below its market's even split. */
export function isNeglected(game, brandId) {
  const brand = game.brands[brandId];
  const even = 1 / Math.max(1, game.markets[brand.marketId].brandIds.length);
  return brand.share < NEGLECT_RATIO * even;
}

/** A firm's combined share of one market — its grip on the category. */
export function categoryGrip(game, firmId, marketId) {
  return brandsIn(game, game.markets[marketId])
    .filter((b) => b.owner === firmId)
    .reduce((s, b) => s + b.share, 0);
}

/**
 * An owned brand can be taken three ways: its parent is over-leveraged, the
 * brand has been beaten down to a rump share, or the buyer simply outweighs
 * its owner inside that category. Anything else is off the table — a healthy
 * conglomerate can't be dismantled just by being rich.
 */
export function isVulnerable(game, brandId, buyerId = null) {
  const brand = game.brands[brandId];
  if (brand.owner === null) return true;
  // Nobody is put out of business by a takeover: your last brand is yours.
  if (ownedBrands(game, brand.owner).length <= 1) return false;
  // A firm that just lost one gets a moment to respond before the next bid.
  if (game.time < (game.firms[brand.owner].raidRespite ?? 0)) return false;
  if (inDistress(game, brand.owner) || isNeglected(game, brandId)) return true;
  if (buyerId === null) return false;
  if (ownedBrands(game, brand.owner).length <= SHELTERED_SIZE) return false;
  return categoryGrip(game, buyerId, brand.marketId)
    > categoryGrip(game, brand.owner, brand.marketId) + CATEGORY_EDGE;
}

/** Can `buyerId` take `brandId` right now, and if not, why not? */
export function canAcquire(game, buyerId, brandId) {
  const brand = game.brands[brandId];
  const buyer = game.firms[buyerId];
  if (!brand || !buyer || buyer.boughtOut) return { ok: false, reason: 'unavailable' };
  if (brand.owner === buyerId) return { ok: false, reason: 'already yours' };
  if (game.over) return { ok: false, reason: 'the game is over' };
  if (game.time < OPENING_GRACE) return { ok: false, reason: 'markets still opening' };
  if (game.time < (brand.lockedUntil ?? 0)) return { ok: false, reason: 'still integrating' };
  const price = acquisitionPrice(game, buyerId, brandId);
  if (buyingPower(game, buyerId) < price) return { ok: false, reason: 'not enough capital', price };
  if (brand.owner !== null && !isVulnerable(game, brand.id, buyerId)) {
    return { ok: false, reason: 'owner is not vulnerable', price };
  }
  return { ok: true, price };
}

/**
 * Buy a brand, drawing on credit if the treasury is short. The seller banks
 * the proceeds — taking a rival's crown jewel hands them the war chest to
 * come back at you, which is the point.
 */
export function acquire(game, buyerId, brandId) {
  const check = canAcquire(game, buyerId, brandId);
  if (!check.ok) return check;
  const buyer = game.firms[buyerId];
  const brand = game.brands[brandId];
  const price = check.price;

  if (buyer.cash < price) {
    borrow(game, buyerId, price - buyer.cash);
  }
  buyer.cash -= price;
  const seller = brand.owner === null ? null : game.firms[brand.owner];
  if (seller) {
    seller.cash += price;
    repay(game, seller.id, seller.cash); // Sellers pay down debt first.
  }
  if (seller) seller.raidRespite = game.time + RAID_RESPITE;
  // A firm with bankers and an integration team keeps what it buys intact;
  // everyone else loses momentum in the handover. This is what makes the
  // dealmaking ladder worth climbing for a serial acquirer: not just a cheaper
  // price, but a brand that is still worth something the day after.
  brand.equity = clamp(
    brand.equity * (1 + INTEGRATION_CARE * capabilityLevel(game, buyerId, 'dealmaking')),
    1, MAX_EQUITY);
  brand.owner = buyerId;
  brand.lockedUntil = game.time
    + Math.max(6, INTEGRATION_LOCK - 8 * capabilityLevel(game, buyerId, 'dealmaking'));
  if (brand.marketing < 1) brand.marketing = 1;

  logEvent(game, seller
    ? `${buyer.name} took ${brand.name} from ${seller.name} for $${price.toFixed(0)}.`
    : `${buyer.name} acquired ${brand.name} for $${price.toFixed(0)}.`, buyer.color);
  return { ok: true, price };
}

/** Sell a brand back to the market at fair value — an emergency cash exit. */
export function divest(game, firmId, brandId) {
  const brand = game.brands[brandId];
  if (!brand || brand.owner !== firmId) return { ok: false, reason: 'not yours' };
  const price = brandValue(game, brandId) * 0.85; // Fire sales are not kind.
  brand.owner = null;
  brand.marketing = 1.5;
  brand.lockedUntil = game.time + INTEGRATION_LOCK;
  game.firms[firmId].cash += price;
  logEvent(game, `${game.firms[firmId].name} divested ${brand.name} for $${price.toFixed(0)}.`,
    game.firms[firmId].color);
  return { ok: true, price };
}

export function borrow(game, firmId, amount) {
  const firm = game.firms[firmId];
  const room = Math.max(0, creditLimit(game, firmId) - firm.debt);
  const taken = clamp(amount, 0, room);
  firm.debt += taken;
  firm.cash += taken;
  return taken;
}

export function repay(game, firmId, amount) {
  const firm = game.firms[firmId];
  const paid = clamp(Math.min(amount, firm.debt), 0, firm.cash);
  firm.debt -= paid;
  firm.cash -= paid;
  return paid;
}


// ---------------------------------------------------------------------------
// Launching brands
// ---------------------------------------------------------------------------

/**
 * Marketing works harder on a brand nobody has made their mind up about yet.
 * The bonus fades over `LAUNCH_WINDOW` seconds, which is the whole reason
 * founding a brand can beat buying one.
 */
export function launchMomentum(game, brand) {
  const age = game.time - (brand.born ?? 0);
  if (age >= LAUNCH_WINDOW) return 1;
  return 1 + (LAUNCH_MOMENTUM - 1) * (1 - age / LAUNCH_WINDOW);
}

/** What it costs to put a new brand into a market. Bigger markets cost more. */
export function launchCost(game, marketId, firmId = null) {
  const base = LAUNCH_BASE_COST + game.markets[marketId].baseDemand * LAUNCH_COST_PER_DEMAND;
  if (firmId === null) return base;
  return base * (1 - 0.2 * capabilityLevel(game, firmId, 'distribution'));
}

export function canLaunch(game, firmId, marketId) {
  const firm = game.firms[firmId];
  const market = game.markets[marketId];
  const cost = market ? launchCost(game, marketId, firmId) : 0;
  if (!firm || !market || firm.boughtOut || game.over) return { ok: false, reason: 'unavailable' };
  if (market.brandIds.length >= MAX_BRANDS_PER_MARKET) {
    return { ok: false, reason: 'market is full', cost };
  }
  if (market.reserve.length === 0) return { ok: false, reason: 'no names left', cost };
  if (game.time < (firm.launchReady ?? 0)) return { ok: false, reason: 'still setting up', cost };
  if (buyingPower(game, firmId) < cost) return { ok: false, reason: 'not enough capital', cost };
  return { ok: true, cost };
}

/** Found a brand: cheap, unknown, and growing fast if you feed it. */
export function launchBrand(game, firmId, marketId) {
  const check = canLaunch(game, firmId, marketId);
  if (!check.ok) return check;
  const firm = game.firms[firmId];
  const market = game.markets[marketId];

  if (firm.cash < check.cost) borrow(game, firmId, check.cost - firm.cash);
  firm.cash -= check.cost;
  firm.launchReady = game.time + LAUNCH_COOLDOWN;

  const brand = {
    id: game.brands.length,
    name: market.reserve.shift(),
    marketId,
    owner: firmId,
    price: 1,
    equity: LAUNCH_EQUITY,
    marketing: 3,
    share: 0,
    born: game.time,
    promoUntil: 0,
    lockedUntil: game.time + INTEGRATION_LOCK,
    units: 0,
    revenue: 0,
    profit: 0,
  };
  game.brands.push(brand);
  market.brandIds.push(brand.id);
  computeShares(game);
  logEvent(game, `${firm.name} launched ${brand.name} into ${market.name}.`, firm.color);
  return { ok: true, cost: check.cost, brand };
}

// ---------------------------------------------------------------------------
// One-tap plays
// ---------------------------------------------------------------------------

/** When `key` is next available to `firmId`, and whether it can be paid for. */
export function canRunAction(game, firmId, key, targetId) {
  const spec = ACTIONS[key];
  const firm = game.firms[firmId];
  if (!spec || !firm || firm.boughtOut || game.over) return { ok: false, reason: 'unavailable' };
  const ready = firm.actionReady?.[key] ?? 0;
  if (game.time < ready) {
    return { ok: false, reason: 'on cooldown', cost: spec.cost, ready };
  }
  if (spec.scope === 'brand') {
    const brand = game.brands[targetId];
    if (!brand || brand.owner !== firmId) return { ok: false, reason: 'not your brand', cost: spec.cost };
  } else if (!game.markets[targetId]) {
    return { ok: false, reason: 'no such market', cost: spec.cost };
  }
  if (buyingPower(game, firmId) < spec.cost) {
    return { ok: false, reason: 'not enough capital', cost: spec.cost };
  }
  return { ok: true, cost: spec.cost };
}

/**
 * Run a one-tap play. These are the fast lane: no sliders, immediate effect,
 * and a cooldown so they punctuate a game rather than replace it.
 */
export function runAction(game, firmId, key, targetId) {
  const check = canRunAction(game, firmId, key, targetId);
  if (!check.ok) return check;
  const spec = ACTIONS[key];
  const firm = game.firms[firmId];

  if (firm.cash < spec.cost) borrow(game, firmId, spec.cost - firm.cash);
  firm.cash -= spec.cost;
  firm.actionReady = { ...(firm.actionReady ?? {}), [key]: game.time + spec.cooldown };

  if (key === 'blitz') {
    const brand = game.brands[targetId];
    brand.equity = clamp(brand.equity + spec.equity, 1, MAX_EQUITY);
  } else if (key === 'promo') {
    const brand = game.brands[targetId];
    brand.promoUntil = game.time + spec.duration;
  } else if (key === 'push') {
    const market = game.markets[targetId];
    market.buzz = clamp(market.buzz + spec.buzz, 0, 2);
  }
  computeShares(game);
  return { ok: true, cost: spec.cost };
}

/** The window an estimate is averaged over — about a minute of play. */
export const ESTIMATE_HORIZON = 60;

/**
 * How much of a play's instantaneous effect a firm actually banks, calibrated
 * against simulated outcomes rather than assumed. Reach bought by a blitz
 * decays and rivals answer it, so about a third of the first reading survives;
 * category buzz fades on its own; a promotion's converted customers slightly
 * beat the arithmetic, so it is left alone and rounded down. Showing the raw
 * instantaneous figure would overstate every play by two or three times.
 */
export const REALIZATION = { blitz: 0.35, promo: 1, push: 0.5 };

/** Re-solve the economy with one value changed, and read the profit delta. */
function profitDelta(game, firmId, change) {
  const before = firmProfit(game, firmId);
  const undo = change();
  computeShares(game);
  const after = firmProfit(game, firmId);
  undo();
  computeShares(game);
  return after - before;
}

/**
 * What a one-tap play is worth, in money rather than vibes.
 *
 * Each play is applied to the live economy, the whole thing is re-solved, the
 * change in the firm's profit is read off, and the value is then averaged over
 * a minute — because the three plays pay out on completely different
 * schedules, and comparing their instantaneous effects would be a lie:
 *
 *  - a blitz buys reach that decays slowly, so its effect is roughly flat;
 *  - a promotion *loses* margin while it runs and pays afterwards, through the
 *    customers it converts into lasting reach;
 *  - a push fades with the category buzz it bought.
 *
 * It is an estimate, not a forecast — rivals answer, and the world moves — but
 * it is honest about direction and rough size, which is what you need to
 * choose between three buttons.
 */
export function estimateAction(game, firmId, key, targetId) {
  const spec = ACTIONS[key];
  const firm = game.firms[firmId];
  if (!spec || !firm) return null;

  let gain = null;

  if (key === 'blitz') {
    const brand = game.brands[targetId];
    if (!brand || brand.owner !== firmId) return null;
    gain = profitDelta(game, firmId, () => {
      const equity = brand.equity;
      brand.equity = clamp(brand.equity + spec.equity, 1, MAX_EQUITY);
      return () => { brand.equity = equity; };
    });
  } else if (key === 'promo') {
    const brand = game.brands[targetId];
    if (!brand || brand.owner !== firmId) return null;
    // While it runs: cheaper, so more units at a thinner margin.
    const during = profitDelta(game, firmId, () => {
      const until = brand.promoUntil;
      brand.promoUntil = game.time + spec.duration;
      return () => { brand.promoUntil = until; };
    });
    // Afterwards: the reach those extra customers left behind.
    const converted = clamp(
      PROMO_LOYALTY * brand.units * spec.duration * (1 - brand.equity / MAX_EQUITY),
      0, MAX_EQUITY - brand.equity);
    const after = profitDelta(game, firmId, () => {
      const equity = brand.equity;
      brand.equity = clamp(brand.equity + converted, 1, MAX_EQUITY);
      return () => { brand.equity = equity; };
    });
    const tail = Math.max(0, ESTIMATE_HORIZON - spec.duration);
    gain = (during * spec.duration + after * tail) / ESTIMATE_HORIZON;
  } else if (key === 'push') {
    const market = game.markets[targetId];
    if (!market) return null;
    const peak = profitDelta(game, firmId, () => {
      const buzz = market.buzz;
      market.buzz = clamp(market.buzz + spec.buzz, 0, 2);
      return () => { market.buzz = buzz; };
    });
    // Buzz bleeds away at BUZZ_DECAY, so average the decaying tail.
    const fade = (1 - Math.exp(-BUZZ_DECAY * ESTIMATE_HORIZON)) / (BUZZ_DECAY * ESTIMATE_HORIZON);
    gain = peak * fade;
  } else {
    return null;
  }

  gain *= REALIZATION[key] ?? 1;
  return {
    gain,
    payback: gain > 0 ? spec.cost / gain : null,
    worthwhile: gain > 0 && spec.cost / gain <= ESTIMATE_HORIZON,
  };
}

// ---------------------------------------------------------------------------
// Player levers
// ---------------------------------------------------------------------------

export function setPrice(game, firmId, brandId, price) {
  const brand = game.brands[brandId];
  if (!brand || brand.owner !== firmId) return false;
  brand.price = clamp(price, MIN_PRICE, MAX_PRICE);
  computeShares(game);
  return true;
}

export function setMarketing(game, firmId, brandId, spend) {
  const brand = game.brands[brandId];
  if (!brand || brand.owner !== firmId) return false;
  brand.marketing = clamp(spend, 0, 40);
  computeShares(game);
  return true;
}

/**
 * Fund a category campaign: grow the whole market's demand. It lifts every
 * brand in the category, so it only pays when you already own the biggest
 * slice of it — the classic "grow the pie" move.
 */
export function setCategorySpend(game, firmId, marketId, spend) {
  const market = game.markets[marketId];
  if (!market) return false;
  market.categorySpend = clamp(spend, 0, 40);
  market.fundedBy = market.categorySpend > 0 ? firmId : undefined;
  return true;
}

export function logEvent(game, text, color = '#9fb0c0') {
  game.log.unshift({ time: game.time, text, color });
  if (game.log.length > 40) game.log.pop();
  return game;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/** Advance the economy by `dt` seconds. Mutates and returns `game`. */
export function tick(game, dt, rng = Math.random) {
  if (game.over || dt <= 0) return game;
  game.time += dt;

  // Buzz builds from category spend and fades without it.
  for (const market of game.markets) {
    const spend = market.categorySpend || 0;
    market.buzz = clamp(
      market.buzz + (BUZZ_GAIN * spend - BUZZ_DECAY * market.buzz) * dt, 0, 2);
  }

  // Equity: marketing buys awareness with diminishing returns, and neglect
  // erodes what you already have. A running promotion also converts the
  // customers it wins into reach, which is what makes it more than a
  // temporary discount.
  for (const brand of game.brands) {
    const market = game.markets[brand.marketId];
    const trial = game.time < (brand.promoUntil ?? 0) ? PROMO_LOYALTY * brand.units : 0;
    const studio = 1 + 0.25 * capabilityLevel(game, brand.owner ?? -1, 'creative');
    const gain = (EQUITY_GAIN * market.adPower * brand.marketing * studio + trial)
      * launchMomentum(game, brand) * (1 - brand.equity / MAX_EQUITY);
    const wasTier = brandTier(brand).name;
    brand.equity = clamp(brand.equity + (gain - EQUITY_DECAY * brand.equity) * dt, 1, MAX_EQUITY);
    const nowTier = brandTier(brand);
    if (nowTier.name !== wasTier && brand.owner !== null
        && TIERS.indexOf(nowTier) > TIERS.findIndex((t) => t.name === wasTier)) {
      logEvent(game, `${brand.name} is now a ${nowTier.name.toLowerCase()} brand.`,
        game.firms[brand.owner].color);
    }
  }

  computeShares(game);

  // Cash flows. Independent brands fund themselves; owned ones pay their firm.
  for (const firm of game.firms) {
    if (firm.boughtOut) continue;
    firm.cash += firmProfit(game, firm.id) * dt;
    if (firm.cash < 0) {
      // Overdrafts become debt, which is how a price war turns into a noose.
      const shortfall = -firm.cash;
      firm.cash = 0;
      const covered = borrow(game, firm.id, shortfall);
      if (covered < shortfall - 1e-9) forceLiquidation(game, firm.id, shortfall - covered);
    }
  }

  for (const firm of game.firms) {
    if (!firm.human && !firm.boughtOut) runAi(game, firm, dt, rng);
  }

  // Cash is guarded everywhere it is spent; this only sweeps up float dust.
  for (const firm of game.firms) if (firm.cash < 0) firm.cash = 0;

  resolveOutcomes(game);
  return game;
}

/** Out of cash and out of credit: sell brands until the bills are paid. */
function forceLiquidation(game, firmId, owed) {
  const firm = game.firms[firmId];
  const sellable = ownedBrands(game, firmId)
    .sort((a, b) => brandValue(game, a.id) - brandValue(game, b.id));
  for (const brand of sellable) {
    if (firm.cash >= owed) break;
    divest(game, firmId, brand.id); // Cheapest assets go first.
  }
  // Whatever was raised goes straight to the creditors.
  firm.cash = Math.max(0, firm.cash - owed);
}

/**
 * The brands a bot will consider this cycle: everything in the markets it
 * already trades in, plus a bounded random sample of everywhere else. In a
 * hundred-firm world an exhaustive appraisal by every bot would dominate the
 * server tick, and it buys nothing — nobody expands into a market they have
 * never heard of on the strength of a spreadsheet.
 */
export function shoppingList(game, firm, mine, rng = Math.random, sample = AI_SCAN_SAMPLE) {
  const home = new Set(mine.map((b) => b.marketId));
  const near = [];
  const far = [];
  for (const brand of game.brands) {
    if (brand.owner === firm.id) continue;
    (home.has(brand.marketId) ? near : far).push(brand);
  }
  if (far.length <= sample) return near.concat(far);
  const picked = [];
  for (let i = 0; i < sample; i++) picked.push(far[Math.floor(rng() * far.length)]);
  return near.concat(picked);
}

/**
 * Rival behaviour, in three moves: price toward the margin its market
 * rewards, fund marketing it can afford, and shop for brands when cash
 * allows. Rivals prefer cheap independents but will raid a distressed
 * conglomerate — including yours.
 */
export function runAi(game, firm, dt, rng = Math.random) {
  const mine = ownedBrands(game, firm.id);

  // Wiped out but still solvent: found something and start again. Without
  // this a firm that loses its last brand sits on its cash for the rest of
  // the round, which is neither a strategy nor an ending.
  if (mine.length === 0) {
    firm.cooldown -= dt;
    if (firm.cooldown > 0) return;
    const opening = game.markets
      .map((m) => ({ market: m, check: canLaunch(game, firm.id, m.id) }))
      .filter(({ check }) => check.ok)
      .sort((a, b) => a.check.cost - b.check.cost)[0];
    if (opening) {
      launchBrand(game, firm.id, opening.market.id);
      firm.cooldown = 5 + rng() * 5;
    } else {
      const bargain = shoppingList(game, firm, [], rng)
        .map((brand) => ({ brand, check: canAcquire(game, firm.id, brand.id) }))
        .filter(({ check }) => check.ok)
        .sort((a, b) => a.check.price - b.check.price)[0];
      if (bargain) acquire(game, firm.id, bargain.brand.id);
      firm.cooldown = 4 + rng() * 4;
    }
    return;
  }

  // Retrenchment. A firm with no cash and no profit stops competing for share
  // and starts protecting its margin: ads down to a trickle, prices up. It is
  // usually enough to stop a bad run becoming a liquidation spiral, which
  // otherwise knocks rivals out long before anyone has won anything.
  if (firm.cash < 60 && firmProfit(game, firm.id) < 0) {
    for (const brand of mine) {
      brand.marketing = Math.min(brand.marketing, Math.max(0.4, brand.revenue * 0.1));
      brand.price += clamp(1.35 - brand.price, -0.2 * dt, 0.2 * dt);
    }
    for (const market of game.markets) {
      if (market.fundedBy === firm.id) setCategorySpend(game, firm.id, market.id, 0);
    }
    firm.cooldown = Math.max(firm.cooldown, 8);
    return;
  }

  for (const brand of mine) {
    const market = game.markets[brand.marketId];
    // How much of this category the firm already controls, which decides
    // whether it presses its advantage or cuts its losses.
    const grip = categoryGrip(game, firm.id, market.id);
    // Elastic markets punish premium pricing; inelastic ones reward it.
    // A small per-brand offset keeps a conglomerate from pricing every brand
    // it owns identically, which looks (and plays) like one giant brand.
    const spread = 0.94 + 0.12 * ((brand.id % 5) / 4);
    const wanted = clamp((1.55 - 0.22 * market.elasticity) * spread, MIN_PRICE, MAX_PRICE);
    brand.price += clamp(wanted - brand.price, -0.25 * dt, 0.25 * dt);

    // Spend a slice of revenue on marketing, more when losing — and far more
    // when sitting on idle cash. A hoarding rival is a rival about to bury
    // someone in advertising, which is how stalemates get broken.
    // Press where you lead, retreat where you are beaten: concentration is
    // what turns a scattered portfolio into a category monopoly.
    const hunger = grip > 0.45 ? 1.5 : grip < 0.18 ? 0.45 : 1.0;
    const warChest = firm.cash > 800 ? firm.cash * 0.004 : 0;
    // The ceiling is the brand's own revenue, not the treasury: a firm that
    // has been squeezed to nothing can still advertise out of operating cash
    // flow, which is what stops a bad quarter becoming a death spiral.
    const ceiling = Math.max(0.5, brand.revenue * 0.28, firm.cash * 0.03);
    const target = clamp(Math.max(brand.revenue * 0.16 * hunger, warChest), 0.5, ceiling);
    brand.marketing += clamp(target - brand.marketing, -3 * dt, 3 * dt);
    brand.marketing = clamp(brand.marketing, 0, 40);
  }

  // Category campaigns, but only where this firm is already dominant.
  for (const market of game.markets) {
    const held = brandsIn(game, market).filter((b) => b.owner === firm.id);
    const share = held.reduce((s, b) => s + b.share, 0);
    if (market.fundedBy !== undefined && market.fundedBy !== firm.id) continue;
    if (share > 0.5 && firm.cash > 250) setCategorySpend(game, firm.id, market.id, 4);
    else if (market.fundedBy === firm.id) setCategorySpend(game, firm.id, market.id, 0);
  }

  // Idle cash pays down the loan book before it pays interest for nothing.
  if (firm.cash > 600 && firm.debt > 0) repay(game, firm.id, Math.min(firm.debt, 40 * dt));

  // One-tap plays, same three the player has: prop up a brand that is being
  // squeezed, and push a category this firm is winning.
  const squeezed = mine.filter((b) => b.share < 0.2).sort((a, b) => b.revenue - a.revenue)[0];
  if (squeezed && firm.cash > 300 && canRunAction(game, firm.id, 'blitz', squeezed.id).ok) {
    runAction(game, firm.id, 'blitz', squeezed.id);
  }
  const stronghold = game.markets
    .filter((m) => categoryGrip(game, firm.id, m.id) > 0.55)
    .sort((a, b) => b.baseDemand - a.baseDemand)[0];
  if (stronghold && firm.cash > 500 && canRunAction(game, firm.id, 'push', stronghold.id).ok) {
    runAction(game, firm.id, 'push', stronghold.id);
  }

  // Build the firm itself when there is cash to spare. Which ladder depends
  // on how this firm is actually playing: a sprawling portfolio wants cheaper
  // overhead, a volume seller wants cheaper goods, an advertiser wants a
  // studio, and a serial acquirer wants bankers.
  if (firm.cash > 500) {
    const revenue = mine.reduce((sum, b) => sum + b.revenue, 0);
    const ads = mine.reduce((sum, b) => sum + b.marketing, 0);
    const wants = mine.length >= 6 ? 'distribution'
      : revenue > 30 ? 'research'
        : ads > revenue * 0.25 ? 'creative' : 'dealmaking';
    if (canInvest(game, firm.id, wants).ok) invest(game, firm.id, wants);
  }

  firm.cooldown -= dt;
  if (firm.cooldown > 0) return;

  // Prefer founding a brand in a category this firm is contesting but has not
  // yet won. Building is slower than buying, which is exactly the point: it
  // keeps rivals from simply hoovering up the board in the first minute.
  // Prefer a category this firm is contesting but has not won; a leader with
  // nothing left to buy will also open a front in a market it has no presence
  // in at all, which is what carries it the last stretch to a monopoly.
  const room = game.markets
    .map((m) => ({ market: m, grip: categoryGrip(game, firm.id, m.id) }))
    .filter(({ market, grip }) => grip < 0.62 && canLaunch(game, firm.id, market.id).ok)
    .sort((a, b) => b.grip - a.grip)[0];
  if (room && firm.cash > launchCost(game, room.market.id, firm.id) * 2.4 && rng() < 0.55) {
    launchBrand(game, firm.id, room.market.id);
    firm.cooldown = 8 + rng() * 8;
    return;
  }

  // Shop. Score candidates by value per dollar, with a nudge toward markets
  // this firm already understands. In a big world the candidate list is
  // bounded — everything in markets this firm is already in, plus a sample of
  // the rest — so a hundred bots shopping cannot stall a server tick.
  let best = null;
  let bestScore = 0;
  for (const brand of shoppingList(game, firm, mine, rng)) {
    const check = canAcquire(game, firm.id, brand.id);
    if (!check.ok) continue;
    // Skip the wreckage. A brand with no equity and no share costs overhead
    // from the day it lands and earns nothing — buying it is how a
    // conglomerate talks itself into bankruptcy.
    if (brand.equity < 14 || brand.share < 0.08) continue;
    // Integration strain: every brand already on the books makes the next
    // deal harder to justify, so a leader's buying spree slows as it grows.
    const restraint = Math.max(0.18, 0.6 - 0.025 * mine.length);
    if (check.price > buyingPower(game, firm.id) * restraint) continue;
    // Strongly prefer consolidating a category this firm already holds.
    const familiar = 1 + 2.5 * categoryGrip(game, firm.id, brand.marketId);
    const score = ((brand.profit + brand.revenue * 0.4) / check.price) * familiar
      * (0.8 + 0.4 * rng());
    if (score > bestScore) {
      bestScore = score;
      best = brand.id;
    }
  }
  if (best !== null) {
    acquire(game, firm.id, best);
    firm.cooldown = 14 + rng() * 16; // Deals take time to digest.
  } else {
    firm.cooldown = 5 + rng() * 5;
  }
}

/** Bought-out firms, monopolies and last-one-standing. */
export function resolveOutcomes(game) {
  // A firm with no brands is finished only once it can no longer buy its way
  // back in — cash alone is not a business.
  const cheapest = game.brands.reduce(
    (min, b) => Math.min(min, brandValue(game, b.id) * (1 + INDEPENDENT_PREMIUM)), Infinity);
  for (const firm of game.firms) {
    if (!firm.boughtOut && ownedBrands(game, firm.id).length === 0
        && buyingPower(game, firm.id) < cheapest) {
      firm.boughtOut = true;
      logEvent(game, `${firm.name} has been broken up.`, firm.color);
    }
  }
  const alive = game.firms.filter((f) => !f.boughtOut);
  for (const firm of alive) {
    if (economyShare(game, firm.id) >= MONOPOLY_SHARE) {
      game.over = true;
      game.winner = firm.id;
      game.outcome = 'monopoly';
    }
  }
  // Your own collapse is reported as a buyout even when it also happens to
  // leave one rival standing — it is the more specific ending.
  if (!game.over && game.firms[0].boughtOut) {
    game.over = true;
    game.winner = standings(game).find((r) => !r.boughtOut)?.id ?? null;
    game.outcome = 'bought-out';
  }
  if (!game.over && alive.length <= 1) {
    game.over = true;
    game.winner = alive.length ? alive[0].id : null;
    game.outcome = 'last-standing';
  }
  // Time called: whoever holds the most of the economy takes the round.
  if (!game.over && game.roundLength && game.time >= game.roundLength) {
    const leader = standings(game).find((row) => !row.boughtOut);
    game.over = true;
    game.winner = leader ? leader.id : null;
    game.outcome = 'time';
  }
  return game;
}

/** One scoreboard row per conglomerate, best first. */
export function standings(game) {
  return game.firms
    .map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      human: f.human,
      boughtOut: f.boughtOut,
      cash: f.cash,
      debt: f.debt,
      netWorth: netWorth(game, f.id),
      share: economyShare(game, f.id),
      profit: firmProfit(game, f.id),
      brands: ownedBrands(game, f.id).length,
    }))
    .sort((a, b) => b.share - a.share || b.netWorth - a.netWorth);
}
