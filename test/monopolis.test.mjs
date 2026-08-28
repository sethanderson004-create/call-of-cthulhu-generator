import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, tick, computeShares, attraction, marketDemand, brandsIn,
  ownedBrands, firmRevenue, firmProfit, economyShare,
  brandValue, portfolioValue, netWorth, creditLimit, buyingPower,
  acquisitionPrice, canAcquire, acquire, divest, borrow, repay, inDistress,
  isNeglected, isVulnerable, categoryGrip,
  setPrice, setMarketing, setCategorySpend, runAi, resolveOutcomes, standings,
  clamp, logEvent,
  MIN_PRICE, MAX_PRICE, MAX_EQUITY, MONOPOLY_SHARE, STARTING_CASH,
  HOSTILE_PREMIUM, INDEPENDENT_PREMIUM, VALUE_FLOOR, CREDIT_RATIO,
  BRAND_OVERHEAD, EQUITY_DECAY, MARKET_TEMPLATES, SEED_BRANDS, costPressure,
  INFLATION_PERIOD, MAX_INFLATION,
  OPENING_GRACE, NEGLECT_SHARE, CATEGORY_EDGE, INTEGRATION_LOCK, SHELTERED_SIZE,
  scaleFactor, OVERHEAD_REFERENCE_DEMAND, launchBrand, canLaunch, launchCost,
  runAction, canRunAction, effectivePrice, launchMomentum, ACTIONS, stableSize,
  CATEGORY_SYNERGY,
  LAUNCH_EQUITY, LAUNCH_WINDOW, MAX_BRANDS_PER_MARKET, SOLO_PENALTY,
} from '../src/monopolis.js';

const half = () => 0.5;

/** A deterministic, well-spread PRNG for whole-game simulations. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

// A small deterministic economy. Two firms, because a lone survivor ends the
// game on the first tick.
function tinyGame() {
  return createGame({ rivals: 1, markets: 3, rng: half });
}

/** Skip the opening grace period, during which nothing can be bought. */
function openMarkets(game) {
  game.time = OPENING_GRACE;
  return game;
}

test('createGame builds markets, brands and firms with clean starting state', () => {
  const game = createGame({ rivals: 3, markets: 5, rng: seq([0.2, 0.7, 0.45, 0.9, 0.1, 0.6]) });
  assert.equal(game.markets.length, 5);
  assert.equal(game.firms.length, 4);
  assert.equal(game.firms[0].human, true);
  assert.equal(new Set(game.firms.map((f) => f.name)).size, 4);
  for (const firm of game.firms) {
    assert.equal(firm.cash, STARTING_CASH);
    assert.equal(firm.debt, 0);
    assert.equal(ownedBrands(game, firm.id).length, SEED_BRANDS);
  }
  // Every brand belongs to exactly one market, and every market lists it back.
  for (const brand of game.brands) {
    assert.ok(game.markets[brand.marketId].brandIds.includes(brand.id));
    assert.ok(brand.price >= MIN_PRICE && brand.price <= MAX_PRICE);
  }
  assert.equal(game.over, false);
});

test('a conglomerate is seeded across different markets', () => {
  const game = createGame({ rivals: 3, markets: 6, rng: seq([0.15, 0.55, 0.85, 0.35, 0.65]) });
  for (const firm of game.firms) {
    const marketIds = ownedBrands(game, firm.id).map((b) => b.marketId);
    assert.equal(new Set(marketIds).size, marketIds.length, 'no firm starts twice in one market');
  }
});

test('nothing can be bought during the opening grace period', () => {
  const game = createGame({ rivals: 1, markets: 3, rng: seq([0.3, 0.8, 0.15]) });
  const target = game.brands.find((b) => b.owner === null);
  game.firms[0].cash = 100_000;
  assert.equal(canAcquire(game, 0, target.id).reason, 'markets still opening');
  openMarkets(game);
  assert.equal(canAcquire(game, 0, target.id).ok, true);
});

