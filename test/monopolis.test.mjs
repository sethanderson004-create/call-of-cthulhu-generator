import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeBoard,
  neighbors,
  totalDemand,
  holdings,
  frontier,
  districtRevenue,
  firmIncome,
  firmUpkeep,
  marketShare,
  createGame,
  seedSeats,
  invest,
  tick,
  chooseAiTarget,
  setTarget,
  setAggression,
  standings,
  clamp,
  randInt,
  MONOPOLY_SHARE,
  STARTING_CAPITAL,
  HOSTILE_EFFICIENCY,
  NEUTRAL_RESISTANCE,
  ENTRENCH_CAP,
  SYNERGY_BONUS,
  SECTORS,
} from '../src/monopolis.js';

/** Deterministic rng: cycles a fixed list of values. */
function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

const half = () => 0.5;

test('makeBoard lays out a row-major grid with in-range demand', () => {
  const board = makeBoard(4, 3, half);
  assert.equal(board.districts.length, 12);
  for (const [i, d] of board.districts.entries()) {
    assert.equal(d.index, i);
    assert.equal(d.y * 4 + d.x, i);
    assert.equal(d.owner, null);
    const sector = SECTORS.find((s) => s.key === d.sector);
    assert.ok(d.demand >= sector.demandRange[0] && d.demand <= sector.demandRange[1]);
    assert.equal(d.stake, d.demand * NEUTRAL_RESISTANCE);
  }
});

test('neighbors are orthogonal and clipped at the edges', () => {
  const board = makeBoard(3, 3, half);
  assert.deepEqual(neighbors(board, 4).sort((a, b) => a - b), [1, 3, 5, 7]);
  assert.deepEqual(neighbors(board, 0).sort((a, b) => a - b), [1, 3]);
  assert.deepEqual(neighbors(board, 8).sort((a, b) => a - b), [5, 7]);
});

test('frontier is every non-owned district adjacent to a holding', () => {
  const board = makeBoard(3, 3, half);
  board.districts[4].owner = 0;
  assert.deepEqual(frontier(board, 0), [1, 3, 5, 7]);
  board.districts[1].owner = 0;
  assert.deepEqual(frontier(board, 0), [0, 2, 3, 5, 7]);
  assert.deepEqual(frontier(board, 1), []);
});

test('synergy raises revenue for clustered holdings', () => {
  const board = makeBoard(3, 3, half);
  board.districts[4].owner = 0;
  const alone = districtRevenue(board, board.districts[4]);
  assert.equal(alone, board.districts[4].demand);
  board.districts[1].owner = 0;
  board.districts[3].owner = 0;
  assert.equal(
    districtRevenue(board, board.districts[4]),
    board.districts[4].demand * (1 + 2 * SYNERGY_BONUS),
  );
  assert.equal(districtRevenue(board, board.districts[8]), 0);
});

test('income, upkeep and share only count what you own', () => {
  const board = makeBoard(2, 2, half);
  board.districts[0].owner = 0;
  board.districts[3].owner = 1;
  assert.equal(firmIncome(board, 0), board.districts[0].demand);
  assert.ok(firmUpkeep(board, 0) > 0);
  assert.equal(holdings(board, 0).length, 1);
  const total = totalDemand(board);
  assert.equal(marketShare(board, 0), board.districts[0].demand / total);
  assert.equal(marketShare(board, 2), 0);
});

test('invest eats neutral stake at full efficiency and flips ownership', () => {
  const board = makeBoard(2, 2, half);
  const firm = { id: 0, capital: 1000 };
  const target = board.districts[1];
  const before = target.stake;

  const spent = invest(board, firm, 1, before / 2);
  assert.equal(spent, before / 2);
  assert.equal(target.stake, before / 2);
  assert.equal(target.owner, null);
  assert.equal(firm.capital, 1000 - before / 2);

  invest(board, firm, 1, 10_000);
  assert.equal(target.owner, 0);
  assert.equal(target.stake, target.demand);
  // Never overspends: only the remaining stake was charged.
  assert.equal(firm.capital, 1000 - before);
});

test('invest against a rival is taxed by hostile efficiency', () => {
  const board = makeBoard(2, 2, half);
  const target = board.districts[1];
  target.owner = 1;
  target.stake = 14;
  const firm = { id: 0, capital: 100 };

  const spent = invest(board, firm, 1, 10);
  assert.equal(spent, 10);
  assert.equal(target.stake, 14 - 10 * HOSTILE_EFFICIENCY);
  assert.equal(target.owner, 1);
});

test('invest refuses your own districts and non-positive budgets', () => {
  const board = makeBoard(2, 2, half);
  board.districts[1].owner = 0;
  const firm = { id: 0, capital: 100 };
  assert.equal(invest(board, firm, 1, 50), 0);
  assert.equal(invest(board, firm, 2, 0), 0);
  assert.equal(firm.capital, 100);
});

test('createGame seats every firm with capital and a hardened district', () => {
  const game = createGame({ width: 8, height: 6, aiCount: 2, rng: seq([0.1, 0.4, 0.7, 0.9, 0.25]) });
  assert.equal(game.firms.length, 3);
  assert.equal(game.firms[0].human, true);
  assert.equal(new Set(game.firms.map((f) => f.name)).size, 3);
  for (const firm of game.firms) {
    assert.equal(firm.capital, STARTING_CAPITAL);
    const owned = holdings(game.board, firm.id);
    assert.equal(owned.length, 1);
    assert.equal(owned[0].stake, owned[0].demand * ENTRENCH_CAP);
  }
  assert.equal(game.over, false);
  assert.equal(game.winner, null);
});

