import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startGame, endTurn, order, playCampaign, playLaunch, playAcquire, playDivest, playInvest,
  rivalTurn, turnState, canSpend,
  ACTIONS_PER_TURN, ACTION_COSTS, TOTAL_QUARTERS, STARTING_MARKETS, EXPANSION_EVERY,
  QUARTER_SECONDS,
} from '../src/turns.js';
import {
  ownedBrands, economyShare, standings, canAcquire, canLaunch, canInvest, brandsIn,
  estimateAction, categoryGrip, ACTIONS,
} from '../src/monopolis.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fresh = (rivals = 2, seed = 7) => startGame({ rivals, rng: seeded(seed) });

test('a game starts small enough to read in one screen', () => {
  const game = fresh();
  assert.equal(game.markets.length, STARTING_MARKETS);
  assert.equal(game.firms.length, 3);
  assert.equal(game.quarter, 1);
  assert.equal(game.quarters, TOTAL_QUARTERS);
  assert.equal(game.actionsLeft, ACTIONS_PER_TURN);
  assert.equal(game.turnBased, true);
  for (const firm of game.firms) assert.ok(ownedBrands(game, firm.id).length > 0);
});

test('decisions are the scarce thing, and they are checked before the rules are', () => {
  const game = fresh();
  const brand = ownedBrands(game, 0)[0];
  game.firms[0].cash = 10_000;

  assert.equal(playCampaign(game, 0, 'blitz', brand.id).ok, true);
  assert.equal(game.actionsLeft, ACTIONS_PER_TURN - ACTION_COSTS.campaign);
  assert.equal(playInvest(game, 0, 'creative').ok, true);
  assert.equal(game.actionsLeft, 1);

  // An acquisition costs two, and one is not enough.
  const target = game.brands.find((b) => b.owner === null);
  const blocked = playAcquire(game, 0, target.id);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'not enough decisions left');
  assert.equal(target.owner, null, 'and nothing happened');

  assert.equal(playCampaign(game, 0, 'promo', brand.id).ok, true);
  assert.equal(game.actionsLeft, 0);
  assert.equal(canSpend(game, 'campaign').reason, 'no decisions left this quarter');
});

test('standing orders are free — running what you own is not a decision', () => {
  const game = fresh();
  const brand = ownedBrands(game, 0)[0];
  assert.equal(order(game, 0, brand.id, { price: 1.2, marketing: 4 }).ok, true);
  assert.ok(Math.abs(brand.price - 1.2) < 1e-9);
  assert.equal(brand.marketing, 4);
  assert.equal(game.actionsLeft, ACTIONS_PER_TURN, 'and it cost nothing');
  assert.equal(order(game, 0, game.brands.find((b) => b.owner !== 0).id, { price: 1 }).ok, false);
});

test('ending a quarter resolves everyone at once and hands back a report', () => {
  const game = fresh();
  const brand = ownedBrands(game, 0)[0];
  playCampaign(game, 0, 'blitz', brand.id);

  const report = endTurn(game, seeded(3));
  assert.equal(report.quarter, 1);
  assert.equal(game.quarter, 2);
  assert.equal(game.actionsLeft, ACTIONS_PER_TURN, 'a fresh budget every quarter');
  assert.equal(game.spent.length, 0);

  assert.equal(typeof report.you.share, 'number');
  assert.equal(typeof report.you.shareDelta, 'number');
  assert.equal(report.rivals.length, 2);
  for (const rival of report.rivals) {
    assert.equal(typeof rival.shareDelta, 'number');
    assert.ok(rival.name);
  }
  assert.ok(Array.isArray(report.events));
});

test('rivals are held to the same budget of decisions as the player', () => {
  const game = fresh(3);
  const rng = seeded(11);
  for (const firm of game.firms.slice(1)) firm.cash = 5000;

  const before = game.firms.slice(1).map((f) => ownedBrands(game, f.id).length);
  for (const firm of game.firms.slice(1)) rivalTurn(game, firm, rng);
  const after = game.firms.slice(1).map((f) => ownedBrands(game, f.id).length);

  for (const [i, count] of after.entries()) {
    // At most three decisions, and expansion costs one or two of them.
    assert.ok(count - before[i] <= ACTIONS_PER_TURN, 'no rival gets a free extra turn');
  }
});

test('the economy only moves when a quarter is resolved', () => {
  const game = fresh();
  const before = JSON.stringify(game.brands.map((b) => [b.share, b.equity]));
  order(game, 0, ownedBrands(game, 0)[0].id, { marketing: 8 });
  playCampaign(game, 0, 'blitz', ownedBrands(game, 0)[0].id);
  // Shares recompute (a campaign changes the standings immediately), but time
  // does not pass: nothing ages, decays or earns until you end the quarter.
  assert.equal(game.time, 0);
  endTurn(game, seeded(5));
  assert.ok(Math.abs(game.time - QUARTER_SECONDS) < 1e-6);
  assert.notEqual(JSON.stringify(game.brands.map((b) => [b.share, b.equity])), before);
});

