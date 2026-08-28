// A minimal WebSocket client, used by the tests and the load harness. Client
// frames must be masked (RFC 6455 §5.3), which the server side never does, so
// this is the one place that needs the mask path.

import { connect } from 'node:net';
import { randomBytes, createHash } from 'node:crypto';
import { decodeFrame, OPCODES } from '../server/ws.mjs';

function maskFrame(payload, opcode = OPCODES.text) {
  const body = Buffer.from(payload, 'utf8');
  const mask = randomBytes(4);
  const masked = Buffer.from(body);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];

  let header;
  if (body.length < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | body.length;
  } else {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(body.length, 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, mask, masked]);
}

/** Open a connection and resolve once the handshake completes. */
export function wsConnect(port, { host = '127.0.0.1', onMessage } = {}) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, host, () => {
      const key = randomBytes(16).toString('base64');
      socket.write(
        `GET / HTTP/1.1\r\nHost: ${host}:${port}\r\nUpgrade: websocket\r\n`
        + `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );

      let buffer = Buffer.alloc(0);
      let upgraded = false;
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (!upgraded) {
          const end = buffer.indexOf('\r\n\r\n');
          if (end === -1) return;
          const head = buffer.subarray(0, end).toString();
          buffer = buffer.subarray(end + 4);
          const accept = /sec-websocket-accept: (.+)/i.exec(head)?.[1]?.trim();
          const expected = createHash('sha1')
            .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
          if (!head.includes('101') || accept !== expected) {
            socket.destroy();
            reject(new Error('handshake failed: ' + head.split('\r\n')[0]));
            return;
          }
          upgraded = true;
          resolve(api);
        }
        for (;;) {
          let frame;
          try { frame = decodeFrame(buffer); } catch { socket.destroy(); return; }
          if (!frame) break;
          buffer = frame.rest;
          if (frame.opcode === OPCODES.ping) { socket.write(maskFrame(frame.payload.toString(), OPCODES.pong)); continue; }
          if (frame.opcode === OPCODES.close) { socket.destroy(); return; }
          if (frame.opcode === OPCODES.text) onMessage?.(JSON.parse(frame.payload.toString('utf8')));
        }
      });
    });
    socket.on('error', reject);

    const api = {
      socket,
      send: (message) => socket.write(maskFrame(JSON.stringify(message))),
      close: () => socket.destroy(),
    };
  });
}