test('a freshly acquired brand cannot be flipped again immediately', () => {
  const game = openMarkets(createGame({ rivals: 1, markets: 3, rng: seq([0.3, 0.8, 0.15]) }));
  const target = game.brands.find((b) => b.owner === null);
  game.firms[0].cash = 100_000;
  game.firms[1].cash = 100_000;
  acquire(game, 0, target.id);
  assert.equal(target.lockedUntil, game.time + INTEGRATION_LOCK);

  game.firms[0].cash = 0;
  game.firms[0].debt = portfolioValue(game, 0) * 1.5; // Distressed, so raidable...
  assert.equal(canAcquire(game, 1, target.id).reason, 'still integrating');

  game.time += INTEGRATION_LOCK;
  assert.equal(canAcquire(game, 1, target.id).ok, true, '...but only once integration ends');
});

test('a startup is sheltered from category-edge raids', () => {
  const game = openMarkets(createGame({ rivals: 1, markets: 4, rng: seq([0.3, 0.8, 0.15, 0.6]) }));
  const market = game.markets[0];
  const brands = brandsIn(game, market);
  for (const b of brands) { b.owner = 0; b.price = 1; b.equity = 50; }
  const theirs = brands[brands.length - 1];
  theirs.owner = 1;
  computeShares(game);

  assert.ok(ownedBrands(game, 1).length <= SHELTERED_SIZE);
  assert.equal(isVulnerable(game, theirs.id, 0), false, 'small firms are not raidable this way');
});

test('launching founds a brand: cheap, unknown, and fast-growing', () => {
  const game = createGame({ rivals: 1, markets: 4, rng: seq([0.3, 0.8, 0.15, 0.6]) });
  const market = game.markets[0];
  const before = market.brandIds.length;
  const cost = launchCost(game, market.id);
  game.firms[0].cash = cost + 50;

  const result = launchBrand(game, 0, market.id);
  assert.equal(result.ok, true);
  const brand = result.brand;
  assert.equal(brand.owner, 0);
  assert.equal(brand.equity, LAUNCH_EQUITY);
  assert.equal(market.brandIds.length, before + 1);
  assert.ok(market.brandIds.includes(brand.id));
  assert.ok(Math.abs(game.firms[0].cash - 50) < 1e-6);
  assert.ok(brand.share > 0 && brand.share < 0.2, 'it starts small');

  // Young brands convert marketing into equity faster, then settle down.
  assert.ok(launchMomentum(game, brand) > 1);
  game.time += LAUNCH_WINDOW;
  assert.equal(launchMomentum(game, brand), 1);
});

test('launching is gated by cost, cooldown, names and market size', () => {
  const game = createGame({ rivals: 1, markets: 4, rng: seq([0.3, 0.8, 0.15, 0.6]) });
  const market = game.markets[0];
  game.firms[0].cash = 0;
  game.firms[0].debt = creditLimit(game, 0);
  assert.equal(canLaunch(game, 0, market.id).reason, 'not enough capital');

  game.firms[0].cash = 100_000;
  game.firms[0].debt = 0;
  launchBrand(game, 0, market.id);
  assert.equal(canLaunch(game, 0, market.id).reason, 'still setting up');

  game.firms[0].launchReady = 0;
  while (market.brandIds.length < MAX_BRANDS_PER_MARKET && market.reserve.length) {
    game.firms[0].launchReady = 0;
    launchBrand(game, 0, market.id);
  }
  const blocked = canLaunch(game, 0, market.id);
  assert.equal(blocked.ok, false);
  assert.ok(['market is full', 'no names left'].includes(blocked.reason));
});