test('the board grows as the game goes on', () => {
  const game = fresh();
  const rng = seeded(9);
  const sizes = [game.markets.length];
  for (let i = 0; i < 7; i++) { endTurn(game, rng); sizes.push(game.markets.length); }
  assert.ok(sizes.at(-1) > sizes[0], `markets should open over time, saw ${sizes.join(',')}`);
  assert.ok(sizes.at(-1) <= STARTING_MARKETS + Math.ceil(7 / EXPANSION_EVERY) + 1);
  for (const market of game.markets) assert.ok(brandsIn(game, market).length >= 3);
});

test('a game ends on the last quarter and names a winner', () => {
  const game = startGame({ rivals: 2, quarters: 4, rng: seeded(13) });
  const rng = seeded(4);
  for (let i = 0; i < 4; i++) endTurn(game, rng);
  assert.equal(game.over, true);
  assert.ok(['time', 'monopoly', 'last-standing', 'bought-out'].includes(game.outcome));
  assert.notEqual(game.winner, null);
  assert.equal(turnState(game).winner, game.firms[game.winner].name);
  // Nothing more can be committed once it is over.
  assert.equal(playLaunch(game, 0, 0).ok, false);
  assert.equal(endTurn(game, rng), game.report, 'ending again changes nothing');
});

test('no seat has an advantage: the same policy scores the same from any chair', () => {
  // The player seat used to be quietly crippled — rivals also ran the
  // continuous AI inside every tick, acting hundreds of times per quarter
  // against a person's three. This is the regression test for that.
  let seat0 = 0;
  let others = 0;
  const games = 6;
  for (let seed = 1; seed <= games; seed++) {
    const rng = seeded(seed * 23);
    const game = startGame({ rivals: 2, rng });
    while (!game.over) {
      rivalTurn(game, game.firms[0], rng); // seat 0 plays the rivals' own policy
      endTurn(game, rng);
    }
    seat0 += economyShare(game, 0);
    others += (economyShare(game, 1) + economyShare(game, 2)) / 2;
  }
  const mine = seat0 / games;
  const theirs = others / games;
  assert.ok(mine > theirs * 0.6,
    `seat 0 averaged ${(mine * 100).toFixed(1)}% against ${(theirs * 100).toFixed(1)}% — the seats are not equal`);
});

test('a coherent plan beats the rivals often enough to be worth planning', () => {
  // Expansion-led play: buy or found something every quarter you can, then
  // spend what is left on the best campaign available.
  const expand = (game) => {
    const firm = game.firms[0];
    for (const brand of ownedBrands(game, 0)) {
      order(game, 0, brand.id, { marketing: Math.max(1, brand.revenue * 0.2) });
    }
    const buy = game.brands
      .filter((b) => b.owner !== 0 && b.equity >= 12 && b.share >= 0.08)
      .map((b) => ({ b, check: canAcquire(game, 0, b.id) }))
      .filter((x) => x.check.ok && x.check.price < firm.cash * 0.75)
      .sort((x, y) => categoryGrip(game, 0, y.b.marketId) - categoryGrip(game, 0, x.b.marketId))[0];
    if (buy) playAcquire(game, 0, buy.b.id);
    if (game.actionsLeft > 0) {
      const open = game.markets.find((m) => canLaunch(game, 0, m.id).ok
        && canLaunch(game, 0, m.id).cost < firm.cash * 0.6);
      if (open) playLaunch(game, 0, open.id);
    }
    let best = null;
    for (const brand of ownedBrands(game, 0)) {
      for (const key of Object.keys(ACTIONS)) {
        const target = ACTIONS[key].scope === 'market' ? brand.marketId : brand.id;
        const estimate = estimateAction(game, 0, key, target);
        if (estimate?.worthwhile && (!best || estimate.gain > best.gain)) {
          best = { key, target, gain: estimate.gain };
        }
      }
    }
    if (best && game.actionsLeft > 0) playCampaign(game, 0, best.key, best.target);
  };

  let wins = 0;
  const games = 6;
  for (let seed = 1; seed <= games; seed++) {
    const rng = seeded(seed * 23);
    const game = startGame({ rivals: 2, rng });
    while (!game.over) { expand(game); endTurn(game, rng); }
    if (standings(game)[0].id === 0) wins++;
  }
  assert.ok(wins >= 2, `a coherent plan won ${wins} of ${games} — the game should be winnable`);
});
