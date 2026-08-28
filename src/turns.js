// The turn layer.
//
// Monopolis's economy is a continuous simulation, but a continuous *game* is
// the wrong shape for what this is. A person on a phone cannot out-click a bot
// that decides ten times a second, and a game you play by racing a menu is not
// a strategy game — it is an incremental one wearing a suit. So the economy
// still runs continuously; the *decisions* do not.
//
// A game is a run of quarters. In each one you have a small budget of actions
// — the whole tension is that you cannot do everything you can see — and then
// you end the quarter. Your rivals commit their moves for the same quarter,
// the economy runs forward, and you get a report of what your decisions
// actually did. No clock, no cooldowns in seconds, nothing to out-tap.

import {
  createGame, tick, computeShares, standings, ownedBrands, brandsIn, economyShare,
  firmProfit, netWorth, activeFirms, addBrand, logEvent, canAcquire, acquire,
  canLaunch, launchBrand, canRunAction, runAction, canInvest, invest,
  setPrice, setMarketing, divest, estimateAction, categoryGrip, brandTier,
  isNeglected, capabilityLevel, launchCost, clamp,
  MARKET_TEMPLATES, REGIONS, CAPABILITIES, ACTIONS, MIN_PRICE, MAX_PRICE,
} from './monopolis.js';

/** Seconds of economy simulated per quarter, and how finely it is stepped. */
export const QUARTER_SECONDS = 40;
const STEP = 0.25;

/** A game is this many quarters unless somebody monopolises first. */
export const TOTAL_QUARTERS = 16;

/** Decisions you may commit per quarter. This is the whole game's tension. */
export const ACTIONS_PER_TURN = 3;

/** What each decision costs out of that budget. */
export const ACTION_COSTS = {
  campaign: 1,
  launch: 1,
  invest: 1,
  acquire: 2,
  divest: 1,
};

/** A new market opens this often, so the board grows as you do. */
export const EXPANSION_EVERY = 3;

/** The board a game starts on: small enough to hold in your head. */
export const STARTING_MARKETS = 4;

/**
 * Start a game. Deliberately small — four markets, a handful of rivals, one
 * brand each. A first turn where you can read every option in ten seconds is
 * worth more than a big world you cannot parse.
 */
export function startGame({ rivals = 3, rng = Math.random, quarters = TOTAL_QUARTERS } = {}) {
  const game = createGame({
    players: rivals + 1,
    markets: STARTING_MARKETS,
    roundSeconds: 0, // The turn counter ends the game, not a clock.
    rng,
  });
  game.turnBased = true; // The economy runs on; the decisions do not.
  game.quarter = 1;
  game.quarters = quarters;
  game.actionsLeft = ACTIONS_PER_TURN;
  game.spent = [];
  game.report = null;
  game.rng = rng;
  computeShares(game);
  return game;
}

/** Whether the player can still commit a decision of this kind this quarter. */
export function canSpend(game, kind) {
  const cost = ACTION_COSTS[kind] ?? 1;
  if (game.over) return { ok: false, reason: 'the game is over' };
  if (game.actionsLeft < cost) {
    return { ok: false, reason: game.actionsLeft === 0 ? 'no decisions left this quarter' : 'not enough decisions left' };
  }
  return { ok: true, cost };
}

function spend(game, kind) {
  game.actionsLeft -= ACTION_COSTS[kind] ?? 1;
  game.spent.push(kind);
}

// ---------------------------------------------------------------------------
// The moves a player can make in a quarter
// ---------------------------------------------------------------------------

/**
 * Standing orders — price and marketing budget — are free. They are how you
 * run what you already own, not decisions competing with expansion, and
 * charging for them would just punish players for paying attention.
 */
export function order(game, firmId, brandId, { price, marketing } = {}) {
  let changed = false;
  if (typeof price === 'number') changed = setPrice(game, firmId, brandId, clamp(price, MIN_PRICE, MAX_PRICE)) || changed;
  if (typeof marketing === 'number') changed = setMarketing(game, firmId, brandId, marketing) || changed;
  return { ok: changed };
}

export function playCampaign(game, firmId, key, targetId) {
  const budget = canSpend(game, 'campaign');
  if (!budget.ok) return budget;
  const check = canRunAction(game, firmId, key, targetId);
  if (!check.ok) return check;
  const result = runAction(game, firmId, key, targetId);
  if (result.ok) spend(game, 'campaign');
  return result;
}

export function playLaunch(game, firmId, marketId) {
  const budget = canSpend(game, 'launch');
  if (!budget.ok) return budget;
  const result = launchBrand(game, firmId, marketId);
  if (result.ok) spend(game, 'launch');
  return result;
}

