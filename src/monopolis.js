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

/** Fraction of equity lost per second when nobody is spending. Brands rot. */
export const EQUITY_DECAY = 0.022;

/** Category buzz gained per $1/s of category marketing. */
export const BUZZ_GAIN = 0.05;
export const BUZZ_DECAY = 0.06;

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
export const BRAND_OVERHEAD = 0.45;
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
export const SOLO_PENALTY = 1.15;

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
 * A brand starved below this share of its own market is "neglected" and can
 * be bought out from under a healthy owner. It is the lever that makes
 * raiding something you earn: beat a brand down on price and marketing first,
 * then take it.
 */
export const NEGLECT_SHARE = 0.15;

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
 * One-tap plays, for when there is no time to nurse a slider: an ad blitz
 * buys equity outright, a promotion discounts a brand for a while, and a
 * category push spikes a whole market's demand.
 */
export const ACTIONS = {
  blitz: { label: 'Ad blitz', cost: 55, cooldown: 25, equity: 16, scope: 'brand' },
  promo: { label: 'Promotion', cost: 30, cooldown: 20, discount: 0.78, duration: 18, scope: 'brand' },
  push: { label: 'Category push', cost: 65, cooldown: 35, buzz: 0.55, scope: 'market' },
};

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
    key: 'coffee', name: 'Coffee', demand: 22, elasticity: 1.5, adPower: 1.25, cost: 0.42,
    brands: ['Ashgrove Roasters', 'Bean & Bell', 'Cardinal Coffee', 'Nocturne Brew'],
    reserve: ['Ember & Oat', 'Hollow Cup', 'Dayrise Coffee'],
  },
  {
    key: 'streaming', name: 'Streaming', demand: 16, elasticity: 1.1, adPower: 1.45, cost: 0.30,
    brands: ['Lumen+', 'Kestrel TV', 'Nightplay', 'Orbit Originals'],
    reserve: ['Halcyon Play', 'Vireo', 'Second Reel'],
  },
  {
    key: 'airlines', name: 'Airlines', demand: 12, elasticity: 2.4, adPower: 0.75, cost: 0.68,
    brands: ['Corvid Air', 'Trellis Airways', 'Skyline Jet'],
    reserve: ['Meridian Air', 'Wing & Wold', 'Pelagic Airways'],
  },
  {
    key: 'solar', name: 'Solar', demand: 10, elasticity: 1.7, adPower: 0.95, cost: 0.55,
    brands: ['Helio Works', 'Bright Harvest', 'Sunfall Energy'],
    reserve: ['Dawnline Solar', 'Copperfield Power', 'Zenith Array'],
  },
  {
    key: 'fashion', name: 'Fashion', demand: 18, elasticity: 1.2, adPower: 1.6, cost: 0.38,
    brands: ['Marlowe & Vane', 'Petra Label', 'Sable Row', 'Ivy Grade'],
    reserve: ['Vellum Atelier', 'Cross & Quiet', 'Norwood Studio'],
  },
  {
    key: 'grocery', name: 'Grocery', demand: 28, elasticity: 2.1, adPower: 0.7, cost: 0.74,
    brands: ['Fairmount Foods', 'Larkin Market', 'Provisions Co.'],
    reserve: ['Bramble Grocers', 'Ordinary Goods', 'Hearth Pantry'],
  },
  {
    key: 'chips', name: 'Semiconductors', demand: 9, elasticity: 0.9, adPower: 0.6, cost: 0.46,
    brands: ['Silica Dynamics', 'Nexon Micro', 'Quartzline'],
    reserve: ['Ferrite Labs', 'Halide Systems', 'Kelvin Micro'],
  },
  {
    key: 'fitness', name: 'Fitness', demand: 14, elasticity: 1.8, adPower: 1.35, cost: 0.44,
    brands: ['Ironhaus', 'Pulse Studios', 'Ridgeline Gyms'],
    reserve: ['Rowhouse', 'Granite Athletic', 'Third Mile'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
export function createGame({ rivals = 3, markets = 6, rng = Math.random } = {}) {
  const chosen = MARKET_TEMPLATES.slice(0, clamp(markets, 2, MARKET_TEMPLATES.length));
  const game = {
    time: 0,
    markets: [],
    brands: [],
    firms: [],
    log: [],
    over: false,
    winner: null,
    outcome: null,
  };

  for (const [i, tpl] of chosen.entries()) {
    game.markets.push({
      id: i,
      key: tpl.key,
      name: tpl.name,
      baseDemand: tpl.demand,
      elasticity: tpl.elasticity,
      adPower: tpl.adPower,
      unitCost: tpl.cost,
      buzz: 0,
      categorySpend: 0, // Set by whoever is funding category ads this second.
      reserve: [...(tpl.reserve ?? [])], // Names available to new entrants.
      brandIds: [],
    });
    for (const name of tpl.brands) {
      const brand = {
        id: game.brands.length,
        name,
        marketId: i,
        owner: null,
        price: clamp(jitter(1, 0.12, rng), MIN_PRICE, MAX_PRICE),
        equity: jitter(38, 12, rng),
        marketing: 2,
        share: 0,
        born: 0,
        promoUntil: 0,
        lockedUntil: 0,
        units: 0,
        revenue: 0,
        profit: 0,
      };
      game.brands.push(brand);
      game.markets[i].brandIds.push(brand.id);
    }
  }

  const names = [...RIVAL_NAMES];
  for (let i = 0; i <= rivals; i++) {
    game.firms.push({
      id: i,
      name: i === 0 ? 'Your Holdings' : names.splice(Math.floor(rng() * names.length), 1)[0],
      color: FIRM_COLORS[i % FIRM_COLORS.length],
      human: i === 0,
      cash: STARTING_CASH,
      debt: 0,
      boughtOut: false,
      cooldown: 0, // Seconds until this AI considers another acquisition.
      actionReady: {}, // action key -> the time it can next be used.
    });
  }

  // Seed each conglomerate with two brands in different markets, so everyone
  // opens with a choice about where to concentrate.
  for (let round = 0; round < SEED_BRANDS; round++) {
    for (const firm of game.firms) {
      const owned = new Set(ownedBrands(game, firm.id).map((b) => b.marketId));
      const free = game.brands.filter((b) => b.owner === null);
      const fresh = free.filter((b) => !owned.has(b.marketId));
      const pool = fresh.length ? fresh : free;
      if (pool.length === 0) break;
      pool[Math.floor(rng() * pool.length)].owner = firm.id;
    }
  }

  computeShares(game);
  return game;
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

export function attraction(game, brand) {
  const market = game.markets[brand.marketId];
  return Math.max(1, brand.equity) * Math.pow(effectivePrice(game, brand), -market.elasticity);
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
      const gross = brand.units * (price - market.unitCost);
      const stable = brand.owner === null ? 1 : stableSize(game, brand.owner, market.id);
      const overhead = brand.owner === null ? 0
        : BRAND_OVERHEAD * costPressure(game) * scaleFactor(game, brand.owner)
          * (market.baseDemand / OVERHEAD_REFERENCE_DEMAND)
          * Math.pow(stable, -CATEGORY_SYNERGY);
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
  const premium = brand.owner === null ? INDEPENDENT_PREMIUM : HOSTILE_PREMIUM;
  return brandValue(game, brandId) * (1 + premium);
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

/** A brand nobody is defending — starved of share in its own market. */
export function isNeglected(game, brandId) {
  return game.brands[brandId].share < NEGLECT_SHARE;
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
  brand.owner = buyerId;
  brand.lockedUntil = game.time + INTEGRATION_LOCK;
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
export function launchCost(game, marketId) {
  return LAUNCH_BASE_COST + game.markets[marketId].baseDemand * LAUNCH_COST_PER_DEMAND;
}

export function canLaunch(game, firmId, marketId) {
  const firm = game.firms[firmId];
  const market = game.markets[marketId];
  const cost = market ? launchCost(game, marketId) : 0;
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
  // erodes what you already have.
  for (const brand of game.brands) {
    const market = game.markets[brand.marketId];
    const gain = EQUITY_GAIN * market.adPower * brand.marketing
      * launchMomentum(game, brand) * (1 - brand.equity / MAX_EQUITY);
    brand.equity = clamp(brand.equity + (gain - EQUITY_DECAY * brand.equity) * dt, 1, MAX_EQUITY);
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
 * Rival behaviour, in three moves: price toward the margin its market
 * rewards, fund marketing it can afford, and shop for brands when cash
 * allows. Rivals prefer cheap independents but will raid a distressed
 * conglomerate — including yours.
 */
export function runAi(game, firm, dt, rng = Math.random) {
  const mine = ownedBrands(game, firm.id);
  if (mine.length === 0) return;

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
  if (room && firm.cash > launchCost(game, room.market.id) * 2.4 && rng() < 0.55) {
    launchBrand(game, firm.id, room.market.id);
    firm.cooldown = 8 + rng() * 8;
    return;
  }

  // Shop. Score candidates by value per dollar, with a nudge toward markets
  // this firm already understands.
  let best = null;
  let bestScore = 0;
  for (const brand of game.brands) {
    const check = canAcquire(game, firm.id, brand.id);
    if (!check.ok) continue;
    // Skip the wreckage. A brand with no equity and no share costs overhead
    // from the day it lands and earns nothing — buying it is how a
    // conglomerate talks itself into bankruptcy.
    if (brand.equity < 14 || brand.share < 0.08) continue;
    // Integration strain: every brand already on the books makes the next
    // deal harder to justify, so a leader's buying spree slows as it grows.
    const restraint = Math.max(0.12, 0.45 - 0.025 * mine.length);
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
    firm.cooldown = 26 + rng() * 24; // Deals take time to digest.
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
