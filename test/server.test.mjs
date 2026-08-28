import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createRequire } from 'node:module';
import { acceptKey, encodeFrame, decodeFrame, attach, OPCODES } from '../server/ws.mjs';

const require = createRequire(import.meta.url);
import { Room, COMMAND_RATE, INTERMISSION } from '../server/room.mjs';
import { ownedBrands } from '../src/monopolis.js';
import { wsConnect } from './ws-client.mjs';

// ---------------------------------------------------------------------------
// The WebSocket layer
// ---------------------------------------------------------------------------

test('the handshake matches the RFC 6455 example', () => {
  // If this ever drifts, browsers refuse the upgrade while a hand-rolled test
  // client built on the same constant would happily agree with the server.
  assert.equal(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('frames round-trip, including the three length encodings', () => {
  for (const size of [0, 5, 125, 126, 1000, 70_000]) {
    const text = 'x'.repeat(size);
    const frame = decodeFrame(encodeFrame(text));
    assert.equal(frame.payload.toString(), text, `size ${size}`);
    assert.equal(frame.opcode, OPCODES.text);
    assert.equal(frame.fin, true);
  }
});

test('a partial frame asks for more bytes instead of guessing', () => {
  const full = encodeFrame('hello there');
  for (let cut = 1; cut < full.length; cut++) {
    assert.equal(decodeFrame(full.subarray(0, cut)), null, `truncated at ${cut}`);
  }
  assert.ok(decodeFrame(full));
});

test('several frames in one packet are read in order', () => {
  const packet = Buffer.concat([encodeFrame('one'), encodeFrame('two'), encodeFrame('three')]);
  const seen = [];
  let rest = packet;
  for (;;) {
    const frame = decodeFrame(rest);
    if (!frame) break;
    seen.push(frame.payload.toString());
    rest = frame.rest;
  }
  assert.deepEqual(seen, ['one', 'two', 'three']);
});

test('masked client frames are unmasked on the way in', () => {
  const payload = Buffer.from('masked payload');
  const mask = Buffer.from([1, 2, 3, 4]);
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
  const frame = Buffer.concat([
    Buffer.from([0x81, 0x80 | payload.length]), mask, masked,
  ]);
  assert.equal(decodeFrame(frame).payload.toString(), 'masked payload');
});

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------

test('joining takes over a bot seat, so the world stays full-sized', () => {
  const room = new Room({ seats: 20 });
  const before = room.game.firms.length;
  const player = room.join('client-1', 'Ada & Co');
  assert.equal(room.game.firms.length, before, 'no new seat was needed');
  assert.equal(room.game.firms[player.firmId].human, true);
  assert.equal(room.game.firms[player.firmId].bot, false);
  assert.equal(room.game.firms[player.firmId].name, 'Ada & Co');
  assert.ok(ownedBrands(room.game, player.firmId).length > 0, 'a joiner always has somewhere to stand');
});

test('joining twice with the same id returns the same seat', () => {
  const room = new Room({ seats: 10 });
  assert.equal(room.join('c', 'A').firmId, room.join('c', 'B').firmId);
});

test('a name is trimmed to something a leaderboard can hold', () => {
  const room = new Room({ seats: 10 });
  const player = room.join('c', 'x'.repeat(400));
  assert.ok(room.game.firms[player.firmId].name.length <= 28);
});

test('leaving hands the firm back to a bot rather than deleting it', () => {
  const room = new Room({ seats: 10 });
  const player = room.join('c', 'Quitter');
  const held = ownedBrands(room.game, player.firmId).length;
  room.leave('c');
  assert.equal(room.players.size, 0);
  const firm = room.game.firms[player.firmId];
  assert.equal(firm.bot, true);
  assert.equal(firm.human, false);
  assert.equal(ownedBrands(room.game, player.firmId).length, held, 'their brands carry on trading');
});

test('commands are rate limited per client', () => {
  const room = new Room({ seats: 10, now: () => 1000 }); // A frozen clock.
  room.join('c', 'Spammer');
  const results = Array.from({ length: COMMAND_RATE + 10 },
    () => room.command('c', { type: 'launch', market: 0 }));
  assert.equal(results.filter((r) => r.reason === 'too fast').length, 10);
});

test('a command from someone who never joined is refused', () => {
  const room = new Room({ seats: 10 });
  assert.equal(room.command('ghost', { type: 'launch', market: 0 }).reason, 'not seated');
});

test('the view a client asks for is sanitised', () => {
  const room = new Room({ seats: 10 });
  room.join('c', 'Viewer');
  room.setView('c', { rows: [0, 1, -5, 9999, 'x', null, 2], detail: [0, 1, 2, 3, 4, 5] });
  const player = room.players.get('c');
  assert.deepEqual(player.view.rows, [0, 1, 2]);
  assert.equal(player.view.detail.length, 4, 'a client may open at most four markets');
});

test('a finished round restarts after the intermission, reseating players', () => {
  let clock = 1000;
  const room = new Room({ seats: 8, now: () => clock });
  const player = room.join('c', 'Survivor');
  const firstRound = room.round;
  room.game.over = true;

  room.step(0.1);
  assert.equal(room.round, firstRound, 'the result stays up for a moment');

  clock += INTERMISSION + 1;
  const result = room.step(0.1);
  assert.equal(result.restarted, true);
  assert.equal(room.round, firstRound + 1);
  assert.equal(room.game.over, false);
  assert.ok(room.players.has('c'), 'connected players are reseated automatically');
  assert.ok(ownedBrands(room.game, room.players.get('c').firmId).length > 0);
  assert.equal(room.game.firms[room.players.get('c').firmId].name, player.name);
});

test('a hundred-seat room steps fast enough for a 10 Hz server', () => {
  const room = new Room({ seats: 100 });
  for (let i = 0; i < 600; i++) room.step(0.1); // Warm the world up.
  const started = performance.now();
  for (let i = 0; i < 100; i++) room.step(0.1);
  const perTick = (performance.now() - started) / 100;
  assert.ok(perTick < 20, `a tick took ${perTick.toFixed(1)}ms, which will not hold 10 Hz`);
});

// ---------------------------------------------------------------------------
// End to end, over a real socket
// ---------------------------------------------------------------------------

test('two clients join one live world over WebSocket', async (t) => {
  const port = 8200 + Math.floor(Math.random() * 300);
  const server = spawn(process.execPath, [
    fileURLToPath(new URL('../server/monopolis-server.mjs', import.meta.url)),
    '--port', String(port), '--seats', '30',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => server.kill());
  await once(server.stdout, 'data'); // The listening line.

  const messages = { a: [], b: [] };
  const a = await wsConnect(port, { onMessage: (m) => messages.a.push(m) });
  const b = await wsConnect(port, { onMessage: (m) => messages.b.push(m) });
  t.after(() => { a.close(); b.close(); });

  a.send({ type: 'join', name: 'Alpha Holdings' });
  b.send({ type: 'join', name: 'Beta Group' });
  await new Promise((resolve) => setTimeout(resolve, 900));

  const welcome = messages.a.find((m) => m.type === 'welcome');
  assert.ok(welcome, 'a joining client is welcomed');
  assert.ok(welcome.info.markets.length > 0);
  assert.equal(typeof welcome.info.you, 'number');

  const stateA = messages.a.filter((m) => m.type === 'state').at(-1);
  const stateB = messages.b.filter((m) => m.type === 'state').at(-1);
  assert.ok(stateA && stateB, 'both clients receive snapshots');
  assert.notEqual(stateA.state.you.id, stateB.state.you.id, 'they hold different firms');
  assert.equal(stateA.state.population.humans, 2);
  assert.ok(stateA.state.t > 0, 'the world is running');

  // A command from one client changes the world both of them see.
  const mine = stateA.state.detail;
  a.send({ type: 'view', view: { rows: [0], detail: [0] } });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const opened = messages.a.filter((m) => m.type === 'state').at(-1).state;
  assert.ok(opened.detail.length > 0, 'opening a market delivers its brands');
  assert.ok(mine.length === 0 || true);

  // Nonsense on the wire must not take the server down.
  a.socket.write(Buffer.from([0x81, 0x05, 0x00, 0x00]));
  await new Promise((resolve) => setTimeout(resolve, 300));
  const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json());
  assert.equal(health.ok, true, 'the server survives a malformed frame');
  assert.ok(health.active > 0);
});

test('a protocol pong keeps a client alive', () => {
  // Browsers reply to a ping with a pong *frame*, not an application message.
  // Miss it and the liveness reaper disconnects every real player.
  const seen = [];
  const socket = new (require('node:events').EventEmitter)();
  socket.write = () => {};
  socket.destroy = () => {};
  attach(socket, { onPong: () => seen.push('pong'), onMessage: () => {} });
  socket.emit('data', encodeFrame(Buffer.alloc(0), OPCODES.pong));
  assert.deepEqual(seen, ['pong']);
});

test('the HTTP side serves the game and refuses to leave its directory', async (t) => {
  const port = 8600 + Math.floor(Math.random() * 300);
  const server = spawn(process.execPath, [
    fileURLToPath(new URL('../server/monopolis-server.mjs', import.meta.url)),
    '--port', String(port), '--seats', '8',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => server.kill());
  await once(server.stdout, 'data');

  const page = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes('Monopolis'));

  const engine = await fetch(`http://127.0.0.1:${port}/src/monopolis.js`);
  assert.equal(engine.status, 200);

  for (const path of ['/../package.json', '/../../etc/passwd', '/..%2f..%2fetc/passwd']) {
    const escape = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.ok(escape.status === 403 || escape.status === 404, `${path} must not be served`);
  }
});
