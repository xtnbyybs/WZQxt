/**
 * 五子棋 · 星穹连珠 v2 — Cloudflare Worker 免费版信令服务器
 * 支持双方准备制 + 观战席
 */
'use strict';

const rooms = new Map();

function cleanupStale() {
  const now = Date.now();
  for (const [rid, room] of rooms.entries()) {
    if (room.seats.size === 0 && room.specs.size === 0 && (now - room.createTime) > 30 * 60 * 1000) {
      rooms.delete(rid);
    }
  }
}

function send(ws, data) {
  try { ws.send(JSON.stringify(data)); } catch (e) {}
}

function broadcastAll(room, data, exclude) {
  room.seats.forEach((_, w) => { if (w !== exclude) send(w, data); });
  room.specs.forEach(w => { if (w !== exclude) send(w, data); });
}

function getSeatsInfo(room) {
  const info = [];
  room.seats.forEach((v) => info.push({ side: v.side, ready: v.ready }));
  return info;
}

function handleLeave(room, ws, role, side) {
  if (role === 'seat') {
    room.seats.delete(ws);
    room.gameStarted = false;
    broadcastAll(room, { type: 'opponent_left', side: side, seats: getSeatsInfo(room) });
  } else if (role === 'spec') {
    room.specs.delete(ws);
    broadcastAll(room, { type: 'spectator_left', specCount: room.specs.size });
  }
  if (room.seats.size === 0 && room.specs.size === 0) {
    rooms.delete(room.roomId);
  }
  try { ws.close(1000, 'left'); } catch (e) {}
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    if (!url.pathname.startsWith('/room/')) {
      return new Response('五子棋信令服务', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const roomId = url.pathname.split('/room/')[1]?.toUpperCase() || 'UNKN';
    cleanupStale();
    let room = rooms.get(roomId);
    if (!room) {
      room = {
        roomId, seats: new Map(), specs: new Set(),
        moves: [], gameStarted: false, createTime: Date.now(), currentSide: 1
      };
      rooms.set(roomId, room);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    let role = null;
    let mySide = 0;

    server.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }

      switch (msg.type) {

        case 'create':
          if (role) break;
          role = 'seat';
          mySide = 1;
          room.seats.set(server, { side: 1, ready: false });
          send(server, { type: 'room_created', room: roomId, side: 1, ready: false, seats: getSeatsInfo(room), started: room.gameStarted });
          break;

        case 'join':
          if (role) break;
          if (room.seats.size < 2) {
            role = 'seat';
            mySide = 2;
            room.seats.set(server, { side: 2, ready: false });
            send(server, { type: 'joined', side: 2, ready: false, seats: getSeatsInfo(room), started: room.gameStarted });
            broadcastAll(room, { type: 'player_joined', side: 2, seats: getSeatsInfo(room) }, server);
            if (room.seats.size === 2) room.seats.forEach(v => v.ready = false);
          } else {
            role = 'spec';
            room.specs.add(server);
            send(server, {
              type: 'spectator',
              moves: room.moves,
              currentSide: room.currentSide,
              seats: getSeatsInfo(room),
              started: room.gameStarted,
              specCount: room.specs.size
            });
            broadcastAll(room, { type: 'spectator_joined', specCount: room.specs.size }, server);
          }
          break;

        case 'ready':
          if (role !== 'seat') break;
          {
            const info = room.seats.get(server);
            if (!info) break;
            info.ready = msg.ready !== false;
            const seatsInfo = getSeatsInfo(room);
            broadcastAll(room, { type: 'ready_update', side: info.side, ready: info.ready, seats: seatsInfo });
            if (!room.gameStarted && room.seats.size === 2) {
              let allReady = true;
              room.seats.forEach(v => { if (!v.ready) allReady = false; });
              if (allReady) {
                room.gameStarted = true;
                room.moves = [];
                room.currentSide = 1;
                room.seats.forEach((v, w) => send(w, { type: 'game_start', side: v.side, room: roomId, seats: seatsInfo }));
                room.specs.forEach(w => send(w, { type: 'game_start', side: 0, room: roomId, seats: seatsInfo, spec: true }));
              }
            }
          }
          break;

        case 'move':
          if (!room.gameStarted) return;
          if (role !== 'seat') return;
          {
            const info = room.seats.get(server);
            if (!info) return;
            if (room.currentSide !== info.side) return;
            if (typeof msg.r !== 'number' || typeof msg.c !== 'number') return;
            room.moves.push({ r: msg.r, c: msg.c, player: info.side });
            room.currentSide = info.side === 1 ? 2 : 1;
            broadcastAll(room, { type: 'move', r: msg.r, c: msg.c, player: info.side, currentSide: room.currentSide });
          }
          break;

        case 'restart':
          if (role !== 'seat') return;
          room.gameStarted = false;
          room.moves = [];
          room.currentSide = 1;
          room.seats.forEach(v => v.ready = false);
          {
            const seatsInfo = getSeatsInfo(room);
            broadcastAll(room, { type: 'restart', seats: seatsInfo });
          }
          break;

        case 'leave':
          handleLeave(room, server, role, mySide);
          break;

        case 'ping':
          send(server, { type: 'pong' });
          break;
      }
    });

    server.addEventListener('close', () => handleLeave(room, server, role, mySide));
    server.addEventListener('error', () => handleLeave(room, server, role, mySide));

    return new Response(null, { status: 101, webSocket: client });
  }
};