test('an ad blitz buys equity outright, once per cooldown', () => {
  const game = createGame({ rivals: 1, markets: 4, rng: seq([0.3, 0.8, 0.15, 0.6]) });
  const brand = ownedBrands(game, 0)[0];
  brand.equity = 40;
  game.firms[0].cash = 1000;

  assert.equal(runAction(game, 0, 'blitz', brand.id).ok, true);
  assert.equal(brand.equity, 40 + ACTIONS.blitz.equity);
  assert.ok(Math.abs(game.firms[0].cash - (1000 - ACTIONS.blitz.cost)) < 1e-9);

  assert.equal(canRunAction(game, 0, 'blitz', brand.id).reason, 'on cooldown');
  game.time += ACTIONS.blitz.cooldown;
  assert.equal(canRunAction(game, 0, 'blitz', brand.id).ok, true);
});

test('a promotion discounts the price customers see, then expires', () => {
  const game = createGame({ rivals: 1, markets: 4, rng: seq([0.3, 0.8, 0.15, 0.6]) });
  const brand = ownedBrands(game, 0)[0];
  brand.price = 1.2;
  game.firms[0].cash = 1000;
  computeShares(game);
  const before = brand.share;

  runAction(game, 0, 'promo', brand.id);
  assert.ok(Math.abs(effectivePrice(game, brand) - 1.2 * ACTIONS.promo.discount) < 1e-9);
  assert.ok(brand.share > before, 'a discount should win share');
  assert.equal(brand.price, 1.2, 'the list price is untouched');

  game.time += ACTIONS.promo.duration;
  computeShares(game);
  assert.equal(effectivePrice(game, brand), 1.2);
});

test('a category push spikes demand for everyone in the market', () => {
  const game = createGame({ rivals: 1, markets: 4, rng: seq([0.3, 0.8, 0.15, 0.6]) });
  const market = game.markets[0];
  game.firms[0].cash = 1000;
  const before = marketDemand(game, market);
  assert.equal(runAction(game, 0, 'push', market.id).ok, true);
  assert.ok(marketDemand(game, market) > before);
});

test('one-tap plays refuse other firms\' brands and empty treasuries', () => {
  const game = createGame({ rivals: 1, markets: 4, rng: seq([0.3, 0.8, 0.15, 0.6]) });
  const theirs = game.brands.find((b) => b.owner === 1);
  game.firms[0].cash = 1000;
  assert.equal(canRunAction(game, 0, 'blitz', theirs.id).reason, 'not your brand');

  const mine = ownedBrands(game, 0)[0];
  game.firms[0].cash = 0;
  game.firms[0].debt = creditLimit(game, 0);
  assert.equal(canRunAction(game, 0, 'blitz', mine.id).reason, 'not enough capital');
});

test('brands sharing a market share their overhead', () => {
  const game = createGame({ rivals: 1, markets: 4, rng: seq([0.3, 0.8, 0.15, 0.6]) });
  const market = game.markets[0];
  const [first, second] = brandsIn(game, market);
  for (const b of game.brands) b.owner = b.id === first.id ? 0 : null;
  computeShares(game);
  const alone = first.profit;

  second.owner = 0;
  computeShares(game);
  assert.equal(stableSize(game, 0, market.id), 2);
  // Same brand, same price, same share — but a cheaper back office.
  const overheadAlone = BRAND_OVERHEAD * costPressure(game) * scaleFactor(game, 0)
    * (market.baseDemand / OVERHEAD_REFERENCE_DEMAND);
  assert.ok(overheadAlone * Math.pow(2, -CATEGORY_SYNERGY) < overheadAlone);
  assert.ok(first.profit > alone - overheadAlone, 'consolidating must not cost more than it earns');
});

test('scale cuts overhead for big portfolios and penalises solo firms', () => {
  const game = createGame({ rivals: 1, markets: 6, rng: seq([0.3, 0.8, 0.15, 0.6]) });
  for (const b of ownedBrands(game, 0).slice(1)) b.owner = null;
  assert.equal(scaleFactor(game, 0), SOLO_PENALTY);

  for (const b of game.brands) if (b.owner === null) b.owner = 0;
  const big = scaleFactor(game, 0);
  assert.ok(big < SOLO_PENALTY);
  assert.ok(big >= 0.55);
});

