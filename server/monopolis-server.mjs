// The Monopolis server: one authoritative world, up to a hundred players.
//
//   node server/monopolis-server.mjs [--port 8080] [--seats 100]
//
// It serves the game's own files over HTTP and the world over WebSocket, with
// no dependencies. The simulation runs here and only here: clients submit
// commands and receive snapshots, so a modified client can ask for things the
// rules forbid and get the same answer as everyone else — no.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { Room, MAX_PLAYERS } from './room.mjs';
import { attach, handshake } from './ws.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TICK_HZ = 10;      // Simulation steps per second.
const SNAPSHOT_HZ = 4;   // State broadcasts per second.
const PING_SECONDS = 20;

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const PORT = Number(flag('port', process.env.PORT ?? 8080));
const SEATS = Number(flag('seats', 100));

/** The only paths this server will read from disk. */
const SERVABLE = /^\/(monopolis\.html|src\/[a-z-]+\.js)$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const room = new Room({ seats: SEATS });
const clients = new Map(); // clientId -> { socket, alive }

// ---------------------------------------------------------------------------
// HTTP: the game's own files, plus a health endpoint
// ---------------------------------------------------------------------------

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': MIME['.json'] });
    response.end(JSON.stringify({ ok: true, ...room.stats(), seats: SEATS }));
    return;
  }

  // An allowlist, not a static directory: this process runs in a repository,
  // and a game server has no business serving anything but the game.
  const requested = normalize(url.pathname === '/' ? '/monopolis.html' : url.pathname);
  if (!SERVABLE.test(requested)) {
    response.writeHead(404).end('not found');
    return;
  }
  const path = join(ROOT, requested);
  if (!path.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  try {
    const body = await readFile(path);
    response.writeHead(200, {
      'content-type': MIME[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
});

// ---------------------------------------------------------------------------
// WebSocket: join, commands, snapshots
// ---------------------------------------------------------------------------

server.on('upgrade', (request, socket) => {
  if (room.players.size >= MAX_PLAYERS) {
    socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    return;
  }
  if (!handshake(request, socket)) return;

  const clientId = randomUUID();
  const connection = attach(socket, {
    onMessage: (text) => handleMessage(clientId, text),
    onPong: () => {
      const client = clients.get(clientId);
      if (client) client.alive = true;
    },
    onClose: () => {
      room.leave(clientId);
      clients.delete(clientId);
    },
  });
  clients.set(clientId, { connection, alive: true, joined: false });
});

function send(clientId, message) {
  clients.get(clientId)?.connection.send(JSON.stringify(message));
}

function handleMessage(clientId, text) {
  const client = clients.get(clientId);
  if (!client) return;

  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return; // Nonsense on the wire is simply ignored.
  }
  if (!message || typeof message !== 'object') return;

  switch (message.type) {
    case 'join': {
      if (client.joined) return;
      const player = room.join(clientId, message.name);
      if (!player) {
        send(clientId, { type: 'full' });
        client.connection.close();
        return;
      }
      client.joined = true;
      send(clientId, { type: 'welcome', info: room.info(clientId) });
      send(clientId, { type: 'state', state: room.viewFor(clientId) });
      break;
    }
    case 'view':
      room.setView(clientId, message.view);
      break;
    case 'cmd': {
      const result = room.command(clientId, message.command);
      if (!result.ok && message.id !== undefined) {
        send(clientId, { type: 'rejected', id: message.id, reason: result.reason ?? 'refused' });
      }
      break;
    }
    case 'pong':
      client.alive = true;
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

let lastTick = Date.now();
let sinceSnapshot = 0;
let sincePing = 0;
let lastRound = room.round;

setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 0.5);
  lastTick = now;

  room.step(dt);
  if (room.round !== lastRound) {
    lastRound = room.round;
    for (const clientId of clients.keys()) {
      if (clients.get(clientId).joined) send(clientId, { type: 'welcome', info: room.info(clientId) });
    }
  }

  sinceSnapshot += dt;
  if (sinceSnapshot >= 1 / SNAPSHOT_HZ) {
    sinceSnapshot = 0;
    for (const [clientId, client] of clients) {
      if (!client.joined) continue;
      const state = room.viewFor(clientId);
      if (state) send(clientId, { type: 'state', state });
    }
  }

  sincePing += dt;
  if (sincePing >= PING_SECONDS) {
    sincePing = 0;
    for (const [clientId, client] of clients) {
      if (!client.alive) { client.connection.close(); clients.delete(clientId); room.leave(clientId); continue; }
      client.alive = false;
      client.connection.ping();
    }
  }
}, 1000 / TICK_HZ);

server.listen(PORT, () => {
  console.log(`Monopolis: http://localhost:${PORT} — ${SEATS} seats, ${TICK_HZ} ticks/s, ${SNAPSHOT_HZ} snapshots/s`);
});