test('seedSeats returns distinct, spread-out districts', () => {
  const board = makeBoard(6, 6, half);
  const seats = seedSeats(board, 4, half);
  assert.equal(new Set(seats).size, 4);
  for (const s of seats) assert.ok(s >= 0 && s < board.districts.length);
});

test('tick accrues net income and entrenches holdings', () => {
  const game = createGame({ width: 6, height: 5, aiCount: 0, rng: half });
  const firm = game.firms[0];
  const seat = holdings(game.board, 0)[0];
  seat.stake = 0.5;
  const expected = firm.capital + (firmIncome(game.board, 0) - firmUpkeep(game.board, 0));
  tick(game, 1, half);
  assert.ok(Math.abs(firm.capital - expected) < 1e-9);
  assert.ok(seat.stake > 0.5);
  assert.ok(seat.stake <= seat.demand * ENTRENCH_CAP);
  assert.equal(game.elapsed, 1);
});

test('tick spends toward the chosen target and clears it on capture', () => {
  const game = createGame({ width: 6, height: 5, aiCount: 0, rng: half });
  const firm = game.firms[0];
  firm.capital = 5000;
  firm.aggression = 1;
  const target = frontier(game.board, 0)[0];
  assert.equal(setTarget(game, 0, target), true);
  tick(game, 1, half);
  assert.equal(game.board.districts[target].owner, 0);
  assert.equal(firm.target, null);
});

test('an unreachable target is dropped rather than spent on', () => {
  const game = createGame({ width: 6, height: 5, aiCount: 0, rng: half });
  const firm = game.firms[0];
  const far = game.board.districts.find((d) => !frontier(game.board, 0).includes(d.index) && d.owner !== 0);
  firm.target = far.index; // Bypass setTarget's validation.
  const stakeBefore = far.stake;
  tick(game, 1, half);
  assert.equal(firm.target, null);
  assert.ok(far.stake >= stakeBefore);
});

test('setTarget rejects districts off your frontier and accepts null', () => {
  const game = createGame({ width: 6, height: 5, aiCount: 1, rng: seq([0.2, 0.6, 0.35, 0.8]) });
  const legal = frontier(game.board, 0);
  const illegal = game.board.districts.find((d) => d.owner !== 0 && !legal.includes(d.index));
  assert.equal(setTarget(game, 0, illegal.index), false);
  assert.equal(game.firms[0].target, null);
  assert.equal(setTarget(game, 0, legal[0]), true);
  assert.equal(game.firms[0].target, legal[0]);
  assert.equal(setTarget(game, 0, null), true);
  assert.equal(game.firms[0].target, null);
});

test('setAggression clamps to [0, 1]', () => {
  const game = createGame({ width: 4, height: 4, aiCount: 0, rng: half });
  setAggression(game, 0, 5);
  assert.equal(game.firms[0].aggression, 1);
  setAggression(game, 0, -2);
  assert.equal(game.firms[0].aggression, 0);
  assert.equal(clamp(0.3, 0, 1), 0.3);
});

test('chooseAiTarget stays on the frontier and returns null when boxed in', () => {
  const game = createGame({ width: 5, height: 5, aiCount: 1, rng: seq([0.3, 0.7, 0.15, 0.55]) });
  const ai = game.firms[1];
  const target = chooseAiTarget(game, ai, half);
  assert.ok(frontier(game.board, ai.id).includes(target));

  for (const d of game.board.districts) d.owner = ai.id;
  assert.equal(chooseAiTarget(game, ai, half), null);
});

test('a firm with no districts is marked bankrupt', () => {
  const game = createGame({ width: 5, height: 5, aiCount: 1, rng: seq([0.3, 0.7, 0.15, 0.55]) });
  for (const d of holdings(game.board, 1)) d.owner = 0;
  tick(game, 0.1, half);
  assert.equal(game.firms[1].bankrupt, true);
});

test('monopoly ends the game', () => {
  const game = createGame({ width: 5, height: 4, aiCount: 1, rng: seq([0.3, 0.7, 0.15, 0.55]) });
  for (const d of game.board.districts) d.owner = 0;
  tick(game, 0.1, half);
  assert.ok(marketShare(game.board, 0) >= MONOPOLY_SHARE);
  assert.equal(game.over, true);
  assert.equal(game.winner, 0);
});

test('a finished game ignores further ticks', () => {
  const game = createGame({ width: 4, height: 4, aiCount: 0, rng: half });
  game.over = true;
  const elapsed = game.elapsed;
  tick(game, 5, half);
  assert.equal(game.elapsed, elapsed);
});

test('a full simulation terminates with a winner', () => {
  const rng = seq([0.11, 0.83, 0.42, 0.67, 0.29, 0.95, 0.5, 0.08]);
  const game = createGame({ width: 8, height: 6, aiCount: 3, rng });
  game.firms[0].aggression = 0.6;
  for (let i = 0; i < 4000 && !game.over; i++) {
    if (game.firms[0].target === null) {
      const options = frontier(game.board, 0);
      if (options.length) setTarget(game, 0, options[0]);
    }
    tick(game, 0.1, rng);
  }
  assert.equal(game.over, true, 'game should resolve within the tick budget');
  assert.notEqual(game.winner, null);
  const rows = standings(game);
  assert.equal(rows.length, 4);
  assert.ok(rows[0].share >= rows[rows.length - 1].share);
  // Unclaimed districts keep the shares from summing to exactly 1.
  const claimed = rows.reduce((s, r) => s + r.share, 0);
  assert.ok(claimed > 0 && claimed <= 1 + 1e-9);
});

test('randInt covers its inclusive bounds', () => {
  assert.equal(randInt(2, 5, () => 0), 2);
  assert.equal(randInt(2, 5, () => 0.999), 5);
});