test('a beaten-down brand is neglected and takeable', () => {
  const game = openMarkets(createGame({ rivals: 1, markets: 3, rng: seq([0.3, 0.8, 0.15]) }));
  const market = game.markets.find((m) => brandsIn(game, m).some((b) => b.owner === 1));
  const victim = brandsIn(game, market).find((b) => b.owner === 1);
  for (const b of brandsIn(game, market)) { b.price = 1; b.equity = 90; }
  victim.price = MAX_PRICE;
  victim.equity = 2;
  computeShares(game);
  assert.ok(victim.share < NEGLECT_SHARE);
  assert.equal(isNeglected(game, victim.id), true);
  assert.equal(isVulnerable(game, victim.id), true);
});

test('dominating a category lets you force out a smaller owner there', () => {
  const game = openMarkets(createGame({ rivals: 1, markets: 4, rng: seq([0.3, 0.8, 0.15, 0.6]) }));
  const market = game.markets[0];
  const brands = brandsIn(game, market);
  for (const b of brands) { b.owner = 0; b.price = 1; b.equity = 50; }
  const theirs = brands[brands.length - 1];
  theirs.owner = 1;
  // Firm 1 has to be past startup size, or the shelter rule protects it.
  for (const b of game.brands) {
    if (b.marketId !== market.id && ownedBrands(game, 1).length <= SHELTERED_SIZE) b.owner = 1;
  }
  computeShares(game);
  assert.ok(ownedBrands(game, 1).length > SHELTERED_SIZE);

  assert.ok(categoryGrip(game, 0, market.id)
    > categoryGrip(game, 1, market.id) + CATEGORY_EDGE);
  assert.equal(isVulnerable(game, theirs.id), false, 'not vulnerable to nobody in particular');
  assert.equal(isVulnerable(game, theirs.id, 0), true, 'but vulnerable to the category leader');
  assert.equal(isVulnerable(game, theirs.id, 1), false);
});

