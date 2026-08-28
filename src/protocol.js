// The wire format between a Monopolis world and whatever is drawing it.
//
// One rule shapes this file: the browser never reads the simulation directly.
// It renders a *snapshot*, and it changes the world only by submitting a
// *command*. Single-player builds snapshots from a local game object;
// multiplayer receives the very same shape over a socket. The renderer cannot
// tell the difference, so the offline page and a hundred-player server share
// one interface — and a client can never mutate authoritative state, because
// it has none.
//
// Snapshots are also scoped. A hundred-player world holds hundreds of brands,
// and shipping all of them to every client several times a second is both
// wasteful and pointless: you can only look at a few markets at once. Every
// snapshot carries a summary of every market (enough to draw its share bar)
// and full brand detail only for the markets a client has subscribed to.

import {
  brandsIn, ownedBrands, categoryGrip, effectivePrice, launchMomentum,
  economyShare, firmProfit, netWorth, buyingPower, creditLimit, marketDemand,
  brandValue, acquisitionPrice, canAcquire, canLaunch, canRunAction, isNeglected,
  launchCost, standings, activeFirms, winShare, timeLeft,
  setPrice, setMarketing, runAction, launchBrand, acquire, divest,
  ACTIONS, MAX_EQUITY, MIN_PRICE, MAX_PRICE,
} from './monopolis.js';

/** Numbers on the wire are rounded — nobody can see the fourth decimal. */
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;

/** The commands a client may submit, and the arguments each one takes. */
export const COMMANDS = {
  price: { args: ['brand', 'value'] },
  marketing: { args: ['brand', 'value'] },
  action: { args: ['key', 'target'] },
  launch: { args: ['market'] },
  acquire: { args: ['brand'] },
  divest: { args: ['brand'] },
};

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

/**
 * One market's live row. Static facts (name, elasticity, unit cost) travel
 * once in `worldInfo`; this is only what changes, and the ownership bar is
 * aggregated per owner rather than per brand — a fifty-market world sends the
 * same handful of numbers whether a market holds three brands or six.
 */
function marketRow(game, market, firmId) {
  const byOwner = new Map();
  for (const brand of brandsIn(game, market)) {
    const key = brand.owner === null ? -1 : brand.owner;
    byOwner.set(key, (byOwner.get(key) ?? 0) + brand.share);
  }
  const slices = [...byOwner.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([owner, share]) => [owner, r3(share)]);

  const launch = canLaunch(game, firmId, market.id);
  return {
    id: market.id,
    d: r2(marketDemand(game, market)),
    b: r2(market.buzz),
    g: r3(categoryGrip(game, firmId, market.id)),
    lc: Math.round(launchCost(game, market.id)),
    l: launch.ok ? 1 : 0,
    lr: launch.ok ? undefined : launch.reason,
    s: slices,
  };
}

/** Full detail for one brand — only sent for subscribed markets. */
function brandDetail(game, brand, firmId) {
  const mine = brand.owner === firmId;
  const check = mine ? null : canAcquire(game, firmId, brand.id);
  return {
    id: brand.id,
    name: brand.name,
    market: brand.marketId,
    owner: brand.owner,
    ownerName: brand.owner === null ? null : game.firms[brand.owner].name,
    color: brand.owner === null ? null : game.firms[brand.owner].color,
    mine,
    price: r2(brand.price),
    paid: r2(effectivePrice(game, brand)),
    promo: game.time < brand.promoUntil,
    marketing: r2(brand.marketing),
    equity: Math.round(brand.equity),
    share: r3(brand.share),
    revenue: r2(brand.revenue),
    profit: r2(brand.profit),
    // The full line: what came in, and where it went. A player who cannot see
    // why a brand loses money can only guess at what to change.
    cogs: r2(brand.units * game.markets[brand.marketId].unitCost),
    ads: r2(brand.marketing),
    overhead: r2(brand.revenue - brand.units * game.markets[brand.marketId].unitCost
      - brand.marketing - brand.profit),
    value: Math.round(brandValue(game, brand.id)),
    launching: brand.born > 0 && launchMomentum(game, brand) > 1.05,
    weak: brand.owner !== null && isNeglected(game, brand.id),
    takeover: mine ? null : Math.round(acquisitionPrice(game, firmId, brand.id)),
    canBuy: mine ? false : check.ok,
    buyReason: mine || check.ok ? null : check.reason,
  };
}

/**
 * Build the view of `game` belonging to `firmId`.
 *
 * `view.rows` is the set of markets the client is actually displaying, and
 * `view.detail` the ones it has open; a client asks for what it can see, not
 * for the world. Markets the firm owns brands in are always included, so you
 * never lose sight of your own position while browsing elsewhere. Passing
 * nothing returns everything, which is what single-player wants.
 */
