// A small WebSocket server implementation (RFC 6455), because this repo has
// no dependencies and is not about to grow one for a handshake and four bytes
// of framing.
//
// Scope is deliberately narrow: text frames, ping/pong, close, and fragmented
// messages up to a size cap. That is the entire vocabulary Monopolis speaks.

import { createHash, randomBytes } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** The Sec-WebSocket-Accept value for a client's Sec-WebSocket-Key. */
export function acceptKey(key) {
  return createHash('sha1').update(key + GUID).digest('base64');
}

export const OPCODES = {
  continuation: 0x0, text: 0x1, binary: 0x2, close: 0x8, ping: 0x9, pong: 0xa,
};

/** Frame a payload for sending. Server frames are never masked. */
export function encodeFrame(payload, opcode = OPCODES.text) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  const length = body.length;
  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  header[0] = 0x80 | opcode; // FIN + opcode
  return Buffer.concat([header, body]);
}

/**
 * Pull one frame off the front of `buffer`.
 * Returns null when more bytes are needed, so callers can keep appending.
 */
export function decodeFrame(buffer) {
  if (buffer.length < 2) return null;
  const fin = (buffer[0] & 0x80) !== 0;
  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let length = buffer[1] & 0x7f;
  let offset = 2;

  if (length === 126) {
    if (buffer.length < offset + 2) return null;
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null;
    const big = buffer.readBigUInt64BE(offset);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('frame too large');
    length = Number(big);
    offset += 8;
  }

  let mask;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    mask = buffer.subarray(offset, offset + 4);
    offset += 4;
  }
  if (buffer.length < offset + length) return null;

  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];

  return { fin, opcode, payload, rest: buffer.subarray(offset + length) };
}

/**
 * Wrap an upgraded socket in the small event surface the server needs:
 * `onMessage(text)`, `onClose()`, `send(text)`, `close()`.
 *
 * A client that sends an oversized or malformed message is disconnected
 * rather than trusted — the socket is the edge of the system.
 */
export function attach(socket, { onMessage, onClose, onPong, maxMessageBytes = 1 << 16 } = {}) {
  let buffer = Buffer.alloc(0);
  let fragments = [];
  let fragmentOpcode = null;
  let closed = false;

  const finish = () => {
    if (closed) return;
    closed = true;
    socket.destroy();
    onClose?.();
  };

  socket.on('data', (chunk) => {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
    if (buffer.length > maxMessageBytes * 4) return finish();
    try {
      for (;;) {
        const frame = decodeFrame(buffer);
        if (!frame) break;
        buffer = frame.rest;

        if (frame.opcode === OPCODES.close) return finish();
        if (frame.opcode === OPCODES.ping) {
          socket.write(encodeFrame(frame.payload, OPCODES.pong));
          continue;
        }
        if (frame.opcode === OPCODES.pong) {
          // Browsers answer a ping at the protocol level, never in the
          // application's own message stream — so this is where liveness is
          // observed, and dropping it silently reaps every real client.
          onPong?.();
          continue;
        }

        if (frame.opcode === OPCODES.continuation) {
          fragments.push(frame.payload);
        } else {
          fragments = [frame.payload];
          fragmentOpcode = frame.opcode;
        }
        const size = fragments.reduce((sum, f) => sum + f.length, 0);
        if (size > maxMessageBytes) return finish();
        if (!frame.fin) continue;

        const message = Buffer.concat(fragments);
        fragments = [];
        if (fragmentOpcode === OPCODES.text) onMessage?.(message.toString('utf8'));
      }
    } catch {
      finish();
    }
  });

  socket.on('error', finish);
  socket.on('close', finish);

  return {
    send(text) {
      if (closed || socket.destroyed) return false;
      socket.write(encodeFrame(text));
      return true;
    },
    ping() {
      if (closed || socket.destroyed) return false;
      socket.write(encodeFrame(randomBytes(4), OPCODES.ping));
      return true;
    },
    close: finish,
    get closed() { return closed; },
  };
}

/** Complete the HTTP upgrade handshake, or reject it. */
export function handshake(request, socket) {
  const key = request.headers['sec-websocket-key'];
  if (request.headers.upgrade?.toLowerCase() !== 'websocket' || !key) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return false;
  }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n'
    + 'Upgrade: websocket\r\n'
    + 'Connection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
  );
  socket.setNoDelay(true);
  return true;
}