test('shares within a market always sum to one', () => {
  const game = tinyGame();
  for (const market of game.markets) {
    const total = brandsIn(game, market).reduce((s, b) => s + b.share, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
  }
});

test('a cheaper price buys share, a higher one surrenders it', () => {
  const game = tinyGame();
  const [a, b] = brandsIn(game, game.markets[0]);
  a.price = b.price = 1;
  a.equity = b.equity = 50;
  computeShares(game);
  assert.ok(Math.abs(a.share - b.share) < 1e-9);

  a.price = 0.8;
  computeShares(game);
  assert.ok(a.share > b.share, 'undercutting should win share');

  a.price = 1.5;
  computeShares(game);
  assert.ok(a.share < b.share, 'premium pricing should lose share');
});

test('stronger equity beats an equal price', () => {
  const game = tinyGame();
  const [a, b] = brandsIn(game, game.markets[0]);
  a.price = b.price = 1;
  a.equity = 80;
  b.equity = 30;
  computeShares(game);
  assert.ok(a.share > b.share);
  assert.ok(attraction(game, a) > attraction(game, b));
});

test('price sensitivity differs by market', () => {
  const game = createGame({ rivals: 1, markets: MARKET_TEMPLATES.length, rng: half });
  const elastic = game.markets.reduce((m, x) => (x.elasticity > m.elasticity ? x : m));
  const rigid = game.markets.reduce((m, x) => (x.elasticity < m.elasticity ? x : m));
  const loss = (market) => {
    const brands = brandsIn(game, market);
    for (const b of brands) { b.price = 1; b.equity = 50; }
    computeShares(game);
    const before = brands[0].share;
    brands[0].price = 1.3;
    computeShares(game);
    return before - brands[0].share;
  };
  assert.ok(loss(elastic) > loss(rigid), 'the elastic market should punish a price hike harder');
});

test('marketing raises equity, neglect erodes it', () => {
  const game = tinyGame();
  const brand = game.brands[0];
  brand.equity = 40;
  brand.marketing = 20;
  tick(game, 1, half);
  assert.ok(brand.equity > 40);

  brand.marketing = 0;
  const peak = brand.equity;
  tick(game, 5, half);
  assert.ok(brand.equity < peak, 'an unsupported brand should decay');
});

test('equity is capped and decay is proportional', () => {
  const game = tinyGame();
  const brand = game.brands[0];
  brand.equity = MAX_EQUITY;
  brand.marketing = 40;
  tick(game, 3, half);
  assert.ok(brand.equity <= MAX_EQUITY);
  assert.ok(brand.equity < MAX_EQUITY, `decay of ${EQUITY_DECAY}/s should bite at the cap`);
});

test('category spend grows the whole market, then fades', () => {
  const game = tinyGame();
  const market = game.markets[0];
  const before = marketDemand(game, market);
  setCategorySpend(game, 0, market.id, 20);
  tick(game, 6, half);
  const boosted = marketDemand(game, market);
  assert.ok(boosted > before, 'buzz should lift category demand');

  setCategorySpend(game, 0, market.id, 0);
  tick(game, 20, half);
  assert.ok(marketDemand(game, market) < boosted, 'buzz should decay once unfunded');
});

test('profit nets out unit costs, marketing and overhead', () => {
  const game = tinyGame();
  const brand = game.brands[0];
  brand.owner = 0;
  brand.marketing = 3;
  computeShares(game);
  const market = game.markets[brand.marketId];
  const overhead = BRAND_OVERHEAD * costPressure(game) * scaleFactor(game, 0)
    * (market.baseDemand / OVERHEAD_REFERENCE_DEMAND)
    * Math.pow(stableSize(game, 0, market.id), -CATEGORY_SYNERGY);
  const expected = brand.units * (brand.price - market.unitCost) - 3 - overhead;
  assert.ok(Math.abs(brand.profit - expected) < 1e-9);
});

test('overhead inflates over the game, then stops at the cap', () => {
  const game = tinyGame();
  assert.equal(costPressure(game), 1);
  game.time = INFLATION_PERIOD * (MAX_INFLATION - 1) * 0.5;
  assert.ok(Math.abs(costPressure(game) - (1 + (MAX_INFLATION - 1) * 0.5)) < 1e-9);
  game.time = INFLATION_PERIOD * 100;
  assert.equal(costPressure(game), MAX_INFLATION);

  game.time = 0;
  const brand = ownedBrands(game, 0)[0];
  computeShares(game);
  const early = brand.profit;
  game.time = INFLATION_PERIOD * (MAX_INFLATION - 1);
  computeShares(game);
  assert.ok(brand.profit < early, 'the same brand earns less as costs rise');
});

test('firm profit subtracts category campaigns and loan interest', () => {
  const game = tinyGame();
  const bare = firmProfit(game, 0);
  setCategorySpend(game, 0, 0, 10);
  assert.ok(Math.abs(firmProfit(game, 0) - (bare - 10)) < 1e-9);
  setCategorySpend(game, 0, 0, 0);
  game.firms[0].debt = 1000;
  assert.ok(firmProfit(game, 0) < bare);
});

test('economy share is revenue-weighted across all markets', () => {
  const game = createGame({ rivals: 1, markets: 3, rng: seq([0.3, 0.8, 0.15]) });
  const total = game.brands.reduce((s, b) => s + b.revenue, 0);
  assert.ok(Math.abs(economyShare(game, 0) - firmRevenue(game, 0) / total) < 1e-9);
  const sum = game.firms.reduce((s, f) => s + economyShare(game, f.id), 0);
  assert.ok(sum > 0 && sum < 1, 'independents should still hold most of the economy');
});

test('brand value never drops below the floor and rises with performance', () => {
  const game = tinyGame();
  const brand = game.brands[0];
  brand.revenue = 0;
  brand.profit = -50;
  brand.equity = 1;
  assert.equal(brandValue(game, brand.id), VALUE_FLOOR);

  brand.equity = 90;
  brand.revenue = 20;
  brand.profit = 8;
  assert.ok(brandValue(game, brand.id) > VALUE_FLOOR);
});

test('a hostile takeover costs more than buying an independent', () => {
  const game = createGame({ rivals: 1, markets: 3, rng: seq([0.3, 0.8, 0.15]) });
  const independent = game.brands.find((b) => b.owner === null);
  const rival = game.brands.find((b) => b.owner === 1);
  assert.ok(
    Math.abs(acquisitionPrice(game, 0, independent.id)
      - brandValue(game, independent.id) * (1 + INDEPENDENT_PREMIUM)) < 1e-9);
  assert.ok(
    Math.abs(acquisitionPrice(game, 0, rival.id)
      - brandValue(game, rival.id) * (1 + HOSTILE_PREMIUM)) < 1e-9);
  assert.ok(acquisitionPrice(game, 0, rival.id) / brandValue(game, rival.id)
    > acquisitionPrice(game, 0, independent.id) / brandValue(game, independent.id));
});

test('acquiring an independent moves ownership and spends cash', () => {
  const game = openMarkets(createGame({ rivals: 1, markets: 3, rng: seq([0.3, 0.8, 0.15]) }));
  const target = game.brands.find((b) => b.owner === null);
  const price = acquisitionPrice(game, 0, target.id);
  game.firms[0].cash = price + 10;

  const result = acquire(game, 0, target.id);
  assert.equal(result.ok, true);
  assert.equal(target.owner, 0);
  assert.ok(Math.abs(game.firms[0].cash - 10) < 1e-6);
  assert.equal(game.log.length, 1);
});

test('you cannot buy what you cannot afford', () => {
  const game = openMarkets(createGame({ rivals: 1, markets: 3, rng: seq([0.3, 0.8, 0.15]) }));
  const target = game.brands.find((b) => b.owner === null);
  game.firms[0].cash = 0;
  game.firms[0].debt = creditLimit(game, 0);
  const check = canAcquire(game, 0, target.id);
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'not enough capital');
  assert.equal(acquire(game, 0, target.id).ok, false);
  assert.equal(target.owner, null);
});