export function snapshot(game, firmId, view = {}) {
  const { rows: visible = null, detail: opened = [] } =
    Array.isArray(view) ? { detail: view } : view;
  const firm = game.firms[firmId];
  const rows = standings(game);
  const rank = rows.findIndex((row) => row.id === firmId);

  const shown = visible === null ? null : new Set(visible);
  if (shown) {
    for (const brand of game.brands) if (brand.owner === firmId) shown.add(brand.marketId);
    for (const id of opened) shown.add(id);
  }

  const detail = [];
  for (const marketId of new Set(opened)) {
    const market = game.markets[marketId];
    if (!market) continue;
    for (const brand of brandsIn(game, market)) detail.push(brandDetail(game, brand, firmId));
  }

  const cooldowns = {};
  for (const key of Object.keys(ACTIONS)) {
    const ready = firm?.actionReady?.[key] ?? 0;
    cooldowns[key] = Math.max(0, r2(ready - game.time));
  }

  return {
    t: r2(game.time),
    you: firm && {
      id: firm.id,
      name: firm.name,
      color: firm.color,
      cash: Math.round(firm.cash),
      debt: Math.round(firm.debt),
      credit: Math.round(Math.max(0, creditLimit(game, firmId) - firm.debt)),
      power: Math.round(buyingPower(game, firmId)),
      worth: Math.round(netWorth(game, firmId)),
      profit: r2(firmProfit(game, firmId)),
      share: r3(economyShare(game, firmId)),
      brands: ownedBrands(game, firmId).length,
      rank: rank + 1,
      out: firm.boughtOut || firm.gone,
      cooldowns,
    },
    population: {
      seats: game.seats ?? game.firms.length,
      active: activeFirms(game).length,
      humans: game.firms.filter((f) => f.human && !f.gone).length,
    },
    goal: r3(winShare(game)),
    left: timeLeft(game) === null ? null : Math.round(timeLeft(game)),
    over: game.over,
    outcome: game.outcome,
    winner: game.winner === null ? null : game.firms[game.winner]?.name ?? null,
    leaders: rows.slice(0, 10).map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      share: r3(row.share),
      worth: Math.round(row.netWorth),
      you: row.id === firmId,
      out: row.boughtOut,
    })),
    markets: game.markets
      .filter((m) => shown === null || shown.has(m.id))
      .map((m) => marketRow(game, m, firmId)),
    detail,
    log: game.log.slice(0, 10).map((e) => ({ t: Math.round(e.time), text: e.text, color: e.color })),
  };
}

/**
 * Static facts a client needs once per world rather than several times a
 * second: the market table, the firm roster and the rules of the actions.
 */
export function worldInfo(game) {
  return {
    seats: game.seats ?? game.firms.length,
    goal: r3(winShare(game)),
    actions: ACTIONS,
    priceRange: [MIN_PRICE, MAX_PRICE],
    maxEquity: MAX_EQUITY,
    markets: game.markets.map((m) => ({
      id: m.id,
      name: m.name,
      key: m.key,
      elasticity: m.elasticity,
      adPower: m.adPower,
      unitCost: m.unitCost,
      baseDemand: m.baseDemand,
    })),
    firms: game.firms.map((f) => ({ id: f.id, name: f.name, color: f.color, human: f.human })),
  };
}

/** Firms that joined (or were renamed) after the client's cached roster. */
export function firmRoster(game, since = 0) {
  return game.firms.slice(since)
    .map((f) => ({ id: f.id, name: f.name, color: f.color, human: f.human }));
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Apply one client command to `game` on behalf of `firmId`. Every command is
 * re-checked against the engine's own rules here, so a hand-rolled client
 * gains nothing by lying: it can only ask, and the world decides.
 */
export function applyCommand(game, firmId, command) {
  if (!command || typeof command !== 'object') return { ok: false, reason: 'malformed' };
  const firm = game.firms[firmId];
  if (!firm || firm.gone) return { ok: false, reason: 'not seated' };
  if (game.over) return { ok: false, reason: 'round over' };

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const brand = (id) => (Number.isInteger(id) && game.brands[id] ? game.brands[id] : null);

  switch (command.type) {
    case 'price': {
      const b = brand(command.brand);
      const value = num(command.value);
      if (!b || value === null) return { ok: false, reason: 'malformed' };
      return { ok: setPrice(game, firmId, b.id, value) };
    }
    case 'marketing': {
      const b = brand(command.brand);
      const value = num(command.value);
      if (!b || value === null) return { ok: false, reason: 'malformed' };
      return { ok: setMarketing(game, firmId, b.id, value) };
    }
    case 'action': {
      if (!Object.hasOwn(ACTIONS, command.key)) return { ok: false, reason: 'no such play' };
      const target = command.target;
      if (!Number.isInteger(target)) return { ok: false, reason: 'malformed' };
      const check = canRunAction(game, firmId, command.key, target);
      if (!check.ok) return check;
      return runAction(game, firmId, command.key, target);
    }
    case 'launch': {
      if (!Number.isInteger(command.market) || !game.markets[command.market]) {
        return { ok: false, reason: 'no such market' };
      }
      return launchBrand(game, firmId, command.market);
    }
    case 'acquire': {
      const b = brand(command.brand);
      if (!b) return { ok: false, reason: 'malformed' };
      return acquire(game, firmId, b.id);
    }
    case 'divest': {
      const b = brand(command.brand);
      if (!b) return { ok: false, reason: 'malformed' };
      return divest(game, firmId, b.id);
    }
    default:
      return { ok: false, reason: 'unknown command' };
  }
}