export function playAcquire(game, firmId, brandId) {
  const budget = canSpend(game, 'acquire');
  if (!budget.ok) return budget;
  const result = acquire(game, firmId, brandId);
  if (result.ok) spend(game, 'acquire');
  return result;
}

export function playDivest(game, firmId, brandId) {
  const budget = canSpend(game, 'divest');
  if (!budget.ok) return budget;
  const result = divest(game, firmId, brandId);
  if (result.ok) spend(game, 'divest');
  return result;
}

export function playInvest(game, firmId, key) {
  const budget = canSpend(game, 'invest');
  if (!budget.ok) return budget;
  const result = invest(game, firmId, key);
  if (result.ok) spend(game, 'invest');
  return result;
}

// ---------------------------------------------------------------------------
// Rivals, deciding once per quarter like everybody else
// ---------------------------------------------------------------------------

/**
 * A rival's quarter: set standing orders, then commit up to the same number of
 * decisions you get. They are held to the identical budget, which is what
 * stops the old problem of bots acting continuously while a person navigates.
 */
export function rivalTurn(game, firm, rng = Math.random) {
  const mine = ownedBrands(game, firm.id);
  let budget = ACTIONS_PER_TURN;
  const afford = (kind) => budget >= (ACTION_COSTS[kind] ?? 1);
  const take = (kind) => { budget -= ACTION_COSTS[kind] ?? 1; };

  // Standing orders: price toward what the category rewards, and fund
  // marketing out of revenue rather than out of hope.
  for (const brand of mine) {
    const market = game.markets[brand.marketId];
    const grip = categoryGrip(game, firm.id, market.id);
    const spread = 0.94 + 0.12 * ((brand.id % 5) / 4);
    const wanted = clamp((1.55 - 0.22 * market.elasticity) * spread, MIN_PRICE, MAX_PRICE);
    brand.price += clamp(wanted - brand.price, -0.12, 0.12);
    const hunger = grip > 0.45 ? 1.4 : grip < 0.18 ? 0.5 : 1;
    const target = clamp(brand.revenue * 0.2 * hunger, 0.5, Math.max(0.5, brand.revenue * 0.35));
    brand.marketing += clamp(target - brand.marketing, -2, 2);
    brand.marketing = clamp(brand.marketing, 0, 40);
  }
  computeShares(game);

  // Back in the game: a firm with nothing left founds something.
  if (mine.length === 0) {
    const opening = game.markets
      .map((market) => ({ market, check: canLaunch(game, firm.id, market.id) }))
      .filter(({ check }) => check.ok)
      .sort((a, b) => a.check.cost - b.check.cost)[0];
    if (opening) { launchBrand(game, firm.id, opening.market.id); take('launch'); }
    return;
  }

  // Build the firm when there is cash spare and a ladder that suits it.
  if (afford('invest') && firm.cash > 260) {
    const revenue = mine.reduce((sum, b) => sum + b.revenue, 0);
    const ads = mine.reduce((sum, b) => sum + b.marketing, 0);
    const wants = mine.length >= 5 ? 'distribution'
      : revenue > 26 ? 'research'
        : ads > revenue * 0.25 ? 'creative' : 'dealmaking';
    if (canInvest(game, firm.id, wants).ok && rng() < 0.7) {
      invest(game, firm.id, wants);
      take('invest');
    }
  }

  // A campaign, where one is worth running.
  if (afford('campaign')) {
    const options = [];
    for (const brand of mine) {
      for (const key of Object.keys(ACTIONS)) {
        const target = ACTIONS[key].scope === 'market' ? brand.marketId : brand.id;
        if (!canRunAction(game, firm.id, key, target).ok) continue;
        const estimate = estimateAction(game, firm.id, key, target);
        if (estimate?.worthwhile) options.push({ key, target, gain: estimate.gain });
      }
    }
    const best = options.sort((a, b) => b.gain - a.gain)[0];
    if (best) { runAction(game, firm.id, best.key, best.target); take('campaign'); }
  }

  // Expansion: buy where it is cheap and good, otherwise found something.
  if (afford('acquire')) {
    const candidates = game.brands
      .filter((brand) => brand.owner !== firm.id && brand.equity >= 14 && brand.share >= 0.08)
      .map((brand) => ({ brand, check: canAcquire(game, firm.id, brand.id) }))
      .filter(({ check }) => check.ok && check.price < firm.cash * 0.7)
      .map((option) => ({
        ...option,
        score: (option.brand.profit + option.brand.revenue * 0.4)
          * (1 + 2 * categoryGrip(game, firm.id, option.brand.marketId)) / option.check.price,
      }))
      .sort((a, b) => b.score - a.score);
    if (candidates.length && rng() < 0.85) {
      acquire(game, firm.id, candidates[0].brand.id);
      take('acquire');
    }
  }
  if (afford('launch') && firm.cash > 320) {
    const room = game.markets
      .map((market) => ({ market, grip: categoryGrip(game, firm.id, market.id) }))
      .filter(({ market, grip }) => grip < 0.6 && canLaunch(game, firm.id, market.id).ok)
      .sort((a, b) => b.grip - a.grip)[0];
    if (room && rng() < 0.6) { launchBrand(game, firm.id, room.market.id); take('launch'); }
  }
}

