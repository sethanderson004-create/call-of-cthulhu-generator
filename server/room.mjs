// A Monopolis room: one authoritative world, its bots, and the players seated
// in it. Deliberately free of sockets — a room is driven by `step()` and
// answers `join`, `leave`, `command` and `viewFor`, which makes the whole of
// the multiplayer logic testable without opening a port.

import { createGame, tick, addFirm, removeFirm, activeFirms, runAi, ownedBrands } from '../src/monopolis.js';
import { snapshot, worldInfo, applyCommand } from '../src/protocol.js';

/** Seats in a room, and how many of them bots will hold. */
export const MAX_PLAYERS = 100;
export const DEFAULT_SEATS = 100;

/** Commands one client may submit per second before the rest are dropped. */
export const COMMAND_RATE = 12;

/** How long the result stays up before the next round starts. */
export const INTERMISSION = 15;

export class Room {
  constructor({ seats = DEFAULT_SEATS, rng = Math.random, now = () => Date.now() / 1000 } = {}) {
    this.seats = Math.min(seats, MAX_PLAYERS);
    this.rng = rng;
    this.now = now;
    this.players = new Map(); // clientId -> { firmId, name, view, budget, lastRefill }
    this.round = 0;
    this.endsAt = null;
    this.startWorld();
  }

  startWorld() {
    this.round++;
    // Bots hold every seat; a joining player takes one over, so the world is
    // always full-sized and a lobby with three humans still feels crowded.
    this.game = createGame({ players: this.seats, bots: true, rng: this.rng });
    for (const firm of this.game.firms) { firm.human = false; firm.bot = true; }
    this.endsAt = null;
    return this.game;
  }

  /** Seat a player, taking over a bot firm. Returns null when the room is full. */
  join(clientId, name) {
    if (this.players.has(clientId)) return this.players.get(clientId);
    const seat = this.game.firms.find((f) => f.bot && !f.boughtOut && !f.gone
      && ownedBrands(this.game, f.id).length > 0);
    const firm = seat ?? addFirm(this.game, { rng: this.rng });
    firm.bot = false;
    firm.human = true;
    if (name) firm.name = String(name).slice(0, 28);

    const player = {
      clientId,
      firmId: firm.id,
      name: firm.name,
      view: { rows: [], detail: [] },
      budget: COMMAND_RATE,
      lastRefill: this.now(),
    };
    this.players.set(clientId, player);
    return player;
  }

  /** A player disconnected: their firm carries on as a bot rather than vanishing. */
  leave(clientId) {
    const player = this.players.get(clientId);
    if (!player) return false;
    const firm = this.game.firms[player.firmId];
    if (firm && !firm.gone) {
      firm.human = false;
      firm.bot = true;
      firm.name = `${firm.name} (auto)`;
    }
    this.players.delete(clientId);
    return true;
  }

  setView(clientId, view) {
    const player = this.players.get(clientId);
    if (!player || !view) return false;
    const ints = (list) => (Array.isArray(list) ? list : [])
      .filter((n) => Number.isInteger(n) && n >= 0 && n < this.game.markets.length)
      .slice(0, 64);
    player.view = { rows: ints(view.rows), detail: ints(view.detail).slice(0, 4) };
    return true;
  }

  /**
   * Run one client command, subject to a token-bucket rate limit. Everything
   * else — ownership, affordability, timing — is the engine's business.
   */
  command(clientId, command) {
    const player = this.players.get(clientId);
    if (!player) return { ok: false, reason: 'not seated' };

    const now = this.now();
    player.budget = Math.min(COMMAND_RATE, player.budget + (now - player.lastRefill) * COMMAND_RATE);
    player.lastRefill = now;
    if (player.budget < 1) return { ok: false, reason: 'too fast' };
    player.budget -= 1;

    return applyCommand(this.game, player.firmId, command);
  }

  /** Advance the world. Rounds restart on their own after an intermission. */
  step(dt) {
    if (this.game.over) {
      if (this.endsAt === null) this.endsAt = this.now() + INTERMISSION;
      if (this.now() >= this.endsAt) {
        const seated = [...this.players.values()];
        this.startWorld();
        for (const player of seated) {
          this.players.delete(player.clientId);
          const fresh = this.join(player.clientId, player.name);
          player.firmId = fresh.firmId;
        }
        return { restarted: true };
      }
      return { restarted: false };
    }
    tick(this.game, dt, this.rng);
    return { restarted: false };
  }

  viewFor(clientId) {
    const player = this.players.get(clientId);
    if (!player) return null;
    return snapshot(this.game, player.firmId, player.view);
  }

  info(clientId) {
    const player = this.players.get(clientId);
    return {
      ...worldInfo(this.game),
      round: this.round,
      you: player ? player.firmId : null,
    };
  }

  stats() {
    return {
      round: this.round,
      time: Math.round(this.game.time),
      humans: this.players.size,
      active: activeFirms(this.game).length,
      brands: this.game.brands.length,
      markets: this.game.markets.length,
    };
  }
}
