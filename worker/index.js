/**
 * 五子棋 · 星穹连珠 — Cloudflare Worker 免费版信令服务器
 * 使用全局 Map 内存存储 + 原生 WebSocketPair，不依赖 Durable Objects
 */
'use strict';

// 房间存储：Map<roomId, { players: Map<WebSocket, {side}>, createTime }>
const rooms = new Map();

function cleanupStale() {
  const now = Date.now();
  for (const [rid, room] of rooms.entries()) {
    if (room.players.size === 0 && (now - room.createTime) > 30 * 60 * 1000) {
      rooms.delete(rid);
    }
  }
}

function send(ws, data) {
  try { ws.send(JSON.stringify(data)); } catch (e) {}
}

function broadcast(room, data, exclude) {
  for (const [w] of room.players.entries()) {
    if (w !== exclude) send(w, data);
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok');
    }

    if (url.pathname.startsWith('/room/')) {
      const roomId = url.pathname.split('/room/')[1]?.toUpperCase() || 'UNKN';
      cleanupStale();

      let room = rooms.get(roomId);
      if (!room) {
        room = { players: new Map(), createTime: Date.now() };
        rooms.set(roomId, room);
      }

      if (room.players.size >= 2) {
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        server.accept();
        send(server, { type: 'error', message: '房间已满' });
        setTimeout(() => { try { server.close(1000, 'full'); } catch (e) {} }, 100);
        return new Response(null, { status: 101, webSocket: client });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();

      let side = 0;

      server.addEventListener('message', (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }

        switch (msg.type) {

          case 'create':
            if (side) break;
            side = 1;
            room.players.set(server, { side: 1 });
            send(server, { type: 'room_created', room: roomId, side: 1 });
            break;

          case 'join':
            if (side) break;
            if (room.players.size >= 2) {
              send(server, { type: 'error', message: '房间已满' });
              server.close(1000, 'full');
              return;
            }
            side = 2;
            room.players.set(server, { side: 2 });
            send(server, { type: 'game_start', room: roomId, side: 2 });
            broadcast(room, { type: 'game_start', room: roomId, side: 2 }, server);
            break;

          case 'move':
            if (!room.players.has(server)) return;
            if (typeof msg.r !== 'number' || typeof msg.c !== 'number') return;
            broadcast(room, { type: 'move', r: msg.r, c: msg.c, player: msg.player }, server);
            break;

          case 'restart':
            if (!room.players.has(server)) return;
            broadcast(room, { type: 'restart' }, server);
            break;

          case 'leave':
            broadcast(room, { type: 'opponent_left' }, server);
            room.players.delete(server);
            try { server.close(1000, 'left'); } catch (e) {}
            if (room.players.size === 0) rooms.delete(roomId);
            break;

          case 'ping':
            send(server, { type: 'pong' });
            break;
        }
      });

      server.addEventListener('close', () => {
        if (room.players.has(server)) {
          room.players.delete(server);
          broadcast(room, { type: 'opponent_left' }, server);
          if (room.players.size === 0) rooms.delete(roomId);
        }
      });

      server.addEventListener('error', () => {
        room.players.delete(server);
        if (room.players.size === 0) rooms.delete(roomId);
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('五子棋信令服务', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
};
