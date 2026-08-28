import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, tick, ownedBrands, brandsIn
} from '../src/monopolis.js';
import { snapshot, worldInfo, applyCommand, firmRoster } from '../src/protocol.js';

const world = (players = 8) => createGame({ players, rng: seeded(4) });

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('a snapshot describes the world from one firm\'s side', () => {
  const game = world();
  const view = snapshot(game, 0);
  assert.equal(view.you.id, 0);
  assert.equal(view.you.brands, ownedBrands(game, 0).length);
  assert.ok(view.you.rank >= 1 && view.you.rank <= game.firms.length);
  assert.equal(view.markets.length, game.markets.length);
  assert.ok(view.leaders.length <= 10);
  assert.ok(view.leaders.some((row) => row.you) || view.you.rank > 10);
  assert.equal(typeof view.goal, 'number');
});

test('snapshots carry no brand detail until a market is opened', () => {
  const game = world();
  assert.equal(snapshot(game, 0, { rows: [], detail: [] }).detail.length, 0);
  const opened = snapshot(game, 0, { rows: [], detail: [1] });
  assert.equal(opened.detail.length, brandsIn(game, game.markets[1]).length);
  for (const brand of opened.detail) assert.equal(brand.market, 1);
});

test('a scoped snapshot still always includes your own markets', () => {
  const game = world();
  const mine = new Set(ownedBrands(game, 0).map((b) => b.marketId));
  const view = snapshot(game, 0, { rows: [], detail: [] });
  const sent = new Set(view.markets.map((m) => m.id));
  for (const id of mine) assert.ok(sent.has(id), `market ${id} is mine and must be sent`);
});

test('scoping is what keeps a hundred-player snapshot small', () => {
  const game = createGame({ players: 100, rng: seeded(9) });
  const size = (value) => JSON.stringify(value).length;
  // What a client actually displays, against what an unscoped client would
  // need: every market row and every brand in the world.
  const scoped = size(snapshot(game, 0, { rows: [0, 1, 2, 3, 4, 5, 6, 7], detail: [0] }));
  const everything = size(snapshot(game, 0, {
    rows: game.markets.map((m) => m.id),
    detail: game.markets.map((m) => m.id),
  }));
  assert.ok(scoped < everything / 5, `scoped ${scoped} should be far under ${everything}`);
  assert.ok(scoped < 12_000, `a client snapshot should stay small, got ${scoped}`);
});

test('market rows aggregate by owner rather than listing every brand', () => {
  const game = world();
  const market = game.markets[0];
  for (const brand of brandsIn(game, market)) brand.owner = 0;
  const row = snapshot(game, 0).markets[0];
  assert.equal(row.s.length, 1, 'one owner, one slice');
  assert.equal(row.s[0][0], 0);
  assert.ok(Math.abs(row.s[0][1] - 1) < 0.01);
});

test('worldInfo carries the static table the client caches', () => {
  const game = world();
  const info = worldInfo(game);
  assert.equal(info.markets.length, game.markets.length);
  assert.equal(info.firms.length, game.firms.length);
  assert.ok(info.actions.blitz.cost > 0);
  assert.deepEqual(info.priceRange.length, 2);
  assert.deepEqual(firmRoster(game, game.firms.length), []);
});

test('commands are re-checked against the rules, not trusted', () => {
  const game = world();
  const mine = ownedBrands(game, 0)[0];
  const theirs = game.brands.find((b) => b.owner !== null && b.owner !== 0);

  assert.equal(applyCommand(game, 0, { type: 'price', brand: mine.id, value: 1.2 }).ok, true);
  assert.ok(Math.abs(mine.price - 1.2) < 1e-9);

  // Someone else's brand, an impossible price, a brand that does not exist.
  assert.equal(applyCommand(game, 0, { type: 'price', brand: theirs.id, value: 0.6 }).ok, false);
  assert.equal(applyCommand(game, 0, { type: 'price', brand: mine.id, value: 99 }).ok, true);
  assert.ok(mine.price <= 1.8, 'out-of-range prices are clamped by the engine');
  assert.equal(applyCommand(game, 0, { type: 'price', brand: 9999, value: 1 }).reason, 'malformed');
});

test('malformed and hostile commands are refused, never thrown', () => {
  const game = world();
  for (const bad of [null, undefined, 'price', 42, {}, { type: 'nope' },
    { type: 'price' }, { type: 'action', key: 'constructor', target: 0 },
    { type: 'launch', market: -1 }, { type: 'launch', market: 1e9 },
    { type: 'acquire', brand: 'all' }, { type: 'marketing', brand: 0, value: NaN }]) {
    const result = applyCommand(game, 0, bad);
    assert.equal(result.ok, false, `${JSON.stringify(bad)} must be refused`);
    assert.equal(typeof result.reason, 'string');
  }
});

test('a firm that has left cannot act', () => {
  const game = world();
  game.firms[0].gone = true;
  assert.equal(applyCommand(game, 0, { type: 'launch', market: 0 }).reason, 'not seated');
});

test('no commands are accepted once the round is over', () => {
  const game = world();
  game.over = true;
  assert.equal(applyCommand(game, 0, { type: 'launch', market: 0 }).reason, 'round over');
});

test('snapshots stay coherent as a world runs', () => {
  const rng = seeded(11);
  const game = createGame({ players: 30, rng });
  for (let i = 0; i < 1500; i++) tick(game, 0.1, rng);
  const view = snapshot(game, 3, { rows: [0, 1], detail: [0] });
  assert.ok(Number.isFinite(view.you.worth));
  assert.ok(view.you.share >= 0 && view.you.share <= 1);
  for (const row of view.markets) {
    const total = row.s.reduce((sum, [, share]) => sum + share, 0);
    assert.ok(total <= 1.01, 'aggregated shares never exceed the market');
  }
  for (const brand of view.detail) {
    assert.ok(brand.share >= 0 && brand.share <= 1);
    assert.equal(typeof brand.name, 'string');
  }
});