// ---------------------------------------------------------------------------
// Resolving a quarter
// ---------------------------------------------------------------------------

function snapshotFor(game, firmId) {
  return {
    share: economyShare(game, firmId),
    profit: firmProfit(game, firmId),
    cash: game.firms[firmId].cash,
    worth: netWorth(game, firmId),
    brands: ownedBrands(game, firmId).length,
  };
}

/** Open a new market as the economy grows, so the board expands with you. */
function openNewMarket(game) {
  const index = game.markets.length;
  const template = MARKET_TEMPLATES[index % MARKET_TEMPLATES.length];
  const round = Math.floor(index / MARKET_TEMPLATES.length);
  const name = round === 0 ? template.name
    : `${template.name} · ${REGIONS[(round - 1) % REGIONS.length]}`;
  const market = {
    id: index,
    key: template.key,
    name,
    baseDemand: template.demand,
    elasticity: template.elasticity,
    adPower: template.adPower,
    unitCost: template.cost,
    buzz: 0,
    categorySpend: 0,
    reserve: round === 0 ? [...(template.reserve ?? [])] : [],
    brandIds: [],
  };
  game.markets.push(market);
  for (let i = 0; i < 3; i++) addBrand(game, market.id, { rng: game.rng ?? Math.random });
  computeShares(game);
  logEvent(game, `A new market opens: ${name}.`, '#d9a441');
  return market;
}

/**
 * End the quarter: rivals commit their moves, the economy runs forward, and
 * the result comes back as a report rather than as numbers that quietly moved
 * while you were looking somewhere else.
 */
export function endTurn(game, rng = game.rng ?? Math.random) {
  if (game.over) return game.report;

  const before = new Map(game.firms.map((firm) => [firm.id, snapshotFor(game, firm.id)]));
  const logMark = game.log.length;

  for (const firm of game.firms) {
    if (firm.id !== 0 && !firm.boughtOut && !firm.gone) rivalTurn(game, firm, rng);
  }

  const steps = Math.round(QUARTER_SECONDS / STEP);
  for (let i = 0; i < steps && !game.over; i++) tick(game, STEP, rng);

  const quarterEvents = game.log.slice(0, Math.max(0, game.log.length - logMark));

  game.quarter += 1;
  game.actionsLeft = ACTIONS_PER_TURN;
  game.spent = [];

  if (!game.over && game.quarter % EXPANSION_EVERY === 1 && game.quarter > 1
      && game.markets.length < 12) {
    openNewMarket(game);
  }

  if (!game.over && game.quarter > game.quarters) {
    game.over = true;
    game.outcome = 'time';
    game.winner = standings(game).find((row) => !row.boughtOut)?.id ?? null;
  }

  const you = snapshotFor(game, 0);
  const was = before.get(0);
  game.report = {
    quarter: game.quarter - 1,
    you: {
      share: you.share, shareDelta: you.share - was.share,
      profit: you.profit, profitDelta: you.profit - was.profit,
      cash: you.cash, cashDelta: you.cash - was.cash,
      worth: you.worth, worthDelta: you.worth - was.worth,
      brands: you.brands, brandsDelta: you.brands - was.brands,
    },
    rivals: game.firms
      .filter((firm) => firm.id !== 0 && !firm.gone)
      .map((firm) => {
        const now = snapshotFor(game, firm.id);
        const then = before.get(firm.id);
        return {
          id: firm.id,
          name: firm.name,
          color: firm.color,
          share: now.share,
          shareDelta: now.share - then.share,
          brandsDelta: now.brands - then.brands,
        };
      })
      .sort((a, b) => b.share - a.share),
    events: quarterEvents.map((entry) => ({ text: entry.text, color: entry.color })),
  };
  return game.report;
}

/** Everything the interface needs about where the game stands. */
export function turnState(game) {
  return {
    quarter: game.quarter,
    quarters: game.quarters,
    actionsLeft: game.actionsLeft,
    actionsPerTurn: ACTIONS_PER_TURN,
    spent: [...game.spent],
    over: game.over,
    outcome: game.outcome,
    winner: game.winner === null ? null : game.firms[game.winner]?.name ?? null,
    report: game.report,
  };
}