test('a healthy rival cannot be raided; a distressed one can', () => {
  const game = openMarkets(createGame({ rivals: 1, markets: 3, rng: seq([0.3, 0.8, 0.15]) }));
  const rivalBrand = game.brands.find((b) => b.owner === 1);
  game.firms[0].cash = 100_000;

  assert.equal(inDistress(game, 1), false);
  assert.equal(canAcquire(game, 0, rivalBrand.id).reason, 'owner is not vulnerable');

  game.firms[1].cash = 0;
  game.firms[1].debt = portfolioValue(game, 1) * 1.5; // Leveraged to the eyeballs.
  assert.equal(inDistress(game, 1), true);
  const result = acquire(game, 0, rivalBrand.id);
  assert.equal(result.ok, true);
  assert.equal(rivalBrand.owner, 0);
});

test('a seller banks the proceeds and pays down debt first', () => {
  const game = openMarkets(createGame({ rivals: 1, markets: 3, rng: seq([0.3, 0.8, 0.15]) }));
  const rivalBrand = game.brands.find((b) => b.owner === 1);
  game.firms[0].cash = 100_000;
  const seller = game.firms[1];
  seller.cash = 0;
  seller.debt = portfolioValue(game, 1) * 1.5;
  const debtBefore = seller.debt;

  acquire(game, 0, rivalBrand.id);
  assert.ok(seller.debt < debtBefore, 'proceeds should retire debt');
  assert.ok(seller.cash >= 0);
});

test('acquisition falls back to credit when the treasury is short', () => {
  const game = openMarkets(createGame({ rivals: 1, markets: 3, rng: seq([0.3, 0.8, 0.15]) }));
  const target = game.brands.find((b) => b.owner === null);
  const price = acquisitionPrice(game, 0, target.id);
  const room = creditLimit(game, 0);
  game.firms[0].cash = Math.max(0, price - room * 0.8);
  assert.ok(buyingPower(game, 0) >= price, 'credit should cover the gap in this setup');

  acquire(game, 0, target.id);
  assert.equal(target.owner, 0);
  assert.ok(game.firms[0].debt > 0, 'the shortfall should have been borrowed');
});

