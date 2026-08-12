#!/usr/bin/env node
/*
  五子棋多人信令服务器
  用法:  node server.js [port]
  默认端口: 9120

  零依赖，使用 Node.js 内置 http 模块实现 WebSocket。
  也支持 ws 库（优先检测）：npm install ws
*/

const PORT = parseInt(process.argv[2] || '9120', 10);
const http = require('http');

let WebSocket, WebSocketServer;
try {
  const ws = require('ws');
  WebSocket = ws;
  WebSocketServer = ws.WebSocketServer;
} catch (e) {
  // 回退到内置最小 WS 实现
  const crypto = require('crypto');
  const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

  function acceptKey(key) {
    return crypto.createHash('sha1').update(key + MAGIC).digest('base64');
  }

  class MiniWS extends require('events').EventEmitter {
    constructor(req, socket, head) {
      super();
      this._socket = socket;
      this.readyState = 1; // OPEN
      const key = req.headers['sec-websocket-key'];
      const hash = acceptKey(key);
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: ' + hash + '\r\n\r\n'
      );
      this._buf = Buffer.alloc(0);
      socket.on('data', (data) => {
        this._buf = Buffer.concat([this._buf, data]);
        this._parse();
      });
      socket.on('close', () => {
        this.readyState = 3;
        this.emit('close');
      });
      socket.on('error', () => {});
    }
    _parse() {
      while (this._buf.length >= 2) {
        const opcode = this._buf[0] & 0x0f;
        const masked = (this._buf[1] & 0x80) !== 0;
        let len = this._buf[1] & 0x7f;
        let offset = 2;
        if (len === 126) {
          if (this._buf.length < 4) return;
          len = this._buf.readUInt16BE(2);
          offset = 4;
        } else if (len === 127) {
          if (this._buf.length < 10) return;
          len = Number(this._buf.readBigUInt64BE(2));
          offset = 10;
        }
        const maskLen = masked ? 4 : 0;
        if (this._buf.length < offset + maskLen + len) return;
        let payload;
        const start = offset + maskLen;
        if (masked) {
          const mask = this._buf.slice(offset, start);
          payload = Buffer.alloc(len);
          for (let i = 0; i < len; i++) payload[i] = this._buf[start + i] ^ mask[i % 4];
        } else {
          payload = this._buf.slice(start, start + len);
        }
        this._buf = this._buf.slice(start + len);
        if (opcode === 0x8) { this._socket.end(); return; }
        if (opcode === 0x9) {
          const pong = Buffer.alloc(2); pong[0] = 0x8a; pong[1] = 0;
          this._socket.write(pong); continue;
        }
        if (opcode === 0x1) {
          this.emit('message', payload.toString('utf8'));
        }
      }
    }
    send(data) {
      if (this.readyState !== 1) return;
      const payload = Buffer.from(data, 'utf8');
      const len = payload.length;
      let frame;
      if (len < 126) {
        frame = Buffer.alloc(2 + len);
        frame[0] = 0x81; frame[1] = len;
        payload.copy(frame, 2);
      } else if (len < 65536) {
        frame = Buffer.alloc(4 + len);
        frame[0] = 0x81; frame[1] = 126;
        frame.writeUInt16BE(len, 2);
        payload.copy(frame, 4);
      } else {
        frame = Buffer.alloc(10 + len);
        frame[0] = 0x81; frame[1] = 127;
        frame.writeBigUInt64BE(BigInt(len), 2);
        payload.copy(frame, 10);
      }
      this._socket.write(frame);
    }
    close() { this._socket.end(); }
  }

  WebSocketServer = class {
    constructor(opts) {
      this._server = opts.server;
      this._server.on('upgrade', (req, socket, head) => {
        const ws = new MiniWS(req, socket, head);
        if (opts.path && req.url !== opts.path) { socket.end(); return; }
        this.emit('connection', ws);
      });
    }
    on(ev, cb) { if (ev === 'connection') this._onConnection = cb; }
    emit(ev, ws) { if (ev === 'connection' && this._onConnection) this._onConnection(ws); }
  };
}

// --- 房间管理 ---
const rooms = {};  // roomId → { players: [ws], sides: Map }
const playerRoom = new Map(); // ws → roomId

function genRoom(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < length; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function send(ws, data) {
  try { if (ws.readyState === 1) ws.send(JSON.stringify(data)); } catch (e) {}
}

function broadcast(room, data, exclude) {
  const r = rooms[room];
  if (!r) return;
  for (const ws of r.players) {
    if (ws !== exclude) send(ws, data);
  }
}

function cleanupRoom(room) {
  const r = rooms[room];
  if (!r) return;
  for (const ws of r.players) {
    playerRoom.delete(ws);
    try { ws.close(); } catch (e) {}
  }
  delete rooms[room];
}

function handleMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch (e) { return; }
  const type = msg.type;
  const room = playerRoom.get(ws);

  if (type === 'create') {
    if (room) { cleanupRoom(room); }
    const newRoom = genRoom(4);
    rooms[newRoom] = { players: [ws], sides: new Map([[ws, 1]]) };
    playerRoom.set(ws, newRoom);
    send(ws, { type: 'room_created', room: newRoom, side: 1 });
    console.log('房间创建: ' + newRoom + ' (黑方)');
  }

  else if (type === 'join') {
    if (room) { cleanupRoom(room); }
    const target = (msg.room || '').toUpperCase().trim();
    if (!target || !rooms[target]) {
      send(ws, { type: 'error', message: '房间不存在或已关闭' });
      return;
    }
    const r = rooms[target];
    if (r.players.length >= 2) {
      send(ws, { type: 'error', message: '房间已满' });
      return;
    }
    r.players.push(ws);
    r.sides.set(ws, 2);
    playerRoom.set(ws, target);

    // 通知双方开始
    send(ws, { type: 'game_start', room: target, side: 2 });
    send(r.players[0], { type: 'game_start', room: target, side: 1 });
    console.log('房间 ' + target + ' 已满，对局开始');
  }

  else if (type === 'move') {
    if (!room) return;
    if (typeof msg.r !== 'number' || typeof msg.c !== 'number') return;
    broadcast(room, { type: 'move', r: msg.r, c: msg.c, player: msg.player }, ws);
  }

  else if (type === 'restart') {
    if (!room) return;
    broadcast(room, { type: 'restart' }, ws);
  }

  else if (type === 'leave') {
    if (!room) return;
    broadcast(room, { type: 'opponent_left' }, ws);
    cleanupRoom(room);
    console.log('房间 ' + room + ' 解散');
  }

  else if (type === 'ping') {
    send(ws, { type: 'pong' });
  }
}

// --- 启动 ---
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h2>五子棋信令服务器运行中</h2><p>端口: ' + PORT + '</p>');
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  ws.on('message', (raw) => handleMessage(ws, raw));
  ws.on('close', () => {
    const room = playerRoom.get(ws);
    if (room) {
      broadcast(room, { type: 'opponent_left' }, ws);
      cleanupRoom(room);
    }
    playerRoom.delete(ws);
  });
  ws.on('error', () => {});
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('五子棋信令服务器已启动: ws://0.0.0.0:' + PORT);
  console.log('局域网访问: ws://' + getLocalIP() + ':' + PORT);
});

function getLocalIP() {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}