test('borrowing is capped by portfolio value', () => {
  const game = tinyGame();
  const limit = creditLimit(game, 0);
  assert.ok(Math.abs(limit - portfolioValue(game, 0) * CREDIT_RATIO) < 1e-9);
  const taken = borrow(game, 0, limit * 5);
  assert.ok(Math.abs(taken - limit) < 1e-9);
  assert.equal(borrow(game, 0, 100), 0);

  const cashBefore = game.firms[0].cash;
  const paid = repay(game, 0, 10);
  assert.equal(paid, 10);
  assert.equal(game.firms[0].cash, cashBefore - 10);
});

test('net worth counts cash plus holdings minus debt', () => {
  const game = tinyGame();
  const firm = game.firms[0];
  firm.debt = 100;
  assert.ok(Math.abs(netWorth(game, 0) - (firm.cash + portfolioValue(game, 0) - 100)) < 1e-9);
});

test('divesting sells at a discount and frees the brand', () => {
  const game = tinyGame();
  const brand = ownedBrands(game, 0)[0];
  const fair = brandValue(game, brand.id);
  const before = game.firms[0].cash;
  const result = divest(game, 0, brand.id);
  assert.equal(result.ok, true);
  assert.ok(result.price < fair, 'a fire sale should not pay full value');
  assert.equal(brand.owner, null);
  assert.ok(game.firms[0].cash > before);
  assert.equal(divest(game, 0, brand.id).ok, false);
});

test('player levers only work on brands you own, and clamp their inputs', () => {
  const game = createGame({ rivals: 1, markets: 3, rng: seq([0.3, 0.8, 0.15]) });
  const mine = ownedBrands(game, 0)[0];
  const theirs = game.brands.find((b) => b.owner === 1);

  assert.equal(setPrice(game, 0, mine.id, 99), true);
  assert.equal(mine.price, MAX_PRICE);
  assert.equal(setPrice(game, 0, mine.id, -5), true);
  assert.equal(mine.price, MIN_PRICE);
  assert.equal(setPrice(game, 0, theirs.id, 1), false);

  assert.equal(setMarketing(game, 0, mine.id, 500), true);
  assert.equal(mine.marketing, 40);
  assert.equal(setMarketing(game, 0, theirs.id, 5), false);
});

test('an overdrawn firm borrows, then liquidates brands to survive', () => {
  const game = createGame({ rivals: 1, markets: 6, rng: half });
  const firm = game.firms[0];
  // A small, catastrophically run portfolio: top prices, maximum ad burn.
  for (const b of game.brands) if (b.owner === 0) b.owner = null;
  for (const b of brandsIn(game, game.markets[0])) {
    b.owner = 0;
    b.price = MAX_PRICE;
    b.marketing = 40;
  }
  computeShares(game);
  firm.cash = 0;
  firm.debt = creditLimit(game, 0); // No credit left to draw on.
  const held = ownedBrands(game, 0).length;

  for (let i = 0; i < 40 && !game.over; i++) tick(game, 0.5, half);
  assert.ok(ownedBrands(game, 0).length < held, 'losses should force divestitures');
});

test('runAi prices, funds marketing and goes shopping', () => {
  const game = openMarkets(createGame({ rivals: 1, markets: 4, rng: seq([0.25, 0.6, 0.85, 0.4]) }));
  const ai = game.firms[1];
  ai.cash = 5000;
  ai.cooldown = 0;
  const before = ownedBrands(game, ai.id).length;
  runAi(game, ai, 1, half);
  assert.ok(ownedBrands(game, ai.id).length > before, 'a rich rival should buy something');
  for (const b of ownedBrands(game, ai.id)) {
    assert.ok(b.price >= MIN_PRICE && b.price <= MAX_PRICE);
    assert.ok(b.marketing >= 0);
  }
  assert.ok(ai.cooldown > 0, 'buying should start a cooldown');
});

test('a rival only funds category ads where it dominates', () => {
  const game = createGame({ rivals: 1, markets: 3, rng: seq([0.25, 0.6, 0.85, 0.4]) });
  const ai = game.firms[1];
  ai.cash = 5000;
  ai.cooldown = 99;
  const market = game.markets[0];
  for (const b of brandsIn(game, market)) b.owner = ai.id;
  computeShares(game);
  runAi(game, ai, 1, half);
  assert.ok(market.categorySpend > 0);
  assert.equal(market.fundedBy, ai.id);
});

test('a monopoly ends the game', () => {
  const game = createGame({ rivals: 1, markets: 3, rng: seq([0.3, 0.8, 0.15]) });
  for (const b of game.brands) b.owner = 0;
  computeShares(game);
  resolveOutcomes(game);
  assert.ok(economyShare(game, 0) >= MONOPOLY_SHARE);
  assert.equal(game.over, true);
  assert.equal(game.winner, 0);
  assert.equal(game.outcome, 'monopoly');
});

test('losing every brand, with no way back in, means you were bought out', () => {
  const game = createGame({ rivals: 1, markets: 3, rng: seq([0.3, 0.8, 0.15]) });
  for (const b of ownedBrands(game, 0)) b.owner = 1;
  game.firms[0].cash = 0;
  computeShares(game);
  resolveOutcomes(game);
  assert.equal(game.firms[0].boughtOut, true);
  assert.equal(game.over, true);
  assert.equal(game.outcome, 'bought-out');
  assert.equal(game.winner, 1);
});

test('a finished game ignores further ticks', () => {
  const game = tinyGame();
  game.over = true;
  tick(game, 5, half);
  assert.equal(game.time, 0);
});

test('standings rank by share and stay consistent', () => {
  const game = createGame({ rivals: 3, markets: 5, rng: seq([0.2, 0.7, 0.45, 0.9, 0.1]) });
  const rows = standings(game);
  assert.equal(rows.length, 4);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].share >= rows[i].share);
  const you = rows.find((r) => r.human);
  assert.equal(you.brands, ownedBrands(game, 0).length);
  assert.ok(Math.abs(you.netWorth - netWorth(game, 0)) < 1e-9);
});

test('the log keeps the newest events and stays bounded', () => {
  const game = tinyGame();
  for (let i = 0; i < 60; i++) logEvent(game, `event ${i}`);
  assert.equal(game.log.length, 40);
  assert.equal(game.log[0].text, 'event 59');
});

test('a full game resolves without NaNs or negative cash', () => {
  const rng = seeded(20260827);
  const game = createGame({ rivals: 3, markets: 6, rng });
  let steps = 0;
  while (!game.over && steps < 60_000) {
    tick(game, 0.1, rng);
    steps++;
    for (const firm of game.firms) {
      assert.ok(Number.isFinite(firm.cash) && firm.cash >= 0, 'cash stays finite and non-negative');
      assert.ok(Number.isFinite(netWorth(game, firm.id)));
    }
    for (const b of game.brands) {
      assert.ok(Number.isFinite(b.share) && b.share >= 0 && b.share <= 1);
    }
  }
  assert.equal(game.over, true, 'the economy should consolidate within the tick budget');
  assert.ok(['monopoly', 'last-standing', 'bought-out'].includes(game.outcome));
  assert.ok(clamp(game.winner ?? 0, 0, 3) === (game.winner ?? 0));
});

test('every AI-only economy consolidates, across several seeds', () => {
  // Eight markets is the shipped configuration.
  for (const seed of [1, 7, 99, 2024, 31337]) {
    const rng = seeded(seed);
    const game = createGame({ rivals: 3, markets: 8, rng });
    let steps = 0;
    while (!game.over && steps < 60_000) {
      tick(game, 0.1, rng);
      steps++;
    }
    assert.equal(game.over, true, `seed ${seed} should resolve`);
  }
});
